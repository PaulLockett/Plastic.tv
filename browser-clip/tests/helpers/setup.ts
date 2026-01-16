/**
 * Jest Test Setup
 * Provides mocks for Chrome Extension APIs and IndexedDB
 */

import 'fake-indexeddb/auto';

// Mock Chrome Extension APIs
const mockStorage: Record<string, Record<string, any>> = {
  sync: {},
  local: {},
};

const createStorageArea = (area: 'sync' | 'local') => ({
  get: jest.fn((keys?: string | string[] | Record<string, any> | null) => {
    return new Promise((resolve) => {
      if (keys === null || keys === undefined) {
        resolve({ ...mockStorage[area] });
      } else if (typeof keys === 'string') {
        resolve({ [keys]: mockStorage[area][keys] });
      } else if (Array.isArray(keys)) {
        const result: Record<string, any> = {};
        keys.forEach((k) => {
          if (k in mockStorage[area]) {
            result[k] = mockStorage[area][k];
          }
        });
        resolve(result);
      } else {
        const result: Record<string, any> = {};
        Object.keys(keys).forEach((k) => {
          result[k] = k in mockStorage[area] ? mockStorage[area][k] : keys[k];
        });
        resolve(result);
      }
    });
  }),
  set: jest.fn((items: Record<string, any>) => {
    return new Promise<void>((resolve) => {
      Object.assign(mockStorage[area], items);
      resolve();
    });
  }),
  remove: jest.fn((keys: string | string[]) => {
    return new Promise<void>((resolve) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach((k) => delete mockStorage[area][k]);
      resolve();
    });
  }),
  clear: jest.fn(() => {
    return new Promise<void>((resolve) => {
      mockStorage[area] = {};
      resolve();
    });
  }),
});

const mockAlarms: Record<string, chrome.alarms.Alarm> = {};
const alarmListeners: ((alarm: chrome.alarms.Alarm) => void)[] = [];

const mockTabs: chrome.tabs.Tab[] = [
  {
    id: 1,
    index: 0,
    windowId: 1,
    highlighted: true,
    active: true,
    pinned: false,
    incognito: false,
    url: 'https://example.com',
    title: 'Example',
    favIconUrl: 'https://example.com/favicon.ico',
  } as chrome.tabs.Tab,
];

// Global chrome mock
(global as any).chrome = {
  runtime: {
    sendMessage: jest.fn((message: any) => Promise.resolve({})),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
    },
    onStartup: {
      addListener: jest.fn(),
    },
    openOptionsPage: jest.fn(),
    getURL: jest.fn((path: string) => `chrome-extension://mock-id/${path}`),
    id: 'mock-extension-id',
  },

  storage: {
    sync: createStorageArea('sync'),
    local: createStorageArea('local'),
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },

  tabs: {
    query: jest.fn((queryInfo?: chrome.tabs.QueryInfo) => {
      return new Promise((resolve) => {
        let results = [...mockTabs];
        if (queryInfo?.active) {
          results = results.filter((t) => t.active);
        }
        if (queryInfo?.currentWindow) {
          results = results.filter((t) => t.windowId === 1);
        }
        resolve(results);
      });
    }),
    get: jest.fn((tabId: number) => {
      return new Promise((resolve, reject) => {
        const tab = mockTabs.find((t) => t.id === tabId);
        if (tab) {
          resolve(tab);
        } else {
          reject(new Error(`Tab ${tabId} not found`));
        }
      });
    }),
    onCreated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },

  alarms: {
    create: jest.fn((name: string, alarmInfo: chrome.alarms.AlarmCreateInfo) => {
      mockAlarms[name] = {
        name,
        scheduledTime: Date.now() + (alarmInfo.delayInMinutes || 0) * 60000,
        periodInMinutes: alarmInfo.periodInMinutes,
      };
    }),
    get: jest.fn((name: string) => {
      return new Promise((resolve) => {
        resolve(mockAlarms[name] || null);
      });
    }),
    clear: jest.fn((name: string) => {
      return new Promise((resolve) => {
        delete mockAlarms[name];
        resolve(true);
      });
    }),
    onAlarm: {
      addListener: jest.fn((callback: (alarm: chrome.alarms.Alarm) => void) => {
        alarmListeners.push(callback);
      }),
      removeListener: jest.fn(),
    },
  },

  debugger: {
    attach: jest.fn(() => Promise.resolve()),
    detach: jest.fn(() => Promise.resolve()),
    sendCommand: jest.fn(() => Promise.resolve({})),
    onEvent: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onDetach: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },

  action: {
    setBadgeText: jest.fn(() => Promise.resolve()),
    setBadgeBackgroundColor: jest.fn(() => Promise.resolve()),
    setIcon: jest.fn(() => Promise.resolve()),
  },
};

// Helper to reset all mocks between tests
export function resetChromeMocks() {
  mockStorage.sync = {};
  mockStorage.local = {};
  Object.keys(mockAlarms).forEach((k) => delete mockAlarms[k]);
  alarmListeners.length = 0;

  // Reset all jest mocks
  jest.clearAllMocks();
}

// Helper to add mock tabs
export function addMockTab(tab: Partial<chrome.tabs.Tab>) {
  const newTab: chrome.tabs.Tab = {
    id: mockTabs.length + 1,
    index: mockTabs.length,
    windowId: 1,
    highlighted: false,
    active: false,
    pinned: false,
    incognito: false,
    ...tab,
  } as chrome.tabs.Tab;
  mockTabs.push(newTab);
  return newTab;
}

// Helper to trigger alarm
export function triggerAlarm(name: string) {
  const alarm = mockAlarms[name];
  if (alarm) {
    alarmListeners.forEach((listener) => listener(alarm));
  }
}

// Helper to set storage values
export function setStorageValue(area: 'sync' | 'local', key: string, value: any) {
  mockStorage[area][key] = value;
}

// Helper to get storage values
export function getStorageValue(area: 'sync' | 'local', key: string) {
  return mockStorage[area][key];
}

// Mock fetch for Supabase tests
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as Response)
);

// Mock navigator.storage
Object.defineProperty(navigator, 'storage', {
  value: {
    estimate: jest.fn(() =>
      Promise.resolve({
        usage: 1024 * 1024 * 50, // 50MB
        quota: 1024 * 1024 * 1024, // 1GB
      })
    ),
  },
  writable: true,
});

// Reset before each test
beforeEach(() => {
  resetChromeMocks();
  (global.fetch as jest.Mock).mockClear();
});
