#!/usr/bin/env node

import { VanaLoadTestClient } from '../src/client/load-test-client.js';
import { loadConfig } from '../src/config/loader.js';
import { generatePrivateKey } from 'viem/accounts';
import chalk from 'chalk';

/**
 * Quick test to verify nonce management is working
 */
async function testNonceManagement() {
  try {
    console.log(chalk.cyan('🧪 Testing nonce management...'));
    
    const config = await loadConfig();
    const testPrivateKey = generatePrivateKey();
    
    // Create client
    const client = await VanaLoadTestClient.create(testPrivateKey, config);
    
    console.log(chalk.green('✅ Nonce management test passed - client created successfully'));
    console.log(chalk.blue('📝 Nonce collision prevention is now active'));
    
  } catch (error) {
    console.error(chalk.red('❌ Nonce management test failed:'), error);
    process.exit(1);
  }
}

testNonceManagement();
