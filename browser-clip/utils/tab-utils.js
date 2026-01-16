// Tab utility functions

// Get hostname from URL
export function getHostname(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

// Get all tabs across all windows
export async function getAllTabs() {
  return chrome.tabs.query({});
}

// Get current active tab
export async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

// Get tabs by hostname
export async function getTabsByHostname(hostname) {
  const allTabs = await getAllTabs();
  return allTabs.filter(tab => {
    const tabHostname = getHostname(tab.url);
    return tabHostname === hostname;
  });
}

// Get tab info for display
export function getTabInfo(tab) {
  return {
    id: tab.id,
    title: tab.title || 'Untitled',
    url: tab.url,
    hostname: getHostname(tab.url),
    favIconUrl: tab.favIconUrl || null,
    windowId: tab.windowId
  };
}

// Group tabs by hostname
export async function groupTabsByHostname() {
  const allTabs = await getAllTabs();
  const groups = {};

  for (const tab of allTabs) {
    const hostname = getHostname(tab.url);
    if (hostname) {
      if (!groups[hostname]) {
        groups[hostname] = [];
      }
      groups[hostname].push(getTabInfo(tab));
    }
  }

  return groups;
}

// Check if tab URL is capturable (not chrome://, edge://, etc.)
export function isCapturableTab(tab) {
  if (!tab || !tab.url) return false;

  const url = tab.url;
  const nonCapturableProtocols = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'devtools://',
    'chrome-devtools://'
  ];

  return !nonCapturableProtocols.some(protocol => url.startsWith(protocol));
}

// Get all capturable tabs
export async function getCapturableTabs() {
  const allTabs = await getAllTabs();
  return allTabs.filter(isCapturableTab);
}
