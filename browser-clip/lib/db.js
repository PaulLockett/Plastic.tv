// IndexedDB wrapper for Browser Clip
const DB_NAME = 'BrowserClipDB';
const DB_VERSION = 1;

const STORES = {
  HTTP_ENTRIES: 'httpEntries',
  WS_FRAMES: 'wsFrames',
  SSE_EVENTS: 'sseEvents',
  METADATA: 'metadata'
};

let dbInstance = null;

function openDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // HTTP entries store
      if (!db.objectStoreNames.contains(STORES.HTTP_ENTRIES)) {
        const httpStore = db.createObjectStore(STORES.HTTP_ENTRIES, { keyPath: 'id' });
        httpStore.createIndex('timestamp', 'timestamp', { unique: false });
        httpStore.createIndex('hostname', 'hostname', { unique: false });
        httpStore.createIndex('tabId', 'tabId', { unique: false });
      }

      // WebSocket frames store
      if (!db.objectStoreNames.contains(STORES.WS_FRAMES)) {
        const wsStore = db.createObjectStore(STORES.WS_FRAMES, { keyPath: 'id' });
        wsStore.createIndex('timestamp', 'timestamp', { unique: false });
        wsStore.createIndex('hostname', 'hostname', { unique: false });
        wsStore.createIndex('tabId', 'tabId', { unique: false });
        wsStore.createIndex('connectionId', 'connectionId', { unique: false });
      }

      // SSE events store
      if (!db.objectStoreNames.contains(STORES.SSE_EVENTS)) {
        const sseStore = db.createObjectStore(STORES.SSE_EVENTS, { keyPath: 'id' });
        sseStore.createIndex('timestamp', 'timestamp', { unique: false });
        sseStore.createIndex('hostname', 'hostname', { unique: false });
        sseStore.createIndex('tabId', 'tabId', { unique: false });
      }

      // Metadata store
      if (!db.objectStoreNames.contains(STORES.METADATA)) {
        db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
      }
    };
  });
}

function generateId() {
  return crypto.randomUUID();
}

// Generic add function
async function addEntry(storeName, entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.add({ ...entry, id: entry.id || generateId() });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Add HTTP entry
async function addHttpEntry(entry) {
  return addEntry(STORES.HTTP_ENTRIES, {
    ...entry,
    timestamp: entry.timestamp || Date.now()
  });
}

// Add WebSocket frame
async function addWsFrame(frame) {
  return addEntry(STORES.WS_FRAMES, {
    ...frame,
    timestamp: frame.timestamp || Date.now()
  });
}

// Add SSE event
async function addSseEvent(event) {
  return addEntry(STORES.SSE_EVENTS, {
    ...event,
    timestamp: event.timestamp || Date.now()
  });
}

// Get entries by time range
async function getEntriesByTimeRange(storeName, startTime, endTime, tabIds = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index('timestamp');
    const range = IDBKeyRange.bound(startTime, endTime);
    const entries = [];

    const request = index.openCursor(range);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const entry = cursor.value;
        if (!tabIds || tabIds.includes(entry.tabId)) {
          entries.push(entry);
        }
        cursor.continue();
      } else {
        resolve(entries);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Get all HTTP entries in time range
async function getHttpEntries(startTime, endTime, tabIds = null) {
  return getEntriesByTimeRange(STORES.HTTP_ENTRIES, startTime, endTime, tabIds);
}

// Get all WebSocket frames in time range
async function getWsFrames(startTime, endTime, tabIds = null) {
  return getEntriesByTimeRange(STORES.WS_FRAMES, startTime, endTime, tabIds);
}

// Get all SSE events in time range
async function getSseEvents(startTime, endTime, tabIds = null) {
  return getEntriesByTimeRange(STORES.SSE_EVENTS, startTime, endTime, tabIds);
}

// Delete entries older than timestamp
async function deleteEntriesOlderThan(storeName, timestamp) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const index = store.index('timestamp');
    const range = IDBKeyRange.upperBound(timestamp);
    let deletedCount = 0;

    const request = index.openCursor(range);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      } else {
        resolve(deletedCount);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Delete oldest entries to free up space
async function deleteOldestEntries(storeName, count) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const index = store.index('timestamp');
    let deletedCount = 0;

    const request = index.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && deletedCount < count) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      } else {
        resolve(deletedCount);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Get store count
async function getStoreCount(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Estimate storage size (approximate)
async function estimateStorageSize() {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0
    };
  }
  return { usage: 0, quota: 0 };
}

// Get oldest entry timestamp
async function getOldestTimestamp(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index('timestamp');
    const request = index.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      resolve(cursor ? cursor.value.timestamp : null);
    };
    request.onerror = () => reject(request.error);
  });
}

// Get newest entry timestamp
async function getNewestTimestamp(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      resolve(cursor ? cursor.value.timestamp : null);
    };
    request.onerror = () => reject(request.error);
  });
}

// Get buffer time range
async function getBufferTimeRange() {
  const timestamps = await Promise.all([
    getOldestTimestamp(STORES.HTTP_ENTRIES),
    getOldestTimestamp(STORES.WS_FRAMES),
    getOldestTimestamp(STORES.SSE_EVENTS),
    getNewestTimestamp(STORES.HTTP_ENTRIES),
    getNewestTimestamp(STORES.WS_FRAMES),
    getNewestTimestamp(STORES.SSE_EVENTS)
  ]);

  const validOldest = timestamps.slice(0, 3).filter(t => t !== null);
  const validNewest = timestamps.slice(3).filter(t => t !== null);

  return {
    oldest: validOldest.length > 0 ? Math.min(...validOldest) : null,
    newest: validNewest.length > 0 ? Math.max(...validNewest) : null
  };
}

// Set metadata
async function setMetadata(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.METADATA, 'readwrite');
    const store = tx.objectStore(STORES.METADATA);
    const request = store.put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Get metadata
async function getMetadata(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.METADATA, 'readonly');
    const store = tx.objectStore(STORES.METADATA);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

// Clear all data
async function clearAllData() {
  const db = await openDB();
  const storeNames = [STORES.HTTP_ENTRIES, STORES.WS_FRAMES, STORES.SSE_EVENTS];

  for (const storeName of storeNames) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Get unique hostnames from entries
async function getUniqueHostnames(startTime, endTime) {
  const db = await openDB();
  const hostnames = new Set();

  for (const storeName of [STORES.HTTP_ENTRIES, STORES.WS_FRAMES, STORES.SSE_EVENTS]) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index('timestamp');
      const range = IDBKeyRange.bound(startTime, endTime);

      const request = index.openCursor(range);
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.hostname) {
            hostnames.add(cursor.value.hostname);
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  return Array.from(hostnames);
}

// Get total counts for all stores
async function getTotalCounts() {
  const [httpCount, wsCount, sseCount] = await Promise.all([
    getStoreCount(STORES.HTTP_ENTRIES),
    getStoreCount(STORES.WS_FRAMES),
    getStoreCount(STORES.SSE_EVENTS)
  ]);

  return {
    httpEntries: httpCount,
    wsFrames: wsCount,
    sseEvents: sseCount,
    total: httpCount + wsCount + sseCount
  };
}

export {
  STORES,
  openDB,
  addHttpEntry,
  addWsFrame,
  addSseEvent,
  getHttpEntries,
  getWsFrames,
  getSseEvents,
  deleteEntriesOlderThan,
  deleteOldestEntries,
  getStoreCount,
  estimateStorageSize,
  getBufferTimeRange,
  setMetadata,
  getMetadata,
  clearAllData,
  getUniqueHostnames,
  getTotalCounts
};
