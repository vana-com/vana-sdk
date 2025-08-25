#!/usr/bin/env node

import { VanaLoadTestClient } from '../../src/client/load-test-client.js';
import { LoadTestApiServer } from '../../src/server/api-server.js';
import { loadConfig } from '../../src/config/loader.js';
import { generateWalletPrompt } from '../../src/utils/prompt-generator.js';
import { PersistentChildRelayerManager } from '../../src/utils/persistent-child-relayers.js';
import { globalErrorTracker } from '../../src/utils/error-tracker.js';
import { faker } from '@faker-js/faker';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseEther } from 'viem';
import chalk from 'chalk';
import ora from 'ora';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Milestone 5 V2: Optimized Streaming Load Test
 * 
 * Improvements:
 * - Multi-relayer parallel funding (10x faster)
 * - Pre-funding strategy (fund before test starts)
 * - Artillery-style ramp patterns
 * - Better buffer management
 * - Master wallet protection
 */

interface StreamingConfigV2 {
  totalUsers: number;
  arrivalRateUsersPerSecond: number;
  testDurationMinutes: number;
  maxConcurrentUsers: number;
  
  // Funding Strategy
  childRelayers: number;
  preFundBuffer: number; // Fund this many wallets before starting test
  fundingAmountPerChild: string; // e.g., "100" VANA
  
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
}

class ArtilleryStyleUserStream extends EventEmitter {
  private config: StreamingConfigV2;
  private usersSpawned: number = 0;
  private isRunning: boolean = false;
  private currentPhase: 'ramp-up' | 'sustain' | 'ramp-down' = 'ramp-up';
  private phaseStartTime: number = 0;

  constructor(config: StreamingConfigV2) {
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
    const elapsed = (Date.now() - this.phaseStartTime) / 1000;
    const totalUsers = this.config.totalUsers;
    const rampUpUsers = Math.floor(totalUsers * 0.3); // 30% ramp-up
    const sustainUsers = Math.floor(totalUsers * 0.4); // 40% sustain
    
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
    // Artillery-style arrival rates based on phase
    let currentRate = this.config.arrivalRateUsersPerSecond;
    
    switch (this.currentPhase) {
      case 'ramp-up':
        // Gradually increase from 0.5x to 1.0x target rate
        const rampProgress = (Date.now() - this.phaseStartTime) / (this.config.rampUpDurationSeconds * 1000);
        currentRate = this.config.arrivalRateUsersPerSecond * (0.5 + 0.5 * Math.min(rampProgress, 1));
        break;
      case 'sustain':
        // Full target rate
        currentRate = this.config.arrivalRateUsersPerSecond;
        break;
      case 'ramp-down':
        // Gradually decrease from 1.0x to 0.2x target rate
        const downProgress = (Date.now() - this.phaseStartTime) / (this.config.rampDownDurationSeconds * 1000);
        currentRate = this.config.arrivalRateUsersPerSecond * (1.0 - 0.8 * Math.min(downProgress, 1));
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

class OptimizedWalletPool {
  private funded: WalletInfo[] = [];
  private unfunded: WalletInfo[] = [];
  private fundingManager?: PersistentChildRelayerManager;
  private config: any;

  constructor(config: any) {
    this.config = config;
  }

  async initialize(streamingConfig: StreamingConfigV2): Promise<void> {
    console.log(chalk.cyan('🏦 Initializing optimized wallet pool with persistent child relayers...'));
    
    // Initialize persistent child relayer manager
    if (this.config.relayerPrivateKey) {
      const poolName = `load-test-${streamingConfig.totalUsers}u-${streamingConfig.childRelayers}c`;
      this.fundingManager = new PersistentChildRelayerManager(
        this.config.relayerPrivateKey, 
        this.config,
        poolName
      );
      
      // Ensure child relayers exist and are funded
      const minBalancePerChild = parseEther(streamingConfig.fundingAmountPerChild);
      await this.fundingManager.ensureChildRelayers(streamingConfig.childRelayers, minBalancePerChild);
      
      console.log(chalk.blue(`📊 Child relayer pool ready:`));
      this.fundingManager.displayStats();
    }

    // Pre-generate wallets for the entire test + buffer
    const totalWalletsNeeded = streamingConfig.totalUsers + streamingConfig.preFundBuffer;
    console.log(chalk.blue(`📝 Generating ${totalWalletsNeeded} test wallets...`));
    
    const wallets = this.generateWallets(totalWalletsNeeded);
    this.unfunded.push(...wallets);

    // Pre-fund all wallets before test starts
    if (this.fundingManager) {
      await this.preFundAllWallets();
    }
  }

  private async preFundAllWallets(): Promise<void> {
    const spinner = ora(`💰 Pre-funding ${this.unfunded.length} wallets using persistent child relayers...`).start();
    const startTime = Date.now();
    
    try {
      const addresses = this.unfunded.map(w => w.address);
      const results = await this.fundingManager!.fundTestWallets(addresses);
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      // Move successfully funded wallets to funded pool and track failed ones
      const stillUnfunded: WalletInfo[] = [];
      
      for (let i = 0; i < this.unfunded.length; i++) {
        if (results[i]?.success) {
          const wallet = this.unfunded[i];
          wallet.funded = true;
          this.funded.push(wallet);
        } else {
          // Keep failed wallets in unfunded for potential retry
          stillUnfunded.push(this.unfunded[i]);
        }
      }
      
      // Update unfunded array to only contain failed wallets
      this.unfunded = stillUnfunded;
      
      const duration = (Date.now() - startTime) / 1000;
      
      if (successful > 0) {
        spinner.succeed(chalk.green(`✅ Pre-funded ${successful} wallets in ${duration.toFixed(1)}s (${failed} failed)`));
        console.log(chalk.green(`🚀 Funding throughput: ${(successful / duration).toFixed(1)} wallets/second`));
        console.log(chalk.blue(`💰 Available funded wallets: ${this.funded.length}`));
        
        if (failed > 0) {
          console.log(chalk.yellow(`⚠️  ${failed} wallets failed funding - keeping in unfunded pool for potential retry`));
        }
      } else {
        spinner.fail(chalk.red(`❌ Failed to pre-fund any wallets`));
        console.log(chalk.red(`🔍 Debug: Results length: ${results.length}, Expected: ${addresses.length}`));
        
        // Log first few errors for debugging
        const errors = results.filter(r => !r.success).slice(0, 3);
        errors.forEach((result, i) => {
          console.log(chalk.red(`   Error ${i+1}: ${result.error}`));
        });
      }
      
    } catch (error) {
      spinner.fail(chalk.red('Pre-funding failed'));
      throw error;
    }
  }

  async getWallet(): Promise<WalletInfo> {
    if (this.funded.length === 0) {
      throw new Error('No funded wallets available - pre-funding may have failed');
    }
    
    return this.funded.shift()!;
  }

  private generateWallets(count: number): WalletInfo[] {
    const wallets: WalletInfo[] = [];
    
    for (let i = 0; i < count; i++) {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      
      wallets.push({
        privateKey,
        address: account.address,
        funded: false,
      });
    }
    return wallets;
  }

  getStats() {
    return {
      funded: this.funded.length,
      unfunded: this.unfunded.length,
      total: this.funded.length + this.unfunded.length,
    };
  }
}

export class StreamingLoadTestV2 {
  private config: any;
  private apiServer?: LoadTestApiServer;
  private userStream?: ArtilleryStyleUserStream;
  private walletPool?: OptimizedWalletPool;
  private metrics: StreamingMetricsV2;
  private activeFlows: Map<string, Promise<UserFlowResult>> = new Map();
  private maxConcurrentUsers: number;
  
  // Control & Logging
  private isRunning = false;
  private isPaused = false;
  private shouldStop = false;
  private logFile: string;
  private errorLogFile: string;
  private logStream?: fs.WriteStream;
  private errorLogStream?: fs.WriteStream;

  constructor(config: any, streamingConfig: StreamingConfigV2) {
    this.config = config;
    this.maxConcurrentUsers = streamingConfig.maxConcurrentUsers;
    
    // Setup logging
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(process.cwd(), `load-test-${timestamp}.log`);
    this.errorLogFile = path.join(process.cwd(), `load-test-errors-${timestamp}.log`);
    this.setupGracefulShutdown();
    
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
      fundingStats: {
        childRelayers: streamingConfig.childRelayers,
        preFunded: 0,
        fundingDuration: 0,
      },
      phases: {
        rampUp: { startTime: Date.now(), usersCompleted: 0 },
        sustain: { usersCompleted: 0 },
        rampDown: { usersCompleted: 0 },
      },
    };

    // Initialize components
    this.walletPool = new OptimizedWalletPool(config);
    this.userStream = new ArtilleryStyleUserStream(streamingConfig);
  }

  private setupGracefulShutdown(): void {
    // Setup log streams
    this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    this.errorLogStream = fs.createWriteStream(this.errorLogFile, { flags: 'a' });
    
    this.log(`🚀 Load test started at ${new Date().toISOString()}`);
    this.logError(`🚀 Error logging started at ${new Date().toISOString()}`);
    
    console.log(chalk.blue(`📝 Logs being written to: ${this.logFile}`));
    console.log(chalk.red(`🚨 Errors being written to: ${this.errorLogFile}`));
    console.log(chalk.yellow(`💡 Press Ctrl+C to gracefully stop and save results`));
    
    // Graceful shutdown handlers
    const gracefulShutdown = async (signal: string) => {
      this.log(`\n🛑 Received ${signal}, initiating graceful shutdown...`);
      console.log(chalk.yellow(`\n🛑 Received ${signal}, stopping gracefully...`));
      
      this.shouldStop = true;
      this.isRunning = false;
      
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
      
      // Close log streams
      if (this.logStream) {
        this.logStream.end();
      }
      if (this.errorLogStream) {
        this.errorLogStream.end();
      }
      
      console.log(chalk.green(`✅ Graceful shutdown complete. Logs saved to:`));
      console.log(chalk.blue(`   📝 General: ${this.logFile}`));
      console.log(chalk.red(`   🚨 Errors: ${this.errorLogFile}`));
      process.exit(0);
    };
    
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  }
  
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    if (this.logStream) {
      this.logStream.write(logEntry);
    }
  }
  
  private logError(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    if (this.errorLogStream) {
      this.errorLogStream.write(logEntry);
    }
  }

  async run(streamingConfig: StreamingConfigV2): Promise<void> {
    try {
      this.isRunning = true;
      this.log(`Starting load test: ${streamingConfig.totalUsers} users, ${streamingConfig.childRelayers} child relayers`);
      
      console.log(chalk.cyan(`\n🌊 Starting Milestone 5 V2: Optimized Streaming Load Test`));
      console.log(chalk.blue(`📊 ${streamingConfig.totalUsers} users with ${streamingConfig.childRelayers} parallel funding relayers\n`));

      await this.startApiServer();
      await this.initializeComponents(streamingConfig);
      
      // Start real-time metrics dashboard
      this.startMetricsDashboard();
      
      // Start the optimized streaming test
      await this.executeStreamingTest();
      
      // Display final results
      this.displayFinalResults();
      
    } catch (error) {
      console.error(chalk.red(`\n💥 Streaming load test failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  private async startApiServer(): Promise<void> {
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

  private async initializeComponents(streamingConfig: StreamingConfigV2): Promise<void> {
    const fundingStartTime = Date.now();
    
    // Initialize wallet pool with pre-funding
    await this.walletPool!.initialize(streamingConfig);
    
    this.metrics.fundingStats.fundingDuration = Date.now() - fundingStartTime;
    this.metrics.fundingStats.preFunded = this.walletPool!.getStats().funded;
    
    // Set up user stream event handlers
    this.userStream!.on('userArrival', this.handleUserArrival.bind(this));
    this.userStream!.on('phaseChange', this.handlePhaseChange.bind(this));
    this.userStream!.on('complete', this.handleStreamComplete.bind(this));
    
    console.log(chalk.green('✅ All components initialized and pre-funded'));
  }

  private async handleUserArrival(user: { userId: string; arrivalTime: number; phase: string }) {
    // Check if we should stop
    if (this.shouldStop || !this.isRunning) {
      this.log(`Skipping user ${user.userId} - test stopping`);
      return;
    }
    
    // Implement concurrency limiting (disabled for scale testing)
    // while (this.activeFlows.size >= this.maxConcurrentUsers) {
    //   await new Promise(resolve => setTimeout(resolve, 50));
    // }

    // Start user flow
    const flowPromise = this.executeUserFlow(user.userId);
    this.activeFlows.set(user.userId, flowPromise);
    
    this.metrics.activeUsers = this.activeFlows.size;
    this.metrics.peakActiveUsers = Math.max(this.metrics.peakActiveUsers, this.metrics.activeUsers);

    // Handle flow completion
    flowPromise.then(result => {
      this.handleFlowCompletion(user.userId, result, user.phase);
    }).catch(error => {
      const endTime = Date.now();
      
      // Log promise rejection error IMMEDIATELY
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ [${user.userId}] PROMISE_REJECTION: ${errorMessage}`));
      this.log(`PROMISE_REJECTION - User ${user.userId}: ${errorMessage}`);
      this.logError(`PROMISE_REJECTION - ${user.userId}: ${errorMessage}`);
      
      // Track error from promise rejection
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
          testType: 'streaming_v2',
          concurrent: this.metrics.activeUsers
        }
      );
      
      this.handleFlowCompletion(user.userId, {
        success: false,
        duration: endTime - user.arrivalTime,
        walletAddress: 'unknown',
        error: error.message,
        startTime: user.arrivalTime,
        endTime,
        userId: user.userId,
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
    let wallet: any = null;
    
    try {
      // Get pre-funded wallet from pool (should be instant)
      wallet = await this.walletPool!.getWallet();
      
      // Create client with funding check disabled (wallet is pre-funded)
      const configWithSkipFunding = { ...this.config, skipFundingCheck: true };
      const client = await VanaLoadTestClient.create(wallet.privateKey, configWithSkipFunding);
      const userData = this.generateTestData();
      const prompt = generateWalletPrompt(wallet.address);

      const result = await client.executeDataPortabilityFlow(
        userData,
        prompt,
        `ms-05-v2-${userId}`,
        'http://localhost:3001'
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

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
      };

    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Log error details IMMEDIATELY to both console and file
      const errorMessage = error instanceof Error ? error.message : String(error);
      const logEntry = `❌ [${userId}] ${errorMessage}`;
      
      console.error(chalk.red(logEntry)); // Immediate console output
      this.log(`ERROR - User ${userId}: ${errorMessage}`); // General log
      this.logError(`USER_FLOW_ERROR - ${userId}: ${errorMessage}`); // Dedicated error log
      
      // Track error with comprehensive context
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
          testType: 'streaming_v2',
          concurrent: this.metrics.activeUsers,
          totalUsers: this.config.totalUsers
        }
      );
      
      return {
        success: false,
        duration,
        walletAddress: wallet?.address || 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
        startTime,
        endTime,
        userId,
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
    } else {
      this.metrics.failedUsers++;
      
      // Track error types
      const errorType = result.error?.split(':')[0] || 'Unknown';
      this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
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
        test_type: 'milestone_5_v2_optimized_streaming',
        version: '2.0.0',
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
    const updateInterval = setInterval(() => {
      if (this.metrics.endTime) {
        clearInterval(updateInterval);
        return;
      }
      
      this.displayLiveMetrics();
    }, 3000);
  }

  private displayLiveMetrics() {
    const progress = this.userStream!.getProgress();
    const successRate = this.metrics.completedUsers > 0 
      ? (this.metrics.successfulUsers / this.metrics.completedUsers) * 100 
      : 0;
    
    const walletStats = this.walletPool!.getStats();
    
    // Clear screen and display dashboard
    console.clear();
    console.log(chalk.cyan('🌊 Optimized Streaming Load Test - Live Dashboard'));
    console.log(chalk.gray('═'.repeat(60)));
    
    console.log(`📈 Phase: ${chalk.yellow(progress.phase.toUpperCase())} (${progress.spawned}/${progress.total} spawned)`);
    console.log(`✅ Success Rate: ${chalk.green(successRate.toFixed(1))}% (${this.metrics.successfulUsers}/${this.metrics.completedUsers})`);
    console.log(`🔄 Active Users: ${chalk.magenta(this.metrics.activeUsers)} (Peak: ${this.metrics.peakActiveUsers})`);
    
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`💰 Pre-funded Wallets: ${chalk.cyan(walletStats.funded)} available`);
    console.log(`🏦 Child Relayers: ${chalk.blue(this.metrics.fundingStats.childRelayers)} (parallel funding)`);
    console.log(`⚡ Funding Duration: ${chalk.green((this.metrics.fundingStats.fundingDuration / 1000).toFixed(1))}s`);
    
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
    
    console.log(chalk.cyan(`\n🌊 Milestone 5 V2 - Optimized Streaming Results\n`));
    console.log(chalk.gray('═'.repeat(60)));
    
    console.log(`  Test Type           : Optimized Streaming (Multi-Relayer + Pre-funding)`);
    console.log(`  Total Users         : ${this.metrics.totalUsers}`);
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
    console.log(`  Pre-funded Wallets  : ${this.metrics.fundingStats.preFunded}`);
    console.log(`  Child Relayers      : ${this.metrics.fundingStats.childRelayers}`);
    console.log(`  Funding Duration    : ${(this.metrics.fundingStats.fundingDuration / 1000).toFixed(1)} seconds`);
    console.log(`  Funding Throughput  : ${(this.metrics.fundingStats.preFunded / (this.metrics.fundingStats.fundingDuration / 1000)).toFixed(1)} wallets/sec`);
    
    // Phase analysis
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`  Phase Breakdown:`);
    console.log(`    Ramp-Up: ${this.metrics.phases.rampUp.usersCompleted} users`);
    console.log(`    Sustain: ${this.metrics.phases.sustain.usersCompleted} users`);
    console.log(`    Ramp-Down: ${this.metrics.phases.rampDown.usersCompleted} users`);
    
    // Validation
    console.log(chalk.cyan(`\n🔍 Performance Validation:\n`));
    
    const throughputPass = overallThroughput >= 1.0; // Lower threshold due to pre-funding overhead
    const successRatePass = successRate >= 85;
    const responseTimePass = p95ResponseTime <= 45000;
    const fundingEfficiencyPass = (this.metrics.fundingStats.fundingDuration / 1000) <= 60; // Pre-funding should be fast
    
    console.log(`   1. Throughput: ${throughputPass ? '✅' : '❌'} ${throughputPass ? 'PASS' : 'FAIL'}`);
    console.log(`      ${overallThroughput.toFixed(2)} users/sec (target: ≥1.0)`);
    
    console.log(`   2. Success Rate: ${successRatePass ? '✅' : '❌'} ${successRatePass ? 'PASS' : 'FAIL'}`);
    console.log(`      ${successRate.toFixed(1)}% (target: ≥85%)`);
    
    console.log(`   3. Response Time: ${responseTimePass ? '✅' : '❌'} ${responseTimePass ? 'PASS' : 'FAIL'}`);
    console.log(`      P95: ${(p95ResponseTime / 1000).toFixed(1)}s (target: ≤45s)`);
    
    console.log(`   4. Funding Efficiency: ${fundingEfficiencyPass ? '✅' : '❌'} ${fundingEfficiencyPass ? 'PASS' : 'FAIL'}`);
    console.log(`      Pre-funding: ${(this.metrics.fundingStats.fundingDuration / 1000).toFixed(1)}s (target: ≤60s)`);
    
    const overallPass = throughputPass && successRatePass && responseTimePass && fundingEfficiencyPass;
    
    if (overallPass) {
      console.log(chalk.green(`\n🎉 Milestone 5 V2 PASSED! Optimized streaming successful.`));
      console.log(chalk.green(`🚀 Ready for production-scale load testing with Artillery!`));
    } else {
      console.log(chalk.red(`\n❌ Milestone 5 V2 needs optimization.`));
      console.log(chalk.yellow(`🔧 Recommendations:`));
      if (!throughputPass) console.log(chalk.yellow(`   • Increase child relayers or reduce response times`));
      if (!successRatePass) console.log(chalk.yellow(`   • Investigate and fix error causes`));
      if (!responseTimePass) console.log(chalk.yellow(`   • Optimize personal server or reduce load`));
      if (!fundingEfficiencyPass) console.log(chalk.yellow(`   • Optimize child relayer funding process`));
    }
    
    // Display comprehensive error analysis if there were failures
    if (this.metrics.failedUsers > 0) {
      globalErrorTracker.displayReport(this.metrics.totalUsers);
    }
  }

  private async cleanup(): Promise<void> {
    console.log(chalk.gray(`\n🧹 Cleaning up optimized test environment...`));
    
    this.userStream?.stop();
    
    if (this.apiServer) {
      await this.apiServer.stop();
    }
  }
}

// Run the test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  async function runTest() {
    try {
      const config = await loadConfig();
      config.enableDebugLogs = false;
      
      console.log(chalk.cyan('📋 Loading optimized configuration...'));
      console.log(`  RPC Endpoint: ${config.rpcEndpoint}`);
      console.log(`  Master Relayer: ${config.relayerPrivateKey ? 'Configured ✅' : 'Missing ❌'}`);
      console.log(`  GCS Storage: ${config.googleCloudServiceAccountJson ? 'Configured ✅' : 'Missing ❌'}`);
      
      // Parse command line arguments
      const args = process.argv.slice(2);
      const streamingConfig: StreamingConfigV2 = {
        totalUsers: 20,
        arrivalRateUsersPerSecond: 2.0,
        testDurationMinutes: 10,
        maxConcurrentUsers: 10,
        
        // Multi-relayer funding
        childRelayers: 5,
        preFundBuffer: 5, // Extra wallets beyond totalUsers
        fundingAmountPerChild: "50", // VANA per child relayer
        
        // Artillery-style phases
        rampUpDurationSeconds: 30,
        sustainDurationSeconds: 60,
        rampDownDurationSeconds: 30,
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
            case 'concurrency':
              streamingConfig.maxConcurrentUsers = parseInt(value);
              break;
            case 'child-relayers':
              streamingConfig.childRelayers = parseInt(value);
              break;
            case 'buffer':
              streamingConfig.preFundBuffer = parseInt(value);
              break;
          }
        }
      }
      
      if (args.length > 0) {
        console.log(chalk.cyan('🎛️  Custom optimized configuration:'));
        console.log(`  Users: ${streamingConfig.totalUsers}`);
        console.log(`  Arrival Rate: ${streamingConfig.arrivalRateUsersPerSecond}/sec`);
        console.log(`  Max Concurrent: ${streamingConfig.maxConcurrentUsers}`);
        console.log(`  Child Relayers: ${streamingConfig.childRelayers}`);
        console.log(`  Pre-fund Buffer: ${streamingConfig.preFundBuffer}`);
      }
      
      const test = new StreamingLoadTestV2(config, streamingConfig);
      await test.run(streamingConfig);
      
    } catch (error) {
      console.error(chalk.red('Failed to run optimized streaming test:'), error);
      process.exit(1);
    }
  }
  
  runTest();
}
