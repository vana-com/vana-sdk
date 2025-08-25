#!/usr/bin/env node

import { PersistentChildRelayerManager } from '../src/utils/persistent-child-relayers.js';
import { parseEther } from 'viem';
import { loadConfig } from '../src/config/loader.js';
import chalk from 'chalk';

/**
 * CLI tool for managing persistent child relayer pools
 * 
 * Usage:
 *   npx tsx scripts/manage-child-relayers.ts create [pool-name] [count] [balance-per-child]
 *   npx tsx scripts/manage-child-relayers.ts stats [pool-name]
 *   npx tsx scripts/manage-child-relayers.ts fund [pool-name] [min-balance]
 *   npx tsx scripts/manage-child-relayers.ts return [pool-name] [retain-balance]
 *   npx tsx scripts/manage-child-relayers.ts list
 */

async function main() {
  try {
    const config = await loadConfig();
    
    if (!config.relayerPrivateKey) {
      console.error(chalk.red('❌ RELAYER_PRIVATE_KEY not found in environment'));
      process.exit(1);
    }

    const command = process.argv[2];
    const poolName = process.argv[3] || 'default';
    
    console.log(chalk.cyan('🏦 Child Relayer Pool Manager'));
    console.log(chalk.gray(`Master Relayer: ${config.relayerPrivateKey.slice(0, 10)}...`));
    console.log(chalk.gray(`Pool: ${poolName}\n`));
    
    const manager = new PersistentChildRelayerManager(config.relayerPrivateKey, config, poolName);
    
    switch (command) {
      case 'create': {
        const count = parseInt(process.argv[4]) || 5;
        const balancePerChild = process.argv[5] || '50';
        
        console.log(chalk.blue(`Creating ${count} child relayers with ${balancePerChild} VANA each...`));
        await manager.ensureChildRelayers(count, parseEther(balancePerChild));
        manager.displayStats();
        break;
      }
      
      case 'stats': {
        manager.displayStats();
        break;
      }
      
      case 'fund': {
        const minBalance = parseEther(process.argv[4] || '10');
        console.log(chalk.blue(`Ensuring all child relayers have at least ${process.argv[4] || '10'} VANA...`));
        
        // Get current count and fund them
        const currentChildren = manager['pool'].children.length;
        if (currentChildren === 0) {
          console.log(chalk.yellow('No child relayers found. Use "create" command first.'));
          break;
        }
        
        await manager.ensureChildRelayers(currentChildren, minBalance);
        manager.displayStats();
        break;
      }
      
      case 'return': {
        const retainBalance = parseEther(process.argv[4] || '1');
        console.log(chalk.blue(`Returning excess funds, retaining ${process.argv[4] || '1'} VANA per child...`));
        await manager.returnUnusedFunds(retainBalance);
        manager.displayStats();
        break;
      }
      
      case 'list': {
        console.log(chalk.cyan('📂 Available Child Relayer Pools:'));
        
        // List all pool files in current directory
        const { readdirSync } = await import('fs');
        const files = readdirSync('.')
          .filter(f => f.startsWith('child-relayer-pool-') && f.endsWith('.json'))
          .map(f => f.replace('child-relayer-pool-', '').replace('.json', ''));
        
        if (files.length === 0) {
          console.log(chalk.gray('   No pools found. Use "create" to create your first pool.'));
        } else {
          files.forEach((poolName, index) => {
            console.log(chalk.blue(`   ${index + 1}. ${poolName}`));
          });
        }
        break;
      }
      
      case 'test': {
        console.log(chalk.blue('🧪 Testing child relayer funding...'));
        
        // Ensure we have some child relayers
        await manager.ensureChildRelayers(3, parseEther('10'));
        
        // Generate test wallets
        const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts');
        const testWallets = Array.from({ length: 10 }, () => 
          privateKeyToAccount(generatePrivateKey()).address
        );
        
        console.log(chalk.blue(`Funding ${testWallets.length} test wallets...`));
        const results = await manager.fundTestWallets(testWallets);
        
        const successful = results.filter(r => r.success).length;
        const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
        
        console.log(chalk.green(`\n🎉 Test Results:`));
        console.log(`   Successful: ${successful}/${testWallets.length}`);
        console.log(`   Average Duration: ${(avgDuration / 1000).toFixed(2)}s`);
        console.log(`   Throughput: ${(successful / (avgDuration / 1000)).toFixed(1)} wallets/sec`);
        break;
      }
      
      default: {
        console.log(chalk.cyan('Available Commands:'));
        console.log(chalk.gray('  create [pool-name] [count] [balance-per-child]  - Create and fund child relayers'));
        console.log(chalk.gray('  stats [pool-name]                              - Show pool statistics'));
        console.log(chalk.gray('  fund [pool-name] [min-balance]                 - Top up child relayers'));
        console.log(chalk.gray('  return [pool-name] [retain-balance]            - Return excess funds to master'));
        console.log(chalk.gray('  list                                           - List all available pools'));
        console.log(chalk.gray('  test [pool-name]                               - Test funding performance'));
        console.log(chalk.gray('\nExamples:'));
        console.log(chalk.blue('  npx tsx scripts/manage-child-relayers.ts create load-test-5 5 50'));
        console.log(chalk.blue('  npx tsx scripts/manage-child-relayers.ts stats load-test-5'));
        console.log(chalk.blue('  npx tsx scripts/manage-child-relayers.ts fund load-test-5 20'));
        console.log(chalk.blue('  npx tsx scripts/manage-child-relayers.ts test load-test-5'));
        break;
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Command failed:'), error);
    process.exit(1);
  }
}

main();
