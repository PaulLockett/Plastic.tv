// Browser Clip - Main Service Worker
import { initCapture, attachToAllTabs, detachFromAllTabs, getCaptureStatus, isPaused } from './capture.js';
import { initCleanup, performCleanup, getBufferStatus } from './cleanup.js';
import { initStorageMonitor, getStorageStatus, updateBadge, updateIcon } from './storage-monitor.js';
import { getHttpEntries, getWsFrames, getSseEvents, clearAllData, getTotalCounts, getBufferTimeRange } from '../lib/db.js';
import { buildHar } from '../lib/har-builder.js';
import { sanitizeHar } from '../lib/sanitizer.js';
import { uploadClip } from '../lib/supabase.js';

// Initialize extension
async function initialize() {
  console.log('[Browser Clip] Initializing...');

  // Initialize all modules
  initCapture();
  initCleanup();
  initStorageMonitor();

  // Attach to all tabs if not paused
  const paused = await isPaused();
  if (!paused) {
    await attachToAllTabs();
  }

  await updateBadge();
  await updateIcon();

  console.log('[Browser Clip] Initialization complete');
}

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Browser Clip] Installed/Updated:', details.reason);

  // Set default settings on first install
  if (details.reason === 'install') {
    await chrome.storage.sync.set({
      storageCap: '500MB',
      defaultScope: 'currentTab',
      sanitizeUrlParams: true,
      customHeaderPatterns: []
    });
    await chrome.storage.local.set({
      isPaused: false
    });
  }

  await initialize();
});

// Handle extension startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Browser Clip] Starting up...');
  await initialize();
});

// Message handler for popup and options pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

// Handle messages from popup/options
async function handleMessage(message, sender) {
  const { action, payload } = message;

  switch (action) {
    case 'getStatus':
      return getExtensionStatus();

    case 'createClip':
      return createClip(payload);

    case 'pauseCapture':
      return pauseCapture();

    case 'resumeCapture':
      return resumeCapture();

    case 'clearBuffer':
      return clearBuffer();

    case 'testSupabaseConnection':
      return testSupabaseConnection(payload);

    case 'getCaptureStatus':
      return getCaptureStatus();

    case 'getBufferStatus':
      return getBufferStatus();

    case 'getStorageStatus':
      return getStorageStatus();

    case 'runCleanup':
      return performCleanup();

    default:
      return { error: 'Unknown action' };
  }
}

// Get overall extension status
async function getExtensionStatus() {
  const [paused, storageStatus, captureStatus, counts] = await Promise.all([
    isPaused(),
    getStorageStatus(),
    getCaptureStatus(),
    getTotalCounts()
  ]);

  const supabaseConfig = await chrome.storage.sync.get(['supabaseUrl', 'supabaseKey']);
  const isConfigured = !!(supabaseConfig.supabaseUrl && supabaseConfig.supabaseKey);

  return {
    isPaused: paused,
    isConfigured,
    storage: storageStatus,
    capture: captureStatus,
    counts
  };
}

// Create a clip from the buffer
async function createClip(payload) {
  const { startTime, endTime, tabIds, clipName } = payload;

  try {
    // Get entries from the time range
    const [httpEntries, wsFrames, sseEvents] = await Promise.all([
      getHttpEntries(startTime, endTime, tabIds),
      getWsFrames(startTime, endTime, tabIds),
      getSseEvents(startTime, endTime, tabIds)
    ]);

    // Build HAR
    const har = buildHar(httpEntries, wsFrames, sseEvents);

    // Sanitize sensitive data
    const settings = await chrome.storage.sync.get(['sanitizeUrlParams', 'customHeaderPatterns']);
    const sanitizedHar = sanitizeHar(har, {
      sanitizeUrlParams: settings.sanitizeUrlParams !== false,
      customPatterns: settings.customHeaderPatterns || []
    });

    // Calculate size
    const harJson = JSON.stringify(sanitizedHar);
    const sizeBytes = new Blob([harJson]).size;

    // Upload to Supabase
    const result = await uploadClip({
      har: sanitizedHar,
      harJson,
      sizeBytes,
      clipName: clipName || null,
      startTime,
      endTime,
      tabFilter: tabIds ? { type: 'tabs', tabs: tabIds } : { type: 'all' },
      entryCount: httpEntries.length + wsFrames.length + sseEvents.length
    });

    return {
      success: true,
      clipId: result.id,
      entryCount: httpEntries.length + wsFrames.length + sseEvents.length,
      sizeBytes,
      storagePath: result.storagePath
    };
  } catch (error) {
    console.error('[Browser Clip] Failed to create clip:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Pause capture
async function pauseCapture() {
  await chrome.storage.local.set({ isPaused: true });
  await detachFromAllTabs();
  await updateBadge();
  await updateIcon();

  return { success: true };
}

// Resume capture
async function resumeCapture() {
  await chrome.storage.local.set({ isPaused: false });
  await attachToAllTabs();
  await updateBadge();
  await updateIcon();

  return { success: true };
}

// Clear buffer
async function clearBuffer() {
  await clearAllData();
  return { success: true };
}

// Test Supabase connection
async function testSupabaseConnection(config) {
  const { url, key } = config;

  try {
    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    if (response.ok) {
      return { success: true, message: 'Connection successful!' };
    } else {
      return { success: false, message: `Connection failed: ${response.status} ${response.statusText}` };
    }
  } catch (error) {
    return { success: false, message: `Connection error: ${error.message}` };
  }
}

// Initialize on load (for service worker restart)
initialize();
