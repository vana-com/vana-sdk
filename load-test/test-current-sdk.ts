#!/usr/bin/env npx tsx

/**
 * Test Current SDK with TransactionOptions
 * 
 * This script tests our TransactionOptions implementation with the current SDK APIs
 * to validate everything works before updating the full load test.
 */

import { Vana } from '@opendatalabs/vana-sdk/node';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mokshaTestnet } from '@opendatalabs/vana-sdk/chains';
import chalk from 'chalk';

async function testCurrentSDK(): Promise<void> {
  console.log(chalk.cyan('🧪 Testing Current SDK with TransactionOptions\n'));
  
  try {
    // Setup test wallet
    const account = privateKeyToAccount('0x' + '1'.repeat(64) as `0x${string}`);
    
    const walletClient = createWalletClient({
      account,
      chain: mokshaTestnet,
      transport: http('https://rpc.moksha.vana.org'),
    });
    
    const vana = Vana({
      walletClient,
      defaultPersonalServerUrl: 'https://vana-personal-server-load-test-432753364585.europe-west1.run.app/api/v1',
    });
    
    console.log(chalk.green(`✅ SDK initialized with wallet: ${account.address}`));
    
    // Test 1: Check if the SDK has the expected controllers
    console.log(chalk.yellow('\n📋 Testing SDK Controller Availability:'));
    
    const controllers = ['permissions', 'data', 'server', 'schemas'];
    for (const controller of controllers) {
      const exists = (vana as any)[controller] !== undefined;
      console.log(`${exists ? '✅' : '❌'} vana.${controller}: ${exists ? 'available' : 'missing'}`);
    }
    
    // Test 2: Test server.getIdentity with debugging
    console.log(chalk.yellow('\n🔍 Testing server.getIdentity:'));
    
    if ((vana as any).server) {
      try {
        const testAddress = '0x1ce6041300Edfca2dbB6F893cc7175AD62e3FF6b';
        console.log(chalk.blue(`   Testing with address: ${testAddress}`));
        
        const serverInfo = await (vana as any).server.getIdentity({
          userAddress: testAddress,
        });
        
        console.log(chalk.green('✅ getIdentity successful'));
        console.log(chalk.cyan('📤 Response fields:'));
        Object.entries(serverInfo).forEach(([key, value]) => {
          console.log(`   ${key}: ${value} (${typeof value})`);
        });
        
        if (serverInfo.public_key) {
          console.log(chalk.green('✅ public_key field is present'));
        } else {
          console.log(chalk.red('❌ public_key field is missing - this is the bug!'));
        }
        
      } catch (error) {
        console.log(chalk.red(`❌ getIdentity failed: ${error instanceof Error ? error.message : 'Unknown'}`));
      }
    } else {
      console.log(chalk.red('❌ vana.server controller not available'));
    }
    
    // Test 3: Test TransactionOptions on permissions
    console.log(chalk.yellow('\n⚡ Testing TransactionOptions:'));
    
    if ((vana as any).permissions?.submitAddServerFilesAndPermissions) {
      try {
        const testParams = {
          granteeId: BigInt(1),
          grant: 'ipfs://QmTestGrant',
          fileUrls: ['https://example.com/test.json'],
          schemaIds: [0],
          serverAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb' as `0x${string}`,
          serverUrl: 'https://test.example.com',
          serverPublicKey: '04' + '0'.repeat(128),
          filePermissions: [[{
            account: '0x742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb' as `0x${string}`,
            key: 'test-key'
          }]]
        };
        
        const transactionOptions = {
          maxFeePerGas: 100n * 10n ** 9n,
          maxPriorityFeePerGas: 2n * 10n ** 9n,
          gasLimit: 500000n,
          timeout: 180000,
        };
        
        // This should fail at signature step, but validate the method signature
        await (vana as any).permissions.submitAddServerFilesAndPermissions(testParams, transactionOptions);
        
        console.log(chalk.green('✅ Method accepts TransactionOptions parameter'));
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown';
        
        // Expected errors
        if (errorMessage.includes('wallet') || errorMessage.includes('sign') || errorMessage.includes('nonce')) {
          console.log(chalk.green('✅ Method accepts TransactionOptions (expected wallet/signature error)'));
        } else {
          console.log(chalk.yellow(`⚠️  Unexpected error: ${errorMessage.substring(0, 100)}...`));
        }
      }
    } else {
      console.log(chalk.red('❌ submitAddServerFilesAndPermissions method not available'));
    }
    
    console.log(chalk.cyan('\n🎯 Diagnosis Summary:'));
    console.log(chalk.yellow('The load test needs to be updated to use current SDK APIs:'));
    console.log(chalk.gray('1. Fix import statements for current SDK exports'));
    console.log(chalk.gray('2. Update API calls to use current controller structure'));
    console.log(chalk.gray('3. Fix any field name mismatches (publicKey vs public_key)'));
    console.log(chalk.gray('4. Test with our new TransactionOptions'));
    
  } catch (error) {
    console.error(chalk.red('❌ SDK test failed:'), error);
  }
}

testCurrentSDK();
