#!/usr/bin/env tsx
/**
 * Milestone 5 Stress Test: Maximum Throughput Burst Mode
 * 
 * This stress test launches all users simultaneously to achieve maximum throughput
 * and complete all data portability flows as fast as possible.
 * 
 * Key differences from streaming test:
 * - No phased ramp-up/sustain/ramp-down
 * - All users start immediately (burst mode)
 * - Maximum concurrency limited only by system resources
 * - Focus on completion speed and throughput metrics
 */

import { VanaLoadTestClient } from '../../src/client/load-test-client.js';
import { loadConfig } from '../../src/config/loader.js';
import { generateWalletPrompt } from '../../src/utils/prompt-generator.js';
import { LoadTestApiServer } from '../../src/server/api-server.js';
import chalk from 'chalk';
import { formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mokshaTestnet as moksha } from '@opendatalabs/vana-sdk/chains';
import { faker } from '@faker-js/faker';
import * as fs from 'fs';
import * as path from 'path';
import { RelayerNonceManager } from '../../src/utils/relayer-nonce-manager.js';
import { TestIdManager } from '../../src/utils/test-id-manager.js';

interface StressTestConfig {
  totalUsers: number;
  maxConcurrentUsers: number;
  useNonceManagement: boolean;
  timeoutSeconds: number;
  aggressiveMode?: boolean; // Release slot after txHash instead of full completion
}

interface BlockStats {
  blockNumber: bigint;
  dataPortabilityTxs: string[];
  dataPortabilityGasUsed: bigint;
  totalTxsInBlock?: number;
  blockGasUsed?: bigint;
  blockGasLimit: bigint;
  gasUtilization?: number;
  timestamp?: number;
}

interface StressTestMetrics {
  totalUsers: number;
  startTime: number;
  endTime?: number;
  firstCompletionTime?: number;
  lastCompletionTime?: number;
  completedUsers: number;
  successfulUsers: number;
  failedUsers: number;
  activeUsers: number;
  peakActiveUsers: number;
  responseTimes: number[];
  errorsByType: { [key: string]: number };
  nonceErrorDetails: { userId: string; nonce?: number; error: string }[];
  throughputPerSecond: number;
  averageResponseTime: number;
  medianResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  transactionHashes: string[];
  actualTransactionFees: bigint[]; // Track actual fees paid on-chain
  blockStats: {
    txToBlock: Map<string, bigint>;
    blockMap: Map<string, BlockStats>;
    totalBlocks: number;
    avgTxsPerBlock: number;
    maxTxsPerBlock: number;
    minTxsPerBlock: number;
    avgBlockUtilization: number;
  };
  // New timing metrics
  requestToTxHashTimes: number[]; // Time from request submission to receiving tx hash
  requestToPermissionIdTimes: number[]; // Time from request submission to receiving permission ID
  avgRequestToTxHash: number;
  medianRequestToTxHash: number;
  p95RequestToTxHash: number;
  p99RequestToTxHash: number;
  avgRequestToPermissionId: number;
  medianRequestToPermissionId: number;
  p95RequestToPermissionId: number;
  p99RequestToPermissionId: number;
}

/**
 * Stress Test Runner - Executes all flows as fast as possible
 */
class StressTestBurstRelayer {
  private config: any;
  private stressConfig: StressTestConfig;
  private metrics: StressTestMetrics;
  private testId: number;

  // Master relayer
  private masterRelayerPrivateKey?: string;
  private masterRelayerAddress?: string;
  private nonceManager?: RelayerNonceManager;

  // Components
  private apiServer: LoadTestApiServer;
  private activeFlows: Set<Promise<void>> = new Set();
  private activeBlockTracking: Set<Promise<void>> = new Set();

  // Aggressive mode tracking
  private activeTxSubmissions: number = 0; // Track active transaction submissions
  private preparedUsers: Map<string, any> = new Map(); // Pre-prepared user data
  
  // Logging
  private logFile: string;
  private logStream?: fs.WriteStream;
  private originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
  };
  
  constructor(config: any, stressConfig: StressTestConfig) {
    this.config = config;
    this.stressConfig = stressConfig;
    
    // Get unique test ID
    this.testId = TestIdManager.getNextTestId();
    const formattedTestId = TestIdManager.formatTestId(this.testId);
    
    // Setup logging with test ID in filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(process.cwd(), `stress-test-burst-t${formattedTestId}-${timestamp}.log`);
    this.setupDualLogging();
    
    console.log(chalk.cyan(`📋 Test ID: ${formattedTestId}`));
    console.log(chalk.gray(`📁 Log file: ${this.logFile}`));
    
    this.metrics = {
      totalUsers: stressConfig.totalUsers,
      startTime: Date.now(),
      completedUsers: 0,
      successfulUsers: 0,
      failedUsers: 0,
      activeUsers: 0,
      peakActiveUsers: 0,
      responseTimes: [],
      errorsByType: {},
      nonceErrorDetails: [],
      throughputPerSecond: 0,
      averageResponseTime: 0,
      medianResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      transactionHashes: [],
      actualTransactionFees: [],
      blockStats: {
        txToBlock: new Map(),
        blockMap: new Map(),
        totalBlocks: 0,
        avgTxsPerBlock: 0,
        maxTxsPerBlock: 0,
        minTxsPerBlock: Number.MAX_SAFE_INTEGER,
        avgBlockUtilization: 0,
      },
      // Initialize new timing metrics
      requestToTxHashTimes: [],
      requestToPermissionIdTimes: [],
      avgRequestToTxHash: 0,
      medianRequestToTxHash: 0,
      p95RequestToTxHash: 0,
      p99RequestToTxHash: 0,
      avgRequestToPermissionId: 0,
      medianRequestToPermissionId: 0,
      p95RequestToPermissionId: 0,
      p99RequestToPermissionId: 0,
    };
    
    this.apiServer = new LoadTestApiServer(config, 3001);
  }
  
  private setupDualLogging(): void {
    this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    
    console.log(chalk.gray(`📝 Stress test log: ${this.logFile}`));
    console.log(chalk.gray(`💡 All output saved to log file\n`));
    
    const writeToFile = (level: string, ...args: any[]) => {
      const timestamp = new Date().toISOString();
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, (key, value) => 
              typeof value === 'bigint' ? value.toString() : value
            );
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      
      const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, '');
      
      if (this.logStream && !this.logStream.destroyed) {
        this.logStream.write(`[${timestamp}] [${level}] ${cleanMessage}\n`);
      }
    };
    
    console.log = (...args) => {
      this.originalConsole.log(...args);
      writeToFile('LOG', ...args);
    };
    console.error = (...args) => {
      this.originalConsole.error(...args);
      writeToFile('ERROR', ...args);
    };
  }
  
  async run(): Promise<void> {
    console.log(chalk.cyan.bold('\n🚀 STRESS TEST: Maximum Throughput Burst Mode'));
    console.log(chalk.red.bold('⚡ WARNING: This will launch all users simultaneously!'));
    console.log(chalk.gray('═'.repeat(60)));
    
    let metricsInterval: NodeJS.Timeout | undefined;
    
    try {
      // Load master relayer
      await this.loadMasterRelayerWallet();
    
    // Start API server
    console.log(chalk.yellow('\n📡 Starting API server...'));
    await this.apiServer.start();
    console.log(chalk.green('✅ API server ready'));
    
    // Display configuration
    console.log(chalk.cyan('\n📊 Stress Test Configuration:'));
    console.log(`   Total Users: ${chalk.white.bold(this.stressConfig.totalUsers)}`);
    console.log(`   Max Concurrent: ${chalk.white.bold(this.stressConfig.maxConcurrentUsers)}`);
    console.log(`   Mode: ${this.stressConfig.aggressiveMode ? chalk.red.bold('AGGRESSIVE (TxHash-based)') : chalk.yellow('Standard (Full-flow)')}`);

    // Show relay mode configuration
    const relayMode = this.config.relayMode || 'relayer-wallet';
    if (relayMode === 'relay-endpoint') {
      console.log(`   Relay Mode: ${chalk.cyan('Relay Endpoint (Legacy)')}`);
      console.log(`   Relay URL: ${chalk.white(this.config.relayEndpointUrl || 'Not configured')}`);
    } else if (relayMode === 'async-relay') {
      console.log(`   Relay Mode: ${chalk.magenta('Async Relay (3-Step Flow)')}`);
      console.log(`   Relay URL: ${chalk.white(this.config.relayEndpointUrl || 'Not configured')}`);
      console.log(`   Poll Interval: ${chalk.white((this.config.asyncRelayPollInterval || 1000) + 'ms')}`);
    } else if (relayMode === 'sync-relay') {
      console.log(`   Relay Mode: ${chalk.yellow('Sync Relay (/api/relay)')}`);
      console.log(`   Relay URL: ${chalk.white(this.config.relayEndpointUrl || 'Not configured')}`);
    } else {
      console.log(`   Relay Mode: ${chalk.green('Relayer Wallet')}`);
      console.log(`   Master Relayer: ${chalk.white(this.masterRelayerAddress)}`);
    }
    
    console.log(`   Nonce Management: ${this.stressConfig.useNonceManagement ? chalk.green('Enabled') : chalk.yellow('Disabled')}`);
    console.log(`   Test Timeout: ${chalk.white(this.stressConfig.timeoutSeconds)}s`);
    console.log(`   TX Timeout: ${chalk.white(this.config.transactionTimeoutMs / 1000)}s`);
    console.log(`   Gas Multiplier: ${chalk.white(this.config.premiumGasMultiplier)}x`);
    
    // Check relayer balance
    await this.checkMasterRelayerBalance();
    
    // Start the burst!
    console.log(chalk.red.bold('\n💥 LAUNCHING BURST ATTACK!'));
    console.log(chalk.gray('═'.repeat(60)));
    
    this.metrics.startTime = Date.now();
    
    // Create all user flows at once (respecting max concurrency)
    const userPromises: Promise<void>[] = [];
    const concurrencyLimit = this.stressConfig.maxConcurrentUsers;
    
    // Create a queue of users to process with test ID embedded
    const userQueue: string[] = [];
    for (let i = 1; i <= this.stressConfig.totalUsers; i++) {
      const userId = TestIdManager.createUserId(this.testId, i);
      userQueue.push(userId);
    }
    
    console.log(chalk.yellow(`\n🌊 Launching ${userQueue.length} users with concurrency limit: ${concurrencyLimit}`));

    // Pre-prepare user data for aggressive mode
    if (this.stressConfig.aggressiveMode) {
      console.log(chalk.yellow(`⚡ Aggressive mode: Pre-preparing all user transactions...`));
      for (const userId of userQueue) {
        const userParts = userId.split('-');
        const userIndex = parseInt(userParts[userParts.length - 1]);
        const baseKey = '0x' + '0'.repeat(63) + '1';
        const userPrivateKey = `0x${(BigInt(baseKey) + BigInt(userIndex)).toString(16).padStart(64, '0')}`;

        const userData = this.generateTestData();
        const configWithRelayer = {
          ...this.config,
          skipFundingCheck: true,
          masterRelayerPrivateKey: this.masterRelayerPrivateKey,
        };

        this.preparedUsers.set(userId, {
          privateKey: userPrivateKey,
          userData: userData,
          config: configWithRelayer,
        });
      }
      console.log(chalk.green(`   Pre-prepared ${this.preparedUsers.size} users`));
    }

    // Process users with concurrency control
    const processQueue = async () => {
      let launched = 0;
      while (userQueue.length > 0) {
        // Wait if we're at max concurrency
        if (this.stressConfig.aggressiveMode) {
          // In aggressive mode, check active tx submissions instead of full flows
          while (this.activeTxSubmissions >= concurrencyLimit) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } else {
          // Standard mode: wait for full flow slots
          while (this.activeFlows.size >= concurrencyLimit) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        const userId = userQueue.shift();
        if (userId) {
          const flowPromise = this.stressConfig.aggressiveMode
            ? this.executeAggressiveUserFlow(userId)
            : this.executeUserFlow(userId);

          this.activeFlows.add(flowPromise);
          userPromises.push(flowPromise);
          launched++;

          // Remove from active set when done
          flowPromise.finally(() => {
            this.activeFlows.delete(flowPromise);
          });

          // Provide feedback every 10 users
          if (launched % 10 === 0) {
            console.log(chalk.gray(`   Launched ${launched}/${this.stressConfig.totalUsers} users...`));
          }
        }
      }
      console.log(chalk.green(`   Finished launching all ${launched} users`));
    };
    
    // Start processing
    const queuePromise = processQueue();
    
    // Start live metrics display
    metricsInterval = setInterval(() => {
      this.displayLiveMetrics();
    }, 2000);
    
    // Wait for queue to finish processing all users first
    await queuePromise;
    console.log(chalk.green(`\n✅ All ${this.stressConfig.totalUsers} users have been launched`));
    
    // Now wait for all user flows to complete with periodic status updates
    console.log(chalk.yellow(`⏳ Waiting for all ${userPromises.length} user flows to complete...`));
    
    // Create a promise that resolves when all flows complete or timeout
    const allFlowsComplete = Promise.all(userPromises);
    
    // Create a timeout promise
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.log(chalk.yellow(`\n⚠️ Maximum wait time of ${this.stressConfig.timeoutSeconds}s reached`));
        console.log(chalk.yellow(`   ${this.activeFlows.size} flows still active, continuing with report generation...`));
        resolve();
      }, this.stressConfig.timeoutSeconds * 1000);
    });
    
    // Create a status update interval
    const statusInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.metrics.startTime) / 1000);
      if (this.activeFlows.size > 0) {
        console.log(chalk.gray(`   ${this.activeFlows.size}/${this.stressConfig.totalUsers} flows still running (${elapsed}s elapsed)...`));
      }
    }, 5000);
    
    // Wait for either all flows to complete or timeout
    await Promise.race([
      allFlowsComplete,
      timeoutPromise
    ]);
    
    // Clear status interval
    clearInterval(statusInterval);
    
    if (this.activeFlows.size === 0) {
      console.log(chalk.green(`✅ All user flows completed successfully`));
    } else {
      console.log(chalk.yellow(`⚠️ ${this.activeFlows.size} flows did not complete before timeout`));
    }
    
    // Stop metrics display
    if (metricsInterval) {
      clearInterval(metricsInterval);
    }
    
    // Now wait for any remaining active flows to complete
    console.log(chalk.yellow('\n⏳ Ensuring all data portability flows are complete...'));
    const finalWaitStart = Date.now();
    const maxFinalWait = 30000; // 30 seconds additional wait
    
    while (this.activeFlows.size > 0 && (Date.now() - finalWaitStart) < maxFinalWait) {
      const remaining = this.activeFlows.size;
      const elapsed = Math.floor((Date.now() - finalWaitStart) / 1000);
      console.log(chalk.gray(`   ${remaining} flows still running (waited ${elapsed}s)...`));
      
      // Show which flows are still active
      if (remaining <= 10) {
        const activeFlowsArray = Array.from(this.activeFlows);
        console.log(chalk.gray(`   Still active: ${activeFlowsArray.length} flows`));
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (this.activeFlows.size > 0) {
      console.log(chalk.yellow(`⚠️  ${this.activeFlows.size} flows did not complete within timeout`));
    } else {
      console.log(chalk.green('✅ All data portability flows completed'));
    }
    
    // Set end time after all flows complete
    this.metrics.endTime = Date.now();
    
    // Wait for all block tracking to complete
    if (this.activeBlockTracking.size > 0) {
      console.log(chalk.yellow(`\n⏳ Waiting for ${this.activeBlockTracking.size} block stat operations...`));
      try {
        await Promise.race([
          Promise.all(Array.from(this.activeBlockTracking)),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Block tracking timeout')), 10000))
        ]);
        console.log(chalk.green('✅ Block tracking complete'));
      } catch (e) {
        console.log(chalk.yellow('⚠️  Block tracking timed out, continuing...'));
      }
    }
    
    // Update block stats one last time
    this.updateBlockAggregateStats();
    
    // Calculate final metrics after everything is done
    this.calculateFinalMetrics();
    
    console.log(chalk.cyan('\n📊 Final metrics collected, generating report...'));
      
    } catch (error) {
      console.error(chalk.red('\n❌ Stress test error:'), error);
      if (metricsInterval) {
        clearInterval(metricsInterval);
      }
      
      // Track the error
      if (error instanceof Error) {
        console.error(chalk.red('Stack:'), error.stack);
      }
    } finally {
      // Wait a moment for any pending console output
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Always generate final report, even on errors
      try {
        // Ensure metrics are calculated
        if (!this.metrics.endTime) {
          this.metrics.endTime = Date.now();
        }
        this.calculateFinalMetrics();
        
        // IMPORTANT: Generate report BEFORE restoring console
        this.generateFinalReport();
        
        // Confirm report was generated
        this.originalConsole.log(chalk.green('\n✅ Final report generated'));
      } catch (reportError) {
        // Use originalConsole to ensure error is visible
        this.originalConsole.error(chalk.red('❌ Failed to generate final report:'), reportError);
      }
      
      // Wait for output to flush
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Cleanup
      try {
        if (this.apiServer) {
          await this.apiServer.stop();
        }
      } catch (cleanupError) {
        this.originalConsole.error(chalk.red('❌ Cleanup error:'), cleanupError);
      }
      
      // Restore console AFTER report generation
      console.log = this.originalConsole.log;
      console.error = this.originalConsole.error;
      console.warn = this.originalConsole.warn;
      console.info = this.originalConsole.info;
      
      if (this.logStream) {
        this.logStream.end();
      }
      
      // Exit with appropriate code
      const exitCode = this.metrics.successfulUsers === this.metrics.totalUsers ? 0 : 1;
      process.exit(exitCode);
    }
  }
  
  private async loadMasterRelayerWallet(): Promise<void> {
    const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerPrivateKey) {
      throw new Error('RELAYER_PRIVATE_KEY not found in .env');
    }

    const formattedPrivateKey = relayerPrivateKey.startsWith('0x')
      ? relayerPrivateKey
      : `0x${relayerPrivateKey}`;

    const relayerAccount = privateKeyToAccount(formattedPrivateKey as `0x${string}`);
    this.masterRelayerPrivateKey = formattedPrivateKey;
    this.masterRelayerAddress = relayerAccount.address;

    console.log(chalk.green(`✅ Master relayer: ${this.masterRelayerAddress}`));

    // Only initialize nonce manager for relayer-wallet mode
    const relayMode = this.config.relayMode || 'relayer-wallet';
    const isRelayerWallet = relayMode === 'relayer-wallet';

    if (isRelayerWallet && this.stressConfig.useNonceManagement) {
      this.nonceManager = new RelayerNonceManager(
        this.masterRelayerAddress as `0x${string}`,
        this.config.rpcEndpoints[0],
        this.config.enableDebugLogs,
        this.config.maxConcurrentTx || 10 // Use config value or default to 10
      );
      await this.nonceManager.initialize();
      console.log(chalk.green(`✅ Nonce manager initialized for sequential transaction submission`));
      console.log(chalk.gray(`   This ensures no nonce conflicts when using single relayer wallet`));
    } else if (isRelayerWallet && !this.stressConfig.useNonceManagement) {
      console.log(chalk.red.bold(`⚠️  NONCE MANAGEMENT DISABLED!`));
      console.log(chalk.yellow(`   Expect transaction failures due to nonce conflicts with concurrent submissions`));
    } else if (!isRelayerWallet) {
      console.log(chalk.gray(`ℹ️  Nonce management handled by ${relayMode === 'async-relay' ? 'async relay server' : 'relay endpoint'}`));
    }
  }
  
  private async checkMasterRelayerBalance(): Promise<void> {
    const { createPublicClient, http } = await import('viem');
    const publicClient = createPublicClient({
      chain: moksha,
      transport: http(this.config.rpcEndpoints[0]),
    });
    
    const balance = await publicClient.getBalance({ 
      address: this.masterRelayerAddress as `0x${string}` 
    });
    const balanceInVana = formatEther(balance);
    
    // Realistic cost estimation based on actual network usage
    const estimatedGasPerTx = 100000n; // ~100k gas per data portability tx
    const estimatedGasPrice = 30n * 1_000_000_000n; // 30 gwei (conservative estimate)
    // Don't apply multiplier to cost - multiplier affects tx priority/acceptance, not actual cost paid
    const estimatedCostPerTx = estimatedGasPerTx * estimatedGasPrice;
    const totalEstimatedCost = estimatedCostPerTx * BigInt(this.stressConfig.totalUsers);
    
    console.log(chalk.cyan('\n💰 Balance Check:'));
    console.log(`   Current: ${chalk.white(balanceInVana)} VANA`);
    console.log(`   Required: ${chalk.white(formatEther(totalEstimatedCost))} VANA`);
    console.log(`   Per TX: ${chalk.white(formatEther(estimatedCostPerTx))} VANA`);
    
    if (balance < totalEstimatedCost) {
      console.log(chalk.red('   ❌ Insufficient balance!'));
    } else {
      console.log(chalk.green('   ✅ Balance sufficient'));
    }
  }
  
  private async executeAggressiveUserFlow(userId: string): Promise<void> {
    const startTime = Date.now();
    this.metrics.activeUsers++;
    this.activeTxSubmissions++; // Track active tx submission

    if (this.metrics.activeUsers > this.metrics.peakActiveUsers) {
      this.metrics.peakActiveUsers = this.metrics.activeUsers;
    }

    try {
      // Get pre-prepared data
      const preparedData = this.preparedUsers.get(userId);
      if (!preparedData) {
        throw new Error(`No prepared data for user ${userId}`);
      }

      console.log(chalk.blue(`[${userId}] Starting aggressive flow (txHash-based release)...`));

      // Create client
      const client = await VanaLoadTestClient.create(
        preparedData.privateKey,
        preparedData.config,
        this.stressConfig.useNonceManagement ? this.nonceManager : undefined
      );

      const prompt = generateWalletPrompt(client.getWalletAddress());

      // Execute flow with early slot release after txHash
      const flowPromise = client.executeDataPortabilityFlow(
        preparedData.userData,
        prompt,
        userId,
        'http://localhost:3001'
      );

      // Wait for txHash then immediately release slot
      flowPromise.then(result => {
        // Check if we got txHash timing
        if (result.success && result.timings?.txHashReceivedTime) {
          const txHashTime = result.timings.txHashReceivedTime - (result.timings.requestSubmitTime || 0);
          console.log(chalk.cyan(`[${userId}] 🎯 TxHash received in ${(txHashTime / 1000).toFixed(2)}s - RELEASING SLOT`));
          this.activeTxSubmissions--; // Release slot immediately after txHash
        }
      }).catch(() => {
        // Release slot on error too
        this.activeTxSubmissions--;
      });

      // Wait for full completion
      const result = await flowPromise;
      const duration = Date.now() - startTime;
      this.metrics.responseTimes.push(duration);

      if (result.success) {
        this.metrics.successfulUsers++;

        // Capture timing metrics if available
        if (result.timings) {
          console.log(`[${userId}] Timings received:`, result.timings);
          if (result.timings.requestSubmitTime && result.timings.txHashReceivedTime) {
            const requestToTxHashTime = result.timings.txHashReceivedTime - result.timings.requestSubmitTime;
            this.metrics.requestToTxHashTimes.push(requestToTxHashTime);
            console.log(`[${userId}] Request-to-TxHash time: ${requestToTxHashTime}ms`);
          }
          if (result.timings.requestSubmitTime && result.timings.permissionIdReceivedTime) {
            const requestToPermissionIdTime = result.timings.permissionIdReceivedTime - result.timings.requestSubmitTime;
            this.metrics.requestToPermissionIdTimes.push(requestToPermissionIdTime);
            console.log(`[${userId}] Request-to-PermissionId time: ${requestToPermissionIdTime}ms`);
          }
        } else {
          console.log(`[${userId}] No timings data received in result`);
        }

        if (result.transactionHash) {
          this.metrics.transactionHashes.push(result.transactionHash);

          // Track block statistics asynchronously
          const blockPromise = this.trackBlockStats(result.transactionHash)
            .catch(error => console.error(`[BlockStats] Error tracking: ${error}`))
            .finally(() => this.activeBlockTracking.delete(blockPromise));
          this.activeBlockTracking.add(blockPromise);
        }

        // Track first completion
        if (!this.metrics.firstCompletionTime) {
          this.metrics.firstCompletionTime = Date.now();
        }

        console.log(chalk.green(`✅ [${userId}] Success in ${(duration/1000).toFixed(1)}s (aggressive mode)`));
      } else {
        this.metrics.failedUsers++;
        const errorMessage = result.error || 'Unknown';
        const errorType = this.categorizeError(errorMessage);
        this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;

        // Handle error tracking...
        let nonce = result.failedNonce;
        if (!nonce) {
          const nonceMatch = errorMessage.match(/\[Failed Nonce: (\d+)\]|nonce.*?(\d+)|Nonce.*?(\d+)/i);
          nonce = nonceMatch ? parseInt(nonceMatch[1] || nonceMatch[2] || nonceMatch[3]) : undefined;
        }

        if (errorType === 'NONCE_ERROR' || errorType === 'UNDERPRICED_ERROR' || errorType === 'REPLACEMENT_ERROR' || errorType === 'TIMEOUT') {
          this.metrics.nonceErrorDetails.push({
            userId,
            nonce,
            error: `[${errorType}] ${errorMessage.substring(0, 150)}`
          });
        }

        const errorDisplay = nonce !== undefined
          ? `❌ [${userId}] Failed with nonce ${nonce}: ${errorMessage.substring(0, 50)}...`
          : `❌ [${userId}] Failed: ${errorMessage.substring(0, 50)}...`;
        console.log(chalk.red(errorDisplay));
      }

    } catch (error) {
      this.metrics.failedUsers++;
      this.activeTxSubmissions--; // Make sure to release on error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = this.categorizeError(errorMessage);
      this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;

      let nonce = (error as any)?.failedNonce;
      if (!nonce) {
        const nonceMatch = errorMessage.match(/\[Failed Nonce: (\d+)\]|nonce.*?(\d+)|Nonce.*?(\d+)/i);
        nonce = nonceMatch ? parseInt(nonceMatch[1] || nonceMatch[2] || nonceMatch[3]) : undefined;
      }

      if (errorType === 'NONCE_ERROR' || errorType === 'UNDERPRICED_ERROR' || errorType === 'REPLACEMENT_ERROR' || errorType === 'TIMEOUT') {
        this.metrics.nonceErrorDetails.push({
          userId,
          nonce,
          error: `[${errorType}] ${errorMessage.substring(0, 150)}`
        });
      }

      const errorDisplay = nonce !== undefined
        ? `❌ [${userId}] Exception with nonce ${nonce}: ${errorMessage.substring(0, 100)}`
        : `❌ [${userId}] Exception: ${errorMessage.substring(0, 100)}`;
      console.error(chalk.red(errorDisplay));
    } finally {
      this.metrics.activeUsers--;
      this.metrics.completedUsers++;
      this.metrics.lastCompletionTime = Date.now();
    }
  }

  private async executeUserFlow(userId: string): Promise<void> {
    const startTime = Date.now();
    this.metrics.activeUsers++;
    
    if (this.metrics.activeUsers > this.metrics.peakActiveUsers) {
      this.metrics.peakActiveUsers = this.metrics.activeUsers;
    }
    
    try {
      // Generate a deterministic private key for this user
      // Extract user index from format like "t001-user-5"
      const userParts = userId.split('-');
      const userIndex = parseInt(userParts[userParts.length - 1]);
      const baseKey = '0x' + '0'.repeat(63) + '1';
      const userPrivateKey = `0x${(BigInt(baseKey) + BigInt(userIndex)).toString(16).padStart(64, '0')}`;
      
      console.log(chalk.blue(`[${userId}] Starting flow...`));
      
      // Create client with nonce manager if enabled
      const configWithRelayer = { 
        ...this.config, 
        skipFundingCheck: true,
        masterRelayerPrivateKey: this.masterRelayerPrivateKey,
      };
      
      const client = await VanaLoadTestClient.create(
        userPrivateKey,
        configWithRelayer,
        this.stressConfig.useNonceManagement ? this.nonceManager : undefined
      );
      
      const userData = this.generateTestData();
      const prompt = generateWalletPrompt(client.getWalletAddress());
      
      const result = await client.executeDataPortabilityFlow(
        userData,
        prompt,
        userId,  // Use the full userId with test ID
        'http://localhost:3001'
      );
      
      const duration = Date.now() - startTime;
      this.metrics.responseTimes.push(duration);
      
      if (result.success) {
        this.metrics.successfulUsers++;

        // Capture timing metrics if available
        if (result.timings) {
          console.log(`[${userId}] Timings received:`, result.timings);
          if (result.timings.requestSubmitTime && result.timings.txHashReceivedTime) {
            const requestToTxHashTime = result.timings.txHashReceivedTime - result.timings.requestSubmitTime;
            this.metrics.requestToTxHashTimes.push(requestToTxHashTime);
            console.log(`[${userId}] Request-to-TxHash time: ${requestToTxHashTime}ms`);
          }
          if (result.timings.requestSubmitTime && result.timings.permissionIdReceivedTime) {
            const requestToPermissionIdTime = result.timings.permissionIdReceivedTime - result.timings.requestSubmitTime;
            this.metrics.requestToPermissionIdTimes.push(requestToPermissionIdTime);
            console.log(`[${userId}] Request-to-PermissionId time: ${requestToPermissionIdTime}ms`);
          }
        } else {
          console.log(`[${userId}] No timings data received in result`);
        }

        if (result.transactionHash) {
          this.metrics.transactionHashes.push(result.transactionHash);
          
          // Track block statistics asynchronously
          const blockPromise = this.trackBlockStats(result.transactionHash)
            .catch(error => console.error(`[BlockStats] Error tracking: ${error}`))
            .finally(() => this.activeBlockTracking.delete(blockPromise));
          this.activeBlockTracking.add(blockPromise);
        }
        
        // Track first completion
        if (!this.metrics.firstCompletionTime) {
          this.metrics.firstCompletionTime = Date.now();
        }
        
        console.log(chalk.green(`✅ [${userId}] Success in ${(duration/1000).toFixed(1)}s`));
      } else {
        this.metrics.failedUsers++;
        const errorMessage = result.error || 'Unknown';
        const errorType = this.categorizeError(errorMessage);
        this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
        
        // Extract nonce from result or error message
        let nonce = result.failedNonce;
        if (!nonce) {
          // Try to extract from error message as fallback
          const nonceMatch = errorMessage.match(/\[Failed Nonce: (\d+)\]|nonce.*?(\d+)|Nonce.*?(\d+)/i);
          nonce = nonceMatch ? parseInt(nonceMatch[1] || nonceMatch[2] || nonceMatch[3]) : undefined;
        }
        
        // Capture nonce-related error details (including underpriced and replacement)
        if (errorType === 'NONCE_ERROR' || errorType === 'UNDERPRICED_ERROR' || errorType === 'REPLACEMENT_ERROR' || errorType === 'TIMEOUT') {
          this.metrics.nonceErrorDetails.push({
            userId,
            nonce,
            error: `[${errorType}] ${errorMessage.substring(0, 150)}`
          });
        }
        
        // Include nonce in the error log
        const errorDisplay = nonce !== undefined 
          ? `❌ [${userId}] Failed with nonce ${nonce}: ${errorMessage.substring(0, 50)}...`
          : `❌ [${userId}] Failed: ${errorMessage.substring(0, 50)}...`;
        console.log(chalk.red(errorDisplay));
      }
      
    } catch (error) {
      this.metrics.failedUsers++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = this.categorizeError(errorMessage);
      this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
      
      // Extract nonce from error or error message
      let nonce = (error as any)?.failedNonce;
      if (!nonce) {
        // Try to extract from error message as fallback
        const nonceMatch = errorMessage.match(/\[Failed Nonce: (\d+)\]|nonce.*?(\d+)|Nonce.*?(\d+)/i);
        nonce = nonceMatch ? parseInt(nonceMatch[1] || nonceMatch[2] || nonceMatch[3]) : undefined;
      }
      
      // Capture nonce-related error details (including underpriced and replacement)
      if (errorType === 'NONCE_ERROR' || errorType === 'UNDERPRICED_ERROR' || errorType === 'REPLACEMENT_ERROR' || errorType === 'TIMEOUT') {
        this.metrics.nonceErrorDetails.push({
          userId,
          nonce,
          error: `[${errorType}] ${errorMessage.substring(0, 150)}`
        });
      }
      
      // Include nonce in the error log
      const errorDisplay = nonce !== undefined 
        ? `❌ [${userId}] Exception with nonce ${nonce}: ${errorMessage.substring(0, 100)}`
        : `❌ [${userId}] Exception: ${errorMessage.substring(0, 100)}`;
      console.error(chalk.red(errorDisplay));
    } finally {
      this.metrics.activeUsers--;
      this.metrics.completedUsers++;
      this.metrics.lastCompletionTime = Date.now();
    }
  }
  
  private generateTestData(): string {
    return JSON.stringify({
      userId: faker.string.uuid(),
      timestamp: Date.now(),
      userData: {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        bio: faker.lorem.paragraph(),
        age: faker.number.int({ min: 18, max: 80 }),
        location: faker.location.city(),
      },
      metrics: {
        posts: faker.number.int({ min: 0, max: 1000 }),
        followers: faker.number.int({ min: 0, max: 10000 }),
        following: faker.number.int({ min: 0, max: 1000 }),
      },
    });
  }
  
  private categorizeError(error: string): string {
    const errorLower = error.toLowerCase();
    if (errorLower.includes('nonce')) return 'NONCE_ERROR';
    if (errorLower.includes('underpriced')) return 'UNDERPRICED_ERROR';
    if (errorLower.includes('replacement')) return 'REPLACEMENT_ERROR';
    if (errorLower.includes('timeout')) return 'TIMEOUT';
    if (errorLower.includes('insufficient funds')) return 'INSUFFICIENT_FUNDS';
    if (errorLower.includes('network')) return 'NETWORK_ERROR';
    if (errorLower.includes('gas')) return 'GAS_ERROR';
    return 'OTHER';
  }
  
  private displayLiveMetrics(): void {
    const elapsed = (Date.now() - this.metrics.startTime) / 1000;
    const throughput = this.metrics.completedUsers / elapsed;
    const successRate = this.metrics.completedUsers > 0 
      ? (this.metrics.successfulUsers / this.metrics.completedUsers * 100).toFixed(1)
      : '0.0';
    
    console.log(chalk.cyan('\n📊 Live Metrics:'));
    console.log(`   Elapsed: ${elapsed.toFixed(1)}s`);
    console.log(`   Progress: ${this.metrics.completedUsers}/${this.metrics.totalUsers}`);
    console.log(`   Active: ${this.metrics.activeUsers} (Peak: ${this.metrics.peakActiveUsers})`);
    console.log(`   Success Rate: ${successRate}%`);
    console.log(`   Throughput: ${throughput.toFixed(2)} users/s`);
    
    // Show nonce manager status if enabled
    if (this.nonceManager) {
      const nonceStatus = this.nonceManager.getStatus();
      console.log(chalk.gray(`   Pending: ${nonceStatus.pendingCount} | Current: ${nonceStatus.currentNonce} | Next: ${nonceStatus.nextNonce}`));
    }
  }
  
  private async trackBlockStats(txHash: string): Promise<void> {
    try {
      const { createPublicClient, http } = await import('viem');
      const publicClient = createPublicClient({
        chain: moksha,
        transport: http(this.config.rpcEndpoints[0]),
      });
      
      // Get transaction receipt
      const receipt = await publicClient.getTransactionReceipt({ 
        hash: txHash as `0x${string}` 
      });
      
      if (!receipt || !receipt.blockNumber) {
        return;
      }
      
      // Get the actual transaction to fetch gas price
      const tx = await publicClient.getTransaction({ 
        hash: txHash as `0x${string}` 
      });
      
      // Calculate actual fee paid
      if (tx && receipt) {
        let actualFee: bigint;
        if (tx.type === 'eip1559' && receipt.effectiveGasPrice) {
          // EIP-1559 transaction: use effective gas price
          actualFee = receipt.gasUsed * receipt.effectiveGasPrice;
        } else if (tx.gasPrice) {
          // Legacy transaction: use gas price
          actualFee = receipt.gasUsed * tx.gasPrice;
        } else {
          // Fallback: estimate based on receipt
          actualFee = receipt.gasUsed * (receipt.effectiveGasPrice || 30000000000n);
        }
        
        // Track the actual fee
        this.metrics.actualTransactionFees.push(actualFee);
      }
      
      const blockNumber = receipt.blockNumber;
      const gasUsed = receipt.gasUsed;
      const blockKey = blockNumber.toString();
      
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
      
      // Get block details
      try {
        const block = await publicClient.getBlock({ blockNumber });
        if (block) {
          blockStat.totalTxsInBlock = block.transactions.length;
          blockStat.blockGasUsed = block.gasUsed;
          blockStat.gasUtilization = Number((blockStat.dataPortabilityGasUsed * 10000n) / blockStat.blockGasLimit) / 100;
          blockStat.timestamp = Number(block.timestamp) * 1000;
        }
      } catch (error) {
        // Ignore block detail errors
      }
      
      // Update aggregate statistics
      this.updateBlockAggregateStats();
      
    } catch (error) {
      // Silently ignore tracking errors
    }
  }
  
  private updateBlockAggregateStats(): void {
    const blockMap = this.metrics.blockStats.blockMap;
    if (blockMap.size === 0) return;
    
    let totalTxs = 0;
    let totalUtilization = 0;
    let maxTxs = 0;
    let minTxs = Number.MAX_SAFE_INTEGER;
    
    for (const block of blockMap.values()) {
      const txCount = block.dataPortabilityTxs.length;
      totalTxs += txCount;
      maxTxs = Math.max(maxTxs, txCount);
      minTxs = Math.min(minTxs, txCount);
      
      if (block.gasUtilization !== undefined) {
        totalUtilization += block.gasUtilization;
      }
    }
    
    this.metrics.blockStats.totalBlocks = blockMap.size;
    this.metrics.blockStats.avgTxsPerBlock = totalTxs / blockMap.size;
    this.metrics.blockStats.maxTxsPerBlock = maxTxs;
    this.metrics.blockStats.minTxsPerBlock = minTxs === Number.MAX_SAFE_INTEGER ? 0 : minTxs;
    this.metrics.blockStats.avgBlockUtilization = totalUtilization / blockMap.size;
  }
  
  private calculateFinalMetrics(): void {
    const totalDuration = (this.metrics.endTime! - this.metrics.startTime) / 1000;

    // Throughput
    this.metrics.throughputPerSecond = this.metrics.completedUsers / totalDuration;

    // Response time statistics
    if (this.metrics.responseTimes.length > 0) {
      const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);

      this.metrics.averageResponseTime = sum / sorted.length;
      this.metrics.medianResponseTime = sorted[Math.floor(sorted.length / 2)];
      this.metrics.p95ResponseTime = sorted[Math.floor(sorted.length * 0.95)];
      this.metrics.p99ResponseTime = sorted[Math.floor(sorted.length * 0.99)];
    }

    // Calculate request-to-txHash timing statistics
    if (this.metrics.requestToTxHashTimes.length > 0) {
      const sorted = [...this.metrics.requestToTxHashTimes].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);

      this.metrics.avgRequestToTxHash = sum / sorted.length;
      this.metrics.medianRequestToTxHash = sorted[Math.floor(sorted.length / 2)];
      this.metrics.p95RequestToTxHash = sorted[Math.floor(sorted.length * 0.95)];
      this.metrics.p99RequestToTxHash = sorted[Math.floor(sorted.length * 0.99)];
    }

    // Calculate request-to-permissionId timing statistics
    if (this.metrics.requestToPermissionIdTimes.length > 0) {
      const sorted = [...this.metrics.requestToPermissionIdTimes].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);

      this.metrics.avgRequestToPermissionId = sum / sorted.length;
      this.metrics.medianRequestToPermissionId = sorted[Math.floor(sorted.length / 2)];
      this.metrics.p95RequestToPermissionId = sorted[Math.floor(sorted.length * 0.95)];
      this.metrics.p99RequestToPermissionId = sorted[Math.floor(sorted.length * 0.99)];
    }

    // Update final block stats
    this.updateBlockAggregateStats();
  }
  
  private generateFinalReport(): void {
    const totalDuration = (this.metrics.endTime! - this.metrics.startTime) / 1000;
    const successRate = this.metrics.completedUsers > 0
      ? (this.metrics.successfulUsers / this.metrics.completedUsers * 100).toFixed(2)
      : '0.00';
    
    // Force output before report
    if (this.originalConsole && this.originalConsole.log) {
      this.originalConsole.log('\n\n');
    }
    
    const formattedTestId = TestIdManager.formatTestId(this.testId);
    
    console.log(chalk.cyan.bold('\n' + '═'.repeat(60)));
    console.log(chalk.cyan.bold(`📈 STRESS TEST FINAL REPORT - BURST MODE [Test #${formattedTestId}]`));
    console.log(chalk.cyan.bold('═'.repeat(60)));
    
    // Overall Statistics
    console.log(chalk.yellow('\n📊 Overall Statistics:'));
    console.log(`   Total Users: ${this.metrics.totalUsers}`);
    console.log(`   Completed: ${this.metrics.completedUsers}`);
    console.log(`   Successful: ${chalk.green(this.metrics.successfulUsers)}`);
    console.log(`   Failed: ${chalk.red(this.metrics.failedUsers)}`);
    console.log(`   Success Rate: ${chalk.white.bold(successRate + '%')}`);
    console.log(`   Peak Concurrent: ${this.metrics.peakActiveUsers}`);
    console.log(`   Test Duration: ${totalDuration.toFixed(1)}s`);
    console.log(`   Master Relayer: ${this.masterRelayerAddress}`);
    
    // Response Times (Full Flow Completion)
    if (this.metrics.responseTimes.length > 0) {
      const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
      const min = sorted[0] / 1000;
      const max = sorted[sorted.length - 1] / 1000;

      console.log(chalk.yellow('\n⏱️  Flow Completion Times:'));
      console.log(`   Minimum: ${chalk.green(min.toFixed(2) + 's')}`);
      console.log(`   Average: ${(this.metrics.averageResponseTime / 1000).toFixed(2)}s`);
      console.log(`   Maximum: ${chalk.red(max.toFixed(2) + 's')}`);
      console.log(chalk.gray('   ─────────────────'));
      console.log(`   P50 (Median): ${(this.metrics.medianResponseTime / 1000).toFixed(2)}s`);
      console.log(`   P95: ${(this.metrics.p95ResponseTime / 1000).toFixed(2)}s`);
      console.log(`   P99: ${(this.metrics.p99ResponseTime / 1000).toFixed(2)}s`);
    }

    // Transaction Submission Timing (Request to TX Hash)
    if (this.metrics.requestToTxHashTimes.length > 0) {
      const sorted = [...this.metrics.requestToTxHashTimes].sort((a, b) => a - b);
      const min = sorted[0] / 1000;
      const max = sorted[sorted.length - 1] / 1000;

      console.log(chalk.yellow('\n⚡ Request-to-TxHash Times:'));
      console.log(`   Samples: ${this.metrics.requestToTxHashTimes.length} transactions`);
      console.log(`   Minimum: ${chalk.green(min.toFixed(2) + 's')}`);
      console.log(`   Average: ${(this.metrics.avgRequestToTxHash / 1000).toFixed(2)}s`);
      console.log(`   Maximum: ${chalk.red(max.toFixed(2) + 's')}`);
      console.log(chalk.gray('   ─────────────────'));
      console.log(`   P50 (Median): ${(this.metrics.medianRequestToTxHash / 1000).toFixed(2)}s`);
      console.log(`   P95: ${(this.metrics.p95RequestToTxHash / 1000).toFixed(2)}s`);
      console.log(`   P99: ${(this.metrics.p99RequestToTxHash / 1000).toFixed(2)}s`);
    }

    // Transaction Confirmation Timing (Request to Permission ID)
    if (this.metrics.requestToPermissionIdTimes.length > 0) {
      const sorted = [...this.metrics.requestToPermissionIdTimes].sort((a, b) => a - b);
      const min = sorted[0] / 1000;
      const max = sorted[sorted.length - 1] / 1000;

      console.log(chalk.yellow('\n✅ Request-to-PermissionId Times:'));
      console.log(`   Samples: ${this.metrics.requestToPermissionIdTimes.length} transactions`);
      console.log(`   Minimum: ${chalk.green(min.toFixed(2) + 's')}`);
      console.log(`   Average: ${(this.metrics.avgRequestToPermissionId / 1000).toFixed(2)}s`);
      console.log(`   Maximum: ${chalk.red(max.toFixed(2) + 's')}`);
      console.log(chalk.gray('   ─────────────────'));
      console.log(`   P50 (Median): ${(this.metrics.medianRequestToPermissionId / 1000).toFixed(2)}s`);
      console.log(`   P95: ${(this.metrics.p95RequestToPermissionId / 1000).toFixed(2)}s`);
      console.log(`   P99: ${(this.metrics.p99RequestToPermissionId / 1000).toFixed(2)}s`);
    }
    
    // Transaction Costs
    if (this.metrics.transactionHashes.length > 0) {
      console.log(chalk.yellow('\n💰 Transaction Costs:'));
      
      // Show ACTUAL fees if we have them
      if (this.metrics.actualTransactionFees.length > 0) {
        const actualTotalFee = this.metrics.actualTransactionFees.reduce((a, b) => a + b, 0n);
        const actualAvgFee = actualTotalFee / BigInt(this.metrics.actualTransactionFees.length);
        
        // Calculate min/max actual fees
        const sortedFees = [...this.metrics.actualTransactionFees].sort((a, b) => {
          if (a < b) return -1;
          if (a > b) return 1;
          return 0;
        });
        const actualMinFee = sortedFees[0];
        const actualMaxFee = sortedFees[sortedFees.length - 1];
        
        console.log(chalk.green('\n   🔍 Actual On-Chain Fees (from receipts):'));
        console.log(`   Total Actual Cost: ${chalk.white.bold(formatEther(actualTotalFee))} VANA`);
        console.log(`   Average Cost: ${chalk.white.bold(formatEther(actualAvgFee))} VANA`);
        console.log(`   Min Cost: ${formatEther(actualMinFee)} VANA`);
        console.log(`   Max Cost: ${formatEther(actualMaxFee)} VANA`);
        console.log(`   Transactions Tracked: ${this.metrics.actualTransactionFees.length}`);
        
        // Calculate effective gas price from actual fees
        const avgGasUsed = 100000n; // Approximate
        const effectiveGasPrice = actualAvgFee / avgGasUsed;
        const effectiveGwei = Number(effectiveGasPrice) / 1e9;
        console.log(`   Effective Gas Price: ~${effectiveGwei.toFixed(1)} gwei`);
      }
      
      // Show estimates for comparison
      const estimatedGasPerTx = 100000n;
      const estimatedGasPrice = 30n * 1_000_000_000n; // 30 gwei (high estimate)
      const estimatedCostPerTx = estimatedGasPerTx * estimatedGasPrice;
      const totalCost = estimatedCostPerTx * BigInt(this.metrics.successfulUsers);
      const avgCost = estimatedCostPerTx;
      
      // Also show optimistic estimate with lower gas
      const optimisticGasPrice = 5n * 1_000_000_000n; // 5 gwei
      const optimisticCostPerTx = estimatedGasPerTx * optimisticGasPrice;
      const optimisticTotalCost = optimisticCostPerTx * BigInt(this.metrics.successfulUsers);
      
      console.log(chalk.gray('\n   📊 Estimates (for comparison):'));
      console.log(`   Gas per TX: ~${(Number(estimatedGasPerTx) / 1000).toFixed(0)}k gas`);
      console.log(`   Network Gas Price Range: 5-30 gwei`);
      console.log(chalk.gray('   ─────────────────'));
      console.log(`   Est. Total (@ 30 gwei): ${formatEther(totalCost)} VANA`);
      console.log(`   Est. Average (@ 30 gwei): ${formatEther(avgCost)} VANA`);
      console.log(chalk.gray('   ─────────────────'));
      console.log(`   Est. Total (@ 5 gwei): ${formatEther(optimisticTotalCost)} VANA`);
      console.log(`   Est. Average (@ 5 gwei): ${formatEther(optimisticCostPerTx)} VANA`);
      
      if (this.metrics.actualTransactionFees.length > 0) {
        // Calculate accuracy of estimates
        const actualAvgFee = this.metrics.actualTransactionFees.reduce((a, b) => a + b, 0n) / BigInt(this.metrics.actualTransactionFees.length);
        const highEstimateAccuracy = Number(actualAvgFee * 100n / estimatedCostPerTx);
        const lowEstimateAccuracy = Number(actualAvgFee * 100n / optimisticCostPerTx);
        
        console.log(chalk.gray('\n   📈 Estimate Accuracy:'));
        if (highEstimateAccuracy < 100) {
          console.log(`   30 gwei estimate was ${(100 - highEstimateAccuracy).toFixed(0)}% higher than actual`);
        } else {
          console.log(`   30 gwei estimate was ${(highEstimateAccuracy - 100).toFixed(0)}% lower than actual`);
        }
        
        if (lowEstimateAccuracy < 100) {
          console.log(`   5 gwei estimate was ${(100 - lowEstimateAccuracy).toFixed(0)}% lower than actual`);
        } else {
          console.log(`   5 gwei estimate was ${(lowEstimateAccuracy - 100).toFixed(0)}% higher than actual`);
        }
      }
      
      console.log(chalk.gray(`\n   Note: Gas multiplier (${this.config.premiumGasMultiplier}x) affects tx priority, not actual cost`));
    }
    
    // Error Breakdown
    if (Object.keys(this.metrics.errorsByType).length > 0) {
      console.log(chalk.yellow('\n❌ Error Breakdown:'));
      const sortedErrors = Object.entries(this.metrics.errorsByType)
        .sort((a, b) => b[1] - a[1]);
      for (const [type, count] of sortedErrors) {
        const percentage = this.metrics.failedUsers > 0 
          ? ((count / this.metrics.failedUsers) * 100).toFixed(1)
          : '0.0';
        console.log(`   ${type}: ${count} (${percentage}%)`);
      }
      
      // Show detailed nonce error information
      if (this.metrics.nonceErrorDetails.length > 0) {
        console.log(chalk.yellow('\n📝 Nonce Error Details:'));
        console.log(`   Total Nonce Errors: ${this.metrics.nonceErrorDetails.length}`);
        
        // Group by nonce value
        const nonceGroups: { [nonce: string]: string[] } = {};
        const unknownNonces: string[] = [];
        
        for (const detail of this.metrics.nonceErrorDetails) {
          if (detail.nonce !== undefined) {
            const nonceKey = detail.nonce.toString();
            if (!nonceGroups[nonceKey]) {
              nonceGroups[nonceKey] = [];
            }
            nonceGroups[nonceKey].push(detail.userId);
          } else {
            unknownNonces.push(detail.userId);
          }
        }
        
        // Show nonces with conflicts
        const sortedNonces = Object.entries(nonceGroups)
          .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
        
        if (sortedNonces.length > 0) {
          console.log(chalk.gray('   Nonces with errors:'));
          for (const [nonce, users] of sortedNonces.slice(0, 10)) {
            console.log(`     Nonce ${nonce}: ${users.length} error(s) [${users.slice(0, 3).join(', ')}${users.length > 3 ? '...' : ''}]`);
          }
          if (sortedNonces.length > 10) {
            console.log(`     ... and ${sortedNonces.length - 10} more nonces with errors`);
          }
        }
        
        if (unknownNonces.length > 0) {
          console.log(`   Users with nonce errors (nonce not extracted): ${unknownNonces.length}`);
        }
        
        // Show sample error messages
        console.log(chalk.gray('\n   Sample error messages:'));
        const sampleErrors = this.metrics.nonceErrorDetails.slice(0, 3);
        for (const detail of sampleErrors) {
          console.log(`     [${detail.userId}] ${detail.error.substring(0, 100)}...`);
        }
      }
    }
    
    // Nonce Management Report
    const relayMode = this.config.relayMode || 'relayer-wallet';
    const isRelayerWallet = relayMode === 'relayer-wallet';

    if (this.nonceManager && isRelayerWallet) {
      const finalStatus = this.nonceManager.getStatus();
      console.log(chalk.yellow('\n🔢 Nonce Management (Local):'));
      console.log(`   Strategy: ${chalk.green('Direct sequential reservation')}`);
      console.log(`   Current Nonce: ${finalStatus.currentNonce}`);
      console.log(`   Next Nonce: ${finalStatus.nextNonce}`);
      console.log(`   Last Confirmed: ${finalStatus.lastConfirmed}`);
      console.log(`   Pending Count: ${finalStatus.pendingCount}`);
      console.log(`   Gaps Detected: ${finalStatus.gaps.length}`);
      
      // Gap nonces are only relevant for relayer-wallet mode
      if (finalStatus.gaps.length > 0) {
        console.log(chalk.yellow('\n   📍 Gap Nonces (Full List):'));
        if (finalStatus.gaps.length <= 50) {
          // Show all gaps if 50 or fewer
          console.log(`     ${chalk.yellow(finalStatus.gaps.join(', '))}`);
        } else {
          // Show in batches if more than 50
          for (let i = 0; i < finalStatus.gaps.length; i += 20) {
            const batch = finalStatus.gaps.slice(i, Math.min(i + 20, finalStatus.gaps.length));
            console.log(`     ${batch.join(', ')}`);
          }
        }
        
        // Analyze gap patterns
        if (finalStatus.gaps.length > 1) {
          const gapRanges: { start: number; end: number }[] = [];
          let rangeStart = finalStatus.gaps[0];
          let rangeEnd = finalStatus.gaps[0];
          
          for (let i = 1; i < finalStatus.gaps.length; i++) {
            if (finalStatus.gaps[i] === rangeEnd + 1) {
              rangeEnd = finalStatus.gaps[i];
            } else {
              gapRanges.push({ start: rangeStart, end: rangeEnd });
              rangeStart = finalStatus.gaps[i];
              rangeEnd = finalStatus.gaps[i];
            }
          }
          gapRanges.push({ start: rangeStart, end: rangeEnd });
          
          if (gapRanges.length < finalStatus.gaps.length / 2) {
            console.log(chalk.gray('\n   Gap Ranges:'));
            for (const range of gapRanges.slice(0, 10)) {
              if (range.start === range.end) {
                console.log(`     ${range.start}`);
              } else {
                console.log(`     ${range.start}-${range.end} (${range.end - range.start + 1} nonces)`);
              }
            }
            if (gapRanges.length > 10) {
              console.log(`     ... and ${gapRanges.length - 10} more ranges`);
            }
          }
        }
      }
    } else if (!isRelayerWallet) {
      console.log(chalk.yellow('\n🔢 Nonce Management:'));
      console.log(`   Strategy: ${chalk.cyan('Server-side management')}`);
      console.log(`   Mode: ${chalk.white(relayMode === 'async-relay' ? 'Async Relay (Atomic)' : 'Relay Endpoint')}`);
    } else {
      console.log(chalk.yellow('\n🔢 Nonce Management:'));
      console.log(`   Strategy: ${chalk.red('DISABLED - Uncoordinated submission')}`);
      console.log(`   ${chalk.red('⚠️  High failure rate expected due to nonce conflicts')}`);
    }
    
    // Throughput Analysis
    console.log(chalk.yellow('\n🚀 Throughput:'));
    console.log(`   Actual: ${this.metrics.throughputPerSecond.toFixed(2)} users/second`);
    console.log(`   Target: ${(this.stressConfig.maxConcurrentUsers / 10).toFixed(2)} users/second (estimated)`);
    
    if (this.metrics.firstCompletionTime && this.metrics.lastCompletionTime) {
      const flowWindow = (this.metrics.lastCompletionTime - this.metrics.firstCompletionTime) / 1000;
      const flowThroughput = this.metrics.completedUsers / flowWindow;
      console.log(`   Flow Window: ${flowWindow.toFixed(1)}s`);
      console.log(`   Flow Throughput: ${flowThroughput.toFixed(2)} users/second`);
    }
    
    // Peak Performance
    console.log(chalk.yellow('\n📊 Peak Performance:'));
    console.log(`   Peak Concurrent Users: ${this.metrics.peakActiveUsers}`);
    console.log(`   Max Concurrency Limit: ${this.stressConfig.maxConcurrentUsers}`);
    console.log(`   Utilization: ${((this.metrics.peakActiveUsers / this.stressConfig.maxConcurrentUsers) * 100).toFixed(1)}%`);
    
    // Block Statistics
    console.log(chalk.yellow('\n📦 Block Statistics:'));
    console.log(`   Transactions tracked: ${this.metrics.blockStats.txToBlock.size}`);
    console.log(`   Unique blocks used: ${this.metrics.blockStats.blockMap.size}`);
    
    if (this.metrics.blockStats.blockMap.size > 0) {
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
        console.log(chalk.gray('\n   Top Block Gas Utilization:'));
        sortedBlocks.forEach((block, i) => {
          const gasUsedMB = Number(block.dataPortabilityGasUsed) / 1_000_000;
          console.log(`     ${i + 1}. Block ${block.blockNumber}: ${gasUsedMB.toFixed(2)}M gas (${block.gasUtilization?.toFixed(2)}%)`);
        });
      }
      
      // Calculate block throughput
      if (totalDuration > 0) {
        const blocksPerMinute = (this.metrics.blockStats.totalBlocks / (totalDuration / 60));
        console.log(chalk.gray('\n   Block Throughput:'));
        console.log(`     Blocks/minute: ${blocksPerMinute.toFixed(2)}`);
        if (this.metrics.blockStats.totalBlocks > 1) {
          console.log(`     Avg time between blocks: ${(totalDuration / this.metrics.blockStats.totalBlocks).toFixed(1)}s`);
        }
      }
    }
    
    // Success/Failure Determination
    console.log(chalk.cyan.bold('\n' + '═'.repeat(60)));
    const wasSuccessful = parseFloat(successRate) >= 95.0;
    if (this.metrics.successfulUsers === this.metrics.totalUsers) {
      console.log(chalk.green.bold('🎉 STRESS TEST PASSED - PERFECT SCORE!'));
      console.log(chalk.green(`   All ${this.metrics.totalUsers} flows completed successfully`));
    } else if (wasSuccessful) {
      console.log(chalk.green.bold('✅ STRESS TEST PASSED'));
      console.log(chalk.yellow(`   ${successRate}% success rate meets threshold`));
    } else {
      console.log(chalk.red.bold('❌ STRESS TEST FAILED'));
      console.log(chalk.red(`   ${successRate}% success rate below 95% threshold`));
    }
    
    console.log(chalk.gray(`\n📄 Full log saved to: ${this.logFile}`));
    console.log(chalk.cyan.bold('═'.repeat(60) + '\n'));
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): StressTestConfig {
  const args = process.argv.slice(2);
  
  const config: StressTestConfig = {
    totalUsers: 10,
    maxConcurrentUsers: 10,
    useNonceManagement: true, // CRITICAL: Enable nonce management for single relayer wallet
    timeoutSeconds: parseInt(process.env.STRESS_TEST_TIMEOUT || '300'), // Default 5 minutes, override with STRESS_TEST_TIMEOUT env var
    aggressiveMode: false, // Default to standard mode
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--users':
        config.totalUsers = parseInt(args[++i]);
        break;
      case '--concurrency':
        config.maxConcurrentUsers = parseInt(args[++i]);
        break;
      case '--timeout':
        config.timeoutSeconds = parseInt(args[++i]);
        break;
      case '--no-nonce-management':
        config.useNonceManagement = false;
        break;
      case '--aggressive':
        config.aggressiveMode = true;
        break;
      case '--relay-mode':
        if (i + 1 < args.length) {
          const mode = args[++i];
          if (mode === 'relayer-wallet' || mode === 'relay-endpoint' || mode === 'async-relay' || mode === 'sync-relay') {
            // @ts-ignore - We'll pass this to the config later
            config.relayMode = mode;
          } else {
            console.error(`Invalid relay mode: ${mode}. Must be 'relayer-wallet', 'relay-endpoint', 'async-relay', or 'sync-relay'`);
            process.exit(1);
          }
        }
        break;
      case '--relay-endpoint':
        if (i + 1 < args.length) {
          // @ts-ignore - We'll pass this to the config later
          config.relayEndpointUrl = args[++i];
        }
        break;
      case '--help':
        console.log(`
Usage: npx tsx milestones/ms-05/test-stress-burst-relayer.ts [options]

Stress Test - Executes all flows as fast as possible using a SINGLE relayer wallet

Options:
  --users <n>             Total number of users (default: 10)
  --concurrency <n>       Max concurrent users (default: 10)
  --timeout <n>           Timeout in seconds (default: 300)
  --aggressive            Enable aggressive mode - release slot after txHash instead of full flow completion
  --no-nonce-management   Disable nonce management (NOT RECOMMENDED - will cause failures)
  --relay-mode <mode>     Set relay mode: 'relayer-wallet', 'relay-endpoint', 'async-relay', or 'sync-relay' (default: relayer-wallet)
  --relay-endpoint <url>  URL for relay endpoint:
                          - For sync-relay: http://localhost:3082/api/relay (direct response)
                          - For async-relay: http://localhost:3082 (3-step flow)
                          - For relay-endpoint: http://localhost:3082/api/relay (legacy)
  --help                  Show this help message

Environment Variables:
  RELAYER_PRIVATE_KEY     Required - Master relayer wallet that pays for all transactions
  PREMIUM_GAS_MULTIPLIER  Gas multiplier (default: 2.0)
  TRANSACTION_TIMEOUT_MS  Transaction confirmation timeout in ms (default: 60000)
  RELAY_MODE              Set relay mode: 'relayer-wallet', 'relay-endpoint', or 'async-relay'
  RELAY_ENDPOINT_URL      URL for relay endpoint

IMPORTANT: Nonce management is ENABLED by default to handle concurrent transactions
          through a single relayer wallet. Disabling it will cause nonce conflicts!

Examples:
  # Small burst test
  npx tsx milestones/ms-05/test-stress-burst-relayer.ts --users 10 --concurrency 10
  
  # Large stress test with high concurrency
  PREMIUM_GAS_MULTIPLIER=50 npx tsx milestones/ms-05/test-stress-burst-relayer.ts \\
    --users 100 --concurrency 50 --timeout 600
  
  # Very high load test (5000 users) - use shorter TX timeout
  TRANSACTION_TIMEOUT_MS=30000 PREMIUM_GAS_MULTIPLIER=100 npx tsx milestones/ms-05/test-stress-burst-relayer.ts \\
    --users 5000 --concurrency 100 --timeout 1200
  
  # Test without nonce management (expect failures)
  npx tsx milestones/ms-05/test-stress-burst-relayer.ts \\
    --users 20 --concurrency 20 --no-nonce-management
  
  # Use relay endpoint instead of relayer wallet
  npx tsx milestones/ms-05/test-stress-burst-relayer.ts \\
    --users 50 --concurrency 25 \\
    --relay-mode relay-endpoint --relay-endpoint http://localhost:3082/api/relay

  # Use sync relay endpoint (direct response from /api/relay)
  npx tsx milestones/ms-05/test-stress-burst-relayer.ts \\
    --users 50 --concurrency 25 \\
    --relay-mode sync-relay --relay-endpoint http://localhost:3082/api/relay

  # Use async relay (3-step flow) for better concurrency
  npx tsx milestones/ms-05/test-stress-burst-relayer.ts \\
    --users 100 --concurrency 50 \\
    --relay-mode async-relay --relay-endpoint http://localhost:3082

  # Aggressive mode with sync relay (maximum throughput)
  npx tsx milestones/ms-05/test-stress-burst-relayer.ts \\
    --users 100 --concurrency 20 --aggressive \\
    --relay-mode sync-relay --relay-endpoint http://localhost:3082/api/relay
        `);
        process.exit(0);
    }
  }
  
  // Auto-adjust concurrency if not specified
  if (config.maxConcurrentUsers > config.totalUsers) {
    config.maxConcurrentUsers = config.totalUsers;
  }
  
  return config;
}

/**
 * Main entry point
 */
async function main() {
  try {
    const config = await loadConfig();
    const stressConfig = parseArgs();

    // Debug: Show loaded config
    console.log(chalk.gray('\n📋 Loaded config from .env:'));
    console.log(chalk.gray(`   RELAY_MODE: ${config.relayMode}`));
    console.log(chalk.gray(`   RELAY_ENDPOINT_URL: ${config.relayEndpointUrl}`));

    // Override gas configuration
    config.premiumGasMultiplier = parseFloat(process.env.PREMIUM_GAS_MULTIPLIER || '2.0');

    // Use a shorter transaction timeout for stress testing (default 60s, can override with env var)
    // This should be much shorter than the overall test timeout to allow retries
    config.transactionTimeoutMs = parseInt(process.env.TRANSACTION_TIMEOUT_MS || '60000'); // 60 seconds default

    // Apply relay configuration from command line args (override .env if provided)
    if ('relayMode' in stressConfig) {
      console.log(chalk.yellow(`   Overriding relay mode from CLI: ${(stressConfig as any).relayMode}`));
      config.relayMode = (stressConfig as any).relayMode;
    }
    if ('relayEndpointUrl' in stressConfig) {
      console.log(chalk.yellow(`   Overriding relay endpoint from CLI: ${(stressConfig as any).relayEndpointUrl}`));
      config.relayEndpointUrl = (stressConfig as any).relayEndpointUrl;
    }

    console.log(chalk.green('\n✅ Final config:'));
    console.log(chalk.green(`   RELAY_MODE: ${config.relayMode}`));
    console.log(chalk.green(`   RELAY_ENDPOINT_URL: ${config.relayEndpointUrl}`));
    
    const test = new StressTestBurstRelayer(config, stressConfig);
    await test.run();
    
  } catch (error) {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}