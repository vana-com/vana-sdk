#!/usr/bin/env node

import { VanaLoadTestClient } from '../src/client/load-test-client.js';
import { loadConfig } from '../src/config/loader.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { generateWalletPrompt } from '../src/utils/prompt-generator.js';
import chalk from 'chalk';

/**
 * Debug script to understand nonce collision issues
 * Tests with fresh wallets to see if the issue is in our code or the SDK
 */
async function debugNonceIssue() {
  try {
    console.log(chalk.cyan('🔍 Debugging nonce collision issue...'));
    
    const config = await loadConfig();
    config.enableDebugLogs = true;
    
    // Test 1: Single fresh wallet
    console.log(chalk.yellow('\n📝 Test 1: Single fresh wallet'));
    const wallet1Key = generatePrivateKey();
    const wallet1Account = privateKeyToAccount(wallet1Key);
    console.log(`Wallet 1: ${wallet1Account.address}`);
    
    const client1 = await VanaLoadTestClient.create(wallet1Key, config);
    const userData1 = JSON.stringify({ test: 'data1', timestamp: Date.now() });
    const prompt1 = generateWalletPrompt(wallet1Account.address);
    
    console.log('Executing first transaction...');
    const result1 = await client1.executeDataPortabilityFlow(
      userData1,
      prompt1,
      'debug-test-1',
      'http://localhost:3001'
    );
    
    console.log(`Result 1: ${result1.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (!result1.success) {
      console.log(`Error: ${result1.error}`);
    }
    
    // Test 2: Same wallet, second transaction (should increment nonce)
    console.log(chalk.yellow('\n📝 Test 2: Same wallet, second transaction'));
    console.log('Executing second transaction with same wallet...');
    const result2 = await client1.executeDataPortabilityFlow(
      JSON.stringify({ test: 'data2', timestamp: Date.now() }),
      generateWalletPrompt(wallet1Account.address),
      'debug-test-2',
      'http://localhost:3001'
    );
    
    console.log(`Result 2: ${result2.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (!result2.success) {
      console.log(`Error: ${result2.error}`);
    }
    
    // Test 3: Different fresh wallet (should start at nonce 0)
    console.log(chalk.yellow('\n📝 Test 3: Different fresh wallet'));
    const wallet2Key = generatePrivateKey();
    const wallet2Account = privateKeyToAccount(wallet2Key);
    console.log(`Wallet 2: ${wallet2Account.address}`);
    
    const client2 = await VanaLoadTestClient.create(wallet2Key, config);
    const result3 = await client2.executeDataPortabilityFlow(
      JSON.stringify({ test: 'data3', timestamp: Date.now() }),
      generateWalletPrompt(wallet2Account.address),
      'debug-test-3',
      'http://localhost:3001'
    );
    
    console.log(`Result 3: ${result3.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (!result3.success) {
      console.log(`Error: ${result3.error}`);
    }
    
    console.log(chalk.green('\n✅ Nonce debugging complete'));
    
  } catch (error) {
    console.error(chalk.red('❌ Debug test failed:'), error);
    process.exit(1);
  }
}

debugNonceIssue();
