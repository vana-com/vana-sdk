#!/usr/bin/env node

import { createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { moksha } from '@opendatalabs/vana-sdk/chains';
import chalk from 'chalk';

/**
 * Multi-Relayer Funding Strategy
 * 
 * Problem: Single relayer funding is sequential (10-20s per wallet)
 * Solution: Create multiple "child" relayer wallets that can fund in parallel
 * 
 * Architecture:
 * Master Relayer (your main wallet) → Child Relayers (100 VANA each) → Test Wallets (0.1 VANA each)
 * 
 * Benefits:
 * - 10x faster funding (10 child relayers = 10x parallelism)
 * - Master wallet safety (only funds child relayers, not test wallets)
 * - Scalable (each child can fund 1000 test wallets)
 */

interface ChildRelayer {
  privateKey: string;
  address: string;
  balance: bigint;
  funded: boolean;
  walletClient: any;
}

interface FundingResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  duration: number;
}

export class MultiRelayerFundingManager {
  private masterRelayerKey: string;
  private masterAccount: any;
  private masterWalletClient: any;
  private childRelayers: ChildRelayer[] = [];
  private config: any;

  constructor(masterRelayerKey: string, config: any) {
    this.masterRelayerKey = masterRelayerKey;
    this.config = config;
    this.masterAccount = privateKeyToAccount(masterRelayerKey as `0x${string}`);
    this.masterWalletClient = createWalletClient({
      account: this.masterAccount,
      chain: moksha,
      transport: http(),
    });
  }

  /**
   * Initialize child relayer wallets
   */
  async initializeChildRelayers(childCount: number = 10): Promise<void> {
    console.log(chalk.cyan(`🏦 Initializing ${childCount} child relayer wallets...`));
    
    // Generate child relayer wallets
    for (let i = 0; i < childCount; i++) {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      const walletClient = createWalletClient({
        account,
        chain: moksha,
        transport: http(),
      });

      this.childRelayers.push({
        privateKey,
        address: account.address,
        balance: 0n,
        funded: false,
        walletClient,
      });
    }

    console.log(chalk.green(`✅ Generated ${childCount} child relayer wallets`));
  }

  /**
   * Fund child relayers from master wallet (sequential for safety)
   */
  async fundChildRelayers(amountPerChild: bigint = parseEther('100')): Promise<void> {
    console.log(chalk.cyan(`💰 Funding ${this.childRelayers.length} child relayers with ${formatEther(amountPerChild)} VANA each...`));
    
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < this.childRelayers.length; i++) {
      const child = this.childRelayers[i];
      const startTime = Date.now();
      
      try {
        console.log(chalk.gray(`[${i + 1}/${this.childRelayers.length}] Funding ${child.address}...`));
        
        const hash = await this.masterWalletClient.sendTransaction({
          to: child.address,
          value: amountPerChild,
        });

        child.funded = true;
        child.balance = amountPerChild;
        successful++;
        
        const duration = Date.now() - startTime;
        console.log(chalk.green(`✅ Child relayer ${i + 1} funded in ${duration}ms: ${hash}`));
        
        // Delay to prevent nonce collisions on master wallet
        if (i < this.childRelayers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        failed++;
        console.error(chalk.red(`❌ Failed to fund child relayer ${i + 1}: ${error}`));
      }
    }

    console.log(chalk.cyan(`\n📊 Child Relayer Funding Summary:`));
    console.log(`  Successful: ${successful}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total Funding Capacity: ${successful * 1000} test wallets (0.1 VANA each)`);
  }

  /**
   * Fund test wallets using child relayers in parallel
   */
  async fundTestWallets(testWalletAddresses: string[]): Promise<FundingResult[]> {
    const fundedChildren = this.childRelayers.filter(c => c.funded);
    
    if (fundedChildren.length === 0) {
      throw new Error('No funded child relayers available');
    }

    console.log(chalk.cyan(`🚀 Funding ${testWalletAddresses.length} test wallets using ${fundedChildren.length} child relayers...`));
    
    // Distribute wallets across child relayers
    const walletsPerChild = Math.ceil(testWalletAddresses.length / fundedChildren.length);
    const fundingPromises: Promise<FundingResult[]>[] = [];

    for (let i = 0; i < fundedChildren.length; i++) {
      const child = fundedChildren[i];
      const startIndex = i * walletsPerChild;
      const endIndex = Math.min(startIndex + walletsPerChild, testWalletAddresses.length);
      const walletsForThisChild = testWalletAddresses.slice(startIndex, endIndex);

      if (walletsForThisChild.length > 0) {
        fundingPromises.push(
          this.fundWalletsWithChildRelayer(child, walletsForThisChild, i)
        );
      }
    }

    // Execute all child relayers in parallel
    const allResults = await Promise.all(fundingPromises);
    return allResults.flat();
  }

  /**
   * Fund wallets using a single child relayer (sequential for nonce safety)
   */
  private async fundWalletsWithChildRelayer(
    childRelayer: ChildRelayer, 
    walletAddresses: string[], 
    childIndex: number
  ): Promise<FundingResult[]> {
    const results: FundingResult[] = [];
    const fundingAmount = parseEther('0.1');

    console.log(chalk.blue(`[Child-${childIndex}] Funding ${walletAddresses.length} wallets...`));

    for (let i = 0; i < walletAddresses.length; i++) {
      const address = walletAddresses[i];
      const startTime = Date.now();

      try {
        const hash = await childRelayer.walletClient.sendTransaction({
          to: address,
          value: fundingAmount,
        });

        const duration = Date.now() - startTime;
        results.push({
          success: true,
          transactionHash: hash,
          duration,
        });

        if (this.config.enableDebugLogs) {
          console.log(chalk.green(`[Child-${childIndex}] ✅ Funded ${address} in ${duration}ms`));
        }

        // Small delay to prevent nonce collisions within child relayer
        if (i < walletAddresses.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 100));
        }

      } catch (error) {
        const duration = Date.now() - startTime;
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration,
        });

        if (this.config.enableDebugLogs) {
          console.error(chalk.red(`[Child-${childIndex}] ❌ Failed to fund ${address}: ${error}`));
        }
      }
    }

    const successful = results.filter(r => r.success).length;
    console.log(chalk.blue(`[Child-${childIndex}] Completed: ${successful}/${walletAddresses.length} successful`));

    return results;
  }

  /**
   * Get funding statistics
   */
  getStats() {
    const fundedChildren = this.childRelayers.filter(c => c.funded).length;
    const totalCapacity = fundedChildren * 1000; // Each child can fund ~1000 test wallets

    return {
      masterAddress: this.masterAccount.address,
      childRelayers: this.childRelayers.length,
      fundedChildren,
      totalCapacity,
      parallelism: fundedChildren,
    };
  }

  /**
   * Cleanup: Return unused funds from child relayers to master (optional)
   */
  async cleanup(): Promise<void> {
    console.log(chalk.yellow('🧹 Cleanup: Returning unused funds to master wallet...'));
    
    // Implementation would check child balances and return excess funds
    // Left as exercise - requires gas estimation and balance checking
    console.log(chalk.gray('Cleanup implementation pending...'));
  }
}

/**
 * Example usage and testing
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  async function testMultiRelayerFunding() {
    const { config } = await import('dotenv');
    config();

    const masterKey = process.env.RELAYER_PRIVATE_KEY;
    if (!masterKey) {
      console.error('❌ RELAYER_PRIVATE_KEY not found');
      process.exit(1);
    }

    const manager = new MultiRelayerFundingManager(masterKey, { enableDebugLogs: true });
    
    try {
      // Initialize 5 child relayers for testing
      await manager.initializeChildRelayers(5);
      
      // Fund child relayers (this costs 500 VANA from master)
      await manager.fundChildRelayers(parseEther('100'));
      
      // Generate some test wallet addresses
      const testWallets = Array.from({ length: 20 }, () => 
        privateKeyToAccount(generatePrivateKey()).address
      );
      
      // Fund test wallets in parallel using child relayers
      const results = await manager.fundTestWallets(testWallets);
      
      const successful = results.filter(r => r.success).length;
      console.log(chalk.green(`\n🎉 Multi-relayer funding complete: ${successful}/${testWallets.length} successful`));
      
      console.log(chalk.cyan('\n📊 Final Stats:'));
      console.log(manager.getStats());
      
    } catch (error) {
      console.error(chalk.red('❌ Multi-relayer funding failed:'), error);
    }
  }

  testMultiRelayerFunding();
}
