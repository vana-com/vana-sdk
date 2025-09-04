#!/usr/bin/env node

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { mokshaTestnet } from '@opendatalabs/vana-sdk/chains';
import { loadConfig } from '../config/loader.js';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';

/**
 * Wallet Preparation Script
 * 
 * Generates and funds test wallets for load testing:
 * - Creates specified number of test wallets
 * - Funds them from a master funding wallet
 * - Saves wallet data for use in load tests
 * - Validates funding and connectivity
 */

interface TestWallet {
  address: string;
  privateKey: string;
  funded: boolean;
  balance?: string;
}

interface WalletBatch {
  wallets: TestWallet[];
  totalWallets: number;
  fundedWallets: number;
  totalFunding: string;
  createdAt: string;
  rpcEndpoint: string;
}

class TestWalletManager {
  private config: any;
  private publicClient: any;
  private walletClient: any;
  private fundingAccount: any;

  constructor(config: any, fundingPrivateKey: string) {
    this.config = config;
    this.fundingAccount = privateKeyToAccount(fundingPrivateKey as `0x${string}`);
    
    this.publicClient = createPublicClient({
      chain: mokshaTestnet,
      transport: http(config.rpcEndpoint),
    });

    this.walletClient = createWalletClient({
      chain: mokshaTestnet,
      transport: http(config.rpcEndpoint),
      account: this.fundingAccount,
    });
  }

  async generateWallets(count: number): Promise<TestWallet[]> {
    const spinner = ora(`Generating ${count} test wallets...`).start();
    
    const wallets: TestWallet[] = [];
    
    for (let i = 0; i < count; i++) {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      
      wallets.push({
        address: account.address,
        privateKey,
        funded: false,
      });
      
      if ((i + 1) % 100 === 0) {
        spinner.text = `Generated ${i + 1}/${count} wallets...`;
      }
    }
    
    spinner.succeed(chalk.green(`Generated ${count} test wallets`));
    return wallets;
  }

  async checkFundingWalletBalance(): Promise<bigint> {
    const balance = await this.publicClient.getBalance({
      address: this.fundingAccount.address,
    });
    return balance;
  }

  async fundWallets(wallets: TestWallet[], amountPerWallet: string): Promise<void> {
    const fundingAmount = parseEther(amountPerWallet);
    const totalRequired = fundingAmount * BigInt(wallets.length);
    
    // Check funding wallet balance
    const fundingBalance = await this.checkFundingWalletBalance();
    
    console.log(chalk.cyan('\n💰 Funding Summary:'));
    console.log(`  Funding wallet: ${this.fundingAccount.address}`);
    console.log(`  Available balance: ${formatEther(fundingBalance)} VANA`);
    console.log(`  Required for funding: ${formatEther(totalRequired)} VANA`);
    console.log(`  Amount per wallet: ${amountPerWallet} VANA`);
    
    if (fundingBalance < totalRequired) {
      throw new Error(`Insufficient funding balance. Need ${formatEther(totalRequired)} VANA, have ${formatEther(fundingBalance)} VANA`);
    }
    
    const batchSize = 50; // Fund in batches to avoid overwhelming the RPC
    const batches = Math.ceil(wallets.length / batchSize);
    
    let fundedCount = 0;
    
    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const startIndex = batchIndex * batchSize;
      const endIndex = Math.min(startIndex + batchSize, wallets.length);
      const batch = wallets.slice(startIndex, endIndex);
      
      const spinner = ora(`Funding batch ${batchIndex + 1}/${batches} (${batch.length} wallets)...`).start();
      
      try {
        // Fund wallets in parallel within the batch
        const fundingPromises = batch.map(async (wallet) => {
          try {
            const txHash = await this.walletClient.sendTransaction({
              to: wallet.address as `0x${string}`,
              value: fundingAmount,
            });
            
            // Wait for transaction confirmation
            await this.publicClient.waitForTransactionReceipt({ 
              hash: txHash,
              timeout: 30_000, // 30 second timeout
            });
            
            wallet.funded = true;
            wallet.balance = amountPerWallet;
            fundedCount++;
            
            return { success: true, wallet: wallet.address };
          } catch (error) {
            console.error(`Failed to fund wallet ${wallet.address}:`, error instanceof Error ? error.message : error);
            return { success: false, wallet: wallet.address, error };
          }
        });
        
        const results = await Promise.all(fundingPromises);
        const successCount = results.filter(r => r.success).length;
        
        spinner.succeed(chalk.green(`Batch ${batchIndex + 1}/${batches}: ${successCount}/${batch.length} wallets funded`));
        
        // Small delay between batches to avoid rate limiting
        if (batchIndex < batches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        spinner.fail(chalk.red(`Batch ${batchIndex + 1} failed`));
        throw error;
      }
    }
    
    console.log(chalk.green(`\n✅ Funding complete: ${fundedCount}/${wallets.length} wallets funded`));
  }

  async validateWallets(wallets: TestWallet[]): Promise<void> {
    const spinner = ora('Validating wallet funding...').start();
    
    let validatedCount = 0;
    const sampleSize = Math.min(10, wallets.length); // Validate a sample
    const sampleWallets = wallets.slice(0, sampleSize);
    
    for (const wallet of sampleWallets) {
      try {
        const balance = await this.publicClient.getBalance({
          address: wallet.address as `0x${string}`,
        });
        
        if (balance > 0n) {
          wallet.balance = formatEther(balance);
          validatedCount++;
        }
      } catch (error) {
        console.warn(`Failed to validate wallet ${wallet.address}:`, error instanceof Error ? error.message : error);
      }
    }
    
    spinner.succeed(chalk.green(`Validated ${validatedCount}/${sampleSize} sample wallets`));
  }

  async saveWallets(wallets: TestWallet[], filename: string = 'test-wallets.json'): Promise<void> {
    const walletsDir = path.join(process.cwd(), 'wallets');
    await fs.mkdir(walletsDir, { recursive: true });
    
    const filePath = path.join(walletsDir, filename);
    
    const walletBatch: WalletBatch = {
      wallets,
      totalWallets: wallets.length,
      fundedWallets: wallets.filter(w => w.funded).length,
      totalFunding: formatEther(parseEther(this.config.walletFundingAmount) * BigInt(wallets.filter(w => w.funded).length)),
      createdAt: new Date().toISOString(),
      rpcEndpoint: this.config.rpcEndpoint,
    };
    
    await fs.writeFile(filePath, JSON.stringify(walletBatch, null, 2));
    console.log(chalk.cyan(`💾 Wallets saved to: ${filePath}`));
  }
}

// CLI Program
const program = new Command();

program
  .name('prepare-wallets')
  .description('Generate and fund test wallets for load testing')
  .option('-c, --count <count>', 'Number of wallets to generate', '1000')
  .option('-a, --amount <amount>', 'VANA amount to fund each wallet', '0.1')
  .option('--funding-key <key>', 'Private key of funding wallet (required)')
  .option('--validate', 'Validate wallet funding after creation', false)
  .option('--output <filename>', 'Output filename for wallet data', 'test-wallets.json')
  .action(async (options) => {
    try {
      if (!options.fundingKey) {
        console.error(chalk.red('❌ Error: --funding-key is required'));
        console.log(chalk.yellow('Example: --funding-key 0x1234...'));
        process.exit(1);
      }
      
      const count = parseInt(options.count);
      const amount = options.amount;
      
      console.log(chalk.bold.cyan('🏁 Preparing Test Wallets\n'));
      console.log(`📊 Configuration:`);
      console.log(`  Wallets to generate: ${count}`);
      console.log(`  Funding per wallet: ${amount} VANA`);
      console.log(`  Output file: ${options.output}`);
      console.log('');
      
      // Load configuration
      const config = await loadConfig();
      
      // Initialize wallet manager
      const walletManager = new TestWalletManager(config, options.fundingKey);
      
      // Generate wallets
      const wallets = await walletManager.generateWallets(count);
      
      // Fund wallets
      await walletManager.fundWallets(wallets, amount);
      
      // Validate if requested
      if (options.validate) {
        await walletManager.validateWallets(wallets);
      }
      
      // Save wallets
      await walletManager.saveWallets(wallets, options.output);
      
      const fundedCount = wallets.filter(w => w.funded).length;
      const successRate = ((fundedCount / wallets.length) * 100).toFixed(1);
      
      console.log(chalk.green('\n🎉 Wallet preparation complete!'));
      console.log(chalk.cyan('📊 Summary:'));
      console.log(`  Total wallets: ${wallets.length}`);
      console.log(`  Successfully funded: ${fundedCount}`);
      console.log(`  Success rate: ${successRate}%`);
      console.log(`  Total funding: ${formatEther(parseEther(amount) * BigInt(fundedCount))} VANA`);
      
      if (fundedCount < wallets.length) {
        console.log(chalk.yellow('\n⚠️  Some wallets failed to fund. Check RPC connectivity and funding wallet balance.'));
      }
      
    } catch (error) {
      console.error(chalk.red('\n❌ Wallet preparation failed:'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

export { TestWalletManager };
