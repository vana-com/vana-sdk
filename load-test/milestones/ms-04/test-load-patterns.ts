#!/usr/bin/env node

import { VanaLoadTestClient } from '../../src/client/load-test-client.js';
import { LoadTestApiServer } from '../../src/server/api-server.js';
import { loadConfig } from '../../src/config/loader.js';
import { generateWalletPrompt } from '../../src/utils/prompt-generator.js';
import { WalletFunder } from '../../src/utils/wallet-funding.js';
import { faker } from '@faker-js/faker';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Milestone 4: Load Pattern Testing
 * 
 * Tests realistic load patterns with concurrent user handling:
 * - Ramp-up/sustain/ramp-down patterns
 * - Concurrent execution with rate limiting strategies
 * - Batch processing and jittered delays
 * - Real-time metrics collection
 * - Advanced error handling and circuit breakers
 */

interface TestResult {
  success: boolean;
  duration: number;
  walletAddress: string;
  error?: string;
  transactionHash?: string;
  permissionId?: string;
  startTime: number;
  endTime: number;
}

interface LoadPatternConfig {
  totalUsers: number;
  maxConcurrency: number;
  rampUpDurationMs: number;
  sustainDurationMs: number;
  rampDownDurationMs: number;
  batchSize: number;
  delayBetweenBatches: number;
  maxRetries: number;
  circuitBreakerThreshold: number;
}

interface LoadTestMetrics {
  totalUsers: number;
  successfulUsers: number;
  failedUsers: number;
  totalDuration: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughputUsersPerSecond: number;
  errorsByType: { [key: string]: number };
  rateLimitsEncountered: number;
  circuitBreakerTriggered: boolean;
  batchMetrics: Array<{
    batchId: number;
    startTime: number;
    endTime: number;
    successRate: number;
    averageTime: number;
  }>;
}

export class LoadPatternTest {
  private config: any;
  private apiServer?: LoadTestApiServer;
  private walletFunder?: WalletFunder;
  private circuitBreakerOpen: boolean = false;
  private errorCount: number = 0;
  private lastErrorTime: number = 0;

  constructor(config: any) {
    this.config = config;
  }

  /**
   * Generate realistic test data with varied sizes
   */
  generateTestData(size: 'small' | 'medium' | 'large' = 'medium'): string {
    const sizes = {
      small: { activities: 5, purchases: 2 },
      medium: { activities: 15, purchases: 5 },
      large: { activities: 30, purchases: 10 }
    };

    const currentSize = sizes[size];

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
      activity_logs: Array.from({ length: currentSize.activities }, () => ({
        id: faker.string.uuid(),
        timestamp: faker.date.recent({ days: 30 }).toISOString(),
        action: faker.helpers.arrayElement(['login', 'logout', 'view', 'click', 'purchase', 'search']),
        details: {
          page: faker.internet.url(),
          duration: faker.number.int({ min: 1, max: 300 }),
          device: faker.helpers.arrayElement(['desktop', 'mobile', 'tablet']),
        },
      })),
      purchase_history: Array.from({ length: currentSize.purchases }, () => ({
        id: faker.string.uuid(),
        timestamp: faker.date.recent({ days: 90 }).toISOString(),
        amount: faker.number.float({ min: 10, max: 500, fractionDigits: 2 }),
        currency: faker.finance.currencyCode(),
        product: faker.commerce.productName(),
        category: faker.commerce.department(),
      })),
      metadata: {
        generated_at: Date.now(),
        test_type: 'milestone_4_load_patterns',
        data_size: size,
        version: '1.0.0',
      },
    };

    return JSON.stringify(userData, null, 2);
  }

  /**
   * Generate test wallets with private keys
   */
  generateTestWallets(count: number): Array<{ privateKey: string; address: string }> {
    const wallets: Array<{ privateKey: string; address: string }> = [];
    for (let i = 0; i < count; i++) {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      wallets.push({
        privateKey,
        address: account.address,
      });
    }
    return wallets;
  }

  /**
   * Start API server for testing
   */
  async startApiServer(): Promise<void> {
    const spinner = ora('Starting API server for load pattern test...').start();
    
    try {
      this.apiServer = new LoadTestApiServer(this.config, 3001);
      await this.apiServer.start();
      
      // Wait for server to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Health check
      const response = await fetch('http://localhost:3001/health');
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      
      spinner.succeed(chalk.green('API server started and healthy'));
    } catch (error) {
      spinner.fail(chalk.red('Failed to start API server'));
      throw error;
    }
  }

  /**
   * Fund multiple wallets with batch processing
   */
  async fundTestWallets(wallets: Array<{ privateKey: string; address: string }>): Promise<{
    totalFunded: number;
    fundingErrors: number;
  }> {
    if (!this.walletFunder) {
      if (this.config.relayerPrivateKey) {
        this.walletFunder = new WalletFunder(this.config);
      } else {
        console.log(chalk.yellow('⚠️  No relayer private key provided - wallets will not be auto-funded'));
        return { totalFunded: 0, fundingErrors: wallets.length };
      }
    }

    const spinner = ora(`Funding ${wallets.length} test wallets in batches...`).start();
    
    try {
      const addresses = wallets.map(w => w.address);
      const results = await this.walletFunder.fundWallets(addresses);
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      if (successful > 0) {
        spinner.succeed(chalk.green(`✅ Funded ${successful} wallets (${failed} failed)`));
      } else {
        spinner.fail(chalk.red(`❌ Failed to fund any wallets`));
      }
      
      return {
        totalFunded: successful,
        fundingErrors: failed,
      };
    } catch (error) {
      spinner.fail(chalk.red('Wallet funding failed'));
      throw error;
    }
  }

  /**
   * Circuit breaker pattern for handling failures
   */
  checkCircuitBreaker(threshold: number): boolean {
    if (this.circuitBreakerOpen) {
      // Check if we should close the circuit (try again after 30 seconds)
      if (Date.now() - this.lastErrorTime > 30000) {
        this.circuitBreakerOpen = false;
        this.errorCount = 0;
        console.log(chalk.yellow('🔄 Circuit breaker closed - resuming operations'));
        return false;
      }
      return true;
    }

    // Check if we should open the circuit
    if (this.errorCount >= threshold) {
      this.circuitBreakerOpen = true;
      console.log(chalk.red(`🚨 Circuit breaker opened - too many failures (${this.errorCount})`));
      return true;
    }

    return false;
  }

  /**
   * Execute single user flow with error tracking
   */
  async executeSingleUserFlow(
    wallet: { privateKey: string; address: string },
    userIndex: number,
    batchId: number,
    circuitBreakerThreshold: number
  ): Promise<TestResult> {
    const startTime = Date.now();
    const testId = `ms-04-batch-${batchId}-user-${userIndex}`;

    try {
      // Check circuit breaker
      if (this.checkCircuitBreaker(circuitBreakerThreshold)) {
        return {
          success: false,
          duration: 0,
          walletAddress: wallet.address,
          error: 'Circuit breaker open',
          startTime,
          endTime: Date.now(),
        };
      }

      // Create client and execute flow
      const client = await VanaLoadTestClient.create(wallet.privateKey, this.config);
      const userData = this.generateTestData();
      const prompt = generateWalletPrompt(wallet.address);

      if (this.config.enableDebugLogs) {
        console.log(chalk.gray(`[${testId}] Starting E2E flow for wallet: ${wallet.address}`));
      }

      const result = await client.executeDataPortabilityFlow(
        userData,
        prompt,
        testId,
        'http://localhost:3001'
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      if (result.success) {
        // Reset error count on success
        if (this.errorCount > 0) {
          this.errorCount = Math.max(0, this.errorCount - 1);
        }

        if (this.config.enableDebugLogs) {
          console.log(chalk.green(`[${testId}] ✅ Flow completed in ${(duration / 1000).toFixed(2)}s`));
        }
        return {
          success: true,
          duration,
          walletAddress: wallet.address,
          transactionHash: result.transactionHash,
          permissionId: result.permissionId,
          startTime,
          endTime,
        };
      } else {
        this.errorCount++;
        this.lastErrorTime = Date.now();

        if (this.config.enableDebugLogs) {
          console.log(chalk.red(`[${testId}] ❌ Flow failed: ${result.error}`));
        }
        return {
          success: false,
          duration,
          walletAddress: wallet.address,
          error: result.error,
          startTime,
          endTime,
        };
      }

    } catch (error) {
      this.errorCount++;
      this.lastErrorTime = Date.now();

      const endTime = Date.now();
      const duration = endTime - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (this.config.enableDebugLogs) {
        console.error(chalk.red(`[${testId}] ❌ Flow failed: ${errorMessage}`));
      }

      return {
        success: false,
        duration,
        walletAddress: wallet.address,
        error: errorMessage,
        startTime,
        endTime,
      };
    }
  }

  /**
   * Execute batch of users concurrently with jittered delays
   */
  async executeBatch(
    wallets: Array<{ privateKey: string; address: string }>,
    batchId: number,
    batchSize: number,
    circuitBreakerThreshold: number
  ): Promise<TestResult[]> {
    const startIndex = batchId * batchSize;
    const endIndex = Math.min(startIndex + batchSize, wallets.length);
    const batchWallets = wallets.slice(startIndex, endIndex);

    if (this.config.enableDebugLogs) {
      console.log(chalk.cyan(`\n🚀 Executing Batch ${batchId + 1}: ${batchWallets.length} users (${startIndex + 1}-${endIndex})`));
    }

    // Execute batch concurrently with jittered delays
    const promises = batchWallets.map(async (wallet, index) => {
      // Add jittered delay to spread out the requests
      const jitter = Math.random() * 2000; // 0-2 seconds
      await new Promise(resolve => setTimeout(resolve, jitter));

      return this.executeSingleUserFlow(
        wallet,
        startIndex + index + 1,
        batchId,
        circuitBreakerThreshold
      );
    });

    return Promise.all(promises);
  }

  /**
   * Execute load pattern test with ramp-up, sustain, and ramp-down
   */
  async executeLoadPatternTest(patternConfig: LoadPatternConfig): Promise<LoadTestMetrics> {
    const totalStartTime = Date.now();
    
    console.log(chalk.blue(`\n🚀 Starting Milestone 4: Load Pattern Testing`));
    console.log(chalk.blue(`📊 Testing ${patternConfig.totalUsers} users with ${patternConfig.maxConcurrency} max concurrency\n`));

    // Display test configuration
    console.log(chalk.cyan(`📋 Load Pattern Configuration:`));
    console.log(chalk.white(`  Total Users: ${patternConfig.totalUsers}`));
    console.log(chalk.white(`  Max Concurrency: ${patternConfig.maxConcurrency}`));
    console.log(chalk.white(`  Batch Size: ${patternConfig.batchSize}`));
    console.log(chalk.white(`  Ramp Up: ${(patternConfig.rampUpDurationMs / 1000).toFixed(1)}s`));
    console.log(chalk.white(`  Sustain: ${(patternConfig.sustainDurationMs / 1000).toFixed(1)}s`));
    console.log(chalk.white(`  Ramp Down: ${(patternConfig.rampDownDurationMs / 1000).toFixed(1)}s`));
    console.log(chalk.white(`  Delay Between Batches: ${(patternConfig.delayBetweenBatches / 1000).toFixed(1)}s`));
    console.log(chalk.white(`  Circuit Breaker Threshold: ${patternConfig.circuitBreakerThreshold} errors\n`));

    // Generate test wallets
    const wallets = this.generateTestWallets(patternConfig.totalUsers);
    
    // Fund wallets
    const fundingResults = await this.fundTestWallets(wallets);
    
    // Execute load pattern
    console.log(chalk.cyan(`\n🔄 Executing load pattern with batched concurrent execution...\n`));
    
    const allResults: TestResult[] = [];
    const batchMetrics: LoadTestMetrics['batchMetrics'] = [];
    const totalBatches = Math.ceil(patternConfig.totalUsers / patternConfig.batchSize);
    let rateLimitsEncountered = 0;
    
    // Calculate delays for each phase
    const rampUpDelay = patternConfig.rampUpDurationMs / Math.ceil(totalBatches / 3);
    const sustainDelay = patternConfig.sustainDurationMs / Math.ceil(totalBatches / 3);
    const rampDownDelay = patternConfig.rampDownDurationMs / Math.ceil(totalBatches / 3);

    for (let batchId = 0; batchId < totalBatches; batchId++) {
      const batchStartTime = Date.now();
      
      // Determine current phase and delay
      let currentDelay = patternConfig.delayBetweenBatches;
      let phase = 'Sustain';
      
      if (batchId < totalBatches / 3) {
        currentDelay = Math.max(rampUpDelay, patternConfig.delayBetweenBatches);
        phase = 'Ramp-Up';
      } else if (batchId > (totalBatches * 2) / 3) {
        currentDelay = Math.max(rampDownDelay, patternConfig.delayBetweenBatches);
        phase = 'Ramp-Down';
      } else {
        currentDelay = Math.max(sustainDelay, patternConfig.delayBetweenBatches);
        phase = 'Sustain';
      }

      console.log(chalk.yellow(`📦 [${phase}] Batch ${batchId + 1}/${totalBatches} - Delay: ${(currentDelay / 1000).toFixed(1)}s`));

      // Execute batch
      const batchResults = await this.executeBatch(
        wallets,
        batchId,
        patternConfig.batchSize,
        patternConfig.circuitBreakerThreshold
      );

      allResults.push(...batchResults);

      const batchEndTime = Date.now();
      const batchSuccessful = batchResults.filter(r => r.success).length;
      const batchSuccessRate = (batchSuccessful / batchResults.length) * 100;
      const batchAverageTime = batchResults.reduce((sum, r) => sum + r.duration, 0) / batchResults.length;

      // Track rate limiting
      const rateLimitErrors = batchResults.filter(r => 
        r.error && (
          r.error.includes('rate limit') || 
          r.error.includes('429') ||
          r.error.includes('Too Many Requests')
        )
      ).length;
      rateLimitsEncountered += rateLimitErrors;

      batchMetrics.push({
        batchId,
        startTime: batchStartTime,
        endTime: batchEndTime,
        successRate: batchSuccessRate,
        averageTime: batchAverageTime,
      });

      console.log(chalk.gray(`   ✅ ${batchSuccessful}/${batchResults.length} successful (${batchSuccessRate.toFixed(1)}%) - Avg: ${(batchAverageTime / 1000).toFixed(2)}s`));

      // Add delay before next batch (unless it's the last batch)
      if (batchId < totalBatches - 1) {
        if (this.config.enableDebugLogs) {
          console.log(chalk.gray(`   ⏳ Waiting ${(currentDelay / 1000).toFixed(1)}s before next batch...`));
        }
        await new Promise(resolve => setTimeout(resolve, currentDelay));
      }
    }

    const totalDuration = Date.now() - totalStartTime;
    const successfulUsers = allResults.filter(r => r.success).length;
    const failedUsers = allResults.filter(r => !r.success).length;

    // Calculate metrics
    const responseTimes = allResults.map(r => r.duration).sort((a, b) => a - b);
    const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    const p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)];
    const p99ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.99)];
    const throughputUsersPerSecond = (successfulUsers / (totalDuration / 1000));

    // Error analysis
    const errorsByType: { [key: string]: number } = {};
    allResults.filter(r => !r.success).forEach(r => {
      const errorType = r.error?.split(':')[0] || 'Unknown';
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    });

    return {
      totalUsers: patternConfig.totalUsers,
      successfulUsers,
      failedUsers,
      totalDuration,
      averageResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      throughputUsersPerSecond,
      errorsByType,
      rateLimitsEncountered,
      circuitBreakerTriggered: this.circuitBreakerOpen,
      batchMetrics,
    };
  }

  /**
   * Validate test results
   */
  validateResults(results: LoadTestMetrics, targetSuccessRate: number = 0.8): void {
    console.log(chalk.cyan(`\n🔍 Validating Load Pattern Test Results...\n`));

    const successRate = (results.successfulUsers / results.totalUsers) * 100;
    const averageTimeSeconds = results.averageResponseTime / 1000;
    const p95TimeSeconds = results.p95ResponseTime / 1000;

    // Test validations
    console.log(`   1. Success Rate: ${successRate >= (targetSuccessRate * 100) ? '✅' : '❌'} ${successRate >= (targetSuccessRate * 100) ? 'PASS' : 'FAIL'}`);
    console.log(`      ${results.successfulUsers}/${results.totalUsers} users successful (${successRate.toFixed(1)}%)`);
    
    console.log(`   2. Average Response Time: ${averageTimeSeconds <= 60 ? '✅' : '❌'} ${averageTimeSeconds <= 60 ? 'PASS' : 'FAIL'}`);
    console.log(`      Average: ${averageTimeSeconds.toFixed(2)}s (✅ < 60s)`);
    
    console.log(`   3. P95 Response Time: ${p95TimeSeconds <= 120 ? '✅' : '❌'} ${p95TimeSeconds <= 120 ? 'PASS' : 'FAIL'}`);
    console.log(`      P95: ${p95TimeSeconds.toFixed(2)}s (✅ < 120s)`);
    
    console.log(`   4. Throughput: ${results.throughputUsersPerSecond >= 0.1 ? '✅' : '❌'} ${results.throughputUsersPerSecond >= 0.1 ? 'PASS' : 'FAIL'}`);
    console.log(`      ${results.throughputUsersPerSecond.toFixed(2)} users/second (✅ > 0.1)`);
    
    console.log(`   5. Circuit Breaker: ${!results.circuitBreakerTriggered ? '✅' : '⚠️'} ${!results.circuitBreakerTriggered ? 'PASS' : 'TRIGGERED'}`);
    console.log(`      Circuit breaker triggered: ${results.circuitBreakerTriggered ? 'Yes' : 'No'}`);

    // Error summary
    if (Object.keys(results.errorsByType).length > 0) {
      console.log(`\n   Error Breakdown:`);
      Object.entries(results.errorsByType).forEach(([error, count]) => {
        console.log(`      ${error}: ${count} occurrences`);
      });
    }

    // Rate limiting analysis
    if (results.rateLimitsEncountered > 0) {
      console.log(`\n   Rate Limiting: ${results.rateLimitsEncountered} rate limit errors encountered`);
    }
  }

  /**
   * Display comprehensive test summary
   */
  displaySummary(results: LoadTestMetrics): void {
    console.log(chalk.cyan(`\n📊 Milestone 4 Load Pattern Test Summary\n`));

    console.log(`  Test Type           : Load Pattern Testing (Concurrent Batches)`);
    console.log(`  Total Users         : ${results.totalUsers}`);
    console.log(`  Successful          : ${results.successfulUsers} (${((results.successfulUsers / results.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`  Failed              : ${results.failedUsers}`);
    console.log(`  Total Duration      : ${(results.totalDuration / 1000).toFixed(2)} seconds`);
    console.log(`  Average Response    : ${(results.averageResponseTime / 1000).toFixed(2)} seconds`);
    console.log(`  P95 Response Time   : ${(results.p95ResponseTime / 1000).toFixed(2)} seconds`);
    console.log(`  P99 Response Time   : ${(results.p99ResponseTime / 1000).toFixed(2)} seconds`);
    console.log(`  Throughput          : ${results.throughputUsersPerSecond.toFixed(2)} users/second`);
    console.log(`  Rate Limits         : ${results.rateLimitsEncountered} encountered`);
    console.log(`  Circuit Breaker     : ${results.circuitBreakerTriggered ? 'Triggered' : 'Stable'}`);

    // Batch performance summary
    console.log(chalk.cyan(`\n📈 Batch Performance:`));
    results.batchMetrics.forEach((batch, index) => {
      const phase = index < results.batchMetrics.length / 3 ? 'Ramp-Up' : 
                   index > (results.batchMetrics.length * 2) / 3 ? 'Ramp-Down' : 'Sustain';
      console.log(`  Batch ${batch.batchId + 1} [${phase}]: ${batch.successRate.toFixed(1)}% success, ${(batch.averageTime / 1000).toFixed(2)}s avg`);
    });

    const overallSuccess = results.successfulUsers >= (results.totalUsers * 0.8); // 80% success rate
    
    if (overallSuccess) {
      console.log(chalk.green(`\n🎉 Milestone 4 PASSED! Load pattern testing successful.`));
      console.log(chalk.green(`🚀 Ready to proceed to Milestone 5: Full Scale Testing`));
    } else {
      console.log(chalk.red(`\n❌ Milestone 4 FAILED. Issues need to be resolved before full-scale testing.`));
      console.log(chalk.yellow(`🔧 Optimization opportunities:`));
      console.log(chalk.yellow(`   1. Increase batch delays to reduce rate limiting`));
      console.log(chalk.yellow(`   2. Implement exponential backoff strategies`));
      console.log(chalk.yellow(`   3. Consider deploying dedicated personal server instance`));
      console.log(chalk.yellow(`   4. Optimize wallet funding batch sizes`));
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log(chalk.gray(`\n🧹 Cleaning up test environment...`));
    
    if (this.apiServer) {
      await this.apiServer.stop();
    }
  }

  /**
   * Main test execution
   */
  async run(patternConfig?: Partial<LoadPatternConfig>): Promise<void> {
    try {
      // Default load pattern configuration
      const defaultConfig: LoadPatternConfig = {
        totalUsers: 20,
        maxConcurrency: 5,
        rampUpDurationMs: 30000, // 30 seconds
        sustainDurationMs: 60000, // 60 seconds  
        rampDownDurationMs: 30000, // 30 seconds
        batchSize: 5,
        delayBetweenBatches: 10000, // 10 seconds
        maxRetries: 3,
        circuitBreakerThreshold: 5,
      };

      const config = { ...defaultConfig, ...patternConfig };

      await this.startApiServer();
      
      const results = await this.executeLoadPatternTest(config);
      
      this.validateResults(results);
      this.displaySummary(results);
      
    } catch (error) {
      console.error(chalk.red(`\n💥 Load pattern test failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// Run the test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  async function runTest() {
    try {
      // Load configuration first
      const config = await loadConfig();
      config.enableDebugLogs = true; // Enable debug logs for milestone testing
      
      console.log(chalk.cyan('📋 Loading configuration...'));
      console.log(`  RPC Endpoint: ${config.rpcEndpoint}`);
      console.log(`  Relayer Key: ${config.relayerPrivateKey ? 'Configured ✅' : 'Missing ❌'}`);
      console.log(`  Debug Logs: ${config.enableDebugLogs ? 'Enabled' : 'Disabled'}`);
      
      const test = new LoadPatternTest(config);
      
      // Parse command line arguments for custom configuration
      const args = process.argv.slice(2);
      const customConfig: Partial<LoadPatternConfig> = {};
      
      for (let i = 0; i < args.length; i += 2) {
        const key = args[i]?.replace('--', '');
        const value = args[i + 1];
        
        if (key && value) {
          switch (key) {
            case 'users':
              customConfig.totalUsers = parseInt(value);
              break;
            case 'concurrency':
              customConfig.maxConcurrency = parseInt(value);
              break;
            case 'batch-size':
              customConfig.batchSize = parseInt(value);
              break;
            case 'delay':
              customConfig.delayBetweenBatches = parseInt(value) * 1000;
              break;
          }
        }
      }
      
      if (Object.keys(customConfig).length > 0) {
        console.log(chalk.cyan('🎛️  Custom configuration applied:'), customConfig);
      }
      
      await test.run(customConfig);
    } catch (error) {
      console.error(chalk.red('Failed to run load pattern test:'), error);
      process.exit(1);
    }
  }
  
  runTest();
}
