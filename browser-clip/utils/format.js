// Formatting utilities

// Format bytes to human readable string
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

// Format duration in milliseconds to human readable
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${hours}h`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    if (remainingSeconds > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

// Format buffer time (hours with decimals)
export function formatBufferTime(ms) {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) {
    const minutes = ms / (1000 * 60);
    return `${minutes.toFixed(1)} min`;
  }
  return `${hours.toFixed(1)} hrs`;
}

// Format timestamp to ISO string
export function toISOString(timestamp) {
  return new Date(timestamp).toISOString();
}

// Format timestamp to local time string
export function toLocalTimeString(timestamp) {
  return new Date(timestamp).toLocaleTimeString();
}

// Format timestamp to local date time string
export function toLocalDateTimeString(timestamp) {
  return new Date(timestamp).toLocaleString();
}

// Time range presets in milliseconds
export const TIME_PRESETS = {
  '1m': 1 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1hr': 1 * 60 * 60 * 1000,
  '3hr': 3 * 60 * 60 * 1000,
  '8hr': 8 * 60 * 60 * 1000,
  '12hr': 12 * 60 * 60 * 1000,
  '24hr': 24 * 60 * 60 * 1000
};

// Storage cap options in bytes
export const STORAGE_CAPS = {
  '100MB': 100 * 1024 * 1024,
  '250MB': 250 * 1024 * 1024,
  '500MB': 500 * 1024 * 1024,
  '1GB': 1024 * 1024 * 1024,
  '2GB': 2 * 1024 * 1024 * 1024
};

// Default settings
export const DEFAULT_SETTINGS = {
  storageCap: '500MB',
  defaultScope: 'currentTab',
  sanitizeUrlParams: true,
  customHeaderPatterns: [],
  supabaseUrl: '',
  supabaseKey: ''
};

// 24 hours in milliseconds
export const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

// Cleanup interval (5 minutes)
export const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Max response body size (5MB)
export const MAX_RESPONSE_BODY_SIZE = 5 * 1024 * 1024;
