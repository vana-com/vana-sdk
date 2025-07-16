import { Address, getContract, decodeEventLog } from "viem";

import {
  UserFile,
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
} from "../types/index";
import { ControllerContext } from "./permissions";
import { ServerController } from "./server";
import { getContractAddress } from "../config/addresses";
import { getAbi } from "../abi";
import {
  generateEncryptionKey,
  decryptUserData,
  DEFAULT_ENCRYPTION_SEED,
  encryptUserData,
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
 * @example
 * ```typescript
 * // Upload an encrypted file with automatic schema validation
 * const result = await vana.data.uploadEncryptedFile(
 *   encryptedBlob,
 *   "personal-data.json"
 * );
 *
 * // Query files owned by a user
 * const files = await vana.data.getUserFiles({
 *   owner: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
 * });
 *
 * // Decrypt accessible file content
 * const decryptedData = await vana.data.decryptFile(files[0]);
 * ```
 *
 * @category Data Management
 * @see {@link [URL_PLACEHOLDER] | Vana Data Registry Documentation} for conceptual overview
 */
export class DataController {
  private readonly serverController: ServerController;

  constructor(private readonly context: ControllerContext) {
    this.serverController = new ServerController(context);
  }

  /**
   * Retrieves all data files owned by a specific user address.
   *
   * @remarks
   * This method queries the Vana subgraph to find files directly owned by the user.
   * It efficiently handles large datasets by using the File entity's owner field
   * and returns complete file metadata without additional contract calls.
   *
   * @param params - The query parameters object
   * @param params.owner - The wallet address of the file owner to query
   * @param params.subgraphUrl - Optional subgraph URL to override the default endpoint
   * @returns A Promise that resolves to an array of UserFile objects with metadata
   * @throws {Error} When the subgraph is unavailable or returns invalid data
   *
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
   *
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
   *
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
   *
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
   * Decrypts a file that was encrypted using the Vana protocol.
   *
   * @param file - The UserFile object containing the file URL and metadata
   * @param encryptionSeed - Optional custom encryption seed (defaults to Vana standard)
   * @returns Promise resolving to the decrypted file as a Blob
   *
   * This method handles the complete flow of:
   * 1. Generating the encryption key from the user's wallet signature
   * 2. Fetching the encrypted file from the stored URL
   * 3. Decrypting the file using the canonical Vana decryption method
   */
  async decryptFile(
    file: UserFile,
    encryptionSeed: string = DEFAULT_ENCRYPTION_SEED,
  ): Promise<Blob> {
    try {
      // Step 1: Generate encryption key using the same method used for encryption
      const encryptionKey = await generateEncryptionKey(
        this.context.walletClient,
        encryptionSeed,
      );

      // Step 2: Fetch the encrypted file from the URL
      const fetchUrl = this.convertIpfsUrl(file.url);
      // Fetching file from storage

      const response = await fetch(fetchUrl);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "File not found. The encrypted file may have been moved or deleted.",
          );
        } else if (response.status === 403) {
          throw new Error(
            "Access denied. You may not have permission to access this file.",
          );
        } else {
          throw new Error(
            `Network error: ${response.status} ${response.statusText}`,
          );
        }
      }

      const encryptedBlob = await response.blob();

      // Check if we got actual content
      if (encryptedBlob.size === 0) {
        throw new Error("File is empty or could not be retrieved.");
      }

      // Step 3: Decrypt the file using the canonical Vana decryption method
      const decryptedBlob = await decryptUserData(
        encryptedBlob,
        encryptionKey,
        this.context.platform,
      );

      return decryptedBlob;
    } catch (error) {
      console.error("Failed to decrypt file:", error);

      // Provide user-friendly error messages
      if (error instanceof Error) {
        if (
          error.message.includes("Session key decryption failed") ||
          error.message.includes("Error decrypting message")
        ) {
          throw new Error(
            "Wrong encryption key. This file may have been encrypted with a different wallet or encryption seed. Try using the same wallet that originally encrypted this file.",
          );
        } else if (
          error.message.includes("Failed to fetch") ||
          error.message.includes("Network error")
        ) {
          throw new Error(
            "Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions.",
          );
        } else if (error.message.includes("File not found")) {
          throw new Error(
            "File not found: The encrypted file is no longer available at the stored URL.",
          );
        } else if (error.message.includes("not a valid OpenPGP message")) {
          throw new Error(
            "Invalid file format: This file doesn't appear to be encrypted with the Vana protocol.",
          );
        }
      }

      throw error;
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
   * Converts IPFS URLs to HTTP gateway URLs for fetching.
   */
  private convertIpfsUrl(ipfsUrl: string): string {
    if (ipfsUrl.startsWith("ipfs://")) {
      const hash = ipfsUrl.replace("ipfs://", "");
      return `https://ipfs.io/ipfs/${hash}`;
    }
    return ipfsUrl;
  }

  /**
   * Gets the user's address from the wallet client.
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
   * Adds a new schema to the DataRefinerRegistry.
   *
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

      return {
        id: schemaId,
        name: schemaData.name,
        type: schemaData.typ,
        definitionUrl: schemaData.definitionUrl,
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
        functionName: "addRefiner",
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
        DEFAULT_ENCRYPTION_SEED,
      );

      // 2. Encrypt data with user's key
      const encryptedData = await encryptUserData(
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
   *
   * @param fileId - The ID of the file to add permissions for
   * @param account - The address of the account to grant permission to
   * @param publicKey - The public key to encrypt the user's encryption key with
   * @returns Promise resolving to the transaction hash
   */
  async addPermissionToFile(
    fileId: number,
    account: Address,
    publicKey: string,
  ): Promise<string> {
    try {
      // 1. Generate user's encryption key
      const userEncryptionKey = await generateEncryptionKey(
        this.context.walletClient,
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
   * Gets the trusted server public key for a given server address.
   * This method reads from the permissions contract to find servers and their public keys.
   *
   * @param serverAddress - The address of the trusted server
   * @returns Promise resolving to the server's public key
   */
  async getTrustedServerPublicKey(serverAddress: Address): Promise<string> {
    try {
      // Use the ServerController to get the trusted server's public key
      // via the Identity Server. The serverAddress represents the user's address
      // whose personal server we want to encrypt data for.
      return await this.serverController.getTrustedServerPublicKey(
        serverAddress,
      );
    } catch (error) {
      console.error("Failed to get trusted server public key:", error);
      throw new Error(
        `Failed to get trusted server public key: ${error instanceof Error ? error.message : "Unknown error"}`,
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
      const response = await fetch(this.convertIpfsUrl(file.url));
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }
      const encryptedData = await response.blob();

      // 4. Decrypt the file data using the user's encryption key
      const decryptedData = await decryptUserData(
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
   * Validates a data schema against the Vana meta-schema.
   *
   * @param schema - The data schema to validate
   * @returns true if valid
   * @throws SchemaValidationError if invalid
   *
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
   * @throws SchemaValidationError if invalid
   *
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
   *
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
   *
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
