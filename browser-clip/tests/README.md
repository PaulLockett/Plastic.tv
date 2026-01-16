# Browser Clip Test Suite

Comprehensive testing infrastructure for the Browser Clip Chrome extension, featuring unit tests, integration tests, E2E tests with Browserbase, and AI-powered UX tests using Stagehand.

## Test Architecture

```
tests/
├── unit/                    # Unit tests (Jest)
│   ├── lib/                 # Core library tests
│   │   ├── db.test.ts       # IndexedDB wrapper
│   │   ├── har-builder.test.ts
│   │   ├── sanitizer.test.ts
│   │   └── supabase.test.ts
│   └── utils/               # Utility function tests
│       ├── format.test.ts
│       └── tab-utils.test.ts
├── integration/             # Integration tests (Jest)
│   └── capture-flow.test.ts # End-to-end capture workflow
├── e2e/                     # E2E tests (Playwright)
│   └── extension.spec.ts    # Browser extension tests
├── ai-agent/                # AI-powered tests (Stagehand)
│   ├── stagehand-helper.ts  # Stagehand test utilities
│   ├── persona-tests.ts     # Persona-based test scenarios
│   └── run-ai-tests.ts      # AI test runner
├── fixtures/                # Test fixtures and data
└── helpers/                 # Shared test utilities
    ├── setup.ts             # Jest setup with Chrome API mocks
    └── browserbase.ts       # Browserbase test helpers
```

## Quick Start

### 1. Install Dependencies

```bash
cd browser-clip
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Run Tests

```bash
# Run all unit and integration tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run E2E tests (local Chrome)
npm run test:e2e

# Run E2E tests (Browserbase cloud)
npm run test:e2e:browserbase

# Run AI agent tests
npm run test:ai

# Run all tests
npm run test:all
```

## Test Types

### Unit Tests

Fast, isolated tests for individual functions and modules. Uses Jest with mocked Chrome APIs and fake-indexeddb.

```bash
npm run test:unit
```

**Coverage:**
- `lib/db.js` - IndexedDB operations, CRUD, cleanup
- `lib/har-builder.js` - HAR format generation
- `lib/sanitizer.js` - Sensitive data redaction
- `lib/supabase.js` - Cloud upload functionality
- `utils/format.js` - Formatting utilities
- `utils/tab-utils.js` - Tab manipulation helpers

### Integration Tests

Tests that verify multiple modules working together correctly.

```bash
npm run test:integration
```

**Coverage:**
- Capture → Storage → Export flow
- Multi-tab capture scenarios
- Buffer management and cleanup
- HAR export with sanitization

### E2E Tests

Full browser tests using Playwright with the extension loaded.

```bash
# Local Chrome with extension
npm run test:e2e

# Browserbase cloud browser
BROWSERBASE_ENABLED=true npm run test:e2e
```

**Coverage:**
- Extension loading and installation
- Popup UI interactions
- Options page functionality
- Network capture verification
- Pause/Resume functionality

### AI Agent Tests

AI-powered tests using Browserbase Stagehand to verify UX with different user personas.

```bash
# Run all AI tests
npm run test:ai

# Run tests for specific persona
npm run test:ai -- --persona developer

# Run specific scenario
npm run test:ai -- --scenario "First-time setup"

# Run with Browserbase cloud
npm run test:ai -- --browserbase
```

**Personas:**
- `developer` - Technical user debugging APIs
- `qaEngineer` - QA documenting bugs
- `newUser` - First-time user with minimal technical background
- `securityAnalyst` - Security professional capturing traffic

## Browserbase Setup

### 1. Create Account

Sign up at [browserbase.com](https://www.browserbase.com) and get your API key.

### 2. Configure Environment

```bash
BROWSERBASE_API_KEY=your_api_key
BROWSERBASE_PROJECT_ID=your_project_id
```

### 3. Upload Extension

```bash
npm run upload:extension
```

This packages the extension and uploads it to Browserbase for cloud testing.

### 4. Run Cloud Tests

```bash
BROWSERBASE_ENABLED=true npm run test:e2e
```

## AI Agent Testing

### Overview

AI agent tests use Stagehand to simulate real users interacting with the extension. Each test:

1. Creates an AI agent with a specific persona
2. Gives it natural language instructions
3. Lets it explore and interact with the extension
4. Verifies expected outcomes were achieved

### Running AI Tests

```bash
# All scenarios
npm run test:ai

# Specific persona
npm run test:ai -- --persona newUser

# Specific scenario
npm run test:ai -- --scenario "First-time setup"

# Verbose output
npm run test:ai -- --verbose

# Save report to file
npm run test:ai -- --output test-report.txt

# Use Browserbase cloud
npm run test:ai -- --browserbase
```

### Adding New Scenarios

Create new scenarios in `tests/ai-agent/persona-tests.ts`:

```typescript
const MY_TEST: TestScenario = {
  name: 'Descriptive test name',
  description: 'What the user is trying to accomplish',
  persona: PERSONAS.developer, // or newUser, qaEngineer, securityAnalyst
  instructions: `
    Natural language instructions for the AI agent.
    Be specific about what actions to take.
    Include context about what to look for.
  `,
  expectedOutcomes: [
    'First expected outcome',
    'Second expected outcome',
    'Third expected outcome'
  ],
  maxSteps: 20,     // Optional: max agent steps
  timeout: 120000   // Optional: timeout in ms
};
```

### Personas

Each persona has:
- **Name**: Friendly identifier
- **Technical Level**: beginner, intermediate, advanced
- **Background**: Context about the user
- **Goals**: What they typically want to accomplish

Personas help the AI agent behave realistically and expose UX issues that affect specific user types.

## Configuration Files

### jest.config.js

Jest configuration for unit and integration tests. Includes:
- ES modules support
- Chrome API mocking
- Coverage reporting
- Path aliases

### playwright.config.ts

Playwright configuration for E2E tests. Includes:
- Local Chrome with extension loading
- Browserbase cloud connection
- Screenshot and video capture
- HTML and JSON reporters

### tsconfig.json / tsconfig.test.json

TypeScript configuration for type checking and test compilation.

## Test Utilities

### Chrome API Mocks (`tests/helpers/setup.ts`)

Provides mocked Chrome extension APIs:
- `chrome.storage` (sync and local)
- `chrome.tabs`
- `chrome.alarms`
- `chrome.debugger`
- `chrome.action`

Helper functions:
- `resetChromeMocks()` - Reset all mocks
- `addMockTab()` - Add a mock tab
- `triggerAlarm()` - Trigger an alarm
- `setStorageValue()` - Set storage value
- `getStorageValue()` - Get storage value

### Browserbase Helpers (`tests/helpers/browserbase.ts`)

Utilities for Browserbase testing:
- `uploadExtension()` - Package and upload extension
- `createBrowserbaseSession()` - Create cloud session
- `connectToBrowserbase()` - Connect Playwright
- `generateTestTraffic()` - Create test HTTP traffic
- `verifyExtensionCapturing()` - Verify capture is working

## Continuous Integration

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:unit

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install chromium
      - run: npm run test:e2e

  browserbase-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run upload:extension
      - run: npm run test:e2e:browserbase
        env:
          BROWSERBASE_API_KEY: ${{ secrets.BROWSERBASE_API_KEY }}
          BROWSERBASE_PROJECT_ID: ${{ secrets.BROWSERBASE_PROJECT_ID }}
          BROWSERBASE_ENABLED: true
```

## Troubleshooting

### Tests hang or timeout

- Ensure Chrome is installed for local E2E tests
- Check Browserbase API key is valid
- Increase timeout values in config

### Extension not loading

- Verify manifest.json is valid
- Check extension path in playwright config
- For Browserbase, ensure extension was uploaded

### AI tests fail

- Verify GOOGLE_API_KEY is set (for Gemini models)
- Check Stagehand version compatibility
- Review agent output for specific failures

### IndexedDB tests fail

- Ensure fake-indexeddb is installed
- Check setup.ts is imported correctly

## Contributing

When adding new tests:

1. Follow existing patterns for consistency
2. Add appropriate test descriptions
3. Use meaningful assertions
4. Update this README if adding new test types
5. Ensure tests pass locally before committing
