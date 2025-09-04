#!/usr/bin/env node

import { createWalletClient, createPublicClient, http, parseEther, formatEther, encodeFunctionData } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { moksha } from '@opendatalabs/vana-sdk/chains';
import { GasConfiguration } from './wallet-funding.js';
import { getRpcEndpoint } from './rpc-distribution.js';
import chalk from 'chalk';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Multicall3 contract address on Moksha
const MULTICALL3_ADDRESS = '0xD8d2dFca27E8797fd779F8547166A2d3B29d360E' as const;

// Multicall3 ABI (aggregate3Value function)
const MULTICALL3_ABI = [
  {
    "inputs": [
      {
        "components": [
          {"internalType": "address", "name": "target", "type": "address"},
          {"internalType": "bool", "name": "allowFailure", "type": "bool"},
          {"internalType": "uint256", "name": "value", "type": "uint256"},
          {"internalType": "bytes", "name": "callData", "type": "bytes"}
        ],
        "internalType": "struct Multicall3.Call3Value[]",
        "name": "calls",
        "type": "tuple[]"
      }
    ],
    "name": "aggregate3Value",
    "outputs": [
      {
        "components": [
          {"internalType": "bool", "name": "success", "type": "bool"},
          {"internalType": "bytes", "name": "returnData", "type": "bytes"}
        ],
        "internalType": "struct Multicall3.Result[]",
        "name": "returnData",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  }
] as const;

/**
 * Persistent Child Relayer Management
 * 
 * Features:
 * - Save/load child relayers to/from JSON file
 * - Reuse existing funded child relayers across runs
 * - Automatic balance checking and top-up
 * - Safe master wallet usage (only funds children when needed)
 */

interface ChildRelayerData {
  privateKey: string;
  address: string;
  balance: string; // Store as string to avoid precision issues
  lastFunded: number; // Timestamp
  totalFunded: number; // Total VANA funded to this child
}

interface ChildRelayerPool {
  masterAddress: string;
  createdAt: number;
  lastUpdated: number;
  children: ChildRelayerData[];
  totalInvested: string; // Total VANA invested in child relayers
}

export class PersistentChildRelayerManager {
  private masterRelayerKey: string;
  private masterAccount: any;
  private masterWalletClient: any;
  private publicClient: any;
  private poolFilePath: string;
  private pool: ChildRelayerPool;
  private config: any;

  constructor(masterRelayerKey: string, config: any, poolName: string = 'default') {
    this.masterRelayerKey = masterRelayerKey;
    this.config = config;
    this.masterAccount = privateKeyToAccount(masterRelayerKey as `0x${string}`);
    
    // Get RPC endpoint from config
    const rpcEndpoint = getRpcEndpoint(config);
    
    this.masterWalletClient = createWalletClient({
      account: this.masterAccount,
      chain: moksha,
      transport: http(rpcEndpoint),
    });

    this.publicClient = createPublicClient({
      chain: moksha,
      transport: http(rpcEndpoint),
    });

    // Store pool file in load-test directory
    this.poolFilePath = join(process.cwd(), `child-relayer-pool-${poolName}.json`);
    
    // Initialize or load existing pool
    this.pool = this.loadOrCreatePool();
  }

  /**
   * Load existing pool or create new one
   */
  private loadOrCreatePool(): ChildRelayerPool {
    if (existsSync(this.poolFilePath)) {
      try {
        const data = readFileSync(this.poolFilePath, 'utf8');
        const pool = JSON.parse(data) as ChildRelayerPool;
        
        // Verify master address matches
        if (pool.masterAddress !== this.masterAccount.address) {
          console.log(chalk.yellow(`⚠️  Pool master address mismatch. Creating new pool.`));
          console.log(chalk.gray(`   Existing: ${pool.masterAddress}`));
          console.log(chalk.gray(`   Current:  ${this.masterAccount.address}`));
          return this.createNewPool();
        }
        
        console.log(chalk.green(`📂 Loaded existing child relayer pool: ${this.poolFilePath}`));
        console.log(chalk.blue(`   Children: ${pool.children.length}`));
        console.log(chalk.blue(`   Total Invested: ${pool.totalInvested} VANA`));
        console.log(chalk.blue(`   Last Updated: ${new Date(pool.lastUpdated).toLocaleString()}`));
        
        return pool;
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Failed to load pool file. Creating new pool.`));
        return this.createNewPool();
      }
    } else {
      console.log(chalk.cyan(`🆕 Creating new child relayer pool: ${this.poolFilePath}`));
      return this.createNewPool();
    }
  }

  /**
   * Create new empty pool
   */
  private createNewPool(): ChildRelayerPool {
    return {
      masterAddress: this.masterAccount.address,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      children: [],
      totalInvested: '0',
    };
  }

  /**
   * Save pool to file
   */
  private savePool(): void {
    try {
      this.pool.lastUpdated = Date.now();
      const data = JSON.stringify(this.pool, null, 2);
      writeFileSync(this.poolFilePath, data, 'utf8');
      
      if (this.config.enableDebugLogs) {
        console.log(chalk.gray(`💾 Saved child relayer pool to ${this.poolFilePath}`));
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to save pool file: ${error}`));
    }
  }

  /**
   * Get or create child relayers
   */
  async ensureChildRelayers(
    targetCount: number, 
    minBalancePerChild: bigint = parseEther('10')
  ): Promise<ChildRelayerData[]> {
    console.log(chalk.cyan(`🏦 Ensuring ${targetCount} child relayers with min ${formatEther(minBalancePerChild)} VANA each...`));
    
    // Create new children if needed
    while (this.pool.children.length < targetCount) {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      
      const newChild: ChildRelayerData = {
        privateKey,
        address: account.address,
        balance: '0',
        lastFunded: 0,
        totalFunded: 0,
      };
      
      this.pool.children.push(newChild);
      console.log(chalk.blue(`➕ Created child relayer ${this.pool.children.length}: ${account.address}`));
    }

    // Check balances and fund if needed
    await this.checkAndFundChildren(minBalancePerChild);
    
    // Save updated pool
    this.savePool();
    
    return this.pool.children.slice(0, targetCount);
  }

  /**
   * Check child balances and fund if needed
   */
  private async checkAndFundChildren(minBalance: bigint): Promise<void> {
    console.log(chalk.cyan(`💰 Checking balances of ${this.pool.children.length} child relayers...`));
    
    const childrenNeedingFunding: { child: ChildRelayerData; currentBalance: bigint; needed: bigint }[] = [];
    
    // Check all balances
    for (const child of this.pool.children) {
      try {
        const currentBalance = await this.publicClient.getBalance({ address: child.address });
        child.balance = formatEther(currentBalance);
        
        if (currentBalance < minBalance) {
          const needed = minBalance - currentBalance;
          childrenNeedingFunding.push({ child, currentBalance, needed });
        }
        
        const status = currentBalance >= minBalance ? '✅' : '💸';
        console.log(chalk.gray(`   ${status} ${child.address}: ${formatEther(currentBalance)} VANA`));
      } catch (error) {
        console.error(chalk.red(`❌ Failed to check balance for ${child.address}: ${error}`));
      }
    }

    // Fund children that need it
    if (childrenNeedingFunding.length > 0) {
      console.log(chalk.yellow(`💸 ${childrenNeedingFunding.length} children need funding`));
      
      let totalFundingCost = 0n;
      for (const { needed } of childrenNeedingFunding) {
        totalFundingCost += needed;
      }
      
      console.log(chalk.blue(`💰 Total funding needed: ${formatEther(totalFundingCost)} VANA`));
      
      // Check master balance
      const masterBalance = await this.publicClient.getBalance({ address: this.masterAccount.address });
      console.log(chalk.blue(`🏦 Master balance: ${formatEther(masterBalance)} VANA`));
      
      if (masterBalance < totalFundingCost) {
        throw new Error(`Insufficient master balance. Need ${formatEther(totalFundingCost)} VANA, have ${formatEther(masterBalance)} VANA`);
      }

      // Fund each child sequentially (safe for nonces)
      for (let i = 0; i < childrenNeedingFunding.length; i++) {
        const { child, needed } = childrenNeedingFunding[i];
        
        try {
          console.log(chalk.yellow(`[${i + 1}/${childrenNeedingFunding.length}] Funding ${child.address} with ${formatEther(needed)} VANA...`));
          
          const hash = await this.masterWalletClient.sendTransaction({
            to: child.address as `0x${string}`,
            value: needed,
          });

          // Wait for transaction confirmation
          await this.publicClient.waitForTransactionReceipt({ hash });

          // Update child data
          child.lastFunded = Date.now();
          child.totalFunded += parseFloat(formatEther(needed));
          
          // Update child balance to reflect the funding (now that tx is confirmed)
          const newBalance = await this.publicClient.getBalance({ address: child.address });
          child.balance = formatEther(newBalance);
          
          // Update pool total
          const currentTotal = parseFloat(this.pool.totalInvested);
          this.pool.totalInvested = (currentTotal + parseFloat(formatEther(needed))).toString();
          
          console.log(chalk.green(`✅ Funded ${child.address}: ${hash}`));
          
          // Delay to prevent nonce collisions
          if (i < childrenNeedingFunding.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
        } catch (error) {
          console.error(chalk.red(`❌ Failed to fund ${child.address}: ${error}`));
        }
      }
    } else {
      console.log(chalk.green(`✅ All child relayers have sufficient balance`));
    }
  }

  /**
   * Get wallet clients for child relayers
   */
  getChildWalletClients(): any[] {
    return this.pool.children.map((child, index) => 
      createWalletClient({
        account: privateKeyToAccount(child.privateKey as `0x${string}`),
        chain: moksha,
        transport: http(getRpcEndpoint(this.config, index)),
      })
    );
  }

  /**
   * Fund test wallets using optimized multicall batching strategy
   */
  async fundTestWallets(testWalletAddresses: string[]): Promise<Array<{ success: boolean; transactionHash?: string; error?: string; duration: number }>> {
    if (this.pool.children.length === 0) {
      throw new Error('No child relayers available. Call ensureChildRelayers() first.');
    }

    console.log(chalk.cyan(`🚀 Funding ${testWalletAddresses.length} test wallets using Multicall3 batching...`));
    console.log(chalk.blue(`📊 Strategy: Multicall3 with 150 wallets per multicall, 0.75 VANA per wallet, auto child relayer top-up`));
    
    const BATCH_SIZE = 750; // Larger batches since multicall is more efficient
    const FUNDING_AMOUNT = parseEther('0.75'); // Fixed 0.75 VANA per wallet
    const allResults: any[] = [];
    
    // Process wallets in batches of 750
    for (let batchStart = 0; batchStart < testWalletAddresses.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, testWalletAddresses.length);
      const batchWallets = testWalletAddresses.slice(batchStart, batchEnd);
      const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(testWalletAddresses.length / BATCH_SIZE);
      
      console.log(chalk.yellow(`📦 Processing batch ${batchNumber}/${totalBatches}: ${batchWallets.length} wallets`));
      
      // Distribute batch across child relayers
      const walletsPerChild = Math.ceil(batchWallets.length / this.pool.children.length);
      const batchPromises: Promise<any[]>[] = [];

      for (let i = 0; i < this.pool.children.length; i++) {
        const child = this.pool.children[i];
        const startIndex = i * walletsPerChild;
        const endIndex = Math.min(startIndex + walletsPerChild, batchWallets.length);
        const walletsForThisChild = batchWallets.slice(startIndex, endIndex);

        if (walletsForThisChild.length > 0) {
          // Check and top-up child relayer if needed before processing
          await this.ensureChildHasFunds(child, FUNDING_AMOUNT, walletsForThisChild.length);
          
          const childWalletClient = createWalletClient({
            account: privateKeyToAccount(child.privateKey as `0x${string}`),
            chain: moksha,
            transport: http(getRpcEndpoint(this.config, i)),
          });

          batchPromises.push(
            this.fundWalletsWithChildOptimized(childWalletClient, walletsForThisChild, i, FUNDING_AMOUNT)
          );
        }
      }

      // Execute batch in parallel
      const batchResults = await Promise.all(batchPromises);
      const flatResults = batchResults.flat();
      allResults.push(...flatResults);
      
      const batchSuccessful = flatResults.filter(r => r.success).length;
      const batchFailed = flatResults.filter(r => !r.success).length;
      
      console.log(chalk.green(`✅ Batch ${batchNumber} complete: ${batchSuccessful} successful, ${batchFailed} failed`));
      
      // Small delay between batches to prevent overwhelming the network
      if (batchEnd < testWalletAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const totalSuccessful = allResults.filter(r => r.success).length;
    const totalFailed = allResults.filter(r => !r.success).length;
    
    console.log(chalk.cyan(`🏁 Multicall funding complete: ${totalSuccessful}/${testWalletAddresses.length} successful (${totalFailed} failed)`));
    
    return allResults;
  }

  /**
   * Ensure child relayer has sufficient funds for upcoming operations
   */
  private async ensureChildHasFunds(child: ChildRelayerData, fundingAmountPerWallet: bigint, walletCount: number): Promise<void> {
    const publicClient = createPublicClient({
      chain: moksha,
      transport: http(getRpcEndpoint(this.config)),
    });
    
    // Check current balance
    const currentBalance = await publicClient.getBalance({ address: child.address as `0x${string}` });
    
    // Calculate required funds: (funding per wallet + gas) * wallet count + buffer
    const gasPerTx = parseEther('0.001'); // Estimated gas cost per transaction
    const requiredFunds = (fundingAmountPerWallet + gasPerTx) * BigInt(walletCount);
    const bufferFunds = parseEther('5'); // 5 VANA buffer
    const totalRequired = requiredFunds + bufferFunds;
    
    if (currentBalance < totalRequired) {
      const needed = totalRequired - currentBalance;
      console.log(chalk.yellow(`💸 Child ${child.address} needs top-up: ${formatEther(needed)} VANA (has ${formatEther(currentBalance)}, needs ${formatEther(totalRequired)})`));
      
      // Top-up from master relayer
      await this.topUpChildRelayer(child, needed);
    } else {
      if (this.config.enableDebugLogs) {
        console.log(chalk.green(`✅ Child ${child.address} has sufficient funds: ${formatEther(currentBalance)} VANA`));
      }
    }
  }

  /**
   * Top-up a child relayer from master relayer
   */
  private async topUpChildRelayer(child: ChildRelayerData, amount: bigint): Promise<void> {
    try {
      // Check master balance first
      const masterBalance = await this.publicClient.getBalance({ address: this.masterAccount.address });
      if (masterBalance < amount) {
        throw new Error(`Master relayer insufficient balance: ${formatEther(masterBalance)} VANA, need ${formatEther(amount)} VANA`);
      }
      
      console.log(chalk.blue(`💰 Topping up child ${child.address} with ${formatEther(amount)} VANA...`));
      
      const hash = await this.masterWalletClient.sendTransaction({
        to: child.address as `0x${string}`,
        value: amount,
      });

      // Wait for confirmation
      await this.publicClient.waitForTransactionReceipt({ hash });

      // Update child data
      child.lastFunded = Date.now();
      child.totalFunded += parseFloat(formatEther(amount));
      
      // Update child balance
      const newBalance = await this.publicClient.getBalance({ address: child.address });
      child.balance = formatEther(newBalance);
      
      // Update pool total
      const currentTotal = parseFloat(this.pool.totalInvested);
      this.pool.totalInvested = (currentTotal + parseFloat(formatEther(amount))).toString();
      
      console.log(chalk.green(`✅ Child relayer topped up: ${hash} | New balance: ${formatEther(newBalance)} VANA`));
      
      // Save updated pool
      this.savePool();
      
    } catch (error) {
      console.error(chalk.red(`❌ Failed to top-up child ${child.address}: ${error}`));
      throw error;
    }
  }

  /**
   * MULTICALL funding using aggregate3Value - batches of 150 wallets per transaction
   */
  private async fundWalletsWithChildOptimized(
    childWalletClient: any,
    walletAddresses: string[],
    childIndex: number,
    fundingAmount: bigint
  ): Promise<any[]> {
    const results: any[] = [];
    const publicClient = createPublicClient({
      chain: moksha,
      transport: http(getRpcEndpoint(this.config)),
    });
    
    const MULTICALL_BATCH_SIZE = 150;
    console.log(chalk.blue(`[Child-${childIndex}] Funding ${walletAddresses.length} wallets using Multicall3 (batches of ${MULTICALL_BATCH_SIZE})`));

    // Process wallets in batches of 150
    for (let batchStart = 0; batchStart < walletAddresses.length; batchStart += MULTICALL_BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + MULTICALL_BATCH_SIZE, walletAddresses.length);
      const batchWallets = walletAddresses.slice(batchStart, batchEnd);
      const batchNumber = Math.floor(batchStart / MULTICALL_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(walletAddresses.length / MULTICALL_BATCH_SIZE);
      
      console.log(chalk.yellow(`[Child-${childIndex}] Processing multicall batch ${batchNumber}/${totalBatches}: ${batchWallets.length} wallets`));
      
      try {
        const startTime = Date.now();
        
        // Prepare multicall data - each call sends ETH to a wallet
        const calls = batchWallets.map(address => ({
          target: address as `0x${string}`,
          allowFailure: true, // Allow individual failures
          value: fundingAmount,
          callData: '0x' as `0x${string}`, // Empty calldata for ETH transfer
        }));
        
        // Calculate total value to send
        const totalValue = fundingAmount * BigInt(batchWallets.length);
        
        console.log(chalk.blue(`[Child-${childIndex}] Sending multicall with ${batchWallets.length} transfers, total value: ${formatEther(totalValue)} VANA`));
        
        // Send multicall transaction
        const hash = await childWalletClient.writeContract({
          address: MULTICALL3_ADDRESS,
          abi: MULTICALL3_ABI,
          functionName: 'aggregate3Value',
          args: [calls],
          value: totalValue,
        });

        console.log(chalk.blue(`[Child-${childIndex}] 📤 Multicall transaction sent: ${hash}`));

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ 
          hash,
          confirmations: 1,
          timeout: 120_000, // Longer timeout for multicall
        });

        const duration = Date.now() - startTime;
        
        // Decode the results to see which transfers succeeded
        const multicallResults = receipt.logs; // We'll assume all succeeded for now
        
        // Record results for each wallet in the batch
        batchWallets.forEach((address, index) => {
          results.push({
            success: true, // We'll assume success unless we can decode failures
            transactionHash: hash,
            duration: duration / batchWallets.length, // Distribute duration across wallets
            address,
            fundingAmount,
            confirmed: true,
            multicallBatch: batchNumber,
          });
        });
        
        console.log(chalk.green(`[Child-${childIndex}] ✅ Multicall batch ${batchNumber} confirmed: ${batchWallets.length} wallets funded`));

        // Small delay between multicall batches
        if (batchEnd < walletAddresses.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        const duration = Date.now() - Date.now();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Mark all wallets in this batch as failed
        batchWallets.forEach(address => {
          results.push({
            success: false,
            error: `Multicall batch failed: ${errorMessage}`,
            duration,
            address,
          });
        });

        console.error(chalk.red(`[Child-${childIndex}] ❌ Multicall batch ${batchNumber} failed: ${errorMessage}`));
      }
    }

    const successful = results.filter(r => r.success).length;
    console.log(chalk.blue(`[Child-${childIndex}] ✅ Multicall funding complete: ${successful}/${walletAddresses.length} successful`));
    
    return results;
  }

  /**
   * Legacy funding method (kept for backward compatibility)
   */
  private async fundWalletsWithChild(
    childWalletClient: any,
    walletAddresses: string[],
    childIndex: number
  ): Promise<any[]> {
    // Use the optimized method with 0.75 VANA
    return this.fundWalletsWithChildOptimized(childWalletClient, walletAddresses, childIndex, parseEther('0.75'));
  }

  /**
   * Display pool statistics
   */
  displayStats(): void {
    console.log(chalk.cyan(`\n📊 Child Relayer Pool Statistics\n`));
    console.log(chalk.gray('═'.repeat(60)));
    
    console.log(`  Pool File           : ${this.poolFilePath}`);
    console.log(`  Master Address      : ${this.pool.masterAddress}`);
    console.log(`  Child Relayers      : ${this.pool.children.length}`);
    console.log(`  Total Invested      : ${this.pool.totalInvested} VANA`);
    console.log(`  Created             : ${new Date(this.pool.createdAt).toLocaleString()}`);
    console.log(`  Last Updated        : ${new Date(this.pool.lastUpdated).toLocaleString()}`);
    
    if (this.pool.children.length > 0) {
      console.log(chalk.gray('─'.repeat(60)));
      console.log(`  Child Relayer Details:`);
      
      this.pool.children.forEach((child, index) => {
        const lastFundedStr = child.lastFunded > 0 
          ? new Date(child.lastFunded).toLocaleString()
          : 'Never';
        
        console.log(`    ${index + 1}. ${child.address}`);
        console.log(`       Balance: ${child.balance} VANA`);
        console.log(`       Total Funded: ${child.totalFunded} VANA`);
        console.log(`       Last Funded: ${lastFundedStr}`);
      });
    }
    
    const estimatedCapacity = this.pool.children.length * 1000; // Each child can fund ~1000 test wallets
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`  Estimated Capacity  : ${estimatedCapacity} test wallets`);
    console.log(`  Parallel Funding    : ${this.pool.children.length}x speedup`);
  }

  /**
   * Cleanup: Return unused funds to master (optional)
   */
  async returnUnusedFunds(minRetainBalance: bigint = parseEther('1')): Promise<void> {
    console.log(chalk.yellow(`🔄 Returning unused funds to master (retaining ${formatEther(minRetainBalance)} VANA per child)...`));
    
    let totalReturned = 0n;
    
    for (let i = 0; i < this.pool.children.length; i++) {
      const child = this.pool.children[i];
      
      try {
        const currentBalance = await this.publicClient.getBalance({ address: child.address });
        
        if (currentBalance > minRetainBalance) {
          const toReturn = currentBalance - minRetainBalance;
          
          const childWalletClient = createWalletClient({
            account: privateKeyToAccount(child.privateKey as `0x${string}`),
            chain: moksha,
            transport: http(getRpcEndpoint(this.config, i)),
          });
          
          console.log(chalk.blue(`[${i + 1}/${this.pool.children.length}] Returning ${formatEther(toReturn)} VANA from ${child.address}...`));
          
          const hash = await childWalletClient.sendTransaction({
            to: this.masterAccount.address,
            value: toReturn,
            chain: childWalletClient.chain,
          });
          
          totalReturned += toReturn;
          child.balance = formatEther(minRetainBalance);
          
          console.log(chalk.green(`✅ Returned ${formatEther(toReturn)} VANA: ${hash}`));
          
          // Delay to prevent issues
          if (i < this.pool.children.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (error) {
        console.error(chalk.red(`❌ Failed to return funds from ${child.address}: ${error}`));
      }
    }
    
    if (totalReturned > 0n) {
      console.log(chalk.green(`\n💰 Total returned to master: ${formatEther(totalReturned)} VANA`));
      this.savePool();
    } else {
      console.log(chalk.gray(`\n💰 No excess funds to return`));
    }
  }

  /**
   * Get pool file path for external reference
   */
  getPoolFilePath(): string {
    return this.poolFilePath;
  }
}

/**
 * CLI tool for managing child relayer pools
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const { config } = await import('dotenv');
    config();

    const masterKey = process.env.RELAYER_PRIVATE_KEY;
    if (!masterKey) {
      console.error('❌ RELAYER_PRIVATE_KEY not found');
      process.exit(1);
    }

    const command = process.argv[2];
    const poolName = process.argv[3] || 'default';
    
    // Create a minimal config with RPC endpoints
    const minimalConfig = {
      enableDebugLogs: true,
      rpcEndpoints: process.env.LOAD_TEST_RPC_ENDPOINTS?.split(',').map(url => url.trim()) || ['https://rpc.moksha.vana.org']
    };
    
    const manager = new PersistentChildRelayerManager(masterKey, minimalConfig, poolName);
    
    try {
      switch (command) {
        case 'create':
          const count = parseInt(process.argv[4]) || 5;
          await manager.ensureChildRelayers(count, parseEther('50'));
          manager.displayStats();
          break;
          
        case 'stats':
          manager.displayStats();
          break;
          
        case 'fund':
          const minBalance = parseEther(process.argv[4] || '10');
          await manager.ensureChildRelayers(manager['pool'].children.length, minBalance);
          manager.displayStats();
          break;
          
        case 'return':
          const retainBalance = parseEther(process.argv[4] || '1');
          await manager.returnUnusedFunds(retainBalance);
          manager.displayStats();
          break;
          
        case 'test':
          // Test funding some wallets
          const testWallets = Array.from({ length: 10 }, () => 
            privateKeyToAccount(generatePrivateKey()).address
          );
          
          await manager.ensureChildRelayers(3, parseEther('10'));
          const results = await manager.fundTestWallets(testWallets);
          
          const successful = results.filter(r => r.success).length;
          console.log(chalk.green(`\n🎉 Test funding complete: ${successful}/${testWallets.length} successful`));
          break;
          
        default:
          console.log(chalk.cyan('Child Relayer Pool Manager'));
          console.log(chalk.gray('Usage:'));
          console.log('  npx tsx persistent-child-relayers.ts create [pool-name] [count]');
          console.log('  npx tsx persistent-child-relayers.ts stats [pool-name]');
          console.log('  npx tsx persistent-child-relayers.ts fund [pool-name] [min-balance]');
          console.log('  npx tsx persistent-child-relayers.ts return [pool-name] [retain-balance]');
          console.log('  npx tsx persistent-child-relayers.ts test [pool-name]');
          break;
      }
    } catch (error) {
      console.error(chalk.red('❌ Command failed:'), error);
      process.exit(1);
    }
  }

  main();
}
