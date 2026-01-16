// Storage monitor module - tracks and manages storage usage
import { estimateStorageSize, getTotalCounts, getBufferTimeRange } from '../lib/db.js';
import { getStorageCap } from './cleanup.js';
import { formatBytes, formatBufferTime } from '../utils/format.js';

// Storage usage thresholds
const WARNING_THRESHOLD = 0.8; // 80%
const CRITICAL_THRESHOLD = 0.95; // 95%

// Get comprehensive storage status
async function getStorageStatus() {
  const [storageInfo, storageCap, counts, timeRange] = await Promise.all([
    estimateStorageSize(),
    getStorageCap(),
    getTotalCounts(),
    getBufferTimeRange()
  ]);

  const usagePercent = storageInfo.usage / storageCap;
  const status = usagePercent >= CRITICAL_THRESHOLD ? 'critical' :
                 usagePercent >= WARNING_THRESHOLD ? 'warning' : 'normal';

  let bufferDuration = 0;
  if (timeRange.oldest && timeRange.newest) {
    bufferDuration = timeRange.newest - timeRange.oldest;
  }

  return {
    // Raw values
    usage: storageInfo.usage,
    quota: storageInfo.quota,
    storageCap,
    bufferDuration,
    oldestTimestamp: timeRange.oldest,
    newestTimestamp: timeRange.newest,
    counts,

    // Formatted values
    usageFormatted: formatBytes(storageInfo.usage),
    capFormatted: formatBytes(storageCap),
    bufferFormatted: formatBufferTime(bufferDuration),

    // Status
    usagePercent: Math.round(usagePercent * 100),
    status
  };
}

// Update extension badge with storage status
async function updateBadge() {
  const isPausedResult = await chrome.storage.local.get('isPaused');
  const isPaused = isPausedResult.isPaused === true;

  if (isPaused) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#666666' });
    return;
  }

  const supabaseConfig = await chrome.storage.sync.get(['supabaseUrl', 'supabaseKey']);
  const isConfigured = supabaseConfig.supabaseUrl && supabaseConfig.supabaseKey;

  if (!isConfigured) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#FFA500' });
    return;
  }

  const status = await getStorageStatus();

  if (status.status === 'critical') {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  } else if (status.status === 'warning') {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setBadgeBackgroundColor({ color: '#FFA500' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Update extension icon based on state
async function updateIcon() {
  const isPausedResult = await chrome.storage.local.get('isPaused');
  const isPaused = isPausedResult.isPaused === true;

  const iconPath = isPaused ? {
    '16': 'icons/paused-16.png',
    '48': 'icons/paused-48.png',
    '128': 'icons/paused-128.png'
  } : {
    '16': 'icons/active-16.png',
    '48': 'icons/active-48.png',
    '128': 'icons/active-128.png'
  };

  await chrome.action.setIcon({ path: iconPath });
}

// Initialize storage monitoring
function initStorageMonitor() {
  // Update badge periodically
  setInterval(async () => {
    await updateBadge();
  }, 30000); // Every 30 seconds

  // Initial update
  updateBadge();
  updateIcon();

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (changes.isPaused) {
      updateBadge();
      updateIcon();
    }
    if (changes.supabaseUrl || changes.supabaseKey) {
      updateBadge();
    }
  });
}

export {
  getStorageStatus,
  updateBadge,
  updateIcon,
  initStorageMonitor
};
