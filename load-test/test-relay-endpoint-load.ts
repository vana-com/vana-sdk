#!/usr/bin/env tsx
/**
 * Load test for relay endpoint
 * Constructs mock requests and submits them directly to the relay endpoint
 */

import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { mokshaTestnet } from '@opendatalabs/vana-sdk/chains';
import { getAbi } from '@opendatalabs/vana-sdk/node';
import chalk from 'chalk';
import { loadConfig } from './src/config/loader.js';

// Contract address for DataPortabilityPermissions on Moksha testnet
const DATA_PORTABILITY_PERMISSIONS_ADDRESS = '0xD54523048AdD05b4d734aFaE7C68324Ebb7373eF' as `0x${string}`;

interface LoadTestConfig {
  users: number;
  concurrency: number;
  delayBetweenRequests: number; // ms
  relayEndpointUrl: string;
  verbose: boolean;
  consistentRate?: boolean; // Use consistent rate mode
  rateWindow?: number; // Time window for rate limiting in ms (default: 10000)
}

interface TestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  responseTimes: number[];
  startTime: number;
  endTime: number;
  errors: Map<string, number>;
}

class RelayEndpointLoadTest {
  private config: LoadTestConfig;
  private metrics: TestMetrics;
  private publicClient: any;
  private relayerAddress: string;

  constructor(config: LoadTestConfig, relayerAddress: string) {
    this.config = config;
    this.relayerAddress = relayerAddress;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      responseTimes: [],
      startTime: Date.now(),
      endTime: 0,
      errors: new Map(),
    };

    // Create public client for reading blockchain state
    const rpcUrl = process.env.RPC_URL || 'https://rpc.moksha.vana.org';
    this.publicClient = createPublicClient({
      chain: mokshaTestnet,
      transport: http(rpcUrl),
    });
  }

  /**
   * Generate a mock relay request for a random user
   */
  async generateMockRequest(userId: number): Promise<any> {
    // Generate a random user wallet
    const userPrivateKey = generatePrivateKey();
    const userAccount = privateKeyToAccount(userPrivateKey);
    const userWallet = createWalletClient({
      account: userAccount,
      chain: mokshaTestnet,
      transport: http(),
    });

    // Get current nonce for the user (will be 0 for new random wallets)
    const DataPortabilityPermissionsAbi = getAbi('DataPortabilityPermissions');
    const currentNonce = await this.publicClient.readContract({
      address: DATA_PORTABILITY_PERMISSIONS_ADDRESS,
      abi: DataPortabilityPermissionsAbi,
      functionName: 'userNonce',
      args: [userAccount.address],
    }) as bigint;

    // Mock transaction data
    const mockTransactionData = {
      granteeId: BigInt(1), // Default grantee ID
      grant: `https://mock-storage.example.com/grant-${userId}-${Date.now()}.json`,
      fileUrls: [`https://mock-storage.example.com/data-${userId}-${Date.now()}.json`],
      schemaIds: [BigInt(1)], // Skip validation
      serverAddress: '0x' + '1234567890abcdef'.repeat(5).substring(0, 40) as `0x${string}`,
      serverUrl: `https://mock-server-${userId}.example.com`,
      serverPublicKey: `MockPublicKey_User${userId}_${Date.now()}`,
      filePermissions: [
        [
          {
            account: '0x' + '1234567890abcdef'.repeat(5).substring(0, 40) as `0x${string}`,
            key: `MockEncryptedKey_${userId}_${Date.now()}`,
          },
        ],
      ],
    };

    // Create EIP-712 typed data
    const chainId = await this.publicClient.getChainId();
    const domain = {
      name: 'VanaDataPortabilityPermissions',
      version: '1',
      chainId: Number(chainId),
      verifyingContract: DATA_PORTABILITY_PERMISSIONS_ADDRESS,
    };

    const types = {
      Permission: [
        { name: 'account', type: 'address' },
        { name: 'key', type: 'string' },
      ],
      ServerFilesAndPermission: [
        { name: 'nonce', type: 'uint256' },
        { name: 'granteeId', type: 'uint256' },
        { name: 'grant', type: 'string' },
        { name: 'fileUrls', type: 'string[]' },
        { name: 'schemaIds', type: 'uint256[]' },
        { name: 'serverAddress', type: 'address' },
        { name: 'serverUrl', type: 'string' },
        { name: 'serverPublicKey', type: 'string' },
        { name: 'filePermissions', type: 'Permission[][]' },
      ],
    };

    const message = {
      nonce: currentNonce,
      ...mockTransactionData,
    };

    const typedData = {
      domain,
      types,
      primaryType: 'ServerFilesAndPermission' as const,
      message,
    };

    // Sign the typed data
    const signature = await userWallet.signTypedData({
      account: userAccount,
      domain,
      types,
      primaryType: 'ServerFilesAndPermission',
      message,
    });

    // Construct the relay request
    return {
      type: 'signed',
      operation: 'submitAddServerFilesAndPermissions',
      typedData,
      signature,
      expectedUserAddress: userAccount.address,
      // Add metadata for tracking
      metadata: {
        userId,
        userAddress: userAccount.address,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Convert BigInts to strings in nested objects for JSON serialization
   */
  private convertBigIntsToStrings(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'bigint') {
      return obj.toString();
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.convertBigIntsToStrings(item));
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          result[key] = this.convertBigIntsToStrings(obj[key]);
        }
      }
      return result;
    }

    return obj;
  }

  /**
   * Submit a request to the relay endpoint
   */
  async submitToRelayEndpoint(request: any): Promise<{ success: boolean; responseTime: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Convert BigInts to strings for JSON serialization
      const serializableRequest = this.convertBigIntsToStrings(request);

      const response = await fetch(this.config.relayEndpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(serializableRequest),
      });

      const responseTime = Date.now() - startTime;
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseData.error || responseData.message || 'Unknown error'}`);
      }

      return {
        success: true,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        responseTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Process a single user's request
   */
  async processUser(userId: number): Promise<void> {
    try {
      if (this.config.verbose) {
        console.log(chalk.gray(`[User ${userId}] Generating mock request...`));
      }

      // Generate mock request
      const request = await this.generateMockRequest(userId);

      if (this.config.verbose) {
        console.log(chalk.gray(`[User ${userId}] Submitting to relay endpoint...`));
      }

      // Submit to relay endpoint
      const result = await this.submitToRelayEndpoint(request);

      // Update metrics
      this.metrics.totalRequests++;
      this.metrics.responseTimes.push(result.responseTime);
      this.metrics.minResponseTime = Math.min(this.metrics.minResponseTime, result.responseTime);
      this.metrics.maxResponseTime = Math.max(this.metrics.maxResponseTime, result.responseTime);

      if (result.success) {
        this.metrics.successfulRequests++;
        if (this.config.verbose) {
          console.log(chalk.green(`[User ${userId}] ✅ Success (${result.responseTime}ms)`));
        }
      } else {
        this.metrics.failedRequests++;
        const errorKey = result.error || 'Unknown error';
        this.metrics.errors.set(errorKey, (this.metrics.errors.get(errorKey) || 0) + 1);
        if (this.config.verbose) {
          console.log(chalk.red(`[User ${userId}] ❌ Failed: ${result.error} (${result.responseTime}ms)`));
        }
      }
    } catch (error) {
      this.metrics.failedRequests++;
      this.metrics.totalRequests++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.metrics.errors.set(errorMessage, (this.metrics.errors.get(errorMessage) || 0) + 1);

      if (this.config.verbose) {
        console.log(chalk.red(`[User ${userId}] ❌ Error: ${errorMessage}`));
      }
    }
  }

  /**
   * Run the load test
   */
  async run(): Promise<void> {
    console.log(chalk.cyan.bold('\n🚀 Starting Relay Endpoint Load Test'));
    console.log(chalk.white('━'.repeat(50)));
    console.log(chalk.white(`📍 Endpoint: ${this.config.relayEndpointUrl}`));
    console.log(chalk.white(`👥 Users: ${this.config.users}`));
    console.log(chalk.white(`🔄 Concurrency: ${this.config.concurrency}`));

    if (this.config.consistentRate) {
      const rateWindow = this.config.rateWindow || 10000;
      const requestsPerWindow = this.config.concurrency;
      console.log(chalk.white(`📊 Mode: Consistent Rate`));
      console.log(chalk.white(`📈 Rate: ${requestsPerWindow} requests per ${rateWindow/1000}s`));
    } else {
      console.log(chalk.white(`📊 Mode: Batch`));
      console.log(chalk.white(`⏱️  Delay: ${this.config.delayBetweenRequests}ms`));
    }

    console.log(chalk.white(`🔧 Relayer: ${this.relayerAddress}`));
    console.log(chalk.white('━'.repeat(50) + '\n'));

    this.metrics.startTime = Date.now();

    if (this.config.consistentRate) {
      await this.runConsistentRate();
    } else {
      await this.runBatchMode();
    }

    this.metrics.endTime = Date.now();
    this.printResults();
  }

  /**
   * Run in batch mode (original implementation)
   */
  private async runBatchMode(): Promise<void> {
    // Create batches based on concurrency
    const batches: number[][] = [];
    for (let i = 0; i < this.config.users; i += this.config.concurrency) {
      const batch = [];
      for (let j = i; j < Math.min(i + this.config.concurrency, this.config.users); j++) {
        batch.push(j);
      }
      batches.push(batch);
    }

    // Process batches
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(chalk.yellow(`\n📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} users)`));

      // Process users in parallel within each batch
      const promises = batch.map(userId => this.processUser(userId));
      await Promise.all(promises);

      // Add delay between batches (except for the last batch)
      if (batchIndex < batches.length - 1 && this.config.delayBetweenRequests > 0) {
        if (!this.config.verbose) {
          console.log(chalk.gray(`   Waiting ${this.config.delayBetweenRequests}ms before next batch...`));
        }
        await new Promise(resolve => setTimeout(resolve, this.config.delayBetweenRequests));
      }

      // Show progress
      const progress = Math.round(((batchIndex + 1) / batches.length) * 100);
      console.log(chalk.cyan(`   Progress: ${progress}%`));
    }
  }

  /**
   * Run with consistent rate (e.g., 100 requests per 10 seconds)
   */
  private async runConsistentRate(): Promise<void> {
    const rateWindow = this.config.rateWindow || 10000; // Default 10 seconds
    const requestsPerWindow = this.config.concurrency; // Use concurrency as requests per window
    const delayBetweenRequests = rateWindow / requestsPerWindow;

    console.log(chalk.yellow(`\n📊 Sending ${this.config.users} requests at consistent rate`));
    console.log(chalk.gray(`   Rate: ${requestsPerWindow} requests per ${rateWindow/1000} seconds`));
    console.log(chalk.gray(`   Delay between requests: ${delayBetweenRequests.toFixed(0)}ms\n`));

    let userId = 0;
    const totalWindows = Math.ceil(this.config.users / requestsPerWindow);

    for (let windowIndex = 0; windowIndex < totalWindows; windowIndex++) {
      const windowStart = Date.now();
      const requestsInThisWindow = Math.min(requestsPerWindow, this.config.users - userId);

      console.log(chalk.yellow(`⏱️  Window ${windowIndex + 1}/${totalWindows}: ${requestsInThisWindow} requests over ${rateWindow/1000}s`));

      // Create an array to track when each request should be sent
      const requestSchedule: Array<{userId: number, sendTime: number}> = [];

      for (let i = 0; i < requestsInThisWindow; i++) {
        requestSchedule.push({
          userId: userId++,
          sendTime: windowStart + (i * delayBetweenRequests)
        });
      }

      // Send requests at their scheduled times
      const activeRequests: Promise<void>[] = [];

      for (const scheduled of requestSchedule) {
        // Calculate how long to wait before sending this request
        const now = Date.now();
        const waitTime = Math.max(0, scheduled.sendTime - now);

        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // Send the request without waiting for completion
        const requestPromise = this.processUser(scheduled.userId);
        activeRequests.push(requestPromise);

        // Show mini progress for verbose mode
        if (this.config.verbose && (activeRequests.length % 10 === 0 || activeRequests.length === requestsInThisWindow)) {
          const windowProgress = Math.round((activeRequests.length / requestsInThisWindow) * 100);
          console.log(chalk.gray(`   Window progress: ${activeRequests.length}/${requestsInThisWindow} requests sent (${windowProgress}%)`));
        }
      }

      // Calculate how much time is left in the window
      const timeUsedForSending = Date.now() - windowStart;
      const timeRemainingInWindow = Math.max(0, rateWindow - timeUsedForSending);

      console.log(chalk.gray(`   All ${requestsInThisWindow} requests sent. Waiting for completions...`));

      // Wait for either all requests to complete OR the window to end
      const waitForRequests = Promise.all(activeRequests);
      const waitForWindow = new Promise(resolve => setTimeout(resolve, timeRemainingInWindow));

      await Promise.race([
        waitForRequests.then(() => console.log(chalk.green(`   ✓ All requests completed`))),
        waitForWindow.then(() => console.log(chalk.yellow(`   ⏱️ Window time elapsed (some requests may still be pending)`)))
      ]);

      // Ensure we've used the full window time
      const totalWindowTime = Date.now() - windowStart;
      if (totalWindowTime < rateWindow && userId < this.config.users) {
        const finalWait = rateWindow - totalWindowTime;
        console.log(chalk.gray(`   Waiting ${finalWait}ms to complete window...`));
        await new Promise(resolve => setTimeout(resolve, finalWait));
      }

      // Show window summary
      const actualWindowTime = Date.now() - windowStart;
      const progress = Math.round((userId / this.config.users) * 100);
      console.log(chalk.cyan(`   Window ${windowIndex + 1} complete: ${actualWindowTime}ms elapsed | Overall progress: ${progress}%\n`));
    }

    // Wait for any remaining requests to complete
    console.log(chalk.yellow('Waiting for any remaining requests to complete...'));
    await new Promise(resolve => setTimeout(resolve, 2000)); // Give a bit more time for stragglers
  }

  /**
   * Print test results
   */
  private printResults(): void {
    const duration = (this.metrics.endTime - this.metrics.startTime) / 1000;
    const avgResponseTime = this.metrics.responseTimes.length > 0
      ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
      : 0;

    console.log(chalk.cyan.bold('\n📊 Test Results'));
    console.log(chalk.white('━'.repeat(50)));

    // Summary
    console.log(chalk.white('\n📈 Summary:'));
    console.log(chalk.white(`   Total Requests: ${this.metrics.totalRequests}`));
    console.log(chalk.green(`   ✅ Successful: ${this.metrics.successfulRequests} (${Math.round((this.metrics.successfulRequests / this.metrics.totalRequests) * 100)}%)`));
    console.log(chalk.red(`   ❌ Failed: ${this.metrics.failedRequests} (${Math.round((this.metrics.failedRequests / this.metrics.totalRequests) * 100)}%)`));
    console.log(chalk.white(`   Duration: ${duration.toFixed(2)}s`));
    console.log(chalk.white(`   Throughput: ${(this.metrics.totalRequests / duration).toFixed(2)} req/s`));

    // Response times
    console.log(chalk.white('\n⏱️  Response Times:'));
    console.log(chalk.white(`   Average: ${avgResponseTime.toFixed(2)}ms`));
    console.log(chalk.white(`   Min: ${this.metrics.minResponseTime === Infinity ? 0 : this.metrics.minResponseTime}ms`));
    console.log(chalk.white(`   Max: ${this.metrics.maxResponseTime}ms`));

    // Calculate percentiles
    if (this.metrics.responseTimes.length > 0) {
      const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];

      console.log(chalk.white(`   P50: ${p50}ms`));
      console.log(chalk.white(`   P95: ${p95}ms`));
      console.log(chalk.white(`   P99: ${p99}ms`));
    }

    // Errors
    if (this.metrics.errors.size > 0) {
      console.log(chalk.red('\n❌ Errors:'));
      const sortedErrors = Array.from(this.metrics.errors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5 errors

      sortedErrors.forEach(([error, count]) => {
        const truncatedError = error.length > 60 ? error.substring(0, 60) + '...' : error;
        console.log(chalk.red(`   ${count}x: ${truncatedError}`));
      });

      if (this.metrics.errors.size > 5) {
        console.log(chalk.gray(`   ... and ${this.metrics.errors.size - 5} more error types`));
      }
    }

    console.log(chalk.white('\n' + '━'.repeat(50)));
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): LoadTestConfig {
  const args = process.argv.slice(2);
  const config: LoadTestConfig = {
    users: 10,
    concurrency: 5,
    delayBetweenRequests: 100,
    relayEndpointUrl: process.env.RELAY_ENDPOINT_URL || 'http://localhost:3082/api/relay',
    verbose: false,
    consistentRate: false,
    rateWindow: 10000,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--users':
      case '-u':
        config.users = parseInt(args[++i], 10);
        break;
      case '--concurrency':
      case '-c':
        config.concurrency = parseInt(args[++i], 10);
        break;
      case '--delay':
      case '-d':
        config.delayBetweenRequests = parseInt(args[++i], 10);
        break;
      case '--endpoint':
      case '-e':
        config.relayEndpointUrl = args[++i];
        break;
      case '--consistent-rate':
      case '--rate':
        config.consistentRate = true;
        break;
      case '--rate-window':
      case '-w':
        config.rateWindow = parseInt(args[++i], 10);
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(chalk.cyan.bold('\n📚 Relay Endpoint Load Test'));
  console.log(chalk.white('\nUsage: ./test-relay-endpoint-load.ts [options]'));
  console.log(chalk.white('\nOptions:'));
  console.log(chalk.white('  -u, --users <n>         Number of users to simulate (default: 10)'));
  console.log(chalk.white('  -c, --concurrency <n>   Number of concurrent requests (default: 5)'));
  console.log(chalk.white('                          In consistent rate mode: requests per window'));
  console.log(chalk.white('  -d, --delay <ms>        Delay between batches in ms (default: 100)'));
  console.log(chalk.white('  -e, --endpoint <url>    Relay endpoint URL (default: from .env)'));
  console.log(chalk.white('  --consistent-rate       Use consistent rate mode'));
  console.log(chalk.white('  -w, --rate-window <ms>  Time window for rate limiting (default: 10000ms)'));
  console.log(chalk.white('  -v, --verbose          Show detailed logs for each request'));
  console.log(chalk.white('  -h, --help             Show this help message'));
  console.log(chalk.white('\nEnvironment Variables:'));
  console.log(chalk.white('  RELAY_ENDPOINT_URL      Default relay endpoint URL'));
  console.log(chalk.white('  RELAYER_PRIVATE_KEY    Private key for relayer wallet'));
  console.log(chalk.white('  RPC_URL                RPC endpoint (default: https://rpc.moksha.vana.org)'));
  console.log(chalk.white('\nExamples:'));
  console.log(chalk.gray('  # Basic batch test with 50 users'));
  console.log(chalk.white('  ./test-relay-endpoint-load.ts --users 50 --concurrency 10'));
  console.log(chalk.gray('\n  # Consistent rate: 100 requests per 10 seconds'));
  console.log(chalk.white('  ./test-relay-endpoint-load.ts --users 500 --concurrency 100 --consistent-rate'));
  console.log(chalk.gray('\n  # Consistent rate: 50 requests per 5 seconds'));
  console.log(chalk.white('  ./test-relay-endpoint-load.ts --users 200 --concurrency 50 --consistent-rate --rate-window 5000'));
  console.log(chalk.gray('\n  # Stress test with high concurrency'));
  console.log(chalk.white('  ./test-relay-endpoint-load.ts --users 100 --concurrency 50 --delay 0'));
}

/**
 * Main function
 */
async function main() {
  try {
    // Parse arguments
    const config = parseArgs();

    // Load environment configuration
    const envConfig = await loadConfig();

    // Get relayer address (for display only, not used in requests)
    const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY || envConfig.masterRelayerPrivateKey;
    if (!relayerPrivateKey) {
      console.log(chalk.yellow('⚠️  Warning: No relayer private key configured'));
      console.log(chalk.yellow('   The test will generate mock requests but the relay endpoint'));
      console.log(chalk.yellow('   needs to have its own configured relayer wallet.\n'));
    }

    const relayerAddress = relayerPrivateKey
      ? privateKeyToAccount(relayerPrivateKey as `0x${string}`).address
      : 'Not configured';

    // Run load test
    const test = new RelayEndpointLoadTest(config, relayerAddress);
    await test.run();

    console.log(chalk.green('\n✅ Load test completed successfully!\n'));

  } catch (error) {
    console.error(chalk.red('\n❌ Load test failed:'), error);
    if (error instanceof Error) {
      console.error(chalk.red('   Error:', error.message));
      if (error.stack && process.env.DEBUG) {
        console.error(chalk.gray('   Stack:', error.stack));
      }
    }
    process.exit(1);
  }
}

// Run the load test
main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});