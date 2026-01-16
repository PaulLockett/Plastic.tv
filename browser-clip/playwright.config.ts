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
        ...devices['Desktop Chrome'],
        // Load extension in local mode
        launchOptions: {
          args: [
            `--disable-extensions-except=${process.cwd()}`,
            `--load-extension=${process.cwd()}`,
            '--no-first-run',
            '--disable-default-apps',
          ],
        },
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

  // Global timeout
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
});
