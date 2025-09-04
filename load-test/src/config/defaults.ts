import type { LoadTestConfig } from './types.js';

/**
 * Default load test configuration
 * These values provide a reasonable starting point for testing
 */
export const DEFAULT_CONFIG: LoadTestConfig = {
  // Test Scale Parameters
  totalUsers: 12500,
  maxConcurrentUsers: 1000,
  testDurationMinutes: 180,
  
  // Blockchain Configuration
  transactionTimeoutMs: 180000, // 3 minutes (mainly for RPC delays)
  maxRetries: 3,
  premiumGasMultiplier: 4.0,    // 2x base gas for reliable confirmation
  maxGasPrice: "50",            // 50 gwei max (reasonable for load testing)
  gasLimit: 5000000,            // 5M gas limit to ensure complex transactions don't run out
  
  // Load Pattern Parameters
  rampUpMinutes: 30,
  sustainMinutes: 120,
  rampDownMinutes: 30,
  
  // System Parameters
  maxWallets: 15000, // Buffer for concurrent users
  rpcEndpoints: ["https://rpc.moksha.vana.org"], // Multiple endpoints for load distribution
  walletFundingAmount: "0.1",
  
  // Debugging Parameters
  enableDebugLogs: false,
  metricsInterval: 30, // 30 seconds
  failFast: false,
  skipFundingCheck: false,
  
  // Required secrets (must be provided via env vars or use defaults for testing)
  testWalletPrivateKey: process.env.TEST_WALLET_PRIVATE_KEY || "",
  dataWalletAppAddress: process.env.NEXT_PUBLIC_DATA_WALLET_APP_ADDRESS || "0x8325C0A0948483EdA023A1A2Fd895e62C5131234", // Moksha testnet DataPortabilityGrantees
  defaultGranteeId: process.env.NEXT_PUBLIC_DEFAULT_GRANTEE_ID || "1", // Default grantee ID for testing
  
  // Real System Configuration
  personalServerUrl: process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL,
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY,
  
  // Google Cloud Storage (Service Account-based for server-side)
  googleCloudServiceAccountJson: process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON,
  googleCloudStorageBucket: process.env.GOOGLE_CLOUD_STORAGE_BUCKET,
  googleCloudFolderPrefix: process.env.GOOGLE_CLOUD_FOLDER_PREFIX || 'vana-load-test',
  
  // Pinata IPFS Storage
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY,
};

/**
 * Burst test configuration - high concurrency for stress testing
 */
export const BURST_TEST_CONFIG: Partial<LoadTestConfig> = {
  totalUsers: 12500,
  maxConcurrentUsers: 1000,
  testDurationMinutes: 180,
  rampUpMinutes: 30,
  sustainMinutes: 120,
  rampDownMinutes: 30,
  enableDebugLogs: false,
};

/**
 * Conservative test configuration - lower load for validation
 */
export const CONSERVATIVE_TEST_CONFIG: Partial<LoadTestConfig> = {
  totalUsers: 5000,
  maxConcurrentUsers: 200,
  testDurationMinutes: 60,
  rampUpMinutes: 10,
  sustainMinutes: 40,
  rampDownMinutes: 10,
  enableDebugLogs: true,
};

/**
 * Debug test configuration - minimal load for development
 */
export const DEBUG_TEST_CONFIG: Partial<LoadTestConfig> = {
  totalUsers: 100,
  maxConcurrentUsers: 10,
  testDurationMinutes: 10,
  rampUpMinutes: 2,
  sustainMinutes: 6,
  rampDownMinutes: 2,
  enableDebugLogs: true,
  failFast: true,
};

/**
 * Get configuration by preset name
 */
export function getPresetConfig(preset: string): Partial<LoadTestConfig> {
  switch (preset.toLowerCase()) {
    case 'burst':
      return BURST_TEST_CONFIG;
    case 'conservative':
      return CONSERVATIVE_TEST_CONFIG;
    case 'debug':
      return DEBUG_TEST_CONFIG;
    default:
      return {};
  }
}
