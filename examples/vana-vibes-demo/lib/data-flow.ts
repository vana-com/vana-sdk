import type { VanaInstance } from "@opendatalabs/vana-sdk/browser";
import {
  generateEncryptionKey,
  encryptBlobWithSignedKey,
  encryptWithWalletPublicKey,
  BrowserPlatformAdapter,
  DEFAULT_ENCRYPTION_SEED,
  validateDataAgainstSchema,
} from "@opendatalabs/vana-sdk/browser";
import type { WalletClient } from "viem";

// Extend Window interface for operation ID storage

interface FlowStepCallbacks {
  onStatusUpdate: (status: string) => void;
  onResultUpdate: (result: string) => void;
  onError: (error: string) => void;
}

export class DataPortabilityFlow {
  private vana: VanaInstance;
  private walletClient: WalletClient;
  private callbacks: FlowStepCallbacks;
  private platformAdapter: BrowserPlatformAdapter;
  private encryptionKey?: string;

  constructor(
    vana: VanaInstance,
    walletClient: WalletClient,
    callbacks: FlowStepCallbacks,
  ) {
    this.vana = vana;
    this.walletClient = walletClient;
    this.callbacks = callbacks;
    this.platformAdapter = new BrowserPlatformAdapter();
  }

  async processUserData(userData: string): Promise<string> {
    this.callbacks.onStatusUpdate("Processing user data...");

    try {
      this.callbacks.onStatusUpdate("User data processed successfully");
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
    this.callbacks.onStatusUpdate("Encrypting file with wallet signature...");

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
        "File encrypted successfully with wallet signature",
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
    this.callbacks.onStatusUpdate("Uploading encrypted file to storage...");

    try {
      // Use the data controller upload method
      const fileName = `vana_demo_${Date.now()}.json`;
      const uploadResult = await this.vana.data.uploadToStorage(
        encryptedData,
        fileName,
      );

      this.callbacks.onStatusUpdate("File uploaded to storage successfully");
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
    this.callbacks.onStatusUpdate("Creating and uploading grant file...");

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
      const grantFileName = `grant_${Date.now()}.json`;
      const uploadResult = await this.vana.data.uploadToStorage(
        grantBlob,
        grantFileName,
      );
      const fileUrl = uploadResult.url;

      this.callbacks.onStatusUpdate("Grant file uploaded successfully");
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
    operation: string,
    parameters: Record<string, unknown>,
    schemaId?: number | null,
  ): Promise<string> {
    this.callbacks.onStatusUpdate("Preparing data portability transaction...");

    try {
      const appAddress = process.env.NEXT_PUBLIC_DATA_WALLET_APP_ADDRESS;
      if (!appAddress) {
        throw new Error(
          "NEXT_PUBLIC_DATA_WALLET_APP_ADDRESS environment variable is not set",
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
        serverInfo.publicKey,
        this.platformAdapter,
      );

      const granteeId = process.env.NEXT_PUBLIC_DEFAULT_GRANTEE_ID;
      if (!granteeId) {
        throw new Error(
          "NEXT_PUBLIC_DEFAULT_GRANTEE_ID environment variable is not set",
        );
      }

      const finalSchemaId =
        schemaId ??
        (process.env.NEXT_PUBLIC_VIBES_SCHEMA_ID
          ? parseInt(process.env.NEXT_PUBLIC_VIBES_SCHEMA_ID, 10)
          : 0);

      const txHandle =
        await this.vana.permissions.submitAddServerFilesAndPermissions({
          granteeId: BigInt(granteeId),
          grant: grantUrl,
          fileUrls: [fileUrl],
          schemaIds: [finalSchemaId],
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
        });

      this.callbacks.onStatusUpdate(`Transaction submitted: ${txHandle.hash}`);
      this.callbacks.onStatusUpdate(
        "Waiting for transaction confirmation and permission ID...",
      );

      const result = await this.vana.waitForTransactionEvents(txHandle);
      const permissionId = result.expectedEvents?.PermissionAdded?.permissionId;

      if (!permissionId) {
        throw new Error(
          "Permission ID not found in transaction events. Cannot proceed with inference request.",
        );
      }

      const permissionIdStr = permissionId.toString();
      this.callbacks.onStatusUpdate(
        `Permission ID received: ${permissionIdStr}`,
      );
      return permissionIdStr;
    } catch (error) {
      throw new Error(
        `Transaction failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  async submitInferenceRequest(permissionId: string): Promise<unknown> {
    this.callbacks.onStatusUpdate("Processing AI inference request...");

    try {
      const response = await fetch("/api/trusted-server", {
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
        throw new Error(result.error ?? "API request failed");
      }

      this.callbacks.onStatusUpdate("AI inference completed!");
      const inferenceResult = result.data?.result ?? result.data;

      // Include operation ID in result for artifact downloads
      const finalResult = result.data?.id
        ? { ...inferenceResult, id: result.data.id }
        : inferenceResult;

      this.callbacks.onResultUpdate(JSON.stringify(finalResult, null, 2));
      return inferenceResult;
    } catch (error) {
      console.error("Debug - Inference submission failed:", error);
      throw new Error(
        `Inference submission failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  async executeFlow(
    userAddress: string,
    userData: string,
    grantConfig: {
      operation: string;
      parameters: Record<string, unknown>;
    },
    schemaId?: number | null,
  ): Promise<void> {
    try {
      // Step 0: Validate data against schema if provided
      if (schemaId && schemaId > 0) {
        this.callbacks.onStatusUpdate("Validating data against schema...");
        const schema = await this.vana.schemas.get(schemaId);
        validateDataAgainstSchema(JSON.parse(userData), schema);
        this.callbacks.onStatusUpdate("Data validation successful");
      }

      // Step 1: Encrypt file with wallet signature
      const { encryptedBlob, encryptionKey } = await this.encryptFile(userData);
      this.encryptionKey = encryptionKey;

      // Step 2: Upload to storage (Google Drive or IPFS)
      const fileUrl = await this.uploadToStorage(encryptedBlob);

      // Step 3: Execute blockchain transaction with permissions
      const permissionId = await this.executeTransaction(
        fileUrl,
        userAddress,
        grantConfig.operation,
        grantConfig.parameters,
        schemaId,
      );

      // Step 4: Submit AI inference request and wait for result
      await this.submitInferenceRequest(permissionId);

      const isAgent =
        grantConfig.operation === "prompt_gemini_agent" ||
        grantConfig.operation === "prompt_qwen_agent";
      const agentName =
        grantConfig.operation === "prompt_gemini_agent" ? "Gemini" : "Qwen";
      this.callbacks.onStatusUpdate(
        isAgent
          ? `${agentName} agent analysis completed successfully!`
          : "Data portability flow completed successfully!",
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      this.callbacks.onError(errorMessage);
      this.callbacks.onStatusUpdate(`Flow failed: ${errorMessage}`);
      throw error;
    }
  }

  // Convenience methods for backward compatibility
  async executeCompleteFlow(
    userAddress: string,
    userData: string,
    prompt: string,
    schemaId?: number | null,
  ): Promise<void> {
    return this.executeFlow(
      userAddress,
      userData,
      { operation: "llm_inference", parameters: { prompt } },
      schemaId,
    );
  }

  async executeGeminiAgentFlow(
    userAddress: string,
    userData: string,
    goal: string,
    schemaId?: number | null,
  ): Promise<void> {
    return this.executeFlow(
      userAddress,
      userData,
      { operation: "prompt_gemini_agent", parameters: { goal } },
      schemaId,
    );
  }

  async executeQwenAgentFlow(
    userAddress: string,
    userData: string,
    goal: string,
    schemaId?: number | null,
  ): Promise<void> {
    return this.executeFlow(
      userAddress,
      userData,
      { operation: "prompt_qwen_agent", parameters: { goal } },
      schemaId,
    );
  }
}
