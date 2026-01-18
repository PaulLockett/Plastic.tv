#!/usr/bin/env npx tsx
/**
 * AI Agent Test Runner
 *
 * Runs AI-powered tests using Stagehand to verify that the Browser Clip
 * extension is usable by different personas with varying technical levels.
 *
 * Usage:
 *   npx tsx tests/ai-agent/run-ai-tests.ts
 *   npx tsx tests/ai-agent/run-ai-tests.ts --persona developer
 *   npx tsx tests/ai-agent/run-ai-tests.ts --scenario "First-time setup"
 *   npx tsx tests/ai-agent/run-ai-tests.ts --browserbase
 */

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import {
  createStagehandInstance,
  runAITestScenario,
  generateTestReport,
  TEST_SCENARIOS,
  PERSONAS,
  TestScenario,
  AITestResult,
  Persona
} from './stagehand-helper.js';

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
config();

// Parse command line arguments
function parseArgs(): {
  persona?: string;
  scenario?: string;
  useBrowserbase: boolean;
  outputFile?: string;
  verbose: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    persona: undefined as string | undefined,
    scenario: undefined as string | undefined,
    useBrowserbase: false,
    outputFile: undefined as string | undefined,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--persona':
        result.persona = args[++i];
        break;
      case '--scenario':
        result.scenario = args[++i];
        break;
      case '--browserbase':
        result.useBrowserbase = true;
        break;
      case '--output':
        result.outputFile = args[++i];
        break;
      case '--verbose':
      case '-v':
        result.verbose = true;
        break;
    }
  }

  return result;
}

// Validate environment
function validateEnvironment(useBrowserbase: boolean): void {
  // Check for Google API key (Gemini models)
  const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!googleApiKey) {
    throw new Error('GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY environment variable is required for AI tests');
  }

  if (useBrowserbase) {
    if (!process.env.BROWSERBASE_API_KEY) {
      throw new Error('BROWSERBASE_API_KEY environment variable is required for Browserbase mode');
    }
    if (!process.env.BROWSERBASE_PROJECT_ID) {
      throw new Error('BROWSERBASE_PROJECT_ID environment variable is required for Browserbase mode');
    }
  }
}

// Filter scenarios based on args
function filterScenarios(args: ReturnType<typeof parseArgs>): TestScenario[] {
  let scenarios = [...TEST_SCENARIOS];

  if (args.persona) {
    const persona = PERSONAS[args.persona];
    if (!persona) {
      console.error(`Unknown persona: ${args.persona}`);
      console.error(`Available personas: ${Object.keys(PERSONAS).join(', ')}`);
      process.exit(1);
    }
    scenarios = scenarios.filter(s => s.persona.name === persona.name);
  }

  if (args.scenario) {
    scenarios = scenarios.filter(s =>
      s.name.toLowerCase().includes(args.scenario!.toLowerCase())
    );
  }

  return scenarios;
}

// Print header
function printHeader(): void {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║          Browser Clip - AI Agent Test Suite                    ║
║          Powered by Browserbase Stagehand                      ║
╚════════════════════════════════════════════════════════════════╝
`);
}

// Print progress
function printProgress(current: number, total: number, scenario: TestScenario): void {
  console.log(`
[${current}/${total}] Running: ${scenario.name}
Persona: ${scenario.persona.name} (${scenario.persona.technicalLevel})
`);
}

// Main test runner
async function main(): Promise<void> {
  printHeader();

  const args = parseArgs();

  console.log('Configuration:');
  console.log(`  Mode: ${args.useBrowserbase ? 'Browserbase Cloud' : 'Local Browser'}`);
  console.log(`  Persona filter: ${args.persona || 'All'}`);
  console.log(`  Scenario filter: ${args.scenario || 'All'}`);
  console.log('');

  // Validate environment
  validateEnvironment(args.useBrowserbase);

  // Get extension path
  const extensionPath = path.resolve(__dirname, '../../');

  // Filter scenarios
  const scenarios = filterScenarios(args);

  if (scenarios.length === 0) {
    console.error('No scenarios match the specified filters');
    process.exit(1);
  }

  console.log(`Running ${scenarios.length} test scenario(s)...\n`);

  // Create Stagehand instance
  let stagehand;
  try {
    console.log('Initializing Stagehand...');
    stagehand = await createStagehandInstance({
      headless: false,
      extensionPath: args.useBrowserbase ? undefined : extensionPath,
      useBrowserbase: args.useBrowserbase
    });
    console.log('Stagehand initialized successfully\n');
  } catch (error: any) {
    console.error('Failed to initialize Stagehand:', error.message);
    process.exit(1);
  }

  // Run scenarios
  const results: AITestResult[] = [];

  try {
    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      printProgress(i + 1, scenarios.length, scenario);

      try {
        const result = await runAITestScenario(stagehand, scenario);
        results.push(result);

        // Print immediate result
        const status = result.success ? '✅ PASSED' : '❌ FAILED';
        console.log(`Result: ${status} (${(result.duration / 1000).toFixed(1)}s)\n`);

        if (args.verbose && result.steps.length > 0) {
          console.log('Steps:');
          result.steps.forEach((step, idx) => {
            const stepStatus = step.success ? '✓' : '✗';
            console.log(`  ${idx + 1}. ${stepStatus} ${step.action}`);
          });
          console.log('');
        }
      } catch (error: any) {
        console.error(`Error running scenario: ${error.message}`);
        results.push({
          scenario: scenario.name,
          persona: scenario.persona.name,
          success: false,
          steps: [],
          outcomes: [],
          duration: 0,
          error: error.message
        });
      }

      // Brief pause between scenarios
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } finally {
    // Cleanup
    console.log('\nCleaning up...');
    try {
      await stagehand.close();
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  // Generate and print report
  const report = generateTestReport(results);
  console.log(report);

  // Save report to file if specified
  if (args.outputFile) {
    const outputPath = path.resolve(args.outputFile);
    fs.writeFileSync(outputPath, report);
    console.log(`Report saved to: ${outputPath}`);

    // Also save JSON results
    const jsonPath = outputPath.replace(/\.[^.]+$/, '.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`JSON results saved to: ${jsonPath}`);
  }

  // Exit with appropriate code
  const allPassed = results.every(r => r.success);
  process.exit(allPassed ? 0 : 1);
}

// Custom scenario runner for ad-hoc testing
export async function runCustomScenario(
  instructions: string,
  persona: Persona = PERSONAS.newUser
): Promise<AITestResult> {
  const extensionPath = path.resolve(__dirname, '../../');

  const stagehand = await createStagehandInstance({
    headless: false,
    extensionPath
  });

  const scenario: TestScenario = {
    name: 'Custom Scenario',
    description: 'Ad-hoc test scenario',
    persona,
    instructions,
    expectedOutcomes: ['Task completed successfully']
  };

  try {
    return await runAITestScenario(stagehand, scenario);
  } finally {
    await stagehand.close();
  }
}

// Run if executed directly
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
