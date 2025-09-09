#!/usr/bin/env node

import { VanaLoadTestClient } from '../../src/client/load-test-client.js';
import { LoadTestApiServer } from '../../src/server/api-server.js';
import { loadConfig } from '../../src/config/loader.js';
import { generateWalletPrompt } from '../../src/utils/prompt-generator.js';
import { faker } from '@faker-js/faker';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseEther, formatEther } from 'viem';
import { moksha } from '@opendatalabs/vana-sdk/chains';
import chalk from 'chalk';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Milestone 5 V2 with Master Relayer: Optimized Streaming Load Test
 * 
 * This version uses the master relayer wallet from .env to submit transactions
 * on behalf of end-users, enabling gasless transactions for users.
 * 
 * Improvements:
 * - Master relayer wallet submits all transactions (gasless for users)
 * - End-user wallets only used for signing/encryption
 * - No need to fund individual user wallets
 * - SDK TransactionOptions for native gas configuration and timeout control
 * - Complete console logging to file
 * 
 * Usage:
 * # Standard test (requires RELAYER_PRIVATE_KEY in .env)
 * npx tsx milestones/ms-05/test-streaming-load-relayer.ts
 * 
 * # High gas configuration (recommended for timeout issues)
 * PREMIUM_GAS_MULTIPLIER=50 npx tsx milestones/ms-05/test-streaming-load-relayer.ts
 * 
 * # Custom parameters
 * npx tsx milestones/ms-05/test-streaming-load-relayer.ts --users 100 --rate 2.0 --concurrency 20
 */

interface StreamingConfigV2 {
  totalUsers: number;
  arrivalRateUsersPerSecond: number;
  testDurationMinutes: number;
  maxConcurrentUsers: number;
  
  // Funding Strategy - Not needed with master relayer
  childRelayers: number; // Not used in relayer mode
  preFundBuffer: number; // Not used in relayer mode
  fundingAmountPerChild: string; // Not used in relayer mode
  
  // Ramp Patterns (Artillery-style)
  rampUpDurationSeconds: number;
  sustainDurationSeconds: number;
  rampDownDurationSeconds: number;
}

interface WalletInfo {
  privateKey: string;
  address: string;
  funded: boolean;
}

interface UserFlowResult {
  success: boolean;
  duration: number;
  walletAddress: string;
  error?: string;
  transactionHash?: string;
  permissionId?: string;
  startTime: number;
  endTime: number;
  userId: string;
  transactionCost?: bigint; // Actual gas cost in wei
  balanceBefore?: bigint;
  balanceAfter?: bigint;
}

interface BlockStats {
  blockNumber: bigint;
  dataPortabilityTxs: string[]; // Our transaction hashes in this block
  dataPortabilityGasUsed: bigint; // Total gas used by our txs
  totalTxsInBlock?: number; // Total transactions in the block
  blockGasLimit: bigint; // Block gas limit (30M for Moksha)
  blockGasUsed?: bigint; // Total gas used in the block
  gasUtilization?: number; // Percentage of block gas used by our txs
  timestamp?: number;
}

interface StreamingMetricsV2 {
  totalUsers: number;
  completedUsers: number;
  successfulUsers: number;
  failedUsers: number;
  activeUsers: number;
  peakActiveUsers: number;
  startTime: number;
  endTime?: number;
  responseTimes: number[];
  errorsByType: { [key: string]: number };
  transactionCosts: bigint[]; // Track actual transaction costs
  fundingStats: {
    childRelayers: number;
    preFunded: number;
    fundingDuration: number;
  };
  phases: {
    rampUp: { startTime: number; endTime?: number; usersCompleted: number };
    sustain: { startTime?: number; endTime?: number; usersCompleted: number };
    rampDown: { startTime?: number; endTime?: number; usersCompleted: number };
  };
  blockStats: {
    txToBlock: Map<string, bigint>; // Map from tx hash to block number
    blockMap: Map<string, BlockStats>; // Map from block number to block stats
    totalBlocks: number; // Total unique blocks used
    avgTxsPerBlock: number; // Average of our txs per block
    maxTxsPerBlock: number; // Maximum of our txs in a single block
    minTxsPerBlock: number; // Minimum of our txs in a single block
    avgBlockUtilization: number; // Average % of block used by our txs
  };
  throughput: {
    completionTimestamps: number[]; // Timestamps when users completed
    peakThroughputPerMinute: number; // Max users completed in any 1-minute window
    peakThroughputWindowStart?: number; // Start time of peak window
    currentWindowCompletions: number[]; // Completions in current minute window
  };
}

/**
 * Artillery-style user stream generator
 * Implements realistic arrival patterns with ramp up/down
 * 
 * Behavior:
 * - Ensures all target users are generated before completing
 * - During ramp-down, maintains minimum rate needed to meet target
 * - Extends ramp-down phase if necessary to complete all users
 * - Prevents hanging by adapting rate dynamically
 */
class ArtilleryStyleUserStream extends EventEmitter {
  private config: StreamingConfigV2;
  private usersGenerated = 0;
  private isActive = false;
  private currentPhase: 'rampUp' | 'sustain' | 'rampDown' = 'rampUp';
  private phaseStartTime: number = 0;
  
  constructor(config: StreamingConfigV2) {
    super();
    this.config = config;
  }
  
  start(): void {
    this.isActive = true;
    this.phaseStartTime = Date.now();
    this.generateUsers();
  }
  
  stop(): void {
    this.isActive = false;
  }
  
  private async generateUsers(): Promise<void> {
    console.log(`[UserStream] Starting user generation for ${this.config.totalUsers} users`);
    console.log(`[UserStream] Target rate: ${this.config.arrivalRateUsersPerSecond} users/s`);
    
    // For very small tests (<=10 users), use simplified generation
    if (this.config.totalUsers <= 10) {
      console.log(`[UserStream] Using simplified generation for small test (${this.config.totalUsers} users)`);
      
      while (this.isActive && this.usersGenerated < this.config.totalUsers) {
        const userId = `user-${this.usersGenerated + 1}`;
        console.log(`[UserStream] Generating ${userId}`);
        this.emit('user', userId);
        this.usersGenerated++;
        
        // Simple fixed delay between users for small tests
        const delayMs = 1000; // 1 second between users
        if (this.usersGenerated < this.config.totalUsers) {
          console.log(`[UserStream] Waiting ${delayMs}ms before next user`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    } else {
      // Normal phased generation for larger tests
      console.log(`[UserStream] Phase durations - Ramp: ${this.config.rampUpDurationSeconds}s, Sustain: ${this.config.sustainDurationSeconds}s, RampDown: ${this.config.rampDownDurationSeconds}s`);
      
      // Generate users based on phases and rates, not just total count
      while (this.isActive) {
        const currentRate = this.getCurrentArrivalRate();
        const elapsed = (Date.now() - this.phaseStartTime) / 1000;
        
        if (currentRate > 0 && this.usersGenerated < this.config.totalUsers) {
          const userId = `user-${this.usersGenerated + 1}`;
          console.log(`[UserStream] Generating ${userId}`);
          this.emit('user', userId);
          this.usersGenerated++;
          
          // Calculate delay for next user based on current rate
          const delayMs = (1000 / currentRate);
          if (this.config.totalUsers <= 10) {
            // For small tests, show the wait time
            console.log(`[UserStream] Waiting ${delayMs.toFixed(0)}ms before next user`);
          }
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          // Wait a bit during ramp periods or when target reached
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Update phase if needed (this may set isActive to false)
        this.updatePhase();
        
        // For small tests, check if we should move to next phase early
        if (this.shouldAdvancePhaseEarly()) {
          console.log(`[UserStream] Advancing phase early for small test`);
          this.advanceToNextPhase();
        }
        
        // Stop if we've reached the target
        if (this.usersGenerated >= this.config.totalUsers) {
          console.log(`[UserStream] Target users reached: ${this.usersGenerated}/${this.config.totalUsers}`);
          break;
        }
      }
    }
    
    console.log(`[UserStream] User generation complete. Generated ${this.usersGenerated} users`);
    this.emit('complete');
  }
  
  private shouldAdvancePhaseEarly(): boolean {
    // For small tests (< 20 users), advance phase if we've been idle too long
    if (this.config.totalUsers < 20) {
      const elapsed = (Date.now() - this.phaseStartTime) / 1000;
      const currentRate = this.getCurrentArrivalRate();
      
      // If we've generated all users we can at current rate, move on
      if (this.currentPhase === 'rampUp' && currentRate > 0) {
        const expectedUsers = Math.floor(elapsed * currentRate);
        if (this.usersGenerated >= Math.min(expectedUsers, this.config.totalUsers)) {
          return elapsed > 5; // Move on after 5 seconds for small tests
        }
      }
    }
    return false;
  }
  
  private advanceToNextPhase(): void {
    if (this.currentPhase === 'rampUp') {
      this.currentPhase = 'sustain';
      this.phaseStartTime = Date.now();
      this.emit('phaseChange', 'sustain');
    } else if (this.currentPhase === 'sustain') {
      this.currentPhase = 'rampDown';
      this.phaseStartTime = Date.now();
      this.emit('phaseChange', 'rampDown');
    }
  }
  
  private getCurrentArrivalRate(): number {
    const elapsed = (Date.now() - this.phaseStartTime) / 1000;
    
    switch (this.currentPhase) {
      case 'rampUp':
        // Linear ramp from 0 to target rate
        // Start with a minimum rate to avoid waiting at the beginning
        const rampProgress = Math.min(elapsed / this.config.rampUpDurationSeconds, 1);
        const rate = this.config.arrivalRateUsersPerSecond * rampProgress;
        // Ensure minimum rate of 0.1 users/s (1 user per 10 seconds) to avoid excessive waiting
        return Math.max(rate, Math.min(0.1, this.config.arrivalRateUsersPerSecond * 0.1));
        
      case 'sustain':
        // Full target rate
        return this.config.arrivalRateUsersPerSecond;
        
      case 'rampDown':
        // Check if we've met our target
        if (this.usersGenerated >= this.config.totalUsers) {
          return 0;
        }
        
        // Calculate remaining users and time
        const remainingUsers = this.config.totalUsers - this.usersGenerated;
        const remainingTime = Math.max(this.config.rampDownDurationSeconds - elapsed, 1);
        
        // Calculate minimum rate needed to complete all users
        const minRateNeeded = remainingUsers / remainingTime;
        
        // Linear ramp from target rate to 0
        const rampDownProgress = Math.min(elapsed / this.config.rampDownDurationSeconds, 1);
        const plannedRate = this.config.arrivalRateUsersPerSecond * (1 - rampDownProgress);
        
        // Use the higher of planned rate or minimum needed rate
        // This ensures we generate all users before rate drops to 0
        const rampDownRate = Math.max(plannedRate, minRateNeeded);
        
        return rampDownRate;
        
      default:
        return 0;
    }
  }
  
  private updatePhase(): void {
    const totalElapsed = (Date.now() - this.phaseStartTime) / 1000;
    
    if (this.currentPhase === 'rampUp' && totalElapsed >= this.config.rampUpDurationSeconds) {
      this.currentPhase = 'sustain';
      this.phaseStartTime = Date.now();
      this.emit('phaseChange', 'sustain');
    } else if (this.currentPhase === 'sustain' && totalElapsed >= this.config.sustainDurationSeconds) {
      this.currentPhase = 'rampDown';
      this.phaseStartTime = Date.now();
      this.emit('phaseChange', 'rampDown');
    } else if (this.currentPhase === 'rampDown' && totalElapsed >= this.config.rampDownDurationSeconds) {
      // Check if we've met the target
      if (this.usersGenerated >= this.config.totalUsers) {
        // Target met, stop generation
        this.isActive = false;
        console.log(`[UserStream] Ramp-down complete. Successfully generated all ${this.usersGenerated} users`);
      } else {
        // Extend ramp-down if we haven't met the target yet
        const remainingUsers = this.config.totalUsers - this.usersGenerated;
        console.log(chalk.yellow(`[UserStream] Extending ramp-down to complete remaining ${remainingUsers} users...`));
        // Don't stop, keep generating at minimum rate
      }
    }
  }
  
  getStatus(): any {
    return {
      generated: this.usersGenerated,
      phase: this.currentPhase,
      rate: this.getCurrentArrivalRate(),
    };
  }
}

/**
 * Simplified wallet pool for master relayer mode
 * Only generates wallets, no funding needed
 */
class SimplifiedWalletPool {
  private wallets: WalletInfo[] = [];
  private usedIndex = 0;
  
  constructor() {
    // Pre-generate a pool of wallets
    this.generateWallets(1000); // Generate 1000 wallets upfront
  }
  
  private generateWallets(count: number): void {
    for (let i = 0; i < count; i++) {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      
      this.wallets.push({
        privateKey,
        address: account.address,
        funded: false, // Not relevant in relayer mode
      });
    }
  }
  
  async getWallet(): Promise<WalletInfo> {
    // Generate more if needed
    if (this.usedIndex >= this.wallets.length) {
      this.generateWallets(100);
    }
    
    const wallet = this.wallets[this.usedIndex];
    this.usedIndex++;
    return wallet;
  }
  
  getStats(): any {
    return {
      total: this.wallets.length,
      used: this.usedIndex,
      available: this.wallets.length - this.usedIndex,
    };
  }
}

/**
 * Main Streaming Load Test Manager V2 with Master Relayer
 */
class StreamingLoadTestV2Relayer {
  private config: any;
  private streamingConfig: StreamingConfigV2;
  private apiServer?: LoadTestApiServer;
  private walletPool?: SimplifiedWalletPool;
  private userStream?: ArtilleryStyleUserStream;
  private metrics: StreamingMetricsV2;
  private activeFlows = new Map<string, Promise<UserFlowResult>>();
  private activeBlockTracking = new Set<Promise<void>>(); // Track active block stat promises
  private stopping = false;
  private masterRelayerPrivateKey?: string;
  private masterRelayerAddress?: string;
  private metricsInterval?: NodeJS.Timeout;
  
  // Logging
  private logFile: string;
  private logStream?: fs.WriteStream;
  private originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
  };
  
  constructor(config: any, streamingConfig: StreamingConfigV2) {
    this.config = config;
    this.streamingConfig = streamingConfig;
    
    // Setup logging - complete log file with all console output
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(process.cwd(), `load-test-relayer-${timestamp}.log`);
    this.setupGracefulShutdown();
    this.setupDualLogging();
    
    this.metrics = {
      totalUsers: streamingConfig.totalUsers,
      completedUsers: 0,
      successfulUsers: 0,
      failedUsers: 0,
      activeUsers: 0,
      peakActiveUsers: 0,
      startTime: Date.now(),
      responseTimes: [],
      errorsByType: {},
      transactionCosts: [],
      fundingStats: {
        childRelayers: 0, // Not used in relayer mode
        preFunded: 0, // Not used in relayer mode
        fundingDuration: 0, // Not used in relayer mode
      },
      phases: {
        rampUp: { startTime: Date.now(), usersCompleted: 0 },
        sustain: { usersCompleted: 0 },
        rampDown: { usersCompleted: 0 },
      },
      blockStats: {
        txToBlock: new Map(),
        blockMap: new Map(),
        totalBlocks: 0,
        avgTxsPerBlock: 0,
        maxTxsPerBlock: 0,
        minTxsPerBlock: Number.MAX_SAFE_INTEGER,
        avgBlockUtilization: 0,
      },
      throughput: {
        completionTimestamps: [],
        peakThroughputPerMinute: 0,
        peakThroughputWindowStart: undefined,
        currentWindowCompletions: [],
      },
    };

    // Initialize components
    this.walletPool = new SimplifiedWalletPool();
    this.userStream = new ArtilleryStyleUserStream(streamingConfig);
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    if (this.logStream && !this.logStream.destroyed) {
      this.logStream.write(logEntry);
    }
  }
  
  private setupDualLogging(): void {
    // Override console methods to write to both console and file
    const writeToFile = (level: string, ...args: any[]) => {
      const timestamp = new Date().toISOString();
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            // Handle BigInt serialization by converting to string
            return JSON.stringify(arg, (key, value) => 
              typeof value === 'bigint' ? value.toString() : value
            );
          } catch (error) {
            // Fallback for other serialization errors
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      
      // Strip ANSI color codes for file output
      const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, '');
      
      if (this.logStream && !this.logStream.destroyed) {
        this.logStream.write(`[${timestamp}] [${level}] ${cleanMessage}\n`);
      }
    };
    
    // Override console methods
    console.log = (...args: any[]) => {
      this.originalConsole.log(...args);
      writeToFile('LOG', ...args);
    };
    
    console.error = (...args: any[]) => {
      this.originalConsole.error(...args);
      writeToFile('ERROR', ...args);
    };
    
    console.warn = (...args: any[]) => {
      this.originalConsole.warn(...args);
      writeToFile('WARN', ...args);
    };
    
    console.info = (...args: any[]) => {
      this.originalConsole.info(...args);
      writeToFile('INFO', ...args);
    };
  }
  
  private setupGracefulShutdown(): void {
    // Setup log stream
    this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    
    this.log('🚀 Load test with master relayer started');
    
    console.log(chalk.blue(`📝 Complete log file: ${this.logFile}`));
    console.log(chalk.yellow(`💡 All console output will be saved to the log file`));
    
    // Handle shutdown signals
    const cleanup = async () => {
      if (this.stopping) return;
      this.stopping = true;
      
      console.log(chalk.yellow('\n⏹️  Gracefully shutting down...'));
      this.log('Shutdown initiated');
      
      // Stop user generation
      this.userStream?.stop();
      
      // Stop metrics display
      this.stopMetricsDisplay();
      
      // Wait for active flows to complete (with timeout)
      const shutdownTimeout = 30000; // 30 seconds
      const shutdownStart = Date.now();
      
      while (this.activeFlows.size > 0 && (Date.now() - shutdownStart) < shutdownTimeout) {
        console.log(chalk.gray(`   Waiting for ${this.activeFlows.size} active flows to complete...`));
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Generate final report
      this.generateFinalReport();
      
      // Cleanup
      await this.apiServer?.stop();
      
      // Restore console methods
      console.log = this.originalConsole.log;
      console.error = this.originalConsole.error;
      console.warn = this.originalConsole.warn;
      console.info = this.originalConsole.info;
      
      // Close log stream
      if (this.logStream) {
        this.log('Shutdown complete');
        this.logStream.end();
      }
      
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
  
  async run(): Promise<void> {
    console.log(chalk.cyan.bold('\n🚀 Streaming Load Test V2 with Master Relayer'));
    console.log(chalk.gray('═'.repeat(60)));
    
    // Load and validate master relayer wallet
    await this.loadMasterRelayerWallet();
    
    // Start API server
    console.log(chalk.yellow('\n📡 Starting API server...'));
    this.apiServer = new LoadTestApiServer(this.config, 3001);
    await this.apiServer.start();
    console.log(chalk.green('✅ API server ready'));
    
    // Display test configuration
    console.log(chalk.cyan('\n📊 Test Configuration:'));
    console.log(`   Total Users: ${chalk.white(this.streamingConfig.totalUsers)}`);
    console.log(`   Arrival Rate: ${chalk.white(this.streamingConfig.arrivalRateUsersPerSecond)} users/second`);
    console.log(`   Max Concurrent: ${chalk.white(this.streamingConfig.maxConcurrentUsers)}`);
    console.log(`   Master Relayer: ${chalk.white(this.masterRelayerAddress)}`);
    console.log(`   Premium Gas Multiplier: ${chalk.white(this.config.premiumGasMultiplier)}x`);
    
    console.log(chalk.cyan('\n⏱️  Phase Durations:'));
    console.log(`   Ramp Up: ${chalk.white(this.streamingConfig.rampUpDurationSeconds)}s`);
    console.log(`   Sustain: ${chalk.white(this.streamingConfig.sustainDurationSeconds)}s`);
    console.log(`   Ramp Down: ${chalk.white(this.streamingConfig.rampDownDurationSeconds)}s`);
    
    // Check master relayer balance
    await this.checkMasterRelayerBalance();
    
    // Start user stream
    console.log(chalk.cyan('\n🌊 Starting user stream...'));
    console.log(chalk.gray('═'.repeat(60)));
    
    this.setupUserStreamHandlers();
    this.userStream!.start();
    
    // Start metrics display
    this.startMetricsDisplay();
    
    // Wait for completion
    await new Promise<void>((resolve) => {
      this.userStream!.once('complete', () => {
        const status = this.userStream!.getStatus();
        if (status.generated < this.streamingConfig.totalUsers) {
          console.log(chalk.yellow(`\n⚠️  User generation stopped after phase completion: ${status.generated}/${this.streamingConfig.totalUsers} users`));
        } else {
          console.log(chalk.green(`\n✅ All ${status.generated} users generated`));
        }
        resolve();
      });
    });
    
    // Wait for all active flows to complete
    console.log(chalk.yellow('\n⏳ Waiting for active flows to complete...'));
    while (this.activeFlows.size > 0) {
      console.log(chalk.gray(`   ${this.activeFlows.size} flows remaining...`));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Wait for all block tracking to complete
    if (this.activeBlockTracking.size > 0) {
      console.log(chalk.yellow(`\n⏳ Waiting for ${this.activeBlockTracking.size} block stat operations to complete...`));
      await Promise.all(Array.from(this.activeBlockTracking));
      console.log(chalk.green('✅ Block tracking complete'));
    }
    
    // Stop metrics display before generating final report
    this.stopMetricsDisplay();
    
    // Generate final report
    this.generateFinalReport();
    
    // Cleanup
    await this.apiServer.stop();
    
    // Restore console and close log
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
    
    if (this.logStream) {
      this.log('Test completed successfully');
      this.logStream.end();
    }
  }
  
  private async loadMasterRelayerWallet(): Promise<void> {
    const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerPrivateKey) {
      throw new Error('RELAYER_PRIVATE_KEY not found in .env file');
    }
    
    // Validate and format the relayer private key
    const formattedPrivateKey = relayerPrivateKey.startsWith('0x') 
      ? relayerPrivateKey 
      : `0x${relayerPrivateKey}`;
    
    if (formattedPrivateKey.length !== 66) {
      throw new Error(`Invalid RELAYER_PRIVATE_KEY length: expected 66 characters (0x + 64 hex), got ${formattedPrivateKey.length}`);
    }
    
    const relayerAccount = privateKeyToAccount(formattedPrivateKey as `0x${string}`);
    this.masterRelayerPrivateKey = formattedPrivateKey;
    this.masterRelayerAddress = relayerAccount.address;
    
    console.log(chalk.green(`✅ Master relayer wallet loaded: ${this.masterRelayerAddress}`));
  }
  
  private async checkMasterRelayerBalance(): Promise<void> {
    const { createPublicClient, http } = await import('viem');
    const publicClient = createPublicClient({
      chain: moksha,
      transport: http(this.config.rpcEndpoints[0]),
    });
    
    const balance = await publicClient.getBalance({ address: this.masterRelayerAddress as `0x${string}` });
    const balanceInVana = formatEther(balance);
    
    // Estimate cost per transaction (rough estimate)
    const estimatedGasPerTx = 600000n;
    const estimatedGasPrice = 30n * 1_000_000_000n; // 30 gwei
    const estimatedCostPerTx = estimatedGasPerTx * estimatedGasPrice * BigInt(this.config.premiumGasMultiplier || 1);
    const totalEstimatedCost = estimatedCostPerTx * BigInt(this.streamingConfig.totalUsers);
    const totalEstimatedCostInVana = formatEther(totalEstimatedCost);
    
    console.log(chalk.cyan('\n💰 Master Relayer Balance Check:'));
    console.log(`   Current Balance: ${chalk.white(balanceInVana)} VANA`);
    console.log(`   Estimated Cost: ${chalk.white(totalEstimatedCostInVana)} VANA`);
    console.log(`   Estimated per TX: ${chalk.white(formatEther(estimatedCostPerTx))} VANA`);
    
    if (balance < totalEstimatedCost) {
      console.log(chalk.yellow(`   ⚠️  Balance might be insufficient for ${this.streamingConfig.totalUsers} transactions`));
    } else {
      console.log(chalk.green(`   ✅ Balance sufficient for estimated ${this.streamingConfig.totalUsers} transactions`));
    }
  }
  
  private setupUserStreamHandlers(): void {
    this.userStream!.on('user', async (userId: string) => {
      // Enforce max concurrent users
      while (this.activeFlows.size >= this.streamingConfig.maxConcurrentUsers) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Execute user flow
      const flowPromise = this.executeUserFlow(userId);
      this.activeFlows.set(userId, flowPromise);
      
      // Update metrics
      this.metrics.activeUsers = this.activeFlows.size;
      if (this.metrics.activeUsers > this.metrics.peakActiveUsers) {
        this.metrics.peakActiveUsers = this.metrics.activeUsers;
      }
      
      // Handle completion
      flowPromise.then(result => {
        this.activeFlows.delete(userId);
        this.metrics.activeUsers = this.activeFlows.size;
        this.metrics.completedUsers++;
        
        // Track completion timestamp for throughput calculation
        const completionTime = Date.now();
        this.metrics.throughput.completionTimestamps.push(completionTime);
        this.updatePeakThroughput(completionTime);
        
        if (result.success) {
          this.metrics.successfulUsers++;
          console.log(`[Stats] User ${userId} succeeded with tx: ${result.transactionHash}`);
        } else {
          this.metrics.failedUsers++;
          const errorType = this.extractErrorType(result.error || '');
          this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
          console.log(`[Stats] User ${userId} failed: ${errorType}`);
        }
        
        this.metrics.responseTimes.push(result.duration);
        if (result.transactionCost) {
          this.metrics.transactionCosts.push(result.transactionCost);
        }
        
        // Update phase metrics
        this.updatePhaseMetrics();
      });
    });
    
    this.userStream!.on('phaseChange', (phase: string) => {
      console.log(chalk.blue(`\n📊 Phase changed to: ${phase.toUpperCase()}`));
      this.updatePhaseTimestamps(phase);
    });
  }
  
  private updatePhaseMetrics(): void {
    const streamStatus = this.userStream!.getStatus();
    switch (streamStatus.phase) {
      case 'rampUp':
        this.metrics.phases.rampUp.usersCompleted++;
        break;
      case 'sustain':
        this.metrics.phases.sustain.usersCompleted++;
        break;
      case 'rampDown':
        this.metrics.phases.rampDown.usersCompleted++;
        break;
    }
  }
  
  /**
   * Update peak throughput using sliding 1-minute window
   */
  private updatePeakThroughput(completionTime: number): void {
    const oneMinuteAgo = completionTime - 60000; // 1 minute in milliseconds
    
    // Remove completions older than 1 minute from the current window
    this.metrics.throughput.currentWindowCompletions = 
      this.metrics.throughput.completionTimestamps.filter(
        timestamp => timestamp > oneMinuteAgo
      );
    
    // Count completions in the current 1-minute window
    const currentWindowCount = this.metrics.throughput.currentWindowCompletions.length;
    
    // Update peak if current window has more completions
    if (currentWindowCount > this.metrics.throughput.peakThroughputPerMinute) {
      this.metrics.throughput.peakThroughputPerMinute = currentWindowCount;
      this.metrics.throughput.peakThroughputWindowStart = oneMinuteAgo;
      
      // Log when we hit a new peak
      console.log(chalk.magenta(
        `📈 New peak throughput: ${currentWindowCount} users/minute`
      ));
    }
  }
  
  private updatePhaseTimestamps(phase: string): void {
    const now = Date.now();
    switch (phase) {
      case 'sustain':
        this.metrics.phases.rampUp.endTime = now;
        this.metrics.phases.sustain.startTime = now;
        break;
      case 'rampDown':
        this.metrics.phases.sustain.endTime = now;
        this.metrics.phases.rampDown.startTime = now;
        break;
    }
  }
  
  private async executeUserFlow(userId: string): Promise<UserFlowResult> {
    const startTime = Date.now();
    let wallet: WalletInfo | null = null;
    
    try {
      // Get a wallet from pool (no funding needed)
      wallet = await this.walletPool!.getWallet();
      
      console.log(chalk.yellow(`[${userId}] Using end-user wallet: ${wallet.address}`));
      console.log(chalk.yellow(`[${userId}] Transactions will be sent by master relayer: ${this.masterRelayerAddress}`));
      
      // Create client with master relayer configuration
      const configWithRelayer = { 
        ...this.config, 
        skipFundingCheck: true, // No funding check needed for end-user wallets
        masterRelayerPrivateKey: this.masterRelayerPrivateKey, // Add master relayer key
      };
      
      const client = await VanaLoadTestClient.create(wallet.privateKey, configWithRelayer);
      
      const userData = this.generateTestData();
      const prompt = generateWalletPrompt(wallet.address);
      
      const result = await client.executeDataPortabilityFlow(
        userData,
        prompt,
        `ms-05-relayer-${userId}`,
        'http://localhost:3001'
      );
      
      console.log(`[${userId}] Flow result:`, {
        success: result.success,
        hasTransactionHash: !!result.transactionHash,
        transactionHash: result.transactionHash,
        error: result.error?.substring(0, 100)
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Check master relayer balance after transaction (optional)
      let transactionCost = 0n;
      try {
        // Could check relayer balance change here if needed
        // For now, we'll estimate based on gas used
        transactionCost = 600000n * 30n * 1_000_000_000n * BigInt(this.config.premiumGasMultiplier || 1);
      } catch (e) {
        // Ignore balance check errors
      }
      
      // Log transaction details for clarity
      if (result.transactionHash) {
        const costInVana = formatEther(transactionCost);
        console.log(chalk.green(`✅ [${userId}] TX: ${result.transactionHash} | Duration: ${(duration/1000).toFixed(1)}s | Est. Cost: ${costInVana} VANA`));
        
        // Track block statistics for successful transaction (don't await, track separately)
        const blockTrackingPromise = this.trackBlockStats(result.transactionHash)
          .catch(error => console.error(`[BlockStats] Error tracking block for ${result.transactionHash}:`, error))
          .finally(() => {
            this.activeBlockTracking.delete(blockTrackingPromise);
          });
        this.activeBlockTracking.add(blockTrackingPromise);
      } else if (result.error) {
        // Extract specific error info for clarity
        const errorType = result.error.includes('underpriced') ? 'UNDERPRICED' : 
                         result.error.includes('timeout') ? 'TIMEOUT' :
                         result.error.includes('nonce') ? 'NONCE' :
                         result.error.includes('insufficient') ? 'INSUFFICIENT_FUNDS' :
                         'OTHER';
        console.log(chalk.red(`❌ [${userId}] Failed (${errorType}): ${result.error.substring(0, 100)}...`));
      }
      
      return {
        success: result.success,
        duration,
        walletAddress: wallet.address,
        error: result.error,
        transactionHash: result.transactionHash,
        permissionId: result.permissionId,
        startTime,
        endTime,
        userId,
        transactionCost,
      };
      
    } catch (error) {
      const endTime = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.log(chalk.red(`❌ [${userId}] Exception: ${errorMessage.substring(0, 100)}...`));
      
      return {
        success: false,
        duration: endTime - startTime,
        walletAddress: wallet?.address || 'unknown',
        error: errorMessage,
        startTime,
        endTime,
        userId,
      };
    }
  }
  
  private generateTestData(): string {
    return JSON.stringify({
      userId: faker.string.uuid(),
      timestamp: Date.now(),
      personalInfo: {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        bio: faker.person.bio(),
      },
      preferences: {
        interests: faker.helpers.arrayElements(
          ['technology', 'art', 'music', 'sports', 'travel', 'food', 'science'],
          { min: 2, max: 4 }
        ),
        favoriteColor: faker.color.human(),
      },
      activity: {
        lastActive: faker.date.recent(),
        sessionCount: faker.number.int({ min: 1, max: 100 }),
      },
    });
  }
  
  private extractErrorType(error: string): string {
    if (error.includes('underpriced')) return 'UNDERPRICED';
    if (error.includes('timeout')) return 'TIMEOUT';
    if (error.includes('nonce')) return 'NONCE';
    if (error.includes('insufficient')) return 'INSUFFICIENT_FUNDS';
    if (error.includes('revert')) return 'REVERT';
    if (error.includes('network')) return 'NETWORK';
    return 'OTHER';
  }
  
  /**
   * Track block statistics for a successful transaction
   */
  private async trackBlockStats(txHash: string): Promise<void> {
    console.log(`[BlockStats] Tracking stats for tx ${txHash}`);
    try {
      const { createPublicClient, http } = await import('viem');
      const publicClient = createPublicClient({
        chain: moksha,
        transport: http(this.config.rpcEndpoints[0]),
      });
      
      console.log(`[BlockStats] Getting receipt for tx ${txHash}...`);
      // Get transaction receipt to find block number and gas used
      const receipt = await publicClient.getTransactionReceipt({ 
        hash: txHash as `0x${string}` 
      });
      
      if (!receipt || !receipt.blockNumber) {
        console.warn(`[BlockStats] Could not get block number for tx ${txHash}`);
        return;
      }
      
      const blockNumber = receipt.blockNumber;
      const gasUsed = receipt.gasUsed;
      const blockKey = blockNumber.toString();
      console.log(`[BlockStats] Transaction ${txHash} is in block ${blockNumber}, used ${gasUsed} gas`);
      
      // Track tx to block mapping
      this.metrics.blockStats.txToBlock.set(txHash, blockNumber);
      
      // Update block map
      let blockStat = this.metrics.blockStats.blockMap.get(blockKey);
      if (!blockStat) {
        blockStat = {
          blockNumber,
          dataPortabilityTxs: [],
          dataPortabilityGasUsed: 0n,
          blockGasLimit: 30_000_000n, // Moksha testnet gas limit
        };
        this.metrics.blockStats.blockMap.set(blockKey, blockStat);
      }
      blockStat.dataPortabilityTxs.push(txHash);
      blockStat.dataPortabilityGasUsed = blockStat.dataPortabilityGasUsed + gasUsed;
      
      // Get block details to calculate utilization
      try {
        const block = await publicClient.getBlock({ 
          blockNumber: blockNumber 
        });
        
        if (block) {
          blockStat.totalTxsInBlock = block.transactions.length;
          blockStat.blockGasUsed = block.gasUsed;
          // Calculate gas utilization: (our gas used / block gas limit) * 100
          blockStat.gasUtilization = Number((blockStat.dataPortabilityGasUsed * 10000n) / blockStat.blockGasLimit) / 100;
          blockStat.timestamp = Number(block.timestamp) * 1000; // Convert to milliseconds
        }
      } catch (error) {
        console.warn(`[BlockStats] Could not get block details for block ${blockNumber}:`, error);
      }
      
      // Update aggregate statistics
      this.updateBlockAggregateStats();
      
      console.log(`[BlockStats] Stats updated. Total blocks: ${this.metrics.blockStats.totalBlocks}, Avg gas utilization: ${this.metrics.blockStats.avgBlockUtilization.toFixed(2)}%`);
      
    } catch (error) {
      console.warn(`[BlockStats] Error tracking block stats for tx ${txHash}:`, error);
    }
  }
  
  /**
   * Update aggregate block statistics
   */
  private updateBlockAggregateStats(): void {
    const blockMap = this.metrics.blockStats.blockMap;
    
    if (blockMap.size === 0) return;
    
    // Calculate statistics
    let totalTxs = 0;
    let totalGasUtilization = 0;
    let maxTxs = 0;
    let minTxs = Number.MAX_SAFE_INTEGER;
    let blocksWithUtilization = 0;
    
    blockMap.forEach((blockStat) => {
      const txCount = blockStat.dataPortabilityTxs.length;
      totalTxs += txCount;
      maxTxs = Math.max(maxTxs, txCount);
      minTxs = Math.min(minTxs, txCount);
      
      if (blockStat.gasUtilization !== undefined) {
        totalGasUtilization += blockStat.gasUtilization;
        blocksWithUtilization++;
      }
    });
    
    this.metrics.blockStats.totalBlocks = blockMap.size;
    this.metrics.blockStats.avgTxsPerBlock = totalTxs / blockMap.size;
    this.metrics.blockStats.maxTxsPerBlock = maxTxs;
    this.metrics.blockStats.minTxsPerBlock = minTxs === Number.MAX_SAFE_INTEGER ? 0 : minTxs;
    this.metrics.blockStats.avgBlockUtilization = blocksWithUtilization > 0 
      ? totalGasUtilization / blocksWithUtilization 
      : 0;
  }
  
  private startMetricsDisplay(): void {
    this.metricsInterval = setInterval(() => {
      if (this.stopping) {
        this.stopMetricsDisplay();
        return;
      }
      
      this.displayMetrics();
    }, 5000); // Update every 5 seconds
  }
  
  private stopMetricsDisplay(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
  }
  
  private displayMetrics(): void {
    const elapsed = (Date.now() - this.metrics.startTime) / 1000;
    const streamStatus = this.userStream!.getStatus();
    
    console.log(chalk.gray('\n' + '─'.repeat(60)));
    console.log(chalk.cyan('📊 Live Metrics:'));
    console.log(`   Phase: ${chalk.white(streamStatus.phase.toUpperCase())} | Rate: ${chalk.white(streamStatus.rate.toFixed(2))} users/s`);
    console.log(`   Progress: ${chalk.white(this.metrics.completedUsers)}/${chalk.white(this.metrics.totalUsers)} users`);
    console.log(`   Active: ${chalk.white(this.metrics.activeUsers)} | Peak: ${chalk.white(this.metrics.peakActiveUsers)}`);
    console.log(`   Success: ${chalk.green(this.metrics.successfulUsers)} | Failed: ${chalk.red(this.metrics.failedUsers)}`);
    
    if (this.metrics.completedUsers > 0) {
      const successRate = ((this.metrics.successfulUsers / this.metrics.completedUsers) * 100).toFixed(1);
      const avgResponseTime = (this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length / 1000).toFixed(2);
      const minResponseTime = (Math.min(...this.metrics.responseTimes) / 1000).toFixed(1);
      const maxResponseTime = (Math.max(...this.metrics.responseTimes) / 1000).toFixed(1);
      console.log(`   Success Rate: ${chalk.white(successRate)}%`);
      console.log(`   Response Time: ${chalk.white(`${minResponseTime}s-${maxResponseTime}s`)} (avg: ${avgResponseTime}s)`);
    }
    
    // Add block statistics to live display
    if (this.metrics.blockStats.totalBlocks > 0) {
      console.log(`   Blocks Used: ${chalk.white(this.metrics.blockStats.totalBlocks)} | Avg Gas Utilization: ${chalk.white(this.metrics.blockStats.avgBlockUtilization.toFixed(2))}%`);
    }
    
    console.log(`   Elapsed: ${chalk.white(Math.floor(elapsed))}s`);
  }
  
  private generateFinalReport(): void {
    this.metrics.endTime = Date.now();
    const totalDuration = (this.metrics.endTime - this.metrics.startTime) / 1000;
    
    console.log(chalk.cyan.bold('\n' + '═'.repeat(60)));
    console.log(chalk.cyan.bold('📈 FINAL REPORT - MASTER RELAYER MODE'));
    console.log(chalk.cyan.bold('═'.repeat(60)));
    
    // Overall Statistics
    console.log(chalk.yellow('\n📊 Overall Statistics:'));
    console.log(`   Total Users: ${this.metrics.totalUsers}`);
    console.log(`   Completed: ${this.metrics.completedUsers}`);
    console.log(`   Successful: ${chalk.green(this.metrics.successfulUsers)}`);
    console.log(`   Failed: ${chalk.red(this.metrics.failedUsers)}`);
    
    if (this.metrics.completedUsers > 0) {
      const successRate = ((this.metrics.successfulUsers / this.metrics.completedUsers) * 100).toFixed(2);
      console.log(`   Success Rate: ${chalk.white.bold(successRate + '%')}`);
    }
    
    console.log(`   Peak Concurrent: ${this.metrics.peakActiveUsers}`);
    console.log(`   Test Duration: ${totalDuration.toFixed(1)}s`);
    console.log(`   Master Relayer: ${this.masterRelayerAddress}`);
    
    // Response Times (Full Flow Completion)
    if (this.metrics.responseTimes.length > 0) {
      const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
      const min = sorted[0] / 1000;
      const max = sorted[sorted.length - 1] / 1000;
      const p50 = sorted[Math.floor(sorted.length * 0.5)] / 1000;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] / 1000;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] / 1000;
      const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length / 1000;
      
      console.log(chalk.yellow('\n⏱️  Flow Completion Times:'));
      console.log(`   Minimum: ${chalk.green(min.toFixed(2) + 's')}`);
      console.log(`   Average: ${avg.toFixed(2)}s`);
      console.log(`   Maximum: ${chalk.red(max.toFixed(2) + 's')}`);
      console.log(chalk.gray('   ─────────────────'));
      console.log(`   P50 (Median): ${p50.toFixed(2)}s`);
      console.log(`   P95: ${p95.toFixed(2)}s`);
      console.log(`   P99: ${p99.toFixed(2)}s`);
    }
    
    // Transaction Costs (estimated)
    if (this.metrics.transactionCosts.length > 0) {
      const totalCost = this.metrics.transactionCosts.reduce((a, b) => a + b, 0n);
      const avgCost = totalCost / BigInt(this.metrics.transactionCosts.length);
      
      console.log(chalk.yellow('\n💰 Transaction Costs (Estimated):'));
      console.log(`   Total: ${formatEther(totalCost)} VANA`);
      console.log(`   Average: ${formatEther(avgCost)} VANA`);
    }
    
    // Phase Breakdown
    console.log(chalk.yellow('\n📈 Phase Breakdown:'));
    console.log(`   Ramp Up: ${this.metrics.phases.rampUp.usersCompleted} users`);
    console.log(`   Sustain: ${this.metrics.phases.sustain.usersCompleted} users`);
    console.log(`   Ramp Down: ${this.metrics.phases.rampDown.usersCompleted} users`);
    
    // Error Breakdown
    if (Object.keys(this.metrics.errorsByType).length > 0) {
      console.log(chalk.yellow('\n❌ Error Breakdown:'));
      for (const [type, count] of Object.entries(this.metrics.errorsByType)) {
        const percentage = ((count / this.metrics.failedUsers) * 100).toFixed(1);
        console.log(`   ${type}: ${count} (${percentage}%)`);
      }
    }
    
    // Block Statistics
    console.log(chalk.yellow('\n📦 Block Statistics:'));
    console.log(`   Transactions tracked: ${this.metrics.blockStats.txToBlock.size}`);
    console.log(`   Unique blocks used: ${this.metrics.blockStats.blockMap.size}`);
    
    if (this.metrics.blockStats.blockMap.size > 0) {
      // Recalculate stats in case they weren't updated
      this.updateBlockAggregateStats();
      
      console.log(`   Total Blocks: ${this.metrics.blockStats.totalBlocks}`);
      console.log(`   Avg TXs per Block: ${this.metrics.blockStats.avgTxsPerBlock.toFixed(2)}`);
      console.log(`   Max TXs in Block: ${this.metrics.blockStats.maxTxsPerBlock}`);
      console.log(`   Min TXs in Block: ${this.metrics.blockStats.minTxsPerBlock}`);
      console.log(`   Avg Block Gas Utilization: ${chalk.white.bold(this.metrics.blockStats.avgBlockUtilization.toFixed(2) + '%')} of 30M gas`);
      
      // Find blocks with highest gas utilization
      const sortedBlocks = Array.from(this.metrics.blockStats.blockMap.values())
        .filter(b => b.gasUtilization !== undefined)
        .sort((a, b) => (b.gasUtilization || 0) - (a.gasUtilization || 0))
        .slice(0, 3);
      
      if (sortedBlocks.length > 0) {
        console.log(chalk.yellow('\n   Top Block Gas Utilization:'));
        sortedBlocks.forEach((block, i) => {
          const gasUsedMB = Number(block.dataPortabilityGasUsed) / 1_000_000;
          const blockGasLimitMB = Number(block.blockGasLimit) / 1_000_000;
          console.log(`     ${i + 1}. Block ${block.blockNumber}: ${gasUsedMB.toFixed(2)}M/${blockGasLimitMB}M gas (${block.gasUtilization?.toFixed(2)}%)`);
        });
      }
      
      // Calculate block throughput
      const blocksPerMinute = (this.metrics.blockStats.totalBlocks / (totalDuration / 60));
      console.log(chalk.yellow('\n   Block Throughput:'));
      console.log(`     Blocks/minute: ${blocksPerMinute.toFixed(2)}`);
      console.log(`     Avg time between blocks: ${((totalDuration / this.metrics.blockStats.totalBlocks)).toFixed(1)}s`);
    }
    
    // Throughput
    const actualThroughput = this.metrics.completedUsers / totalDuration;
    console.log(chalk.yellow('\n🚀 Throughput:'));
    console.log(`   Actual: ${actualThroughput.toFixed(2)} users/second`);
    console.log(`   Target: ${this.streamingConfig.arrivalRateUsersPerSecond} users/second`);
    
    // Peak throughput
    const peakThroughputPerSecond = this.metrics.throughput.peakThroughputPerMinute / 60;
    console.log(chalk.cyan('\n📊 Peak Throughput:'));
    console.log(`   Peak Rate: ${chalk.white.bold(this.metrics.throughput.peakThroughputPerMinute + ' users/minute')} (${peakThroughputPerSecond.toFixed(2)} users/second)`);
    if (this.metrics.throughput.peakThroughputWindowStart) {
      const peakTime = new Date(this.metrics.throughput.peakThroughputWindowStart);
      console.log(`   Peak Window: Starting at ${peakTime.toLocaleTimeString()}`);
    }
    
    // Summary
    console.log(chalk.cyan.bold('\n' + '═'.repeat(60)));
    const wasSuccessful = this.metrics.successfulUsers / this.metrics.completedUsers >= 0.95;
    if (wasSuccessful) {
      console.log(chalk.green.bold('✅ TEST COMPLETED SUCCESSFULLY'));
    } else {
      console.log(chalk.red.bold('⚠️  TEST COMPLETED WITH ISSUES'));
    }
    console.log(chalk.gray(`\n📄 Full log saved to: ${this.logFile}`));
    console.log(chalk.cyan.bold('═'.repeat(60) + '\n'));
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): StreamingConfigV2 {
  const args = process.argv.slice(2);
  
  // First, determine total users to adjust other defaults
  let totalUsers = 50;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--users') {
      totalUsers = parseInt(args[i + 1]);
      break;
    }
  }
  
  // Adjust default phase durations based on user count
  const isSmallTest = totalUsers <= 20;
  const config: StreamingConfigV2 = {
    totalUsers: totalUsers,
    arrivalRateUsersPerSecond: isSmallTest ? 2.0 : 1.0, // Faster rate for small tests
    testDurationMinutes: 5,
    maxConcurrentUsers: Math.min(totalUsers, 10),
    childRelayers: 0, // Not used in relayer mode
    preFundBuffer: 0, // Not used in relayer mode
    fundingAmountPerChild: "0", // Not used in relayer mode
    rampUpDurationSeconds: isSmallTest ? 5 : 30, // Shorter ramp for small tests
    sustainDurationSeconds: isSmallTest ? 10 : 180, // Shorter sustain for small tests
    rampDownDurationSeconds: isSmallTest ? 5 : 30, // Shorter ramp down for small tests
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--users':
        config.totalUsers = parseInt(args[++i]);
        break;
      case '--rate':
        config.arrivalRateUsersPerSecond = parseFloat(args[++i]);
        break;
      case '--duration':
        config.testDurationMinutes = parseInt(args[++i]);
        break;
      case '--concurrency':
        config.maxConcurrentUsers = parseInt(args[++i]);
        break;
      case '--ramp-up':
        config.rampUpDurationSeconds = parseInt(args[++i]);
        break;
      case '--sustain':
        config.sustainDurationSeconds = parseInt(args[++i]);
        break;
      case '--ramp-down':
        config.rampDownDurationSeconds = parseInt(args[++i]);
        break;
      case '--help':
        console.log(`
Usage: npx tsx milestones/ms-05/test-streaming-load-relayer.ts [options]

Options:
  --users <n>        Total number of users (default: 50)
  --rate <n>         Users per second arrival rate (default: 1.0)
  --duration <n>     Test duration in minutes (default: 5)
  --concurrency <n>  Max concurrent users (default: 10)
  --ramp-up <n>      Ramp up duration in seconds (default: 30)
  --sustain <n>      Sustain duration in seconds (default: 180)
  --ramp-down <n>    Ramp down duration in seconds (default: 30)
  --help             Show this help message

Environment Variables:
  RELAYER_PRIVATE_KEY       Required - Master relayer wallet private key
  PREMIUM_GAS_MULTIPLIER    Gas price multiplier (default: 2.0)
  TRANSACTION_TIMEOUT_MS    Transaction timeout in ms (default: 180000)

Example:
  # High throughput test with master relayer
  PREMIUM_GAS_MULTIPLIER=50 npx tsx milestones/ms-05/test-streaming-load-relayer.ts --users 100 --rate 2.0 --concurrency 20
        `);
        process.exit(0);
    }
  }
  
  return config;
}

/**
 * Main entry point
 */
async function main() {
  try {
    // Load configuration
    const config = await loadConfig();
    
    // Parse streaming configuration
    const streamingConfig = parseArgs();
    
    // Override some config values for master relayer mode
    config.premiumGasMultiplier = parseFloat(process.env.PREMIUM_GAS_MULTIPLIER || '2.0');
    config.transactionTimeoutMs = parseInt(process.env.TRANSACTION_TIMEOUT_MS || '180000');
    
    // Create and run test
    const test = new StreamingLoadTestV2Relayer(config, streamingConfig);
    await test.run();
    
  } catch (error) {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    
    // Log error details
    if (error instanceof Error) {
      console.error(chalk.red('Stack:'), error.stack);
    }
    
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}