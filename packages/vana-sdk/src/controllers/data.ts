import { Address, getContract, decodeEventLog, Hash } from "viem";

import {
  UserFile,
  UploadParams,
  UploadResult,
  UploadEncryptedFileResult,
  Schema,
  Refiner,
  AddSchemaParams,
  AddSchemaResult,
  AddRefinerParams,
  AddRefinerResult,
  UpdateSchemaIdParams,
  UpdateSchemaIdResult,
  TrustedServer,
  GetUserTrustedServersParams,
  GetUserTrustedServersResult,
  EncryptedUploadParams,
  UnencryptedUploadParams,
} from "../types/index";
import { FilePermissionResult } from "../types/transactionResults";
import { parseTransactionResult } from "../utils/transactionParsing";
import { ControllerContext } from "./permissions";
import { getContractAddress } from "../config/addresses";
import { getAbi } from "../abi";
import {
  generateEncryptionKey,
  decryptBlobWithSignedKey,
  DEFAULT_ENCRYPTION_SEED,
  encryptBlobWithSignedKey,
  encryptWithWalletPublicKey,
  decryptWithWalletPrivateKey,
} from "../utils/encryption";
import {
  validateDataSchema,
  validateDataAgainstSchema,
  fetchAndValidateSchema,
  SchemaValidationError,
  type DataSchema,
} from "../utils/schemaValidation";

/**
 * GraphQL query response types for the new subgraph entities
 */
interface SubgraphFile {
  id: string;
  url: string;
  schemaId: string;
  addedAtBlock: string;
  addedAtTimestamp: string;
  transactionHash: string;
  owner: {
    id: string;
  };
}

interface SubgraphPermission {
  id: string;
  grant: string;
  nonce: string;
  signature: string;
  addedAtBlock: string;
  addedAtTimestamp: string;
  transactionHash: string;
  user: {
    id: string;
  };
}

interface SubgraphTrustedServer {
  id: string;
  serverAddress: string;
  serverUrl: string;
  trustedAt: string;
  user: {
    id: string;
  };
}

interface SubgraphUser {
  id: string;
  files: SubgraphFile[];
  permissions: SubgraphPermission[];
  trustedServers: SubgraphTrustedServer[];
}

interface SubgraphResponse {
  data?: {
    user?: SubgraphUser;
  };
  errors?: Array<{ message: string }>;
}

/**
 * Manages encrypted user data files and their blockchain registration on the Vana network.
 *
 * @remarks
 * This controller handles the complete file lifecycle from encrypted upload to
 * blockchain registration and decryption. It provides methods for querying user files,
 * uploading new encrypted content, managing file schemas, and handling permissions for
 * secure data sharing. All operations respect the user's privacy through client-side
 * encryption before any data leaves the user's device.
 *
 * The controller integrates with multiple storage providers (IPFS, Pinata, Google Drive)
 * and supports both gasless transactions via relayers and direct blockchain interaction.
 * File metadata and access permissions are stored on the Vana blockchain while encrypted
 * file content is stored on decentralized storage networks.
 *
 * **Method Selection:**
 * - `upload()` handles encryption, storage, and blockchain registration automatically
 * - `getUserFiles()` queries existing file metadata from blockchain and subgraph
 * - `decryptFile()` decrypts files for which you have access permissions
 * - `getFileById()` retrieves specific file metadata when you have the file ID
 *
 * **Storage Requirements:**
 * Methods requiring storage configuration: `upload()`
 * Methods working without storage: `getUserFiles()`, `decryptFile()`, `getFileById()`
 * @example
 * ```typescript
 * // Upload an encrypted file with automatic schema validation
 * const result = await vana.data.upload({
 *   content: "My personal data",
 *   filename: "personal-data.json"
 * });
 *
 * // Query files owned by a user
 * const files = await vana.data.getUserFiles({
 *   owner: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
 * });
 *
 * // Decrypt accessible file content
 * const decryptedData = await vana.data.decryptFile(files[0]);
 * ```
 * @category Data Management
 * @see {@link [URL_PLACEHOLDER] | Vana Data Registry Documentation} for conceptual overview
 */
export class DataController {
  constructor(private readonly context: ControllerContext) {}

  /**
   * Uploads user data with automatic encryption and blockchain registration.
   *
   * @remarks
   * This is the primary method for uploading user data to the Vana network. It handles
   * the complete workflow including content normalization, schema validation, encryption,
   * storage upload, file permission granting, and blockchain registration.
   *
   * The method automatically:
   * - Normalizes input content to a Blob
   * - Validates data against schema if provided
   * - Generates encryption keys and encrypts the data
   * - Uploads to the configured storage provider
   * - Grants file decryption permissions to specified accounts
   * - Registers the file on the blockchain
   *
   * IMPORTANT: The permissions parameter only grants decryption access to the file.
   * To grant operation permissions (like "llm_inference"), use vana.permissions.grant()
   * after uploading. This separation ensures clear distinction between:
   * - File permissions: Who can decrypt and read the encrypted file
   * - Operation permissions: What operations can be performed on the data
   *
   * @param params - Upload parameters including content, filename, schema, and permissions
   * @param params.permissions.publicKey - The recipient's public key for encryption.
   *   Obtain via `vana.server.getIdentity(userAddress).public_key` for personal servers.
   * @param params.permissions.grantee - The application's wallet address that will access the data.
   * @returns Promise resolving to upload results with file ID and transaction hash
   * @throws {Error} When wallet is not connected or storage is not configured.
   *   Configure storage providers in VanaConfig or check wallet connection.
   * @throws {SchemaValidationError} When data format doesn't match the specified schema.
   *   Verify data structure matches schema definition from `vana.schemas.get(schemaId)`.
   * @throws {Error} When upload or blockchain registration fails.
   *   Check network connection and storage provider availability.
   * @example
   * ```typescript
   * // Basic file upload
   * const result = await vana.data.upload({
   *   content: "My personal data",
   *   filename: "diary.txt"
   * });
   *
   * // Upload with schema validation
   * const result = await vana.data.upload({
   *   content: { name: "John", age: 30 },
   *   filename: "profile.json",
   *   schemaId: 1
   * });
   *
   * // Upload with file permissions (for decryption access)
   * const result = await vana.data.upload({
   *   content: "Data for AI analysis",
   *   filename: "analysis.txt",
   *   permissions: [{
   *     account: "0x1234...", // Server address that can decrypt
   *     publicKey: "0x04..."  // Server's public key for encryption
   *   }]
   * });
   *
   * // After upload, grant operation permissions separately:
   * // await vana.permissions.grant({
   * //   grantee: "0x1234...",
   * //   fileIds: [result.fileId],
   * //   operation: "llm_inference",
   * //   parameters: { model: "gpt-4" }
   * // });
   *
   * // Upload without encryption (public data)
   * const result = await vana.data.upload({
   *   content: "Public data",
   *   filename: "public.txt",
   *   encrypt: false
   *   // No permissions needed for public unencrypted data
   * });
   *
   * // Upload on behalf of another user (delegation)
   * const result = await vana.data.upload({
   *   content: "User's data",
   *   filename: "delegated.txt",
   *   owner: "0x5678...", // Different from connected wallet
   *   permissions: [{
   *     grantee: "0x1234...",
   *     operation: "process",
   *     parameters: { type: "analysis" },
   *     publicKey: "0x04..."
   *   }]
   * });
   * ```
   */
  async upload(params: EncryptedUploadParams): Promise<UploadResult>;
  async upload(params: UnencryptedUploadParams): Promise<UploadResult>;
  async upload(params: UploadParams): Promise<UploadResult>;
  async upload(params: UploadParams): Promise<UploadResult> {
    const {
      content,
      filename,
      schemaId,
      permissions = [],
      encrypt = true,
      providerName,
      owner,
    } = params;

    try {
      // Step 1: Normalize content to Blob
      let blob: Blob;
      if (content instanceof Blob) {
        blob = content;
      } else if (typeof content === "string") {
        blob = new Blob([content], { type: "text/plain" });
      } else if (content instanceof Buffer) {
        blob = new Blob([content], { type: "application/octet-stream" });
      } else {
        // Handle objects by JSON stringifying them
        blob = new Blob([JSON.stringify(content)], {
          type: "application/json",
        });
      }

      let isValid = true;
      let validationErrors: string[] = [];

      // Step 2: Schema validation if provided
      if (schemaId !== undefined) {
        try {
          const schema = await this.getSchema(schemaId);
          const response = await fetch(schema.definitionUrl);
          if (!response.ok) {
            throw new Error(
              `Failed to fetch schema definition: ${response.status}`,
            );
          }
          const schemaDefinition = await response.json();

          // Convert to DataSchema format
          const dataSchema = {
            name: schema.name,
            version: "1.0.0",
            dialect: "json" as const,
            schema: schemaDefinition,
          };

          // Parse content for validation
          let parsedContent;
          if (typeof content === "string") {
            try {
              parsedContent = JSON.parse(content);
            } catch {
              parsedContent = content;
            }
          } else {
            parsedContent = content;
          }

          // Validate against schema
          validateDataAgainstSchema(parsedContent, dataSchema);
        } catch (error) {
          isValid = false;
          validationErrors = [
            error instanceof Error ? error.message : "Schema validation failed",
          ];
        }
      }

      // Step 3: Handle encryption
      let finalBlob = blob;
      if (encrypt) {
        // Generate encryption key
        const encryptionKey = await generateEncryptionKey(
          this.context.walletClient,
          this.context.platform,
          DEFAULT_ENCRYPTION_SEED,
        );

        // Encrypt the data
        finalBlob = await encryptBlobWithSignedKey(
          blob,
          encryptionKey,
          this.context.platform,
        );
      }

      // Step 4: Upload to storage
      if (!this.context.storageManager) {
        // Use centralized validation if available, otherwise fall back to old behavior
        if (this.context.validateStorageRequired) {
          this.context.validateStorageRequired();
          // The validateStorageRequired method throws, so this line should never be reached
          // but TypeScript doesn't know that, so we need this fallback
          throw new Error("Storage validation failed");
        } else {
          throw new Error(
            "Storage manager not configured. Please provide storage providers in VanaConfig.",
          );
        }
      }

      const uploadResult = await this.context.storageManager.upload(
        finalBlob,
        filename,
        providerName,
      );

      // Step 5: Register on blockchain
      const userAddress = owner || (await this.getUserAddress());

      // Prepare encrypted permissions if provided
      let encryptedPermissions: Array<{ account: Address; key: string }> = [];
      if (permissions.length > 0 && encrypt) {
        const userEncryptionKey = await generateEncryptionKey(
          this.context.walletClient,
          this.context.platform,
          DEFAULT_ENCRYPTION_SEED,
        );

        encryptedPermissions = await Promise.all(
          permissions.map(async (permission) => {
            const encryptedKey = await encryptWithWalletPublicKey(
              userEncryptionKey,
              permission.publicKey,
              this.context.platform,
            );

            return {
              account: permission.account,
              key: encryptedKey,
            };
          }),
        );
      }

      // Determine which registration method to use
      let result;

      // Preferred: Use the new comprehensive relay callback if it exists
      if (this.context.relayerCallbacks?.submitFileAdditionComplete) {
        result = await this.context.relayerCallbacks.submitFileAdditionComplete(
          {
            url: uploadResult.url,
            userAddress: userAddress,
            permissions: encryptedPermissions,
            schemaId: schemaId || 0,
            ownerAddress: owner,
          },
        );

        // Legacy: Use the old relay callback if it exists
      } else if (this.context.relayerCallbacks?.submitFileAddition) {
        const needsComplexRegistration =
          schemaId !== undefined || encryptedPermissions.length > 0;
        if (needsComplexRegistration) {
          throw new Error(
            "The configured relay callback does not support schemas or permissions. Please update your relay server implementation to provide the `submitFileAdditionComplete` callback.",
          );
        }
        result = await this.context.relayerCallbacks.submitFileAddition(
          uploadResult.url,
          userAddress,
        );

        // Fallback: No relay support, use a direct transaction
      } else {
        result = await this.addFileWithPermissionsAndSchema(
          uploadResult.url,
          userAddress,
          encryptedPermissions,
          schemaId || 0,
        );
      }

      return {
        fileId: result.fileId,
        url: uploadResult.url,
        transactionHash: result.transactionHash as Hash,
        size: uploadResult.size,
        isValid,
        validationErrors:
          validationErrors.length > 0 ? validationErrors : undefined,
      };
    } catch (error) {
      throw new Error(
        `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Decrypts a file owned by the user using their wallet signature.
   *
   * @remarks
   * This is the high-level convenience method for decrypting user files, serving as the
   * symmetrical counterpart to the `upload` method. It handles the complete decryption
   * workflow including key generation, URL protocol detection, content fetching, and
   * decryption.
   *
   * The method automatically:
   * - Generates the decryption key from the user's wallet signature
   * - Determines the appropriate fetch method based on the file URL protocol
   * - Fetches the encrypted content from IPFS or standard HTTP URLs
   * - Decrypts the content using the generated key
   *
   * For IPFS URLs, the method uses gateway fallback for improved reliability. For
   * standard HTTP URLs, it uses a simple fetch. If you need custom authentication
   * headers or specific gateway configurations, use the low-level primitives directly.
   *
   * @param file - The user file to decrypt (typically from getUserFiles)
   * @param encryptionSeed - Optional custom encryption seed (defaults to Vana standard)
   * @returns Promise resolving to the decrypted file content as a Blob
   * @throws {Error} When the wallet is not connected
   * @throws {Error} When fetching the encrypted content fails
   * @throws {Error} When decryption fails (wrong key or corrupted data)
   * @example
   * ```typescript
   * // Basic file decryption
   * const files = await vana.data.getUserFiles({ owner: userAddress });
   * const decryptedBlob = await vana.data.decryptFile(files[0]);
   *
   * // Convert to text
   * const text = await decryptedBlob.text();
   * console.log('Decrypted content:', text);
   *
   * // Convert to JSON
   * const json = JSON.parse(await decryptedBlob.text());
   * console.log('Decrypted data:', json);
   *
   * // With custom encryption seed
   * const decryptedBlob = await vana.data.decryptFile(
   *   files[0],
   *   "My custom encryption seed"
   * );
   *
   * // Save to file (in Node.js)
   * const buffer = await decryptedBlob.arrayBuffer();
   * fs.writeFileSync('decrypted-file.txt', Buffer.from(buffer));
   * ```
   */
  async decryptFile(file: UserFile, encryptionSeed?: string): Promise<Blob> {
    try {
      // Step 1: Generate the decryption key from wallet signature
      const encryptionKey = await generateEncryptionKey(
        this.context.walletClient,
        this.context.platform,
        encryptionSeed || DEFAULT_ENCRYPTION_SEED,
      );

      // Step 2: Determine the protocol and fetch the encrypted content
      let encryptedBlob: Blob;

      try {
        if (file.url.startsWith("ipfs://")) {
          // Use IPFS fetcher with gateway fallback for reliability
          encryptedBlob = await this.fetchFromIPFS(file.url);
        } else {
          // Use standard fetch for HTTP/HTTPS URLs
          encryptedBlob = await this.fetch(file.url);
        }
      } catch (fetchError) {
        // Handle network errors
        const errorMessage =
          fetchError instanceof Error ? fetchError.message : "Unknown error";

        // Check for specific error types
        if (
          errorMessage.includes("Failed to fetch IPFS content") &&
          errorMessage.includes("from all gateways")
        ) {
          // IPFS gateway failures - treat as network error
          throw new Error(
            "Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions.",
          );
        } else if (errorMessage.includes("Empty response")) {
          throw new Error("File is empty or could not be retrieved");
        } else if (
          errorMessage.includes("Network error:") ||
          errorMessage.includes("Failed to fetch")
        ) {
          throw new Error(
            "Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions.",
          );
        } else if (errorMessage.includes("HTTP error!")) {
          const statusMatch = errorMessage.match(/status: (\d+)/);
          const status = statusMatch ? statusMatch[1] : "unknown";

          if (status === "500") {
            throw new Error(
              "Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions.",
            );
          } else if (status === "403") {
            throw new Error(
              "Access denied. You may not have permission to access this file",
            );
          } else if (status === "404") {
            throw new Error(
              "File not found: The encrypted file is no longer available at the stored URL.",
            );
          } else {
            throw new Error(
              "Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions.",
            );
          }
        }

        // Re-throw other errors
        throw fetchError;
      }

      // Check if blob is empty
      if (encryptedBlob.size === 0) {
        throw new Error("File is empty or could not be retrieved");
      }

      // Step 3: Decrypt the blob using the low-level primitive
      let decryptedBlob: Blob;
      try {
        decryptedBlob = await decryptBlobWithSignedKey(
          encryptedBlob,
          encryptionKey,
          this.context.platform,
        );
      } catch (decryptError) {
        const errorMessage =
          decryptError instanceof Error
            ? decryptError.message
            : "Unknown error";

        // Map decryption errors to user-friendly messages
        if (errorMessage.includes("not a valid OpenPGP message")) {
          throw new Error(
            "Invalid file format: This file doesn't appear to be encrypted with the Vana protocol",
          );
        } else if (errorMessage.includes("Session key decryption failed")) {
          throw new Error("Wrong encryption key");
        } else if (errorMessage.includes("Error decrypting message")) {
          throw new Error("Wrong encryption key");
        } else if (errorMessage.includes("File not found")) {
          throw new Error(
            "File not found: The encrypted file is no longer available",
          );
        } else {
          // Re-throw the original error for other cases
          throw decryptError;
        }
      }

      return decryptedBlob;
    } catch (error) {
      // If it's already one of our formatted errors, re-throw it
      if (
        error instanceof Error &&
        (error.message.includes("Network error:") ||
          error.message.includes("Invalid file format:") ||
          error.message.includes("Wrong encryption key") ||
          error.message.includes("Access denied") ||
          error.message.includes("File not found:") ||
          error.message.includes("File is empty"))
      ) {
        throw error;
      }

      // Otherwise, wrap it
      throw new Error(
        `Failed to decrypt file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Retrieves all data files owned by a specific user address.
   *
   * @remarks
   * This method queries the Vana subgraph to find files directly owned by the user.
   * It efficiently handles large datasets by using the File entity's owner field
   * and returns complete file metadata without additional contract calls.
   * @param params - The query parameters object
   * @param params.owner - The wallet address of the file owner to query
   * @param params.subgraphUrl - Optional subgraph URL to override the default endpoint
   * @returns A Promise that resolves to an array of UserFile objects with metadata
   * @throws {Error} When the subgraph is unavailable or returns invalid data
   * @example
   * ```typescript
   * // Query files for a specific user
   * const files = await vana.data.getUserFiles({
   *   owner: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
   * });
   *
   * files.forEach(file => {
   *   console.log(`File ${file.id}: ${file.url} (Schema: ${file.schemaId})`);
   * });
   * ```
   */
  async getUserFiles(params: {
    owner: Address;
    subgraphUrl?: string;
  }): Promise<UserFile[]> {
    const { owner, subgraphUrl } = params;

    // Use provided subgraph URL or default from context
    const graphqlEndpoint = subgraphUrl || this.context.subgraphUrl;

    if (!graphqlEndpoint) {
      throw new Error(
        "subgraphUrl is required. Please provide a valid subgraph endpoint or configure it in Vana constructor.",
      );
    }

    try {
      // Query the subgraph for user's files using the new File entity
      const query = `
        query GetUserFiles($userId: ID!) {
          user(id: $userId) {
            id
            files {
              id
              url
              schemaId
              addedAtBlock
              addedAtTimestamp
              transactionHash
              owner {
                id
              }
            }
          }
        }
      `;

      const response = await fetch(graphqlEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: {
            userId: owner.toLowerCase(), // Subgraph stores addresses in lowercase
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Subgraph request failed: ${response.status} ${response.statusText}`,
        );
      }

      const result = (await response.json()) as SubgraphResponse;

      if (result.errors) {
        throw new Error(
          `Subgraph errors: ${result.errors.map((e) => e.message).join(", ")}`,
        );
      }

      const user = result.data?.user;
      if (!user || !user.files?.length) {
        console.warn("No files found for user:", owner);
        return [];
      }

      // TODO: Investigate why this is necessary.
      // Convert subgraph data to UserFile format and deduplicate by file ID
      // Keep the latest entry for each unique file ID (highest timestamp)
      const fileMap = new Map<number, UserFile>();

      user.files.forEach((file) => {
        const fileId = parseInt(file.id);
        const userFile: UserFile = {
          id: fileId,
          url: file.url,
          ownerAddress: file.owner.id as Address,
          addedAtBlock: BigInt(file.addedAtBlock),
          schemaId: parseInt(file.schemaId),
          addedAtTimestamp: BigInt(file.addedAtTimestamp),
          transactionHash: file.transactionHash as Address,
        };

        // Keep the file with the latest timestamp for each ID
        const existing = fileMap.get(fileId);
        if (
          !existing ||
          (userFile.addedAtTimestamp &&
            existing.addedAtTimestamp &&
            userFile.addedAtTimestamp > existing.addedAtTimestamp)
        ) {
          fileMap.set(fileId, userFile);
        }
      });

      // Convert to array and sort by latest timestamp first
      const userFiles: UserFile[] = Array.from(fileMap.values()).sort((a, b) =>
        Number((b.addedAtTimestamp || 0n) - (a.addedAtTimestamp || 0n)),
      );

      // Successfully retrieved user files
      return userFiles;
    } catch (error) {
      console.error("Failed to fetch user files from subgraph:", error);
      throw new Error(
        `Failed to fetch user files from subgraph: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Retrieves a list of permissions granted by a user using the new subgraph entities.
   *
   * This method queries the Vana subgraph to find permissions directly granted by the user
   * using the new Permission entity. It efficiently handles millions of permissions by:
   * 1. Querying the subgraph for user's directly granted permissions
   * 2. Returning complete permission information from subgraph
   * 3. No need for additional contract calls as all data comes from subgraph
   *
   * @param params - Object containing the user address and optional subgraph URL
   * @param params.user - The wallet address of the user to query permissions for
   * @param params.subgraphUrl - Optional subgraph URL to override the default
   * @returns Promise resolving to an array of permission objects
   * @throws Error if subgraph is unavailable or returns invalid data
   */
  async getUserPermissions(params: {
    user: Address;
    subgraphUrl?: string;
  }): Promise<
    Array<{
      id: string;
      grant: string;
      nonce: bigint;
      signature: string;
      addedAtBlock: bigint;
      addedAtTimestamp: bigint;
      transactionHash: Address;
      user: Address;
    }>
  > {
    const { user, subgraphUrl } = params;

    // Use provided subgraph URL or default from context
    const graphqlEndpoint = subgraphUrl || this.context.subgraphUrl;

    if (!graphqlEndpoint) {
      throw new Error(
        "subgraphUrl is required. Please provide a valid subgraph endpoint or configure it in Vana constructor.",
      );
    }

    try {
      // Query the subgraph for user's permissions using the new Permission entity
      const query = `
        query GetUserPermissions($userId: ID!) {
          user(id: $userId) {
            id
            permissions {
              id
              grant
              nonce
              signature
              addedAtBlock
              addedAtTimestamp
              transactionHash
              user {
                id
              }
            }
          }
        }
      `;

      const response = await fetch(graphqlEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: {
            userId: user.toLowerCase(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Subgraph request failed: ${response.status} ${response.statusText}`,
        );
      }

      const result = (await response.json()) as SubgraphResponse;

      if (result.errors) {
        throw new Error(
          `Subgraph errors: ${result.errors.map((e) => e.message).join(", ")}`,
        );
      }

      const userData = result.data?.user;
      if (!userData || !userData.permissions?.length) {
        console.warn("No permissions found for user:", user);
        return [];
      }

      // Convert subgraph data directly to permission format
      const permissions = userData.permissions
        .map((permission) => ({
          id: permission.id,
          grant: permission.grant,
          nonce: BigInt(permission.nonce),
          signature: permission.signature,
          addedAtBlock: BigInt(permission.addedAtBlock),
          addedAtTimestamp: BigInt(permission.addedAtTimestamp),
          transactionHash: permission.transactionHash as Address,
          user: permission.user.id as Address,
        }))
        .sort((a, b) => Number(b.addedAtTimestamp - a.addedAtTimestamp)); // Latest first

      // Successfully retrieved user permissions
      return permissions;
    } catch (error) {
      console.error("Failed to fetch user permissions from subgraph:", error);
      throw new Error(
        `Failed to fetch user permissions from subgraph: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Retrieves a list of trusted servers for a user using the new subgraph entities.
   *
   * This method queries the Vana subgraph to find trusted servers directly associated with the user
   * with support for both subgraph and direct RPC queries.
   *
   * This method supports multiple query modes:
   * - 'subgraph': Fast query via subgraph (requires subgraphUrl)
   * - 'rpc': Direct contract queries (slower but no external dependencies)
   * - 'auto': Try subgraph first, fallback to RPC if unavailable
   *
   * @param params - Query parameters including user address and mode selection
   * @returns Promise resolving to trusted servers with metadata about the query
   * @throws Error if query fails in both modes (when using 'auto')
   * @example
   * ```typescript
   * // Use subgraph for fast queries
   * const result = await vana.data.getUserTrustedServers({
   *   user: '0x...',
   *   mode: 'subgraph',
   *   subgraphUrl: 'https://...'
   * });
   *
   * // Use direct RPC (no external dependencies)
   * const result = await vana.data.getUserTrustedServers({
   *   user: '0x...',
   *   mode: 'rpc',
   *   limit: 10
   * });
   *
   * // Auto-fallback mode
   * const result = await vana.data.getUserTrustedServers({
   *   user: '0x...',
   *   mode: 'auto' // tries subgraph first, falls back to RPC
   * });
   * ```
   */
  async getUserTrustedServers(
    params: GetUserTrustedServersParams,
  ): Promise<GetUserTrustedServersResult> {
    const { user, mode = "auto", limit = 50, offset = 0 } = params;
    const warnings: string[] = [];

    // Determine which query method to try first
    let trySubgraph = false;
    let tryRpc = false;

    switch (mode) {
      case "subgraph":
        trySubgraph = true;
        break;
      case "rpc":
        tryRpc = true;
        break;
      case "auto":
        trySubgraph = true;
        tryRpc = true; // fallback
        break;
    }

    // Try subgraph query first (if enabled)
    if (trySubgraph) {
      const subgraphUrl = params.subgraphUrl || this.context.subgraphUrl;

      // Check if subgraph URL is available
      if (!subgraphUrl) {
        if (mode === "subgraph") {
          // If specifically requested subgraph mode, throw error
          throw new Error(
            "subgraphUrl is required for subgraph mode. Please provide a valid subgraph endpoint or configure it in Vana constructor.",
          );
        }

        // In auto mode, add warning and skip to RPC
        warnings.push(
          "Subgraph mode not available for trusted servers - using direct contract calls",
        );
      } else {
        try {
          // Query trusted servers via subgraph
          const servers = await this._getUserTrustedServersViaSubgraph({
            user,
            subgraphUrl,
          });

          // Apply pagination if provided
          const paginatedServers = limit
            ? servers.slice(offset, offset + limit)
            : servers;

          return {
            servers: paginatedServers,
            usedMode: "subgraph",
            total: servers.length,
            hasMore: limit ? offset + limit < servers.length : false,
            warnings: warnings.length > 0 ? warnings : undefined,
          };
        } catch (error) {
          if (mode === "subgraph") {
            // If specifically requested subgraph mode, throw the error
            throw error;
          }

          // In auto mode, log the warning and try RPC fallback
          warnings.push(
            `Subgraph query failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          console.warn(
            "Subgraph query failed, falling back to RPC mode:",
            error,
          );
        }
      }
    }

    // Try RPC query (if enabled or as fallback)
    if (tryRpc) {
      try {
        const rpcResult = await this._getUserTrustedServersViaRpc({
          user,
          limit,
          offset,
        });

        return {
          servers: rpcResult.servers,
          usedMode: "rpc",
          total: rpcResult.total,
          hasMore: rpcResult.hasMore,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      } catch (error) {
        if (mode === "rpc") {
          // If specifically requested RPC mode, throw the error
          throw error;
        }

        // In auto mode with subgraph already failed, throw combined error
        throw new Error(
          `Both query methods failed. Subgraph: ${warnings[0] || "Unknown error"}. RPC: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    throw new Error("Invalid query mode specified");
  }

  /**
   * Internal method: Query trusted servers via subgraph
   *
   * @param params - Query parameters object
   * @param params.user - The user address to query trusted servers for
   * @param params.subgraphUrl - The subgraph URL endpoint to query
   * @returns Promise resolving to an array of trusted server objects
   */
  private async _getUserTrustedServersViaSubgraph(params: {
    user: Address;
    subgraphUrl?: string;
  }): Promise<TrustedServer[]> {
    const { user, subgraphUrl } = params;

    const graphqlEndpoint = subgraphUrl;
    if (!graphqlEndpoint) {
      throw new Error(
        "subgraphUrl is required for subgraph mode. Please provide a valid subgraph endpoint or configure it in Vana constructor.",
      );
    }

    try {
      // Query the subgraph for user's trusted servers
      const query = `
        query GetUserTrustedServers($userId: ID!) {
          user(id: $userId) {
            id
            trustedServers {
              id
              serverAddress
              serverUrl
              trustedAt
            }
          }
        }
      `;

      const response = await fetch(graphqlEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: {
            userId: user.toLowerCase(), // Subgraph stores addresses in lowercase
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Subgraph request failed: ${response.status} ${response.statusText}`,
        );
      }

      const result = (await response.json()) as SubgraphResponse;

      if (result.errors) {
        throw new Error(
          `Subgraph query errors: ${result.errors.map((e) => e.message).join(", ")}`,
        );
      }

      if (!result.data?.user) {
        // User not found in subgraph, return empty array
        return [];
      }

      // Map subgraph results to TrustedServer format
      return (result.data.user.trustedServers || []).map((server) => ({
        id: server.id,
        serverAddress: server.serverAddress as Address,
        serverUrl: server.serverUrl,
        trustedAt: BigInt(server.trustedAt),
        user,
      }));
    } catch (error) {
      console.error("Failed to query trusted servers from subgraph:", error);
      throw error;
    }
  }

  /**
   * Internal method: Query trusted servers via direct RPC
   *
   * @param params - Query parameters object
   * @param params.user - The user address to query trusted servers for
   * @param params.limit - Maximum number of results to return
   * @param params.offset - Number of results to skip for pagination
   * @returns Promise resolving to pagination result with servers, total count, and hasMore flag
   */
  private async _getUserTrustedServersViaRpc(params: {
    user: Address;
    limit: number;
    offset: number;
  }): Promise<{
    servers: TrustedServer[];
    total: number;
    hasMore: boolean;
  }> {
    const { user, limit, offset } = params;

    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const DataPermissionsAddress = getContractAddress(
        chainId,
        "DataPermissions",
      );
      const DataPermissionsAbi = getAbi("DataPermissions");

      // Get total count first
      const totalCount = (await this.context.publicClient.readContract({
        address: DataPermissionsAddress,
        abi: DataPermissionsAbi,
        functionName: "userServerIdsLength",
        args: [user],
      })) as bigint;

      const total = Number(totalCount);

      if (total === 0 || offset >= total) {
        return {
          servers: [],
          total,
          hasMore: false,
        };
      }

      // Calculate pagination
      const endIndex = Math.min(offset + limit, total);

      // Fetch server IDs using pagination
      const serverIdPromises: Promise<Address>[] = [];
      for (let i = offset; i < endIndex; i++) {
        const promise = this.context.publicClient.readContract({
          address: DataPermissionsAddress,
          abi: DataPermissionsAbi,
          functionName: "userServerIdsAt",
          args: [user, BigInt(i)],
        }) as Promise<Address>;
        serverIdPromises.push(promise);
      }

      const serverIds = await Promise.all(serverIdPromises);

      // Fetch server info for each ID
      const serverInfoPromises = serverIds.map(async (serverId, index) => {
        try {
          const serverInfo = (await this.context.publicClient.readContract({
            address: DataPermissionsAddress,
            abi: DataPermissionsAbi,
            functionName: "servers",
            args: [serverId],
          })) as { url: string };

          return {
            id: `${user.toLowerCase()}-${serverId.toLowerCase()}`,
            serverAddress: serverId,
            serverUrl: serverInfo.url,
            trustedAt: BigInt(Date.now()), // RPC mode doesn't have timestamp, use current time
            user,
            trustIndex: offset + index,
          };
        } catch {
          // If server info fails, return basic info
          return {
            id: `${user.toLowerCase()}-${serverId.toLowerCase()}`,
            serverAddress: serverId,
            serverUrl: "",
            trustedAt: BigInt(Date.now()),
            user,
            trustIndex: offset + index,
          };
        }
      });

      const servers = await Promise.all(serverInfoPromises);

      return {
        servers,
        total,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      throw new Error(
        `RPC query failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Gets the total number of files in the registry from the contract.
   *
   * @returns Promise resolving to the total file count
   * @example
   * ```typescript
   * const totalFiles = await vana.data.getTotalFilesCount();
   * console.log(`Total files in registry: ${totalFiles}`);
   *
   * // Use for pagination calculations
   * const filesPerPage = 20;
   * const totalPages = Math.ceil(totalFiles / filesPerPage);
   * console.log(`Total pages: ${totalPages}`);
   * ```
   */
  async getTotalFilesCount(): Promise<number> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");

      const dataRegistry = getContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        client: this.context.walletClient,
      });

      const count = await dataRegistry.read.filesCount();
      return Number(count);
    } catch (error) {
      // Re-throw validation errors (like missing chain ID)
      if (
        error instanceof Error &&
        error.message === "Chain ID not available"
      ) {
        throw error;
      }

      // Return 0 for contract errors
      console.error("Failed to fetch total files count:", error);
      return 0;
    }
  }

  /**
   * Retrieves details for a specific file by its ID.
   *
   * @param fileId - The file ID to look up
   * @returns Promise resolving to UserFile object
   * @example
   * ```typescript
   * try {
   *   const file = await vana.data.getFileById(123);
   *   console.log('File details:', {
   *     id: file.id,
   *     url: file.url,
   *     owner: file.ownerAddress,
   *     addedAt: file.addedAtBlock
   *   });
   * } catch (error) {
   *   console.error('File not found or error retrieving file:', error);
   * }
   * ```
   *
   * This method queries the DataRegistry contract directly
   * to get file details for any file ID, regardless of user ownership.
   * This is useful for file lookup functionality where users can search
   * for specific files by ID.
   */
  async getFileById(fileId: number): Promise<UserFile> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");

      const dataRegistry = getContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        client: this.context.walletClient,
      });

      const fileDetails = await dataRegistry.read.files([BigInt(fileId)]);

      if (!fileDetails) {
        throw new Error("File not found");
      }

      // Handle both array format (from contracts) and object format
      if (Array.isArray(fileDetails)) {
        const [id, url, ownerAddress, addedAtBlock] =
          fileDetails as unknown as [bigint, string, Address, bigint];
        if (id === BigInt(0)) {
          throw new Error("File not found");
        }
        return {
          id: Number(id),
          url: url,
          ownerAddress: ownerAddress,
          addedAtBlock: BigInt(addedAtBlock),
        };
      } else {
        // Object format
        if (!fileDetails.id || fileDetails.id === BigInt(0)) {
          throw new Error("File not found");
        }
        return {
          id: Number(fileDetails.id),
          ownerAddress: fileDetails.ownerAddress,
          url: fileDetails.url,
          addedAtBlock: BigInt(fileDetails.addedAtBlock),
        };
      }
    } catch (error) {
      console.error("Failed to fetch file by ID:", error);
      throw new Error(
        `Failed to fetch file ${fileId}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Uploads an encrypted file to storage and registers it on the blockchain.
   *
   * @deprecated Use vana.data.upload() instead for the high-level API with automatic encryption
   * @param encryptedFile - The encrypted file blob to upload
   * @param filename - Optional filename for the upload
   * @param providerName - Optional storage provider to use
   * @returns Promise resolving to upload result with file ID and storage URL
   *
   * This method handles the complete flow of:
   * 1. Uploading the encrypted file to the specified storage provider
   * 2. Registering the file URL on the DataRegistry contract via relayer
   * 3. Returning the assigned file ID and storage URL
   */
  async uploadEncryptedFile(
    encryptedFile: Blob,
    filename?: string,
    providerName?: string,
  ): Promise<UploadEncryptedFileResult> {
    try {
      // Check if storage manager is available
      if (!this.context.storageManager) {
        throw new Error(
          "Storage manager not configured. Please provide storage providers in VanaConfig.",
        );
      }

      // Step 1: Upload encrypted file to storage
      const uploadResult = await this.context.storageManager.upload(
        encryptedFile,
        filename,
        providerName,
      );

      // Step 2: Register file on blockchain (either via relayer or direct)
      const userAddress = await this.getUserAddress();

      if (this.context.relayerCallbacks?.submitFileAddition) {
        // Use callback for file addition
        const result = await this.context.relayerCallbacks.submitFileAddition(
          uploadResult.url,
          userAddress,
        );

        return {
          fileId: result.fileId,
          url: uploadResult.url,
          size: uploadResult.size,
          transactionHash: result.transactionHash,
        };
      } else {
        // Direct transaction (user pays gas)
        const chainId = this.context.walletClient.chain?.id;
        if (!chainId) {
          throw new Error("Chain ID not available");
        }

        const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
        const dataRegistryAbi = getAbi("DataRegistry");

        const txHash = await this.context.walletClient.writeContract({
          address: dataRegistryAddress,
          abi: dataRegistryAbi,
          functionName: "addFile",
          args: [uploadResult.url],
          account: this.context.walletClient.account || userAddress,
          chain: this.context.walletClient.chain || null,
        });

        // Wait for transaction receipt to parse the FileAdded event
        const receipt =
          await this.context.publicClient.waitForTransactionReceipt({
            hash: txHash,
            timeout: 30_000, // 30 seconds timeout
          });

        // Parse the FileAdded event to get the actual fileId
        let fileId = 0;
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: dataRegistryAbi,
              data: log.data,
              topics: log.topics,
            });

            if (decoded.eventName === "FileAdded") {
              fileId = Number(decoded.args.fileId);
              break;
            }
          } catch {
            // Ignore logs that don't match our ABI
            continue;
          }
        }

        return {
          fileId: fileId,
          url: uploadResult.url,
          size: uploadResult.size,
          transactionHash: txHash,
        };
      }
    } catch (error) {
      console.error("Failed to upload encrypted file:", error);
      throw new Error(
        `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Uploads an encrypted file to storage and registers it on the blockchain with a schema.
   *
   * @deprecated Use vana.data.upload() instead for the high-level API with automatic encryption and schema validation
   * @param encryptedFile - The encrypted file blob to upload
   * @param schemaId - The schema ID to associate with the file
   * @param filename - Optional filename for the upload
   * @param providerName - Optional storage provider to use
   * @returns Promise resolving to upload result with file ID and storage URL
   *
   * This method handles the complete flow of:
   * 1. Uploading the encrypted file to the specified storage provider
   * 2. Registering the file URL on the DataRegistry contract with a schema ID
   * 3. Returning the assigned file ID and storage URL
   */
  async uploadEncryptedFileWithSchema(
    encryptedFile: Blob,
    schemaId: number,
    filename?: string,
    providerName?: string,
  ): Promise<UploadEncryptedFileResult> {
    try {
      // Check if storage manager is available
      if (!this.context.storageManager) {
        throw new Error(
          "Storage manager not configured. Please provide storage providers in VanaConfig.",
        );
      }

      // Step 1: Upload encrypted file to storage
      const uploadResult = await this.context.storageManager.upload(
        encryptedFile,
        filename,
        providerName,
      );

      // Step 2: Register file on blockchain with schema
      const userAddress = await this.getUserAddress();

      if (this.context.relayerCallbacks?.submitFileAddition) {
        // Gasless registration via relayer - need to update relayer to support schema
        throw new Error(
          "Relayer does not yet support uploading files with schema. Please use direct transaction mode.",
        );
      } else {
        // Direct transaction (user pays gas)
        const chainId = this.context.walletClient.chain?.id;
        if (!chainId) {
          throw new Error("Chain ID not available");
        }

        const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
        const dataRegistryAbi = getAbi("DataRegistry");

        const txHash = await this.context.walletClient.writeContract({
          address: dataRegistryAddress,
          abi: dataRegistryAbi,
          functionName: "addFileWithSchema",
          args: [uploadResult.url, BigInt(schemaId)],
          account: this.context.walletClient.account || userAddress,
          chain: this.context.walletClient.chain || null,
        });

        // Wait for transaction receipt to parse the FileAdded event
        const receipt =
          await this.context.publicClient.waitForTransactionReceipt({
            hash: txHash,
            timeout: 30_000, // 30 seconds timeout
          });

        // Parse the FileAdded event to get the actual fileId
        let fileId = 0;
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: dataRegistryAbi,
              data: log.data,
              topics: log.topics,
            });

            if (decoded.eventName === "FileAdded") {
              fileId = Number(decoded.args.fileId);
              break;
            }
          } catch {
            // Ignore logs that don't match our ABI
            continue;
          }
        }

        return {
          fileId: fileId,
          url: uploadResult.url,
          size: uploadResult.size,
          transactionHash: txHash,
        };
      }
    } catch (error) {
      console.error("Failed to upload encrypted file with schema:", error);
      throw new Error(
        `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Registers a file URL directly on the blockchain with a schema ID.
   *
   * @param url - The URL of the file to register
   * @param schemaId - The schema ID to associate with the file
   * @returns Promise resolving to the file ID and transaction hash
   *
   * This method registers an existing file URL on the DataRegistry
   * contract with a schema ID, without uploading any data.
   */
  async registerFileWithSchema(
    url: string,
    schemaId: number,
  ): Promise<{ fileId: number; transactionHash: Address }> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");
      const userAddress = await this.getUserAddress();

      const txHash = await this.context.walletClient.writeContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        functionName: "addFileWithSchema",
        args: [url, BigInt(schemaId)],
        account: this.context.walletClient.account || userAddress,
        chain: this.context.walletClient.chain || null,
      });

      // Wait for transaction receipt to parse the FileAdded event
      const receipt = await this.context.publicClient.waitForTransactionReceipt(
        {
          hash: txHash,
          timeout: 30_000,
        },
      );

      // Parse the FileAdded event to get the actual fileId
      let fileId = 0;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: dataRegistryAbi,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === "FileAdded") {
            fileId = Number(decoded.args.fileId);
            break;
          }
        } catch {
          continue;
        }
      }

      return {
        fileId,
        transactionHash: txHash,
      };
    } catch (error) {
      console.error("Failed to register file with schema:", error);
      throw new Error(
        `Registration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Gets the user's address from the wallet client.
   *
   * @returns Promise resolving to the user's wallet address
   */
  private async getUserAddress(): Promise<Address> {
    const addresses = await this.context.walletClient.getAddresses();
    if (addresses.length === 0) {
      throw new Error("No addresses available in wallet client");
    }
    return addresses[0];
  }

  /**
   * Adds a file with permissions to the DataRegistry contract.
   *
   * @param url - The file URL to register
   * @param ownerAddress - The address of the file owner
   * @param permissions - Array of permissions to set for the file
   * @returns Promise resolving to file ID and transaction hash
   *
   * This method handles the core logic of registering a file
   * with specific permissions on the DataRegistry contract. It can be used
   * by both direct transactions and relayer services.
   */
  async addFileWithPermissions(
    url: string,
    ownerAddress: Address,
    permissions: Array<{ account: Address; key: string }> = [],
  ): Promise<{
    fileId: number;
    transactionHash: string;
  }> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");

      // Execute the transaction using the wallet client
      const txHash = await this.context.walletClient.writeContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        functionName: "addFileWithPermissions",
        args: [url, ownerAddress, permissions],
        account: this.context.walletClient.account || ownerAddress,
        chain: this.context.walletClient.chain || null,
      });

      // Wait for transaction receipt to parse the FileAdded event
      const receipt = await this.context.publicClient.waitForTransactionReceipt(
        {
          hash: txHash,
          timeout: 30_000, // 30 seconds timeout
        },
      );

      // Parse the FileAdded event to get the actual fileId
      let fileId = 0;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: dataRegistryAbi,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === "FileAdded") {
            fileId = Number(decoded.args.fileId);
            break;
          }
        } catch {
          // Ignore logs that don't match our ABI
          continue;
        }
      }

      return {
        fileId: fileId,
        transactionHash: txHash,
      };
    } catch (error) {
      console.error("Failed to add file with permissions:", error);
      throw new Error(
        `Failed to add file with permissions: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Adds a file to the registry with permissions and schema.
   * This combines the functionality of addFileWithPermissions and schema validation.
   *
   * @param url - The URL of the file to register
   * @param ownerAddress - The address of the file owner
   * @param permissions - Array of permissions to grant (account and encrypted key)
   * @param schemaId - The schema ID to associate with the file (0 for no schema)
   * @returns Promise resolving to object with fileId and transactionHash
   */
  async addFileWithPermissionsAndSchema(
    url: string,
    ownerAddress: Address,
    permissions: Array<{ account: Address; key: string }> = [],
    schemaId: number = 0,
  ): Promise<{
    fileId: number;
    transactionHash: string;
  }> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");

      // Execute the transaction using the wallet client
      const txHash = await this.context.walletClient.writeContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        functionName: "addFileWithPermissionsAndSchema",
        args: [url, ownerAddress, permissions, BigInt(schemaId)],
        account: this.context.walletClient.account || ownerAddress,
        chain: this.context.walletClient.chain || null,
      });

      // Wait for transaction receipt to parse the FileAdded event
      const receipt = await this.context.publicClient.waitForTransactionReceipt(
        {
          hash: txHash,
          timeout: 30_000, // 30 seconds timeout
        },
      );

      // Parse the FileAdded event to get the actual fileId
      let fileId = 0;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: dataRegistryAbi,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === "FileAdded") {
            fileId = Number(decoded.args.fileId);
            break;
          }
        } catch {
          // Ignore logs that don't match our ABI
          continue;
        }
      }

      return {
        fileId: fileId,
        transactionHash: txHash,
      };
    } catch (error) {
      console.error("Failed to add file with permissions and schema:", error);
      throw new Error(
        `Failed to add file with permissions and schema: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Adds a new schema to the DataRefinerRegistry.
   *
   * @deprecated Use vana.schemas.create() instead for the high-level API with automatic IPFS upload
   * @param params - Schema parameters including name, type, and definition URL
   * @returns Promise resolving to the new schema ID and transaction hash
   */
  async addSchema(params: AddSchemaParams): Promise<AddSchemaResult> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const txHash = await this.context.walletClient.writeContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        functionName: "addSchema",
        args: [params.name, params.type, params.definitionUrl],
        account:
          this.context.walletClient.account || (await this.getUserAddress()),
        chain: this.context.walletClient.chain || null,
      });

      const receipt = await this.context.publicClient.waitForTransactionReceipt(
        {
          hash: txHash,
          timeout: 30_000,
        },
      );

      let schemaId = 0;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: dataRefinerRegistryAbi,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === "SchemaAdded") {
            schemaId = Number(decoded.args.schemaId);
            break;
          }
        } catch {
          continue;
        }
      }

      return {
        schemaId,
        transactionHash: txHash,
      };
    } catch (error) {
      console.error("Failed to add schema:", error);
      throw new Error(
        `Failed to add schema: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Retrieves a schema by its ID.
   *
   * @deprecated Use vana.schemas.get() instead
   * @param schemaId - The schema ID to retrieve
   * @returns Promise resolving to the schema information
   */
  async getSchema(schemaId: number): Promise<Schema> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const dataRefinerRegistry = getContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        client: this.context.walletClient,
      });

      const schemaData = await dataRefinerRegistry.read.schemas([
        BigInt(schemaId),
      ]);

      if (!schemaData) {
        throw new Error("Schema not found");
      }

      // Contract returns an object with {name, typ, definitionUrl}
      interface SchemaContractData {
        name: string;
        typ: string;
        definitionUrl: string;
      }

      const schemaObj = schemaData as unknown as SchemaContractData;

      if (!schemaObj.name || !schemaObj.typ || !schemaObj.definitionUrl) {
        throw new Error("Incomplete schema data");
      }

      return {
        id: schemaId,
        name: schemaObj.name,
        type: schemaObj.typ,
        definitionUrl: schemaObj.definitionUrl,
      };
    } catch (error) {
      console.error("Failed to get schema:", error);
      throw new Error(
        `Failed to get schema ${schemaId}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Gets the total number of schemas in the registry.
   *
   * @deprecated Use vana.schemas.count() instead
   * @returns Promise resolving to the total schema count
   */
  async getSchemasCount(): Promise<number> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const dataRefinerRegistry = getContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        client: this.context.walletClient,
      });

      const count = await dataRefinerRegistry.read.schemasCount();
      return Number(count);
    } catch (error) {
      console.error("Failed to get schemas count:", error);
      return 0;
    }
  }

  /**
   * Adds a new refiner to the DataRefinerRegistry.
   *
   * @param params - Refiner parameters including DLP ID, name, schema ID, and instruction URL
   * @returns Promise resolving to the new refiner ID and transaction hash
   */
  async addRefiner(params: AddRefinerParams): Promise<AddRefinerResult> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const txHash = await this.context.walletClient.writeContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        functionName: "addRefinerWithSchemaId",
        args: [
          BigInt(params.dlpId),
          params.name,
          BigInt(params.schemaId),
          params.refinementInstructionUrl,
        ],
        account:
          this.context.walletClient.account || (await this.getUserAddress()),
        chain: this.context.walletClient.chain || null,
      });

      const receipt = await this.context.publicClient.waitForTransactionReceipt(
        {
          hash: txHash,
          timeout: 30_000,
        },
      );

      let refinerId = 0;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: dataRefinerRegistryAbi,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === "RefinerAdded") {
            refinerId = Number(decoded.args.refinerId);
            break;
          }
        } catch {
          continue;
        }
      }

      return {
        refinerId,
        transactionHash: txHash,
      };
    } catch (error) {
      console.error("Failed to add refiner:", error);
      throw new Error(
        `Failed to add refiner: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Retrieves a refiner by its ID.
   *
   * @param refinerId - The refiner ID to retrieve
   * @returns Promise resolving to the refiner information
   */
  async getRefiner(refinerId: number): Promise<Refiner> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const dataRefinerRegistry = getContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        client: this.context.walletClient,
      });

      const refinerData = await dataRefinerRegistry.read.refiners([
        BigInt(refinerId),
      ]);

      if (!refinerData) {
        throw new Error("Refiner not found");
      }

      return {
        id: refinerId,
        dlpId: Number(refinerData.dlpId),
        owner: refinerData.owner,
        name: refinerData.name,
        schemaId: Number(refinerData.schemaId),
        refinementInstructionUrl: refinerData.refinementInstructionUrl,
      };
    } catch (error) {
      console.error("Failed to get refiner:", error);
      throw new Error(
        `Failed to get refiner ${refinerId}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Validates if a schema ID exists in the registry.
   *
   * @param schemaId - The schema ID to validate
   * @returns Promise resolving to boolean indicating if the schema ID is valid
   */
  async isValidSchemaId(schemaId: number): Promise<boolean> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const dataRefinerRegistry = getContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        client: this.context.walletClient,
      });

      const isValid = await dataRefinerRegistry.read.isValidSchemaId([
        BigInt(schemaId),
      ]);
      return isValid;
    } catch (error) {
      console.error("Failed to validate schema ID:", error);
      return false;
    }
  }

  /**
   * Gets the total number of refiners in the registry.
   *
   * @returns Promise resolving to the total refiner count
   */
  async getRefinersCount(): Promise<number> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const dataRefinerRegistry = getContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        client: this.context.walletClient,
      });

      const count = await dataRefinerRegistry.read.refinersCount();
      return Number(count);
    } catch (error) {
      console.error("Failed to get refiners count:", error);
      return 0;
    }
  }

  /**
   * Updates the schema ID for an existing refiner.
   *
   * @param params - Parameters including refiner ID and new schema ID
   * @returns Promise resolving to the transaction hash
   */
  async updateSchemaId(
    params: UpdateSchemaIdParams,
  ): Promise<UpdateSchemaIdResult> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

      const txHash = await this.context.walletClient.writeContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        functionName: "updateSchemaId",
        args: [BigInt(params.refinerId), BigInt(params.newSchemaId)],
        account:
          this.context.walletClient.account || (await this.getUserAddress()),
        chain: this.context.walletClient.chain || null,
      });

      await this.context.publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 30_000,
      });

      return {
        transactionHash: txHash,
      };
    } catch (error) {
      console.error("Failed to update schema ID:", error);
      throw new Error(
        `Failed to update schema ID: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Uploads an encrypted file and grants permission to a party with a public key.
   *
   * This method handles the complete workflow:
   * 1. Encrypts the file with the user's encryption key
   * 2. Uploads the encrypted file to storage
   * 3. Encrypts the user's encryption key with the provided public key
   * 4. Registers the file with permissions
   *
   * @param data - The file data to encrypt and upload
   * @param permissions - Array of permissions to grant, each with account address and public key
   * @param filename - Optional filename for the upload
   * @param providerName - Optional storage provider to use
   * @returns Promise resolving to upload result with file ID and storage URL
   */
  async uploadFileWithPermissions(
    data: Blob,
    permissions: Array<{ account: Address; publicKey: string }>,
    filename?: string,
    providerName?: string,
  ): Promise<UploadEncryptedFileResult> {
    try {
      // 1. Generate user's encryption key
      const userEncryptionKey = await generateEncryptionKey(
        this.context.walletClient,
        this.context.platform,
        DEFAULT_ENCRYPTION_SEED,
      );

      // 2. Encrypt data with user's key
      const encryptedData = await encryptBlobWithSignedKey(
        data,
        userEncryptionKey,
        this.context.platform,
      );

      // 3. Upload the encrypted file
      if (!this.context.storageManager) {
        throw new Error(
          "Storage manager not configured. Please provide storage providers in VanaConfig.",
        );
      }

      const uploadResult = await this.context.storageManager.upload(
        encryptedData,
        filename,
        providerName,
      );

      // 4. Get user address
      const userAddress = await this.getUserAddress();

      // 5. Encrypt user's encryption key for each permission
      const encryptedPermissions = await Promise.all(
        permissions.map(async (permission) => {
          const encryptedKey = await encryptWithWalletPublicKey(
            userEncryptionKey,
            permission.publicKey,
            this.context.platform,
          );
          return {
            account: permission.account,
            key: encryptedKey,
          };
        }),
      );

      // 6. Register file with permissions (either via relayer or direct)
      let result;
      if (this.context.relayerCallbacks?.submitFileAdditionWithPermissions) {
        // Use callback for file addition with permissions
        result =
          await this.context.relayerCallbacks.submitFileAdditionWithPermissions(
            uploadResult.url,
            userAddress,
            encryptedPermissions,
          );
      } else {
        // Direct transaction
        result = await this.addFileWithPermissions(
          uploadResult.url,
          userAddress,
          encryptedPermissions,
        );
      }

      return {
        fileId: result.fileId,
        url: uploadResult.url,
        size: uploadResult.size,
        transactionHash: result.transactionHash as `0x${string}`,
      };
    } catch (error) {
      console.error("Failed to upload file with permissions:", error);
      throw new Error(
        `Failed to upload file with permissions: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Adds a permission for a party to access an existing file.
   *
   * This method handles the complete workflow:
   * 1. Gets the user's encryption key
   * 2. Encrypts the user's encryption key with the provided public key
   * 3. Adds the permission to the file
   * 4. Returns the permission data from the blockchain event
   *
   * For advanced users who need more control over transaction timing,
   * use `submitFilePermission()` instead.
   *
   * @param fileId - The ID of the file to add permissions for
   * @param account - The address of the account to grant permission to
   * @param publicKey - The public key to encrypt the user's encryption key with
   * @returns Promise resolving to permission data from PermissionGranted event
   * @example
   * ```typescript
   * const result = await vana.data.addPermissionToFile(fileId, account, publicKey);
   * console.log(`Permission granted to ${result.account} for file ${result.fileId}`);
   * console.log(`Transaction: ${result.transactionHash}`);
   * ```
   */
  async addPermissionToFile(
    fileId: number,
    account: Address,
    publicKey: string,
  ): Promise<FilePermissionResult> {
    const txHash = await this.submitFilePermission(fileId, account, publicKey);
    return parseTransactionResult(this.context, txHash, "addFilePermission");
  }

  /**
   * Submits a file permission transaction and returns the transaction hash immediately.
   *
   * This is the lower-level method that provides maximum control over transaction timing.
   * Use this when you want to handle transaction confirmation and event parsing separately.
   *
   * @param fileId - The ID of the file to add permissions for
   * @param account - The address of the account to grant permission to
   * @param publicKey - The public key to encrypt the user's encryption key with
   * @returns Promise resolving to the transaction hash
   * @example
   * ```typescript
   * const txHash = await vana.data.submitFilePermission(fileId, account, publicKey);
   * console.log(`Transaction submitted: ${txHash}`);
   * ```
   */
  async submitFilePermission(
    fileId: number,
    account: Address,
    publicKey: string,
  ): Promise<Hash> {
    try {
      // 1. Generate user's encryption key
      const userEncryptionKey = await generateEncryptionKey(
        this.context.walletClient,
        this.context.platform,
        DEFAULT_ENCRYPTION_SEED,
      );

      // 2. Encrypt user's encryption key with provided public key
      const encryptedKey = await encryptWithWalletPublicKey(
        userEncryptionKey,
        publicKey,
        this.context.platform,
      );

      // 3. Add permission to the file
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");

      const txHash = await this.context.walletClient.writeContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        functionName: "addFilePermission",
        args: [BigInt(fileId), account, encryptedKey],
        account:
          this.context.walletClient.account || (await this.getUserAddress()),
        chain: this.context.walletClient.chain || null,
      });

      return txHash;
    } catch (error) {
      console.error("Failed to add permission to file:", error);
      throw new Error(
        `Failed to add permission to file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Gets the encrypted key for a specific account's permission to access a file.
   *
   * @param fileId - The ID of the file
   * @param account - The account address to get the permission for
   * @returns Promise resolving to the encrypted key for that account
   */
  async getFilePermission(fileId: number, account: Address): Promise<string> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");

      const dataRegistry = getContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        client: this.context.walletClient,
      });

      const encryptedKey = await dataRegistry.read.filePermissions([
        BigInt(fileId),
        account,
      ]);

      return encryptedKey as string;
    } catch (error) {
      console.error("Failed to get file permission:", error);
      throw new Error(
        `Failed to get file permission: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Decrypts a file that the user has permission to access using their private key.
   *
   * This method handles the complete workflow for servers or other permitted parties:
   * 1. Gets the encrypted encryption key from file permissions
   * 2. Decrypts the encryption key using the provided private key
   * 3. Downloads and decrypts the file data
   *
   * @param file - The file to decrypt
   * @param privateKey - The private key to decrypt the user's encryption key
   * @param account - The account address that has permission (defaults to current wallet account)
   * @returns Promise resolving to the decrypted file data
   */
  async decryptFileWithPermission(
    file: UserFile,
    privateKey: string,
    account?: Address,
  ): Promise<Blob> {
    try {
      // Use provided account or get current wallet account
      const permissionAccount = account || (await this.getUserAddress());

      // 1. Get the encrypted encryption key from file permissions
      const encryptedKey = await this.getFilePermission(
        file.id,
        permissionAccount,
      );

      if (!encryptedKey) {
        throw new Error(
          `No permission found for account ${permissionAccount} to access file ${file.id}`,
        );
      }

      // 2. Decrypt the encryption key using the private key
      const userEncryptionKey = await decryptWithWalletPrivateKey(
        encryptedKey,
        privateKey,
        this.context.platform,
      );

      // 3. Download the encrypted file
      // Use fetchFromIPFS for IPFS URLs, otherwise use regular fetch
      let encryptedData: Blob;
      if (file.url.startsWith("ipfs://")) {
        encryptedData = await this.fetchFromIPFS(file.url);
      } else {
        encryptedData = await this.fetch(file.url);
      }

      // 4. Decrypt the file data using the user's encryption key
      const decryptedData = await decryptBlobWithSignedKey(
        encryptedData,
        userEncryptionKey,
        this.context.platform,
      );

      return decryptedData;
    } catch (error) {
      console.error("Failed to decrypt file with permission:", error);
      throw new Error(
        `Failed to decrypt file with permission: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Simple network-agnostic fetch utility for retrieving file content.
   *
   * @remarks
   * This is a thin wrapper around the global fetch API that returns the response as a Blob.
   * It provides a consistent interface for fetching encrypted content before decryption.
   * For IPFS URLs, consider using fetchFromIPFS for better reliability.
   *
   * @param url - The URL to fetch content from
   * @returns Promise resolving to the fetched content as a Blob
   * @throws {Error} When the fetch fails or returns a non-ok response
   *
   * @example
   * ```typescript
   * // Fetch and decrypt a file
   * const encryptionKey = await generateEncryptionKey(walletClient);
   * const encryptedBlob = await vana.data.fetch(file.url);
   * const decryptedBlob = await decryptBlob(encryptedBlob, encryptionKey, platform);
   *
   * // With custom headers for authentication
   * const response = await fetch(file.url, {
   *   headers: { 'Authorization': 'Bearer token' }
   * });
   * const encryptedBlob = await response.blob();
   * ```
   */
  async fetch(url: string): Promise<Blob> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} ${response.statusText}`,
        );
      }

      const blob = await response.blob();

      // Check if blob is empty
      if (blob.size === 0) {
        throw new Error("Empty response");
      }

      return blob;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new Error(
          `Network error: Failed to fetch from ${url}. The URL may be invalid or the server may not be accessible.`,
        );
      }
      throw error;
    }
  }

  /**
   * Specialized IPFS fetcher with gateway fallback mechanism.
   *
   * @remarks
   * This method provides robust IPFS content fetching by trying multiple gateways
   * in sequence until one succeeds. It supports both ipfs:// URLs and raw CIDs.
   *
   * The default gateway list includes public gateways, but you should provide
   * your own gateways for production use to ensure reliability and privacy.
   *
   * @param url - The IPFS URL (ipfs://...) or CID to fetch
   * @param options - Optional configuration
   * @param options.gateways - Array of IPFS gateway URLs to try (must end with /)
   * @returns Promise resolving to the fetched content as a Blob
   * @throws {Error} When all gateways fail to fetch the content
   *
   * @example
   * ```typescript
   * // Fetch from IPFS with custom gateways
   * const encryptedBlob = await vana.data.fetchFromIPFS(file.url, {
   *   gateways: [
   *     'https://my-private-gateway.com/ipfs/',
   *     'https://dweb.link/ipfs/',
   *     'https://ipfs.io/ipfs/'
   *   ]
   * });
   *
   * // Decrypt the fetched content
   * const encryptionKey = await generateEncryptionKey(walletClient);
   * const decryptedBlob = await decryptBlob(encryptedBlob, encryptionKey, platform);
   *
   * // With raw CID
   * const blob = await vana.data.fetchFromIPFS('QmXxx...', {
   *   gateways: ['https://ipfs.io/ipfs/']
   * });
   * ```
   */
  async fetchFromIPFS(
    url: string,
    options?: { gateways?: string[] },
  ): Promise<Blob> {
    // Default public gateways (in order of preference)
    const defaultGateways = [
      "https://dweb.link/ipfs/",
      "https://ipfs.io/ipfs/",
    ];

    // Use per-call gateways if provided, otherwise use app-wide gateways, otherwise use defaults
    const gateways =
      options?.gateways || this.context.ipfsGateways || defaultGateways;

    // Extract CID from ipfs:// URL or use raw CID
    let cid: string;
    if (url.startsWith("ipfs://")) {
      cid = url.replace("ipfs://", "");
    } else if (url.startsWith("Qm") || url.startsWith("bafy")) {
      // Looks like a raw CID
      cid = url;
    } else {
      throw new Error(
        `Invalid IPFS URL format. Expected ipfs://... or a raw CID, got: ${url}`,
      );
    }

    const errors: Array<{ gateway: string; error: string }> = [];

    // Try each gateway in sequence
    for (let i = 0; i < gateways.length; i++) {
      const gateway = gateways[i];
      const isLastGateway = i === gateways.length - 1;
      const gatewayUrl = gateway.endsWith("/")
        ? `${gateway}${cid}`
        : `${gateway}/${cid}`;

      try {
        console.debug(`Trying IPFS gateway: ${gatewayUrl}`);

        const response = await fetch(gatewayUrl);

        if (response.ok) {
          const blob = await response.blob();

          // Verify we got actual content
          if (blob.size > 0) {
            console.debug(`Successfully fetched from gateway: ${gateway}`);
            return blob;
          } else {
            // If this is the last gateway and we got an empty response, throw specific error
            if (isLastGateway) {
              throw new Error("Empty response");
            }
            errors.push({
              gateway,
              error: "Empty response",
            });
          }
        } else {
          // Handle specific HTTP errors on last gateway attempt
          if (isLastGateway) {
            if (response.status === 403) {
              throw new Error(`HTTP error! status: 403 ${response.statusText}`);
            } else if (response.status === 404) {
              throw new Error(`HTTP error! status: 404 ${response.statusText}`);
            } else {
              throw new Error(
                `HTTP error! status: ${response.status} ${response.statusText}`,
              );
            }
          }
          errors.push({
            gateway,
            error: `HTTP ${response.status} ${response.statusText}`,
          });
        }
      } catch (error) {
        // Re-throw on last gateway if it's a specific error we want to preserve
        if (
          isLastGateway &&
          error instanceof Error &&
          (error.message.includes("Empty response") ||
            error.message.includes("HTTP error!"))
        ) {
          throw error;
        }
        errors.push({
          gateway,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // All gateways failed
    const errorDetails = errors
      .map((e) => `${e.gateway}: ${e.error}`)
      .join("\n  ");

    throw new Error(
      `Failed to fetch IPFS content ${cid} from all gateways:\n  ${errorDetails}`,
    );
  }

  /**
   * Validates a data schema against the Vana meta-schema.
   *
   * @param schema - The data schema to validate
   * @returns Assertion that schema is valid (throws if invalid)
   * @throws SchemaValidationError if invalid
   * @example
   * ```typescript
   * const schema = {
   *   name: "User Profile",
   *   version: "1.0.0",
   *   dialect: "json",
   *   schema: {
   *     type: "object",
   *     properties: {
   *       name: { type: "string" },
   *       age: { type: "number" }
   *     }
   *   }
   * };
   *
   * vana.data.validateDataSchema(schema);
   * ```
   */
  validateDataSchema(schema: unknown): asserts schema is DataSchema {
    return validateDataSchema(schema);
  }

  /**
   * Validates data against a JSON Schema from a data schema.
   *
   * @param data - The data to validate
   * @param schema - The data schema containing the schema
   * @returns Void (throws if validation fails)
   * @throws SchemaValidationError if invalid
   * @example
   * ```typescript
   * const schema = {
   *   name: "User Profile",
   *   version: "1.0.0",
   *   dialect: "json",
   *   schema: {
   *     type: "object",
   *     properties: {
   *       name: { type: "string" },
   *       age: { type: "number" }
   *     },
   *     required: ["name"]
   *   }
   * };
   *
   * const userData = { name: "Alice", age: 30 };
   * vana.data.validateDataAgainstSchema(userData, schema);
   * ```
   */
  validateDataAgainstSchema(data: unknown, schema: DataSchema): void {
    return validateDataAgainstSchema(data, schema);
  }

  /**
   * Fetches and validates a schema from a URL, then returns the parsed data schema.
   *
   * @param url - The URL to fetch the schema from
   * @returns The validated data schema
   * @throws SchemaValidationError if invalid or fetch fails
   * @example
   * ```typescript
   * // Fetch and validate a schema from IPFS or HTTP
   * const schema = await vana.data.fetchAndValidateSchema("https://example.com/schema.json");
   * console.log(schema.name, schema.dialect);
   *
   * // Use the schema to validate user data
   * if (schema.dialect === "json") {
   *   vana.data.validateDataAgainstSchema(userData, schema);
   * }
   * ```
   */
  async fetchAndValidateSchema(url: string): Promise<DataSchema> {
    return fetchAndValidateSchema(url);
  }

  /**
   * Retrieves a schema by ID and fetches its definition URL to get the full data schema.
   *
   * @param schemaId - The schema ID to retrieve and validate
   * @returns The validated data schema
   * @throws SchemaValidationError if schema is invalid
   * @example
   * ```typescript
   * // Get schema from registry and validate its schema
   * const schema = await vana.data.getValidatedSchema(123);
   *
   * // Use it to validate user data
   * if (schema.dialect === "json") {
   *   vana.data.validateDataAgainstSchema(userData, schema);
   * }
   * ```
   */
  async getValidatedSchema(schemaId: number): Promise<DataSchema> {
    try {
      // First get the schema metadata from the registry
      const schema = await this.getSchema(schemaId);

      // Then fetch and validate the full data schema from the definition URL
      const dataSchema = await this.fetchAndValidateSchema(
        schema.definitionUrl,
      );

      // Verify that the fetched schema name matches the on-chain name
      if (dataSchema.name !== schema.name) {
        throw new SchemaValidationError(
          `Schema name mismatch: on-chain name "${schema.name}" does not match schema name "${dataSchema.name}"`,
          [],
        );
      }

      return dataSchema;
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        throw error;
      }

      console.error("Failed to get validated schema:", error);
      throw new SchemaValidationError(
        `Failed to get validated schema ${schemaId}: ${error instanceof Error ? error.message : "Unknown error"}`,
        [],
      );
    }
  }
}
