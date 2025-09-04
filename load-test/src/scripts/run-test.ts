#!/usr/bin/env node

import { Command } from 'commander';
import { VanaLoadTestClient } from '../client/load-test-client.js';
import { LoadTestApiServer } from '../server/api-server.js';
import { loadConfig, getPresetConfig } from '../config/loader.js';
import { faker } from '@faker-js/faker';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { generatePrivateKey } from 'viem/accounts';
import Table from 'cli-table3';

/**
 * Load Test Execution Script
 * 
 * Executes load tests with various configurations:
 * - Single E2E flow testing
 * - Multi-user concurrent testing  
 * - Artillery-based load patterns
 * - Custom test configurations
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

interface LoadTestResult {
  testId: string;
  walletAddress: string;
  success: boolean;
  duration: number;
  error?: string;
  inferenceResult?: string;
}

interface LoadTestSummary {
  totalTests: number;
  successfulTests: number;
  failedTests: number;
  successRate: number;
  averageDuration: number;
  totalDuration: number;
  errors: { [key: string]: number };
}

class LoadTestRunner {
  private config: any;
  private apiServer?: LoadTestApiServer;
  private results: LoadTestResult[] = [];

  constructor(config: any) {
    this.config = config;
  }

  async startApiServer(): Promise<void> {
    const spinner = ora('Starting API server...').start();
    
    try {
      this.apiServer = new LoadTestApiServer(this.config, 3001);
      await this.apiServer.start();
      spinner.succeed(chalk.green('API server started on port 3001'));
    } catch (error) {
      spinner.fail(chalk.red('Failed to start API server'));
      throw error;
    }
  }

  async loadTestWallets(filename: string = 'test-wallets.json'): Promise<TestWallet[]> {
    const walletsPath = path.join(process.cwd(), 'wallets', filename);
    
    try {
      const data = await fs.readFile(walletsPath, 'utf-8');
      const walletBatch: WalletBatch = JSON.parse(data);
      
      console.log(chalk.cyan(`📂 Loaded ${walletBatch.wallets.length} test wallets from ${filename}`));
      console.log(chalk.cyan(`   Funded wallets: ${walletBatch.fundedWallets}`));
      
      return walletBatch.wallets.filter(w => w.funded);
    } catch (error) {
      console.log(chalk.yellow('⚠️  No test wallets found, generating temporary wallets...'));
      return this.generateTemporaryWallets(10); // Generate a few for testing
    }
  }

  generateTemporaryWallets(count: number): TestWallet[] {
    const wallets: TestWallet[] = [];
    
    for (let i = 0; i < count; i++) {
      const privateKey = generatePrivateKey();
      const account = require('viem/accounts').privateKeyToAccount(privateKey);
      
      wallets.push({
        address: account.address,
        privateKey,
        funded: false, // These won't actually be funded
        balance: '0.1', // Pretend they have balance for testing
      });
    }
    
    console.log(chalk.yellow(`Generated ${count} temporary wallets (not funded)`));
    return wallets;
  }

  generateTestData(size: 'small' | 'medium' | 'large' = 'small'): string {
    const sizes = {
      small: 50,    // ~50 fields
      medium: 200,  // ~200 fields  
      large: 500    // ~500 fields
    };
    
    const fieldCount = sizes[size];
    const userData: any = {
      user_profile: {
        id: faker.string.uuid(),
        name: faker.person.fullName(),
        email: faker.internet.email(),
        age: faker.number.int({ min: 18, max: 80 }),
        location: {
          city: faker.location.city(),
          country: faker.location.country(),
          coordinates: {
            lat: faker.location.latitude(),
            lng: faker.location.longitude(),
          },
        },
        preferences: {
          theme: faker.helpers.arrayElement(['light', 'dark']),
          language: faker.location.countryCode(),
          notifications: faker.datatype.boolean(),
        },
      },
      activity_logs: [],
      metadata: {
        generated_at: Date.now(),
        test_size: size,
        field_count: fieldCount,
        test_run_id: `test_${Date.now()}`,
      },
    };
    
    // Generate activity logs to reach target field count
    const logsNeeded = Math.max(0, fieldCount - 20); // Account for existing fields
    for (let i = 0; i < logsNeeded; i++) {
      userData.activity_logs.push({
        id: faker.string.uuid(),
        timestamp: faker.date.recent().toISOString(),
        action: faker.helpers.arrayElement(['login', 'logout', 'view', 'click', 'purchase', 'search']),
        details: {
          page: faker.internet.url(),
          duration: faker.number.int({ min: 1, max: 3600 }),
          device: faker.helpers.arrayElement(['mobile', 'desktop', 'tablet']),
          browser: faker.internet.userAgent(),
        },
      });
    }
    
    return JSON.stringify(userData, null, 2);
  }

  async runSingleTest(wallet: TestWallet, testId: string): Promise<LoadTestResult> {
    try {
      const client = await VanaLoadTestClient.create(wallet.privateKey, this.config);
      const userData = this.generateTestData('small');
      const prompt = "Analyze this user's activity patterns and provide insights.";
      
      const result = await client.executeDataPortabilityFlow(
        userData,
        prompt,
        testId,
        'http://localhost:3001'
      );
      
      return {
        testId,
        walletAddress: wallet.address,
        success: result.success,
        duration: result.duration,
        error: result.error,
        inferenceResult: result.inferenceResult,
      };
      
    } catch (error) {
      return {
        testId,
        walletAddress: wallet.address,
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async runConcurrentTests(wallets: TestWallet[], concurrency: number): Promise<LoadTestSummary> {
    console.log(chalk.cyan(`\n🚀 Running ${wallets.length} tests with ${concurrency} concurrent users...`));
    
    const startTime = Date.now();
    const results: LoadTestResult[] = [];
    
    // Process wallets in batches
    const batchSize = concurrency;
    const batches = Math.ceil(wallets.length / batchSize);
    
    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const startIndex = batchIndex * batchSize;
      const endIndex = Math.min(startIndex + batchSize, wallets.length);
      const batch = wallets.slice(startIndex, endIndex);
      
      const spinner = ora(`Batch ${batchIndex + 1}/${batches}: Running ${batch.length} concurrent tests...`).start();
      
      try {
        const batchPromises = batch.map((wallet, index) => {
          const testId = `batch_${batchIndex + 1}_test_${index + 1}`;
          return this.runSingleTest(wallet, testId);
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        const successCount = batchResults.filter(r => r.success).length;
        spinner.succeed(chalk.green(`Batch ${batchIndex + 1}/${batches}: ${successCount}/${batch.length} tests passed`));
        
        // Small delay between batches
        if (batchIndex < batches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        spinner.fail(chalk.red(`Batch ${batchIndex + 1} failed`));
        console.error(error);
      }
    }
    
    this.results = results;
    const totalDuration = Date.now() - startTime;
    
    return this.generateSummary(results, totalDuration);
  }

  generateSummary(results: LoadTestResult[], totalDuration: number): LoadTestSummary {
    const successfulTests = results.filter(r => r.success).length;
    const failedTests = results.length - successfulTests;
    const successRate = results.length > 0 ? (successfulTests / results.length) * 100 : 0;
    
    const durations = results.filter(r => r.success).map(r => r.duration);
    const averageDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    
    // Count error types
    const errors: { [key: string]: number } = {};
    results.filter(r => !r.success && r.error).forEach(r => {
      const errorKey = r.error!.substring(0, 50); // Truncate long errors
      errors[errorKey] = (errors[errorKey] || 0) + 1;
    });
    
    return {
      totalTests: results.length,
      successfulTests,
      failedTests,
      successRate,
      averageDuration,
      totalDuration,
      errors,
    };
  }

  displayResults(summary: LoadTestSummary): void {
    console.log(chalk.bold.cyan('\n📊 Load Test Results\n'));
    
    // Summary table
    const summaryTable = new Table({
      head: ['Metric', 'Value'],
      colWidths: [25, 20],
    });
    
    summaryTable.push(
      ['Total Tests', summary.totalTests.toString()],
      ['Successful Tests', chalk.green(summary.successfulTests.toString())],
      ['Failed Tests', summary.failedTests > 0 ? chalk.red(summary.failedTests.toString()) : '0'],
      ['Success Rate', `${summary.successRate.toFixed(1)}%`],
      ['Average Duration', `${(summary.averageDuration / 1000).toFixed(2)}s`],
      ['Total Test Time', `${(summary.totalDuration / 1000).toFixed(2)}s`],
    );
    
    console.log(summaryTable.toString());
    
    // Error breakdown if any
    if (Object.keys(summary.errors).length > 0) {
      console.log(chalk.red('\n❌ Error Breakdown:\n'));
      
      const errorTable = new Table({
        head: ['Error', 'Count'],
        colWidths: [60, 10],
      });
      
      Object.entries(summary.errors)
        .sort(([,a], [,b]) => b - a) // Sort by count descending
        .forEach(([error, count]) => {
          errorTable.push([error, count.toString()]);
        });
      
      console.log(errorTable.toString());
    }
    
    // Performance assessment
    console.log(chalk.cyan('\n🎯 Performance Assessment:\n'));
    
    if (summary.successRate >= 95) {
      console.log(chalk.green('✅ Excellent: >95% success rate'));
    } else if (summary.successRate >= 90) {
      console.log(chalk.yellow('⚠️  Good: >90% success rate'));
    } else {
      console.log(chalk.red('❌ Poor: <90% success rate - investigate failures'));
    }
    
    if (summary.averageDuration < 30000) {
      console.log(chalk.green('✅ Fast: <30s average response time'));
    } else if (summary.averageDuration < 60000) {
      console.log(chalk.yellow('⚠️  Moderate: <60s average response time'));
    } else {
      console.log(chalk.red('❌ Slow: >60s average response time'));
    }
  }

  async saveResults(filename?: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFilename = `load-test-results-${timestamp}.json`;
    const resultsFilename = filename || defaultFilename;
    
    const resultsDir = path.join(process.cwd(), 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    
    const resultsPath = path.join(resultsDir, resultsFilename);
    const summary = this.generateSummary(this.results, 0);
    
    const reportData = {
      timestamp: new Date().toISOString(),
      config: this.config,
      summary,
      results: this.results,
    };
    
    await fs.writeFile(resultsPath, JSON.stringify(reportData, null, 2));
    console.log(chalk.cyan(`💾 Results saved to: ${resultsPath}`));
  }
}

// CLI Program
const program = new Command();

program
  .name('run-test')
  .description('Execute Vana SDK load tests')
  .option('--preset <preset>', 'Use preset configuration (burst|conservative|debug)', 'debug')
  .option('--concurrent <number>', 'Number of concurrent users', '10')
  .option('--total <number>', 'Total number of tests to run', '50')
  .option('--wallets <filename>', 'Wallet file to use', 'test-wallets.json')
  .option('--output <filename>', 'Output filename for results')
  .option('--no-server', 'Skip starting API server (assumes already running)', false)
  .action(async (options) => {
    try {
      console.log(chalk.bold.cyan('🏁 Vana SDK Load Test Runner\n'));
      
      // Load configuration
      const baseConfig = options.preset === 'burst' || options.preset === 'conservative' 
        ? await getPresetConfig(options.preset)
        : await loadConfig();
        
      // Override with CLI options
      if (options.concurrent) {
        baseConfig.maxConcurrentUsers = parseInt(options.concurrent);
      }
      if (options.total) {
        baseConfig.totalUsers = parseInt(options.total);
      }
      
      console.log(chalk.cyan('📋 Test Configuration:'));
      console.log(`  Preset: ${options.preset}`);
      console.log(`  Concurrent users: ${baseConfig.maxConcurrentUsers}`);
      console.log(`  Total tests: ${Math.min(baseConfig.totalUsers, parseInt(options.total || '50'))}`);
      console.log(`  Wallet file: ${options.wallets}`);
      console.log('');
      
      const runner = new LoadTestRunner(baseConfig);
      
      // Start API server unless disabled
      if (options.server !== false) {
        await runner.startApiServer();
      } else {
        console.log(chalk.yellow('⚠️  Skipping API server startup (assuming already running)'));
      }
      
      // Load test wallets
      const wallets = await runner.loadTestWallets(options.wallets);
      const testCount = Math.min(wallets.length, parseInt(options.total || '50'));
      const testWallets = wallets.slice(0, testCount);
      
      if (testWallets.length === 0) {
        throw new Error('No funded test wallets available');
      }
      
      // Run load tests
      const summary = await runner.runConcurrentTests(
        testWallets,
        baseConfig.maxConcurrentUsers
      );
      
      // Display results
      runner.displayResults(summary);
      
      // Save results
      await runner.saveResults(options.output);
      
      console.log(chalk.green('\n🎉 Load test completed successfully!'));
      
      // Exit with appropriate code
      process.exit(summary.successRate >= 90 ? 0 : 1);
      
    } catch (error) {
      console.error(chalk.red('\n❌ Load test failed:'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

export { LoadTestRunner };
