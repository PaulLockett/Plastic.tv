// Browser Clip Options Page
import { formatBytes, formatBufferTime, STORAGE_CAPS } from '../utils/format.js';

// DOM Elements
const supabaseUrl = document.getElementById('supabase-url');
const supabaseKey = document.getElementById('supabase-key');
const testConnectionBtn = document.getElementById('test-connection');
const saveSupabaseBtn = document.getElementById('save-supabase');
const connectionStatus = document.getElementById('connection-status');

const storageCap = document.getElementById('storage-cap');
const currentUsage = document.getElementById('current-usage');
const bufferDuration = document.getElementById('buffer-duration');
const totalEntries = document.getElementById('total-entries');
const usageProgress = document.getElementById('usage-progress');
const clearBufferBtn = document.getElementById('clear-buffer');

const defaultScopeRadios = document.querySelectorAll('input[name="default-scope"]');
const sanitizeUrlParams = document.getElementById('sanitize-url-params');
const customPatterns = document.getElementById('custom-patterns');

const captureActive = document.getElementById('capture-active');
const capturePaused = document.getElementById('capture-paused');
const pauseCaptureBtn = document.getElementById('pause-capture');
const resumeCaptureBtn = document.getElementById('resume-capture');

const exportSettingsBtn = document.getElementById('export-settings');

// Modals
const pauseModal = document.getElementById('pause-modal');
const cancelPauseBtn = document.getElementById('cancel-pause');
const confirmPauseBtn = document.getElementById('confirm-pause');

const clearModal = document.getElementById('clear-modal');
const cancelClearBtn = document.getElementById('cancel-clear');
const confirmClearBtn = document.getElementById('confirm-clear');

// Initialize options page
async function init() {
  await loadSettings();
  await updateStorageInfo();
  await updateCaptureStatus();
  setupEventListeners();
}

// Load saved settings
async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'supabaseUrl',
    'supabaseKey',
    'storageCap',
    'defaultScope',
    'sanitizeUrlParams',
    'customHeaderPatterns'
  ]);

  // Supabase
  supabaseUrl.value = settings.supabaseUrl || '';
  supabaseKey.value = settings.supabaseKey || '';

  // Storage
  storageCap.value = settings.storageCap || '500MB';

  // Default scope
  const scope = settings.defaultScope || 'currentTab';
  defaultScopeRadios.forEach(radio => {
    radio.checked = radio.value === scope;
  });

  // Sanitization
  sanitizeUrlParams.checked = settings.sanitizeUrlParams !== false;
  customPatterns.value = (settings.customHeaderPatterns || []).join('\n');
}

// Update storage info display
async function updateStorageInfo() {
  try {
    const status = await sendMessage({ action: 'getStorageStatus' });

    currentUsage.textContent = status.usageFormatted;
    bufferDuration.textContent = status.bufferFormatted;

    // Get counts
    const counts = await sendMessage({ action: 'getStatus' });
    totalEntries.textContent = counts.counts?.total?.toLocaleString() || '0';

    // Update progress bar
    const percent = status.usagePercent || 0;
    usageProgress.style.width = `${Math.min(percent, 100)}%`;

    // Update progress bar color based on status
    usageProgress.classList.remove('warning', 'critical');
    if (percent >= 95) {
      usageProgress.classList.add('critical');
    } else if (percent >= 80) {
      usageProgress.classList.add('warning');
    }
  } catch (error) {
    console.error('Failed to update storage info:', error);
  }
}

// Update capture status display
async function updateCaptureStatus() {
  const local = await chrome.storage.local.get('isPaused');
  const isPaused = local.isPaused === true;

  if (isPaused) {
    captureActive.classList.add('hidden');
    capturePaused.classList.remove('hidden');
  } else {
    captureActive.classList.remove('hidden');
    capturePaused.classList.add('hidden');
  }
}

// Set up event listeners
function setupEventListeners() {
  // Supabase
  testConnectionBtn.addEventListener('click', handleTestConnection);
  saveSupabaseBtn.addEventListener('click', handleSaveSupabase);

  // Storage
  storageCap.addEventListener('change', handleStorageCapChange);
  clearBufferBtn.addEventListener('click', () => showModal(clearModal));

  // Default scope
  defaultScopeRadios.forEach(radio => {
    radio.addEventListener('change', handleDefaultScopeChange);
  });

  // Sanitization
  sanitizeUrlParams.addEventListener('change', handleSanitizationChange);
  customPatterns.addEventListener('blur', handleCustomPatternsChange);

  // Capture control
  pauseCaptureBtn.addEventListener('click', () => showModal(pauseModal));
  resumeCaptureBtn.addEventListener('click', handleResumeCapture);

  // Export
  exportSettingsBtn.addEventListener('click', handleExportSettings);

  // Modal buttons
  cancelPauseBtn.addEventListener('click', () => hideModal(pauseModal));
  confirmPauseBtn.addEventListener('click', handleConfirmPause);
  cancelClearBtn.addEventListener('click', () => hideModal(clearModal));
  confirmClearBtn.addEventListener('click', handleConfirmClear);

  // Close modals on background click
  [pauseModal, clearModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideModal(modal);
    });
  });
}

// Handle test connection
async function handleTestConnection() {
  const url = supabaseUrl.value.trim();
  const key = supabaseKey.value.trim();

  if (!url || !key) {
    showConnectionStatus('error', 'Please enter both URL and API key');
    return;
  }

  testConnectionBtn.disabled = true;
  testConnectionBtn.textContent = 'Testing...';

  try {
    const result = await sendMessage({
      action: 'testSupabaseConnection',
      payload: { url, key }
    });

    if (result.success) {
      showConnectionStatus('success', 'Connection successful!');
    } else {
      showConnectionStatus('error', result.message || 'Connection failed');
    }
  } catch (error) {
    showConnectionStatus('error', error.message);
  } finally {
    testConnectionBtn.disabled = false;
    testConnectionBtn.textContent = 'Test Connection';
  }
}

// Show connection status
function showConnectionStatus(type, message) {
  connectionStatus.className = `connection-status ${type}`;
  connectionStatus.textContent = message;
  connectionStatus.classList.remove('hidden');
}

// Handle save Supabase settings
async function handleSaveSupabase() {
  const url = supabaseUrl.value.trim();
  const key = supabaseKey.value.trim();

  await chrome.storage.sync.set({
    supabaseUrl: url,
    supabaseKey: key
  });

  showToast('success', 'Supabase settings saved');
}

// Handle storage cap change
async function handleStorageCapChange() {
  await chrome.storage.sync.set({
    storageCap: storageCap.value
  });

  showToast('success', 'Storage cap updated');

  // Trigger cleanup to enforce new cap
  await sendMessage({ action: 'runCleanup' });
  await updateStorageInfo();
}

// Handle default scope change
async function handleDefaultScopeChange(e) {
  await chrome.storage.sync.set({
    defaultScope: e.target.value
  });

  showToast('success', 'Default scope updated');
}

// Handle sanitization toggle change
async function handleSanitizationChange() {
  await chrome.storage.sync.set({
    sanitizeUrlParams: sanitizeUrlParams.checked
  });

  showToast('success', 'Settings saved');
}

// Handle custom patterns change
async function handleCustomPatternsChange() {
  const patterns = customPatterns.value
    .split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  await chrome.storage.sync.set({
    customHeaderPatterns: patterns
  });

  showToast('success', 'Custom patterns saved');
}

// Handle confirm pause
async function handleConfirmPause() {
  hideModal(pauseModal);

  try {
    await sendMessage({ action: 'pauseCapture' });
    await updateCaptureStatus();
    showToast('info', 'Capture paused');
  } catch (error) {
    showToast('error', error.message);
  }
}

// Handle resume capture
async function handleResumeCapture() {
  try {
    await sendMessage({ action: 'resumeCapture' });
    await updateCaptureStatus();
    showToast('success', 'Capture resumed');
  } catch (error) {
    showToast('error', error.message);
  }
}

// Handle confirm clear
async function handleConfirmClear() {
  hideModal(clearModal);

  try {
    await sendMessage({ action: 'clearBuffer' });
    await updateStorageInfo();
    showToast('success', 'Buffer cleared');
  } catch (error) {
    showToast('error', error.message);
  }
}

// Handle export settings
async function handleExportSettings() {
  const settings = await chrome.storage.sync.get(null);

  // Remove sensitive data
  const exportData = {
    ...settings,
    supabaseKey: settings.supabaseKey ? '[REDACTED]' : ''
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `browser-clip-settings-${new Date().toISOString().split('T')[0]}.json`;
  a.click();

  URL.revokeObjectURL(url);
  showToast('success', 'Settings exported');
}

// Show modal
function showModal(modal) {
  modal.classList.remove('hidden');
}

// Hide modal
function hideModal(modal) {
  modal.classList.add('hidden');
}

// Show toast notification
function showToast(type, message) {
  // Remove existing toasts
  document.querySelectorAll('.toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Send message to service worker
function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

// Initialize
init();
