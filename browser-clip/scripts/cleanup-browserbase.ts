#!/usr/bin/env npx tsx
/**
 * Cleanup Browserbase Sessions
 * Lists and terminates all active Browserbase sessions
 */

import { Browserbase } from '@browserbasehq/sdk';
import { config } from 'dotenv';

config();

async function main() {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    console.error('BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID required');
    process.exit(1);
  }

  const bb = new Browserbase({ apiKey });

  console.log('Fetching active sessions...\n');

  try {
    const sessions = await bb.sessions.list();

    if (!sessions || sessions.length === 0) {
      console.log('No active sessions found');
      return;
    }

    console.log(`Found ${sessions.length} sessions:`);
    for (const session of sessions) {
      console.log(`  - ${session.id} (status: ${session.status})`);

      // Terminate if running
      if (session.status === 'RUNNING') {
        console.log(`    Terminating session ${session.id}...`);
        try {
          await bb.sessions.update(session.id, {
            projectId,
            status: 'REQUEST_RELEASE'
          });
          console.log(`    ✓ Terminated`);
        } catch (e: any) {
          console.log(`    ✗ Failed: ${e.message}`);
        }
      }
    }
  } catch (e: any) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
