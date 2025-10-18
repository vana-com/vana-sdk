#!/usr/bin/env tsx
/**
 * Generate RBAC_CONFIG environment variable from config.yaml
 *
 * Usage:
 *   npm run generate-config-env
 *
 * Output:
 *   - Writes .env.local for local development
 *   - Prints JSON string to paste into Vercel environment variables
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

try {
  // Read config.yaml from project root
  const configPath = join(process.cwd(), 'config.yaml');
  const fileContents = readFileSync(configPath, 'utf8');
  const config = yaml.load(fileContents);

  // Convert to compact JSON string (no whitespace)
  const jsonString = JSON.stringify(config);

  console.log('\n=== Copy this value to Vercel ===\n');
  console.log(jsonString);
  console.log('\n=== Instructions ===');
  console.log('1. Go to your Vercel project settings');
  console.log('2. Navigate to Environment Variables');
  console.log('3. Add a new variable:');
  console.log('   Name: NEXT_PUBLIC_RBAC_CONFIG');
  console.log('   Value: <paste the string above>');
  console.log('4. Select all environments (Production, Preview, Development)');
  console.log('5. Save and redeploy\n');

  // Also output size for reference
  const sizeKB = (Buffer.byteLength(jsonString, 'utf8') / 1024).toFixed(2);
  console.log(`Config size: ${sizeKB} KB`);
  console.log(`Character count: ${jsonString.length}`);

  // Vercel has a 4KB limit per env var
  if (Buffer.byteLength(jsonString, 'utf8') > 4096) {
    console.warn('\n⚠️  WARNING: Config exceeds 4KB Vercel limit!');
    console.warn('Consider removing some addresses or using Vercel Blob storage instead.\n');
    process.exit(1);
  }

  // Write .env.local for local development
  const envPath = join(process.cwd(), '.env.local');
  writeFileSync(envPath, `NEXT_PUBLIC_RBAC_CONFIG=${jsonString}\n`, 'utf8');
  console.log(`\n✓ Written to .env.local for local development`);
  console.log('  You can now run: npm run dev\n');

} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('ENOENT')) {
      console.error('\n❌ config.yaml not found!');
      console.error('Create it from config.yaml.example first:\n');
      console.error('  cp config.yaml.example config.yaml\n');
    } else {
      console.error('\n❌ Error reading config.yaml:');
      console.error(error.message);
    }
  }
  process.exit(1);
}
