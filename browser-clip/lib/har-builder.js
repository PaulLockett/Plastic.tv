// HAR Builder - Creates extended HAR 1.2 format with WebSocket and SSE support

const VERSION = '1.0.0';
const CREATOR_NAME = 'Browser Clip';

// Build HAR from collected entries
function buildHar(httpEntries, wsFrames, sseEvents) {
  // Sort HTTP entries by timestamp
  const sortedHttpEntries = [...httpEntries].sort((a, b) => a.timestamp - b.timestamp);

  // Convert HTTP entries to HAR format
  const entries = sortedHttpEntries.map(entry => ({
    startedDateTime: entry.startedDateTime,
    time: entry.time || 0,
    request: entry.request,
    response: entry.response,
    cache: {},
    timings: {
      blocked: -1,
      dns: -1,
      connect: -1,
      ssl: -1,
      send: 0,
      wait: entry.time || 0,
      receive: 0
    },
    _tabId: entry.tabId,
    _hostname: entry.hostname,
    _resourceType: entry.resourceType
  }));

  // Build WebSocket messages array
  const webSocketMessages = wsFrames.map(frame => ({
    timestamp: new Date(frame.timestamp).toISOString(),
    tabId: frame.tabId,
    url: frame.url,
    connectionId: frame.connectionId,
    type: frame.direction,
    opcode: frame.opcode,
    data: frame.data,
    size: frame.size
  })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Build SSE events array
  const serverSentEvents = sseEvents.map(event => ({
    timestamp: new Date(event.timestamp).toISOString(),
    tabId: event.tabId,
    url: event.url,
    event: event.eventType,
    data: event.data,
    id: event.eventId || ''
  })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Build the complete HAR object
  const har = {
    log: {
      version: '1.2',
      creator: {
        name: CREATOR_NAME,
        version: VERSION
      },
      browser: {
        name: 'Chrome',
        version: navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || 'unknown'
      },
      pages: buildPages(entries),
      entries,
      // Extended fields for WebSocket and SSE
      _webSocketMessages: webSocketMessages,
      _serverSentEvents: serverSentEvents
    }
  };

  return har;
}

// Build pages array from entries
function buildPages(entries) {
  const pageMap = new Map();

  for (const entry of entries) {
    if (!entry._hostname) continue;

    if (!pageMap.has(entry._hostname)) {
      pageMap.set(entry._hostname, {
        startedDateTime: entry.startedDateTime,
        id: entry._hostname,
        title: entry._hostname,
        pageTimings: {
          onContentLoad: -1,
          onLoad: -1
        }
      });
    }
  }

  return Array.from(pageMap.values());
}

// Calculate HAR statistics
function getHarStats(har) {
  const stats = {
    totalEntries: har.log.entries.length,
    totalSize: 0,
    totalTransferSize: 0,
    wsMessages: har.log._webSocketMessages?.length || 0,
    sseEvents: har.log._serverSentEvents?.length || 0,
    byResourceType: {},
    byHostname: {},
    byStatus: {}
  };

  for (const entry of har.log.entries) {
    // Content size
    const contentSize = entry.response?.content?.size || 0;
    stats.totalSize += contentSize;
    stats.totalTransferSize += entry.response?.bodySize || contentSize;

    // By resource type
    const resourceType = entry._resourceType || 'Other';
    stats.byResourceType[resourceType] = (stats.byResourceType[resourceType] || 0) + 1;

    // By hostname
    const hostname = entry._hostname || 'unknown';
    stats.byHostname[hostname] = (stats.byHostname[hostname] || 0) + 1;

    // By status code
    const status = entry.response?.status || 0;
    const statusGroup = `${Math.floor(status / 100)}xx`;
    stats.byStatus[statusGroup] = (stats.byStatus[statusGroup] || 0) + 1;
  }

  return stats;
}

// Merge multiple HAR files
function mergeHars(hars) {
  if (hars.length === 0) return null;
  if (hars.length === 1) return hars[0];

  const merged = {
    log: {
      version: '1.2',
      creator: {
        name: CREATOR_NAME,
        version: VERSION
      },
      pages: [],
      entries: [],
      _webSocketMessages: [],
      _serverSentEvents: []
    }
  };

  for (const har of hars) {
    merged.log.entries.push(...har.log.entries);
    merged.log.pages.push(...(har.log.pages || []));
    merged.log._webSocketMessages.push(...(har.log._webSocketMessages || []));
    merged.log._serverSentEvents.push(...(har.log._serverSentEvents || []));
  }

  // Sort by timestamp
  merged.log.entries.sort((a, b) =>
    new Date(a.startedDateTime) - new Date(b.startedDateTime)
  );
  merged.log._webSocketMessages.sort((a, b) =>
    new Date(a.timestamp) - new Date(b.timestamp)
  );
  merged.log._serverSentEvents.sort((a, b) =>
    new Date(a.timestamp) - new Date(b.timestamp)
  );

  // Deduplicate pages
  const seenPages = new Set();
  merged.log.pages = merged.log.pages.filter(page => {
    if (seenPages.has(page.id)) return false;
    seenPages.add(page.id);
    return true;
  });

  return merged;
}

export {
  buildHar,
  getHarStats,
  mergeHars
};
