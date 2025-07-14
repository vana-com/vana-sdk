import { Address, Hash } from "viem";
import type { WalletClient, PublicClient } from "viem";
import {
  GrantPermissionParams,
  RevokePermissionParams,
  PermissionGrantTypedData,
  GenericTypedData,
  GrantedPermission,
  TrustServerParams,
  UntrustServerParams,
  TrustServerInput,
  UntrustServerInput,
  TrustServerTypedData,
  UntrustServerTypedData,
  Server,
  TrustedServerInfo,
  PaginatedTrustedServers,
  TrustedServerQueryOptions,
  BatchServerInfoResult,
  ServerTrustStatus,
} from "../types/index";
import { PermissionInfo } from "../types/permissions";
import type { RelayerCallbacks } from "../types/config";
import {
  RelayerError,
  UserRejectedRequestError,
  SerializationError,
  SignatureError,
  NetworkError,
  NonceError,
  BlockchainError,
  ServerUrlMismatchError,
  PermissionError,
} from "../errors";
import { getContractAddress } from "../config/addresses";
import { getAbi } from "../abi";
import {
  createGrantFile,
  getGrantFileHash,
  retrieveGrantFile,
} from "../utils/grantFiles";
import { validateGrant } from "../utils/grantValidation";
import { StorageManager } from "../storage";
import type { VanaPlatformAdapter } from "../platform/interface";

interface SubgraphPermissionsResponse {
  data?: {
    user?: {
      permissions?: Array<{
        id: string;
        account: string;
        publicKey: string;
        encryptedKey: string;
        grantSignature: string;
        grantHash: string;
        grant: string;
        user: { id: string };
        addedAtBlock: string;
        nonce: string;
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Shared configuration and services passed to all SDK controllers.
 *
 * This interface provides the foundational blockchain and storage services that all
 * controllers need to operate. It's automatically created by the main Vana SDK class
 * and passed to each controller during initialization.
 *
 * @category Configuration
 * @example
 * ```typescript
 * // Context is automatically created when initializing the SDK
 * const vana = new Vana({
 *   account: privateKeyToAccount('0x...'), // Creates walletClient
 *   network: 'moksha', // Creates publicClient for network
 *   relayerCallbacks: { // Optional gasless transactions
 *     submitPermissionGrant: async (typedData, signature) => {
 *       return await myRelayer.submit(typedData, signature);
 *     }
 *   },
 *   storage: { // Optional custom storage
 *     defaultProvider: 'ipfs',
 *     providers: { ipfs: new IPFSStorage() }
 *   }
 * });
 * ```
 */
export interface ControllerContext {
  /** Primary wallet client for signing transactions and messages */
  walletClient: WalletClient;
  /** Read-only client for querying blockchain state and contracts */
  publicClient: PublicClient;
  /** Optional separate wallet for application-specific operations */
  applicationClient?: WalletClient;
  /**
   * Optional relayer callback functions for handling gasless transactions.
   */
  relayerCallbacks?: RelayerCallbacks;
  /** Optional storage manager for file upload/download operations */
  storageManager?: StorageManager;
  /** Optional subgraph URL for querying user files and permissions */
  subgraphUrl?: string;
  /** Platform adapter for environment-specific operations */
  platform: VanaPlatformAdapter;
}

/**
 * Controller for granting, revoking, and managing gasless data access permissions.
 *
 * The PermissionsController enables users to grant applications access to their data
 * without paying gas fees. It handles the complete EIP-712 permission flow including
 * signature creation, IPFS storage of permission details, and relayer submission.
 *
 * **Common workflows:**
 * - Grant data access: `grant()` (complete end-to-end flow)
 * - Revoke permissions: `revoke()`
 * - Query permissions: `getUserPermissions()`
 * - Trust/untrust servers: `trustServer()`, `untrustServer()`
 *
 * @category Permissions
 * @example
 * ```typescript
 * // Grant permission for an app to access your data
 * const txHash = await vana.permissions.grant({
 *   to: '0x...', // Application address
 *   operation: 'llm_inference',
 *   parameters: { model: 'gpt-4', maxTokens: 1000 }
 * });
 *
 * // Revoke a permission
 * await vana.permissions.revoke({
 *   to: '0x...', // Application address
 *   operation: 'llm_inference'
 * });
 *
 * // Check current permissions
 * const permissions = await vana.permissions.getUserPermissions();
 * ```
 */
export class PermissionsController {
  constructor(private readonly context: ControllerContext) {}

  /**
   * Grants permission for an application to access user data.
   * Combines createAndSign + submitSignedGrant for a complete end-to-end flow.
   *
   * @param params - The permission grant parameters
   * @returns Promise resolving to the transaction hash
   */
  async grant(params: GrantPermissionParams): Promise<Hash> {
    const { typedData, signature } = await this.createAndSign(params);
    return await this.submitSignedGrant(typedData, signature);
  }

  /**
   * Creates typed data and signature for a permission grant.
   * This is the first step in the permission grant process.
   *
   * @param params - The permission grant parameters
   * @returns Promise resolving to typed data and signature
   */
  async createAndSign(params: GrantPermissionParams): Promise<{
    typedData: PermissionGrantTypedData;
    signature: Hash;
  }> {
    try {
      // Step 1: Create grant file with all the real data
      const grantFile = createGrantFile(params);

      // Step 1.5: Validate the grant file against our JSON schema
      validateGrant(grantFile);

      // Step 2: Use provided grantUrl or store grant file in IPFS
      let grantUrl = params.grantUrl;
      console.debug("🔍 Debug - Grant URL from params:", grantUrl);
      if (!grantUrl) {
        if (
          !this.context.relayerCallbacks?.storeGrantFile &&
          !this.context.storageManager
        ) {
          throw new Error(
            "No storage available. Provide a grantUrl, configure relayerCallbacks.storeGrantFile, or storageManager.",
          );
        }
        if (this.context.relayerCallbacks?.storeGrantFile) {
          grantUrl =
            await this.context.relayerCallbacks.storeGrantFile(grantFile);
        } else if (this.context.storageManager) {
          // Store using local storage manager if available
          const blob = new Blob([JSON.stringify(grantFile)], {
            type: "application/json",
          });
          const result = await this.context.storageManager.upload(
            blob,
            `grant-${Date.now()}.json`,
          );
          grantUrl = result.url;
        }

        if (!grantUrl) {
          throw new Error("Failed to store grant file - no URL returned");
        }
      }

      // Step 3: Get user nonce
      const nonce = await this.getUserNonce();

      // Step 4: Create EIP-712 message with compatibility placeholders
      console.debug(
        "🔍 Debug - Final grant URL being passed to compose:",
        grantUrl,
      );
      const typedData = await this.composePermissionGrantMessage({
        to: params.to,
        operation: params.operation, // Placeholder - real data is in IPFS
        files: params.files, // Placeholder - real data is in IPFS
        grantUrl,
        serializedParameters: getGrantFileHash(grantFile), // Hash as placeholder
        nonce,
      });

      // Step 5: User signature
      const signature = await this.signTypedData(typedData);

      return { typedData, signature };
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw known Vana errors directly
        if (
          error instanceof RelayerError ||
          error instanceof UserRejectedRequestError ||
          error instanceof SerializationError ||
          error instanceof SignatureError ||
          error instanceof NetworkError ||
          error instanceof NonceError
        ) {
          throw error;
        }
        // Wrap unknown errors
        throw new BlockchainError(
          `Permission grant preparation failed: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError(
        "Permission grant preparation failed with unknown error",
      );
    }
  }

  /**
   * Submits an already-signed permission grant to the blockchain.
   * Supports both relayer-based gasless transactions and direct transactions.
   *
   * @param typedData - The EIP-712 typed data
   * @param signature - The user's signature
   * @returns Promise resolving to the transaction hash
   */
  async submitSignedGrant(
    typedData: PermissionGrantTypedData,
    signature: Hash,
  ): Promise<Hash> {
    try {
      console.debug(
        "🔍 Debug - submitSignedGrant called with typed data:",
        JSON.stringify(
          typedData,
          (key, value) =>
            typeof value === "bigint" ? value.toString() : value,
          2,
        ),
      );

      // Use relayer callbacks or direct transaction
      if (this.context.relayerCallbacks?.submitPermissionGrant) {
        // Create a JSON-safe version for relayer
        const jsonSafeTypedData = JSON.parse(
          JSON.stringify(typedData, (_key, value) =>
            typeof value === "bigint" ? value.toString() : value,
          ),
        );
        return await this.context.relayerCallbacks.submitPermissionGrant(
          jsonSafeTypedData,
          signature,
        );
      } else {
        return await this.submitDirectTransaction(typedData, signature);
      }
    } catch (error) {
      // Re-throw known Vana errors directly to preserve error types
      if (
        error instanceof RelayerError ||
        error instanceof NetworkError ||
        error instanceof UserRejectedRequestError ||
        error instanceof SignatureError ||
        error instanceof NonceError
      ) {
        throw error;
      }
      throw new BlockchainError(
        `Permission submission failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submits an already-signed trust server transaction to the blockchain.
   * This method extracts the trust server input from typed data and submits it directly.
   *
   * @param typedData - The EIP-712 typed data for TrustServer
   * @param signature - The user's signature
   * @returns Promise resolving to the transaction hash
   */
  async submitSignedTrustServer(
    typedData: TrustServerTypedData,
    signature: Hash,
  ): Promise<Hash> {
    try {
      const trustServerInput: TrustServerInput = {
        nonce: BigInt(typedData.message.nonce),
        serverId: typedData.message.serverId,
        serverUrl: typedData.message.serverUrl,
      };

      return await this.submitTrustServerTransaction(
        trustServerInput,
        signature,
      );
    } catch (error) {
      // Re-throw known Vana errors directly to preserve error types
      if (
        error instanceof RelayerError ||
        error instanceof NetworkError ||
        error instanceof UserRejectedRequestError ||
        error instanceof SignatureError ||
        error instanceof NonceError
      ) {
        throw error;
      }

      // Check for specific contract errors
      if (
        error instanceof Error &&
        error.message.includes("ServerUrlMismatch")
      ) {
        const match = error.message.match(
          /ServerUrlMismatch\(string existingUrl, string providedUrl\)\s+\(([^,]+),\s*([^)]+)\)/,
        );
        if (match) {
          const existingUrl = match[1].trim();
          const providedUrl = match[2].trim();
          throw new ServerUrlMismatchError(
            existingUrl,
            providedUrl,
            typedData.message.serverId,
          );
        }
      }

      throw new BlockchainError(
        `Trust server submission failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submits an already-signed permission revoke transaction to the blockchain.
   * This method handles the revocation of previously granted permissions.
   *
   * @param typedData - The EIP-712 typed data for PermissionRevoke
   * @param signature - The user's signature
   * @returns Promise resolving to the transaction hash
   */
  async submitSignedRevoke(
    typedData: GenericTypedData,
    signature: Hash,
  ): Promise<Hash> {
    try {
      // Use relayer callbacks or direct transaction
      if (this.context.relayerCallbacks?.submitPermissionRevoke) {
        // Create a JSON-safe version for relayer
        const jsonSafeTypedData = JSON.parse(
          JSON.stringify(typedData, (_key, value) =>
            typeof value === "bigint" ? value.toString() : value,
          ),
        );
        return await this.context.relayerCallbacks.submitPermissionRevoke(
          jsonSafeTypedData,
          signature,
        );
      } else {
        return await this.submitDirectRevokeTransaction(typedData, signature);
      }
    } catch (error) {
      if (
        error instanceof RelayerError ||
        error instanceof NetworkError ||
        error instanceof UserRejectedRequestError ||
        error instanceof SignatureError ||
        error instanceof NonceError
      ) {
        throw error;
      }
      throw new BlockchainError(
        `Permission revoke submission failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submits an already-signed untrust server transaction to the blockchain.
   * This method handles the removal of trusted servers.
   *
   * @param typedData - The EIP-712 typed data for UntrustServer
   * @param signature - The user's signature
   * @returns Promise resolving to the transaction hash
   */
  async submitSignedUntrustServer(
    typedData: GenericTypedData,
    signature: Hash,
  ): Promise<Hash> {
    try {
      // Use relayer callbacks or direct transaction
      if (this.context.relayerCallbacks?.submitUntrustServer) {
        return await this.context.relayerCallbacks.submitUntrustServer(
          typedData as unknown as UntrustServerTypedData,
          signature,
        );
      } else {
        return await this.submitDirectUntrustTransaction(typedData, signature);
      }
    } catch (error) {
      if (
        error instanceof RelayerError ||
        error instanceof NetworkError ||
        error instanceof UserRejectedRequestError ||
        error instanceof SignatureError ||
        error instanceof NonceError
      ) {
        throw error;
      }
      throw new BlockchainError(
        `Untrust server submission failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submits a signed transaction directly to the blockchain.
   */
  private async submitDirectTransaction(
    typedData: PermissionGrantTypedData,
    signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPermissionsAddress = getContractAddress(
      chainId,
      "DataPermissions",
    );
    const DataPermissionsAbi = getAbi("DataPermissions");

    // Prepare the PermissionInput struct
    const permissionInput = {
      nonce: typedData.message.nonce,
      grant: typedData.message.grant,
      fileIds: typedData.message.fileIds,
    };

    console.debug("🔍 Debug - Permission input being sent to contract:", {
      nonce: permissionInput.nonce.toString(),
      grant: permissionInput.grant,
      fileIds: permissionInput.fileIds.map((id) => id.toString()),
    });
    console.debug("🔍 Debug - Grant field value:", typedData.message.grant);
    console.debug(
      "🔍 Debug - Grant field length:",
      typedData.message.grant?.length || 0,
    );

    // Submit directly to the contract using the provided wallet client
    const txHash = await this.context.walletClient.writeContract({
      address: DataPermissionsAddress,
      abi: DataPermissionsAbi,
      functionName: "addPermission",
      args: [permissionInput, signature],
      account:
        this.context.walletClient.account || (await this.getUserAddress()),
      chain: this.context.walletClient.chain || null,
    });

    return txHash;
  }

  /**
   * Revokes a previously granted permission.
   *
   * @param params - Parameters for revoking the permission
   * @returns Promise resolving to transaction hash
   */
  async revoke(params: RevokePermissionParams): Promise<Hash> {
    try {
      // Check chain ID availability early
      if (!this.context.walletClient.chain?.id) {
        throw new BlockchainError("Chain ID not available");
      }

      const chainId = await this.context.walletClient.getChainId();
      const DataPermissionsAddress = getContractAddress(
        chainId,
        "DataPermissions",
      );
      const DataPermissionsAbi = getAbi("DataPermissions");

      // Direct contract call for revocation
      const txHash = await this.context.walletClient.writeContract({
        address: DataPermissionsAddress,
        abi: DataPermissionsAbi,
        functionName: "revokePermission",
        args: [params.permissionId],
        account:
          this.context.walletClient.account || (await this.getUserAddress()),
        chain: this.context.walletClient.chain || null,
      });

      return txHash;
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw known Vana errors directly
        if (
          error instanceof RelayerError ||
          error instanceof UserRejectedRequestError ||
          error instanceof SerializationError ||
          error instanceof SignatureError ||
          error instanceof NetworkError ||
          error instanceof NonceError
        ) {
          throw error;
        }
        throw new BlockchainError(
          `Permission revoke failed: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError("Permission revoke failed with unknown error");
    }
  }

  /**
   * Revokes a permission with a signature (gasless transaction).
   *
   * @param params - Parameters for revoking the permission
   * @returns Promise resolving to transaction hash
   */
  async revokeWithSignature(params: RevokePermissionParams): Promise<Hash> {
    try {
      // Check chain ID availability early
      if (!this.context.walletClient.chain?.id) {
        throw new BlockchainError("Chain ID not available");
      }

      const nonce = await this.getUserNonce();

      // Create revoke permission input
      const revokePermissionInput = {
        nonce,
        permissionId: params.permissionId,
      };

      // Create typed data for revoke
      const typedData = {
        domain: await this.getPermissionDomain(),
        types: {
          RevokePermission: [
            { name: "nonce", type: "uint256" },
            { name: "permissionId", type: "uint256" },
          ],
        },
        primaryType: "RevokePermission" as const,
        message: revokePermissionInput,
      };

      const signature = await this.signTypedData(typedData);

      // Submit via relayer callbacks or directly
      if (this.context.relayerCallbacks?.submitPermissionRevoke) {
        return await this.context.relayerCallbacks.submitPermissionRevoke(
          typedData,
          signature,
        );
      } else {
        return await this.submitDirectRevokeTransaction(typedData, signature);
      }
    } catch (error) {
      throw new PermissionError(
        `Failed to revoke permission with signature: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Retrieves the user's current nonce from the DataPermissions contract.
   */
  private async getUserNonce(): Promise<bigint> {
    try {
      const userAddress = await this.getUserAddress();
      const chainId = await this.context.walletClient.getChainId();

      const DataPermissionsAddress = getContractAddress(
        chainId,
        "DataPermissions",
      );
      const DataPermissionsAbi = getAbi("DataPermissions");

      const nonce = (await this.context.publicClient.readContract({
        address: DataPermissionsAddress,
        abi: DataPermissionsAbi,
        functionName: "userNonce",
        args: [userAddress],
      })) as bigint;

      return nonce;
    } catch (error) {
      throw new NonceError(
        `Failed to retrieve user nonce: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Composes the EIP-712 typed data for PermissionGrant (new simplified format).
   */
  private async composePermissionGrantMessage(params: {
    to: Address;
    operation: string;
    files: number[];
    grantUrl: string;
    serializedParameters: string;
    nonce: bigint;
  }): Promise<PermissionGrantTypedData> {
    const domain = await this.getPermissionDomain();

    console.debug(
      "🔍 Debug - Composing permission message with grantUrl:",
      params.grantUrl,
    );

    return {
      domain,
      types: {
        Permission: [
          { name: "nonce", type: "uint256" },
          { name: "grant", type: "string" },
          { name: "fileIds", type: "uint256[]" },
        ],
      },
      primaryType: "Permission",
      message: {
        nonce: params.nonce,
        grant: params.grantUrl,
        fileIds: params.files.map((fileId) => BigInt(fileId)),
      },
    };
  }

  /**
   * Gets the EIP-712 domain for PermissionGrant signatures.
   */
  private async getPermissionDomain() {
    const chainId = await this.context.walletClient.getChainId();
    const DataPermissionsAddress = getContractAddress(
      chainId,
      "DataPermissions",
    );

    return {
      name: "VanaDataPermissions",
      version: "1",
      chainId,
      verifyingContract: DataPermissionsAddress,
    };
  }

  /**
   * Signs typed data using the wallet client.
   */
  private async signTypedData(
    typedData: PermissionGrantTypedData | GenericTypedData,
  ): Promise<Hash> {
    try {
      const signature = await this.context.walletClient.signTypedData(
        typedData as Parameters<
          typeof this.context.walletClient.signTypedData
        >[0],
      );
      return signature;
    } catch (error) {
      if (error instanceof Error && error.message.includes("rejected")) {
        throw new UserRejectedRequestError();
      }
      throw new SignatureError(
        `Failed to sign typed data: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Gets the user's address from the wallet client.
   */
  private async getUserAddress(): Promise<Address> {
    const addresses = await this.context.walletClient.getAddresses();
    if (addresses.length === 0) {
      throw new BlockchainError("No addresses available in wallet client");
    }
    return addresses[0];
  }

  /**
   * Retrieves all permissions granted by the current user using the new subgraph entities.
   *
   * @param params - Optional parameters including limit and subgraph URL
   * @returns Promise resolving to an array of GrantedPermission objects
   *
   * This method queries the Vana subgraph to find permissions directly granted by the user
   * using the new Permission entity. It efficiently handles millions of permissions by
   * using the subgraph instead of scanning the contract.
   */
  async getUserPermissions(params?: {
    limit?: number;
    subgraphUrl?: string;
  }): Promise<GrantedPermission[]> {
    try {
      const userAddress = await this.getUserAddress();

      // Use provided subgraph URL or default from context
      const graphqlEndpoint = params?.subgraphUrl || this.context.subgraphUrl;

      if (!graphqlEndpoint) {
        throw new BlockchainError(
          "subgraphUrl is required. Please provide a valid subgraph endpoint or configure it in Vana constructor.",
        );
      }

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
            }
          }
        }
      `;

      console.info("Query:", query);
      console.info(
        "Body:",
        JSON.stringify({
          query,
          variables: {
            userId: userAddress.toLowerCase(),
          },
        }),
      );

      const response = await fetch(graphqlEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: {
            userId: userAddress.toLowerCase(),
          },
        }),
      });

      if (!response.ok) {
        throw new BlockchainError(
          `Subgraph request failed: ${response.status} ${response.statusText}`,
        );
      }

      const result = (await response.json()) as SubgraphPermissionsResponse;

      console.info("Result:", result);

      if (result.errors) {
        throw new BlockchainError(
          `Subgraph errors: ${result.errors.map((e: { message: string }) => e.message).join(", ")}`,
        );
      }

      const userData = result.data?.user;
      if (!userData || !userData.permissions?.length) {
        console.warn("No permissions found for user:", userAddress);
        return [];
      }

      const userPermissions: GrantedPermission[] = [];
      const limit = params?.limit || 50; // Default limit
      const permissionsToProcess = userData.permissions.slice(0, limit);

      // Process each permission and fetch grant file data
      for (const permission of permissionsToProcess) {
        try {
          // Fetch and parse the grant file from IPFS to get complete permission data
          let operation: string | undefined;
          let files: number[] = [];
          let parameters: unknown | undefined;
          let granteeAddress: string | undefined;

          try {
            const grantFile = await retrieveGrantFile(permission.grant);
            operation = grantFile.operation;
            parameters = grantFile.parameters;
            granteeAddress = grantFile.grantee;
          } catch {
            // Failed to retrieve grant file - using basic permission data
            // Continue with basic permission data even if grant file can't be retrieved
          }

          // Get file IDs from the contract
          try {
            const fileIds = await this.getPermissionFileIds(
              BigInt(permission.id),
            );
            files = fileIds.map((id) => Number(id));
          } catch {
            // Failed to retrieve file IDs - using empty array
            // Continue with empty files array
          }

          userPermissions.push({
            id: BigInt(permission.id),
            files: files,
            operation: operation || "",
            parameters: (parameters as Record<string, unknown>) || {},
            grant: permission.grant,
            grantor: userAddress, // Current user is the grantor
            grantee: (granteeAddress as Address) || userAddress, // Application that received permission
            active: true, // Default to active if not specified
            grantedAt: Number(permission.addedAtBlock),
            nonce: Number(permission.nonce),
          });
        } catch (error) {
          console.error(
            "SDK Error: Failed to process permission:",
            permission.id,
            error,
          );
          // Failed to process permission - skipping
        }
      }

      return userPermissions.sort((a, b) => {
        // Sort bigints - most recent first
        if (a.id < b.id) return 1;
        if (a.id > b.id) return -1;
        return 0;
      });
    } catch (error) {
      console.error("Failed to fetch user permissions:", error);
      throw new BlockchainError(
        `Failed to fetch user permissions: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Gets all permission IDs for a specific file.
   *
   * @param fileId - The file ID to query permissions for
   * @returns Promise resolving to array of permission IDs
   */
  async getFilePermissionIds(fileId: bigint): Promise<bigint[]> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPermissionsAddress = getContractAddress(
        chainId,
        "DataPermissions",
      );
      const DataPermissionsAbi = getAbi("DataPermissions");

      const permissionIds = (await this.context.publicClient.readContract({
        address: DataPermissionsAddress,
        abi: DataPermissionsAbi,
        functionName: "filePermissionIds",
        args: [fileId],
      })) as bigint[];

      return permissionIds;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get file permission IDs: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Gets all file IDs associated with a permission.
   *
   * @param permissionId - The permission ID to query files for
   * @returns Promise resolving to array of file IDs
   */
  async getPermissionFileIds(permissionId: bigint): Promise<bigint[]> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPermissionsAddress = getContractAddress(
        chainId,
        "DataPermissions",
      );
      const DataPermissionsAbi = getAbi("DataPermissions");

      const fileIds = (await this.context.publicClient.readContract({
        address: DataPermissionsAddress,
        abi: DataPermissionsAbi,
        functionName: "permissionFileIds",
        args: [permissionId],
      })) as bigint[];

      return fileIds;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get permission file IDs: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Checks if a permission is active.
   *
   * @param permissionId - The permission ID to check
   * @returns Promise resolving to boolean indicating if permission is active
   */
  async isActivePermission(permissionId: bigint): Promise<boolean> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPermissionsAddress = getContractAddress(
        chainId,
        "DataPermissions",
      );
      const DataPermissionsAbi = getAbi("DataPermissions");

      const isActive = (await this.context.publicClient.readContract({
        address: DataPermissionsAddress,
        abi: DataPermissionsAbi,
        functionName: "isActivePermission",
        args: [permissionId],
      })) as boolean;

      return isActive;
    } catch (error) {
      throw new BlockchainError(
        `Failed to check permission status: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Gets permission details from the contract.
   *
   * @param permissionId - The permission ID to query
   * @returns Promise resolving to permission info
   */
  async getPermissionInfo(permissionId: bigint): Promise<PermissionInfo> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPermissionsAddress = getContractAddress(
        chainId,
        "DataPermissions",
      );
      const DataPermissionsAbi = getAbi("DataPermissions");

      const permissionInfo = (await this.context.publicClient.readContract({
        address: DataPermissionsAddress,
        abi: DataPermissionsAbi,
        functionName: "permissions",
        args: [permissionId],
      })) as PermissionInfo;

      return permissionInfo;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get permission info: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Normalizes grant ID to hex format.
   * Handles conversion from permission ID (bigint/number/string) to proper hex hash format.
   *
   * @param grantId - Permission ID or grant hash in various formats
   * @returns Normalized hex hash
   */
  private normalizeGrantId(grantId: Hash | bigint | number | string): Hash {
    // If it's already a hex string (Hash), return as-is
    if (
      typeof grantId === "string" &&
      grantId.startsWith("0x") &&
      grantId.length === 66
    ) {
      return grantId as Hash;
    }

    // Convert permission ID to hex format (same logic as demo was using)
    try {
      const bigIntId = BigInt(grantId);
      return `0x${bigIntId.toString(16).padStart(64, "0")}` as Hash;
    } catch {
      throw new Error(
        `Invalid grant ID format: ${grantId}. Must be a permission ID (number/bigint/string) or a 32-byte hex hash.`,
      );
    }
  }

  /**
   * Trusts a server for data processing.
   *
   * @param params - Parameters for trusting the server
   * @returns Promise resolving to transaction hash
   */
  async trustServer(params: TrustServerParams): Promise<Hash> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPermissionsAddress = getContractAddress(
        chainId,
        "DataPermissions",
      );
      const DataPermissionsAbi = getAbi("DataPermissions");

      // Submit directly to the contract
      const txHash = await this.context.walletClient.writeContract({
        address: DataPermissionsAddress,
        abi: DataPermissionsAbi,
        functionName: "trustServer",
        args: [params.serverId, params.serverUrl],
        account:
          this.context.walletClient.account || (await this.getUserAddress()),
        chain: this.context.walletClient.chain || null,
      });

      return txHash;
    } catch (error) {
      if (error instanceof Error && error.message.includes("rejected")) {
        throw new UserRejectedRequestError();
      }
      throw new BlockchainError(
        `Failed to trust server: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Trusts a server using a signature (gasless transaction).
   *
   * @param params - Parameters for trusting the server
   * @returns Promise resolving to transaction hash
   */
  async trustServerWithSignature(params: TrustServerParams): Promise<Hash> {
    try {
      const nonce = await this.getUserNonce();

      // Create trust server message
      const trustServerInput: TrustServerInput = {
        nonce,
        serverId: params.serverId,
        serverUrl: params.serverUrl,
      };

      // Create typed data
      const typedData = await this.composeTrustServerMessage(trustServerInput);

      // Sign the typed data
      const signature = await this.signTypedData(
        typedData as unknown as GenericTypedData,
      );

      // Submit via relayer callbacks or direct transaction
      if (this.context.relayerCallbacks?.submitTrustServer) {
        return await this.context.relayerCallbacks.submitTrustServer(
          typedData,
          signature,
        );
      } else {
        return await this.submitTrustServerTransaction(
          trustServerInput,
          signature,
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw known Vana errors directly
        if (
          error instanceof RelayerError ||
          error instanceof UserRejectedRequestError ||
          error instanceof SerializationError ||
          error instanceof SignatureError ||
          error instanceof NetworkError ||
          error instanceof NonceError
        ) {
          throw error;
        }
        throw new BlockchainError(
          `Trust server failed: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError("Trust server failed with unknown error");
    }
  }

  /**
   * Untrusts a server.
   *
   * @param params - Parameters for untrusting the server
   * @returns Promise resolving to transaction hash
   */
  async untrustServer(params: UntrustServerParams): Promise<Hash> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPermissionsAddress = getContractAddress(
        chainId,
        "DataPermissions",
      );
      const DataPermissionsAbi = getAbi("DataPermissions");

      // Submit directly to the contract
      const txHash = await this.context.walletClient.writeContract({
        address: DataPermissionsAddress,
        abi: DataPermissionsAbi,
        functionName: "untrustServer",
        args: [params.serverId],
        account:
          this.context.walletClient.account || (await this.getUserAddress()),
        chain: this.context.walletClient.chain || null,
      });

      return txHash;
    } catch (error) {
      if (error instanceof Error && error.message.includes("rejected")) {
        throw new UserRejectedRequestError();
      }
      throw new BlockchainError(
        `Failed to untrust server: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Untrusts a server using a signature (gasless transaction).
   *
   * @param params - Parameters for untrusting the server
   * @returns Promise resolving to transaction hash
   */
  async untrustServerWithSignature(params: UntrustServerParams): Promise<Hash> {
    try {
      const nonce = await this.getUserNonce();

      // Create untrust server message
      const untrustServerInput: UntrustServerInput = {
        nonce,
        serverId: params.serverId,
      };

      // Create typed data
      const typedData =
        await this.composeUntrustServerMessage(untrustServerInput);

      // Sign the typed data
      const signature = await this.signTypedData(
        typedData as unknown as GenericTypedData,
      );

      // Submit via relayer callbacks or direct transaction
      if (this.context.relayerCallbacks?.submitUntrustServer) {
        return await this.context.relayerCallbacks.submitUntrustServer(
          typedData,
          signature,
        );
      } else {
        return await this.submitUntrustServerTransaction(
          untrustServerInput,
          signature,
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw known Vana errors directly
        if (
          error instanceof RelayerError ||
          error instanceof UserRejectedRequestError ||
          error instanceof SerializationError ||
          error instanceof SignatureError ||
          error instanceof NetworkError ||
          error instanceof NonceError
        ) {
          throw error;
        }
        throw new BlockchainError(
          `Untrust server failed: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError("Untrust server failed with unknown error");
    }
  }

  /**
   * Gets all servers trusted by a user.
   *
   * @param userAddress - Optional user address (defaults to current user)
   * @returns Promise resolving to array of trusted server addresses
   */
  async getTrustedServers(userAddress?: Address): Promise<Address[]> {
    try {
      const user = userAddress || (await this.getUserAddress());
      const chainId = await this.context.walletClient.getChainId();
      const DataPermissionsAddress = getContractAddress(
        chainId,
        "DataPermissions",
      );
      const DataPermissionsAbi = getAbi("DataPermissions");

      const serverIds = (await this.context.publicClient.readContract({
        address: DataPermissionsAddress,
        abi: DataPermissionsAbi,
        functionName: "userServerIdsValues",
        args: [user],
      })) as Address[];

      return serverIds;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get trusted servers: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Gets server information by server ID.
   *
   * @param serverId - Server address
   * @returns Promise resolving to server information
   */
  async getServerInfo(serverId: Address): Promise<Server> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPermissionsAddress = getContractAddress(
        chainId,
        "DataPermissions",
      );
      const DataPermissionsAbi = getAbi("DataPermissions");

      const server = (await this.context.publicClient.readContract({
        address: DataPermissionsAddress,
        abi: DataPermissionsAbi,
        functionName: "servers",
        args: [serverId],
      })) as Server;

      return server;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get server info: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Gets the total count of trusted servers for a user.
   *
   * @param userAddress - Optional user address (defaults to current user)
   * @returns Promise resolving to the number of trusted servers
   */
  async getTrustedServersCount(userAddress?: Address): Promise<number> {
    try {
      const user = userAddress || (await this.getUserAddress());
      const chainId = await this.context.walletClient.getChainId();
      const DataPermissionsAddress = getContractAddress(
        chainId,
        "DataPermissions",
      );
      const DataPermissionsAbi = getAbi("DataPermissions");

      const count = (await this.context.publicClient.readContract({
        address: DataPermissionsAddress,
        abi: DataPermissionsAbi,
        functionName: "userServerIdsLength",
        args: [user],
      })) as bigint;

      return Number(count);
    } catch (error) {
      throw new BlockchainError(
        `Failed to get trusted servers count: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Gets trusted servers with pagination support.
   *
   * @param options - Query options including pagination parameters
   * @returns Promise resolving to paginated trusted servers
   */
  async getTrustedServersPaginated(
    options: TrustedServerQueryOptions = {},
  ): Promise<PaginatedTrustedServers> {
    try {
      const user = options.userAddress || (await this.getUserAddress());
      const limit = options.limit || 50;
      const offset = options.offset || 0;

      const chainId = await this.context.walletClient.getChainId();
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

      // If offset is beyond available servers, return empty result
      if (offset >= total) {
        return {
          servers: [],
          total,
          offset,
          limit,
          hasMore: false,
        };
      }

      // Calculate how many servers to fetch
      const endIndex = Math.min(offset + limit, total);

      // Fetch servers using userServerIdsAt for each index
      const serverPromises: Promise<Address>[] = [];
      for (let i = offset; i < endIndex; i++) {
        const promise = this.context.publicClient.readContract({
          address: DataPermissionsAddress,
          abi: DataPermissionsAbi,
          functionName: "userServerIdsAt",
          args: [user, BigInt(i)],
        }) as Promise<Address>;
        serverPromises.push(promise);
      }

      const servers = await Promise.all(serverPromises);

      return {
        servers,
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      throw new BlockchainError(
        `Failed to get paginated trusted servers: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Gets trusted servers with their complete information.
   *
   * @param options - Query options
   * @returns Promise resolving to array of trusted server info
   */
  async getTrustedServersWithInfo(
    options: TrustedServerQueryOptions = {},
  ): Promise<TrustedServerInfo[]> {
    try {
      // Get paginated server IDs
      const paginatedResult = await this.getTrustedServersPaginated(options);

      // Fetch server info for each server ID
      const serverInfoPromises = paginatedResult.servers.map(
        async (serverId, index) => {
          try {
            const serverInfo = await this.getServerInfo(serverId);
            return {
              serverId,
              url: serverInfo.url,
              isTrusted: true,
              trustIndex: options.offset ? options.offset + index : index,
            };
          } catch {
            // If we can't get server info, return basic info
            return {
              serverId,
              url: "",
              isTrusted: true,
              trustIndex: options.offset ? options.offset + index : index,
            };
          }
        },
      );

      return await Promise.all(serverInfoPromises);
    } catch (error) {
      throw new BlockchainError(
        `Failed to get trusted servers with info: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Gets server information for multiple servers efficiently.
   *
   * @param serverIds - Array of server IDs to query
   * @returns Promise resolving to batch result with successes and failures
   */
  async getServerInfoBatch(
    serverIds: Address[],
  ): Promise<BatchServerInfoResult> {
    if (serverIds.length === 0) {
      return {
        servers: new Map(),
        failed: [],
      };
    }

    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPermissionsAddress = getContractAddress(
        chainId,
        "DataPermissions",
      );
      const DataPermissionsAbi = getAbi("DataPermissions");

      // Create promises for all server info requests
      const serverInfoPromises = serverIds.map(async (serverId) => {
        try {
          const server = (await this.context.publicClient.readContract({
            address: DataPermissionsAddress,
            abi: DataPermissionsAbi,
            functionName: "servers",
            args: [serverId],
          })) as Server;
          return { serverId, server, success: true };
        } catch {
          return { serverId, server: null, success: false };
        }
      });

      const results = await Promise.all(serverInfoPromises);

      // Separate successful and failed requests
      const servers = new Map<Address, { url: string }>();
      const failed: Address[] = [];

      for (const result of results) {
        if (result.success && result.server) {
          servers.set(result.serverId, result.server);
        } else {
          failed.push(result.serverId);
        }
      }

      return { servers, failed };
    } catch (error) {
      throw new BlockchainError(
        `Failed to batch get server info: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Checks whether a specific server is trusted by a user.
   *
   * @param serverId - Server ID to check
   * @param userAddress - Optional user address (defaults to current user)
   * @returns Promise resolving to server trust status
   */
  async checkServerTrustStatus(
    serverId: Address,
    userAddress?: Address,
  ): Promise<ServerTrustStatus> {
    try {
      const user = userAddress || (await this.getUserAddress());
      const trustedServers = await this.getTrustedServers(user);

      const trustIndex = trustedServers.findIndex(
        (server) => server.toLowerCase() === serverId.toLowerCase(),
      );

      return {
        serverId,
        isTrusted: trustIndex !== -1,
        trustIndex: trustIndex !== -1 ? trustIndex : undefined,
      };
    } catch (error) {
      throw new BlockchainError(
        `Failed to check server trust status: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Composes EIP-712 typed data for TrustServer.
   */
  private async composeTrustServerMessage(
    input: TrustServerInput,
  ): Promise<TrustServerTypedData> {
    const domain = await this.getPermissionDomain();

    return {
      domain,
      types: {
        TrustServer: [
          { name: "nonce", type: "uint256" },
          { name: "serverId", type: "address" },
          { name: "serverUrl", type: "string" },
        ],
      },
      primaryType: "TrustServer",
      message: input,
    };
  }

  /**
   * Composes EIP-712 typed data for UntrustServer.
   */
  private async composeUntrustServerMessage(
    input: UntrustServerInput,
  ): Promise<UntrustServerTypedData> {
    const domain = await this.getPermissionDomain();

    return {
      domain,
      types: {
        UntrustServer: [
          { name: "nonce", type: "uint256" },
          { name: "serverId", type: "address" },
        ],
      },
      primaryType: "UntrustServer",
      message: input,
    };
  }

  /**
   * Submits a trust server transaction directly to the blockchain.
   */
  private async submitTrustServerTransaction(
    trustServerInput: TrustServerInput,
    signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPermissionsAddress = getContractAddress(
      chainId,
      "DataPermissions",
    );
    const DataPermissionsAbi = getAbi("DataPermissions");

    const txHash = await this.context.walletClient.writeContract({
      address: DataPermissionsAddress,
      abi: DataPermissionsAbi,
      functionName: "trustServerWithSignature",
      args: [
        {
          nonce: trustServerInput.nonce,
          serverId: trustServerInput.serverId,
          serverUrl: trustServerInput.serverUrl,
        },
        signature,
      ],
      account:
        this.context.walletClient.account || (await this.getUserAddress()),
      chain: this.context.walletClient.chain || null,
    });

    return txHash;
  }

  /**
   * Submits an untrust server transaction directly to the blockchain.
   */
  private async submitUntrustServerTransaction(
    untrustServerInput: UntrustServerInput,
    signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPermissionsAddress = getContractAddress(
      chainId,
      "DataPermissions",
    );
    const DataPermissionsAbi = getAbi("DataPermissions");

    const txHash = await this.context.walletClient.writeContract({
      address: DataPermissionsAddress,
      abi: DataPermissionsAbi,
      functionName: "untrustServerWithSignature",
      args: [
        {
          nonce: untrustServerInput.nonce,
          serverId: untrustServerInput.serverId,
        },
        signature,
      ],
      account:
        this.context.walletClient.account || (await this.getUserAddress()),
      chain: this.context.walletClient.chain || null,
    });

    return txHash;
  }

  /**
   * Submits a revoke transaction directly to the blockchain with signature.
   */
  private async submitDirectRevokeTransaction(
    typedData: GenericTypedData,
    signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPermissionsAddress = getContractAddress(
      chainId,
      "DataPermissions",
    );
    const DataPermissionsAbi = getAbi("DataPermissions");

    const txHash = await this.context.walletClient.writeContract({
      address: DataPermissionsAddress,
      abi: DataPermissionsAbi,
      functionName: "revokePermissionWithSignature",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: [typedData.message as any, signature] as any,
      account:
        this.context.walletClient.account || (await this.getUserAddress()),
      chain: this.context.walletClient.chain || null,
    });

    return txHash;
  }

  /**
   * Submits an untrust server transaction directly to the blockchain with signature.
   */
  private async submitDirectUntrustTransaction(
    typedData: GenericTypedData,
    signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPermissionsAddress = getContractAddress(
      chainId,
      "DataPermissions",
    );
    const DataPermissionsAbi = getAbi("DataPermissions");

    // Submit with signature to verify user authorization
    const txHash = await this.context.walletClient.writeContract({
      address: DataPermissionsAddress,
      abi: DataPermissionsAbi,
      functionName: "untrustServerWithSignature",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: [typedData.message as any, signature],
      account:
        this.context.walletClient.account || (await this.getUserAddress()),
      chain: this.context.walletClient.chain || null,
    });

    return txHash;
  }
}
