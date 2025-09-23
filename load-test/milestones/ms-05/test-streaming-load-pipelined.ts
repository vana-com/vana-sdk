#!/usr/bin/env node

import { VanaLoadTestClient } from '../../src/client/load-test-client.js';
import { LoadTestApiServer } from '../../src/server/api-server.js';
import { loadConfig } from '../../src/config/loader.js';
import { generateWalletPrompt } from '../../src/utils/prompt-generator.js';
import { NoncePipelineManager } from '../../src/utils/nonce-pipeline-manager.js';
import { globalErrorTracker } from '../../src/utils/error-tracker.js';
import { faker } from '@faker-js/faker';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseEther, formatEther, type Hash } from 'viem';
import { moksha } from '@opendatalabs/vana-sdk/chains';
import chalk from 'chalk';
import ora from 'ora';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Milestone 5 V3: Pipelined Single Relayer Load Test
 * 
 * Optimizations:
 * - Single master relayer for all transactions
 * - Pipelined nonce management (no waiting for confirmations)
 * - Pending window of 16-64 transactions
 * - Automatic replacement of stuck transactions
 * - Backpressure control based on window size and SLA
 * 
 * Usage:
 * # Standard test
 * npx tsx milestones/ms-05/test-streaming-load-pipelined.ts
 * 
 * # Custom parameters
 * npx tsx milestones/ms-05/test-streaming-load-pipelined.ts --users 100 --rate 5.0 --window 32
 */

interface StreamingConfigV3 {
  totalUsers: number;
  arrivalRateUsersPerSecond: number;
  testDurationMinutes: number;
  
  // Pipeline configuration
  pipelineWindowSize: number;      // Size of pending window (16-64)
  stuckThresholdMs: number;        // Time before considering tx stuck
  maxPendingTimeMs: number;        // SLA for oldest pending tx
  feeIncreaseFactor: number;       // Fee increase for replacements
  
  // Ramp Patterns (Artillery-style)
  rampUpDurationSeconds: number;
  sustainDurationSeconds: number;
  rampDownDurationSeconds: number;
}

interface WalletInfo {
  privateKey: string;
  address: string;
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
  nonce?: number;
  pipelined: boolean;
}

interface StreamingMetricsV3 {
  totalUsers: number;
  submittedUsers: number;
  completedUsers: number;
  successfulUsers: number;
  failedUsers: number;
  activeUsers: number;
  peakActiveUsers: number;
  startTime: number;
  endTime?: number;
  responseTimes: number[];
  errorsByType: { [key: string]: number };
  pipelineStats: {
    windowSize: number;
    avgUtilization: number;
    peakUtilization: number;
    replacements: number;
    backpressureEvents: number;
  };
  phases: {
    rampUp: { startTime: number; endTime?: number; usersCompleted: number };
    sustain: { startTime?: number; endTime?: number; usersCompleted: number };
    rampDown: { startTime?: number; endTime?: number; usersCompleted: number };
  };
}

class ArtilleryStyleUserStream extends EventEmitter {
  private config: StreamingConfigV3;
  private usersSpawned: number = 0;
  private isRunning: boolean = false;
  private currentPhase: 'ramp-up' | 'sustain' | 'ramp-down' = 'ramp-up';
  private phaseStartTime: number = 0;

  constructor(config: StreamingConfigV3) {
    super();
    this.config = config;
  }

  start() {
    this.isRunning = true;
    this.phaseStartTime = Date.now();
    console.log(chalk.cyan('🚀 Starting Artillery-style load pattern...'));
    this.scheduleNextUser();
  }

  stop() {
    this.isRunning = false;
  }

  private scheduleNextUser() {
    if (!this.isRunning || this.usersSpawned >= this.config.totalUsers) {
      if (this.usersSpawned >= this.config.totalUsers) {
        this.emit('complete');
      }
      return;
    }

    const delay = this.getNextArrivalDelay();
    setTimeout(() => {
      if (this.isRunning && this.usersSpawned < this.config.totalUsers) {
        this.usersSpawned++;
        this.emit('userArrival', {
          userId: `user-${this.usersSpawned}`,
          arrivalTime: Date.now(),
          phase: this.currentPhase,
        });
        
        this.updatePhase();
        this.scheduleNextUser();
      }
    }, delay);
  }

  private updatePhase() {
    const totalUsers = this.config.totalUsers;
    const rampUpUsers = Math.floor(totalUsers * 0.3); // 30% ramp-up
    const sustainUsers = Math.floor(totalUsers * 0.6); // 60% sustain
    
    if (this.currentPhase === 'ramp-up' && this.usersSpawned >= rampUpUsers) {
      this.currentPhase = 'sustain';
      this.phaseStartTime = Date.now();
      this.emit('phaseChange', 'sustain');
      console.log(chalk.yellow('📈 Phase: Ramp-Up → Sustain'));
    } else if (this.currentPhase === 'sustain' && this.usersSpawned >= (rampUpUsers + sustainUsers)) {
      this.currentPhase = 'ramp-down';
      this.phaseStartTime = Date.now();
      this.emit('phaseChange', 'ramp-down');
      console.log(chalk.yellow('📉 Phase: Sustain → Ramp-Down'));
    }
  }

  private getNextArrivalDelay(): number {
    let currentRate = this.config.arrivalRateUsersPerSecond;
    
    switch (this.currentPhase) {
      case 'ramp-up':
        const rampProgress = (Date.now() - this.phaseStartTime) / (this.config.rampUpDurationSeconds * 1000);
        currentRate = this.config.arrivalRateUsersPerSecond * (0.5 + 0.5 * Math.min(rampProgress, 1));
        break;
      case 'sustain':
        currentRate = this.config.arrivalRateUsersPerSecond;
        break;
      case 'ramp-down':
        const downProgress = (Date.now() - this.phaseStartTime) / (this.config.rampDownDurationSeconds * 1000);
        currentRate = this.config.arrivalRateUsersPerSecond * (1.0 - 0.7 * Math.min(downProgress, 1));
        break;
    }

    // Exponential distribution for Poisson process
    return -Math.log(Math.random()) / currentRate * 1000;
  }

  getProgress() {
    return {
      spawned: this.usersSpawned,
      total: this.config.totalUsers,
      phase: this.currentPhase,
      rate: this.config.arrivalRateUsersPerSecond,
    };
  }
}

class EndUserWalletPool {
  private wallets: WalletInfo[] = [];
  private usedWallets: Set<string> = new Set();

  constructor() {}

  async initialize(count: number): Promise<void> {
    console.log(chalk.cyan(`🏦 Generating ${count} end-user wallets (for identity only)...`));
    
    for (let i = 0; i < count; i++) {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      
      this.wallets.push({
        privateKey,
        address: account.address,
      });
    }
    
    console.log(chalk.green(`✅ Generated ${this.wallets.length} end-user identities`));
  }

  getWallet(): WalletInfo {
    if (this.wallets.length === 0) {
      throw new Error('No end-user wallets available');
    }
    
    const wallet = this.wallets.shift()!;
    this.usedWallets.add(wallet.address);
    
    if (this.wallets.length < 10) {
      console.log(chalk.yellow(`⚠️  End-user wallet pool running low: ${this.wallets.length} remaining`));
    }
    
    return wallet;
  }

  returnWallet(wallet: WalletInfo): void {
    // In pipelined mode, we don't reuse wallets
    this.usedWallets.add(wallet.address);
  }

  getStats() {
    return {
      remaining: this.wallets.length,
      used: this.usedWallets.size,
      total: this.wallets.length + this.usedWallets.size,
    };
  }
}

export class PipelinedStreamingLoadTest {
  private config: any;
  private apiServer?: LoadTestApiServer;
  private userStream?: ArtilleryStyleUserStream;
  private walletPool?: EndUserWalletPool;
  private pipelineManager?: NoncePipelineManager;
  private masterRelayerClient?: VanaLoadTestClient;
  private metrics: StreamingMetricsV3;
  private activeFlows: Map<string, Promise<UserFlowResult>> = new Map();
  
  // Control & Logging
  private isRunning = false;
  private shouldStop = false;
  private logFile: string;
  private logStream?: fs.WriteStream;
  
  // Pipeline stats tracking
  private utilizationSamples: number[] = [];
  private backpressureEvents: number = 0;
  
  // Original console methods for dual logging
  private originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  };

  constructor(config: any, streamingConfig: StreamingConfigV3) {
    this.config = config;
    
    // Setup logging
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(process.cwd(), `pipelined-load-test-${timestamp}.log`);
    this.setupGracefulShutdown();
    this.setupDualLogging();
    
    this.metrics = {
      totalUsers: streamingConfig.totalUsers,
      submittedUsers: 0,
      completedUsers: 0,
      successfulUsers: 0,
      failedUsers: 0,
      activeUsers: 0,
      peakActiveUsers: 0,
      startTime: Date.now(),
      responseTimes: [],
      errorsByType: {},
      pipelineStats: {
        windowSize: streamingConfig.pipelineWindowSize,
        avgUtilization: 0,
        peakUtilization: 0,
        replacements: 0,
        backpressureEvents: 0,
      },
      phases: {
        rampUp: { startTime: Date.now(), usersCompleted: 0 },
        sustain: { usersCompleted: 0 },
        rampDown: { usersCompleted: 0 },
      },
    };

    // Initialize components
    this.walletPool = new EndUserWalletPool();
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
    const writeToFile = (level: string, ...args: any[]) => {
      const timestamp = new Date().toISOString();
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, (key, value) => 
              typeof value === 'bigint' ? value.toString() : value
            );
          } catch (error) {
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
    this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    
    this.log('🚀 Pipelined load test started');
    
    console.log(chalk.blue(`📝 Complete log file: ${this.logFile}`));
    console.log(chalk.yellow(`💡 Press Ctrl+C to gracefully stop and save results`));
    
    const gracefulShutdown = async (signal: string) => {
      this.log(`\n🛑 Received ${signal}, initiating graceful shutdown...`);
      console.log(chalk.yellow(`\n🛑 Received ${signal}, stopping gracefully...`));
      
      this.shouldStop = true;
      this.isRunning = false;
      
      // Wait for pipeline to drain
      if (this.pipelineManager) {
        console.log(chalk.yellow('⏳ Waiting for pipeline to drain...'));
        await this.pipelineManager.waitForDrain(30000);
      }
      
      // Wait for active flows to complete (max 30 seconds)
      const shutdownTimeout = 30000;
      const startShutdown = Date.now();
      
      while (this.activeFlows.size > 0 && (Date.now() - startShutdown) < shutdownTimeout) {
        console.log(chalk.yellow(`⏳ Waiting for ${this.activeFlows.size} active flows to complete...`));
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (this.activeFlows.size > 0) {
        console.log(chalk.yellow(`⚠️  Force-stopping ${this.activeFlows.size} remaining flows`));
      }
      
      // Stop API server
      if (this.apiServer) {
        await this.apiServer.stop();
      }
      
      // Display final results
      this.displayFinalResults();
      
      // Restore original console methods
      console.log = this.originalConsole.log;
      console.error = this.originalConsole.error;
      console.warn = this.originalConsole.warn;
      console.info = this.originalConsole.info;
      
      // Close log stream
      if (this.logStream) {
        this.logStream.end();
      }
      
      // Cleanup pipeline manager
      if (this.pipelineManager) {
        this.pipelineManager.destroy();
      }
      
      console.log(chalk.green(`✅ Graceful shutdown complete. Log saved to: ${this.logFile}`));
      process.exit(0);
    };
    
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  }

  async run(streamingConfig: StreamingConfigV3): Promise<void> {
    try {
      this.isRunning = true;
      this.log(`Starting pipelined load test: ${streamingConfig.totalUsers} users, window size ${streamingConfig.pipelineWindowSize}`);
      
      console.log(chalk.cyan(`\n🌊 Starting Milestone 5 V3: Pipelined Single Relayer Load Test`));
      console.log(chalk.blue(`📊 ${streamingConfig.totalUsers} users with pipeline window of ${streamingConfig.pipelineWindowSize}`));
      
      // Check master relayer
      if (!this.config.relayerPrivateKey) {
        throw new Error('RELAYER_PRIVATE_KEY not configured in .env');
      }
      
      const masterAddress = privateKeyToAccount(this.config.relayerPrivateKey as `0x${string}`).address;
      console.log(chalk.yellow(`👑 Master Relayer: ${masterAddress}`));
      console.log(chalk.green(`📋 Complete log: ${this.logFile}\n`));

      await this.startApiServer();
      await this.initializeComponents(streamingConfig);
      
      // Start real-time metrics dashboard
      this.startMetricsDashboard();
      
      // Start the streaming test
      await this.executeStreamingTest();
      
      // Wait for pipeline to drain
      console.log(chalk.yellow('\n⏳ Waiting for pipeline to drain...'));
      await this.pipelineManager!.waitForDrain(60000);
      
      // Display final results
      this.displayFinalResults();
      
    } catch (error) {
      console.error(chalk.red(`\n💥 Pipelined load test failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  private async startApiServer(): Promise<void> {
    console.log(chalk.yellow('Starting API server...'));
    const spinner = ora('Starting API server...').start();
    
    try {
      this.apiServer = new LoadTestApiServer(this.config, 3001);
      await this.apiServer.start();
      
      const response = await fetch('http://localhost:3001/health');
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      
      spinner.succeed(chalk.green('API server ready'));
    } catch (error) {
      spinner.fail(chalk.red('Failed to start API server'));
      throw error;
    }
  }

  private async initializeComponents(streamingConfig: StreamingConfigV3): Promise<void> {
    // Initialize master relayer client
    console.log(chalk.yellow('🔧 Initializing master relayer client...'));
    this.masterRelayerClient = await VanaLoadTestClient.create(
      this.config.relayerPrivateKey,
      { ...this.config, skipFundingCheck: true, enableDebugLogs: false }
    );
    
    // Check master relayer balance
    const balance = await this.masterRelayerClient.checkWalletBalance();
    console.log(chalk.green(`✅ Master Relayer Balance: ${balance.balanceFormatted} VANA`));
    
    // Initialize nonce pipeline manager
    console.log(chalk.yellow('🔧 Initializing nonce pipeline manager...'));
    this.pipelineManager = new NoncePipelineManager({
      privateKey: this.config.relayerPrivateKey,
      rpcUrl: this.config.rpcEndpoints[0],
      chainId: 14800, // Moksha testnet
      
      windowSize: streamingConfig.pipelineWindowSize,
      stuckThresholdMs: streamingConfig.stuckThresholdMs,
      replacementDelayMs: 5000,
      feeIncreaseFactor: streamingConfig.feeIncreaseFactor,
      maxReplacements: 3,
      maxPendingTime: streamingConfig.maxPendingTimeMs,
      
      enableDebugLogs: false,
    });
    
    await this.pipelineManager.initialize();
    
    // Set up pipeline event handlers
    this.pipelineManager.on('confirmed', ({ nonce, userId }) => {
      console.log(chalk.green(`✅ Pipeline confirmed: nonce ${nonce} for ${userId}`));
    });
    
    this.pipelineManager.on('failed', ({ nonce, userId, error }) => {
      console.error(chalk.red(`❌ Pipeline failed: nonce ${nonce} for ${userId}: ${error}`));
    });
    
    this.pipelineManager.on('replace', ({ nonce, userId, attempt }) => {
      console.log(chalk.yellow(`🔄 Pipeline replace: nonce ${nonce} for ${userId} (attempt ${attempt})`));
      this.metrics.pipelineStats.replacements++;
    });
    
    // Initialize end-user wallet pool
    const totalWalletsNeeded = streamingConfig.totalUsers + Math.floor(streamingConfig.totalUsers * 0.1);
    await this.walletPool!.initialize(totalWalletsNeeded);
    
    // Set up user stream event handlers
    this.userStream!.on('userArrival', this.handleUserArrival.bind(this));
    this.userStream!.on('phaseChange', this.handlePhaseChange.bind(this));
    this.userStream!.on('complete', this.handleStreamComplete.bind(this));
    
    console.log(chalk.green('✅ All components initialized'));
  }

  private async handleUserArrival(user: { userId: string; arrivalTime: number; phase: string }) {
    if (this.shouldStop || !this.isRunning) {
      this.log(`Skipping user ${user.userId} - test stopping`);
      return;
    }
    
    // Start user flow (will handle backpressure internally)
    const flowPromise = this.executeUserFlow(user.userId);
    this.activeFlows.set(user.userId, flowPromise);
    
    this.metrics.activeUsers = this.activeFlows.size;
    this.metrics.peakActiveUsers = Math.max(this.metrics.peakActiveUsers, this.metrics.activeUsers);

    // Handle flow completion
    flowPromise.then(result => {
      this.handleFlowCompletion(user.userId, result, user.phase);
    }).catch(error => {
      const endTime = Date.now();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ [${user.userId}] PROMISE_REJECTION: ${errorMessage}`));
      this.log(`PROMISE_REJECTION - User ${user.userId}: ${errorMessage}`);
      
      globalErrorTracker.trackError(
        error instanceof Error ? error : new Error(String(error)),
        {
          userId: user.userId,
          phase: user.phase,
          timestamp: endTime,
          duration: endTime - user.arrivalTime,
          step: 'flow_promise_rejection'
        },
        {
          testType: 'pipelined_v3',
          concurrent: this.metrics.activeUsers
        }
      );
      
      this.handleFlowCompletion(user.userId, {
        success: false,
        duration: endTime - user.arrivalTime,
        walletAddress: 'unknown',
        error: errorMessage,
        startTime: user.arrivalTime,
        endTime,
        userId: user.userId,
        pipelined: true,
      }, user.phase);
    });
  }

  private handlePhaseChange(phase: string) {
    const now = Date.now();
    
    switch (phase) {
      case 'sustain':
        this.metrics.phases.rampUp.endTime = now;
        this.metrics.phases.sustain.startTime = now;
        break;
      case 'ramp-down':
        this.metrics.phases.sustain.endTime = now;
        this.metrics.phases.rampDown.startTime = now;
        break;
    }
  }

  private async executeUserFlow(userId: string): Promise<UserFlowResult> {
    const startTime = Date.now();
    let wallet: WalletInfo | null = null;
    let nonce: number | null = null;
    
    try {
      // Get end-user wallet for identity
      wallet = this.walletPool!.getWallet();
      
      // Lease nonce from pipeline (with backpressure)
      let attempts = 0;
      while (nonce === null && attempts < 100) {
        nonce = await this.pipelineManager!.leaseNonce(userId);
        
        if (nonce === null) {
          // Backpressure - wait and retry
          this.backpressureEvents++;
          if (attempts === 0) {
            console.log(chalk.yellow(`⏸️  [${userId}] Backpressure - waiting for pipeline capacity...`));
          }
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
      }
      
      if (nonce === null) {
        throw new Error('Failed to lease nonce - pipeline congested');
      }
      
      this.metrics.submittedUsers++;
      
      console.log(chalk.blue(`🎫 [${userId}] Leased nonce ${nonce} for user ${wallet.address}`));
      
      // Generate test data
      const userData = this.generateTestData();
      const prompt = generateWalletPrompt(wallet.address);
      
      // Execute transaction with specific nonce (NO WAITING FOR CONFIRMATION)
      const result = await this.masterRelayerClient!.executeDataPortabilityFlowWithNonce(
        userData,
        prompt,
        `pipelined-${userId}`,
        'http://localhost:3001',
        nonce
      );
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Record transaction hash for monitoring
      if (result.transactionHash) {
        this.pipelineManager!.recordTransaction(nonce, result.transactionHash as Hash, {
          gasPrice: result.gasPrice,
          maxFeePerGas: result.maxFeePerGas,
          maxPriorityFeePerGas: result.maxPriorityFeePerGas,
        });
        
        console.log(chalk.green(`📤 [${userId}] TX submitted: ${result.transactionHash.substring(0, 10)}... | Nonce: ${nonce} | Duration: ${(duration/1000).toFixed(1)}s (pipelined)`));
      } else {
        console.log(chalk.red(`❌ [${userId}] Failed to submit: ${result.error?.substring(0, 100)}...`));
      }
      
      // Return wallet to pool
      this.walletPool!.returnWallet(wallet);

      return {
        success: result.success,
        duration,
        walletAddress: wallet.address,
        transactionHash: result.transactionHash,
        permissionId: result.permissionId,
        error: result.error,
        startTime,
        endTime,
        userId,
        nonce,
        pipelined: true,
      };

    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      if (wallet) {
        this.walletPool!.returnWallet(wallet);
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const masterAddress = privateKeyToAccount(this.config.relayerPrivateKey as `0x${string}`).address;
      const logEntry = `❌ [${userId}] ${errorMessage} | Master: ${masterAddress}`;
      
      console.error(chalk.red(logEntry));
      this.log(`ERROR - User ${userId}: ${errorMessage}`);
      
      globalErrorTracker.trackError(
        error instanceof Error ? error : new Error(String(error)),
        {
          userId,
          phase: this.userStream?.getProgress().phase || 'unknown',
          timestamp: endTime,
          duration,
          walletAddress: wallet?.address || 'unknown',
          step: 'user_flow_execution'
        },
        {
          testType: 'pipelined_v3',
          concurrent: this.metrics.activeUsers,
          totalUsers: this.config.totalUsers
        }
      );
      
      return {
        success: false,
        duration,
        walletAddress: wallet?.address || 'unknown',
        error: errorMessage,
        startTime,
        endTime,
        userId,
        nonce: nonce || undefined,
        pipelined: true,
      };
    }
  }

  private handleFlowCompletion(userId: string, result: UserFlowResult, phase: string) {
    // Remove from active flows
    this.activeFlows.delete(userId);
    
    // Update metrics
    this.metrics.completedUsers++;
    this.metrics.activeUsers = this.activeFlows.size;
    
    // Update phase-specific metrics
    switch (phase) {
      case 'ramp-up':
        this.metrics.phases.rampUp.usersCompleted++;
        break;
      case 'sustain':
        this.metrics.phases.sustain.usersCompleted++;
        break;
      case 'ramp-down':
        this.metrics.phases.rampDown.usersCompleted++;
        break;
    }
    
    if (result.success) {
      this.metrics.successfulUsers++;
      
      // Mark as confirmed in pipeline (for tracking only)
      if (result.nonce !== undefined) {
        this.pipelineManager!.confirmTransaction(result.nonce);
      }
    } else {
      this.metrics.failedUsers++;
      
      // Track error types
      const errorType = result.error?.split(':')[0] || 'Unknown';
      this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
      
      // Mark as failed in pipeline
      if (result.nonce !== undefined) {
        this.pipelineManager!.failTransaction(result.nonce, result.error || 'Unknown error');
      }
    }
    
    // Track response times
    this.metrics.responseTimes.push(result.duration);
  }

  private handleStreamComplete() {
    console.log(chalk.yellow('\n🏁 User arrival stream completed'));
  }

  private generateTestData(): string {
    const userData = {
      user_profile: {
        id: faker.string.uuid(),
        name: faker.person.fullName(),
        email: faker.internet.email(),
        age: faker.number.int({ min: 18, max: 80 }),
        location: {
          city: faker.location.city(),
          country: faker.location.country(),
          timezone: faker.location.timeZone(),
        },
        created_at: faker.date.past().toISOString(),
      },
      activity_logs: Array.from({ length: 8 }, () => ({
        id: faker.string.uuid(),
        timestamp: faker.date.recent({ days: 30 }).toISOString(),
        action: faker.helpers.arrayElement(['login', 'logout', 'view', 'click', 'purchase', 'search']),
        details: {
          page: faker.internet.url(),
          duration: faker.number.int({ min: 1, max: 300 }),
          device: faker.helpers.arrayElement(['desktop', 'mobile', 'tablet']),
        },
      })),
      metadata: {
        generated_at: Date.now(),
        test_type: 'milestone_5_v3_pipelined',
        version: '3.0.0',
      },
    };

    return JSON.stringify(userData, null, 2);
  }

  private async executeStreamingTest(): Promise<void> {
    return new Promise((resolve) => {
      // Start user arrival stream
      this.userStream!.start();
      
      // Set up completion handler
      const checkCompletion = () => {
        const allUsersArrived = this.userStream!.getProgress().spawned >= this.metrics.totalUsers;
        const allFlowsCompleted = this.activeFlows.size === 0;
        
        if (allUsersArrived && allFlowsCompleted) {
          this.metrics.endTime = Date.now();
          this.metrics.phases.rampDown.endTime = Date.now();
          resolve();
        } else {
          setTimeout(checkCompletion, 1000);
        }
      };
      
      // Start checking for completion
      setTimeout(checkCompletion, 5000);
    });
  }

  private startMetricsDashboard() {
    const updateInterval = setInterval(async () => {
      if (this.metrics.endTime) {
        clearInterval(updateInterval);
        return;
      }
      
      await this.displayLiveMetrics();
    }, 3000);
  }

  private async displayLiveMetrics() {
    const progress = this.userStream!.getProgress();
    const successRate = this.metrics.completedUsers > 0 
      ? (this.metrics.successfulUsers / this.metrics.completedUsers) * 100 
      : 0;
    
    const walletStats = this.walletPool!.getStats();
    const pipelineStats = this.pipelineManager!.getStats();
    
    // Track utilization
    this.utilizationSamples.push(pipelineStats.windowUtilization);
    
    // Get real-time gas price from network
    let currentGasPrice = 'unknown';
    try {
      const { createPublicClient, http } = await import('viem');
      const publicClient = createPublicClient({
        chain: moksha,
        transport: http(this.config.rpcEndpoints[0]),
      });
      const gasPrice = await publicClient.getGasPrice();
      currentGasPrice = `${(Number(gasPrice) / 1e9).toFixed(3)} gwei`;
    } catch (e) {
      // Ignore errors
    }
    
    console.log('\n' + chalk.gray('─'.repeat(60)));
    console.log(chalk.cyan('🌊 Pipelined Load Test - Live Update'));
    console.log(chalk.gray('═'.repeat(60)));
    
    console.log(`📈 Phase: ${chalk.yellow(progress.phase.toUpperCase())} (${progress.spawned}/${progress.total} spawned)`);
    console.log(`✅ Success Rate: ${chalk.green(successRate.toFixed(1))}% (${this.metrics.successfulUsers}/${this.metrics.completedUsers})`);
    console.log(`🔄 Active Flows: ${chalk.magenta(this.metrics.activeUsers)} (Peak: ${this.metrics.peakActiveUsers})`);
    console.log(`⛽ Network Gas: ${chalk.yellow(currentGasPrice)}`);
    
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.cyan('📊 Pipeline Status:'));
    console.log(`  Window: ${pipelineStats.pendingCount}/${this.metrics.pipelineStats.windowSize} (${pipelineStats.windowUtilization.toFixed(1)}% utilized)`);
    console.log(`  Submitted: ${pipelineStats.submitted} | Confirmed: ${pipelineStats.confirmed} | Failed: ${pipelineStats.failed}`);
    console.log(`  Nonces: ${pipelineStats.confirmedNonce} (confirmed) → ${pipelineStats.currentNonce} (current)`);
    console.log(`  Replacements: ${pipelineStats.replaced} txs (${pipelineStats.totalReplacements} total)`);
    console.log(`  Backpressure Events: ${this.backpressureEvents}`);
    
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`👑 Master Relayer: Single wallet handling all transactions`);
    console.log(`👤 End-User Wallets: ${walletStats.remaining} remaining (identity only)`);
    
    // Phase breakdown
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`📊 Phase Progress:`);
    console.log(`   Ramp-Up: ${this.metrics.phases.rampUp.usersCompleted} users`);
    console.log(`   Sustain: ${this.metrics.phases.sustain.usersCompleted} users`);
    console.log(`   Ramp-Down: ${this.metrics.phases.rampDown.usersCompleted} users`);
    
    if (Object.keys(this.metrics.errorsByType).length > 0) {
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.red('❌ Error Summary:'));
      Object.entries(this.metrics.errorsByType).forEach(([error, count]) => {
        console.log(`   ${error}: ${count}`);
      });
    }
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile);
    return sorted[index] || 0;
  }

  private displayFinalResults() {
    const totalDuration = (this.metrics.endTime! - this.metrics.startTime) / 1000;
    const overallThroughput = this.metrics.completedUsers / totalDuration;
    const successRate = (this.metrics.successfulUsers / this.metrics.completedUsers) * 100;
    const avgResponseTime = this.metrics.responseTimes.reduce((sum, time) => sum + time, 0) / this.metrics.responseTimes.length;
    const p95ResponseTime = this.calculatePercentile(this.metrics.responseTimes, 0.95);
    const p99ResponseTime = this.calculatePercentile(this.metrics.responseTimes, 0.99);
    
    // Calculate pipeline stats
    const avgUtilization = this.utilizationSamples.length > 0
      ? this.utilizationSamples.reduce((sum, val) => sum + val, 0) / this.utilizationSamples.length
      : 0;
    const peakUtilization = Math.max(...this.utilizationSamples, 0);
    
    const pipelineStats = this.pipelineManager?.getStats();
    
    console.log(chalk.cyan(`\n🌊 Milestone 5 V3 - Pipelined Single Relayer Results\n`));
    console.log(chalk.gray('═'.repeat(60)));
    
    console.log(`  Test Type           : Pipelined Single Relayer (No confirmation wait)`);
    const masterAddr = this.config.relayerPrivateKey ? privateKeyToAccount(this.config.relayerPrivateKey as any).address : 'Not configured';
    console.log(`  Master Relayer      : ${masterAddr}`);
    console.log(`  Total Users         : ${this.metrics.totalUsers}`);
    console.log(`  Submitted           : ${this.metrics.submittedUsers}`);
    console.log(`  Completed           : ${this.metrics.completedUsers} (${(this.metrics.completedUsers / this.metrics.totalUsers * 100).toFixed(1)}%)`);
    console.log(`  Successful          : ${this.metrics.successfulUsers} (${successRate.toFixed(1)}%)`);
    console.log(`  Failed              : ${this.metrics.failedUsers}`);
    console.log(`  Total Duration      : ${totalDuration.toFixed(1)} seconds`);
    console.log(`  Overall Throughput  : ${overallThroughput.toFixed(2)} users/second`);
    console.log(`  Peak Active Users   : ${this.metrics.peakActiveUsers}`);
    
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`  Average Response    : ${(avgResponseTime / 1000).toFixed(2)} seconds`);
    console.log(`  P95 Response Time   : ${(p95ResponseTime / 1000).toFixed(2)} seconds`);
    console.log(`  P99 Response Time   : ${(p99ResponseTime / 1000).toFixed(2)} seconds`);
    
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.cyan(`  Pipeline Performance:`));
    console.log(`    Window Size       : ${this.metrics.pipelineStats.windowSize}`);
    console.log(`    Avg Utilization   : ${avgUtilization.toFixed(1)}%`);
    console.log(`    Peak Utilization  : ${peakUtilization.toFixed(1)}%`);
    console.log(`    Replacements      : ${pipelineStats?.replaced || 0} transactions`);
    console.log(`    Backpressure Events: ${this.backpressureEvents}`);
    
    if (pipelineStats) {
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.cyan(`  Final Pipeline State:`));
      console.log(`    Submitted         : ${pipelineStats.submitted}`);
      console.log(`    Confirmed         : ${pipelineStats.confirmed}`);
      console.log(`    Failed            : ${pipelineStats.failed}`);
      console.log(`    Pending           : ${pipelineStats.pendingCount}`);
    }
    
    // Phase analysis
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`  Phase Breakdown:`);
    console.log(`    Ramp-Up: ${this.metrics.phases.rampUp.usersCompleted} users`);
    console.log(`    Sustain: ${this.metrics.phases.sustain.usersCompleted} users`);
    console.log(`    Ramp-Down: ${this.metrics.phases.rampDown.usersCompleted} users`);
    
    // Validation
    console.log(chalk.cyan(`\n🔍 Performance Validation:\n`));
    
    const throughputPass = overallThroughput >= 2.0; // Higher throughput expected with pipelining
    const successRatePass = successRate >= 85;
    const responseTimePass = p95ResponseTime <= 30000; // Faster response expected
    const utilizationPass = avgUtilization >= 50; // Good pipeline utilization
    
    console.log(`   1. Throughput: ${throughputPass ? '✅' : '❌'} ${throughputPass ? 'PASS' : 'FAIL'}`);
    console.log(`      ${overallThroughput.toFixed(2)} users/sec (target: ≥2.0)`);
    
    console.log(`   2. Success Rate: ${successRatePass ? '✅' : '❌'} ${successRatePass ? 'PASS' : 'FAIL'}`);
    console.log(`      ${successRate.toFixed(1)}% (target: ≥85%)`);
    
    console.log(`   3. Response Time: ${responseTimePass ? '✅' : '❌'} ${responseTimePass ? 'PASS' : 'FAIL'}`);
    console.log(`      P95: ${(p95ResponseTime / 1000).toFixed(1)}s (target: ≤30s)`);
    
    console.log(`   4. Pipeline Utilization: ${utilizationPass ? '✅' : '❌'} ${utilizationPass ? 'PASS' : 'FAIL'}`);
    console.log(`      Avg: ${avgUtilization.toFixed(1)}% (target: ≥50%)`);
    
    const overallPass = throughputPass && successRatePass && responseTimePass && utilizationPass;
    
    if (overallPass) {
      console.log(chalk.green(`\n🎉 Milestone 5 V3 PASSED! Pipelined strategy successful.`));
      console.log(chalk.green(`🚀 Achieved ${overallThroughput.toFixed(2)} TPS with single relayer!`));
    } else {
      console.log(chalk.red(`\n❌ Milestone 5 V3 needs optimization.`));
      console.log(chalk.yellow(`🔧 Recommendations:`));
      if (!throughputPass) console.log(chalk.yellow(`   • Increase window size or optimize transaction submission`));
      if (!successRatePass) console.log(chalk.yellow(`   • Investigate and fix error causes`));
      if (!responseTimePass) console.log(chalk.yellow(`   • Optimize personal server or reduce processing`));
      if (!utilizationPass) console.log(chalk.yellow(`   • Increase arrival rate or reduce window size`));
    }
    
    // Display comprehensive error analysis if there were failures
    if (this.metrics.failedUsers > 0) {
      globalErrorTracker.displayReport(this.metrics.totalUsers);
    }
  }

  private async cleanup(): Promise<void> {
    console.log(chalk.gray(`\n🧹 Cleaning up test environment...`));
    
    this.userStream?.stop();
    
    if (this.pipelineManager) {
      this.pipelineManager.destroy();
    }
    
    if (this.apiServer) {
      await this.apiServer.stop();
    }
    
    // Restore original console methods if not already done
    if (console.log !== this.originalConsole.log) {
      console.log = this.originalConsole.log;
      console.error = this.originalConsole.error;
      console.warn = this.originalConsole.warn;
      console.info = this.originalConsole.info;
    }
  }
}

// Run the test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  async function runTest() {
    try {
      const config = await loadConfig();
      config.enableDebugLogs = false;
      
      console.log(chalk.cyan('📋 Loading pipelined configuration...'));
      console.log(`  RPC Endpoints: ${config.rpcEndpoints.length} configured`);
      console.log(`  Master Relayer: ${config.relayerPrivateKey ? 'Configured ✅' : 'Missing ❌'}`);
      
      // Parse command line arguments
      const args = process.argv.slice(2);
      const streamingConfig: StreamingConfigV3 = {
        totalUsers: 20,
        arrivalRateUsersPerSecond: 2.0,
        testDurationMinutes: 10,
        
        // Pipeline configuration
        pipelineWindowSize: 32,        // Default window size
        stuckThresholdMs: 30000,       // 30 seconds
        maxPendingTimeMs: 60000,       // 60 seconds SLA
        feeIncreaseFactor: 1.15,       // 15% increase
        
        // Artillery-style phases
        rampUpDurationSeconds: 30,
        sustainDurationSeconds: 60,
        rampDownDurationSeconds: 10,
      };
      
      for (let i = 0; i < args.length; i += 2) {
        const key = args[i]?.replace('--', '');
        const value = args[i + 1];
        
        if (key && value) {
          switch (key) {
            case 'users':
              streamingConfig.totalUsers = parseInt(value);
              break;
            case 'rate':
              streamingConfig.arrivalRateUsersPerSecond = parseFloat(value);
              break;
            case 'window':
              streamingConfig.pipelineWindowSize = parseInt(value);
              break;
            case 'stuck':
              streamingConfig.stuckThresholdMs = parseInt(value) * 1000;
              break;
            case 'sla':
              streamingConfig.maxPendingTimeMs = parseInt(value) * 1000;
              break;
          }
        }
      }
      
      // Display configuration
      console.log(chalk.cyan('🎛️  Pipelined Load Test Configuration:'));
      console.log(`  Users: ${streamingConfig.totalUsers}`);
      console.log(`  Arrival Rate: ${streamingConfig.arrivalRateUsersPerSecond}/sec`);
      console.log(`  Pipeline Window: ${streamingConfig.pipelineWindowSize} transactions`);
      console.log(`  Stuck Threshold: ${streamingConfig.stuckThresholdMs / 1000}s`);
      console.log(`  Max Pending Time: ${streamingConfig.maxPendingTimeMs / 1000}s`);
      
      console.log(chalk.yellow('\n⚡ Pipeline Strategy:'));
      console.log(`  • Single master relayer for all transactions`);
      console.log(`  • No waiting for confirmations (fire-and-forget)`);
      console.log(`  • Consecutive nonces pipelined up to window size`);
      console.log(`  • Automatic replacement of stuck transactions`);
      console.log(`  • Backpressure when window full or SLA exceeded`);
      
      const test = new PipelinedStreamingLoadTest(config, streamingConfig);
      await test.run(streamingConfig);
      
      console.log(chalk.cyan('\n📋 Test complete! Check the log files for full details.'));
      
    } catch (error) {
      console.error(chalk.red('Failed to run pipelined streaming test:'), error);
      process.exit(1);
    }
  }
  
  runTest();
}