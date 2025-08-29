import type { Address, Hash } from "viem";
import { getContract } from "viem";
import type { StorageUploadResult } from "../types/storage";

import type {
  UserFile,
  UploadParams,
  UploadResult,
  UploadEncryptedFileResult,
  Refiner,
  AddRefinerParams,
  AddRefinerResult,
  UpdateSchemaIdParams,
  UpdateSchemaIdResult,
  TrustedServer,
  GetUserTrustedServersParams,
  EncryptedUploadParams,
  UnencryptedUploadParams,
  EncryptFileOptions,
  EncryptFileResult,
  DecryptFileOptions,
  UploadFileWithPermissionsParams,
  AddFilePermissionParams,
  DecryptFileWithPermissionOptions,
} from "../types/index";
// import { FilePermissionResult } from "../types/transactionResults";
import type { TransactionResult } from "../types/operations";
import type { UnifiedRelayerRequest } from "../types/relayer";
import type { ControllerContext } from "./permissions";
import { BaseController } from "./base";
import { getContractAddress } from "../config/addresses";
import { getAbi } from "../generated/abi";
import type {
  GetUserFilesQuery,
  GetFileProofsQuery,
  GetDlpQuery,
  GetUserPermissionsQuery,
  GetUserTrustedServersQuery,
} from "../generated/subgraph";
import {
  GetUserFilesDocument,
  GetFileProofsDocument,
  GetDlpDocument,
  GetUserPermissionsDocument,
  GetUserTrustedServersDocument,
} from "../generated/subgraph";
import { print } from "graphql";
import {
  generateEncryptionKey,
  decryptBlobWithSignedKey,
  DEFAULT_ENCRYPTION_SEED,
  encryptBlobWithSignedKey,
  encryptWithWalletPublicKey,
  decryptWithWalletPrivateKey,
} from "../utils/encryption";
import {
  validateDataSchemaAgainstMetaSchema,
  validateDataAgainstSchema,
  fetchAndValidateSchema,
  type DataSchema,
} from "../utils/schemaValidation";
import { gasAwareMulticall } from "../utils/multicall";

/**
 * Subgraph response wrapper type for error handling
 */
type SubgraphResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

/**
 * Manages encrypted user data files and blockchain registration on the Vana network.
 *
 * @remarks
 * The DataController provides comprehensive file lifecycle management from encrypted upload
 * through blockchain registration to decryption. Client-side encryption ensures data privacy
 * before transmission. The controller integrates with multiple storage providers (IPFS, Pinata,
 * Google Drive) and supports both gasless transactions via relayers and direct blockchain interaction.
 *
 * **Architecture:**
 * Files use dual storage: encrypted content on decentralized storage (IPFS/Pinata/Google Drive),
 * metadata and permissions on blockchain. This design minimizes on-chain data while maintaining
 * decentralization and access control.
 *
 * **Method Selection:**
 * - `upload()` - Complete workflow: encryption, storage, blockchain registration
 * - `getUserFiles()` - Query file metadata from blockchain/subgraph
 * - `decryptFile()` - Decrypt files you have permission to access
 * - `getFileById()` - Retrieve specific file metadata by ID
 *
 * **Storage Requirements:**
 * - Methods requiring storage: `upload()`, `encryptFile()`
 * - Methods working without storage: `getUserFiles()`, `decryptFile()`, `getFileById()`
 *
 * **Permission Model:**
 * - File permissions (decryption access) are handled during upload
 * - Operation permissions (what can be done with data) use `vana.permissions.grant()`
 *
 * @example
 * ```typescript
 * // Upload encrypted file with schema validation
 * const result = await vana.data.upload({
 *   content: { name: "Alice", age: 30 },
 *   filename: "profile.json",
 *   schemaId: 1
 * });
 * console.log(`File uploaded: ID ${result.fileId}, URL ${result.url}`);
 *
 * // Query user's files
 * const files = await vana.data.getUserFiles({
 *   owner: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36"
 * });
 * files.forEach(file => console.log(`File ${file.id}: ${file.url}`));
 *
 * // Decrypt accessible file
 * const decryptedData = await vana.data.decryptFile(files[0]);
 * console.log("Decrypted content:", decryptedData);
 * ```
 *
 * @category Data Management
 * @see For conceptual overview, visit {@link https://docs.vana.org/docs/data-registry}
 */
export class DataController extends BaseController {
  constructor(context: ControllerContext) {
    super(context);
  }

  /**
   * Uploads data with automatic encryption and blockchain registration.
   *
   * @remarks
   * Primary method for uploading data to Vana. Handles complete workflow:
   * content normalization, schema validation, encryption, storage upload,
   * permission granting, and blockchain registration.
   *
   * **Automatic Processing:**
   * - Normalizes content to Blob format
   * - Validates against schema if provided
   * - Generates encryption keys
   * - Uploads to configured storage
   * - Grants decryption permissions
   * - Registers on blockchain
   *
   * **TypeScript Overloads:**
   * - `EncryptedUploadParams`: When `encrypt: true` (default), permissions require `publicKey`
   * - `UnencryptedUploadParams`: When `encrypt: false`, permissions optional
   * - `UploadParams`: General signature for runtime determination
   *
   * **Permission Separation:**
   * - File permissions (here): Decryption access only
   * - Operation permissions: Use `vana.permissions.grant()` separately
   *
   * @param params - Upload configuration object
   * @param params.content - Data to upload (string, object, or Blob)
   * @param params.filename - Name for the uploaded file
   * @param params.permissions - Decryption access grants.
   *   Each requires `account` and `publicKey` for encryption.
   * @param params.schemaId - Schema for validation.
   *   Obtain via `vana.schemas.list()`.
   * @param params.owner - Owner address for delegation scenarios.
   *   Defaults to connected wallet address.
   * @param params.encrypt - Enable encryption (default: `true`)
   * @param params.providerName - Storage provider override
   *
   * @returns Upload result with file ID, URL, and transaction hash
   *
   * @throws {Error} Storage not configured.
   *   Configure storage providers in `VanaConfig`.
   * @throws {Error} No wallet addresses available.
   *   Ensure wallet is connected.
   * @throws {SchemaValidationError} Data doesn't match schema.
   *   Verify data structure matches schema from `vana.schemas.get(schemaId)`.
   * @throws {Error} Upload failed with specific error message.
   *
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
   * // Note: Cast to UnencryptedUploadParams for TypeScript
   * const result = await vana.data.upload({
   *   content: "Public data",
   *   filename: "public.txt",
   *   encrypt: false
   * } as const);  // 'as const' ensures TypeScript infers encrypt: false literally
   *
   * // Upload on behalf of another user (delegation)
   * const result = await vana.data.upload({
   *   content: "User's data",
   *   filename: "delegated.txt",
   *   owner: "0x5678...", // Different from connected wallet
   *   permissions: [{
   *     account: "0x1234...",   // Address that can decrypt
   *     publicKey: "0x04..."    // Their public key for encryption
   *   }]
   * });
   * ```
   */
  async upload(params: EncryptedUploadParams): Promise<UploadResult>;
  async upload(params: UnencryptedUploadParams): Promise<UploadResult>;
  async upload(params: UploadParams): Promise<UploadResult>;
  async upload(params: UploadParams): Promise<UploadResult> {
    this.assertWallet();

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
      let isValid = true;
      let validationErrors: string[] = [];

      // Step 1: Schema validation if provided
      if (schemaId !== undefined) {
        try {
          // Use SchemaController to get complete schema with definition
          const { SchemaController } = await import("./schemas");
          const schemaController = new SchemaController(this.context);
          const schema = await schemaController.get(schemaId);

          // Parse content for validation
          let parsedContent;
          if (typeof content === "string") {
            try {
              parsedContent = JSON.parse(content);
            } catch {
              parsedContent = content;
            }
          } else if (content instanceof Blob) {
            // For Blob content, read it as text for validation
            const text = await content.text();
            try {
              parsedContent = JSON.parse(text);
            } catch {
              parsedContent = text;
            }
          } else {
            parsedContent = content;
          }

          // Validate against schema (Schema is compatible with DataSchema)
          validateDataAgainstSchema(parsedContent, schema);
        } catch (error) {
          isValid = false;
          // Provide detailed error message
          if (error instanceof Error) {
            // Check if it's a SchemaValidationError with details
            // Using type guard to safely check for errors property
            if (
              typeof error === "object" &&
              "errors" in error &&
              Array.isArray(error.errors)
            ) {
              validationErrors = error.errors;
            } else {
              validationErrors = [error.message];
            }
          } else {
            validationErrors = ["Schema validation failed"];
          }
        }
      }

      // Step 2: Upload to storage using the centralized method
      const uploadResult = await this.uploadToStorage(
        content,
        filename,
        encrypt,
        providerName,
      );

      // Step 3: Register on blockchain
      const userAddress = owner ?? this.context.userAddress;

      // Prepare encrypted permissions if provided
      let encryptedPermissions: Array<{ account: Address; key: string }> = [];
      if (permissions.length > 0 && encrypt) {
        this.assertWallet();
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

      // Use unified relayer callback if it exists
      if (this.context.relayer) {
        const request: UnifiedRelayerRequest = {
          type: "direct",
          operation: "submitFileAdditionComplete",
          params: {
            url: uploadResult.url,
            userAddress,
            permissions: encryptedPermissions,
            schemaId: schemaId ?? 0,
            ownerAddress: owner,
          },
        };
        const response = await this.context.relayer(request);
        if (response.type === "error") {
          throw new Error(response.error);
        }
        if (response.type !== "direct" || !("fileId" in response.result)) {
          throw new Error("Invalid response from relayer");
        }
        result = response.result as { fileId: number; transactionHash: Hash };

        // Fallback: No relay support, use a direct transaction
      } else {
        // Use the method directly since we already have encrypted permissions
        const txResult = await this.addFileWithEncryptedPermissionsAndSchema(
          uploadResult.url,
          userAddress,
          encryptedPermissions,
          schemaId ?? 0,
        );

        // Wait for transaction events to get the actual fileId
        if (!this.context.waitForTransactionEvents) {
          throw new Error(
            "Cannot upload without relay: waitForTransactionEvents not configured",
          );
        }

        const eventResult =
          await this.context.waitForTransactionEvents(txResult);
        const fileAddedEvent = eventResult.expectedEvents.FileAdded;
        if (!fileAddedEvent) {
          throw new Error("FileAdded event not found in transaction");
        }

        result = {
          fileId: Number(fileAddedEvent.fileId),
          transactionHash: txResult.hash,
        };
      }

      return {
        fileId: result.fileId,
        url: uploadResult.url,
        transactionHash: result.transactionHash,
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
   * Encrypts data using wallet-derived encryption.
   *
   * @remarks
   * This method provides secure, wallet-based encryption for data before uploading
   * to the Vana network. It's the counterpart to decryptFile for preparing data
   * for secure storage.
   *
   * The method automatically:
   * - Generates an encryption key from the user's wallet signature
   * - Converts the input data to a Blob if necessary
   * - Encrypts the data using the generated key
   * - Returns both the encrypted data and the encryption key
   *
   * The encryption key returned can be stored and later used for decryption,
   * or shared with others to grant them decryption access.
   *
   * @param data - The data to encrypt (Blob, string, or object)
   * @param options - Optional encryption configuration
   * @returns Promise resolving to encrypted data and the encryption key used
   * @throws {Error} When wallet is not connected or encryption fails
   * @example
   * ```typescript
   * // Encrypt a string
   * const { encryptedData, encryptionKey } = await vana.data.encryptFile(
   *   "My secret data"
   * );
   *
   * // Encrypt JSON with custom MIME type
   * const { encryptedData, encryptionKey } = await vana.data.encryptFile(
   *   { name: "Alice", age: 30 },
   *   { mimeType: "application/json" }
   * );
   *
   * // With custom encryption seed
   * const { encryptedData, encryptionKey } = await vana.data.encryptFile(
   *   "Secret message",
   *   { seed: "My custom encryption seed" }
   * );
   *
   * // Upload the encrypted data
   * const result = await vana.data.uploadToStorage(encryptedData);
   * ```
   */
  async encryptFile(
    data: Blob | string | object,
    options?: EncryptFileOptions,
  ): Promise<EncryptFileResult> {
    this.assertWallet();

    try {
      // Generate encryption key from wallet
      const encryptionKey = await generateEncryptionKey(
        this.context.walletClient,
        this.context.platform,
        options?.seed ?? DEFAULT_ENCRYPTION_SEED,
      );

      // Convert data to Blob if necessary
      let blob: Blob;
      if (data instanceof Blob) {
        blob = data;
      } else if (typeof data === "string") {
        blob = new Blob([data], { type: options?.mimeType ?? "text/plain" });
      } else {
        // Handle objects by JSON stringifying them
        blob = new Blob([JSON.stringify(data)], {
          type: options?.mimeType ?? "application/json",
        });
      }

      // Encrypt the blob
      const encryptedData = await encryptBlobWithSignedKey(
        blob,
        encryptionKey,
        this.context.platform,
      );

      return {
        encryptedData,
        encryptionKey,
      };
    } catch (error) {
      throw new Error(
        `Failed to encrypt file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Decrypts a file using wallet-derived decryption key.
   *
   * @remarks
   * Counterpart to `upload()` for decrypting user files. Automatically
   * generates decryption key from wallet, fetches encrypted content,
   * and decrypts. Supports IPFS (with gateway fallback) and HTTP URLs.
   *
   * @param file - UserFile object from `getUserFiles()`
   * @param options - Decryption options
   * @param options.seed - Custom encryption seed.
   *   Defaults to standard Vana seed.
   *
   * @returns Decrypted content as Blob
   *
   * @throws {Error} No wallet connected.
   *   Connect wallet before decrypting.
   * @throws {Error} Network error accessing file.
   *   Check CORS settings or server availability.
   * @throws {Error} File not found (404).
   *   File no longer available at stored URL.
   * @throws {Error} Access denied (403).
   *   No permission to access file.
   * @throws {Error} Invalid file format.
   *   File not encrypted with Vana protocol.
   * @throws {Error} Wrong encryption key.
   *   Verify seed matches upload or use default.
   *
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
  async decryptFile(
    file: UserFile,
    options?: DecryptFileOptions,
  ): Promise<Blob> {
    this.assertWallet();

    try {
      this.assertWallet();
      // Step 1: Generate the decryption key from wallet signature
      const encryptionKey = await generateEncryptionKey(
        this.context.walletClient,
        this.context.platform,
        options?.seed ?? DEFAULT_ENCRYPTION_SEED,
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
   * Retrieves all files owned by a specific user address.
   *
   * @remarks
   * Queries the Vana subgraph for files owned by the specified address.
   * Automatically deduplicates by file ID, keeping the latest version
   * when duplicates exist from re-indexing or chain reorganizations.
   * Enriches results with DLP proof data when available.
   *
   * @param params - Query configuration
   * @param params.owner - Wallet address of the file owner
   * @param params.subgraphUrl - Subgraph endpoint override.
   *   Defaults to context configuration.
   *
   * @returns Array of UserFile objects sorted by timestamp (newest first)
   *
   * @throws {Error} Subgraph URL not configured.
   *   Provide `subgraphUrl` parameter or configure in Vana constructor.
   * @throws {Error} Subgraph request failed.
   *   Check network connectivity and subgraph availability.
   * @throws {Error} Subgraph returned errors.
   *   Review query parameters and subgraph logs.
   *
   * @example
   * ```typescript
   * const files = await vana.data.getUserFiles({
   *   owner: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36"
   * });
   *
   * files.forEach(file => {
   *   console.log(`File ${file.id}: ${file.url}`);
   *   console.log(`  Schema: ${file.schemaId}`);
   *   console.log(`  DLPs: ${file.dlpIds?.join(", ") || "none"}`);
   * });
   * ```
   */
  async getUserFiles(params: {
    owner: Address;
    subgraphUrl?: string;
  }): Promise<UserFile[]> {
    const { owner, subgraphUrl } = params;

    // Use provided subgraph URL or default from context
    const endpoint = subgraphUrl ?? this.context.subgraphUrl;

    if (!endpoint) {
      throw new Error(
        "subgraphUrl is required. Please provide a valid subgraph endpoint or configure it in Vana constructor.",
      );
    }

    try {
      // Query the subgraph for user's files using the generated query

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: print(GetUserFilesDocument),
          variables: {
            userId: owner.toLowerCase(), // Subgraph requires lowercase addresses
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Subgraph request failed: ${response.status} ${response.statusText}`,
        );
      }

      const result =
        (await response.json()) as SubgraphResponse<GetUserFilesQuery>;

      if (result.errors) {
        throw new Error(
          `Subgraph errors: ${result.errors.map((e) => e.message).join(", ")}`,
        );
      }

      const user = result.data?.user;
      if (!user?.files?.length) {
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
          transactionHash: file.transactionHash as Hash,
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
        Number((b.addedAtTimestamp ?? 0n) - (a.addedAtTimestamp ?? 0n)),
      );

      // Fetch proofs for all files to get DLP associations
      if (userFiles.length > 0) {
        try {
          const fileIds = userFiles.map((f) => f.id);
          let proofMap: Map<number, number[]>;

          try {
            // Try subgraph first
            proofMap = await this._fetchProofsFromSubgraph(fileIds, endpoint);
          } catch (subgraphError) {
            console.debug(
              "Failed to fetch proofs from subgraph, trying chain:",
              subgraphError,
            );
            // Fall back to chain
            proofMap = await this._fetchProofsFromChain(fileIds);
          }

          // Add dlpIds to each file
          for (const file of userFiles) {
            const dlpIds = proofMap.get(file.id);
            if (dlpIds && dlpIds.length > 0) {
              file.dlpIds = dlpIds;
            }
          }
        } catch (error) {
          // Log but don't fail - files are still useful without proof data
          console.warn("Failed to fetch proof data for files:", error);
        }
      }

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
   * Fetches proof data for multiple files from the subgraph.
   *
   * @private
   * @param fileIds - Array of file IDs to fetch proofs for
   * @param subgraphUrl - The subgraph endpoint URL
   * @returns Map of file IDs to their associated DLP IDs
   */
  private async _fetchProofsFromSubgraph(
    fileIds: number[],
    subgraphUrl: string,
  ): Promise<Map<number, number[]>> {
    const response = await fetch(subgraphUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: print(GetFileProofsDocument),
        variables: {
          fileIds: fileIds.map((id) => id.toString()),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Subgraph request failed: ${response.status} ${response.statusText}`,
      );
    }

    const result =
      (await response.json()) as SubgraphResponse<GetFileProofsQuery>;

    if (result.errors) {
      throw new Error(
        `Subgraph errors: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    // Build map of fileId -> dlpIds
    const proofMap = new Map<number, number[]>();

    if (result.data?.dataRegistryProofs) {
      for (const proof of result.data.dataRegistryProofs) {
        if (proof.dlp?.id) {
          const fileId = parseInt(proof.fileId);
          const dlpId = parseInt(proof.dlp.id);

          let dlpIds = proofMap.get(fileId);
          if (!dlpIds) {
            dlpIds = [];
            proofMap.set(fileId, dlpIds);
          }

          if (!dlpIds.includes(dlpId)) {
            dlpIds.push(dlpId);
          }
        }
      }
    }

    return proofMap;
  }

  /**
   * Fetches proof data for multiple files from the blockchain.
   * Falls back to this when subgraph is unavailable.
   *
   * @private
   * @param fileIds - Array of file IDs to fetch proofs for
   * @returns Map of file IDs to their associated DLP IDs
   */
  private async _fetchProofsFromChain(
    fileIds: number[],
  ): Promise<Map<number, number[]>> {
    const chainId = this.context.publicClient.chain?.id;
    if (!chainId) {
      throw new Error("Chain ID not available");
    }

    const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
    const dataRegistryAbi = getAbi("DataRegistry");

    const proofMap = new Map<number, number[]>();

    // For each file, fetch proofs by incrementing index until revert
    for (const fileId of fileIds) {
      const dlpIds: number[] = [];
      let proofIndex = 0;
      let hasMoreProofs = true;

      while (hasMoreProofs) {
        try {
          const proof = (await this.context.publicClient.readContract({
            address: dataRegistryAddress,
            abi: dataRegistryAbi,
            functionName: "fileProofs",
            args: [BigInt(fileId), BigInt(proofIndex)],
          })) as {
            signature: `0x${string}`;
            data: {
              score: bigint;
              dlpId: bigint;
              metadata: string;
              proofUrl: string;
              instruction: string;
            };
          };

          if (proof?.data?.dlpId) {
            const dlpId = Number(proof.data.dlpId);
            if (!dlpIds.includes(dlpId)) {
              dlpIds.push(dlpId);
            }
          }

          proofIndex++;
        } catch {
          // No more proofs for this file
          hasMoreProofs = false;
        }
      }

      if (dlpIds.length > 0) {
        proofMap.set(fileId, dlpIds);
      }
    }

    return proofMap;
  }

  /**
   * Retrieves information about a specific Data Liquidity Pool (DLP).
   *
   * @remarks
   * DLPs are entities that process and verify data files in the Vana network.
   * This method fetches DLP metadata including name, status, and performance rating.
   * Uses subgraph first for efficiency, falls back to chain if unavailable.
   *
   * @param dlpId - The unique identifier of the DLP
   * @param options - Optional parameters
   * @param options.subgraphUrl - Custom subgraph URL to override default
   * @returns Promise resolving to DLP information
   * @throws {Error} When DLP cannot be found - "DLP not found: {dlpId}"
   * @throws {Error} When query fails - "Failed to fetch DLP: {error}"
   * @example
   * ```typescript
   * const dlp = await vana.data.getDLP(26);
   * console.log(`DLP ${dlp.name}: ${dlp.status}`);
   * ```
   */
  async getDLP(
    dlpId: number,
    options: { subgraphUrl?: string } = {},
  ): Promise<{
    id: number;
    name: string;
    metadata?: string;
    status?: number;
    address?: Address;
    owner?: Address;
  }> {
    const subgraphUrl = options.subgraphUrl ?? this.context.subgraphUrl;

    // Try subgraph first if available
    if (subgraphUrl) {
      try {
        const response = await fetch(subgraphUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: print(GetDlpDocument),
            variables: {
              id: dlpId.toString(),
            },
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Subgraph request failed: ${response.status} ${response.statusText}`,
          );
        }

        const result = (await response.json()) as SubgraphResponse<GetDlpQuery>;

        if (result.errors) {
          throw new Error(
            `Subgraph errors: ${result.errors.map((e) => e.message).join(", ")}`,
          );
        }

        if (!result.data?.dlp) {
          throw new Error(`DLP not found: ${dlpId}`);
        }

        return {
          id: parseInt(result.data.dlp.id),
          name: result.data.dlp.name ?? "",
          metadata: result.data.dlp.metadata ?? undefined,
          status: result.data.dlp.status
            ? parseInt(result.data.dlp.status)
            : undefined,
          address: result.data.dlp.address
            ? (result.data.dlp.address as Address)
            : undefined,
          owner: result.data.dlp.owner
            ? (result.data.dlp.owner as Address)
            : undefined,
        };
      } catch (error) {
        console.debug("Subgraph query failed, falling back to chain:", error);
        // Fall through to chain query
      }
    }

    // Chain fallback - read from DLP Registry contract
    try {
      const chainId = this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dlpRegistryAddress = getContractAddress(chainId, "DLPRegistry");
      const dlpRegistryAbi = getAbi("DLPRegistry");

      const dlpData = (await this.context.publicClient.readContract({
        address: dlpRegistryAddress,
        abi: dlpRegistryAbi,
        functionName: "dlps",
        args: [BigInt(dlpId)],
      })) as {
        id: bigint;
        dlpAddress: Address;
        ownerAddress: Address;
        tokenAddress: Address;
        treasuryAddress: Address;
        name: string;
        iconUrl: string;
        website: string;
        metadata: string;
        registrationBlockNumber: bigint;
        depositAmount: bigint;
        status: number;
        lpTokenId: bigint;
        verificationBlockNumber: bigint;
      };

      if (!dlpData?.name) {
        throw new Error(`DLP not found: ${dlpId}`);
      }

      return {
        id: dlpId,
        name: dlpData.name,
        metadata: dlpData.metadata,
        status: dlpData.status,
        address: dlpData.dlpAddress,
        owner: dlpData.ownerAddress,
      };
    } catch (error) {
      throw new Error(
        `Failed to fetch DLP: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Lists all Data Liquidity Pools (DLPs) with optional pagination.
   *
   * @remarks
   * Fetches a paginated list of all DLPs registered in the network.
   * Uses subgraph for efficient querying with fallback to chain multicall.
   *
   * @param options - Optional parameters for pagination and filtering
   * @param options.limit - Maximum number of DLPs to return (default: 100)
   * @param options.offset - Number of DLPs to skip (default: 0)
   * @param options.subgraphUrl - Custom subgraph URL to override default
   * @returns Promise resolving to array of DLP information
   * @throws {Error} When query fails - "Failed to list DLPs: {error}"
   * @example
   * ```typescript
   * // Get first 10 DLPs
   * const dlps = await vana.data.listDLPs({ limit: 10 });
   * dlps.forEach(dlp => console.log(`${dlp.id}: ${dlp.name}`));
   *
   * // Get next page
   * const nextPage = await vana.data.listDLPs({ limit: 10, offset: 10 });
   * ```
   */
  async listDLPs(
    options: {
      limit?: number;
      offset?: number;
      subgraphUrl?: string;
    } = {},
  ): Promise<
    Array<{
      id: number;
      name: string;
      metadata?: string;
      status?: number;
      address?: Address;
      owner?: Address;
    }>
  > {
    const { limit = 100, offset = 0 } = options;
    const subgraphUrl = options.subgraphUrl ?? this.context.subgraphUrl;

    // Try subgraph first if available
    if (subgraphUrl) {
      try {
        const query = `
          query ListDLPs($first: Int!, $skip: Int!) {
            dlps(first: $first, skip: $skip, orderBy: id) {
              id
              name
              metadata
              status
              address
              owner
            }
          }
        `;

        const response = await fetch(subgraphUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            variables: {
              first: limit,
              skip: offset,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Subgraph request failed: ${response.status} ${response.statusText}`,
          );
        }

        const result = (await response.json()) as {
          data?: {
            dlps?: Array<{
              id: string;
              name?: string;
              metadata?: string;
              status?: string;
              address?: string;
              owner?: string;
            }>;
          };
          errors?: Array<{ message: string }>;
        };

        if (result.errors) {
          throw new Error(
            `Subgraph errors: ${result.errors.map((e) => e.message).join(", ")}`,
          );
        }

        const dlps = result.data?.dlps ?? [];

        return dlps.map((dlp) => ({
          id: parseInt(dlp.id),
          name: dlp.name ?? "",
          metadata: dlp.metadata,
          status: dlp.status ? parseInt(dlp.status) : undefined,
          address: dlp.address ? (dlp.address as Address) : undefined,
          owner: dlp.owner ? (dlp.owner as Address) : undefined,
        }));
      } catch (error) {
        console.debug("Subgraph query failed, falling back to chain:", error);
        // Fall through to chain query
      }
    }

    // Chain fallback - use multicall to batch read DLPs
    try {
      const chainId = this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dlpRegistryAddress = getContractAddress(chainId, "DLPRegistry");
      const dlpRegistryAbi = getAbi("DLPRegistry");

      // First get the total count
      const dlpCount = await this.context.publicClient.readContract({
        address: dlpRegistryAddress,
        abi: dlpRegistryAbi,
        functionName: "dlpsCount",
        args: [],
      });

      const totalCount = Number(dlpCount);
      const start = offset;
      const end = Math.min(start + limit, totalCount);

      if (end <= start) {
        return [];
      }

      // Build multicall for fetching DLP data
      const calls = [];
      for (let i = start + 1; i <= end; i++) {
        // DLP IDs typically start at 1
        calls.push({
          address: dlpRegistryAddress,
          abi: dlpRegistryAbi,
          functionName: "dlps",
          args: [BigInt(i)],
        } as const);
      }

      const results = await gasAwareMulticall<
        typeof calls,
        true // Allow failures
      >(this.context.publicClient, {
        contracts: calls,
        allowFailure: true,
        batchSize: 50,
      });

      const dlps = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === "success" && result.result) {
          const dlpData = result.result as {
            id: bigint;
            dlpAddress: Address;
            ownerAddress: Address;
            tokenAddress: Address;
            treasuryAddress: Address;
            name: string;
            iconUrl: string;
            website: string;
            metadata: string;
            registrationBlockNumber: bigint;
            depositAmount: bigint;
            status: number;
            lpTokenId: bigint;
            verificationBlockNumber: bigint;
          };

          if (dlpData.name) {
            // Only include valid DLPs
            dlps.push({
              id: start + i + 1,
              name: dlpData.name,
              metadata: dlpData.metadata,
              status: dlpData.status,
              address: dlpData.dlpAddress,
              owner: dlpData.ownerAddress,
            });
          }
        }
      }

      return dlps;
    } catch (error) {
      throw new Error(
        `Failed to list DLPs: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Retrieves a list of permissions granted by a user.
   *
   * This method supports automatic fallback between subgraph and RPC modes:
   * - If subgraph URL is available, tries subgraph query first
   * - Falls back to direct contract queries via RPC if subgraph fails
   * - RPC mode uses gasAwareMulticall for efficient batch queries
   *
   * @param params - Object containing the user address and optional subgraph URL
   * @param params.user - The wallet address of the user to query permissions for
   * @param params.subgraphUrl - Optional subgraph URL to override the default
   * @returns Promise resolving to an array of permission objects
   * @throws Error if both subgraph and RPC queries fail
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
    const endpoint = subgraphUrl ?? this.context.subgraphUrl;

    // Try subgraph first if available
    if (endpoint) {
      try {
        const permissions = await this._getUserPermissionsViaSubgraph({
          user,
          subgraphUrl: endpoint,
        });

        return permissions;
      } catch (error) {
        console.warn("Subgraph query failed, falling back to RPC:", error);
        // Fall through to RPC
      }
    }

    // Use RPC (as fallback or primary method)
    return await this._getUserPermissionsViaRpc({ user });
  }

  /**
   * Internal method: Query user permissions via subgraph
   *
   * @param params - Query parameters object
   * @param params.user - The user address to query permissions for
   * @param params.subgraphUrl - The subgraph URL endpoint to query
   * @returns Promise resolving to an array of permission objects
   */
  private async _getUserPermissionsViaSubgraph(params: {
    user: Address;
    subgraphUrl: string;
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

    try {
      // Query the subgraph for user's permissions using the generated query

      const response = await fetch(subgraphUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: print(GetUserPermissionsDocument),
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

      const result =
        (await response.json()) as SubgraphResponse<GetUserPermissionsQuery>;

      if (result.errors) {
        throw new Error(
          `Subgraph query errors: ${result.errors.map((e) => e.message).join(", ")}`,
        );
      }

      const userData = result.data?.user;
      if (!userData?.permissions?.length) {
        return [];
      }

      // Convert subgraph data directly to permission format
      return userData.permissions
        .map((permission) => ({
          id: permission.id,
          grant: permission.grant,
          nonce: BigInt(permission.nonce),
          signature: permission.signature,
          addedAtBlock: BigInt(permission.addedAtBlock),
          addedAtTimestamp: BigInt(permission.addedAtTimestamp),
          transactionHash: permission.transactionHash as Hash,
          user,
        }))
        .sort((a, b) => Number(b.addedAtTimestamp - a.addedAtTimestamp)); // Latest first
    } catch (error) {
      console.error("Failed to query user permissions from subgraph:", error);
      throw error;
    }
  }

  /**
   * Internal method: Query user permissions via direct RPC
   *
   * @param params - Query parameters object
   * @param params.user - The user address to query permissions for
   * @returns Promise resolving to an array of permission objects
   */
  private async _getUserPermissionsViaRpc(params: { user: Address }): Promise<
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
    const { user } = params;

    try {
      const chainId = this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const permissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const permissionsAbi = getAbi("DataPortabilityPermissions");

      // Get total count of user permission IDs
      const totalCount = await this.context.publicClient.readContract({
        address: permissionsAddress,
        abi: permissionsAbi,
        functionName: "userPermissionIdsLength",
        args: [user],
      });

      const total = Number(totalCount);

      if (total === 0) {
        return [];
      }

      // Fetch permission IDs using gasAwareMulticall
      const permissionIdCalls = [];
      for (let i = 0; i < total; i++) {
        permissionIdCalls.push({
          address: permissionsAddress,
          abi: permissionsAbi,
          functionName: "userPermissionIdsAt",
          args: [user, BigInt(i)],
        });
      }

      const permissionIdResults = await gasAwareMulticall<
        typeof permissionIdCalls,
        false
      >(this.context.publicClient, {
        contracts: permissionIdCalls,
      });

      // Extract permission IDs from results
      const permissionIds = permissionIdResults
        .map((result) => result as bigint)
        .filter((id) => id && id > 0n);

      // Build permission info calls for multicall
      const permissionInfoCalls = permissionIds.map(
        (permissionId) =>
          ({
            address: permissionsAddress,
            abi: permissionsAbi,
            functionName: "permissions",
            args: [permissionId],
          }) as const,
      );

      // Fetch all permission info in a single multicall
      const permissionInfoResults = await gasAwareMulticall<
        typeof permissionInfoCalls,
        true // Allow failures for individual permission lookups
      >(this.context.publicClient, {
        contracts: permissionInfoCalls,
        allowFailure: true,
      });

      // Process results
      const permissions = permissionInfoResults
        .map((result, index) => {
          const permissionId = permissionIds[index];

          if (result.status === "success" && result.result) {
            const permissionInfo = result.result as {
              id: bigint;
              grantor: Address;
              nonce: bigint;
              granteeId: bigint;
              grant: string;
              startBlock: bigint;
              endBlock: bigint;
              fileIds: bigint[];
            };

            return {
              id: permissionId.toString(),
              grant: permissionInfo.grant,
              nonce: permissionInfo.nonce,
              signature: "", // Not available from RPC, will be empty
              addedAtBlock: permissionInfo.startBlock,
              addedAtTimestamp: BigInt(0), // Not available from RPC
              transactionHash:
                "0x0000000000000000000000000000000000000000" as `0x${string}`, // Not available from RPC
              user,
            };
          } else {
            // If permission info fails, return basic info
            return {
              id: permissionId.toString(),
              grant: "",
              nonce: BigInt(0),
              signature: "",
              addedAtBlock: BigInt(0),
              addedAtTimestamp: BigInt(0),
              transactionHash:
                "0x0000000000000000000000000000000000000000" as `0x${string}`,
              user,
            };
          }
        })
        .filter((permission) => permission.grant !== ""); // Remove failed lookups

      return permissions;
    } catch (error) {
      throw new Error(
        `RPC query failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Retrieves a list of trusted servers for a user.
   *
   * This method supports automatic fallback between subgraph and RPC modes:
   * - If subgraph URL is available, tries subgraph query first for fast results
   * - Falls back to direct contract queries via RPC if subgraph fails
   * - RPC mode uses gasAwareMulticall for efficient batch queries
   *
   * @param params - Query parameters including user address and optional pagination
   * @param params.user - The wallet address of the user to query trusted servers for
   * @param params.subgraphUrl - Optional subgraph URL to override the default
   * @param params.limit - Maximum number of results to return (default: 50)
   * @param params.offset - Number of results to skip for pagination (default: 0)
   * @returns Promise resolving to an array of trusted server objects
   * @throws Error if both subgraph and RPC queries fail
   * @example
   * ```typescript
   * // Basic usage with automatic fallback
   * const servers = await vana.data.getUserTrustedServers({
   *   user: '0x...'
   * });
   *
   * // With pagination
   * const servers = await vana.data.getUserTrustedServers({
   *   user: '0x...',
   *   limit: 10,
   *   offset: 20
   * });
   *
   * // With custom subgraph URL
   * const servers = await vana.data.getUserTrustedServers({
   *   user: '0x...',
   *   subgraphUrl: 'https://custom-subgraph.com/graphql'
   * });
   * ```
   */
  async getUserTrustedServers(
    params: GetUserTrustedServersParams,
  ): Promise<TrustedServer[]> {
    const { user, limit = 50, offset = 0 } = params;
    const subgraphUrl = params.subgraphUrl ?? this.context.subgraphUrl;

    // Try subgraph first if available
    if (subgraphUrl) {
      try {
        const servers = await this._getUserTrustedServersViaSubgraph({
          user,
          subgraphUrl,
        });

        // Apply pagination if provided
        return limit ? servers.slice(offset, offset + limit) : servers;
      } catch (error) {
        console.warn("Subgraph query failed, falling back to RPC:", error);
        // Fall through to RPC
      }
    }

    // Use RPC (as fallback or primary method)
    const rpcResult = await this._getUserTrustedServersViaRpc({
      user,
      limit,
      offset,
    });

    return rpcResult.servers;
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
      // Query the subgraph for user's trusted servers using the generated query

      const response = await fetch(graphqlEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: print(GetUserTrustedServersDocument),
          variables: {
            userId: user.toLowerCase(), // Subgraph requires lowercase addresses
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Subgraph request failed: ${response.status} ${response.statusText}`,
        );
      }

      const result =
        (await response.json()) as SubgraphResponse<GetUserTrustedServersQuery>;

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
      return (result.data.user.serverTrusts ?? [])
        .filter((trust) => !trust.untrustedAtBlock) // Only include trusted servers (not untrusted)
        .map((trust) => ({
          id: trust.server.id,
          serverAddress: trust.server.serverAddress as Address,
          serverUrl: trust.server.url,
          trustedAt: BigInt(trust.trustedAt),
          user,
          name: "", // Not available in new schema, will be empty
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
      const chainId = this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      // Get total count first
      const totalCount = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "userServerIdsLength",
        args: [user],
      });

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

      // Fetch server IDs using gasAwareMulticall
      const serverIdCalls = [];
      for (let i = offset; i < endIndex; i++) {
        serverIdCalls.push({
          address: DataPortabilityServersAddress,
          abi: DataPortabilityServersAbi,
          functionName: "userServerIdsAt",
          args: [user, BigInt(i)],
        });
      }

      const serverIdResults = await gasAwareMulticall<
        typeof serverIdCalls,
        false
      >(this.context.publicClient, {
        contracts: serverIdCalls,
      });

      // Extract server IDs from results
      const serverIds = serverIdResults
        .map((result) => result as bigint)
        .filter((id) => id && id > 0n);

      // Build server info calls for multicall
      const serverInfoCalls = serverIds.map(
        (serverId) =>
          ({
            address: DataPortabilityServersAddress,
            abi: DataPortabilityServersAbi,
            functionName: "servers",
            args: [serverId],
          }) as const,
      );

      // Fetch all server info in a single multicall
      const serverInfoResults = await gasAwareMulticall<
        typeof serverInfoCalls,
        true // Allow failures for individual server lookups
      >(this.context.publicClient, {
        contracts: serverInfoCalls,
        allowFailure: true,
      });

      // Process results
      const servers = serverInfoResults.map((result, index) => {
        const serverId = serverIds[index];

        if (result.status === "success" && result.result) {
          const serverInfo = result.result as {
            id: bigint;
            owner: Address;
            serverAddress: Address;
            publicKey: string;
            url: string;
          };

          return {
            id: `${user.toLowerCase()}-${serverId.toString()}`,
            serverAddress: serverInfo.serverAddress,
            serverUrl: serverInfo.url,
            trustedAt: BigInt(Date.now()),
            user,
            trustIndex: offset + index,
          };
        } else {
          // If server info fails, return basic info
          return {
            id: `${user.toLowerCase()}-${serverId.toString()}`,
            serverAddress:
              "0x0000000000000000000000000000000000000000" as Address,
            serverUrl: "",
            trustedAt: BigInt(Date.now()),
            user,
            trustIndex: offset + index,
          };
        }
      });

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
      const chainId = this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");

      const dataRegistry = getContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        client: this.context.publicClient,
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
   * Retrieves file metadata by ID from the blockchain.
   *
   * @remarks
   * Queries DataRegistry contract directly for file details.
   * Works for any file ID regardless of ownership, enabling
   * cross-user file discovery and verification.
   *
   * @param fileId - Numeric file ID to retrieve
   *
   * @returns UserFile object with metadata
   *
   * @throws {Error} Chain ID not available.
   *   Ensure proper network connection.
   * @throws {Error} File not found.
   *   Verify file ID exists on-chain.
   * @throws {Error} Contract call failed.
   *   Check network and RPC availability.
   *
   * @example
   * ```typescript
   * const file = await vana.data.getFileById(123);
   * console.log(`File ${file.id}:`);
   * console.log(`  URL: ${file.url}`);
   * console.log(`  Owner: ${file.ownerAddress}`);
   * console.log(`  Block: ${file.addedAtBlock}`);
   * ```
   */
  async getFileById(fileId: number): Promise<UserFile> {
    try {
      const chainId = this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");

      const dataRegistry = getContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        client: this.context.publicClient,
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
          url,
          ownerAddress,
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
   * Registers a file URL directly on the blockchain with a schema ID.
   *
   * @remarks
   * This method registers an existing file URL on the DataRegistry contract
   * with a schema ID, without uploading any data. Useful when you have already
   * uploaded content to storage and just need to register it on-chain.
   *
   * @param url - The URL of the file to register (IPFS or HTTP/HTTPS)
   * @param schemaId - The schema ID to associate with the file
   * @returns Promise resolving to the file ID and transaction hash
   * @throws {Error} When chain ID is not available - "Chain ID not available"
   * @throws {Error} When wallet address is unavailable - "No addresses available"
   * @throws {Error} When transaction fails - "Failed to register file with schema"
   * @example
   * ```typescript
   * const { fileId, transactionHash } = await vana.data.registerFileWithSchema(
   *   "ipfs://QmXxx...",
   *   1
   * );
   * console.log(`File ${fileId} registered with schema in tx ${transactionHash}`);
   * ```
   */
  async registerFileWithSchema(
    url: string,
    schemaId: number,
  ): Promise<TransactionResult<"DataRegistry", "addFileWithSchema">> {
    this.assertWallet();

    try {
      const chainId = this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      this.assertWallet();
      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");
      const account =
        this.context.walletClient.account ?? this.context.userAddress;
      const from = typeof account === "string" ? account : account.address;

      const hash = await this.context.walletClient.writeContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        functionName: "addFileWithSchema",
        args: [url, BigInt(schemaId)],
        account,
        chain: this.context.walletClient.chain ?? null,
      });

      const { tx } = await import("../utils/transactionHelpers");
      return tx({
        hash,
        from,
        contract: "DataRegistry",
        fn: "addFileWithSchema",
      });
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
   * @throws {Error} When no addresses are available in wallet client
   */

  /**
   * Adds a file with permissions to the DataRegistry contract.
   *
   * @param url - The file URL to register
   * @param ownerAddress - The address of the file owner
   * @param permissions - Array of permissions to set for the file
   * @returns Promise resolving to file ID and transaction hash
   * @throws {Error} When chain ID is not available
   * @throws {ContractError} When contract execution fails
   * @throws {Error} When transaction receipt is not available
   * @throws {Error} When FileAdded event cannot be parsed
   *
   * This method handles the core logic of registering a file
   * with specific permissions on the DataRegistry contract. It can be used
   * by both direct transactions and relayer services.
   */
  async addFileWithPermissions(
    url: string,
    ownerAddress: Address,
    permissions: Array<{ account: Address; key: string }> = [],
  ): Promise<TransactionResult<"DataRegistry", "addFileWithPermissions">> {
    this.assertWallet();

    try {
      const chainId = this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      this.assertWallet();
      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");
      const account = this.context.walletClient.account ?? ownerAddress;
      const from = typeof account === "string" ? account : account.address;

      // Execute the transaction using the wallet client
      const hash = await this.context.walletClient.writeContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        functionName: "addFileWithPermissions",
        args: [url, ownerAddress, permissions],
        account,
        chain: this.context.walletClient.chain ?? null,
      });

      const { tx } = await import("../utils/transactionHelpers");
      return tx({
        hash,
        from,
        contract: "DataRegistry",
        fn: "addFileWithPermissions",
      });
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
   * @remarks
   * This method automatically encrypts permissions when a publicKey is provided.
   * It generates the user's encryption key and encrypts it with each recipient's
   * public key before registering on the blockchain.
   *
   * @param url - The URL of the file to register
   * @param ownerAddress - The address of the file owner
   * @param permissions - Array of permissions to grant, each with account and publicKey properties
   * @param schemaId - The schema ID to associate with the file (0 for no schema)
   * @returns Promise resolving to TransactionResult with fileId and transactionHash
   * @throws {Error} "Chain ID not available" - When wallet chain is not configured
   * @throws {Error} "Failed to generate encryption key" - When encryption key generation fails
   * @throws {Error} "Permission for {account} must include 'publicKey'" - When publicKey is missing
   * @throws {Error} "Failed to add file with permissions and schema: {error}" - When transaction fails
   * @example
   * ```typescript
   * // Get server's public key
   * const serverIdentity = await vana.server.getIdentity({
   *   userAddress: "0x..."
   * });
   *
   * // Add file with permissions and schema
   * const result = await vana.data.addFileWithPermissionsAndSchema(
   *   "ipfs://QmXxx...",
   *   ownerAddress,
   *   [{
   *     account: serverIdentity.address,
   *     publicKey: serverIdentity.publicKey
   *   }],
   *   schemaId
   * );
   *
   * console.log(`File ${result.fileId} registered in tx ${result.hash}`);
   * ```
   */
  async addFileWithPermissionsAndSchema(
    url: string,
    ownerAddress: Address,
    permissions: Array<{ account: Address; publicKey: string }> = [],
    schemaId: number = 0,
  ): Promise<
    TransactionResult<"DataRegistry", "addFileWithPermissionsAndSchema">
  > {
    this.assertWallet();

    try {
      // Process permissions - always encrypt with publicKey
      let encryptedPermissions: Array<{ account: Address; key: string }> = [];

      if (permissions.length > 0) {
        this.assertWallet();
        // Generate user's encryption key
        const userEncryptionKey = await generateEncryptionKey(
          this.context.walletClient,
          this.context.platform,
          DEFAULT_ENCRYPTION_SEED,
        );

        encryptedPermissions = await Promise.all(
          permissions.map(async (permission) => {
            if (!permission.publicKey) {
              throw new Error(
                `Permission for ${permission.account} must include 'publicKey'`,
              );
            }

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

      // Call the method with encrypted permissions
      return await this.addFileWithEncryptedPermissionsAndSchema(
        url,
        ownerAddress,
        encryptedPermissions,
        schemaId,
      );
    } catch (error) {
      console.error("Failed to add file with permissions and schema:", error);
      throw new Error(
        `Failed to add file with permissions and schema: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Adds a file with pre-encrypted permissions and schema to the DataRegistry.
   *
   * @remarks
   * This method is designed for relay services and advanced use cases where permissions
   * have already been encrypted client-side. Unlike `addFileWithPermissionsAndSchema()`,
   * this method expects permissions in the encrypted format with a 'key' field instead
   * of 'publicKey'.
   *
   * This is typically used by relay endpoints that receive pre-encrypted data from
   * the client SDK's `upload()` method, avoiding double encryption.
   *
   * @param url - The storage URL of the file (e.g., IPFS URL)
   * @param ownerAddress - The address that will own this file
   * @param permissions - Array of pre-encrypted permissions with 'account' and 'key' fields
   * @param schemaId - Optional schema ID for data validation (defaults to 0)
   * @returns Promise resolving to transaction result with hash and contract details
   * @throws {Error} When chain ID is not available
   * @throws {Error} When wallet is not connected
   * @throws {Error} When transaction fails
   * @example
   * ```typescript
   * // In a relay endpoint that receives pre-encrypted permissions
   * const result = await vana.data.addFileWithEncryptedPermissionsAndSchema(
   *   "ipfs://QmXxx...",
   *   ownerAddress,
   *   [
   *     {
   *       account: "0xServerAddress...",
   *       key: "encrypted_key_string" // Already encrypted by client
   *     }
   *   ],
   *   schemaId
   * );
   *
   * console.log(`File registered in tx ${result.hash}`);
   * ```
   */
  async addFileWithEncryptedPermissionsAndSchema(
    url: string,
    ownerAddress: Address,
    permissions: Array<{ account: Address; key: string }> = [],
    schemaId: number = 0,
  ): Promise<
    TransactionResult<"DataRegistry", "addFileWithPermissionsAndSchema">
  > {
    try {
      const chainId = this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      this.assertWallet();
      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");
      const account = this.context.walletClient.account ?? ownerAddress;
      const from = typeof account === "string" ? account : account.address;

      // Execute the transaction using the wallet client
      const hash = await this.context.walletClient.writeContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        functionName: "addFileWithPermissionsAndSchema",
        args: [url, ownerAddress, permissions, BigInt(schemaId)],
        account,
        chain: this.context.walletClient.chain ?? null,
      });

      const { tx } = await import("../utils/transactionHelpers");
      return tx({
        hash,
        from,
        contract: "DataRegistry",
        fn: "addFileWithPermissionsAndSchema",
      });
    } catch (error) {
      console.error("Failed to add file with permissions and schema:", error);
      throw new Error(
        `Failed to add file with permissions and schema: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Adds a new refiner to the DataRefinerRegistry.
   *
   * @remarks
   * Refiners are data processing templates that define how raw data should be
   * transformed into structured formats. Each refiner is associated with a DLP
   * (Data Liquidity Pool), has a specific schema for output, and includes
   * instructions for the refinement process.
   *
   * @param params - Refiner configuration parameters
   * @param params.dlpId - The Data Liquidity Pool ID this refiner belongs to
   * @param params.name - Human-readable name for the refiner
   * @param params.schemaId - Schema ID that defines the output format
   * @param params.refinementInstructionUrl - URL containing processing instructions
   * @returns Promise resolving to the new refiner ID and transaction hash
   * @throws {Error} When chain ID is not available - "Chain ID not available"
   * @throws {Error} When transaction fails - "Failed to add refiner: {error}"
   * @example
   * ```typescript
   * const result = await vana.data.addRefiner({
   *   dlpId: 1,
   *   name: "Social Media Sentiment Analyzer",
   *   schemaId: 42,
   *   refinementInstructionUrl: "ipfs://QmXxx..."
   * });
   * console.log(`Created refiner ${result.refinerId} in tx ${result.transactionHash}`);
   * ```
   */
  async addRefiner(params: AddRefinerParams): Promise<AddRefinerResult> {
    this.assertWallet();

    try {
      const chainId = this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");
      this.assertWallet();
      const account =
        this.context.walletClient.account ?? this.context.userAddress;
      const from = typeof account === "string" ? account : account.address;

      const hash = await this.context.walletClient.writeContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        functionName: "addRefinerWithSchemaId",
        args: [
          BigInt(params.dlpId),
          params.name,
          BigInt(params.schemaId),
          params.refinementInstructionUrl,
        ],
        account,
        chain: this.context.walletClient.chain ?? null,
      });

      // Create TransactionResult POJO
      const { tx } = await import("../utils/transactionHelpers");
      const txResult = tx({
        hash,
        from,
        contract: "DataRefinerRegistry",
        fn: "addRefinerWithSchemaId",
      });

      // Wait for events and extract domain data
      if (!this.context.waitForTransactionEvents) {
        throw new Error("waitForTransactionEvents not configured");
      }

      const result = await this.context.waitForTransactionEvents(txResult);
      const event = result.expectedEvents.RefinerAdded;
      if (!event) {
        throw new Error("RefinerAdded event not found in transaction");
      }

      return {
        refinerId: Number(event.refinerId),
        transactionHash: hash,
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
   * @remarks
   * Queries the DataRefinerRegistry contract to get complete information about
   * a specific refiner including its DLP association, schema, and instructions.
   *
   * @param refinerId - The numeric refiner ID to retrieve
   * @returns Promise resolving to the refiner information object
   * @throws {Error} When chain ID is not available - "Chain ID not available"
   * @throws {Error} When refiner doesn't exist - "Refiner with ID {refinerId} does not exist"
   * @throws {Error} When contract read fails - "Failed to fetch refiner: {error}"
   * @example
   * ```typescript
   * const refiner = await vana.data.getRefiner(1);
   * console.log({
   *   name: refiner.name,
   *   dlp: refiner.dlpId,
   *   schema: refiner.schemaId,
   *   instructions: refiner.refinementInstructionUrl
   * });
   * ```
   */
  async getRefiner(refinerId: number): Promise<Refiner> {
    try {
      const chainId = this.context.publicClient.chain?.id;
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
        client: this.context.publicClient,
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
   * @remarks
   * Checks the DataRefinerRegistry contract to determine if a given schema ID
   * has been registered and is available for use.
   *
   * @param schemaId - The numeric schema ID to validate
   * @returns Promise resolving to true if schema exists, false otherwise
   * @example
   * ```typescript
   * const isValid = await vana.data.isValidSchemaId(42);
   * if (isValid) {
   *   console.log('Schema 42 is available for use');
   * } else {
   *   console.log('Schema 42 does not exist');
   * }
   * ```
   */
  async isValidSchemaId(schemaId: number): Promise<boolean> {
    try {
      const chainId = this.context.publicClient.chain?.id;
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
        client: this.context.publicClient,
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
   * @remarks
   * Queries the DataRefinerRegistry contract to get the total count of all
   * registered refiners across all DLPs.
   *
   * @returns Promise resolving to the total refiner count
   * @example
   * ```typescript
   * const count = await vana.data.getRefinersCount();
   * console.log(`Total refiners registered: ${count}`);
   * ```
   */
  async getRefinersCount(): Promise<number> {
    try {
      const chainId = this.context.publicClient.chain?.id;
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
        client: this.context.publicClient,
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
   * @remarks
   * Allows the owner of a refiner to update its associated schema ID.
   * This is useful when refiner output format needs to change.
   *
   * @param params - Update parameters
   * @param params.refinerId - The refiner ID to update
   * @param params.newSchemaId - The new schema ID to set
   * @returns Promise resolving to the transaction hash
   * @throws {Error} When chain ID is not available - "Chain ID not available"
   * @throws {Error} When transaction fails - "Failed to update schema ID: {error}"
   * @example
   * ```typescript
   * const result = await vana.data.updateSchemaId({
   *   refinerId: 1,
   *   newSchemaId: 55
   * });
   * console.log(`Schema updated in tx ${result.transactionHash}`);
   * ```
   */
  async updateSchemaId(
    params: UpdateSchemaIdParams,
  ): Promise<UpdateSchemaIdResult> {
    this.assertWallet();

    try {
      const chainId = this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRefinerRegistryAddress = getContractAddress(
        chainId,
        "DataRefinerRegistry",
      );
      const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");
      this.assertWallet();
      const account =
        this.context.walletClient.account ?? this.context.userAddress;

      const hash = await this.context.walletClient.writeContract({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        functionName: "updateSchemaId",
        args: [BigInt(params.refinerId), BigInt(params.newSchemaId)],
        account,
        chain: this.context.walletClient.chain ?? null,
      });

      // Wait for transaction confirmation
      await this.context.publicClient.waitForTransactionReceipt({ hash });

      // Return simple domain result
      return {
        transactionHash: hash,
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
   * @param params - Upload parameters including data, permissions, and options
   * @returns Promise resolving to upload result with file ID and storage URL
   */
  async uploadFileWithPermissions(
    params: UploadFileWithPermissionsParams,
  ): Promise<UploadEncryptedFileResult> {
    this.assertWallet();

    const { data, permissions, filename, providerName } = params;

    try {
      // 1. Upload the file with encryption using the centralized method
      const uploadResult = await this.uploadToStorage(
        data,
        filename,
        true, // Always encrypt for uploadFileWithPermissions
        providerName,
      );

      // 2. Get user address
      const userAddress = this.context.userAddress;

      // 3. Generate user's encryption key (same as used in uploadToStorage)
      const userEncryptionKey = await generateEncryptionKey(
        this.context.walletClient,
        this.context.platform,
        DEFAULT_ENCRYPTION_SEED,
      );

      // 4. Encrypt user's encryption key for each permission
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

      // 5. Register file with permissions (either via relayer or direct)
      if (this.context.relayer) {
        // Use unified relayer callback for file addition with permissions
        const request: UnifiedRelayerRequest = {
          type: "direct",
          operation: "submitFileAdditionWithPermissions",
          params: {
            url: uploadResult.url,
            userAddress,
            permissions: encryptedPermissions,
          },
        };
        const response = await this.context.relayer(request);
        if (response.type === "error") {
          throw new Error(response.error);
        }
        if (response.type !== "direct" || !("fileId" in response.result)) {
          throw new Error("Invalid response from relayer");
        }
        const result = response.result as {
          fileId: number;
          transactionHash: Hash;
        };
        return {
          fileId: result.fileId,
          url: uploadResult.url,
          size: uploadResult.size,
          transactionHash: result.transactionHash,
        };
      } else {
        // Direct transaction - returns TransactionResult POJO
        const txResult = await this.addFileWithPermissions(
          uploadResult.url,
          userAddress,
          encryptedPermissions,
        );

        // Wait for transaction events to get the actual fileId
        if (!this.context.waitForTransactionEvents) {
          throw new Error(
            "Cannot upload without relay: waitForTransactionEvents not configured",
          );
        }

        const eventResult =
          await this.context.waitForTransactionEvents(txResult);
        const fileAddedEvent = eventResult.expectedEvents.FileAdded;
        if (!fileAddedEvent) {
          throw new Error("FileAdded event not found in transaction");
        }

        return {
          fileId: Number(fileAddedEvent.fileId),
          url: uploadResult.url,
          size: uploadResult.size,
          transactionHash: txResult.hash,
        };
      }
    } catch (error) {
      console.error("Failed to upload file with permissions:", error);
      throw new Error(
        `Failed to upload file with permissions: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Uploads content to storage without registering it on the blockchain.
   * This method only handles the storage upload and returns the file URL.
   *
   * @param content - The content to upload (string, Blob, Buffer, or object - objects will be JSON stringified)
   * @param filename - Optional filename for the uploaded file (defaults to timestamp-based name)
   * @param encrypt  - Optional flag to encrypt the content before upload
   * @param providerName - Optional specific storage provider to use
   * @returns Promise resolving to the storage upload result with url, size, and contentType
   */
  async uploadToStorage(
    content: string | Blob | Buffer | object,
    filename?: string,
    encrypt: boolean = false,
    providerName?: string,
  ): Promise<StorageUploadResult> {
    try {
      // Step 1: Normalize content to Blob
      let blob: Blob;
      if (content instanceof Blob) {
        blob = content;
      } else if (typeof content === "string") {
        blob = new Blob([content], { type: "text/plain" });
      } else if (content instanceof Buffer) {
        // Convert Buffer to ArrayBuffer for BlobPart compatibility in browser typings
        const arrayBuffer = content.buffer.slice(
          content.byteOffset,
          content.byteOffset + content.byteLength,
        ) as ArrayBuffer;
        blob = new Blob([arrayBuffer], { type: "application/octet-stream" });
      } else {
        // Handle objects by JSON stringifying them
        blob = new Blob([JSON.stringify(content)], {
          type: "application/json",
        });
      }

      // Step 3: Handle encryption
      let finalBlob = blob;
      if (encrypt) {
        this.assertWallet();

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

      // Generate default filename if not provided
      const finalFilename = filename ?? `upload-${Date.now()}.dat`;

      const uploadResult = await this.context.storageManager.upload(
        finalBlob,
        finalFilename,
        providerName,
      );

      return uploadResult;
    } catch (error) {
      throw new Error(
        `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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
   * @param params - Parameters for adding file permission
   * @param params.fileId - The ID of the file to grant permission for
   * @param params.account - The recipient's wallet address that will access the file
   * @param params.publicKey - The recipient's public key for encryption.
   *   Obtain via `vana.server.getIdentity(account).publicKey`
   * @returns Promise resolving to permission data from PermissionGranted event
   * @throws {Error} "No addresses available in wallet client" - When wallet is not connected
   * @throws {Error} "Chain ID not available" - When wallet chain is not configured
   * @throws {Error} "Failed to add permission to file: {error}" - When transaction fails or user doesn't own file
   * @example
   * ```typescript
   * const result = await vana.data.addPermissionToFile({
   *   fileId: 123,
   *   account: "0xRecipientAddress...",
   *   publicKey: "0xRecipientPublicKey..."
   * });
   * console.log(`Permission granted to ${result.account} for file ${result.fileId}`);
   * console.log(`Transaction: ${result.transactionHash}`);
   * ```
   */
  async addPermissionToFile(
    params: AddFilePermissionParams,
  ): Promise<TransactionResult<"DataRegistry", "addFilePermission">> {
    this.assertWallet();

    const { fileId, account, publicKey } = params;
    return await this.submitFilePermission(fileId, account, publicKey);
  }

  /**
   * Submits a file permission transaction to the blockchain.
   *
   * @remarks
   * This method supports gasless transactions via relayer callbacks when configured.
   * It encrypts the user's encryption key with the recipient's public key before submission.
   * Use this when you want to handle transaction confirmation and event parsing separately.
   *
   * @param fileId - The ID of the file to grant permission for
   * @param account - The recipient's wallet address that will access the file
   * @param publicKey - The recipient's public key for encryption.
   *   Obtain via `vana.server.getIdentity(account).publicKey`
   * @returns Promise resolving to TransactionResult for tracking the transaction
   * @throws {Error} When chain ID is not available
   * @throws {Error} When encryption key generation fails
   * @throws {Error} When public key encryption fails
   *
   * @example
   * ```typescript
   * const tx = await vana.data.submitFilePermission(
   *   fileId,
   *   "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
   *   recipientPublicKey
   * );
   * const result = await tx.waitForEvents();
   * console.log(`Permission granted with ID: ${result.permissionId}`);
   * ```
   */
  async submitFilePermission(
    fileId: number,
    account: Address,
    publicKey: string,
  ): Promise<TransactionResult<"DataRegistry", "addFilePermission">> {
    this.assertWallet();

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

      // 3. Submit directly to the blockchain
      const chainId = this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");

      this.assertWallet();
      const walletAccount =
        this.context.walletClient.account ?? this.context.userAddress;

      const txHash = await this.context.walletClient.writeContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        functionName: "addFilePermission",
        args: [BigInt(fileId), account, encryptedKey],
        account: walletAccount,
        chain: this.context.walletClient.chain ?? null,
      });

      const { tx } = await import("../utils/transactionHelpers");
      return tx({
        hash: txHash,
        from:
          typeof walletAccount === "string"
            ? walletAccount
            : walletAccount.address,
        contract: "DataRegistry",
        fn: "addFilePermission",
      });
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
      const chainId = this.context.publicClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");

      const dataRegistry = getContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        client: this.context.publicClient,
      });

      const encryptedKey = await dataRegistry.read.filePermissions([
        BigInt(fileId),
        account,
      ]);

      return encryptedKey;
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
   * @param options - Optional decryption configuration
   * @param options.account - The account address that has permission (defaults to current wallet account)
   * @returns Promise resolving to the decrypted file data
   */
  async decryptFileWithPermission(
    file: UserFile,
    privateKey: string,
    options?: DecryptFileWithPermissionOptions,
  ): Promise<Blob> {
    try {
      // Use provided account or get current wallet account
      const permissionAccount = options?.account ?? this.context.userAddress;

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
   * @throws {Error} "HTTP error! status: {status} {statusText}" - When server returns error status
   * @throws {Error} "Empty response" - When server returns no content
   * @throws {Error} "Network error: Failed to fetch from {url}" - When network request fails
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
      const { universalFetch } = await import("../utils/download");
      const response = await universalFetch(url, this.context.downloadRelayer);

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
   * @throws {Error} "Invalid IPFS URL format" - When URL is not ipfs:// or valid CID
   * @throws {Error} "Empty response" - When gateway returns no content
   * @throws {Error} "HTTP error! status: {status}" - When gateway returns error status
   * @throws {Error} "Failed to fetch IPFS content {cid} from all gateways" - When all gateways fail
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
      options?.gateways ?? this.context.ipfsGateways ?? defaultGateways;

    // Use ipfs utilities to extract hash
    const { extractIpfsHash } = await import("../utils/ipfs");
    const cid = extractIpfsHash(url);

    if (!cid) {
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
    // Try download relayer as final fallback if configured
    if (this.context.downloadRelayer && gateways.length > 0) {
      try {
        // Try with the first gateway URL format
        const relayerUrl = gateways[0].endsWith("/")
          ? `${gateways[0]}${cid}`
          : `${gateways[0]}/${cid}`;
        return await this.context.downloadRelayer.proxyDownload(relayerUrl);
      } catch (relayerError) {
        errors.push({
          gateway: "download-relayer",
          error: `Proxy failed: ${relayerError instanceof Error ? relayerError.message : "Unknown error"}`,
        });
      }
    }

    const errorDetails = errors
      .map((e) => `${e.gateway}: ${e.error}`)
      .join("\n  ");

    throw new Error(
      `Failed to fetch IPFS content ${cid} from all gateways:\n  ${errorDetails}`,
    );
  }

  /**
   * Validates a data schema definition against the Vana meta-schema.
   *
   * @param schema - The data schema definition to validate
   * @returns The validated DataSchema
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
   * const validatedSchema = vana.data.validateDataSchemaAgainstMetaSchema(schema);
   * ```
   */
  validateDataSchemaAgainstMetaSchema(schema: unknown): DataSchema {
    return validateDataSchemaAgainstMetaSchema(schema);
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
    validateDataAgainstSchema(data, schema);
  }

  /**
   * Fetches and validates a data schema from a URL, then returns the parsed data schema.
   *
   * @param url - The URL to fetch the data schema from
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
}
