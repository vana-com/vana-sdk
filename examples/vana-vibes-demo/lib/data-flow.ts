import {
  VanaInstance,
  generateEncryptionKey,
  encryptBlobWithSignedKey,
  encryptWithWalletPublicKey,
  BrowserPlatformAdapter,
  DEFAULT_ENCRYPTION_SEED,
  validateDataAgainstSchema,
} from "@opendatalabs/vana-sdk/browser";
import type { WalletClient } from "viem";

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
    customPrompt: string,
    schemaId?: number | null,
  ): Promise<string> {
    this.callbacks.onStatusUpdate("Preparing data portability transaction...");

    try {
      // First, create and upload the grant file
      const operation = "llm_inference";
      const parameters = {
        prompt: customPrompt,
      };
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
        serverInfo.public_key,
        this.platformAdapter,
      );

      const granteeId = process.env.NEXT_PUBLIC_DEFAULT_GRANTEE_ID;
      if (!granteeId) {
        throw new Error(
          "NEXT_PUBLIC_DEFAULT_GRANTEE_ID environment variable is not set",
        );
      }

      // Use provided schema ID or fall back to environment variable or 0
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

      this.callbacks.onStatusUpdate(`Transaction submitted: ${txHandle.hash}`);

      // Wait for transaction confirmation and extract permission ID from events
      this.callbacks.onStatusUpdate(
        "Waiting for transaction confirmation and permission ID...",
      );

      const events = await txHandle.waitForEvents();
      const permissionId = events.permissionId;

      if (!permissionId) {
        throw new Error(
          "Permission ID not found in transaction events. Cannot proceed with inference request.",
        );
      }

      // Convert bigint to string for API compatibility
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

  async submitInferenceRequest(permissionId: string): Promise<string> {
    this.callbacks.onStatusUpdate("Submitting AI inference request...");

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
        throw new Error(result.error || "API request failed");
      }

      if (!result.data?.id) {
        throw new Error("Operation ID not found in inference response");
      }

      this.callbacks.onStatusUpdate(
        `Inference request submitted. Operation ID: ${result.data.id}`,
      );
      return result.data.id; // Return operationId for polling
    } catch (error) {
      console.error("Debug - Inference submission failed:", error);
      throw new Error(
        `Inference submission failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  async pollForResults(operationId: string): Promise<string> {
    this.callbacks.onStatusUpdate("Waiting for AI inference results...");

    const maxAttempts = 30;
    const pollInterval = 5000; // 5 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch("/api/trusted-server/poll", {
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
          this.callbacks.onStatusUpdate("AI inference completed!");
          return JSON.stringify(data?.result || data, null, 2);
        } else {
          this.callbacks.onStatusUpdate(
            `Polling attempt ${attempt}/${maxAttempts}: Still processing...`,
          );

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
          }
        }
      } catch {
        if (attempt < maxAttempts) {
          this.callbacks.onStatusUpdate(
            `Polling attempt ${attempt} failed, retrying...`,
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

  async executeCompleteFlow(
    userAddress: string,
    userData: string,
    prompt: string,
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
        prompt,
        schemaId,
      );

      // Step 4: Submit AI inference request
      const operationId = await this.submitInferenceRequest(permissionId);

      // Step 5: Poll for AI inference results
      const result = await this.pollForResults(operationId);

      this.callbacks.onResultUpdate(result);
      this.callbacks.onStatusUpdate(
        "Data portability flow completed successfully!",
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      this.callbacks.onError(errorMessage);
      this.callbacks.onStatusUpdate(`Flow failed: ${errorMessage}`);
      throw error;
    }
  }
}
