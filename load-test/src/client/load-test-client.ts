import { Vana } from '@opendatalabs/vana-sdk/node';
import type { StorageProvider, StorageUploadResult, StorageFile, StorageListOptions, StorageProviderConfig } from '@opendatalabs/vana-sdk/node';
import { PinataStorage } from '@opendatalabs/vana-sdk/node';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, type WalletClient, type Account, formatEther } from 'viem';
import { mokshaTestnet } from '@opendatalabs/vana-sdk/chains';
import type { LoadTestConfig, TestResult } from '../config/types.js';
import { DataPortabilityFlow } from './data-portability-flow.js';
import { GoogleCloudStorage } from '../storage/google-cloud-storage.js';
import { WalletFunder, ESTIMATED_GAS_COSTS } from '../utils/wallet-funding.js';
import { globalErrorTracker } from '../utils/error-tracker.js';
import chalk from 'chalk';



/**
 * Create storage providers based on configuration
 * Supports Google Cloud Storage, Pinata, or falls back to mock for testing
 */
async function createStorageProviders(config: LoadTestConfig): Promise<Record<string, StorageProvider>> {
  const providers: Record<string, StorageProvider> = {};

  // Google Cloud Storage (preferred - service account based)
  if (config.googleCloudServiceAccountJson && config.googleCloudStorageBucket) {
    if (config.enableDebugLogs) {
      console.log('[Storage] Configuring Google Cloud Storage with service account');
    }
    
    try {
      providers['google-cloud-storage'] = new GoogleCloudStorage({
        serviceAccountJson: config.googleCloudServiceAccountJson,
        bucketName: config.googleCloudStorageBucket,
        folderPrefix: config.googleCloudFolderPrefix || 'vana-load-test',
        enableDebugLogs: config.enableDebugLogs,
      });
    } catch (error) {
      console.error('[Storage] Failed to configure Google Cloud Storage:', error);
      if (config.enableDebugLogs) {
        console.warn('[Storage] Falling back to other storage providers');
      }
    }
  }

  // Pinata IPFS Storage (alternative)
  if (config.pinataJwt) {
    if (config.enableDebugLogs) {
      console.log('[Storage] Configuring Pinata IPFS storage');
    }
    providers['pinata'] = new PinataStorage({
      jwt: config.pinataJwt,
      gatewayUrl: config.pinataGateway || 'https://gateway.pinata.cloud',
    });
  }

  // Fallback to mock storage if no real providers configured
  if (Object.keys(providers).length === 0) {
    if (process.env.NODE_ENV === 'production' || process.env.FORCE_REAL_SYSTEMS === 'true') {
      throw new Error('❌ REAL SYSTEMS REQUIRED: Configure GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON and GOOGLE_CLOUD_STORAGE_BUCKET for load testing');
    }
    
    if (config.enableDebugLogs) {
      console.warn('[Storage] No real storage providers configured, using mock storage');
      console.warn('[Storage] For real storage, configure GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON and GOOGLE_CLOUD_STORAGE_BUCKET');
    }
    providers['mock'] = new MockStorageProvider();
  }

  return providers;
}

/**
 * Mock storage provider for load testing fallback
 * Only used when no real storage providers are configured
 */
class MockStorageProvider implements StorageProvider {
  private mockFiles = new Map<string, { blob: Blob; filename: string; uploadTime: number }>();

  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    // Simulate upload delay (disabled for load testing)
    // await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    const mockUrl = `mock://storage/${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const finalFilename = filename || `file-${Date.now()}.dat`;
    
    // Store file data for potential download
    this.mockFiles.set(mockUrl, {
      blob: file,
      filename: finalFilename,
      uploadTime: Date.now(),
    });
    
    return {
      url: mockUrl,
      size: file.size,
      contentType: file.type || 'application/octet-stream',
    };
  }

  async download(url: string): Promise<Blob> {
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    const fileData = this.mockFiles.get(url);
    if (!fileData) {
      throw new Error(`File not found: ${url}`);
    }
    return fileData.blob;
  }

  async list(options?: StorageListOptions): Promise<StorageFile[]> {
    const files: StorageFile[] = [];
    for (const [url, data] of this.mockFiles.entries()) {
      files.push({
        id: url.split('/').pop() || url,
        name: data.filename,
        url,
        size: data.blob.size,
        contentType: data.blob.type || 'application/octet-stream',
        createdAt: new Date(data.uploadTime),
        metadata: { uploadTime: data.uploadTime, mock: true },
      });
    }
    const limit = options?.limit || files.length;
    const offset = typeof options?.offset === 'number' ? options.offset : 0;
    return files.slice(offset, offset + limit);
  }

  async delete(url: string): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return this.mockFiles.delete(url);
  }

  getConfig(): StorageProviderConfig {
    return {
      name: 'mock-storage',
      type: 'mock',
      requiresAuth: false,
      features: { upload: true, download: true, list: true, delete: true },
    };
  }
}

/**
 * VanaLoadTestClient - Executes end-to-end data portability flows for load testing
 * 
 * This class simulates the complete user journey from the Vana Vibes demo:
 * 1. Data encryption with wallet signature
 * 2. Storage upload (Google Drive/Pinata)
 * 3. Blockchain transaction execution
 * 4. AI inference request submission
 * 5. Result polling and retrieval
 */
export class VanaLoadTestClient {
  private vana: any; // VanaInstance from SDK
  private walletClient: WalletClient;
  private publicClient: any;
  private config: LoadTestConfig;
  private account: Account;
  private walletFunder?: WalletFunder;


  private constructor(privateKey: string, config: LoadTestConfig, storageProviders: Record<string, StorageProvider>) {
    this.config = config;
    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    
    // Create viem clients
    this.publicClient = createPublicClient({
      chain: mokshaTestnet,
      transport: http(config.rpcEndpoint),
    });

    this.walletClient = createWalletClient({
      chain: mokshaTestnet,
      transport: http(config.rpcEndpoint),
      account: this.account,
    });
    
    // Determine the default provider (prefer real storage over mock)
    const defaultProvider = storageProviders['google-cloud-storage'] ? 'google-cloud-storage' 
      : storageProviders['pinata'] ? 'pinata' 
      : 'mock';
    
    // Initialize Vana SDK instance with storage configuration
    this.vana = Vana({ 
      walletClient: this.walletClient as any, // Type assertion for VanaChain compatibility
      storage: {
        providers: storageProviders,
        defaultProvider,
      },
      defaultPersonalServerUrl: config.personalServerUrl || 'http://localhost:3001',
    });

    // Initialize wallet funder if relayer private key is provided
    if (config.relayerPrivateKey) {
      try {
        this.walletFunder = new WalletFunder(config);
        if (config.enableDebugLogs) {
          console.log(`[LoadTestClient] Wallet funder initialized`);
        }
      } catch (error) {
        if (config.enableDebugLogs) {
          console.warn(`[LoadTestClient] Failed to initialize wallet funder: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    if (config.enableDebugLogs) {
      console.log(`[LoadTestClient] Initialized for wallet: ${this.account.address}`);
    }
  }

  /**
   * Create a new VanaLoadTestClient instance with async storage provider setup
   */
  static async create(privateKey: string, config: LoadTestConfig): Promise<VanaLoadTestClient> {
    // Initialize storage providers (async)
    const storageProviders = await createStorageProviders(config);
    
    // Create and return the client
    return new VanaLoadTestClient(privateKey, config, storageProviders);
  }



  /**
   * Execute the complete data portability flow
   * Uses the real DataPortabilityFlow from vana-vibes-demo
   */
  async executeDataPortabilityFlow(
    userData: string,
    prompt: string,
    testId: string,
    serverUrl: string = 'http://localhost:3001' // Default to load test server
  ): Promise<TestResult> {
    const startTime = Date.now();
    const walletAddress = this.account.address;

    try {
      if (this.config.enableDebugLogs) {
        console.log(`[${testId}] Starting E2E flow for wallet: ${walletAddress}`);
      }

      // Check wallet balance and fund if needed (unless skipped for pre-funded wallets)
      if (!this.config.skipFundingCheck) {
        const balanceCheck = await this.checkWalletBalance();
        if (this.config.enableDebugLogs) {
          console.log(`[${testId}] Current balance: ${balanceCheck.balanceFormatted} VANA (${balanceCheck.estimatedTransactions} transactions)`);
        }

        if (balanceCheck.needsFunding) {
          if (this.config.enableDebugLogs) {
            console.log(`[${testId}] Wallet needs funding (balance: ${balanceCheck.balanceFormatted} VANA < ${formatEther(ESTIMATED_GAS_COSTS.MIN_BALANCE_THRESHOLD)} VANA threshold)`);
          }
          
          const fundingResult = await this.ensureFunding();
          if (fundingResult.funded) {
            if (this.config.enableDebugLogs) {
              console.log(`[${testId}] ✅ Wallet funded successfully`);
              console.log(`[${testId}] Balance: ${fundingResult.balanceBefore} → ${fundingResult.balanceAfter} VANA`);
              if (fundingResult.txHash) {
                console.log(`[${testId}] Funding tx: ${fundingResult.txHash}`);
              }
            }
          } else {
            const error = `Wallet funding failed: ${fundingResult.error}`;
            if (this.config.enableDebugLogs) {
              console.error(`[${testId}] ❌ ${error}`);
            }
            throw new Error(error);
          }
        }
      } else if (this.config.enableDebugLogs) {
        console.log(`[${testId}] ⏭️  Skipping funding check (using pre-funded wallet)`);
      }

      // Create the data portability flow instance
      const flow = new DataPortabilityFlow(
        this.vana,
        this.walletClient,
        this.createCallbacks(testId),
        testId,
        {
          dataWalletAppAddress: this.config.dataWalletAppAddress,
          defaultGranteeId: this.config.defaultGranteeId,
        }
      );

      // Execute the complete flow with granular error handling
      await flow.executeCompleteFlow(
        walletAddress,
        userData,
        prompt,
        serverUrl,
        0 // Skip schema validation for load test
      );

      const duration = Date.now() - startTime;

      if (this.config.enableDebugLogs) {
        console.log(`[${testId}] E2E flow completed successfully in ${duration}ms`);
      }

      return {
        success: true,
        duration,
        walletAddress,
        inferenceResult: 'Flow completed successfully',
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Track error with detailed context
      globalErrorTracker.trackError(
        error instanceof Error ? error : new Error(errorMessage),
        {
          userId: testId,
          phase: 'data_portability_flow',
          timestamp: Date.now(),
          duration,
          walletAddress,
          step: 'execute_data_portability_flow'
        },
        {
          serverUrl,
          hasRelayer: !!this.walletFunder,
          skipFundingCheck: this.config.skipFundingCheck
        }
      );

      if (this.config.enableDebugLogs) {
        console.error(`[${testId}] E2E flow failed after ${duration}ms:`, errorMessage);
      }

      return {
        success: false,
        duration,
        walletAddress,
        error: errorMessage,
      };
    }
  }



  /**
   * Get wallet address
   */
  public getWalletAddress(): string {
    return this.account.address;
  }

  /**
   * Check if wallet has sufficient balance for transactions
   */
  async checkWalletBalance(): Promise<{
    address: string;
    balance: bigint;
    balanceFormatted: string;
    needsFunding: boolean;
    estimatedTransactions: bigint;
  }> {
    const balance = await this.publicClient.getBalance({
      address: this.account.address,
    });

    const needsFunding = balance < ESTIMATED_GAS_COSTS.MIN_BALANCE_THRESHOLD;
    const estimatedTransactions = balance / ESTIMATED_GAS_COSTS.ESTIMATED_COST;

    return {
      address: this.account.address,
      balance,
      balanceFormatted: formatEther(balance),
      needsFunding,
      estimatedTransactions,
    };
  }

  /**
   * Fund wallet if needed using relayer
   */
  async ensureFunding(): Promise<{
    funded: boolean;
    balanceBefore: string;
    balanceAfter: string;
    txHash?: string;
    error?: string;
  }> {
    if (!this.walletFunder) {
      return {
        funded: false,
        balanceBefore: '0',
        balanceAfter: '0',
        error: 'Wallet funder not initialized (RELAYER_PRIVATE_KEY not provided)',
      };
    }

    const result = await this.walletFunder.fundWallet(this.account.address);

    return {
      funded: result.success,
      balanceBefore: formatEther(result.balanceBefore),
      balanceAfter: formatEther(result.balanceAfter),
      txHash: result.txHash,
      error: result.error,
    };
  }

  /**
   * Create status update callback for external monitoring
   */
  public createCallbacks(testId: string) {
    return {
      onStatusUpdate: (status: string) => {
        if (this.config.enableDebugLogs) {
          console.log(`[${testId}] Status: ${status}`);
        }
      },
      onResultUpdate: (result: string) => {
        if (this.config.enableDebugLogs) {
          console.log(`[${testId}] Result received`);
        }
      },
      onError: (error: string) => {
        console.error(`[${testId}] Error: ${error}`);
      },
    };
  }
}
