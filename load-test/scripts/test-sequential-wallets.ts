#!/usr/bin/env node

import { VanaLoadTestClient } from '../src/client/load-test-client.js';
import { loadConfig } from '../src/config/loader.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { generateWalletPrompt } from '../src/utils/prompt-generator.js';
import chalk from 'chalk';

/**
 * Test sequential wallet usage to isolate nonce issues from concurrency
 */
async function testSequentialWallets() {
  try {
    console.log(chalk.cyan('🔍 Testing sequential wallet usage...'));
    
    const config = await loadConfig();
    config.enableDebugLogs = true;
    
    // Test 3 different wallets sequentially (no concurrency)
    for (let i = 1; i <= 3; i++) {
      console.log(chalk.yellow(`\n📝 Test ${i}: Fresh wallet (sequential)`));
      
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      console.log(`Wallet ${i}: ${account.address}`);
      
      const client = await VanaLoadTestClient.create(privateKey, config);
      const userData = JSON.stringify({ test: `data${i}`, timestamp: Date.now() });
      const prompt = generateWalletPrompt(account.address);
      
      console.log(`Executing transaction ${i}...`);
      const result = await client.executeDataPortabilityFlow(
        userData,
        prompt,
        `sequential-test-${i}`,
        'http://localhost:3001'
      );
      
      console.log(`Result ${i}: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      if (!result.success) {
        console.log(`Error: ${result.error}`);
        
        // If we get a nonce error on a fresh wallet, that's the smoking gun
        if (result.error?.includes('InvalidNonce')) {
          console.log(chalk.red(`🚨 NONCE ERROR ON FRESH WALLET! This confirms the issue.`));
          break;
        }
      }
      
      // Wait between tests to ensure no timing issues
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(chalk.green('\n✅ Sequential wallet test complete'));
    
  } catch (error) {
    console.error(chalk.red('❌ Sequential test failed:'), error);
    process.exit(1);
  }
}

testSequentialWallets();
