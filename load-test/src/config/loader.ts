import { config } from 'dotenv';
import type { LoadTestConfig } from './types.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory and load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

// Load environment variables from .env file in project root
config({ path: join(projectRoot, '.env') });

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv(): LoadTestConfig {
  const envConfig: Partial<LoadTestConfig> = {};

  // Test Scale Parameters
  if (process.env.LOAD_TEST_TOTAL_USERS) {
    envConfig.totalUsers = parseInt(process.env.LOAD_TEST_TOTAL_USERS, 10);
  }
  if (process.env.LOAD_TEST_MAX_CONCURRENT) {
    envConfig.maxConcurrentUsers = parseInt(process.env.LOAD_TEST_MAX_CONCURRENT, 10);
  }
  if (process.env.LOAD_TEST_DURATION_MINUTES) {
    envConfig.testDurationMinutes = parseInt(process.env.LOAD_TEST_DURATION_MINUTES, 10);
  }

  // Load Pattern Parameters
  if (process.env.LOAD_TEST_RAMP_UP_MINUTES) {
    envConfig.rampUpMinutes = parseInt(process.env.LOAD_TEST_RAMP_UP_MINUTES, 10);
  }
  if (process.env.LOAD_TEST_SUSTAIN_MINUTES) {
    envConfig.sustainMinutes = parseInt(process.env.LOAD_TEST_SUSTAIN_MINUTES, 10);
  }
  if (process.env.LOAD_TEST_RAMP_DOWN_MINUTES) {
    envConfig.rampDownMinutes = parseInt(process.env.LOAD_TEST_RAMP_DOWN_MINUTES, 10);
  }

  // System Parameters
  if (process.env.LOAD_TEST_MAX_WALLETS) {
    envConfig.maxWallets = parseInt(process.env.LOAD_TEST_MAX_WALLETS, 10);
  }
  if (process.env.LOAD_TEST_RPC_ENDPOINT) {
    envConfig.rpcEndpoint = process.env.LOAD_TEST_RPC_ENDPOINT;
  }
  if (process.env.LOAD_TEST_RPC_ENDPOINTS) {
    envConfig.rpcEndpoints = process.env.LOAD_TEST_RPC_ENDPOINTS.split(',').map(url => url.trim());
  }
  if (process.env.LOAD_TEST_WALLET_FUNDING_AMOUNT) {
    envConfig.walletFundingAmount = process.env.LOAD_TEST_WALLET_FUNDING_AMOUNT;
  }

  // Debugging Parameters
  if (process.env.LOAD_TEST_ENABLE_DEBUG) {
    envConfig.enableDebugLogs = process.env.LOAD_TEST_ENABLE_DEBUG === 'true';
  }
  if (process.env.LOAD_TEST_METRICS_INTERVAL) {
    envConfig.metricsInterval = parseInt(process.env.LOAD_TEST_METRICS_INTERVAL, 10);
  }
  if (process.env.LOAD_TEST_FAIL_FAST) {
    envConfig.failFast = process.env.LOAD_TEST_FAIL_FAST === 'true';
  }

  // Required secrets
  if (process.env.TEST_WALLET_PRIVATE_KEY) {
    envConfig.testWalletPrivateKey = process.env.TEST_WALLET_PRIVATE_KEY;
  }
  if (process.env.NEXT_PUBLIC_DATA_WALLET_APP_ADDRESS) {
    envConfig.dataWalletAppAddress = process.env.NEXT_PUBLIC_DATA_WALLET_APP_ADDRESS;
  }
  if (process.env.NEXT_PUBLIC_DEFAULT_GRANTEE_ID) {
    envConfig.defaultGranteeId = process.env.NEXT_PUBLIC_DEFAULT_GRANTEE_ID;
  }

  // Real system configuration
  if (process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL) {
    envConfig.personalServerUrl = process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL;
  }
  if (process.env.RELAYER_PRIVATE_KEY) {
    envConfig.relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
  }

  // Google Cloud Storage (Service Account-based)
  if (process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON) {
    envConfig.googleCloudServiceAccountJson = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON;
  }
  if (process.env.GOOGLE_CLOUD_STORAGE_BUCKET) {
    envConfig.googleCloudStorageBucket = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
  }
  if (process.env.GOOGLE_CLOUD_FOLDER_PREFIX) {
    envConfig.googleCloudFolderPrefix = process.env.GOOGLE_CLOUD_FOLDER_PREFIX;
  }

  // Pinata IPFS storage
  if (process.env.PINATA_JWT) {
    envConfig.pinataJwt = process.env.PINATA_JWT;
  }
  if (process.env.PINATA_GATEWAY) {
    envConfig.pinataGateway = process.env.PINATA_GATEWAY;
  }

  return { ...DEFAULT_CONFIG, ...envConfig };
}

/**
 * Merge configuration with overrides
 */
export function mergeConfig(
  baseConfig: LoadTestConfig, 
  overrides: Partial<LoadTestConfig>
): LoadTestConfig {
  return { ...baseConfig, ...overrides };
}

/**
 * Validate configuration
 */
export function validateConfig(config: LoadTestConfig): void {
  const errors: string[] = [];

  // Required fields
  if (!config.testWalletPrivateKey) {
    errors.push('TEST_WALLET_PRIVATE_KEY is required');
  }

  // Validate numeric values
  if (config.totalUsers <= 0) {
    errors.push('totalUsers must be greater than 0');
  }
  if (config.maxConcurrentUsers <= 0) {
    errors.push('maxConcurrentUsers must be greater than 0');
  }
  if (config.maxConcurrentUsers > config.maxWallets) {
    errors.push('maxConcurrentUsers cannot exceed maxWallets');
  }

  // Validate timing
  const totalTime = config.rampUpMinutes + config.sustainMinutes + config.rampDownMinutes;
  if (totalTime !== config.testDurationMinutes) {
    errors.push(`Total time (${totalTime}min) must equal testDurationMinutes (${config.testDurationMinutes}min)`);
  }

  // Validate RPC endpoint
  try {
    new URL(config.rpcEndpoint);
  } catch {
    errors.push('rpcEndpoint must be a valid URL');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Create configuration from CLI arguments
 */
export function createConfigFromArgs(args: Record<string, any>): Partial<LoadTestConfig> {
  const config: Partial<LoadTestConfig> = {};

  if (args.concurrent) config.maxConcurrentUsers = parseInt(args.concurrent, 10);
  if (args.total) config.totalUsers = parseInt(args.total, 10);
  if (args.duration) config.testDurationMinutes = parseInt(args.duration, 10);
  if (args.rampUp) config.rampUpMinutes = parseInt(args.rampUp, 10);
  if (args.sustain) config.sustainMinutes = parseInt(args.sustain, 10);
  if (args.rampDown) config.rampDownMinutes = parseInt(args.rampDown, 10);
  if (args.debug !== undefined) config.enableDebugLogs = args.debug;
  if (args.failFast !== undefined) config.failFast = args.failFast;
  if (args.rpc) config.rpcEndpoint = args.rpc;

  return config;
}

/**
 * Main configuration loader - loads from environment with validation
 */
export async function loadConfig(): Promise<LoadTestConfig> {
  const config = loadConfigFromEnv();
  // Skip validation for basic usage - only validate when required fields are needed
  return config;
}

/**
 * Get preset configurations
 */
export async function getPresetConfig(preset: 'burst' | 'conservative' | 'debug'): Promise<LoadTestConfig> {
  const baseConfig = await loadConfig();
  
  switch (preset) {
    case 'burst':
      return mergeConfig(baseConfig, {
        totalUsers: 12500,
        maxConcurrentUsers: 1000,
        testDurationMinutes: 180,
        rampUpMinutes: 30,
        sustainMinutes: 120,
        rampDownMinutes: 30,
        enableDebugLogs: false,
        failFast: false,
      });
      
    case 'conservative':
      return mergeConfig(baseConfig, {
        totalUsers: 5000,
        maxConcurrentUsers: 200,
        testDurationMinutes: 60,
        rampUpMinutes: 10,
        sustainMinutes: 40,
        rampDownMinutes: 10,
        enableDebugLogs: false,
        failFast: false,
      });
      
    case 'debug':
      return mergeConfig(baseConfig, {
        totalUsers: 50,
        maxConcurrentUsers: 10,
        testDurationMinutes: 5,
        rampUpMinutes: 1,
        sustainMinutes: 3,
        rampDownMinutes: 1,
        enableDebugLogs: true,
        failFast: true,
      });
      
    default:
      throw new Error(`Unknown preset: ${preset}`);
  }
}
