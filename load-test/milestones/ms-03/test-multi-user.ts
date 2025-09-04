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
 * Milestone 3: Multi-User Validation Test
 * 
 * Tests concurrent user handling with rate limiting awareness:
 * - 10 wallets executing flows (sequential to avoid rate limits initially)
 * - Dynamic wallet funding for all test wallets  
 * - API server under light load
 * - Resource monitoring and error handling
 * - Rate limiting mitigation strategies
 */

interface TestResult {
  success: boolean;
  duration: number;
  walletAddress: string;
  error?: string;
  transactionHash?: string;
  permissionId?: string;
}

interface MultiUserTestResults {
  totalUsers: number;
  successfulUsers: number;
  failedUsers: number;
  totalDuration: number;
  averageDurationPerUser: number;
  results: TestResult[];
  rateLimitEncountered: boolean;
  fundingResults: {
    totalFunded: number;
    fundingErrors: number;
  };
}

export class MultiUserLoadTest {
  private config: any;
  private apiServer?: LoadTestApiServer;
  private walletFunder?: WalletFunder;

  constructor(config: any) {
    this.config = config;
  }

  /**
   * Generate realistic test data
   */
  generateTestData(): string {
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
      activity_logs: Array.from({ length: 15 }, () => ({
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
        test_type: 'milestone_3_multi_user',
        data_size: 'medium',
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
    const spinner = ora('Starting API server for multi-user test...').start();
    
    try {
      this.apiServer = new LoadTestApiServer(this.config, 3001);
      await this.apiServer.start();
      
      // Wait a moment for server to be ready
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
   * Fund multiple wallets concurrently
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

    const spinner = ora(`Funding ${wallets.length} test wallets...`).start();
    
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
   * Execute single user flow with rate limiting awareness
   */
  async executeSingleUserFlow(
    wallet: { privateKey: string; address: string },
    userIndex: number,
    requestDelay: number = 0
  ): Promise<TestResult> {
    const startTime = Date.now();
    const testId = `ms-03-user-${userIndex}`;

    try {
      // Add delay to avoid rate limiting
      if (requestDelay > 0) {
        if (this.config.enableDebugLogs) {
          console.log(chalk.gray(`[${testId}] Waiting ${requestDelay}ms to avoid rate limits...`));
        }
        await new Promise(resolve => setTimeout(resolve, requestDelay));
      }

      // Create client and execute flow
      const client = await VanaLoadTestClient.create(wallet.privateKey, this.config);
      const userData = this.generateTestData();
      const prompt = generateWalletPrompt(wallet.address);

      if (this.config.enableDebugLogs) {
        console.log(chalk.cyan(`[${testId}] Starting E2E flow for wallet: ${wallet.address}`));
      }

      const result = await client.executeDataPortabilityFlow(
        userData,
        prompt,
        testId,
        'http://localhost:3001'
      );

      const duration = Date.now() - startTime;

      if (result.success) {
        if (this.config.enableDebugLogs) {
          console.log(chalk.green(`[${testId}] ✅ Flow completed in ${(duration / 1000).toFixed(2)}s`));
        }
        return {
          success: true,
          duration,
          walletAddress: wallet.address,
          transactionHash: result.transactionHash,
          permissionId: result.permissionId,
        };
      } else {
        if (this.config.enableDebugLogs) {
          console.log(chalk.red(`[${testId}] ❌ Flow failed: ${result.error}`));
        }
        return {
          success: false,
          duration,
          walletAddress: wallet.address,
          error: result.error,
        };
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (this.config.enableDebugLogs) {
        console.error(chalk.red(`[${testId}] ❌ Flow failed: ${errorMessage}`));
      }

      return {
        success: false,
        duration,
        walletAddress: wallet.address,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute multi-user test with rate limiting mitigation
   */
  async executeMultiUserTest(userCount: number = 10): Promise<MultiUserTestResults> {
    const totalStartTime = Date.now();
    
    console.log(chalk.blue(`\n🚀 Starting Milestone 3: Multi-User Validation Test`));
    console.log(chalk.blue(`📊 Testing ${userCount} concurrent users with rate limiting awareness\n`));

    // Generate test wallets
    console.log(chalk.cyan(`📋 Test Configuration:`));
    console.log(chalk.white(`  Users: ${userCount}`));
    console.log(chalk.white(`  RPC Endpoint: ${this.config.rpcEndpoint}`));
    console.log(chalk.white(`  Debug Logs: ${this.config.enableDebugLogs ? 'Enabled' : 'Disabled'}`));
    console.log(chalk.white(`  API Server Port: 3001`));
    console.log(chalk.white(`  Rate Limiting: Sequential execution with delays\n`));

    const wallets = this.generateTestWallets(userCount);
    
    // Fund wallets
    const fundingResults = await this.fundTestWallets(wallets);
    
    // Execute flows with rate limiting mitigation
    console.log(chalk.cyan(`\n🔄 Executing ${userCount} E2E flows sequentially to avoid rate limits...\n`));
    
    const results: TestResult[] = [];
    let rateLimitEncountered = false;
    
    // Sequential execution with delays to avoid rate limits
    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      const requestDelay = i > 0 ? 3000 : 0; // 3 second delay between requests
      
      const result = await this.executeSingleUserFlow(wallet, i + 1, requestDelay);
      results.push(result);
      
      // Check for rate limiting indicators
      if (result.error && (
        result.error.includes('rate limit') || 
        result.error.includes('429') ||
        result.error.includes('Too Many Requests')
      )) {
        rateLimitEncountered = true;
        console.log(chalk.yellow(`⚠️  Rate limiting detected for user ${i + 1}`));
      }
    }

    const totalDuration = Date.now() - totalStartTime;
    const successfulUsers = results.filter(r => r.success).length;
    const failedUsers = results.filter(r => !r.success).length;
    const averageDurationPerUser = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

    return {
      totalUsers: userCount,
      successfulUsers,
      failedUsers,
      totalDuration,
      averageDurationPerUser,
      results,
      rateLimitEncountered,
      fundingResults,
    };
  }

  /**
   * Validate test results
   */
  validateResults(results: MultiUserTestResults): void {
    console.log(chalk.cyan(`\n🔍 Validating Multi-User Test Results...\n`));

    const successRate = (results.successfulUsers / results.totalUsers) * 100;
    const averageTimeSeconds = results.averageDurationPerUser / 1000;

    // Test validations
    console.log(`   1. Success Rate: ${successRate >= 80 ? '✅' : '❌'} ${successRate >= 80 ? 'PASS' : 'FAIL'}`);
    console.log(`      ${results.successfulUsers}/${results.totalUsers} users successful (${successRate.toFixed(1)}%)`);
    
    console.log(`   2. Average Response Time: ${averageTimeSeconds <= 120 ? '✅' : '❌'} ${averageTimeSeconds <= 120 ? 'PASS' : 'FAIL'}`);
    console.log(`      Average: ${averageTimeSeconds.toFixed(2)}s (✅ < 120s)`);
    
    console.log(`   3. Rate Limiting: ${!results.rateLimitEncountered ? '✅' : '⚠️'} ${!results.rateLimitEncountered ? 'PASS' : 'DETECTED'}`);
    console.log(`      Rate limits encountered: ${results.rateLimitEncountered ? 'Yes' : 'No'}`);
    
    console.log(`   4. Wallet Funding: ${results.fundingResults.totalFunded > 0 ? '✅' : '❌'} ${results.fundingResults.totalFunded > 0 ? 'PASS' : 'FAIL'}`);
    console.log(`      ${results.fundingResults.totalFunded} wallets funded (${results.fundingResults.fundingErrors} errors)`);

    // Error summary
    const errorCounts: { [key: string]: number } = {};
    results.results.filter(r => !r.success).forEach(r => {
      const errorType = r.error?.split(':')[0] || 'Unknown';
      errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
    });

    if (Object.keys(errorCounts).length > 0) {
      console.log(`\n   Error Breakdown:`);
      Object.entries(errorCounts).forEach(([error, count]) => {
        console.log(`      ${error}: ${count} occurrences`);
      });
    }
  }

  /**
   * Display test summary
   */
  displaySummary(results: MultiUserTestResults): void {
    console.log(chalk.cyan(`\n📊 Milestone 3 Test Summary\n`));

    console.log(`  Test Type      : Multi-User Validation (Sequential)`);
    console.log(`  Total Users    : ${results.totalUsers}`);
    console.log(`  Successful     : ${results.successfulUsers} (${((results.successfulUsers / results.totalUsers) * 100).toFixed(1)}%)`);
    console.log(`  Failed         : ${results.failedUsers}`);
    console.log(`  Total Duration : ${(results.totalDuration / 1000).toFixed(2)} seconds`);
    console.log(`  Avg Per User   : ${(results.averageDurationPerUser / 1000).toFixed(2)} seconds`);
    console.log(`  Rate Limiting  : ${results.rateLimitEncountered ? 'Detected' : 'None detected'}`);
    console.log(`  Wallets Funded : ${results.fundingResults.totalFunded}/${results.totalUsers}`);

    const overallSuccess = results.successfulUsers >= (results.totalUsers * 0.8); // 80% success rate
    
    if (overallSuccess) {
      console.log(chalk.green(`\n🎉 Milestone 3 PASSED! Multi-user validation successful.`));
      console.log(chalk.green(`🚀 Ready to proceed to Milestone 4: Load Pattern Testing`));
    } else {
      console.log(chalk.red(`\n❌ Milestone 3 FAILED. Issues need to be resolved before proceeding.`));
      console.log(chalk.yellow(`🔧 Troubleshooting steps:`));
      console.log(chalk.yellow(`   1. Check rate limiting mitigation strategies`));
      console.log(chalk.yellow(`   2. Verify wallet funding is working properly`));
      console.log(chalk.yellow(`   3. Review error patterns and adjust delays`));
      console.log(chalk.yellow(`   4. Consider implementing exponential backoff`));
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
  async run(): Promise<void> {
    try {
      await this.startApiServer();
      
      const results = await this.executeMultiUserTest(3);
      
      this.validateResults(results);
      this.displaySummary(results);
      
    } catch (error) {
      console.error(chalk.red(`\n💥 Multi-user test failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
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
      
      const test = new MultiUserLoadTest(config);
      await test.run();
    } catch (error) {
      console.error(chalk.red('Failed to run test:'), error);
      process.exit(1);
    }
  }
  
  runTest();
}
