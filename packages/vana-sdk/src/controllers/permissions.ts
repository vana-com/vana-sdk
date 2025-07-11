import { Address, Hash } from "viem";
import type { WalletClient, PublicClient } from "viem";
import {
  GrantPermissionParams,
  RevokePermissionParams,
  PermissionGrantTypedData,
  GenericTypedData,
  RelayerTransactionResponse,
  GrantedPermission,
  TrustServerParams,
  UntrustServerParams,
  TrustServerInput,
  UntrustServerInput,
  TrustServerTypedData,
  UntrustServerTypedData,
  Server,
} from "../types/index";
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
} from "../errors";
import { getContractAddress } from "../config/addresses";
import { getAbi } from "../abi";
import {
  createGrantFile,
  storeGrantFile,
  getGrantFileHash,
  retrieveGrantFile,
} from "../utils/grantFiles";
import { validateGrant } from "../utils/grantValidation";
import { StorageManager } from "../storage";

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
 *   relayerUrl: 'https://relayer.vana.org', // Optional gasless transactions
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
   * @deprecated Use relayerCallbacks for more flexible relay handling
   * Optional relayer service URL for gasless transactions
   */
  relayerUrl?: string;
  /**
   * Optional relayer callback functions for handling gasless transactions.
   * Takes precedence over relayerUrl if both are provided.
   */
  relayerCallbacks?: RelayerCallbacks;
  /** Optional storage manager for file upload/download operations */
  storageManager?: StorageManager;
  /** Optional subgraph URL for querying user files and permissions */
  subgraphUrl?: string;
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
          !this.context.relayerUrl &&
          !this.context.storageManager
        ) {
          throw new Error(
            "No storage available. Provide a grantUrl, configure relayerCallbacks.storeGrantFile, relayerUrl, or storageManager.",
          );
        }
        if (this.context.relayerCallbacks?.storeGrantFile) {
          grantUrl =
            await this.context.relayerCallbacks.storeGrantFile(grantFile);
        } else if (this.context.relayerUrl) {
          grantUrl = await storeGrantFile(grantFile, this.context.relayerUrl);
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

      // Use relayer callbacks first, then fallback to relayerUrl, otherwise direct transaction
      if (this.context.relayerCallbacks?.submitPermissionGrant) {
        return await this.context.relayerCallbacks.submitPermissionGrant(
          typedData,
          signature,
        );
      } else if (this.context.relayerUrl) {
        return await this.relaySignedTransaction(typedData, signature);
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
   * Submits a signed transaction directly to the blockchain.
   */
  private async submitDirectTransaction(
    typedData: PermissionGrantTypedData,
    signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const permissionRegistryAddress = getContractAddress(
      chainId,
      "PermissionRegistry",
    );
    const permissionRegistryAbi = getAbi("PermissionRegistry");

    // Prepare the PermissionInput struct (simplified format)
    const permissionInput = {
      nonce: BigInt(typedData.message.nonce),
      grant: typedData.message.grant,
    };

    console.debug("🔍 Debug - Permission input being sent to contract:", {
      nonce: permissionInput.nonce.toString(),
      grant: permissionInput.grant,
    });
    console.debug("🔍 Debug - Grant field value:", typedData.message.grant);
    console.debug(
      "🔍 Debug - Grant field length:",
      typedData.message.grant?.length || 0,
    );

    // Submit directly to the contract using the provided wallet client
    const txHash = await this.context.walletClient.writeContract({
      address: permissionRegistryAddress,
      abi: permissionRegistryAbi,
      functionName: "addPermission",
      args: [permissionInput, signature],
      account:
        this.context.walletClient.account || (await this.getUserAddress()),
      chain: this.context.walletClient.chain || null,
    });

    return txHash;
  }

  /**
   * Submits a signed transaction via the relayer service.
   */
  private async relaySignedTransaction(
    typedData: PermissionGrantTypedData,
    signature: Hash,
  ): Promise<Hash> {
    try {
      const relayerUrl = this.context.relayerUrl;
      if (!relayerUrl) {
        throw new RelayerError("Relayer URL is not configured", 500);
      }

      const response = await fetch(`${relayerUrl}/api/relay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          typedData: {
            ...typedData,
            message: {
              ...typedData.message,
              nonce: Number(typedData.message.nonce),
            },
          },
          signature,
        }),
      });

      if (!response.ok) {
        throw new RelayerError(
          `Failed to relay transaction: ${response.statusText}`,
          response.status,
          await response.text(),
        );
      }

      const data: RelayerTransactionResponse = await response.json();

      if (!data.success) {
        throw new RelayerError(data.error || "Failed to relay transaction");
      }

      return data.transactionHash;
    } catch (error) {
      if (error instanceof RelayerError) {
        throw error;
      }
      throw new NetworkError(
        `Network error while relaying transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
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

      // Normalize grantId to hex format internally
      const grantId = this.normalizeGrantId(params.grantId);

      const userAddress = await this.getUserAddress();
      const nonce = await this.getUserNonce();

      // Create revoke message (simplified for now)
      const revokeMessage = {
        from: userAddress,
        grantId: grantId,
        nonce,
      };

      // Create typed data for revoke (simplified structure)
      const typedData = {
        domain: await this.getPermissionDomain(),
        types: {
          PermissionRevoke: [
            { name: "from", type: "address" },
            { name: "grantId", type: "bytes32" },
            { name: "nonce", type: "uint256" },
          ],
        },
        primaryType: "PermissionRevoke" as const,
        message: revokeMessage,
      };

      const signature = await this.signTypedData(typedData);

      // Submit either via relayer callbacks, relayer URL, or direct transaction
      if (this.context.relayerCallbacks?.submitPermissionRevoke) {
        return await this.context.relayerCallbacks.submitPermissionRevoke(
          typedData,
          signature,
        );
      } else if (this.context.relayerUrl) {
        // Submit to relayer
        const response = await this.submitToRelayer("revoke", {
          typedData: {
            ...typedData,
            message: {
              ...typedData.message,
              nonce: Number(typedData.message.nonce),
            },
          },
          signature,
        });

        return response.transactionHash;
      } else {
        // TODO: Implement direct revoke transaction
        // For now, return a mock hash since the contract doesn't have revoke yet
        return `0xmock${grantId.slice(2).substring(0, 60)}` as Hash;
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
          `Permission revoke failed: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError("Permission revoke failed with unknown error");
    }
  }

  /**
   * Retrieves the user's current nonce from the PermissionRegistry contract.
   */
  private async getUserNonce(): Promise<bigint> {
    try {
      const userAddress = await this.getUserAddress();
      const chainId = await this.context.walletClient.getChainId();

      const permissionRegistryAddress = getContractAddress(
        chainId,
        "PermissionRegistry",
      );
      const permissionRegistryAbi = getAbi("PermissionRegistry");

      const nonce = (await this.context.publicClient.readContract({
        address: permissionRegistryAddress,
        abi: permissionRegistryAbi,
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
        ],
      },
      primaryType: "Permission",
      message: {
        nonce: params.nonce,
        grant: params.grantUrl,
      },
      files: params.files,
    };
  }

  /**
   * Gets the EIP-712 domain for PermissionGrant signatures.
   */
  private async getPermissionDomain() {
    const chainId = await this.context.walletClient.getChainId();
    const permissionRegistryAddress = getContractAddress(
      chainId,
      "PermissionRegistry",
    );

    return {
      name: "VanaDataWallet",
      version: "1",
      chainId,
      verifyingContract: permissionRegistryAddress,
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
   * Submits a request to the relayer service (generic method).
   */
  private async submitToRelayer(
    endpoint: string,
    payload: unknown,
  ): Promise<RelayerTransactionResponse> {
    try {
      const relayerUrl = this.context.relayerUrl;
      if (!relayerUrl) {
        throw new RelayerError("Relayer URL is not configured", 500);
      }
      const response = await fetch(`${relayerUrl}/api/v1/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new RelayerError(
          `Failed to submit to relayer: ${response.statusText}`,
          response.status,
          await response.text(),
        );
      }

      const data: RelayerTransactionResponse = await response.json();

      if (!data.success) {
        throw new RelayerError(data.error || "Failed to submit to relayer");
      }

      return data;
    } catch (error) {
      if (error instanceof RelayerError) {
        throw error;
      }
      throw new NetworkError(
        `Network error while submitting to relayer: ${error instanceof Error ? error.message : "Unknown error"}`,
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
            userId: userAddress.toLowerCase(),
          },
        }),
      });

      if (!response.ok) {
        throw new BlockchainError(
          `Subgraph request failed: ${response.status} ${response.statusText}`,
        );
      }

      const result = await response.json();

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

          try {
            const grantFile = await retrieveGrantFile(permission.grant);
            operation = grantFile.operation;
            files = grantFile.files;
            parameters = grantFile.parameters;
          } catch (error) {
            console.warn(
              `Failed to retrieve grant file for permission ${permission.id}:`,
              error,
            );
            // Continue with basic permission data even if grant file can't be retrieved
          }

          userPermissions.push({
            id: BigInt(permission.id),
            files: files,
            operation: operation || "",
            parameters: (parameters as Record<string, unknown>) || {},
            grant: permission.grant,
            grantor: permission.user.id as Address, // The user field contains the grantor address
            grantee: userAddress, // Current user is the grantee in this context
            active: true, // Default to active if not specified
            grantedAt: Number(permission.addedAtBlock),
            nonce: Number(permission.nonce),
          });
        } catch (error) {
          console.warn(`Failed to process permission ${permission.id}:`, error);
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
      const permissionRegistryAddress = getContractAddress(
        chainId,
        "PermissionRegistry",
      );
      const permissionRegistryAbi = getAbi("PermissionRegistry");

      // Submit directly to the contract
      const txHash = await this.context.walletClient.writeContract({
        address: permissionRegistryAddress,
        abi: permissionRegistryAbi,
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

      // Submit via relayer callbacks, relayer URL, or direct transaction
      if (this.context.relayerCallbacks?.submitTrustServer) {
        return await this.context.relayerCallbacks.submitTrustServer(
          typedData,
          signature,
        );
      } else if (this.context.relayerUrl) {
        return await this.relayTrustServerTransaction(typedData, signature);
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
      const permissionRegistryAddress = getContractAddress(
        chainId,
        "PermissionRegistry",
      );
      const permissionRegistryAbi = getAbi("PermissionRegistry");

      // Submit directly to the contract
      const txHash = await this.context.walletClient.writeContract({
        address: permissionRegistryAddress,
        abi: permissionRegistryAbi,
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

      // Submit via relayer callbacks, relayer URL, or direct transaction
      if (this.context.relayerCallbacks?.submitUntrustServer) {
        return await this.context.relayerCallbacks.submitUntrustServer(
          typedData,
          signature,
        );
      } else if (this.context.relayerUrl) {
        return await this.relayUntrustServerTransaction(typedData, signature);
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
      const permissionRegistryAddress = getContractAddress(
        chainId,
        "PermissionRegistry",
      );
      const permissionRegistryAbi = getAbi("PermissionRegistry");

      const serverIds = (await this.context.publicClient.readContract({
        address: permissionRegistryAddress,
        abi: permissionRegistryAbi,
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
      const permissionRegistryAddress = getContractAddress(
        chainId,
        "PermissionRegistry",
      );
      const permissionRegistryAbi = getAbi("PermissionRegistry");

      const server = (await this.context.publicClient.readContract({
        address: permissionRegistryAddress,
        abi: permissionRegistryAbi,
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
    const permissionRegistryAddress = getContractAddress(
      chainId,
      "PermissionRegistry",
    );
    const permissionRegistryAbi = getAbi("PermissionRegistry");

    const txHash = await this.context.walletClient.writeContract({
      address: permissionRegistryAddress,
      abi: permissionRegistryAbi,
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
    const permissionRegistryAddress = getContractAddress(
      chainId,
      "PermissionRegistry",
    );
    const permissionRegistryAbi = getAbi("PermissionRegistry");

    const txHash = await this.context.walletClient.writeContract({
      address: permissionRegistryAddress,
      abi: permissionRegistryAbi,
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
   * Relays a trust server transaction via the relayer service.
   */
  private async relayTrustServerTransaction(
    typedData: TrustServerTypedData,
    signature: Hash,
  ): Promise<Hash> {
    try {
      const relayerUrl = this.context.relayerUrl;
      if (!relayerUrl) {
        throw new RelayerError("Relayer URL is not configured", 500);
      }

      const response = await fetch(`${relayerUrl}/api/relay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          typedData: {
            ...typedData,
            message: {
              ...typedData.message,
              nonce: Number(typedData.message.nonce),
            },
          },
          signature,
        }),
      });

      if (!response.ok) {
        throw new RelayerError(
          `Failed to relay transaction: ${response.statusText}`,
          response.status,
          await response.text(),
        );
      }

      const data: RelayerTransactionResponse = await response.json();

      if (!data.success) {
        throw new RelayerError(data.error || "Failed to relay transaction");
      }

      return data.transactionHash;
    } catch (error) {
      if (error instanceof RelayerError) {
        throw error;
      }
      throw new NetworkError(
        `Network error while relaying transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Relays an untrust server transaction via the relayer service.
   */
  private async relayUntrustServerTransaction(
    typedData: UntrustServerTypedData,
    signature: Hash,
  ): Promise<Hash> {
    try {
      const relayerUrl = this.context.relayerUrl;
      if (!relayerUrl) {
        throw new RelayerError("Relayer URL is not configured", 500);
      }

      const response = await fetch(`${relayerUrl}/api/relay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          typedData: {
            ...typedData,
            message: {
              ...typedData.message,
              nonce: Number(typedData.message.nonce),
            },
          },
          signature,
        }),
      });

      if (!response.ok) {
        throw new RelayerError(
          `Failed to relay transaction: ${response.statusText}`,
          response.status,
          await response.text(),
        );
      }

      const data: RelayerTransactionResponse = await response.json();

      if (!data.success) {
        throw new RelayerError(data.error || "Failed to relay transaction");
      }

      return data.transactionHash;
    } catch (error) {
      if (error instanceof RelayerError) {
        throw error;
      }
      throw new NetworkError(
        `Network error while relaying transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }
}
