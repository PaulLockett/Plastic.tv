/**
 * Stagehand AI Agent Test Helper
 *
 * Provides utilities for running AI-powered tests using Browserbase Stagehand.
 * The agent can interact with the extension using natural language instructions.
 */

import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import OpenAI from 'openai';
import * as path from 'path';

// Persona definitions for different user types
export interface Persona {
  name: string;
  description: string;
  technicalLevel: 'beginner' | 'intermediate' | 'advanced';
  background: string;
  goals: string[];
}

export const PERSONAS: Record<string, Persona> = {
  developer: {
    name: 'Alex the Developer',
    description: 'A software developer who wants to debug API issues',
    technicalLevel: 'advanced',
    background: 'Full-stack developer with 5 years experience. Comfortable with dev tools but prefers efficient workflows.',
    goals: [
      'Capture network traffic while testing a web app',
      'Find specific API requests that failed',
      'Export HAR files for debugging',
      'Share network captures with teammates'
    ]
  },
  qaEngineer: {
    name: 'Sam the QA Engineer',
    description: 'A QA engineer who needs to document bugs',
    technicalLevel: 'intermediate',
    background: 'QA engineer who needs to capture network evidence when filing bug reports. Uses browser tools regularly but not an expert.',
    goals: [
      'Capture network activity when reproducing a bug',
      'Create clips of specific time periods',
      'Export evidence to attach to bug tickets',
      'Configure which data to include/exclude'
    ]
  },
  newUser: {
    name: 'Jordan the New User',
    description: 'Someone who just installed the extension',
    technicalLevel: 'beginner',
    background: 'Heard about the extension from a colleague. Not very technical but can follow instructions.',
    goals: [
      'Understand what the extension does',
      'Set up basic configuration',
      'Create their first clip',
      'Learn the basic workflow'
    ]
  },
  securityAnalyst: {
    name: 'Morgan the Security Analyst',
    description: 'A security professional investigating suspicious traffic',
    technicalLevel: 'advanced',
    background: 'Security analyst who needs to capture and analyze network traffic for security incidents.',
    goals: [
      'Capture all network activity across multiple tabs',
      'Export comprehensive HAR files',
      'Ensure sensitive data is properly sanitized',
      'Analyze captured traffic patterns'
    ]
  }
};

// Test scenario definition
export interface TestScenario {
  name: string;
  description: string;
  persona: Persona;
  instructions: string;
  expectedOutcomes: string[];
  maxSteps?: number;
  timeout?: number;
}

// Result from AI test
export interface AITestResult {
  scenario: string;
  persona: string;
  success: boolean;
  steps: AIStep[];
  outcomes: OutcomeResult[];
  duration: number;
  error?: string;
  feedback?: string;
}

export interface AIStep {
  action: string;
  observation?: string;
  success: boolean;
  timestamp: number;
}

export interface OutcomeResult {
  expected: string;
  achieved: boolean;
  evidence?: string;
}

/**
 * Create a Stagehand instance configured for testing
 */
export async function createStagehandInstance(options: {
  headless?: boolean;
  extensionPath?: string;
  browserbaseApiKey?: string;
  browserbaseProjectId?: string;
  useBrowserbase?: boolean;
}): Promise<Stagehand> {
  const config: any = {
    env: options.useBrowserbase ? 'BROWSERBASE' : 'LOCAL',
    verbose: 1,
    debugDom: true,
    enableCaching: true
  };

  if (options.useBrowserbase) {
    config.apiKey = options.browserbaseApiKey || process.env.BROWSERBASE_API_KEY;
    config.projectId = options.browserbaseProjectId || process.env.BROWSERBASE_PROJECT_ID;
  } else {
    config.headless = options.headless ?? false;
    if (options.extensionPath) {
      config.browserLaunchOptions = {
        args: [
          `--disable-extensions-except=${options.extensionPath}`,
          `--load-extension=${options.extensionPath}`,
          '--no-first-run'
        ]
      };
    }
  }

  const stagehand = new Stagehand(config);
  await stagehand.init();

  return stagehand;
}

/**
 * Build a context prompt for the AI based on persona and scenario
 */
export function buildContextPrompt(persona: Persona, scenario: TestScenario): string {
  return `
You are ${persona.name}, ${persona.description}.

Background: ${persona.background}

Technical Level: ${persona.technicalLevel}

Your current goal: ${scenario.description}

Instructions:
${scenario.instructions}

Expected outcomes to achieve:
${scenario.expectedOutcomes.map((o, i) => `${i + 1}. ${o}`).join('\n')}

Important notes:
- You are testing a Chrome extension called "Browser Clip"
- The extension captures network traffic and lets you save clips
- The popup opens from the extension icon
- Settings are in the options page
- Think step by step and observe the UI before acting
- If something doesn't work as expected, try an alternative approach
`;
}

/**
 * Run an AI-powered test scenario
 */
export async function runAITestScenario(
  stagehand: Stagehand,
  scenario: TestScenario
): Promise<AITestResult> {
  const startTime = Date.now();
  const steps: AIStep[] = [];
  const outcomes: OutcomeResult[] = [];

  try {
    // Get the agent
    const agent = stagehand.agent({
      modelName: 'gpt-4o',
      modelClientOptions: {
        apiKey: process.env.OPENAI_API_KEY
      }
    });

    // Build context
    const context = buildContextPrompt(scenario.persona, scenario);

    // Execute the scenario
    console.log(`\n🤖 Running scenario: ${scenario.name}`);
    console.log(`👤 Persona: ${scenario.persona.name}`);

    const result = await agent.execute(context, {
      maxSteps: scenario.maxSteps || 20,
      timeout: scenario.timeout || 120000
    });

    // Record steps from agent execution
    if (result.steps) {
      for (const step of result.steps) {
        steps.push({
          action: step.action || 'Unknown action',
          observation: step.observation,
          success: !step.error,
          timestamp: Date.now()
        });
      }
    }

    // Verify outcomes
    for (const expectedOutcome of scenario.expectedOutcomes) {
      const achieved = await verifyOutcome(stagehand, expectedOutcome);
      outcomes.push({
        expected: expectedOutcome,
        achieved: achieved.success,
        evidence: achieved.evidence
      });
    }

    const allOutcomesAchieved = outcomes.every(o => o.achieved);

    return {
      scenario: scenario.name,
      persona: scenario.persona.name,
      success: allOutcomesAchieved,
      steps,
      outcomes,
      duration: Date.now() - startTime,
      feedback: result.message
    };

  } catch (error: any) {
    return {
      scenario: scenario.name,
      persona: scenario.persona.name,
      success: false,
      steps,
      outcomes,
      duration: Date.now() - startTime,
      error: error.message
    };
  }
}

/**
 * Verify an expected outcome using the AI
 */
async function verifyOutcome(
  stagehand: Stagehand,
  outcome: string
): Promise<{ success: boolean; evidence?: string }> {
  try {
    const result = await stagehand.extract(
      `Check if this outcome has been achieved: "${outcome}".
       Look at the current page state and determine if this is true.`,
      z.object({
        achieved: z.boolean().describe('Whether the outcome appears to be achieved'),
        evidence: z.string().describe('What evidence supports this conclusion'),
        confidence: z.number().min(0).max(1).describe('Confidence level 0-1')
      })
    );

    return {
      success: result.achieved && result.confidence > 0.7,
      evidence: result.evidence
    };
  } catch (error) {
    return { success: false, evidence: 'Failed to verify outcome' };
  }
}

/**
 * Generate a test report from results
 */
export function generateTestReport(results: AITestResult[]): string {
  const passed = results.filter(r => r.success).length;
  const failed = results.length - passed;

  let report = `
╔════════════════════════════════════════════════════════════════╗
║              AI Agent Test Report - Browser Clip               ║
╚════════════════════════════════════════════════════════════════╝

Summary: ${passed}/${results.length} scenarios passed

`;

  for (const result of results) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    report += `
────────────────────────────────────────────────────────────────
${status} | ${result.scenario}
Persona: ${result.persona}
Duration: ${(result.duration / 1000).toFixed(1)}s
Steps: ${result.steps.length}

Outcomes:
`;

    for (const outcome of result.outcomes) {
      const outcomeStatus = outcome.achieved ? '✓' : '✗';
      report += `  ${outcomeStatus} ${outcome.expected}\n`;
      if (outcome.evidence) {
        report += `    Evidence: ${outcome.evidence}\n`;
      }
    }

    if (result.error) {
      report += `\nError: ${result.error}\n`;
    }

    if (result.feedback) {
      report += `\nAgent Feedback: ${result.feedback}\n`;
    }
  }

  report += `
════════════════════════════════════════════════════════════════
Final Result: ${passed === results.length ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}
════════════════════════════════════════════════════════════════
`;

  return report;
}

/**
 * Pre-defined test scenarios
 */
export const TEST_SCENARIOS: TestScenario[] = [
  {
    name: 'First-time setup and basic clip',
    description: 'Complete the initial setup and create a first clip',
    persona: PERSONAS.newUser,
    instructions: `
      1. Open the extension popup by clicking on the extension icon
      2. Look around to understand the interface
      3. Click on the Settings link to go to the options page
      4. Notice the Supabase configuration section (you don't need to fill it)
      5. Go back to the popup
      6. Select a time range (try 1 minute)
      7. Make sure "Current tab" is selected for scope
      8. Click the Save Clip button
      9. Observe what happens (it should show an error about Supabase not being configured)
    `,
    expectedOutcomes: [
      'Successfully opened the extension popup',
      'Found and navigated to settings page',
      'Selected a time range option',
      'Attempted to save a clip'
    ]
  },
  {
    name: 'Navigate and understand UI',
    description: 'Explore all UI elements without prior knowledge',
    persona: PERSONAS.newUser,
    instructions: `
      1. Open the extension popup
      2. Identify all the main sections and controls
      3. Try each time selection button to see what happens
      4. Explore the scope options (Current tab, Select tabs, All tabs)
      5. Find how to access settings
      6. In settings, identify all configurable options
      7. Return to the popup
    `,
    expectedOutcomes: [
      'Identified the recording status indicator',
      'Understood the time selection buttons',
      'Explored the scope selection options',
      'Found the settings/options page'
    ]
  },
  {
    name: 'Configure storage settings',
    description: 'Change storage cap and verify the change',
    persona: PERSONAS.developer,
    instructions: `
      1. Open the extension options page
      2. Find the storage settings section
      3. Change the storage cap to a different value (e.g., 1GB)
      4. Verify the change was saved
      5. Check the current storage usage display
    `,
    expectedOutcomes: [
      'Found storage cap dropdown',
      'Changed storage cap setting',
      'Storage usage information is displayed'
    ]
  },
  {
    name: 'Pause and resume capture',
    description: 'Test the pause/resume functionality',
    persona: PERSONAS.qaEngineer,
    instructions: `
      1. Open the extension options page
      2. Find the capture control section
      3. Click the pause button
      4. Confirm the pause action when prompted
      5. Open the popup and verify it shows paused state
      6. Click resume in the popup
      7. Verify capture is active again
    `,
    expectedOutcomes: [
      'Successfully paused capture',
      'Popup showed paused state',
      'Successfully resumed capture',
      'Recording indicator shows active after resume'
    ]
  },
  {
    name: 'Custom time range selection',
    description: 'Use the custom time picker for a specific range',
    persona: PERSONAS.developer,
    instructions: `
      1. Open the extension popup
      2. Click on the "Custom" time button
      3. The custom time picker should appear
      4. Adjust the start and end times
      5. Verify the save button becomes enabled
    `,
    expectedOutcomes: [
      'Custom time picker appeared',
      'Could interact with date/time inputs',
      'Save button state updated correctly'
    ]
  },
  {
    name: 'Tab selection for clip scope',
    description: 'Select specific tabs for the clip',
    persona: PERSONAS.securityAnalyst,
    instructions: `
      1. Open the extension popup
      2. Select a time range first
      3. Click on "Select tabs..." scope option
      4. The tab selector should appear showing available tabs
      5. Try to select/deselect tabs
      6. Observe how the save button state changes
    `,
    expectedOutcomes: [
      'Tab selector appeared when "Select tabs" was chosen',
      'Could see list of available tabs',
      'Tab selection affected save button state'
    ]
  }
];
