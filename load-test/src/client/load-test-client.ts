import { Vana, PinataStorage } from '@opendatalabs/vana-sdk/node';
import type { StorageProvider, StorageUploadResult, StorageFile, StorageListOptions, StorageProviderConfig } from '@opendatalabs/vana-sdk/node';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, type WalletClient, type Account, formatEther } from 'viem';
import { mokshaTestnet } from '@opendatalabs/vana-sdk/chains';
import type { LoadTestConfig, TestResult } from '../config/types.js';
import { DataPortabilityFlow } from './data-portability-flow.js';
import { GoogleCloudStorage } from '../storage/google-cloud-storage.js';
import { WalletFunder, ESTIMATED_GAS_COSTS } from '../utils/wallet-funding.js';
import { globalErrorTracker } from '../utils/error-tracker.js';
import { logNetworkGasInfo } from '../utils/gas-monkey-patch.js';
import { getRpcEndpointForWallet } from '../utils/rpc-distribution.js';
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

  // Require real storage providers for load testing
  if (Object.keys(providers).length === 0) {
    throw new Error('❌ REAL SYSTEMS REQUIRED: Configure GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON and GOOGLE_CLOUD_STORAGE_BUCKET for load testing');
  }

  return providers;
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
  private vana: any; // Vana SDK instance (user wallet for signing)
  private vanaRelayer: any; // Vana SDK instance (master relayer for transactions)
  private walletClient: WalletClient;
  private relayerWalletClient?: WalletClient; // Master relayer wallet client
  private publicClient: any;
  private config: LoadTestConfig;
  private account: Account;
  private walletFunder?: WalletFunder;


  private constructor(privateKey: string, config: LoadTestConfig, storageProviders: Record<string, StorageProvider>) {
    this.config = config;
    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    
    // Get RPC endpoint for this wallet (deterministic distribution)
    const rpcEndpoint = getRpcEndpointForWallet(config, this.account.address);
    
    // Create viem clients
    this.publicClient = createPublicClient({
      chain: mokshaTestnet,
      transport: http(rpcEndpoint),
    });

    // Create wallet client for end-user (signing, encryption)
    const baseWalletClient = createWalletClient({
      chain: mokshaTestnet,
      transport: http(rpcEndpoint),
      account: this.account,
    });
    
    if (config.enableDebugLogs) {
      console.log(chalk.gray(`[${this.account.address}] Using RPC: ${rpcEndpoint}`));
    }
    
    // Use the standard wallet client for the end-user
    this.walletClient = baseWalletClient;
    
    // Create master relayer wallet client if provided
    if (config.masterRelayerPrivateKey) {
      const relayerAccount = privateKeyToAccount(config.masterRelayerPrivateKey as `0x${string}`);
      this.relayerWalletClient = createWalletClient({
        chain: mokshaTestnet,
        transport: http(rpcEndpoint),
        account: relayerAccount,
      });
      
      if (config.enableDebugLogs) {
        console.log(chalk.yellow(`[${this.account.address}] Using master relayer ${relayerAccount.address} for transactions`));
      }
    }
    
    if (config.enableDebugLogs) {
      console.log(chalk.yellow(`[${this.account.address}] Using SDK TransactionOptions for ${config.premiumGasMultiplier}x gas premium`));
    }
    
    // Determine the default provider (prefer real storage over mock)
    const defaultProvider = storageProviders['google-cloud-storage'] ? 'google-cloud-storage' 
      : storageProviders['pinata'] ? 'pinata' 
      : 'mock';
    
    // Initialize Vana SDK instance with end-user wallet (for signing, encryption)
    this.vana = Vana({ 
      walletClient: this.walletClient as WalletClient & { chain: typeof mokshaTestnet }, 
      storage: {
        providers: storageProviders,
        defaultProvider,
      },
      defaultPersonalServerUrl: config.personalServerUrl || 'http://localhost:3001',
    });
    
    // Initialize separate Vana SDK instance with master relayer wallet (for transactions)
    if (this.relayerWalletClient) {
      this.vanaRelayer = Vana({
        walletClient: this.relayerWalletClient as WalletClient & { chain: typeof mokshaTestnet },
        storage: {
          providers: storageProviders,
          defaultProvider,
        },
        defaultPersonalServerUrl: config.personalServerUrl || 'http://localhost:3001',
      });
    } else {
      // Fallback to using the same instance if no master relayer is provided
      this.vanaRelayer = this.vana;
    }
    
    // DEBUG: Check if the SDK properly initialized the context
    if (config.enableDebugLogs) {
      console.log(`[LoadTestClient] SDK initialization debug:`, {
        'walletClient passed': !!this.walletClient,
        'walletClient.account': !!this.walletClient.account,
        'walletClient.account.address': this.walletClient.account?.address,
      });
      
      // Check internal SDK state
      console.log(`[LoadTestClient] SDK internal state:`, {
        'vana exists': !!this.vana,
        'vana.walletClient': !!(this.vana as any).walletClient,
        'vana._staticUserAddress': (this.vana as any)._staticUserAddress,
        'vana.userAddress': (this.vana as any).userAddress,
      });
      
      // Check permissions controller context
      console.log(`[LoadTestClient] Permissions controller context:`, {
        'permissions exists': !!this.vana.permissions,
        'permissions.context exists': !!(this.vana.permissions as any).context,
        'permissions.context.walletClient': !!(this.vana.permissions as any).context?.walletClient,
        'permissions.context.userAddress': (this.vana.permissions as any).context?.userAddress,
      });
    }

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
        // Log current network gas info
        await logNetworkGasInfo(this.walletClient);
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

      // Create the data portability flow instance with dual wallet setup
      const flow = new DataPortabilityFlow(
        this.vana, // User SDK for signing/encryption
        this.walletClient, // User wallet client
        this.createCallbacks(testId),
        testId,
        {
          dataWalletAppAddress: this.config.dataWalletAppAddress,
          defaultGranteeId: this.config.defaultGranteeId,
        },
        this.config, // Pass load test config for premium gas configuration and timeout
        this.vanaRelayer // Pass relayer SDK for transactions
      );

      // Execute the complete flow with granular error handling
      const flowResult = await flow.executeCompleteFlow(
        walletAddress,
        userData,
        prompt,
        serverUrl,
        0 // Skip schema validation for load test
      );

      const duration = Date.now() - startTime;

      if (this.config.enableDebugLogs) {
        console.log(`[${testId}] E2E flow completed successfully in ${duration}ms`);
        console.log(`[${testId}] Transaction hash: ${flowResult.transactionHash}`);
        console.log(`[${testId}] Permission ID: ${flowResult.permissionId}`);
      }

      return {
        success: true,
        duration,
        walletAddress,
        inferenceResult: 'Flow completed successfully',
        transactionHash: flowResult.transactionHash,
        permissionId: flowResult.permissionId,
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
