#!/usr/bin/env npx tsx
/**
 * Upload Extension to Browserbase
 *
 * This script packages the Browser Clip extension and uploads it to Browserbase
 * for use in cloud browser testing.
 *
 * Usage:
 *   npx tsx scripts/upload-extension.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import archiver from 'archiver';
import { Browserbase } from '@browserbasehq/sdk';

config();

const EXTENSION_PATH = path.resolve(__dirname, '../');

async function packageExtension(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    // Files to include
    const filesToInclude = [
      'manifest.json',
      'background/**/*',
      'popup/**/*',
      'options/**/*',
      'lib/**/*',
      'utils/**/*',
      'icons/**/*.png'
    ];

    // Add each file pattern
    for (const pattern of filesToInclude) {
      if (pattern.includes('*')) {
        const dir = pattern.split('/')[0];
        archive.directory(path.join(EXTENSION_PATH, dir), dir);
      } else {
        const filePath = path.join(EXTENSION_PATH, pattern);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: pattern });
        }
      }
    }

    archive.finalize();
  });
}

async function main() {
  console.log('Browser Clip Extension Uploader\n');

  // Validate environment
  const apiKey = process.env.BROWSERBASE_API_KEY;
  if (!apiKey) {
    console.error('Error: BROWSERBASE_API_KEY environment variable is required');
    console.error('Set it in your .env file or environment');
    process.exit(1);
  }

  // Validate extension exists
  const manifestPath = path.join(EXTENSION_PATH, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('Error: manifest.json not found at', manifestPath);
    process.exit(1);
  }

  // Read manifest for info
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`Extension: ${manifest.name} v${manifest.version}`);
  console.log(`Path: ${EXTENSION_PATH}\n`);

  // Package extension
  console.log('Packaging extension...');
  const zipBuffer = await packageExtension();
  console.log(`Package size: ${(zipBuffer.length / 1024).toFixed(1)} KB\n`);

  // Upload to Browserbase
  console.log('Uploading to Browserbase...');
  const bb = new Browserbase(apiKey);

  try {
    const extension = await bb.extensions.create({
      file: new Blob([zipBuffer], { type: 'application/zip' })
    });

    console.log('\n✅ Upload successful!');
    console.log(`Extension ID: ${extension.id}`);
    console.log('\nTo use in tests, set:');
    console.log(`  BROWSERBASE_EXTENSION_ID=${extension.id}`);

    // Save to .env if it exists
    const envPath = path.join(EXTENSION_PATH, '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf-8');
      if (envContent.includes('BROWSERBASE_EXTENSION_ID=')) {
        envContent = envContent.replace(
          /BROWSERBASE_EXTENSION_ID=.*/,
          `BROWSERBASE_EXTENSION_ID=${extension.id}`
        );
      } else {
        envContent += `\nBROWSERBASE_EXTENSION_ID=${extension.id}\n`;
      }
      fs.writeFileSync(envPath, envContent);
      console.log('\nExtension ID saved to .env file');
    }

  } catch (error: any) {
    console.error('\n❌ Upload failed:', error.message);
    process.exit(1);
  }
}

main();
