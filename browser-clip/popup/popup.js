// Browser Clip Popup
import { formatBytes, formatBufferTime, TIME_PRESETS } from '../utils/format.js';

// DOM Elements
const activeState = document.getElementById('active-state');
const pausedState = document.getElementById('paused-state');
const bufferTimeEl = document.getElementById('buffer-time');
const bufferSizeEl = document.getElementById('buffer-size');
const timeButtons = document.querySelectorAll('.time-btn');
const customPicker = document.getElementById('custom-picker');
const customStart = document.getElementById('custom-start');
const customEnd = document.getElementById('custom-end');
const scopeRadios = document.querySelectorAll('input[name="scope"]');
const tabSelector = document.getElementById('tab-selector');
const tabList = document.getElementById('tab-list');
const domainOption = document.getElementById('domain-option');
const domainCheckbox = document.getElementById('domain-checkbox');
const domainLabel = document.getElementById('domain-label');
const clipNameInput = document.getElementById('clip-name');
const saveBtn = document.getElementById('save-btn');
const resumeBtn = document.getElementById('resume-btn');
const settingsLink = document.getElementById('settings-link');
const statusMessage = document.getElementById('status-message');

// State
let selectedTime = null;
let selectedScope = 'currentTab';
let selectedTabIds = [];
let currentTab = null;
let allTabs = [];
let isPaused = false;

// Initialize popup
async function init() {
  // Get paused state from local storage first (more reliable than service worker message)
  const local = await chrome.storage.local.get('isPaused');
  isPaused = local.isPaused === true;
  updateUIState();

  // Try to get full status from service worker
  try {
    const status = await sendMessage({ action: 'getStatus' });
    // Update paused state if service worker has different info
    if (status && typeof status.isPaused === 'boolean') {
      isPaused = status.isPaused;
      updateUIState();
    }

    if (!isPaused && status) {
      updateBufferInfo(status.storage);
    }
  } catch (error) {
    // Service worker might not be ready, continue with storage-based state
    console.log('Could not get status from service worker:', error);
  }

  if (!isPaused) {
    // Get current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0] || null;

    // Get all tabs for selector
    allTabs = await chrome.tabs.query({});

    // Set up custom time picker defaults
    setupCustomPicker();

    // Set up domain option if we have a current tab
    if (currentTab) {
      const hostname = getHostname(currentTab.url);
      if (hostname) {
        domainLabel.textContent = `All tabs on ${hostname}`;
        domainOption.classList.remove('hidden');
      }
    }
  }

  // Event listeners
  setupEventListeners();
}

// Update UI based on paused state
function updateUIState() {
  if (isPaused) {
    activeState.classList.add('hidden');
    pausedState.classList.remove('hidden');
  } else {
    activeState.classList.remove('hidden');
    pausedState.classList.add('hidden');
  }
}

// Update buffer info display
function updateBufferInfo(storage) {
  if (!storage) return;

  bufferTimeEl.textContent = storage.bufferFormatted || '--';
  bufferSizeEl.textContent = storage.usageFormatted || '--';

  // Show warning if buffer is truncated
  if (storage.isBufferTruncated || storage.isCapWarning) {
    const statusBar = document.querySelector('.status-bar');
    statusBar.style.background = '#fff3e0';
  }
}

// Set up custom time picker with sensible defaults
function setupCustomPicker() {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Format for datetime-local input
  customEnd.value = formatDateTimeLocal(now);
  customStart.value = formatDateTimeLocal(oneHourAgo);
}

// Format date for datetime-local input
function formatDateTimeLocal(date) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

// Get hostname from URL
function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Set up event listeners
function setupEventListeners() {
  // Time buttons
  timeButtons.forEach(btn => {
    btn.addEventListener('click', () => handleTimeSelect(btn));
  });

  // Custom time inputs
  customStart.addEventListener('change', validateCustomTime);
  customEnd.addEventListener('change', validateCustomTime);

  // Scope radios
  scopeRadios.forEach(radio => {
    radio.addEventListener('change', () => handleScopeChange(radio.value));
  });

  // Domain checkbox
  domainCheckbox.addEventListener('change', handleDomainToggle);

  // Save button
  saveBtn.addEventListener('click', handleSave);

  // Resume button
  resumeBtn.addEventListener('click', handleResume);

  // Settings link
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

// Handle time button selection
function handleTimeSelect(btn) {
  // Clear previous selection
  timeButtons.forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  const timeKey = btn.dataset.time;

  if (timeKey === 'custom') {
    customPicker.classList.remove('hidden');
    validateCustomTime();
  } else {
    customPicker.classList.add('hidden');
    selectedTime = TIME_PRESETS[timeKey];
    updateSaveButton();
  }
}

// Validate custom time selection
function validateCustomTime() {
  const start = new Date(customStart.value).getTime();
  const end = new Date(customEnd.value).getTime();

  if (start && end && end > start) {
    selectedTime = { start, end, custom: true };
    updateSaveButton();
  } else {
    selectedTime = null;
    updateSaveButton();
  }
}

// Handle scope change
function handleScopeChange(scope) {
  selectedScope = scope;
  selectedTabIds = [];

  if (scope === 'selectTabs') {
    tabSelector.classList.remove('hidden');
    populateTabList();
  } else {
    tabSelector.classList.add('hidden');
  }

  updateSaveButton();
}

// Populate tab list for selection
function populateTabList() {
  tabList.innerHTML = '';

  // Filter out extension pages and group by window
  const capturableTabs = allTabs.filter(tab => {
    const url = tab.url || '';
    return !url.startsWith('chrome://') &&
           !url.startsWith('chrome-extension://') &&
           !url.startsWith('about:');
  });

  capturableTabs.forEach(tab => {
    const item = document.createElement('label');
    item.className = 'tab-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = tab.id;
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedTabIds.push(tab.id);
      } else {
        selectedTabIds = selectedTabIds.filter(id => id !== tab.id);
      }
      updateSaveButton();
    });

    const favicon = document.createElement('img');
    favicon.className = 'favicon';
    favicon.src = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect fill="%23ddd" width="16" height="16" rx="2"/></svg>';
    favicon.onerror = () => {
      favicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect fill="%23ddd" width="16" height="16" rx="2"/></svg>';
    };

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || 'Untitled';
    title.title = tab.url;

    item.appendChild(checkbox);
    item.appendChild(favicon);
    item.appendChild(title);
    tabList.appendChild(item);
  });
}

// Handle domain toggle
function handleDomainToggle() {
  if (!currentTab) return;

  const hostname = getHostname(currentTab.url);
  if (!hostname) return;

  if (domainCheckbox.checked) {
    // Select all tabs on this domain
    const domainTabs = allTabs.filter(tab => getHostname(tab.url) === hostname);
    selectedTabIds = domainTabs.map(tab => tab.id);

    // Update checkboxes in tab list
    tabList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const tabId = parseInt(cb.value);
      cb.checked = selectedTabIds.includes(tabId);
    });
  }

  updateSaveButton();
}

// Update save button state
function updateSaveButton() {
  let canSave = selectedTime !== null;

  if (selectedScope === 'selectTabs' && selectedTabIds.length === 0) {
    canSave = false;
  }

  saveBtn.disabled = !canSave;
}

// Handle save clip
async function handleSave() {
  if (!selectedTime) return;

  saveBtn.disabled = true;
  saveBtn.classList.add('loading');
  saveBtn.innerHTML = '<span class="save-icon">&#8987;</span> Saving...';

  try {
    // Calculate time range
    let startTime, endTime;

    if (selectedTime.custom) {
      startTime = selectedTime.start;
      endTime = selectedTime.end;
    } else {
      endTime = Date.now();
      startTime = endTime - selectedTime;
    }

    // Determine tab filter
    let tabIds = null;
    if (selectedScope === 'currentTab' && currentTab) {
      tabIds = [currentTab.id];
    } else if (selectedScope === 'selectTabs') {
      tabIds = selectedTabIds;
    }
    // 'allTabs' leaves tabIds as null

    // Create clip
    const result = await sendMessage({
      action: 'createClip',
      payload: {
        startTime,
        endTime,
        tabIds,
        clipName: clipNameInput.value.trim() || null
      }
    });

    if (result.success) {
      showStatus('success', `Clip saved! ${result.entryCount} entries (${formatBytes(result.sizeBytes)})`);
      clipNameInput.value = '';
    } else {
      showStatus('error', result.error || 'Failed to save clip');
    }
  } catch (error) {
    showStatus('error', error.message || 'An error occurred');
  } finally {
    saveBtn.disabled = false;
    saveBtn.classList.remove('loading');
    saveBtn.innerHTML = '<span class="save-icon">&#128190;</span> Save Clip';
    updateSaveButton();
  }
}

// Handle resume capture
async function handleResume() {
  resumeBtn.disabled = true;
  resumeBtn.textContent = 'Resuming...';

  try {
    // Update local storage first (ensures state is persisted even if service worker is slow)
    await chrome.storage.local.set({ isPaused: false });

    // Update UI immediately (optimistic update)
    isPaused = false;
    updateUIState();

    // Notify service worker to re-attach to tabs (best effort)
    try {
      await sendMessage({ action: 'resumeCapture' });
      // Refresh buffer info if service worker responded
      const status = await sendMessage({ action: 'getStatus' });
      updateBufferInfo(status.storage);
    } catch (swError) {
      // Service worker might not be ready, but state is already updated
      console.log('Service worker notification failed, state already updated:', swError);
    }
  } catch (error) {
    // Revert UI if storage update failed
    isPaused = true;
    updateUIState();
    showStatus('error', error.message || 'Failed to resume capture');
  } finally {
    resumeBtn.disabled = false;
    resumeBtn.innerHTML = '<span class="play-icon">&#9654;</span> Resume Capture';
  }
}

// Show status message
function showStatus(type, message) {
  statusMessage.className = `status-message ${type}`;
  statusMessage.textContent = message;
  statusMessage.classList.remove('hidden');

  // Auto-hide after 5 seconds for success
  if (type === 'success') {
    setTimeout(() => {
      statusMessage.classList.add('hidden');
    }, 5000);
  }
}

// Send message to service worker
function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

// Initialize
init();
