/**
 * End-to-End Tests for Browser Clip Extension
 *
 * These tests run against a real browser (local or Browserbase)
 * with the extension loaded.
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extension paths
const EXTENSION_PATH = path.resolve(__dirname, '../../');

// Test fixtures
let extensionId: string;

test.describe('Browser Clip Extension E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ }, testInfo) => {
    // For local testing, extension is loaded via launch args in playwright config
    // For Browserbase, extension ID comes from upload process
    if (process.env.BROWSERBASE_EXTENSION_ID) {
      extensionId = process.env.BROWSERBASE_EXTENSION_ID;
    }
  });

  test.describe('Extension Loading', () => {
    test('extension should be installed and active', async ({ context }) => {
      // Navigate to extensions page
      const page = await context.newPage();
      await page.goto('chrome://extensions');

      // Look for Browser Clip in the list
      await expect(page.locator('text=Browser Clip')).toBeVisible({ timeout: 10000 });

      await page.close();
    });

    test('extension popup should open', async ({ context }) => {
      // Get extension ID from background page
      let backgroundPage = context.serviceWorkers()[0];
      if (!backgroundPage) {
        // Wait for service worker to be available
        backgroundPage = await context.waitForEvent('serviceworker');
      }

      const extId = backgroundPage.url().split('/')[2];
      extensionId = extId;

      // Open popup
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extId}/popup/popup.html`);

      // Verify popup content
      await expect(popup.locator('.status-indicator')).toBeVisible();
      await expect(popup.locator('.save-btn')).toBeVisible();

      await popup.close();
    });

    test('extension options page should open', async ({ context }) => {
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
    test('should capture HTTP requests', async ({ context }) => {
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
    let popup: Page;

    test.beforeEach(async ({ context }) => {
      popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    });

    test.afterEach(async () => {
      await popup.close();
    });

    test('should display recording status', async () => {
      await expect(popup.locator('.status-indicator.recording')).toBeVisible();
      await expect(popup.locator('.status-text')).toContainText('Recording');
    });

    test('should have time selection buttons', async () => {
      await expect(popup.locator('[data-time="1m"]')).toBeVisible();
      await expect(popup.locator('[data-time="5m"]')).toBeVisible();
      await expect(popup.locator('[data-time="15m"]')).toBeVisible();
      await expect(popup.locator('[data-time="30m"]')).toBeVisible();
      await expect(popup.locator('[data-time="1hr"]')).toBeVisible();
      await expect(popup.locator('[data-time="custom"]')).toBeVisible();
    });

    test('should select time range when clicking button', async () => {
      const timeBtn = popup.locator('[data-time="5m"]');
      await timeBtn.click();

      await expect(timeBtn).toHaveClass(/selected/);
    });

    test('should show custom picker when clicking custom', async () => {
      await popup.locator('[data-time="custom"]').click();

      await expect(popup.locator('#custom-picker')).toBeVisible();
      await expect(popup.locator('#custom-start')).toBeVisible();
      await expect(popup.locator('#custom-end')).toBeVisible();
    });

    test('should have scope selection options', async () => {
      await expect(popup.locator('input[value="currentTab"]')).toBeVisible();
      await expect(popup.locator('input[value="selectTabs"]')).toBeVisible();
      await expect(popup.locator('input[value="allTabs"]')).toBeVisible();
    });

    test('should show tab selector when selecting "Select tabs"', async () => {
      await popup.locator('input[value="selectTabs"]').click();

      await expect(popup.locator('#tab-selector')).toBeVisible();
    });

    test('should enable save button after selecting time', async () => {
      // Initially disabled
      await expect(popup.locator('#save-btn')).toBeDisabled();

      // Select time
      await popup.locator('[data-time="1m"]').click();

      // Should be enabled
      await expect(popup.locator('#save-btn')).toBeEnabled();
    });

    test('should show settings link', async () => {
      await expect(popup.locator('#settings-link')).toBeVisible();
    });
  });

  test.describe('Options Page', () => {
    let options: Page;

    test.beforeEach(async ({ context }) => {
      options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options/options.html`);
    });

    test.afterEach(async () => {
      await options.close();
    });

    test('should have Supabase configuration section', async () => {
      await expect(options.locator('#supabase-url')).toBeVisible();
      await expect(options.locator('#supabase-key')).toBeVisible();
      await expect(options.locator('#test-connection')).toBeVisible();
      await expect(options.locator('#save-supabase')).toBeVisible();
    });

    test('should have storage cap dropdown', async () => {
      const dropdown = options.locator('#storage-cap');
      await expect(dropdown).toBeVisible();

      // Check options
      const options100 = dropdown.locator('option[value="100MB"]');
      const options500 = dropdown.locator('option[value="500MB"]');
      const options1GB = dropdown.locator('option[value="1GB"]');

      await expect(options100).toBeAttached();
      await expect(options500).toBeAttached();
      await expect(options1GB).toBeAttached();
    });

    test('should have storage info display', async () => {
      await expect(options.locator('#current-usage')).toBeVisible();
      await expect(options.locator('#buffer-duration')).toBeVisible();
      await expect(options.locator('#total-entries')).toBeVisible();
    });

    test('should have clear buffer button', async () => {
      await expect(options.locator('#clear-buffer')).toBeVisible();
    });

    test('should show confirmation modal when clearing buffer', async () => {
      await options.locator('#clear-buffer').click();

      await expect(options.locator('#clear-modal')).toBeVisible();
      await expect(options.locator('#cancel-clear')).toBeVisible();
      await expect(options.locator('#confirm-clear')).toBeVisible();
    });

    test('should have capture control section', async () => {
      await expect(options.locator('#pause-capture')).toBeVisible();
    });

    test('should have sanitization settings', async () => {
      await expect(options.locator('#sanitize-url-params')).toBeVisible();
      await expect(options.locator('#custom-patterns')).toBeVisible();
    });
  });

  test.describe('Pause/Resume Functionality', () => {
    test('should show paused state in popup when paused', async ({ context }) => {
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
    test('should show error when Supabase not configured', async ({ context }) => {
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
test.describe('Browserbase Cloud Tests', () => {
  test.skip(process.env.BROWSERBASE_ENABLED !== 'true', 'Browserbase not enabled');

  test('should capture in cloud browser environment', async ({ context }) => {
    const page = await context.newPage();

    // Generate diverse traffic
    await page.goto('https://www.example.com');
    await page.waitForLoadState('networkidle');

    await page.goto('https://httpbin.org/anything');
    await page.waitForLoadState('networkidle');

    // The extension should be capturing
    await page.waitForTimeout(3000);

    // Verify via popup
    if (extensionId) {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

      const bufferSize = await popup.locator('#buffer-size').textContent();
      expect(bufferSize).not.toBe('--');

      await popup.close();
    }

    await page.close();
  });
});
