/**
 * Unit tests for utils/tab-utils.js - Tab utility functions
 */

import { addMockTab } from '../../helpers/setup.js';
import {
  getHostname,
  getAllTabs,
  getCurrentTab,
  getTabsByHostname,
  getTabInfo,
  groupTabsByHostname,
  isCapturableTab,
  getCapturableTabs
} from '../../../utils/tab-utils.js';

describe('Tab Utilities', () => {
  describe('getHostname', () => {
    it('should extract hostname from HTTP URL', () => {
      expect(getHostname('https://example.com/path')).toBe('example.com');
    });

    it('should extract hostname from URL with port', () => {
      expect(getHostname('https://example.com:8080/path')).toBe('example.com');
    });

    it('should extract hostname from URL with subdomain', () => {
      expect(getHostname('https://api.example.com/v1')).toBe('api.example.com');
    });

    it('should handle WebSocket URLs', () => {
      expect(getHostname('wss://socket.example.com/connect')).toBe('socket.example.com');
    });

    it('should return null for invalid URLs', () => {
      expect(getHostname('not-a-url')).toBeNull();
      expect(getHostname('')).toBeNull();
    });

    it('should handle localhost', () => {
      expect(getHostname('http://localhost:3000')).toBe('localhost');
    });

    it('should handle IP addresses', () => {
      expect(getHostname('http://192.168.1.1/path')).toBe('192.168.1.1');
    });
  });

  describe('getAllTabs', () => {
    it('should return all tabs', async () => {
      const tabs = await getAllTabs();
      expect(Array.isArray(tabs)).toBe(true);
    });

    it('should call chrome.tabs.query with empty object', async () => {
      await getAllTabs();
      expect(chrome.tabs.query).toHaveBeenCalledWith({});
    });
  });

  describe('getCurrentTab', () => {
    it('should return the active tab in current window', async () => {
      const tab = await getCurrentTab();

      expect(tab).toBeDefined();
      expect(tab?.active).toBe(true);
    });

    it('should query with active and currentWindow flags', async () => {
      await getCurrentTab();

      expect(chrome.tabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true
      });
    });
  });

  describe('getTabInfo', () => {
    it('should extract relevant tab information', () => {
      const mockTab = {
        id: 123,
        index: 0,
        windowId: 1,
        highlighted: true,
        active: true,
        pinned: false,
        incognito: false,
        url: 'https://example.com/page',
        title: 'Example Page',
        favIconUrl: 'https://example.com/favicon.ico'
      } as chrome.tabs.Tab;

      const info = getTabInfo(mockTab);

      expect(info.id).toBe(123);
      expect(info.title).toBe('Example Page');
      expect(info.url).toBe('https://example.com/page');
      expect(info.hostname).toBe('example.com');
      expect(info.favIconUrl).toBe('https://example.com/favicon.ico');
      expect(info.windowId).toBe(1);
    });

    it('should handle missing title', () => {
      const mockTab = {
        id: 1,
        url: 'https://example.com'
      } as chrome.tabs.Tab;

      const info = getTabInfo(mockTab);
      expect(info.title).toBe('Untitled');
    });

    it('should handle missing favicon', () => {
      const mockTab = {
        id: 1,
        url: 'https://example.com',
        title: 'Test'
      } as chrome.tabs.Tab;

      const info = getTabInfo(mockTab);
      expect(info.favIconUrl).toBeNull();
    });
  });

  describe('isCapturableTab', () => {
    it('should return true for HTTP URLs', () => {
      expect(isCapturableTab({ url: 'https://example.com' } as chrome.tabs.Tab)).toBe(true);
      expect(isCapturableTab({ url: 'http://example.com' } as chrome.tabs.Tab)).toBe(true);
    });

    it('should return false for chrome:// URLs', () => {
      expect(isCapturableTab({ url: 'chrome://extensions' } as chrome.tabs.Tab)).toBe(false);
      expect(isCapturableTab({ url: 'chrome://settings' } as chrome.tabs.Tab)).toBe(false);
    });

    it('should return false for chrome-extension:// URLs', () => {
      expect(isCapturableTab({ url: 'chrome-extension://abc/popup.html' } as chrome.tabs.Tab)).toBe(false);
    });

    it('should return false for edge:// URLs', () => {
      expect(isCapturableTab({ url: 'edge://settings' } as chrome.tabs.Tab)).toBe(false);
    });

    it('should return false for about: URLs', () => {
      expect(isCapturableTab({ url: 'about:blank' } as chrome.tabs.Tab)).toBe(false);
    });

    it('should return false for devtools:// URLs', () => {
      expect(isCapturableTab({ url: 'devtools://devtools/bundled/devtools.html' } as chrome.tabs.Tab)).toBe(false);
    });

    it('should return false for null or missing tab', () => {
      expect(isCapturableTab(null as any)).toBe(false);
      expect(isCapturableTab(undefined as any)).toBe(false);
    });

    it('should return false for tab without URL', () => {
      expect(isCapturableTab({} as chrome.tabs.Tab)).toBe(false);
      expect(isCapturableTab({ url: '' } as chrome.tabs.Tab)).toBe(false);
    });
  });

  describe('getTabsByHostname', () => {
    beforeEach(() => {
      // Add mock tabs with different hostnames
      addMockTab({ url: 'https://example.com/page1', title: 'Example 1' });
      addMockTab({ url: 'https://example.com/page2', title: 'Example 2' });
      addMockTab({ url: 'https://other.com/page', title: 'Other' });
    });

    it('should filter tabs by hostname', async () => {
      const tabs = await getTabsByHostname('example.com');

      expect(tabs.length).toBeGreaterThan(0);
      tabs.forEach(tab => {
        expect(getHostname(tab.url!)).toBe('example.com');
      });
    });

    it('should return empty array for non-matching hostname', async () => {
      const tabs = await getTabsByHostname('nonexistent.com');
      expect(tabs).toEqual([]);
    });
  });

  describe('groupTabsByHostname', () => {
    beforeEach(() => {
      addMockTab({ url: 'https://example.com/page1', title: 'Example 1' });
      addMockTab({ url: 'https://example.com/page2', title: 'Example 2' });
      addMockTab({ url: 'https://other.com/page', title: 'Other' });
    });

    it('should group tabs by hostname', async () => {
      const groups = await groupTabsByHostname();

      expect(groups['example.com']).toBeDefined();
      expect(Array.isArray(groups['example.com'])).toBe(true);
    });

    it('should include tab info in groups', async () => {
      const groups = await groupTabsByHostname();

      if (groups['example.com']) {
        const tab = groups['example.com'][0];
        expect(tab).toHaveProperty('id');
        expect(tab).toHaveProperty('title');
        expect(tab).toHaveProperty('url');
        expect(tab).toHaveProperty('hostname');
      }
    });

    it('should not include tabs without valid hostname', async () => {
      addMockTab({ url: '', title: 'No URL' });

      const groups = await groupTabsByHostname();

      // Should not have an empty or undefined key
      expect(groups['']).toBeUndefined();
      expect(groups['undefined']).toBeUndefined();
    });
  });

  describe('getCapturableTabs', () => {
    beforeEach(() => {
      addMockTab({ url: 'https://example.com', title: 'Capturable' });
      addMockTab({ url: 'chrome://extensions', title: 'Not Capturable' });
    });

    it('should only return capturable tabs', async () => {
      const tabs = await getCapturableTabs();

      tabs.forEach(tab => {
        expect(isCapturableTab(tab)).toBe(true);
      });
    });

    it('should exclude chrome:// URLs', async () => {
      const tabs = await getCapturableTabs();

      const chromeUrls = tabs.filter(tab => tab.url?.startsWith('chrome://'));
      expect(chromeUrls).toHaveLength(0);
    });
  });
});
