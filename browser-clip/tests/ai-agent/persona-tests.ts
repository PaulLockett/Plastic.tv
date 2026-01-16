/**
 * AI Persona-Based UX Tests
 *
 * These tests verify that users with different backgrounds and technical levels
 * can successfully use Browser Clip. Each test gives the AI agent a persona and
 * a task, then evaluates whether they can complete it.
 */

import {
  TestScenario,
  PERSONAS,
  Persona
} from './stagehand-helper.js';

/**
 * Developer Persona Tests
 *
 * Tests for technical users who want to debug API issues
 */
export const DEVELOPER_TESTS: TestScenario[] = [
  {
    name: 'Developer: Debug API Issue',
    description: 'Capture network traffic while investigating a failing API call',
    persona: PERSONAS.developer,
    instructions: `
You are debugging an issue where an API call is failing intermittently.
You want to capture network traffic to analyze the failing requests.

Tasks:
1. First, browse to a test site like httpbin.org to generate some traffic
2. Make a few API calls by navigating to different endpoints
3. Open the Browser Clip popup
4. Select a 5-minute time range to capture recent activity
5. Ensure you're capturing from the current tab only
6. Attempt to save the clip (expect an error since Supabase isn't configured)
7. Note the error message - this is expected behavior

Think about:
- Is the UI intuitive for someone familiar with dev tools?
- Are the time presets useful for debugging scenarios?
- Is it clear what data will be captured?
    `,
    expectedOutcomes: [
      'Generated test network traffic',
      'Opened extension popup successfully',
      'Selected 5-minute time range',
      'Attempted to save clip',
      'Observed the expected error message'
    ]
  },
  {
    name: 'Developer: Configure Extension',
    description: 'Set up the extension for first use',
    persona: PERSONAS.developer,
    instructions: `
You just installed Browser Clip and want to configure it for your workflow.

Tasks:
1. Open the extension options/settings page
2. Review all available settings
3. Change the storage cap to 1GB (you have a fast machine)
4. Enable URL parameter sanitization
5. Check if there's a way to add custom header patterns to sanitize
6. Look for any debug or advanced settings
7. Understand what data is captured and stored

Think about:
- Are the settings well-organized?
- Is it clear what each setting does?
- Are there any settings missing that you'd expect?
    `,
    expectedOutcomes: [
      'Found and opened settings page',
      'Changed storage cap to 1GB',
      'Found URL parameter sanitization toggle',
      'Found custom header patterns field',
      'Understood the storage and capture settings'
    ]
  },
  {
    name: 'Developer: Multi-Tab Capture',
    description: 'Capture traffic from multiple related tabs',
    persona: PERSONAS.developer,
    instructions: `
You're testing a web app that spans multiple tabs (frontend + API console).
You need to capture traffic from both tabs.

Tasks:
1. Open multiple tabs with different URLs
2. Open the Browser Clip popup
3. Select a time range
4. Choose "Select tabs..." for the scope
5. See if you can select multiple tabs
6. Alternatively, try "All tabs" option
7. Understand how tab filtering works

Think about:
- Is it easy to select specific tabs?
- Is the tab list clear and identifiable?
- Would you know which tabs contain relevant traffic?
    `,
    expectedOutcomes: [
      'Opened multiple tabs',
      'Found the tab selection interface',
      'Understood how to select specific tabs',
      'Identified the "All tabs" option'
    ]
  }
];

/**
 * QA Engineer Persona Tests
 *
 * Tests for QA users who need to document bugs with network evidence
 */
export const QA_ENGINEER_TESTS: TestScenario[] = [
  {
    name: 'QA: Bug Documentation Workflow',
    description: 'Capture evidence while reproducing a bug',
    persona: PERSONAS.qaEngineer,
    instructions: `
You need to document a bug you found. The steps are:
1. Reproduce the bug (simulate by browsing some pages)
2. Capture the network traffic that shows the issue
3. Export it to attach to your bug ticket

Tasks:
1. Browse to a few pages to simulate bug reproduction
2. Open Browser Clip popup
3. Select appropriate time range (try 1 minute for recent activity)
4. Keep scope as current tab
5. Try to give the clip a descriptive name
6. Attempt to save (expect error without Supabase)

Think about:
- Is the workflow efficient for bug documentation?
- Can you easily capture just what you need?
- Is naming clips intuitive?
    `,
    expectedOutcomes: [
      'Navigated and generated traffic',
      'Opened popup and selected time range',
      'Found clip name input field',
      'Understood the save workflow'
    ]
  },
  {
    name: 'QA: Understand Buffer Status',
    description: 'Monitor what has been captured',
    persona: PERSONAS.qaEngineer,
    instructions: `
You want to understand what traffic has been captured before creating a clip.

Tasks:
1. Open the Browser Clip popup
2. Look for information about what's in the buffer
3. Find how much time is covered
4. Find how much storage is being used
5. Understand if you can see a preview of captured data

Think about:
- Is buffer status clearly displayed?
- Do you know if your traffic is being captured?
- Would you know when to create a clip?
    `,
    expectedOutcomes: [
      'Found buffer time information',
      'Found buffer size/storage information',
      'Understood the recording status indicator',
      'Located relevant status information'
    ]
  }
];

/**
 * New User Persona Tests
 *
 * Tests for users with minimal technical background
 */
export const NEW_USER_TESTS: TestScenario[] = [
  {
    name: 'New User: First Experience',
    description: 'Discover what the extension does without prior knowledge',
    persona: PERSONAS.newUser,
    instructions: `
You just installed this extension because someone recommended it, but you don't
really know what it does. Explore it to understand its purpose.

Tasks:
1. Look at the extension icon in the toolbar
2. Click it to open the popup
3. Try to understand what "Recording" means
4. Look at the buffer information
5. See what time options are available
6. Click on Settings to learn more
7. Read any descriptions or labels to understand features

Think about:
- Is it clear what this extension does?
- Are the terms understandable for non-technical users?
- Would you know how to use it after exploring?
    `,
    expectedOutcomes: [
      'Opened the popup successfully',
      'Noticed the recording indicator',
      'Explored the time selection options',
      'Found and opened settings',
      'Gained basic understanding of the extension purpose'
    ]
  },
  {
    name: 'New User: Follow Basic Instructions',
    description: 'Complete a task with minimal guidance',
    persona: PERSONAS.newUser,
    instructions: `
Your colleague told you: "Use Browser Clip to save the last 5 minutes of
network activity from the page you're on."

Try to follow this instruction using the extension.

Tasks:
1. Open the Browser Clip popup
2. Find where to select "5 minutes"
3. Make sure it will save from the current page/tab
4. Find the save button
5. Click to save

Think about:
- Were you able to follow the instruction?
- Was anything confusing or unclear?
- Did the UI guide you to the right actions?
    `,
    expectedOutcomes: [
      'Found the 5 minute option',
      'Understood current tab is selected by default',
      'Found and clicked the save button',
      'Received feedback about the action'
    ]
  }
];

/**
 * Security Analyst Persona Tests
 *
 * Tests for security professionals who need comprehensive captures
 */
export const SECURITY_ANALYST_TESTS: TestScenario[] = [
  {
    name: 'Security: Comprehensive Capture',
    description: 'Set up for complete network traffic capture',
    persona: PERSONAS.securityAnalyst,
    instructions: `
You're investigating potential data exfiltration. You need to capture
ALL network traffic across ALL browser tabs for analysis.

Tasks:
1. Open Browser Clip settings
2. Set storage cap to maximum (2GB if available)
3. Check sanitization settings - you may want to KEEP auth headers for analysis
4. Go to popup
5. Select maximum time range available
6. Set scope to "All tabs"
7. Attempt to save

Think about:
- Can you configure for maximum capture?
- Are sanitization options flexible enough?
- Can you easily capture everything?
    `,
    expectedOutcomes: [
      'Found and changed storage cap',
      'Located sanitization settings',
      'Selected longest time range',
      'Set scope to all tabs',
      'Understood the capture coverage'
    ]
  },
  {
    name: 'Security: Verify Data Sanitization',
    description: 'Understand what sensitive data is redacted',
    persona: PERSONAS.securityAnalyst,
    instructions: `
Before sharing captures with the team, you need to understand exactly
what data gets sanitized/redacted.

Tasks:
1. Open Browser Clip settings
2. Find the sanitization section
3. Review default patterns that are redacted
4. Check if URL parameters are sanitized
5. Look for custom pattern options
6. Understand the implications for your use case

Think about:
- Is it clear what gets redacted?
- Can you customize sanitization?
- Would you trust this for sensitive data?
    `,
    expectedOutcomes: [
      'Found sanitization settings section',
      'Found URL parameter sanitization toggle',
      'Found custom pattern input',
      'Understood default redaction behavior'
    ]
  }
];

/**
 * All persona tests combined
 */
export const ALL_PERSONA_TESTS: TestScenario[] = [
  ...DEVELOPER_TESTS,
  ...QA_ENGINEER_TESTS,
  ...NEW_USER_TESTS,
  ...SECURITY_ANALYST_TESTS
];

/**
 * Get tests for a specific persona
 */
export function getTestsForPersona(personaKey: string): TestScenario[] {
  const persona = PERSONAS[personaKey];
  if (!persona) {
    throw new Error(`Unknown persona: ${personaKey}`);
  }

  return ALL_PERSONA_TESTS.filter(test => test.persona.name === persona.name);
}

/**
 * Critical path tests - minimum tests to verify basic functionality
 */
export const CRITICAL_PATH_TESTS: TestScenario[] = [
  NEW_USER_TESTS[0],  // First Experience
  DEVELOPER_TESTS[0], // Debug API Issue
  QA_ENGINEER_TESTS[0] // Bug Documentation
];
