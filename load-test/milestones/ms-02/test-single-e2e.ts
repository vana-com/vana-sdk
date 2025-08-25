#!/usr/bin/env node

import { VanaLoadTestClient } from '../../src/client/load-test-client.js';
import { LoadTestApiServer } from '../../src/server/api-server.js';
import { loadConfig } from '../../src/config/loader.js';
import { generateWalletPrompt } from '../../src/utils/prompt-generator.js';
import { faker } from '@faker-js/faker';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Milestone 2: Single E2E Flow Test
 * 
 * Tests the complete data portability workflow with a single user:
 * 1. API server startup
 * 2. Test wallet creation
 * 3. Synthetic data generation
 * 4. Complete E2E flow execution
 * 5. Result validation
 * 
 * This validates that the entire system works end-to-end before
 * proceeding to multi-user concurrent testing.
 */

interface TestResult {
  success: boolean;
  duration: number;
  walletAddress: string;
  error?: string;
  inferenceResult?: string;
}

class SingleE2ETest {
  private config: any;
  private apiServer?: LoadTestApiServer;
  private testResults: any = {};

  constructor(config: any) {
    this.config = config;
  }

  async startApiServer(): Promise<void> {
    const spinner = ora('Starting API server for E2E test...').start();
    
    try {
      this.apiServer = new LoadTestApiServer(this.config, 3001);
      await this.apiServer.start();
      
      // Wait a moment for server to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Test server health
      const response = await fetch('http://localhost:3001/health');
      if (!response.ok) {
        throw new Error('API server health check failed');
      }
      
      spinner.succeed(chalk.green('API server started and healthy'));
    } catch (error) {
      spinner.fail(chalk.red('Failed to start API server'));
      throw error;
    }
  }

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
          coordinates: {
            lat: faker.location.latitude(),
            lng: faker.location.longitude(),
          },
        },
        preferences: {
          theme: faker.helpers.arrayElement(['light', 'dark']),
          language: faker.location.countryCode(),
          notifications: faker.datatype.boolean(),
          marketing_emails: faker.datatype.boolean(),
        },
      },
      activity_logs: Array.from({ length: 20 }, () => ({
        id: faker.string.uuid(),
        timestamp: faker.date.recent({ days: 30 }).toISOString(),
        action: faker.helpers.arrayElement(['login', 'logout', 'view', 'click', 'purchase', 'search']),
        details: {
          page: faker.internet.url(),
          duration: faker.number.int({ min: 1, max: 3600 }),
          device: faker.helpers.arrayElement(['mobile', 'desktop', 'tablet']),
          browser: faker.internet.userAgent(),
          ip_address: faker.internet.ip(),
          session_id: faker.string.uuid(),
        },
      })),
      purchase_history: Array.from({ length: 5 }, () => ({
        id: faker.string.uuid(),
        timestamp: faker.date.recent({ days: 90 }).toISOString(),
        amount: faker.number.float({ min: 10, max: 500, fractionDigits: 2 }),
        currency: faker.finance.currencyCode(),
        product: faker.commerce.productName(),
        category: faker.commerce.department(),
      })),
      preferences: {
        privacy_settings: {
          data_sharing: faker.datatype.boolean(),
          analytics: faker.datatype.boolean(),
          third_party_cookies: faker.datatype.boolean(),
        },
        communication: {
          email_frequency: faker.helpers.arrayElement(['daily', 'weekly', 'monthly', 'never']),
          sms_notifications: faker.datatype.boolean(),
          push_notifications: faker.datatype.boolean(),
        },
      },
      metadata: {
        generated_at: Date.now(),
        test_type: 'milestone_2_single_e2e',
        data_size: 'medium',
        version: '1.0.0',
      },
    };

    return JSON.stringify(userData, null, 2);
  }

  async executeE2EFlow(): Promise<TestResult> {
    const spinner = ora('Executing complete E2E data portability flow...').start();
    
    try {
      // Use fixed test wallet for Milestone 2 (so you can fund it)
      // This is a deterministic test wallet for Moksha testnet
      const privateKey = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a' as `0x${string}`;
      const client = await VanaLoadTestClient.create(privateKey, this.config);
      const walletAddress = client.getWalletAddress();
      
      console.log(chalk.cyan(`\n🏦 Fixed Test Wallet for Funding:`));
      console.log(chalk.yellow(`   Address: ${walletAddress}`));
      console.log(chalk.yellow(`   Private Key: ${privateKey}`));
      console.log(chalk.cyan(`   Please fund this address on Moksha testnet with VANA tokens\n`));
      
      spinner.text = `Using fixed test wallet: ${walletAddress}`;
      
      // Generate test data
      const userData = this.generateTestData();
      const prompt = generateWalletPrompt(walletAddress);
      
      if (this.config.enableDebugLogs) {
        console.log(chalk.cyan(`\n🎨 Generated Fun Prompt:`));
        console.log(chalk.yellow(`   "${prompt}"`));
      }
      
      spinner.text = 'Generated test data, executing flow...';
      
      // Execute the complete flow
      const result = await client.executeDataPortabilityFlow(
        userData,
        prompt,
        'ms-02-single-e2e',
        'http://localhost:3001'
      );
      
      if (result.success) {
        spinner.succeed(chalk.green(`E2E flow completed successfully in ${(result.duration / 1000).toFixed(2)}s`));
      } else {
        spinner.fail(chalk.red(`E2E flow failed after ${(result.duration / 1000).toFixed(2)}s`));
      }
      
      return result;
      
    } catch (error) {
      spinner.fail(chalk.red('E2E flow execution failed'));
      
      return {
        success: false,
        duration: 0,
        walletAddress: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  validateResults(result: TestResult): boolean {
    console.log(chalk.cyan('\n🔍 Validating E2E Flow Results...\n'));
    
    const validations = [
      {
        name: 'Flow Success',
        condition: result.success,
        message: result.success ? 'Flow completed successfully' : `Flow failed: ${result.error}`,
      },
      {
        name: 'Response Time',
        condition: result.success && result.duration < 60000, // < 60 seconds
        message: `Duration: ${(result.duration / 1000).toFixed(2)}s ${result.duration < 60000 ? '(✅ < 60s)' : '(❌ > 60s)'}`,
      },
      {
        name: 'Wallet Address',
        condition: result.walletAddress && result.walletAddress.startsWith('0x'),
        message: `Wallet: ${result.walletAddress}`,
      },
      {
        name: 'Error Handling',
        condition: result.success || (result.error && result.error.length > 0),
        message: result.success ? 'No errors' : `Error captured: ${result.error}`,
      },
    ];
    
    let allPassed = true;
    
    validations.forEach((validation, index) => {
      const status = validation.condition ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');
      const testNum = (index + 1).toString().padStart(2, ' ');
      
      console.log(`  ${testNum}. ${validation.name}: ${status}`);
      console.log(`      ${validation.message}`);
      
      if (!validation.condition) {
        allPassed = false;
      }
    });
    
    return allPassed;
  }

  displaySummary(result: TestResult, validationPassed: boolean): void {
    console.log(chalk.bold.cyan('\n📊 Milestone 2 Test Summary\n'));
    
    const summaryData = [
      ['Test Type', 'Single E2E Data Portability Flow'],
      ['Wallet Address', result.walletAddress],
      ['Success', result.success ? chalk.green('✅ Yes') : chalk.red('❌ No')],
      ['Duration', `${(result.duration / 1000).toFixed(2)} seconds`],
      ['Validation', validationPassed ? chalk.green('✅ Passed') : chalk.red('❌ Failed')],
    ];
    
    if (result.error) {
      summaryData.push(['Error', chalk.red(result.error)]);
    }
    
    if (result.inferenceResult) {
      summaryData.push(['AI Result', result.inferenceResult.substring(0, 100) + '...']);
    }
    
    summaryData.forEach(([key, value]) => {
      console.log(`  ${key.padEnd(15)}: ${value}`);
    });
    
    console.log('');
    
    // Overall assessment
    if (validationPassed && result.success) {
      console.log(chalk.green('🎉 Milestone 2 PASSED! Single E2E flow working correctly.'));
      console.log(chalk.cyan('🚀 Ready to proceed to Milestone 3: Multi-User Validation'));
    } else {
      console.log(chalk.red('❌ Milestone 2 FAILED. Issues need to be resolved before proceeding.'));
      console.log(chalk.yellow('🔧 Troubleshooting steps:'));
      console.log('   1. Check API server logs for errors');
      console.log('   2. Verify RPC connectivity to Moksha testnet');
      console.log('   3. Ensure all dependencies are properly installed');
      console.log('   4. Review configuration settings');
    }
  }

  async cleanup(): Promise<void> {
    if (this.apiServer) {
      console.log(chalk.yellow('\n🧹 Cleaning up test environment...'));
      // Note: Express server cleanup would require proper server reference
      // For now, we'll let the process exit naturally
    }
  }
}

async function runMilestone2Test(): Promise<void> {
  console.log(chalk.bold.cyan('🏁 Starting Milestone 2: Single E2E Flow Test\n'));
  
  try {
    // Load configuration
    const config = await loadConfig();
    config.enableDebugLogs = true; // Enable debug logs for milestone testing
    
    console.log(chalk.cyan('📋 Test Configuration:'));
    console.log(`  RPC Endpoint: ${config.rpcEndpoint}`);
    console.log(`  Debug Logs: ${config.enableDebugLogs ? 'Enabled' : 'Disabled'}`);
    console.log(`  API Server Port: 3001`);
    console.log('');
    
    const test = new SingleE2ETest(config);
    
    // Step 1: Start API server
    await test.startApiServer();
    
    // Step 2: Execute E2E flow
    const result = await test.executeE2EFlow();
    
    // Step 3: Validate results
    const validationPassed = test.validateResults(result);
    
    // Step 4: Display summary
    test.displaySummary(result, validationPassed);
    
    // Step 5: Cleanup
    await test.cleanup();
    
    // Exit with appropriate code
    process.exit(validationPassed && result.success ? 0 : 1);
    
  } catch (error) {
    console.error(chalk.red('\n❌ Milestone 2 test failed:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// Run the test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMilestone2Test();
}

export { SingleE2ETest };
