/**
 * Browserbase Test Helpers
 * Provides utilities for E2E testing with Browserbase cloud browsers
 */

import { Browserbase } from '@browserbasehq/sdk';
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
  return new Browserbase(apiKey);
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
  const extension = await bb.extensions.create({
    file: new Blob([zipBuffer], { type: 'application/zip' })
  });

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

  // Get connection URLs
  const debugUrls = await bb.sessions.debug(session.id);

  return {
    sessionId: session.id,
    wsEndpoint: debugUrls.debuggerFullscreenUrl || debugUrls.debuggerUrl,
    debuggerUrl: debugUrls.debuggerUrl
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
}> {
  // Upload extension
  const extensionId = await uploadExtension(extensionPath);

  // Wait a bit for extension to be processed
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Create session with extension
  const session = await createBrowserbaseSession({ extensionId });

  // Connect with Playwright
  const { browser, context } = await connectToBrowserbase(session);

  return { session, browser, context, extensionId };
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
      await bb.sessions.update(sessionId, { status: 'REQUEST_RELEASE' });
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
  const hasBuffer = bufferTime && !bufferTime.includes('--');

  await popup.close();

  return isRecording && hasBuffer;
}
