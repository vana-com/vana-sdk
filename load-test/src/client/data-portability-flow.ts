import type { VanaInstance } from "@opendatalabs/vana-sdk/node";
import {
  generateEncryptionKey,
  encryptBlobWithSignedKey,
  encryptWithWalletPublicKey,
  DEFAULT_ENCRYPTION_SEED,
  validateDataAgainstSchema,
  NodePlatformAdapter,
} from "@opendatalabs/vana-sdk/node";
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
  private vana: any; // Vana SDK instance (for signing/encryption)
  private vanaRelayer: any; // Vana SDK instance (for transactions) - optional
  private walletClient: WalletClient;
  private callbacks: FlowStepCallbacks;
  private platformAdapter: NodePlatformAdapter;
  private encryptionKey?: string;
  private testId: string;
  private gasConfig?: GasConfiguration;
  private config?: DataPortabilityConfig;
  private loadTestConfig?: LoadTestConfig;

  constructor(
    vana: VanaInstance,
    walletClient: WalletClient,
    callbacks: FlowStepCallbacks,
    testId: string = 'load-test',
    config?: DataPortabilityConfig,
    loadTestConfig?: LoadTestConfig,
    vanaRelayer?: VanaInstance // Optional relayer SDK instance for transactions
  ) {
    this.vana = vana;
    this.vanaRelayer = vanaRelayer || vana; // Use relayer if provided, otherwise use same instance
    this.walletClient = walletClient;
    this.callbacks = callbacks;
    this.platformAdapter = new NodePlatformAdapter();
    this.testId = testId;
    this.config = config;
    this.loadTestConfig = loadTestConfig;
    
    // Initialize gas configuration for premium pricing
    if (loadTestConfig) {
      this.gasConfig = new GasConfiguration(loadTestConfig);
    }
  }

  /**
   * Fetch and parse schema definition from the schema's definitionUrl
   */
  private async fetchSchemaDefinition(schema: any): Promise<any> {
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
  ): Promise<{ permissionId: string; transactionHash: string }> {
    this.callbacks.onStatusUpdate(`[${this.testId}] Preparing data portability transaction...`);

    try {
      // Use provided config or fall back to environment variable
      const granteeId = this.config?.defaultGranteeId || process.env.NEXT_PUBLIC_DEFAULT_GRANTEE_ID;
      if (!granteeId) {
        throw new Error(
          "Default grantee ID is not configured. Set NEXT_PUBLIC_DEFAULT_GRANTEE_ID environment variable or provide defaultGranteeId in config.",
        );
      }

      // CRITICAL FIX: Get grantee info from SDK to get the grantee's address (like vana-vibes does)
      console.log(`🔍 Debug - Looking up grantee ID ${granteeId} on blockchain...`);
      const grantee = await this.vanaRelayer.permissions.getGranteeById(Number(granteeId));
      
      if (!grantee) {
        throw new Error(`Grantee ${granteeId} not found on chain - this will cause transaction revert!`);
      }
      
      // Grantee might have 'address' or 'granteeAddress' field (like vana-vibes)
      const granteeAddress = (grantee as any).granteeAddress || (grantee as any).address;
      
      if (!granteeAddress) {
        throw new Error(`Grantee ${granteeId} found but has no address - invalid grantee!`);
      }
      
      console.log(`✅ Debug - Using grantee ${granteeId} with address ${granteeAddress}`);

      // Create and upload the grant file with the CORRECT grantee address (not app address!)
      const operation = "llm_inference";
      const parameters = {
        prompt: customPrompt,
        response_format: { type: "json_object" }, // MISSING PARAMETER - add like vana-vibes
      };

      const grantUrl = await this.createAndUploadGrantFile(
        granteeAddress, // Use grantee address, not app address!
        operation,
        parameters,
      );

      const serverInfo = await this.vanaRelayer.server.getIdentity({
        userAddress: userAddress as `0x${string}`,
      });

      // Debug: Validate server info response
      console.log(`🔍 Debug - Server info for ${this.testId}:`, {
        address: serverInfo.address,
        baseUrl: serverInfo.baseUrl,
        publicKey: serverInfo.publicKey,
        publicKey_type: typeof serverInfo.publicKey,
        publicKey_length: serverInfo.publicKey?.length,
      });

      if (!serverInfo.publicKey) {
        throw new Error(`Server public key is missing from identity response for ${userAddress}`);
      }

      // Skip server trust check for now
      console.log(`🔍 Debug - Skipping server trust check (focusing on SDK account handling issue)`);

      // Encrypt the encryption key with the server's public key
      if (!this.encryptionKey) {
        throw new Error(
          "Encryption key not found - file must be encrypted first",
        );
      }

      const encryptedKey = await encryptWithWalletPublicKey(
        this.encryptionKey,
        serverInfo.publicKey,
        this.platformAdapter,
      );

      // Grantee ID was already resolved above - no need to re-fetch

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
          console.log(`🔍 Debug - Current contract nonce for end-user wallet: ${currentNonce}`);
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

      // Calculate premium gas options for load testing
      const gasOptions = this.loadTestConfig ? {
        // Use reasonable gas pricing: base gas * multiplier, capped at maxGasPrice
        // For load testing, we'll use a base of 10 gwei and apply the multiplier
        maxFeePerGas: BigInt(Math.min(
          Math.floor(10 * (this.loadTestConfig.premiumGasMultiplier || 2)), // 10 gwei base * multiplier
          Number(this.loadTestConfig.maxGasPrice || 50) // Cap at maxGasPrice
        )) * 1_000_000_000n,
        maxPriorityFeePerGas: BigInt(Math.floor(Number(this.loadTestConfig.maxGasPrice || 50) * 0.1)) * 1_000_000_000n,
        gasLimit: BigInt(this.loadTestConfig.gasLimit || 600000),
      } : undefined;
      
      // Use the new SDK TransactionOptions for gas configuration and timeout
      const transactionOptions = gasOptions ? {
        maxFeePerGas: gasOptions.maxFeePerGas,
        maxPriorityFeePerGas: gasOptions.maxPriorityFeePerGas,
        gasLimit: gasOptions.gasLimit,
        // Use load test timeout configuration
        timeout: this.loadTestConfig?.transactionTimeoutMs || 180000, // Default 3 minutes
      } : {
        timeout: this.loadTestConfig?.transactionTimeoutMs || 180000, // Default 3 minutes
      };

      if (gasOptions) {
        console.log(`🔍 Debug - Using SDK TransactionOptions for ${this.testId}:`);
        console.log(`  maxFeePerGas: ${(Number(gasOptions.maxFeePerGas) / 1e9).toFixed(1)} gwei`);
        console.log(`  maxPriorityFeePerGas: ${(Number(gasOptions.maxPriorityFeePerGas) / 1e9).toFixed(1)} gwei`);
        console.log(`  gasLimit: ${gasOptions.gasLimit}`);
        console.log(`  timeout: ${transactionOptions.timeout}ms`);
      }

      console.log(`🔍 [${this.testId}] DEBUG: Submitting addServerFilesAndPermissions transaction...`);
      
      // Get relayer wallet address (for transactions)
      const relayerWalletClient = (this.vanaRelayer as any).walletClient;
      const relayerAddress = relayerWalletClient?.account?.address || 'unknown';
      
      // Get end-user wallet address (for signing)
      const walletAddress = this.walletClient.account?.address || 'unknown';
      
      console.log(`🔍 [${this.testId}] DEBUG: Using relayer wallet ${relayerAddress} for transaction`);
      console.log(`🔍 [${this.testId}] DEBUG: End-user wallet ${walletAddress} for signing`);
      
      // Check current nonce for debugging
      let currentNonce: bigint;
      try {
        // Get nonce directly from contract using the same method as the SDK
        // We'll access the contract address through the relayer instance's public client
        const chainId = await this.vanaRelayer.publicClient.getChainId();
        
        // For now, let's use the known contract address for Moksha testnet
        // TODO: This should be dynamic based on chain, but for debugging it's fine
        const DataPortabilityPermissionsAddress = "0xD54523048AdD05b4d734aFaE7C68324Ebb7373eF" as `0x${string}`;
        const { getAbi } = await import('@opendatalabs/vana-sdk/node');
        const DataPortabilityPermissionsAbi = getAbi("DataPortabilityPermissions");
        
        currentNonce = await this.vanaRelayer.publicClient.readContract({
          address: DataPortabilityPermissionsAddress,
          abi: DataPortabilityPermissionsAbi,
          functionName: "userNonce",
          args: [walletAddress as `0x${string}`], // Use end-user address - nonce is per user, not per relayer
        });
        console.log(`🔍 [${this.testId}] DEBUG: Current contract nonce for this wallet: ${currentNonce}`);
      } catch (error) {
        console.warn(`⚠️ [${this.testId}] Could not fetch nonce:`, error);
        currentNonce = 0n; // Default to 0 if we can't fetch it
      }
      
      const transactionInput = {
        granteeId: BigInt(granteeId),
        grant: grantUrl,
        fileUrls: [fileUrl],
        schemaIds: [BigInt(finalSchemaId)],
        serverAddress: serverInfo.address as `0x${string}`,
        serverUrl: serverInfo.baseUrl,
        serverPublicKey: serverInfo.publicKey,
        filePermissions: [
          [
            {
              account: serverInfo.address as `0x${string}`,
              key: encryptedKey,
            },
          ],
        ],
      };
      
      console.log(`🔍 [${this.testId}] DEBUG: Contract validation checks:`);
      console.log(`  - Nonce: Using nonce ${currentNonce} (from contract)`);
      console.log(`  - Schema IDs length: ${transactionInput.schemaIds.length}`);
      console.log(`  - File URLs length: ${transactionInput.fileUrls.length}`);
      console.log(`  - File permissions length: ${transactionInput.filePermissions.length}`);
      console.log(`  - Schema/File length match: ${transactionInput.schemaIds.length === transactionInput.fileUrls.length}`);
      console.log(`  - Permissions/File length match: ${transactionInput.filePermissions.length === transactionInput.fileUrls.length}`);
      
      console.log(`🔍 [${this.testId}] DEBUG: Transaction input details:`, {
        granteeId: granteeId.toString(),
        serverAddress: serverInfo.address,
        serverUrl: serverInfo.baseUrl,
        serverPublicKey: serverInfo.publicKey?.substring(0, 20) + '...',
        fileUrlsCount: transactionInput.fileUrls.length,
        schemaId: finalSchemaId,
        nonce: currentNonce.toString(),
        encryptedKeyLength: encryptedKey.length,
        transactionOptions: transactionOptions ? {
          maxFeePerGas: transactionOptions.maxFeePerGas ? `${Number(transactionOptions.maxFeePerGas) / 1e9} gwei` : 'auto',
          maxPriorityFeePerGas: transactionOptions.maxPriorityFeePerGas ? `${Number(transactionOptions.maxPriorityFeePerGas) / 1e9} gwei` : 'auto',
          gasLimit: transactionOptions.gasLimit?.toString() || 'auto',
          timeout: transactionOptions.timeout || 'default'
        } : 'none'
      });

      // Additional debugging for contract validation
      console.log(`🔍 [${this.testId}] DEBUG: Detailed transaction parameters:`, {
        'granteeId (BigInt)': transactionInput.granteeId.toString(),
        'grant URL length': transactionInput.grant.length,
        'fileUrls[0] length': transactionInput.fileUrls[0]?.length || 0,
        'schemaIds[0] (BigInt)': transactionInput.schemaIds[0].toString(),
        'serverAddress': transactionInput.serverAddress,
        'serverUrl length': transactionInput.serverUrl.length,
        'serverPublicKey length': transactionInput.serverPublicKey.length,
        'filePermissions[0] length': transactionInput.filePermissions[0]?.length || 0,
        'filePermissions[0][0].account': transactionInput.filePermissions[0]?.[0]?.account,
        'filePermissions[0][0].key length': transactionInput.filePermissions[0]?.[0]?.key?.length || 0,
      });

      // Import handleRelayerOperation from vana-sdk
      const { handleRelayerOperation } = await import('@opendatalabs/vana-sdk/node');
      
      // Create typed data structure for ServerFilesAndPermission
      const chainId = await this.vanaRelayer.publicClient.getChainId();
      const domain = {
        name: "VanaDataPortabilityPermissions",
        version: "1",
        chainId: Number(chainId),
        verifyingContract: "0xD54523048AdD05b4d734aFaE7C68324Ebb7373eF" as `0x${string}`, // DataPortabilityPermissions contract
      };

      const types = {
        Permission: [
          { name: "account", type: "address" },
          { name: "key", type: "string" },
        ],
        ServerFilesAndPermission: [
          { name: "nonce", type: "uint256" },
          { name: "granteeId", type: "uint256" },
          { name: "grant", type: "string" },
          { name: "fileUrls", type: "string[]" },
          { name: "schemaIds", type: "uint256[]" },
          { name: "serverAddress", type: "address" },
          { name: "serverUrl", type: "string" },
          { name: "serverPublicKey", type: "string" },
          { name: "filePermissions", type: "Permission[][]" },
        ],
      };

      const message = {
        nonce: currentNonce,
        ...transactionInput,
      };

      const typedData = {
        domain,
        types,
        primaryType: "ServerFilesAndPermission" as const,
        message,
      };

      console.log(`🔍 [${this.testId}] DEBUG: Signing typed data with end-user wallet ${walletAddress}`);
      
      // Sign the typed data with the END-USER wallet (not the relayer)
      const signature = await this.walletClient.signTypedData({
        account: this.walletClient.account!,
        domain,
        types,
        primaryType: "ServerFilesAndPermission",
        message,
      });

      console.log(`🔍 [${this.testId}] DEBUG: Signature obtained from end-user wallet`);
      console.log(`🔍 [${this.testId}] DEBUG: Submitting via handleRelayerOperation with relayer wallet ${relayerAddress}`);

      // Create the signed relayer request
      const relayerRequest = {
        type: "signed" as const,
        operation: "submitAddServerFilesAndPermissions" as const,
        typedData,
        signature,
        expectedUserAddress: this.walletClient.account?.address, // End-user address for verification
      };

      // Call handleRelayerOperation with vanaRelayer (which has the master relayer wallet)
      const result = await handleRelayerOperation(this.vanaRelayer, relayerRequest);
      
      console.log(`✅ [${this.testId}] DEBUG: handleRelayerOperation completed!`);
      console.log(`🔍 [${this.testId}] DEBUG: Relayer result:`, result);

      // Extract transaction hash from the result
      let txHash: string;
      if (result.type === "signed" && result.hash) {
        txHash = result.hash;
      } else {
        throw new Error(`Unexpected result from handleRelayerOperation: ${JSON.stringify(result)}`);
      }

      // Create a transaction handle compatible with waitForTransactionEvents
      const txHandle = {
        hash: txHash as `0x${string}`,
        from: relayerAddress as `0x${string}`, // The relayer submitted the tx
        contract: "DataPortabilityPermissions" as const,
        fn: "addServerFilesAndPermissions" as const,
      };
      
      console.log(`✅ [${this.testId}] DEBUG: Transaction submitted successfully via handleRelayerOperation!`);
      console.log(`🔍 [${this.testId}] DEBUG: Transaction handle:`, {
        hash: txHandle.hash,
        from: txHandle.from,
        contract: txHandle.contract,
        fn: txHandle.fn
      });
      
      this.callbacks.onStatusUpdate(`[${this.testId}] Transaction submitted via relayer: ${txHash}`);
      
      // Log wallet addresses and transaction hash for debugging
      console.log(`[${this.testId}] End-user: ${walletAddress} | Relayer: ${relayerAddress} | TxHash: ${txHash} (via handleRelayerOperation)`);

      // Wait for transaction confirmation and extract permission ID from events
      this.callbacks.onStatusUpdate(
        `[${this.testId}] Waiting for transaction confirmation and permission ID...`,
      );

      try {
        console.log(`🔍 [${this.testId}] DEBUG: Waiting for transaction events for tx ${txHash}`);
        const events = await this.vanaRelayer.waitForTransactionEvents(txHandle);
        
        // Debug: Log the full events structure
        console.log(`🔍 [${this.testId}] DEBUG: Transaction events received:`, {
          hash: events.hash,
          hasExpectedEvents: events.hasExpectedEvents,
          expectedEventsKeys: Object.keys(events.expectedEvents || {}),
          allEventsCount: events.allEvents?.length || 0,
          allEvents: events.allEvents?.map((e: any) => ({ 
            eventName: e.eventName, 
            contractAddress: e.contractAddress,
            logIndex: e.logIndex 
          })) || []
        });
        
        // Debug: Log the specific expected events
        if (events.expectedEvents) {
          console.log(`🔍 [${this.testId}] DEBUG: Expected events structure:`, events.expectedEvents);
        }
        
        const permissionAddedEvent = events.expectedEvents.PermissionAdded;
        
        if (!permissionAddedEvent) {
          console.error(`❌ [${this.testId}] DEBUG: PermissionAdded event missing!`);
          console.error(`❌ [${this.testId}] DEBUG: Available expected events:`, Object.keys(events.expectedEvents || {}));
          console.error(`❌ [${this.testId}] DEBUG: All events:`, events.allEvents);
          
          throw new Error(
            `PermissionAdded event not found in transaction events for wallet ${walletAddress}, tx ${txHash}. Available events: ${Object.keys(events.expectedEvents || {}).join(', ')}. All events: ${events.allEvents?.map((e: any) => e.eventName).join(', ') || 'none'}`,
          );
        }
        
        console.log(`✅ [${this.testId}] DEBUG: PermissionAdded event found:`, permissionAddedEvent);
        
        const permissionId = permissionAddedEvent.permissionId;

        if (!permissionId) {
          throw new Error(
            `Permission ID not found in PermissionAdded event for wallet ${walletAddress}, tx ${txHash}. Event data: ${JSON.stringify(permissionAddedEvent)}`,
          );
        }
        
        console.log(`✅ [${this.testId}] DEBUG: Permission ID extracted: ${permissionId}`);
      

        // Convert bigint to string for API compatibility
        const permissionIdStr = permissionId.toString();

        this.callbacks.onStatusUpdate(
          `[${this.testId}] Permission ID received: ${permissionIdStr}`,
        );
        return { 
          permissionId: permissionIdStr,
          transactionHash: txHash 
        };
      } catch (waitError) {
        // Include wallet addresses and transaction hash in error for debugging
        throw new Error(
          `Transaction ${txHash} failed for end-user ${walletAddress} (submitted by relayer ${relayerAddress}): ${
            waitError instanceof Error ? waitError.message : "Unknown error"
          }`,
        );
      }
    } catch (error) {
      // This catches errors from handleRelayerOperation
      const walletAddress = this.walletClient.account?.address || 'unknown';
      const relayerWalletClient = (this.vanaRelayer as any).walletClient;
      const relayerAddress = relayerWalletClient?.account?.address || 'unknown';
      throw new Error(
        `Transaction submission failed for end-user ${walletAddress} (relayer: ${relayerAddress}): ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  async submitInferenceRequest(permissionId: string, serverUrl: string): Promise<string> {
    this.callbacks.onStatusUpdate(`[${this.testId}] Submitting AI inference request...`);

    try {
      const inferenceUrl = `${serverUrl}/api/trusted-server`;
      console.log(`🔍 [${this.testId}] DEBUG: Attempting inference submission to: ${inferenceUrl}`);
      console.log(`🔍 [${this.testId}] DEBUG: Permission ID: ${permissionId}`);
      
      const response = await fetch(inferenceUrl, {
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
  ): Promise<{ transactionHash?: string; permissionId?: string }> {
    let transactionHash: string | undefined;
    let permissionId: string | undefined;
    
    try {
      // Step 0: Validate data against schema if provided
      if (schemaId && schemaId > 0) {
        this.callbacks.onStatusUpdate(`[${this.testId}] Validating data against schema...`);
        try {
          // Get schema metadata from blockchain (use relayer SDK for blockchain reads)
          const schema = await this.vanaRelayer.schemas.get(schemaId);
          
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
      const txResult = await this.executeTransaction(
        fileUrl,
        userAddress,
        prompt,
        schemaId,
      );
      transactionHash = txResult.transactionHash;
      permissionId = txResult.permissionId;

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
      
      // Return transaction hash and permission ID
      return { 
        transactionHash: transactionHash,
        permissionId: permissionId 
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      this.callbacks.onError(errorMessage);
      this.callbacks.onStatusUpdate(`[${this.testId}] Flow failed: ${errorMessage}`);
      throw error;
    }
  }
}
