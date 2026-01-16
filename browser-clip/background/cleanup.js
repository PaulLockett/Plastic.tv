// Cleanup module - manages rolling buffer and storage limits
import {
  STORES,
  deleteEntriesOlderThan,
  deleteOldestEntries,
  estimateStorageSize,
  getBufferTimeRange,
  setMetadata,
  getMetadata
} from '../lib/db.js';
import { STORAGE_CAPS, TWENTY_FOUR_HOURS, DEFAULT_SETTINGS } from '../utils/format.js';

const CLEANUP_ALARM_NAME = 'browserClipCleanup';
const CLEANUP_INTERVAL_MINUTES = 5;

// Get current storage cap setting
async function getStorageCap() {
  const result = await chrome.storage.sync.get('storageCap');
  const capKey = result.storageCap || DEFAULT_SETTINGS.storageCap;
  return STORAGE_CAPS[capKey] || STORAGE_CAPS['500MB'];
}

// Perform cleanup
async function performCleanup() {
  console.log('[Browser Clip] Starting cleanup...');

  const now = Date.now();
  const cutoffTime = now - TWENTY_FOUR_HOURS;
  const storageCap = await getStorageCap();

  // Step 1: Delete entries older than 24 hours
  const stores = [STORES.HTTP_ENTRIES, STORES.WS_FRAMES, STORES.SSE_EVENTS];
  let totalDeleted = 0;

  for (const store of stores) {
    try {
      const deleted = await deleteEntriesOlderThan(store, cutoffTime);
      totalDeleted += deleted;
      console.log(`[Browser Clip] Deleted ${deleted} old entries from ${store}`);
    } catch (error) {
      console.error(`[Browser Clip] Cleanup error for ${store}:`, error);
    }
  }

  // Step 2: Check storage usage and enforce cap
  const { usage } = await estimateStorageSize();
  console.log(`[Browser Clip] Current storage usage: ${(usage / 1024 / 1024).toFixed(2)} MB`);

  if (usage > storageCap) {
    console.log('[Browser Clip] Storage cap exceeded, deleting oldest entries...');

    // Calculate how much to delete (aim for 90% of cap)
    const targetUsage = storageCap * 0.9;
    const bytesToDelete = usage - targetUsage;

    // Estimate average entry size and calculate entries to delete
    const avgEntrySize = 2000; // Rough estimate
    const entriesToDelete = Math.ceil(bytesToDelete / avgEntrySize);

    // Delete proportionally from each store
    const perStoreDelete = Math.ceil(entriesToDelete / 3);

    for (const store of stores) {
      try {
        const deleted = await deleteOldestEntries(store, perStoreDelete);
        console.log(`[Browser Clip] Deleted ${deleted} entries from ${store} for cap enforcement`);
      } catch (error) {
        console.error(`[Browser Clip] Cap enforcement error for ${store}:`, error);
      }
    }
  }

  // Update metadata
  await setMetadata('lastCleanup', now);
  await setMetadata('lastStorageUsage', usage);

  console.log('[Browser Clip] Cleanup complete');

  return { totalDeleted, storageUsage: usage };
}

// Get buffer status
async function getBufferStatus() {
  const { usage, quota } = await estimateStorageSize();
  const storageCap = await getStorageCap();
  const timeRange = await getBufferTimeRange();

  let bufferDuration = 0;
  if (timeRange.oldest && timeRange.newest) {
    bufferDuration = timeRange.newest - timeRange.oldest;
  }

  const isCapWarning = usage > storageCap * 0.9;
  const isBufferTruncated = bufferDuration < TWENTY_FOUR_HOURS && usage > storageCap * 0.8;

  return {
    usage,
    quota,
    storageCap,
    bufferDuration,
    oldestEntry: timeRange.oldest,
    newestEntry: timeRange.newest,
    isCapWarning,
    isBufferTruncated
  };
}

// Initialize cleanup alarm
function initCleanup() {
  // Set up the cleanup alarm
  chrome.alarms.create(CLEANUP_ALARM_NAME, {
    periodInMinutes: CLEANUP_INTERVAL_MINUTES
  });

  // Listen for alarm
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CLEANUP_ALARM_NAME) {
      performCleanup();
    }
  });

  // Run initial cleanup
  performCleanup();

  console.log('[Browser Clip] Cleanup initialized');
}

export {
  performCleanup,
  getBufferStatus,
  initCleanup,
  getStorageCap
};
