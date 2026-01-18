/**
 * Browserbase Test Helpers
 * Provides utilities for E2E testing with Browserbase cloud browsers
 */

import { Browserbase, toFile } from '@browserbasehq/sdk';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';

interface BrowserbaseConfig {
  apiKey: string;
  projectId: string;
}

interface SessionOptions {
  extensionId?: string;
  keepAlive?: boolean;
  timeout?: number;
}

interface BrowserbaseSession {
  sessionId: string;
  wsEndpoint: string;
  debuggerUrl?: string;
}

/**
 * Get Browserbase configuration from environment
 */
export function getBrowserbaseConfig(): BrowserbaseConfig {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;

  if (!apiKey) {
    throw new Error('BROWSERBASE_API_KEY environment variable is required');
  }
  if (!projectId) {
    throw new Error('BROWSERBASE_PROJECT_ID environment variable is required');
  }

  return { apiKey, projectId };
}

/**
 * Create Browserbase SDK client
 */
export function createBrowserbaseClient(): Browserbase {
  const { apiKey } = getBrowserbaseConfig();
  return new Browserbase({ apiKey });
}

/**
 * Package extension as ZIP for upload
 */
export async function packageExtension(extensionPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    // Add extension files
    archive.directory(extensionPath, false);
    archive.finalize();
  });
}

/**
 * Upload extension to Browserbase
 */
export async function uploadExtension(extensionPath: string): Promise<string> {
  const bb = createBrowserbaseClient();

  console.log('Packaging extension...');
  const zipBuffer = await packageExtension(extensionPath);

  console.log('Uploading extension to Browserbase...');
  const file = await toFile(zipBuffer, 'extension.zip', { type: 'application/zip' });
  const extension = await bb.extensions.create({ file });

  console.log(`Extension uploaded with ID: ${extension.id}`);
  return extension.id;
}

/**
 * Create a Browserbase session with the extension loaded
 */
export async function createBrowserbaseSession(
  options: SessionOptions = {}
): Promise<BrowserbaseSession> {
  const bb = createBrowserbaseClient();
  const { projectId } = getBrowserbaseConfig();

  const sessionConfig: any = {
    projectId,
    keepAlive: options.keepAlive ?? false
  };

  if (options.extensionId) {
    sessionConfig.extensionId = options.extensionId;
  }

  console.log('Creating Browserbase session...');
  const session = await bb.sessions.create(sessionConfig);

  // Use the connectUrl directly from the session object
  const wsEndpoint = session.connectUrl;

  if (!wsEndpoint) {
    throw new Error('Session connectUrl not available');
  }

  console.log(`Session created: ${session.id}`);
  console.log(`Status: ${session.status}`);

  return {
    sessionId: session.id,
    wsEndpoint,
    debuggerUrl: undefined
  };
}

/**
 * Connect to Browserbase session with Playwright
 */
export async function connectToBrowserbase(
  session: BrowserbaseSession
): Promise<{ browser: Browser; context: BrowserContext }> {
  console.log('Connecting to Browserbase session...');

  const browser = await chromium.connectOverCDP(session.wsEndpoint);
  const contexts = browser.contexts();
  const context = contexts[0] || await browser.newContext();

  return { browser, context };
}

/**
 * Full setup: upload extension and create session
 */
export async function setupBrowserbaseWithExtension(
  extensionPath: string
): Promise<{
  session: BrowserbaseSession;
  browser: Browser;
  context: BrowserContext;
  extensionId: string;
  chromeExtensionId?: string;
}> {
  // Upload extension to Browserbase
  const uploadedExtensionId = await uploadExtension(extensionPath);

  // Wait a bit for extension to be processed
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Create session with extension
  const session = await createBrowserbaseSession({ extensionId: uploadedExtensionId });

  // Connect with Playwright
  console.log('Connecting to browser...');
  const { browser, context } = await connectToBrowserbase(session);
  console.log('Connected to browser successfully');

  // Wait for extension to load and try to get Chrome extension ID
  console.log('Waiting for extension to load...');

  let chromeExtensionId: string | undefined;

  // Try multiple times to detect the service worker (extensions can be slow to start)
  for (let attempt = 1; attempt <= 5; attempt++) {
    console.log(`Attempt ${attempt}/5: Checking for service workers...`);

    const serviceWorkers = context.serviceWorkers();
    console.log(`Found ${serviceWorkers.length} service workers`);

    if (serviceWorkers.length > 0) {
      chromeExtensionId = serviceWorkers[0].url().split('/')[2];
      console.log(`✓ Extension loaded with Chrome ID: ${chromeExtensionId}`);
      break;
    }

    // Wait before next attempt
    if (attempt < 5) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // If no service worker found, try using CDP to get targets
  if (!chromeExtensionId) {
    console.log('No service worker found, trying CDP target detection...');
    try {
      const page = context.pages()[0] || await context.newPage();
      const client = await page.context().newCDPSession(page);

      // Get all browser targets
      const { targetInfos } = await client.send('Target.getTargets');

      // Look for extension background page or service worker
      const extensionTargets = targetInfos.filter((target: any) =>
        target.type === 'service_worker' ||
        target.type === 'background_page' ||
        target.url?.startsWith('chrome-extension://')
      );

      console.log(`Found ${extensionTargets.length} extension-related targets`);

      for (const target of extensionTargets) {
        console.log(`Target: ${target.type} - ${target.url}`);
        if (target.url?.startsWith('chrome-extension://')) {
          const match = target.url.match(/chrome-extension:\/\/([a-z]+)\//);
          if (match) {
            chromeExtensionId = match[1];
            console.log(`✓ Extension ID from CDP target: ${chromeExtensionId}`);
            break;
          }
        }
      }

      await client.detach();
    } catch (e) {
      console.log('CDP detection failed:', e);
    }
  }

  // Last resort: Try to wait for service worker event
  if (!chromeExtensionId) {
    console.log('Waiting for service worker event...');
    try {
      const serviceWorker = await Promise.race([
        context.waitForEvent('serviceworker', { timeout: 5000 }),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]);

      if (serviceWorker) {
        chromeExtensionId = serviceWorker.url().split('/')[2];
        console.log(`✓ Extension ID from service worker event: ${chromeExtensionId}`);
      }
    } catch (e) {
      console.log('Service worker event wait failed');
    }
  }

  if (!chromeExtensionId) {
    console.log('⚠ Warning: Could not detect extension ID. Extension may not be loaded.');
  }

  console.log('Setup complete');
  return { session, browser, context, extensionId: uploadedExtensionId, chromeExtensionId };
}

/**
 * Clean up Browserbase session
 */
export async function cleanupBrowserbaseSession(
  browser: Browser,
  sessionId?: string
): Promise<void> {
  try {
    await browser.close();
  } catch (e) {
    // Ignore close errors
  }

  if (sessionId) {
    try {
      const bb = createBrowserbaseClient();
      const { projectId } = getBrowserbaseConfig();
      await bb.sessions.update(sessionId, { projectId, status: 'REQUEST_RELEASE' });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Wait for extension popup to be available
 */
export async function waitForExtensionPopup(
  context: BrowserContext,
  extensionId: string,
  timeout: number = 10000
): Promise<Page> {
  const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;

  // Try to find existing popup page
  const pages = context.pages();
  for (const page of pages) {
    if (page.url().includes(extensionId)) {
      return page;
    }
  }

  // Open popup manually
  const page = await context.newPage();
  await page.goto(popupUrl, { timeout });

  return page;
}

/**
 * Wait for extension options page
 */
export async function waitForExtensionOptions(
  context: BrowserContext,
  extensionId: string,
  timeout: number = 10000
): Promise<Page> {
  const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;

  const page = await context.newPage();
  await page.goto(optionsUrl, { timeout });

  return page;
}

/**
 * Get extension ID from loaded extension
 * This queries chrome://extensions to find our extension
 */
export async function getExtensionId(page: Page): Promise<string | null> {
  await page.goto('chrome://extensions');

  // Enable developer mode to see extension IDs
  const devModeToggle = page.locator('#devMode');
  if (await devModeToggle.isVisible()) {
    await devModeToggle.click();
  }

  // Find Browser Clip extension
  const extensionCard = page.locator('extensions-item').filter({
    hasText: 'Browser Clip'
  });

  if (await extensionCard.isVisible()) {
    const id = await extensionCard.getAttribute('id');
    return id;
  }

  return null;
}

/**
 * Generate network traffic for testing
 */
export async function generateTestTraffic(page: Page): Promise<void> {
  // Make some HTTP requests
  await page.goto('https://httpbin.org/get');
  await page.waitForLoadState('networkidle');

  await page.goto('https://httpbin.org/headers');
  await page.waitForLoadState('networkidle');

  // Make an API call
  await page.evaluate(async () => {
    await fetch('https://httpbin.org/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' })
    });
  });

  // Small delay to ensure capture
  await page.waitForTimeout(1000);
}

/**
 * Verify extension is capturing
 */
export async function verifyExtensionCapturing(
  context: BrowserContext,
  extensionId: string
): Promise<boolean> {
  const popup = await waitForExtensionPopup(context, extensionId);

  // Check for recording indicator
  const recordingIndicator = popup.locator('.status-indicator.recording');
  const isRecording = await recordingIndicator.isVisible();

  // Check buffer info shows data
  const bufferTime = await popup.locator('#buffer-time').textContent();
  const hasBuffer = Boolean(bufferTime && !bufferTime.includes('--'));

  await popup.close();

  return isRecording && hasBuffer;
}
