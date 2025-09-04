/**
 * Load test configuration interface
 * All experimental parameters are configurable for flexible testing
 */
export interface LoadTestConfig {
  // Test Scale Parameters
  totalUsers: number;           // Total users to simulate (default: 12500)
  maxConcurrentUsers: number;   // Peak concurrent users (default: 1000)
  testDurationMinutes: number;  // Total test duration (default: 180)
  
  // Blockchain Configuration
  transactionTimeoutMs: number; // Transaction confirmation timeout (default: 60000)
  maxRetries: number;           // Max retries for failed transactions (default: 3)
  premiumGasMultiplier: number; // Gas price multiplier for load testing (default: 2.0)
  maxGasPrice: string;          // Maximum gas price in gwei (default: "100")
  gasLimit: number;             // Gas limit for transactions (default: 600000)
  
  // Load Pattern Parameters
  rampUpMinutes: number;        // Ramp up duration (default: 30)
  sustainMinutes: number;       // Sustained load duration (default: 120)
  rampDownMinutes: number;      // Ramp down duration (default: 30)
  
  // System Parameters
  maxWallets: number;           // Pre-generated wallets (default: 15000)
  rpcEndpoints: string[];       // Multiple RPC endpoints for load distribution
  walletFundingAmount: string;  // ETH amount per wallet (default: "0.1")
  
  // Debugging Parameters
  enableDebugLogs: boolean;     // Verbose logging (default: false)
  metricsInterval: number;      // Metrics collection interval in seconds (default: 30)
  failFast: boolean;           // Stop on first critical error (default: false)
  skipFundingCheck: boolean;    // Skip wallet funding check (for pre-funded wallets) (default: false)
  
  // Required secrets
  testWalletPrivateKey: string; // Funding wallet private key
  dataWalletAppAddress?: string; // Data wallet app address
  defaultGranteeId?: string;    // Default grantee ID
  
  // Real System Configuration
  personalServerUrl?: string;        // Personal server base URL (e.g., https://test.server.vana.com/api/v1)
  relayerPrivateKey?: string;        // Private key for gasless transaction relayer
  
  // Google Cloud Storage (PREFERRED - Service Account-based for server-side)
  googleCloudServiceAccountJson?: string;  // Google Cloud service account JSON string
  googleCloudStorageBucket?: string;       // GCS bucket name for file storage
  googleCloudFolderPrefix?: string;        // Optional: folder prefix for organizing files
  
  // Pinata IPFS Storage (Alternative)
  pinataJwt?: string;                // Pinata JWT token
  pinataGateway?: string;            // Pinata gateway URL (defaults to https://gateway.pinata.cloud)
}

/**
 * Test result interface
 */
export interface TestResult {
  success: boolean;
  duration: number;
  walletAddress: string;
  error?: string;
  transactionHash?: string;
  permissionId?: string;
  inferenceResult?: string;
}

/**
 * Load test metrics interface
 */
export interface LoadTestMetrics {
  blockchain: {
    transactionThroughput: number;
    gasUsage: bigint[];
    rpcLatency: number[];
    errorRate: number;
    successfulTransactions: number;
    failedTransactions: number;
  };
  storage: {
    uploadLatency: number[];
    uploadSuccessRate: number;
    storageQuotaUsed: number;
    totalUploads: number;
    failedUploads: number;
  };
  ai: {
    inferenceLatency: number[];
    queueDepth: number;
    modelAvailability: number;
    successfulInferences: number;
    failedInferences: number;
  };
  endToEnd: {
    flowCompletionTime: number[];
    successRate: number;
    userThroughput: number;
    totalFlows: number;
    completedFlows: number;
    failedFlows: number;
  };
  system: {
    memoryUsage: number[];
    cpuUsage: number[];
    networkLatency: number[];
    timestamp: number[];
  };
}

/**
 * Test preset configurations
 */
export type TestPreset = 'burst' | 'conservative' | 'custom';

/**
 * Artillery configuration interface
 */
export interface ArtilleryConfig {
  config: {
    target: string;
    phases: Array<{
      duration: string;
      arrivalRate: number;
    }>;
    processor?: string;
    variables?: Record<string, any>;
  };
  scenarios: Array<{
    name: string;
    weight: number;
    engine?: string;
    testFunction?: string;
  }>;
}
