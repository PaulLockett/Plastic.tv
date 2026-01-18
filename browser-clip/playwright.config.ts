import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

const useBrowserbase = process.env.BROWSERBASE_ENABLED === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Extension tests need sequential execution
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for extension testing
  reporter: [
    ['html', { outputFolder: 'test-results/html' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],
  outputDir: 'test-results/artifacts',

  use: {
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'local-chromium',
      use: {
        // Extension tests use custom launchPersistentContext in the test file
        // No launchOptions needed here
      },
      testIgnore: useBrowserbase ? ['**/*'] : [],
    },
    {
      name: 'browserbase',
      use: {
        // Browserbase connection configured via connectOverCDP
        connectOptions: {
          wsEndpoint: process.env.BROWSERBASE_WS_ENDPOINT || '',
        },
      },
      testIgnore: useBrowserbase ? [] : ['**/*'],
    },
  ],

  // Global timeout - adequate for Browserbase connection and extension loading
  timeout: 90000, // 90s to allow for session creation and extension loading
  expect: {
    timeout: 10000,
  },
});
