/**
 * End-to-End Tests for Browser Clip Extension
 *
 * These tests run against a real browser with the extension loaded.
 * Chrome extensions require launchPersistentContext to work properly.
 * Browserbase tests connect via CDP to a cloud browser session.
 */

import { test as base, expect, chromium, BrowserContext, Browser } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as os from 'os';
import {
  setupBrowserbaseWithExtension,
  cleanupBrowserbaseSession
} from '../helpers/browserbase.js';

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extension path - resolve to the browser-clip root
const EXTENSION_PATH = path.resolve(__dirname, '../../');

// Check if running in Browserbase mode
const useBrowserbase = process.env.BROWSERBASE_ENABLED === 'true';

// Custom test fixture that provides a persistent context with extension loaded
type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
};

// Browserbase fixture state (shared across tests in the session)
let browserbaseSession: {
  browser: Browser;
  context: BrowserContext;
  extensionId: string;
  sessionId: string;
} | null = null;

// Create custom test with extension fixtures
const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    if (useBrowserbase) {
      // Use Browserbase cloud browser
      if (!browserbaseSession) {
        console.log('Setting up Browserbase session with extension...');
        const setup = await setupBrowserbaseWithExtension(EXTENSION_PATH);
        browserbaseSession = {
          browser: setup.browser,
          context: setup.context,
          extensionId: setup.extensionId,
          sessionId: setup.session.sessionId
        };
      }
      await use(browserbaseSession.context);
    } else {
      // Create a temporary user data directory for local testing
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-clip-test-'));

      // Launch browser with persistent context (required for extensions)
      const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          `--disable-extensions-except=${EXTENSION_PATH}`,
          `--load-extension=${EXTENSION_PATH}`,
          '--no-first-run',
          '--disable-default-apps',
          '--disable-gpu',
          '--disable-dev-shm-usage',
        ],
      });

      await use(context);

      // Cleanup
      await context.close();
      // Clean up temp directory
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  },
  extensionId: async ({ context }, use) => {
    if (useBrowserbase && browserbaseSession) {
      // Use extension ID from Browserbase upload
      await use(browserbaseSession.extensionId);
    } else {
      // Wait for service worker and extract extension ID (local mode)
      let serviceWorker = context.serviceWorkers()[0];
      if (!serviceWorker) {
        serviceWorker = await context.waitForEvent('serviceworker', { timeout: 30000 });
      }
      const extensionId = serviceWorker.url().split('/')[2];
      await use(extensionId);
    }
  },
});

// Cleanup Browserbase session after all tests
test.afterAll(async () => {
  if (browserbaseSession) {
    console.log('Cleaning up Browserbase session...');
    await cleanupBrowserbaseSession(browserbaseSession.browser, browserbaseSession.sessionId);
    browserbaseSession = null;
  }
});

// Skip local tests if in Browserbase mode - run only Browserbase-specific tests
const skipIfBrowserbase = useBrowserbase;

test.describe('Browser Clip Extension E2E', () => {
  test.skip(skipIfBrowserbase, 'Skipping local tests when Browserbase is enabled');
  test.describe.configure({ mode: 'serial' });

  test.describe('Extension Loading', () => {
    test('extension should be installed and active', async ({ context, extensionId }) => {
      // Verify we can access the extension's popup page
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      // If we can load the popup, the extension is installed
      await expect(page.locator('body')).toBeVisible();

      await page.close();
    });

    test('extension popup should open', async ({ context, extensionId }) => {
      // Open popup
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      // Verify popup content
      await expect(popup.locator('.status-indicator')).toBeVisible();
      await expect(popup.locator('.save-btn')).toBeVisible();

      await popup.close();
    });

    test('extension options page should open', async ({ context, extensionId }) => {
      const options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options/options.html`);

      // Verify options content
      await expect(options.locator('h1')).toContainText('Browser Clip Settings');
      await expect(options.locator('#supabase-url')).toBeVisible();
      await expect(options.locator('#storage-cap')).toBeVisible();

      await options.close();
    });
  });

  test.describe('Network Capture', () => {
    test('should capture HTTP requests', async ({ context, extensionId }) => {
      // Generate some traffic
      const page = await context.newPage();
      await page.goto('https://httpbin.org/get');
      await page.waitForLoadState('networkidle');

      // Make additional API call
      await page.evaluate(async () => {
        await fetch('https://httpbin.org/headers');
      });

      // Wait for capture to process
      await page.waitForTimeout(2000);

      // Check popup shows buffer data
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      // Buffer should show some time/size
      const bufferTime = await popup.locator('#buffer-time').textContent();
      expect(bufferTime).not.toBe('--');

      await popup.close();
      await page.close();
    });

    test('should capture POST requests with body', async ({ context }) => {
      const page = await context.newPage();
      await page.goto('https://httpbin.org/');

      // Make POST request
      const response = await page.evaluate(async () => {
        const res = await fetch('https://httpbin.org/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: 'data', count: 42 })
        });
        return res.json();
      });

      expect(response.json).toEqual({ test: 'data', count: 42 });

      await page.waitForTimeout(1000);
      await page.close();
    });
  });

  test.describe('Popup UI', () => {
    test('should display recording status', async ({ context, extensionId }) => {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      await expect(popup.locator('.status-indicator.recording')).toBeVisible();
      await expect(popup.locator('.status-text')).toContainText('Recording');

      await popup.close();
    });

    test('should have time selection buttons', async ({ context, extensionId }) => {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      await expect(popup.locator('[data-time="1m"]')).toBeVisible();
      await expect(popup.locator('[data-time="5m"]')).toBeVisible();
      await expect(popup.locator('[data-time="15m"]')).toBeVisible();
      await expect(popup.locator('[data-time="30m"]')).toBeVisible();
      await expect(popup.locator('[data-time="1hr"]')).toBeVisible();
      await expect(popup.locator('[data-time="custom"]')).toBeVisible();

      await popup.close();
    });

    test('should select time range when clicking button', async ({ context, extensionId }) => {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      const timeBtn = popup.locator('[data-time="5m"]');
      await timeBtn.click();

      await expect(timeBtn).toHaveClass(/selected/);

      await popup.close();
    });

    test('should show custom picker when clicking custom', async ({ context, extensionId }) => {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      await popup.locator('[data-time="custom"]').click();

      await expect(popup.locator('#custom-picker')).toBeVisible();
      await expect(popup.locator('#custom-start')).toBeVisible();
      await expect(popup.locator('#custom-end')).toBeVisible();

      await popup.close();
    });

    test('should have scope selection options', async ({ context, extensionId }) => {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      await expect(popup.locator('input[value="currentTab"]')).toBeVisible();
      await expect(popup.locator('input[value="selectTabs"]')).toBeVisible();
      await expect(popup.locator('input[value="allTabs"]')).toBeVisible();

      await popup.close();
    });

    test('should show tab selector when selecting "Select tabs"', async ({ context, extensionId }) => {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      await popup.locator('input[value="selectTabs"]').click();

      await expect(popup.locator('#tab-selector')).toBeVisible();

      await popup.close();
    });

    test('should enable save button after selecting time', async ({ context, extensionId }) => {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      // Initially disabled
      await expect(popup.locator('#save-btn')).toBeDisabled();

      // Select time
      await popup.locator('[data-time="1m"]').click();

      // Should be enabled
      await expect(popup.locator('#save-btn')).toBeEnabled();

      await popup.close();
    });

    test('should show settings link', async ({ context, extensionId }) => {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      await expect(popup.locator('#settings-link')).toBeVisible();

      await popup.close();
    });
  });

  test.describe('Options Page', () => {
    test('should have Supabase configuration section', async ({ context, extensionId }) => {
      const options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options/options.html`);

      await expect(options.locator('#supabase-url')).toBeVisible();
      await expect(options.locator('#supabase-key')).toBeVisible();
      await expect(options.locator('#test-connection')).toBeVisible();
      await expect(options.locator('#save-supabase')).toBeVisible();

      await options.close();
    });

    test('should have storage cap dropdown', async ({ context, extensionId }) => {
      const optionsPage = await context.newPage();
      await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`);

      const dropdown = optionsPage.locator('#storage-cap');
      await expect(dropdown).toBeVisible();

      // Check options
      const options100 = dropdown.locator('option[value="100MB"]');
      const options500 = dropdown.locator('option[value="500MB"]');
      const options1GB = dropdown.locator('option[value="1GB"]');

      await expect(options100).toBeAttached();
      await expect(options500).toBeAttached();
      await expect(options1GB).toBeAttached();

      await optionsPage.close();
    });

    test('should have storage info display', async ({ context, extensionId }) => {
      const options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options/options.html`);

      await expect(options.locator('#current-usage')).toBeVisible();
      await expect(options.locator('#buffer-duration')).toBeVisible();
      await expect(options.locator('#total-entries')).toBeVisible();

      await options.close();
    });

    test('should have clear buffer button', async ({ context, extensionId }) => {
      const options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options/options.html`);

      await expect(options.locator('#clear-buffer')).toBeVisible();

      await options.close();
    });

    test('should show confirmation modal when clearing buffer', async ({ context, extensionId }) => {
      const options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options/options.html`);

      await options.locator('#clear-buffer').click();

      await expect(options.locator('#clear-modal')).toBeVisible();
      await expect(options.locator('#cancel-clear')).toBeVisible();
      await expect(options.locator('#confirm-clear')).toBeVisible();

      await options.close();
    });

    test('should have capture control section', async ({ context, extensionId }) => {
      const options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options/options.html`);

      await expect(options.locator('#pause-capture')).toBeVisible();

      await options.close();
    });

    test('should have sanitization settings', async ({ context, extensionId }) => {
      const options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options/options.html`);

      await expect(options.locator('#sanitize-url-params')).toBeVisible();
      await expect(options.locator('#custom-patterns')).toBeVisible();

      await options.close();
    });
  });

  test.describe('Pause/Resume Functionality', () => {
    test('should show paused state in popup when paused', async ({ context, extensionId }) => {
      // Open options and pause
      const options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options/options.html`);

      // Click pause
      await options.locator('#pause-capture').click();

      // Confirm in modal
      await options.locator('#confirm-pause').click();

      // Wait for state change
      await options.waitForTimeout(1000);

      // Check popup shows paused state
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      await expect(popup.locator('#paused-state')).toBeVisible();
      await expect(popup.locator('#resume-btn')).toBeVisible();

      // Resume from popup
      await popup.locator('#resume-btn').click();
      await popup.waitForTimeout(1000);

      // Should show active state again
      await expect(popup.locator('#active-state')).toBeVisible();

      await options.close();
      await popup.close();
    });
  });

  test.describe('Clip Creation Flow', () => {
    test('should show error when Supabase not configured', async ({ context, extensionId }) => {
      // Generate some traffic first
      const page = await context.newPage();
      await page.goto('https://httpbin.org/get');
      await page.waitForTimeout(2000);

      // Open popup and try to save
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      // Select time and try to save
      await popup.locator('[data-time="1m"]').click();
      await popup.locator('#save-btn').click();

      // Should show error (Supabase not configured)
      await expect(popup.locator('#status-message')).toBeVisible();
      await expect(popup.locator('#status-message')).toHaveClass(/error/);

      await popup.close();
      await page.close();
    });
  });
});

// Browserbase-specific tests (only run when BROWSERBASE_ENABLED=true)
// These tests are designed to work with the cloud browser environment
test.describe('Browserbase Cloud Tests', () => {
  test.skip(process.env.BROWSERBASE_ENABLED !== 'true', 'Browserbase not enabled');

  test('should capture in cloud browser environment', async ({ context, extensionId }) => {
    const page = await context.newPage();

    // Generate diverse traffic
    await page.goto('https://www.example.com');
    await page.waitForLoadState('networkidle');

    await page.goto('https://httpbin.org/anything');
    await page.waitForLoadState('networkidle');

    // The extension should be capturing
    await page.waitForTimeout(3000);

    // Verify via popup using the extension ID from Browserbase upload
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    // Check that the popup loaded and shows buffer info
    await expect(popup.locator('.status-indicator')).toBeVisible({ timeout: 10000 });

    const bufferSize = await popup.locator('#buffer-size').textContent();
    expect(bufferSize).not.toBe('--');

    await popup.close();
    await page.close();
  });

  test('should load extension popup in Browserbase', async ({ context, extensionId }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    // Verify popup content loaded
    await expect(popup.locator('.status-indicator')).toBeVisible({ timeout: 10000 });
    await expect(popup.locator('.save-btn')).toBeVisible();

    await popup.close();
  });

  test('should load extension options in Browserbase', async ({ context, extensionId }) => {
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options/options.html`);

    // Verify options content loaded
    await expect(options.locator('h1')).toContainText('Browser Clip Settings', { timeout: 10000 });
    await expect(options.locator('#storage-cap')).toBeVisible();

    await options.close();
  });
});
