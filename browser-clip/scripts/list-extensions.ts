#!/usr/bin/env npx tsx
/**
 * List Browserbase Extensions
 */

import { Browserbase } from '@browserbasehq/sdk';
import { config } from 'dotenv';

config();

async function main() {
  const apiKey = process.env.BROWSERBASE_API_KEY;

  if (!apiKey) {
    console.error('BROWSERBASE_API_KEY required');
    process.exit(1);
  }

  const bb = new Browserbase({ apiKey });

  console.log('Fetching extensions...\n');

  try {
    const extensions = await bb.extensions.list();

    if (!extensions || extensions.length === 0) {
      console.log('No extensions found');
      return;
    }

    console.log(`Found ${extensions.length} extensions:`);
    for (const ext of extensions) {
      console.log(`  - ID: ${ext.id}`);
      console.log(`    Created: ${new Date(ext.createdAt).toLocaleString()}`);
    }
  } catch (e: any) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
