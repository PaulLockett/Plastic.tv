/**
 * Unit tests for utils/format.js - Formatting utilities
 */

import {
  formatBytes,
  formatDuration,
  formatBufferTime,
  toISOString,
  toLocalTimeString,
  toLocalDateTimeString,
  TIME_PRESETS,
  STORAGE_CAPS,
  DEFAULT_SETTINGS,
  TWENTY_FOUR_HOURS,
  CLEANUP_INTERVAL,
  MAX_RESPONSE_BODY_SIZE
} from '../../../utils/format.js';

describe('Format Utilities', () => {
  describe('formatBytes', () => {
    it('should format 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });

    it('should format terabytes', () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
    });

    it('should round to one decimal place', () => {
      expect(formatBytes(1234567)).toBe('1.2 MB');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(30000)).toBe('30s');
      expect(formatDuration(59000)).toBe('59s');
    });

    it('should format minutes', () => {
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(5 * 60 * 1000)).toBe('5m');
    });

    it('should format hours', () => {
      expect(formatDuration(60 * 60 * 1000)).toBe('1h');
      expect(formatDuration(90 * 60 * 1000)).toBe('1h 30m');
      expect(formatDuration(2 * 60 * 60 * 1000)).toBe('2h');
    });

    it('should not show seconds when hours are present', () => {
      expect(formatDuration(3661000)).toBe('1h 1m');
    });

    it('should not show zero remainders', () => {
      expect(formatDuration(60 * 60 * 1000)).toBe('1h');
      expect(formatDuration(60 * 1000)).toBe('1m');
    });
  });

  describe('formatBufferTime', () => {
    it('should format minutes for less than 1 hour', () => {
      expect(formatBufferTime(30 * 60 * 1000)).toBe('30.0 min');
      expect(formatBufferTime(45 * 60 * 1000)).toBe('45.0 min');
    });

    it('should format hours for 1 hour or more', () => {
      expect(formatBufferTime(60 * 60 * 1000)).toBe('1.0 hrs');
      expect(formatBufferTime(90 * 60 * 1000)).toBe('1.5 hrs');
      expect(formatBufferTime(24 * 60 * 60 * 1000)).toBe('24.0 hrs');
    });

    it('should handle fractional hours', () => {
      expect(formatBufferTime(2.5 * 60 * 60 * 1000)).toBe('2.5 hrs');
      expect(formatBufferTime(18.3 * 60 * 60 * 1000)).toBe('18.3 hrs');
    });
  });

  describe('Timestamp Formatting', () => {
    const testDate = new Date('2024-06-15T14:30:00.000Z');
    const testTimestamp = testDate.getTime();

    it('should convert to ISO string', () => {
      expect(toISOString(testTimestamp)).toBe('2024-06-15T14:30:00.000Z');
    });

    it('should convert to local time string', () => {
      const result = toLocalTimeString(testTimestamp);
      // Just verify it returns a string (exact format depends on locale)
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should convert to local date time string', () => {
      const result = toLocalDateTimeString(testTimestamp);
      // Just verify it returns a string (exact format depends on locale)
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('TIME_PRESETS', () => {
    it('should have all expected presets', () => {
      expect(TIME_PRESETS).toHaveProperty('1m');
      expect(TIME_PRESETS).toHaveProperty('5m');
      expect(TIME_PRESETS).toHaveProperty('15m');
      expect(TIME_PRESETS).toHaveProperty('30m');
      expect(TIME_PRESETS).toHaveProperty('1hr');
      expect(TIME_PRESETS).toHaveProperty('3hr');
      expect(TIME_PRESETS).toHaveProperty('8hr');
      expect(TIME_PRESETS).toHaveProperty('12hr');
      expect(TIME_PRESETS).toHaveProperty('24hr');
    });

    it('should have correct values in milliseconds', () => {
      expect(TIME_PRESETS['1m']).toBe(60 * 1000);
      expect(TIME_PRESETS['5m']).toBe(5 * 60 * 1000);
      expect(TIME_PRESETS['1hr']).toBe(60 * 60 * 1000);
      expect(TIME_PRESETS['24hr']).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('STORAGE_CAPS', () => {
    it('should have all expected cap options', () => {
      expect(STORAGE_CAPS).toHaveProperty('100MB');
      expect(STORAGE_CAPS).toHaveProperty('250MB');
      expect(STORAGE_CAPS).toHaveProperty('500MB');
      expect(STORAGE_CAPS).toHaveProperty('1GB');
      expect(STORAGE_CAPS).toHaveProperty('2GB');
    });

    it('should have correct values in bytes', () => {
      expect(STORAGE_CAPS['100MB']).toBe(100 * 1024 * 1024);
      expect(STORAGE_CAPS['250MB']).toBe(250 * 1024 * 1024);
      expect(STORAGE_CAPS['500MB']).toBe(500 * 1024 * 1024);
      expect(STORAGE_CAPS['1GB']).toBe(1024 * 1024 * 1024);
      expect(STORAGE_CAPS['2GB']).toBe(2 * 1024 * 1024 * 1024);
    });
  });

  describe('DEFAULT_SETTINGS', () => {
    it('should have all expected default values', () => {
      expect(DEFAULT_SETTINGS.storageCap).toBe('500MB');
      expect(DEFAULT_SETTINGS.defaultScope).toBe('currentTab');
      expect(DEFAULT_SETTINGS.sanitizeUrlParams).toBe(true);
      expect(DEFAULT_SETTINGS.customHeaderPatterns).toEqual([]);
      expect(DEFAULT_SETTINGS.supabaseUrl).toBe('');
      expect(DEFAULT_SETTINGS.supabaseKey).toBe('');
    });
  });

  describe('Constants', () => {
    it('should define TWENTY_FOUR_HOURS correctly', () => {
      expect(TWENTY_FOUR_HOURS).toBe(24 * 60 * 60 * 1000);
    });

    it('should define CLEANUP_INTERVAL correctly', () => {
      expect(CLEANUP_INTERVAL).toBe(5 * 60 * 1000);
    });

    it('should define MAX_RESPONSE_BODY_SIZE correctly', () => {
      expect(MAX_RESPONSE_BODY_SIZE).toBe(5 * 1024 * 1024);
    });
  });
});
