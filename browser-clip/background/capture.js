// Network capture module using chrome.debugger
import { addHttpEntry, addWsFrame, addSseEvent } from '../lib/db.js';
import { getHostname, isCapturableTab } from '../utils/tab-utils.js';
import { MAX_RESPONSE_BODY_SIZE } from '../utils/format.js';

// Track attached tabs and pending requests
const attachedTabs = new Set();
const pendingRequests = new Map(); // requestId -> request data
const wsConnections = new Map(); // webSocketId -> connection data

// Check if capture is paused
async function isPaused() {
  const result = await chrome.storage.local.get('isPaused');
  return result.isPaused === true;
}

// Attach debugger to a tab
async function attachToTab(tabId) {
  if (attachedTabs.has(tabId)) {
    return true;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isCapturableTab(tab)) {
      return false;
    }

    await chrome.debugger.attach({ tabId }, '1.3');
    attachedTabs.add(tabId);

    // Enable network domain
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable', {
      maxTotalBufferSize: MAX_RESPONSE_BODY_SIZE,
      maxResourceBufferSize: MAX_RESPONSE_BODY_SIZE
    });

    console.log(`[Browser Clip] Attached to tab ${tabId}`);
    return true;
  } catch (error) {
    console.error(`[Browser Clip] Failed to attach to tab ${tabId}:`, error);
    attachedTabs.delete(tabId);
    return false;
  }
}

// Detach debugger from a tab
async function detachFromTab(tabId) {
  if (!attachedTabs.has(tabId)) {
    return;
  }

  try {
    await chrome.debugger.detach({ tabId });
  } catch (error) {
    // Tab might already be closed
  }

  attachedTabs.delete(tabId);
  console.log(`[Browser Clip] Detached from tab ${tabId}`);
}

// Attach to all capturable tabs
async function attachToAllTabs() {
  const paused = await isPaused();
  if (paused) {
    console.log('[Browser Clip] Capture is paused, not attaching to tabs');
    return;
  }

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (isCapturableTab(tab)) {
      await attachToTab(tab.id);
    }
  }
}

// Detach from all tabs
async function detachFromAllTabs() {
  for (const tabId of attachedTabs) {
    await detachFromTab(tabId);
  }
}

// Handle debugger events
function handleDebuggerEvent(source, method, params) {
  const { tabId } = source;

  switch (method) {
    case 'Network.requestWillBeSent':
      handleRequestWillBeSent(tabId, params);
      break;
    case 'Network.responseReceived':
      handleResponseReceived(tabId, params);
      break;
    case 'Network.loadingFinished':
      handleLoadingFinished(tabId, params);
      break;
    case 'Network.loadingFailed':
      handleLoadingFailed(tabId, params);
      break;
    case 'Network.webSocketCreated':
      handleWebSocketCreated(tabId, params);
      break;
    case 'Network.webSocketFrameSent':
      handleWebSocketFrameSent(tabId, params);
      break;
    case 'Network.webSocketFrameReceived':
      handleWebSocketFrameReceived(tabId, params);
      break;
    case 'Network.webSocketClosed':
      handleWebSocketClosed(tabId, params);
      break;
    case 'Network.eventSourceMessageReceived':
      handleEventSourceMessage(tabId, params);
      break;
  }
}

// Handle request will be sent
function handleRequestWillBeSent(tabId, params) {
  const { requestId, request, timestamp, type, documentURL, redirectResponse } = params;

  // If this is a redirect, save the redirect response first
  if (redirectResponse) {
    const pending = pendingRequests.get(requestId);
    if (pending) {
      saveHttpEntry(tabId, pending, redirectResponse, null);
    }
  }

  pendingRequests.set(requestId, {
    tabId,
    requestId,
    timestamp: timestamp * 1000, // Convert to milliseconds
    request,
    type,
    documentURL,
    startTime: Date.now()
  });
}

// Handle response received
function handleResponseReceived(tabId, params) {
  const { requestId, response, type } = params;
  const pending = pendingRequests.get(requestId);

  if (pending) {
    pending.response = response;
    pending.responseType = type;
  }
}

// Handle loading finished - get response body
async function handleLoadingFinished(tabId, params) {
  const { requestId, encodedDataLength } = params;
  const pending = pendingRequests.get(requestId);

  if (!pending || !pending.response) {
    pendingRequests.delete(requestId);
    return;
  }

  let responseBody = null;
  let bodyEncoded = false;

  try {
    // Only get body for reasonable sizes
    if (encodedDataLength <= MAX_RESPONSE_BODY_SIZE) {
      const result = await chrome.debugger.sendCommand(
        { tabId },
        'Network.getResponseBody',
        { requestId }
      );
      responseBody = result.body;
      bodyEncoded = result.base64Encoded;
    }
  } catch (error) {
    // Body might not be available for some responses
  }

  await saveHttpEntry(tabId, pending, pending.response, {
    body: responseBody,
    base64Encoded: bodyEncoded,
    size: encodedDataLength
  });

  pendingRequests.delete(requestId);
}

// Handle loading failed
function handleLoadingFailed(tabId, params) {
  const { requestId, errorText } = params;
  const pending = pendingRequests.get(requestId);

  if (pending) {
    pending.error = errorText;
    // Still save the entry even if it failed
    saveHttpEntry(tabId, pending, pending.response || { error: errorText }, null);
  }

  pendingRequests.delete(requestId);
}

// Save HTTP entry to IndexedDB
async function saveHttpEntry(tabId, pending, response, body) {
  try {
    const url = pending.request.url;
    const hostname = getHostname(url);

    const entry = {
      timestamp: pending.timestamp || Date.now(),
      tabId,
      hostname,
      startedDateTime: new Date(pending.timestamp || Date.now()).toISOString(),
      request: {
        method: pending.request.method,
        url: url,
        httpVersion: 'HTTP/1.1',
        headers: objectToHeaders(pending.request.headers),
        queryString: parseQueryString(url),
        cookies: [],
        headersSize: -1,
        bodySize: pending.request.postData ? pending.request.postData.length : 0,
        postData: pending.request.postData ? {
          mimeType: pending.request.headers['Content-Type'] || 'application/octet-stream',
          text: pending.request.postData
        } : undefined
      },
      response: {
        status: response?.status || 0,
        statusText: response?.statusText || '',
        httpVersion: response?.protocol || 'HTTP/1.1',
        headers: objectToHeaders(response?.headers || {}),
        cookies: [],
        content: {
          size: body?.size || response?.encodedDataLength || 0,
          mimeType: response?.mimeType || 'application/octet-stream',
          text: body?.body || undefined,
          encoding: body?.base64Encoded ? 'base64' : undefined
        },
        redirectURL: response?.url !== pending.request.url ? response?.url : '',
        headersSize: -1,
        bodySize: body?.size || -1
      },
      time: Date.now() - pending.startTime,
      resourceType: pending.type || 'Other'
    };

    await addHttpEntry(entry);
  } catch (error) {
    console.error('[Browser Clip] Failed to save HTTP entry:', error);
  }
}

// Handle WebSocket created
function handleWebSocketCreated(tabId, params) {
  const { requestId, url } = params;
  const hostname = getHostname(url);

  wsConnections.set(requestId, {
    tabId,
    url,
    hostname,
    connectionId: requestId,
    createdAt: Date.now()
  });
}

// Handle WebSocket frame sent
async function handleWebSocketFrameSent(tabId, params) {
  const { requestId, timestamp, response } = params;
  const connection = wsConnections.get(requestId);

  if (!connection) return;

  try {
    await addWsFrame({
      timestamp: timestamp * 1000,
      tabId,
      hostname: connection.hostname,
      connectionId: requestId,
      url: connection.url,
      direction: 'send',
      opcode: response.opcode,
      data: response.payloadData,
      size: response.payloadData ? response.payloadData.length : 0
    });
  } catch (error) {
    console.error('[Browser Clip] Failed to save WS frame:', error);
  }
}

// Handle WebSocket frame received
async function handleWebSocketFrameReceived(tabId, params) {
  const { requestId, timestamp, response } = params;
  const connection = wsConnections.get(requestId);

  if (!connection) return;

  try {
    await addWsFrame({
      timestamp: timestamp * 1000,
      tabId,
      hostname: connection.hostname,
      connectionId: requestId,
      url: connection.url,
      direction: 'receive',
      opcode: response.opcode,
      data: response.payloadData,
      size: response.payloadData ? response.payloadData.length : 0
    });
  } catch (error) {
    console.error('[Browser Clip] Failed to save WS frame:', error);
  }
}

// Handle WebSocket closed
function handleWebSocketClosed(tabId, params) {
  const { requestId } = params;
  wsConnections.delete(requestId);
}

// Handle Server-Sent Events
async function handleEventSourceMessage(tabId, params) {
  const { requestId, timestamp, eventName, eventId, data } = params;
  const pending = pendingRequests.get(requestId);

  const url = pending?.request?.url || '';
  const hostname = getHostname(url);

  try {
    await addSseEvent({
      timestamp: timestamp * 1000,
      tabId,
      hostname,
      url,
      eventType: eventName || 'message',
      data,
      eventId: eventId || ''
    });
  } catch (error) {
    console.error('[Browser Clip] Failed to save SSE event:', error);
  }
}

// Convert headers object to HAR format
function objectToHeaders(headersObj) {
  if (!headersObj) return [];
  return Object.entries(headersObj).map(([name, value]) => ({ name, value }));
}

// Parse query string from URL
function parseQueryString(url) {
  try {
    const urlObj = new URL(url);
    const params = [];
    urlObj.searchParams.forEach((value, name) => {
      params.push({ name, value });
    });
    return params;
  } catch {
    return [];
  }
}

// Handle debugger detach
function handleDebuggerDetach(source, reason) {
  const { tabId } = source;
  attachedTabs.delete(tabId);
  console.log(`[Browser Clip] Debugger detached from tab ${tabId}: ${reason}`);
}

// Initialize capture listeners
function initCapture() {
  chrome.debugger.onEvent.addListener(handleDebuggerEvent);
  chrome.debugger.onDetach.addListener(handleDebuggerDetach);

  // Handle new tabs
  chrome.tabs.onCreated.addListener(async (tab) => {
    const paused = await isPaused();
    if (!paused && tab.id) {
      // Wait a bit for the tab to be ready
      setTimeout(() => attachToTab(tab.id), 500);
    }
  });

  // Handle tab updates (URL changes)
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    const paused = await isPaused();
    if (!paused && changeInfo.status === 'loading' && isCapturableTab(tab)) {
      if (!attachedTabs.has(tabId)) {
        await attachToTab(tabId);
      }
    }
  });

  // Handle tab removal
  chrome.tabs.onRemoved.addListener((tabId) => {
    attachedTabs.delete(tabId);
    // Clean up pending requests for this tab
    for (const [requestId, pending] of pendingRequests) {
      if (pending.tabId === tabId) {
        pendingRequests.delete(requestId);
      }
    }
  });
}

// Get capture status
function getCaptureStatus() {
  return {
    attachedTabCount: attachedTabs.size,
    attachedTabs: Array.from(attachedTabs),
    pendingRequests: pendingRequests.size,
    activeWebSockets: wsConnections.size
  };
}

export {
  attachToTab,
  detachFromTab,
  attachToAllTabs,
  detachFromAllTabs,
  initCapture,
  getCaptureStatus,
  isPaused
};
