import {
  VanaInstance,
  generateEncryptionKey,
  encryptBlobWithSignedKey,
  encryptWithWalletPublicKey,
  BrowserPlatformAdapter,
  DEFAULT_ENCRYPTION_SEED,
} from "@opendatalabs/vana-sdk/browser";
import type { WalletClient } from "viem";

const DEMO_FILE_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/refs/heads/main/model_prices_and_context_window.json";

/**
 * Get network configuration for blockchain explorer URLs
 * Browser-compatible version of the network config
 */
function getNetworkConfig() {
  const isTestnet = !!process.env.NEXT_PUBLIC_MOKSHA;
  return {
    networkName: isTestnet ? "moksha" : "mainnet",
    explorerUrl: isTestnet
      ? "https://moksha.vanascan.io"
      : "https://vanascan.io",
    chainId: isTestnet ? 14800 : 1480,
  };
}

/**
 * Extract permissionId from transaction logs using Blockscout API with retries
 *
 * This function handles the delay between transaction relay and blockchain indexing
 * by implementing exponential backoff retry logic.
 *
 * @param txHash - The transaction hash to fetch logs for
 * @returns Promise<string | undefined> - The extracted permissionId or undefined if not found
 */
async function getPermissionIdFromTransactionLogs(
  txHash: string,
): Promise<string | undefined> {
  // Get network configuration
  const { explorerUrl } = getNetworkConfig();

  // Retry configuration
  const maxRetries = 10;
  const baseDelay = 1000; // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(
        `${explorerUrl}/api/v2/transactions/${txHash}/logs`,
        {
          headers: { accept: "application/json" },
        },
      );

      if (response.ok) {
        const data = await response.json();

        // Check if transaction is indexed and has logs
        if (data.items && data.items.length > 0) {
          // Find the PermissionAdded event in the logs
          const permissionAddedLog = data.items.find(
            (log: { decoded?: { method_call?: string } }) =>
              log.decoded?.method_call?.includes("PermissionAdded"),
          );

          if (permissionAddedLog?.decoded?.parameters) {
            const permissionIdParam = (
              permissionAddedLog.decoded.parameters as {
                name: string;
                value: string;
              }[]
            ).find((param) => param.name === "permissionId");

            if (permissionIdParam?.value) {
              return permissionIdParam.value;
            }
          }
        }
      }

      // If this isn't the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (apiError) {
      console.warn(`API error on attempt ${attempt}:`, apiError);

      // If this isn't the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.warn("Could not extract permissionId after all retries");
  return undefined;
}

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

  async downloadDemoFile(): Promise<string> {
    this.callbacks.onStatusUpdate("Downloading demo file...");

    try {
      const response = await fetch(DEMO_FILE_URL);
      if (!response.ok) {
        throw new Error(`Failed to download demo file: ${response.statusText}`);
      }

      const data = await response.json();
      const jsonString = JSON.stringify(data, null, 2);

      this.callbacks.onStatusUpdate("Demo file downloaded successfully");
      return jsonString;
    } catch (error) {
      throw new Error(
        `Demo file download failed: ${
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
      const fileUrl = await this.vana.data.uploadToStorage(
        encryptedData,
        fileName,
      );

      this.callbacks.onStatusUpdate("File uploaded to storage successfully");
      return fileUrl;
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
      // Create grant data following datawallet pattern
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
      const fileUrl = await this.vana.data.uploadToStorage(
        grantBlob,
        grantFileName,
      );

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
  ): Promise<string> {
    this.callbacks.onStatusUpdate("Preparing data portability transaction...");

    try {
      // First, create and upload the grant file
      const operation = "llm_inference";
      const parameters = {
        prompt:
          "What is the best light weight model to use for coding?: {{data}}",
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

      const transactionHash =
        await this.vana.permissions.submitAddServerFilesAndPermissions({
          granteeId: BigInt(granteeId),
          grant: grantUrl,
          fileUrls: [fileUrl],
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

      this.callbacks.onStatusUpdate(
        `Batch transaction completed: ${transactionHash}`,
      );

      // Extract permission ID from transaction logs using blockchain polling
      this.callbacks.onStatusUpdate(
        "Extracting permission ID from transaction logs...",
      );

      const permissionId =
        await getPermissionIdFromTransactionLogs(transactionHash);

      if (!permissionId) {
        throw new Error(
          "Permission ID not found in transaction logs. Cannot proceed with inference request.",
        );
      }

      this.callbacks.onStatusUpdate(`Permission ID extracted: ${permissionId}`);
      return permissionId;
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
      console.error("🔍 Debug - Inference submission failed:", error);
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
        if (data?.output?.status !== "processing") {
          this.callbacks.onStatusUpdate("AI inference completed!");
          return JSON.stringify(data.output?.result || data, null, 2);
        } else {
          this.callbacks.onStatusUpdate(
            `Polling attempt ${attempt}/${maxAttempts}: Still processing...`,
          );

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
          }
        }
      } catch (error) {
        console.warn(`Polling attempt ${attempt} failed:`, error);

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

  async executeCompleteFlow(userAddress: string): Promise<void> {
    try {
      // Step 1: Download demo file
      const fileData = await this.downloadDemoFile();

      // Step 2: Encrypt file with wallet signature
      const { encryptedBlob, encryptionKey } = await this.encryptFile(fileData);
      this.encryptionKey = encryptionKey;

      // Step 3: Upload to storage (Google Drive or IPFS)
      const fileUrl = await this.uploadToStorage(encryptedBlob);

      // Step 4: Execute blockchain transaction with permissions
      const permissionId = await this.executeTransaction(fileUrl, userAddress);

      // Step 5: Submit AI inference request
      const operationId = await this.submitInferenceRequest(permissionId);

      // Step 6: Poll for AI inference results
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
