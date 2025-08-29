import {
  VanaInstance,
  generateEncryptionKey,
  encryptBlobWithSignedKey,
  encryptWithWalletPublicKey,
  BrowserPlatformAdapter,
  DEFAULT_ENCRYPTION_SEED,
  validateDataAgainstSchema,
  type Schema,
  type DataSchema,
} from "@opendatalabs/vana-sdk/browser";
import type { WalletClient } from "viem";
import { GasConfiguration } from '../utils/wallet-funding.js';
import type { LoadTestConfig } from '../config/types.js';

interface FlowStepCallbacks {
  onStatusUpdate: (status: string) => void;
  onResultUpdate: (result: string) => void;
  onError: (error: string) => void;
}

interface DataPortabilityConfig {
  dataWalletAppAddress?: string;
  defaultGranteeId?: string;
}

/**
 * DataPortabilityFlow for load testing
 * Based on the actual vana-vibes-demo implementation
 * Executes the complete E2E data portability workflow
 */
export class DataPortabilityFlow {
  private vana: VanaInstance;
  private walletClient: WalletClient;
  private callbacks: FlowStepCallbacks;
  private platformAdapter: BrowserPlatformAdapter;
  private encryptionKey?: string;
  private testId: string;
  private gasConfig?: GasConfiguration;
  private config?: DataPortabilityConfig;

  constructor(
    vana: VanaInstance,
    walletClient: WalletClient,
    callbacks: FlowStepCallbacks,
    testId: string = 'load-test',
    config?: DataPortabilityConfig,
    loadTestConfig?: LoadTestConfig
  ) {
    this.vana = vana;
    this.walletClient = walletClient;
    this.callbacks = callbacks;
    this.platformAdapter = new BrowserPlatformAdapter();
    this.testId = testId;
    this.config = config;
    
    // Initialize gas configuration for premium pricing
    if (loadTestConfig) {
      this.gasConfig = new GasConfiguration(loadTestConfig);
    }
  }

  /**
   * Fetch and parse schema definition from the schema's definitionUrl
   */
  private async fetchSchemaDefinition(schema: Schema): Promise<DataSchema> {
    this.callbacks.onStatusUpdate(`[${this.testId}] Fetching schema definition from ${schema.definitionUrl}...`);
    
    const response = await fetch(schema.definitionUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch schema definition: ${response.status} ${response.statusText}`);
    }
    
    const schemaDefinition = await response.json();
    
    // The fetched definition should be a complete DataSchema
    if (!schemaDefinition.version || !schemaDefinition.schema) {
      throw new Error('Schema definition is missing required fields (version or schema)');
    }
    
    return {
      name: schemaDefinition.name || schema.name,
      version: schemaDefinition.version,
      description: schemaDefinition.description,
      dialect: schemaDefinition.dialect || schema.dialect as "sqlite" | "json",
      dialectVersion: schemaDefinition.dialectVersion,
      schema: schemaDefinition.schema,
    };
  }

  async processUserData(userData: string): Promise<string> {
    this.callbacks.onStatusUpdate(`[${this.testId}] Processing user data...`);

    try {
      this.callbacks.onStatusUpdate(`[${this.testId}] User data processed successfully`);
      return userData;
    } catch (error) {
      throw new Error(
        `User data processing failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  async encryptFile(
    data: string,
  ): Promise<{ encryptedBlob: Blob; encryptionKey: string }> {
    this.callbacks.onStatusUpdate(`[${this.testId}] Encrypting file with wallet signature...`);

    try {
      // Generate encryption key using wallet signature
      const encryptionKey = await generateEncryptionKey(
        this.walletClient,
        this.platformAdapter,
        DEFAULT_ENCRYPTION_SEED,
      );

      // Create blob from data
      const dataBlob = new Blob([data], { type: "application/json" });

      // Encrypt the blob using Vana SDK
      const encryptedBlob = await encryptBlobWithSignedKey(
        dataBlob,
        encryptionKey,
        this.platformAdapter,
      );

      this.callbacks.onStatusUpdate(
        `[${this.testId}] File encrypted successfully with wallet signature`,
      );
      return { encryptedBlob, encryptionKey };
    } catch (error) {
      throw new Error(
        `File encryption failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  async uploadToStorage(encryptedData: Blob): Promise<string> {
    this.callbacks.onStatusUpdate(`[${this.testId}] Uploading encrypted file to storage...`);

    try {
      // Use the data controller upload method
      const fileName = `vana_loadtest_${this.testId}_${Date.now()}.json`;
      const uploadResult = await this.vana.data.uploadToStorage(
        encryptedData,
        fileName,
      );

      this.callbacks.onStatusUpdate(`[${this.testId}] File uploaded to storage successfully`);
      return uploadResult.url;
    } catch (error) {
      throw new Error(
        `Storage upload failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  async createAndUploadGrantFile(
    granteeAddress: string,
    operation: string,
    parameters: Record<string, unknown>,
  ): Promise<string> {
    this.callbacks.onStatusUpdate(`[${this.testId}] Creating and uploading grant file...`);

    try {
      // Create grant data following vibes pattern
      const grantData = {
        grantee: granteeAddress,
        operation,
        parameters,
      };

      // Create grant file blob
      const grantBlob = new Blob([JSON.stringify(grantData, null, 2)], {
        type: "application/json",
      });

      // Upload grant file to storage using the same provider
      const grantFileName = `grant_${this.testId}_${Date.now()}.json`;
      const uploadResult = await this.vana.data.uploadToStorage(
        grantBlob,
        grantFileName,
      );
      const fileUrl = uploadResult.url;

      this.callbacks.onStatusUpdate(`[${this.testId}] Grant file uploaded successfully`);
      return fileUrl;
    } catch (error) {
      throw new Error(
        `Grant file creation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  async executeTransaction(
    fileUrl: string,
    userAddress: string,
    customPrompt: string,
    schemaId?: number | null,
  ): Promise<string> {
    this.callbacks.onStatusUpdate(`[${this.testId}] Preparing data portability transaction...`);

    try {
      // First, create and upload the grant file
      const operation = "llm_inference";
      const parameters = {
        prompt: customPrompt,
      };
      // Use provided config or fall back to environment variable
      const appAddress = this.config?.dataWalletAppAddress || process.env.NEXT_PUBLIC_DATA_WALLET_APP_ADDRESS;
      if (!appAddress) {
        throw new Error(
          "Data wallet app address is not configured. Set NEXT_PUBLIC_DATA_WALLET_APP_ADDRESS environment variable or provide dataWalletAppAddress in config.",
        );
      }

      const grantUrl = await this.createAndUploadGrantFile(
        appAddress,
        operation,
        parameters,
      );

      const serverInfo = await this.vana.server.getIdentity({
        userAddress: userAddress as `0x${string}`,
      });

      // Encrypt the encryption key with the server's public key
      if (!this.encryptionKey) {
        throw new Error(
          "Encryption key not found - file must be encrypted first",
        );
      }

      const encryptedKey = await encryptWithWalletPublicKey(
        this.encryptionKey,
        serverInfo.public_key,
        this.platformAdapter,
      );

      // Use provided config or fall back to environment variable
      const granteeId = this.config?.defaultGranteeId || process.env.NEXT_PUBLIC_DEFAULT_GRANTEE_ID;
      if (!granteeId) {
        throw new Error(
          "Default grantee ID is not configured. Set NEXT_PUBLIC_DEFAULT_GRANTEE_ID environment variable or provide defaultGranteeId in config.",
        );
      }

      // Debug: Log transaction details before submission
      console.log(`🔍 Debug - Preparing transaction for ${this.testId}:`);
      console.log(`  Wallet: ${this.walletClient.account?.address}`);
      console.log(`  GranteeId: ${granteeId}`);
      console.log(`  Grant URL: ${grantUrl}`);
      
      // Debug gas prices
      try {
        // Note: getGasPrice needs to be called on vana instance or public client, not wallet client
        console.log(`  ⚠️  SDK will use automatic gas estimation (not premium gas configured in load test)`);
      } catch (e) {
        console.log(`  Could not fetch gas prices: ${e}`);
      }
      
      // Debug: Check if this wallet has any existing nonce in the contract
      try {
        // This is a hack to access the internal nonce method - for debugging only
        const permissionsController = (this.vana as any).permissions;
        if (permissionsController && typeof permissionsController.getPermissionsUserNonce === 'function') {
          const currentNonce = await permissionsController.getPermissionsUserNonce();
          console.log(`🔍 Debug - Current contract nonce for this wallet: ${currentNonce}`);
        }
      } catch (error) {
        console.log(`🔍 Debug - Could not read contract nonce: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Use provided schema ID or fall back to environment variable or 0
      const finalSchemaId =
        schemaId ??
        (process.env.NEXT_PUBLIC_VIBES_SCHEMA_ID
          ? parseInt(process.env.NEXT_PUBLIC_VIBES_SCHEMA_ID, 10)
          : 0);

      // Note: SDK doesn't support custom gas prices in submitAddServerFilesAndPermissions
      // This is likely why transactions get stuck at scale
      const txHandle =
        await this.vana.permissions.submitAddServerFilesAndPermissions({
          granteeId: BigInt(granteeId),
          grant: grantUrl,
          fileUrls: [fileUrl],
          schemaIds: [finalSchemaId],
          serverAddress: serverInfo.address as `0x${string}`,
          serverUrl: serverInfo.base_url,
          serverPublicKey: serverInfo.public_key,
          filePermissions: [
            [
              {
                account: serverInfo.address as `0x${string}`,
                key: encryptedKey, // Encryption key encrypted with server's public key
              },
            ],
          ],
        });

      const txHash = txHandle.hash;
      const walletAddress = this.walletClient.account?.address || 'unknown';
      
      this.callbacks.onStatusUpdate(`[${this.testId}] Transaction submitted: ${txHash}`);
      
      // Log wallet address and transaction hash for debugging nonce issues
      console.log(`[${this.testId}] Wallet: ${walletAddress} | TxHash: ${txHash}`);

      // Wait for transaction confirmation and extract permission ID from events
      this.callbacks.onStatusUpdate(
        `[${this.testId}] Waiting for transaction confirmation and permission ID...`,
      );

      try {
        const events = await txHandle.waitForEvents();
        const permissionId = events.permissionId;

        if (!permissionId) {
          throw new Error(
            `Permission ID not found in transaction events for wallet ${walletAddress}, tx ${txHash}. Cannot proceed with inference request.`,
          );
        }

        // Convert bigint to string for API compatibility
        const permissionIdStr = permissionId.toString();

        this.callbacks.onStatusUpdate(
          `[${this.testId}] Permission ID received: ${permissionIdStr}`,
        );
        return permissionIdStr;
      } catch (waitError) {
        // Include wallet address and transaction hash in error for debugging
        throw new Error(
          `Transaction ${txHash} failed for wallet ${walletAddress}: ${
            waitError instanceof Error ? waitError.message : "Unknown error"
          }`,
        );
      }
    } catch (error) {
      // This catches errors from submitAddServerFilesAndPermissions
      const walletAddress = this.walletClient.account?.address || 'unknown';
      throw new Error(
        `Transaction submission failed for wallet ${walletAddress}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  async submitInferenceRequest(permissionId: string, serverUrl: string): Promise<string> {
    this.callbacks.onStatusUpdate(`[${this.testId}] Submitting AI inference request...`);

    try {
      const response = await fetch(`${serverUrl}/api/trusted-server`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          permissionId: Number(permissionId),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "API request failed");
      }

      if (!result.data?.id) {
        throw new Error("Operation ID not found in inference response");
      }

      this.callbacks.onStatusUpdate(
        `[${this.testId}] Inference request submitted. Operation ID: ${result.data.id}`,
      );
      return result.data.id; // Return operationId for polling
    } catch (error) {
      throw new Error(
        `Inference submission failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  async pollForResults(operationId: string, serverUrl: string): Promise<string> {
    this.callbacks.onStatusUpdate(`[${this.testId}] Waiting for AI inference results...`);

    const maxAttempts = 30;
    const pollInterval = 5000; // 5 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${serverUrl}/api/trusted-server/poll`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operationId,
            chainId: 14800, // Moksha testnet
          }),
        });

        if (!response.ok) {
          throw new Error("Polling request failed");
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Polling request failed");
        }

        const data = result.data;

        // Check if inference is completed
        if (data?.status !== "processing") {
          this.callbacks.onStatusUpdate(`[${this.testId}] AI inference completed!`);
          return JSON.stringify(data?.result || data, null, 2);
        } else {
          this.callbacks.onStatusUpdate(
            `[${this.testId}] Polling attempt ${attempt}/${maxAttempts}: Still processing...`,
          );

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
          }
        }
      } catch {
        if (attempt < maxAttempts) {
          this.callbacks.onStatusUpdate(
            `[${this.testId}] Polling attempt ${attempt} failed, retrying...`,
          );
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        } else {
          throw new Error(
            "AI inference timed out after maximum polling attempts",
          );
        }
      }
    }

    throw new Error("AI inference timed out after maximum polling attempts");
  }

  /**
   * Execute operation with selective retry logic based on error type
   */
  private async executeWithSelectiveRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    operationName: string,
    retryableErrorTypes: string[]
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if this error type should be retried
        const errorMessage = lastError.message.toLowerCase();
        const shouldRetry = retryableErrorTypes.some(type => {
          switch (type) {
            case 'network':
              return errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('connection');
            case 'timeout':
              return errorMessage.includes('timeout') || errorMessage.includes('timed out');
            case 'server_error':
              return errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503');
            case 'nonce':
              return errorMessage.includes('nonce') || errorMessage.includes('invalidnonce');
            default:
              return false;
          }
        });
        
        // Never retry nonce errors - they indicate success
        const isNonceError = errorMessage.includes('nonce') || errorMessage.includes('invalidnonce');
        
        if (attempt === maxRetries || !shouldRetry || isNonceError) {
          console.log(`❌ ${operationName} failed after ${attempt} attempts: ${lastError.message}`);
          throw lastError;
        }
        
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
        console.log(`⚠️  ${operationName} attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError || new Error('Max retries exceeded');
  }

  async executeCompleteFlow(
    userAddress: string,
    userData: string,
    prompt: string,
    serverUrl: string,
    schemaId?: number | null,
  ): Promise<void> {
    try {
      // Step 0: Validate data against schema if provided
      if (schemaId && schemaId > 0) {
        this.callbacks.onStatusUpdate(`[${this.testId}] Validating data against schema...`);
        try {
          // Get schema metadata from blockchain
          const schema = await this.vana.schemas.get(schemaId);
          
          // Fetch the actual schema definition
          const dataSchema = await this.fetchSchemaDefinition(schema);
          
          // Parse and validate the user data
          const parsedUserData = JSON.parse(userData);
          validateDataAgainstSchema(parsedUserData, dataSchema);
          
          this.callbacks.onStatusUpdate(`[${this.testId}] Data validation successful against schema ${schemaId} (${dataSchema.name})`);
        } catch (error) {
          // Schema retrieval, fetching, or validation failed
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.callbacks.onStatusUpdate(
            `[${this.testId}] Warning: Schema validation failed: ${errorMessage}. Continuing without validation.`
          );
          
          // For load testing, we continue even if validation fails
          // In production, you might want to throw the error instead
        }
      }

      // Step 1: Encrypt file with wallet signature
      const { encryptedBlob, encryptionKey } = await this.encryptFile(userData);
      this.encryptionKey = encryptionKey;

      // Step 2: Upload to storage (Google Drive or IPFS)
      const fileUrl = await this.uploadToStorage(encryptedBlob);

      // Step 3: Execute blockchain transaction with permissions (NO RETRY - one-time only)
      const permissionId = await this.executeTransaction(
        fileUrl,
        userAddress,
        prompt,
        schemaId,
      );

      // Step 4: Submit AI inference request (retry on network/server errors)
      const operationId = await this.executeWithSelectiveRetry(
        () => this.submitInferenceRequest(permissionId, serverUrl),
        3,
        'AI inference request',
        ['network', 'timeout', 'server_error']
      );

      // Step 5: Poll for AI inference results (retry with more attempts)
      const result = await this.executeWithSelectiveRetry(
        () => this.pollForResults(operationId, serverUrl),
        5, // More retries for polling since it's more likely to have temporary issues
        'AI result polling',
        ['network', 'timeout', 'server_error']
      );

      this.callbacks.onResultUpdate(result);
      this.callbacks.onStatusUpdate(
        `[${this.testId}] Data portability flow completed successfully!`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      this.callbacks.onError(errorMessage);
      this.callbacks.onStatusUpdate(`[${this.testId}] Flow failed: ${errorMessage}`);
      throw error;
    }
  }
}
