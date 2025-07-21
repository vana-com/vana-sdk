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
  AddAndTrustServerParams,
  AddAndTrustServerInput,
  AddAndTrustServerTypedData,
  Server,
  TrustedServerInfo,
  PaginatedTrustedServers,
  TrustedServerQueryOptions,
  BatchServerInfoResult,
  ServerTrustStatus,
  GrantFile,
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
 * Provides shared configuration and services for all SDK controllers.
 *
 * @remarks
 * This interface defines the foundational blockchain and storage services that all
 * controllers require for operation. The main Vana SDK class automatically creates
 * this context during initialization and passes it to each controller. It includes
 * wallet clients for transaction signing, storage managers for file operations,
 * and platform adapters for environment-specific functionality.
 * @category Configuration
 */
export interface ControllerContext {
  /** Signs transactions and messages using the user's private key. */
  walletClient: WalletClient;
  /** Queries blockchain state and smart contracts without signing. */
  publicClient: PublicClient;
  /** Signs application-specific operations when different from primary wallet. */
  applicationClient?: WalletClient;
  /** Handles gasless transaction submission through relayer services. */
  relayerCallbacks?: RelayerCallbacks;
  /** Manages file upload and download operations across storage providers. */
  storageManager?: StorageManager;
  /** Provides subgraph endpoint for querying indexed blockchain data. */
  subgraphUrl?: string;
  /** Adapts SDK functionality to the current runtime environment. */
  platform: VanaPlatformAdapter;
}

/**
 * Manages gasless data access permissions and trusted server registry operations.
 *
 * @remarks
 * This controller enables users to grant applications access to their data without
 * paying gas fees. It handles the complete EIP-712 permission flow including signature
 * creation, IPFS storage of permission details, and gasless transaction submission.
 * The controller also manages trusted servers that can process user data and provides
 * methods for revoking permissions when access is no longer needed.
 *
 * All permission operations support both gasless transactions via relayers and direct
 * blockchain transactions. Grant files containing detailed permission parameters are
 * stored on IPFS while permission references are recorded on the blockchain.
 * @example
 * ```typescript
 * // Grant permission for an app to access your data
 * const txHash = await vana.permissions.grant({
 *   to: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
 *   operation: "llm_inference",
 *   parameters: { model: "gpt-4", maxTokens: 1000 },
 * });
 *
 * // Trust a server for data processing
 * await vana.permissions.trustServer({
 *   serverId: "0x123...",
 *   serverUrl: "https://trusted-server.example.com",
 * });
 *
 * // Query current permissions
 * const permissions = await vana.permissions.getUserPermissions();
 * ```
 * @category Permissions
 * @see {@link [URL_PLACEHOLDER] | Vana Permissions System} for conceptual overview
 */
export class PermissionsController {
  constructor(private readonly context: ControllerContext) {}

  /**
   * Grants permission for an application to access user data with gasless transactions.
   *
   * @remarks
   * This method combines signature creation and gasless submission for a complete
   * end-to-end permission grant flow. It creates the grant file, stores it on IPFS,
   * generates an EIP-712 signature, and submits via relayer. The grant file contains
   * detailed parameters while the blockchain stores only a reference to enable
   * efficient permission queries.
   * @param params - The permission grant configuration object
   * @returns A Promise that resolves to the transaction hash when successfully submitted
   * @throws {RelayerError} When gasless transaction submission fails
   * @throws {SignatureError} When user rejects the signature request
   * @throws {SerializationError} When grant data cannot be serialized
   * @throws {BlockchainError} When permission grant preparation fails
   * @example
   * ```typescript
   * const txHash = await vana.permissions.grant({
   *   to: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
   *   operation: "llm_inference",
   *   parameters: {
   *     model: "gpt-4",
   *     maxTokens: 1000,
   *     temperature: 0.7,
   *   },
   * });
   *
   * console.log(`Permission granted: ${txHash}`);
   * ```
   */
  async grant(params: GrantPermissionParams): Promise<Hash> {
    const { typedData, signature } = await this.createAndSign(params);
    return await this.submitSignedGrant(typedData, signature, params.to);
  }

  /**
   * Prepares a permission grant with preview before signing.
   *
   * @remarks
   * This method implements a two-phase commit workflow that allows applications
   * to show users a preview of what they're authorizing before requesting a signature.
   * Unlike `createAndSign()`, this method does NOT upload to IPFS or prompt for signatures
   * until the returned `confirm()` function is called.
   * @param params - The permission grant parameters
   * @returns A promise resolving to a preview object and confirm function
   * @example
   * ```typescript
   * const { preview, confirm } = await vana.permissions.prepareGrant({
   *   to: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
   *   operation: "llm_inference",
   *   files: [1, 2, 3],
   *   parameters: { model: "gpt-4", prompt: "Analyze my social media data" }
   * });
   *
   * console.log(`Granting ${preview.operation} access to ${preview.files?.length} files`);
   * const transactionHash = await confirm();
   * ```
   */
  async prepareGrant(params: GrantPermissionParams): Promise<{
    preview: GrantFile;
    confirm: () => Promise<Hash>;
  }> {
    try {
      // Step 1: Create grant file in memory (no IPFS upload yet)
      const grantFile = createGrantFile(params);

      // Step 2: Validate the grant file against our JSON schema
      validateGrant(grantFile);

      // Step 3: Return preview and confirm function
      return {
        preview: grantFile,
        confirm: async (): Promise<Hash> => {
          // Phase 2: Now we upload, sign, and submit
          return await this.confirmGrantInternal(params, grantFile);
        },
      };
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
   * Internal method to complete the grant process after user confirmation.
   * This is called by the confirm() function returned from prepareGrant().
   *
   * @param params - The permission grant parameters containing user and operation details
   * @param grantFile - The prepared grant file with permissions and metadata
   * @returns Promise resolving to the transaction hash
   */
  private async confirmGrantInternal(
    params: GrantPermissionParams,
    grantFile: GrantFile,
  ): Promise<Hash> {
    try {
      // Step 1: Use provided grantUrl or store grant file in IPFS
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

      // Step 2: Get user nonce
      const nonce = await this.getUserNonce();

      // Step 3: Create EIP-712 message with compatibility placeholders
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

      // Step 4: User signature
      const signature = await this.signTypedData(typedData);

      // Step 5: Submit the signed grant
      return await this.submitSignedGrant(typedData, signature, params.to);
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
          `Permission grant confirmation failed: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError(
        "Permission grant confirmation failed with unknown error",
      );
    }
  }

  /**
   * Creates typed data and signature for a permission grant without submitting.
   *
   * @remarks
   * This method handles the first phase of permission granting: creating the grant file,
   * storing it on IPFS, and generating the user's EIP-712 signature. Use this when you
   * want to handle submission separately or batch multiple operations. The method validates
   * the grant file against the JSON schema before creating the signature.
   *
   * For interactive user flows, consider using `prepareGrant()` instead,
   * which allows showing a preview before signing.
   * @param params - The permission grant configuration object
   * @returns A promise resolving to the typed data structure and signature for gasless submission
   * @throws {SignatureError} When the user rejects the signature request
   * @throws {SerializationError} When grant data cannot be properly formatted
   * @throws {BlockchainError} When permission grant preparation fails
   * @throws {NetworkError} When storage operations fail
   * @example
   * ```typescript
   * const { typedData, signature } = await vana.permissions.createAndSign({
   *   to: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
   *   operation: "data_analysis",
   *   parameters: { analysisType: "sentiment" },
   * });
   *
   * const transactionHash = await vana.permissions.submitSignedGrant(typedData, signature);
   * ```
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
   *
   * @remarks
   * This method supports both relayer-based gasless transactions and direct transactions.
   * It automatically converts `bigint` values to JSON-safe strings when using relayer
   * callbacks and handles transaction submission with proper error handling and retry logic.
   * @param typedData - The EIP-712 typed data structure for the permission grant
   * @param signature - The user's signature as a hex string
   * @param to - The grantee address for the permission
   * @returns A Promise that resolves to the transaction hash
   * @throws {RelayerError} When gasless transaction submission fails
   * @throws {BlockchainError} When permission submission fails
   * @throws {NetworkError} When network communication fails
   * @example
   * ```typescript
   * const txHash = await vana.permissions.submitSignedGrant(
   *   typedData,
   *   "0x1234..."
   * );
   * ```
   */
  async submitSignedGrant(
    typedData: PermissionGrantTypedData,
    signature: Hash,
    to?: Address,
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
        return await this.submitDirectTransaction(typedData, signature, to);
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
        serverId: BigInt(typedData.message.serverId),
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
            typedData.message.serverId.toString(),
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
        return await this.submitSignedUntrustTransaction(typedData, signature);
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
   *
   * @param typedData - The typed data structure for the permission grant
   * @param signature - The cryptographic signature authorizing the transaction
   * @param to - The grantee address for the permission
   * @returns Promise resolving to the transaction hash
   */
  private async submitDirectTransaction(
    typedData: PermissionGrantTypedData,
    signature: Hash,
    to?: Address,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityPermissionsAddress = getContractAddress(
      chainId,
      "DataPortabilityPermissions",
    );
    const DataPortabilityPermissionsAbi = getAbi("DataPortabilityPermissions");

    // Extract grantee address from params
    // In the new structure, we need to get or create a grantee ID
    if (!to) {
      throw new Error("Grantee address is required for permission grant");
    }
    const granteeAddress = to;

    const granteeId = await this.getOrCreateGranteeId(granteeAddress);

    // Prepare the PermissionInput struct for new contract
    const permissionInput = {
      nonce: typedData.message.nonce,
      granteeId: granteeId,
      grant: typedData.message.grant,
      fileIds: typedData.message.fileIds,
    };

    console.debug("🔍 Debug - Permission input being sent to contract:", {
      nonce: permissionInput.nonce.toString(),
      granteeId: permissionInput.granteeId.toString(),
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
      address: DataPortabilityPermissionsAddress,
      abi: DataPortabilityPermissionsAbi,
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
   * @example
   * ```typescript
   * // Revoke a permission by its ID
   * const txHash = await vana.permissions.revoke({
   *   permissionId: 123n
   * });
   * console.log('Permission revoked in transaction:', txHash);
   *
   * // Wait for confirmation if needed
   * const receipt = await vana.core.waitForTransaction(txHash);
   * console.log('Revocation confirmed in block:', receipt.blockNumber);
   * ```
   */
  async revoke(params: RevokePermissionParams): Promise<Hash> {
    try {
      // Check chain ID availability early
      if (!this.context.walletClient.chain?.id) {
        throw new BlockchainError("Chain ID not available");
      }

      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      // Direct contract call for revocation
      const txHash = await this.context.walletClient.writeContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
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
   *
   * @returns Promise resolving to the user's current nonce value
   */
  private async getUserNonce(): Promise<bigint> {
    try {
      const userAddress = await this.getUserAddress();
      const chainId = await this.context.walletClient.getChainId();

      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const nonce = (await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
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
   * Gets the current nonce for server operations from DataPortabilityServers contract.
   *
   * @returns Promise resolving to the user's current server nonce as a bigint
   */
  private async getServerNonce(): Promise<bigint> {
    try {
      const userAddress = await this.getUserAddress();
      const chainId = await this.context.walletClient.getChainId();

      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const nonce = (await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "userNonce",
        args: [userAddress],
      })) as bigint;

      return nonce;
    } catch (error) {
      throw new NonceError(
        `Failed to retrieve server nonce: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Composes the EIP-712 typed data for PermissionGrant (new simplified format).
   *
   * @param params - The parameters for composing the permission grant message
   * @param params.to - The recipient address for the permission grant
   * @param params.operation - The type of operation being granted permission for
   * @param params.files - Array of file IDs that the permission applies to
   * @param params.grantUrl - URL where the grant details are stored
   * @param params.serializedParameters - Serialized parameters for the operation
   * @param params.nonce - Unique number to prevent replay attacks
   * @returns Promise resolving to the typed data structure
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

    // Warn if using HTTP gateway URL instead of ipfs:// protocol for on-chain storage
    if (
      !params.grantUrl.startsWith("ipfs://") &&
      params.grantUrl.includes("/ipfs/")
    ) {
      const { extractIpfsHash } = await import("../utils/ipfs");
      const hash = extractIpfsHash(params.grantUrl);
      if (hash) {
        console.warn(
          `⚠️  Storing HTTP gateway URL on-chain instead of ipfs:// protocol. ` +
            `Found: ${params.grantUrl}. ` +
            `Consider using ipfs://${hash} for better protocol-agnostic on-chain storage.`,
        );
      }
    }

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
   *
   * @returns Promise resolving to the EIP-712 domain configuration
   */
  private async getPermissionDomain() {
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityPermissionsAddress = getContractAddress(
      chainId,
      "DataPortabilityPermissions",
    );

    return {
      name: "VanaDataPortabilityPermissions",
      version: "1",
      chainId,
      verifyingContract: DataPortabilityPermissionsAddress,
    };
  }

  /**
   * Gets the EIP-712 domain for DataPortabilityServers contract operations.
   *
   * @returns The EIP-712 domain object for server operations
   */
  private async getServerDomain() {
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityServersAddress = getContractAddress(
      chainId,
      "DataPortabilityServers",
    );

    return {
      name: "VanaDataPortabilityServers",
      version: "1",
      chainId,
      verifyingContract: DataPortabilityServersAddress,
    };
  }

  /**
   * Signs typed data using the wallet client.
   *
   * @param typedData - The EIP-712 typed data structure to sign
   * @returns Promise resolving to the cryptographic signature
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
   *
   * @returns Promise resolving to the user's wallet address
   */
  private async getUserAddress(): Promise<Address> {
    const addresses = await this.context.walletClient.getAddresses();
    if (addresses.length === 0) {
      throw new BlockchainError("No addresses available in wallet client");
    }
    return addresses[0];
  }

  /**
   * Retrieves all permissions granted by the current user using subgraph queries.
   *
   * @remarks
   * This method queries the Vana subgraph to find permissions directly granted by the user
   * using the Permission entity. It efficiently handles millions of permissions by leveraging
   * indexed subgraph data instead of scanning contract logs. The method fetches complete
   * grant files from IPFS to provide detailed permission information including operation
   * parameters and grantee details.
   * @param params - Optional query parameters
   * @param params.limit - Maximum number of permissions to return (default: 50)
   * @param params.subgraphUrl - Optional subgraph URL to override the default endpoint
   * @returns A Promise that resolves to an array of `GrantedPermission` objects
   * @throws {BlockchainError} When subgraph is unavailable or returns invalid data
   * @example
   * ```typescript
   * // Get all permissions granted by current user
   * const permissions = await vana.permissions.getUserPermissions();
   *
   * permissions.forEach(permission => {
   *   console.log(`Granted ${permission.operation} to ${permission.grantee}`);
   * });
   *
   * // Limit results
   * const recent = await vana.permissions.getUserPermissions({ limit: 10 });
   * ```
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
            grantor: userAddress.toLowerCase() as Address, // Current user is the grantor
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
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const permissionIds = (await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
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
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const fileIds = (await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
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
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const isActive = (await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
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
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const permissionInfo = (await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
        functionName: "permission",
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
   * @example
   * ```typescript
   * // Trust a server by providing its ID and URL
   * const txHash = await vana.permissions.trustServer({
   *   serverId: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
   *   serverUrl: 'https://myserver.example.com'
   * });
   * console.log('Server trusted in transaction:', txHash);
   *
   * // Verify the server was added to trusted list
   * const trustedServers = await vana.permissions.getTrustedServers();
   * console.log('Trusted servers:', trustedServers.length);
   * ```
   */
  async trustServer(params: TrustServerParams): Promise<Hash> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      // Convert serverId string to number for the new contract
      const serverIdNum = BigInt(params.serverId); // serverId is already a number in the new contract

      // Submit directly to the contract
      const txHash = await this.context.walletClient.writeContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "trustServer",
        args: [serverIdNum],
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
      const nonce = await this.getServerNonce();

      // Create trust server message
      const trustServerInput: TrustServerInput = {
        nonce,
        serverId: BigInt(params.serverId),
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
   * Submits a direct untrust server transaction (without signature).
   *
   * @param params - The untrust server parameters containing server details
   * @returns Promise resolving to the transaction hash
   */
  private async submitDirectUntrustTransaction(
    params: UntrustServerInput,
  ): Promise<Hash> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      // Convert serverId string to number for the new contract
      const serverIdNum = BigInt(params.serverId); // serverId is already a number in the new contract

      // Submit directly to the contract
      const txHash = await this.context.walletClient.writeContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "untrustServer",
        args: [serverIdNum],
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
   * Untrusts a server.
   *
   * @param params - Parameters for untrusting the server
   * @returns Promise resolving to transaction hash
   */
  async untrustServer(params: UntrustServerParams): Promise<Hash> {
    // Convert UntrustServerParams to UntrustServerInput by adding nonce
    const nonce = await this.getServerNonce();
    const untrustServerInput: UntrustServerInput = {
      nonce,
      serverId: BigInt(params.serverId),
    };

    return await this.submitDirectUntrustTransaction(untrustServerInput);
  }

  /**
   * Untrusts a server using a signature (gasless transaction).
   *
   * @param params - Parameters for untrusting the server
   * @returns Promise resolving to transaction hash
   */
  async untrustServerWithSignature(params: UntrustServerParams): Promise<Hash> {
    try {
      const nonce = await this.getServerNonce();

      // Create untrust server message
      const untrustServerInput: UntrustServerInput = {
        nonce,
        serverId: BigInt(params.serverId),
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
        return await this.submitSignedUntrustTransaction(
          typedData as unknown as GenericTypedData,
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
   * Adds and trusts a new server in a single transaction.
   *
   * @param params - Parameters for adding and trusting the server
   * @returns Promise resolving to transaction hash
   *
   * @example
   * ```typescript
   * const txHash = await vana.permissions.addAndTrustServer({
   *   owner: '0x123...',
   *   serverAddress: '0x456...',
   *   publicKey: '0x789...',
   *   serverUrl: 'https://myserver.example.com'
   * });
   * console.log('Server added and trusted in transaction:', txHash);
   * ```
   */
  async addAndTrustServer(params: AddAndTrustServerParams): Promise<Hash> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      // Submit directly to the contract
      const txHash = await this.context.walletClient.writeContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "addAndTrustServer",
        args: [
          {
            owner: params.owner,
            serverAddress: params.serverAddress,
            publicKey: params.publicKey,
            serverUrl: params.serverUrl,
          },
        ],
        account:
          this.context.walletClient.account || (await this.getUserAddress()),
        chain: this.context.walletClient.chain || null,
      });

      return txHash;
    } catch (error) {
      if (error instanceof Error && error.message.includes("rejected")) {
        throw new UserRejectedRequestError("User rejected the transaction");
      }
      throw new BlockchainError(
        `Add and trust server failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Adds and trusts a new server using a signature (gasless transaction).
   *
   * @param params - Parameters for adding and trusting the server
   * @returns Promise resolving to transaction hash
   *
   * @example
   * ```typescript
   * const txHash = await vana.permissions.addAndTrustServerWithSignature({
   *   owner: '0x123...',
   *   serverAddress: '0x456...',
   *   publicKey: '0x789...',
   *   serverUrl: 'https://myserver.example.com'
   * });
   * console.log('Server added and trusted gaslessly:', txHash);
   * ```
   */
  async addAndTrustServerWithSignature(
    params: AddAndTrustServerParams,
  ): Promise<Hash> {
    try {
      const nonce = await this.getServerNonce();

      // Create add and trust server message
      const addAndTrustServerInput: AddAndTrustServerInput = {
        nonce,
        owner: params.owner,
        serverAddress: params.serverAddress,
        publicKey: params.publicKey,
        serverUrl: params.serverUrl,
      };

      // Create typed data
      const typedData = await this.composeAddAndTrustServerMessage(
        addAndTrustServerInput,
      );

      // Sign the typed data
      const signature = await this.signTypedData(
        typedData as unknown as GenericTypedData,
      );

      // Submit via relayer callbacks or direct transaction
      if (this.context.relayerCallbacks?.submitAddAndTrustServer) {
        return await this.context.relayerCallbacks.submitAddAndTrustServer(
          typedData,
          signature,
        );
      } else {
        return await this.submitAddAndTrustServerTransaction(
          addAndTrustServerInput,
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
          `Add and trust server failed: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError(
        "Add and trust server failed with unknown error",
      );
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
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      // Get user info which includes trusted server IDs
      const userInfoResult = (await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "user",
        args: [user],
      })) as readonly [bigint, readonly bigint[]];

      const userInfo = {
        nonce: userInfoResult[0],
        trustedServerIds: userInfoResult[1] as bigint[],
      };

      // Convert server IDs to addresses
      const serverAddresses: Address[] = [];
      for (const serverId of userInfo.trustedServerIds) {
        const serverInfo = await this.getServerInfoById(serverId);
        if (serverInfo) {
          serverAddresses.push(serverInfo.serverAddress);
        }
      }

      return serverAddresses;
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
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const server = (await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "serverByAddress",
        args: [serverId],
      })) as {
        id: bigint;
        owner: Address;
        serverAddress: Address;
        publicKey: string;
        url: string;
      };

      // Convert to old Server format for compatibility
      return { url: server.url };
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
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const userInfoResult = (await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "user",
        args: [user],
      })) as readonly [bigint, readonly bigint[]];

      const userInfo = {
        nonce: userInfoResult[0],
        trustedServerIds: userInfoResult[1] as bigint[],
      };

      return userInfo.trustedServerIds.length;
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
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      // Get total count first
      const userInfoResult = (await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "user",
        args: [user],
      })) as readonly [bigint, readonly bigint[]];

      const userInfo = {
        nonce: userInfoResult[0],
        trustedServerIds: userInfoResult[1] as bigint[],
      };

      const total = userInfo.trustedServerIds.length;

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

      // Get the slice of server IDs we need
      const serverIds = userInfo.trustedServerIds.slice(offset, endIndex);

      // Convert server IDs to addresses
      const serverPromises = serverIds.map(async (serverId) => {
        const serverInfo = await this.getServerInfoById(serverId);
        return serverInfo
          ? serverInfo.serverAddress
          : ("0x0000000000000000000000000000000000000000" as Address);
      });

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
      // Create promises for all server info requests
      const serverInfoPromises = serverIds.map(async (serverId) => {
        try {
          const serverInfo = await this.getServerInfoById(
            await this.getServerIdByAddress(serverId),
          );
          if (serverInfo) {
            return { serverId, server: { url: serverInfo.url }, success: true };
          }
          return { serverId, server: null, success: false };
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
   *
   * @param input - The trust server input data containing server details
   * @returns Promise resolving to the typed data structure for server trust
   */
  private async composeTrustServerMessage(
    input: TrustServerInput,
  ): Promise<TrustServerTypedData> {
    const domain = await this.getServerDomain();

    return {
      domain,
      types: {
        TrustServer: [
          { name: "nonce", type: "uint256" },
          { name: "serverId", type: "uint256" },
        ],
      },
      primaryType: "TrustServer",
      message: input,
    };
  }

  /**
   * Composes EIP-712 typed data for UntrustServer.
   *
   * @param input - The untrust server input data containing server details
   * @returns Promise resolving to the typed data structure for server untrust
   */
  private async composeUntrustServerMessage(
    input: UntrustServerInput,
  ): Promise<UntrustServerTypedData> {
    const domain = await this.getServerDomain();

    return {
      domain,
      types: {
        UntrustServer: [
          { name: "nonce", type: "uint256" },
          { name: "serverId", type: "uint256" },
        ],
      },
      primaryType: "UntrustServer",
      message: input,
    };
  }

  /**
   * Composes EIP-712 typed data for AddAndTrustServer.
   *
   * @param input - The add and trust server input data containing server details
   * @returns Promise resolving to the typed data structure for add and trust server
   */
  private async composeAddAndTrustServerMessage(
    input: AddAndTrustServerInput,
  ): Promise<AddAndTrustServerTypedData> {
    const domain = await this.getServerDomain();
    return {
      domain,
      types: {
        AddAndTrustServer: [
          { name: "nonce", type: "uint256" },
          { name: "owner", type: "address" },
          { name: "serverAddress", type: "address" },
          { name: "publicKey", type: "bytes" },
          { name: "serverUrl", type: "string" },
        ],
      },
      primaryType: "AddAndTrustServer",
      message: input,
    };
  }

  /**
   * Submits an add and trust server transaction directly to the blockchain.
   *
   * @param addAndTrustServerInput - The add and trust server input data containing server details
   * @param signature - The cryptographic signature for the transaction
   * @returns Promise resolving to the transaction hash
   */
  private async submitAddAndTrustServerTransaction(
    addAndTrustServerInput: AddAndTrustServerInput,
    signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityServersAddress = getContractAddress(
      chainId,
      "DataPortabilityServers",
    );
    const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

    const txHash = await this.context.walletClient.writeContract({
      address: DataPortabilityServersAddress,
      abi: DataPortabilityServersAbi,
      functionName: "addAndTrustServerWithSignature",
      args: [
        {
          nonce: addAndTrustServerInput.nonce,
          owner: addAndTrustServerInput.owner,
          serverAddress: addAndTrustServerInput.serverAddress,
          publicKey: addAndTrustServerInput.publicKey,
          serverUrl: addAndTrustServerInput.serverUrl,
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
   * Submits a trust server transaction directly to the blockchain.
   *
   * @param trustServerInput - The trust server input data containing server details
   * @param signature - The cryptographic signature for the transaction
   * @returns Promise resolving to the transaction hash
   */
  private async submitTrustServerTransaction(
    trustServerInput: TrustServerInput,
    signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityServersAddress = getContractAddress(
      chainId,
      "DataPortabilityServers",
    );
    const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

    const txHash = await this.context.walletClient.writeContract({
      address: DataPortabilityServersAddress,
      abi: DataPortabilityServersAbi,
      functionName: "trustServerWithSignature",
      args: [
        {
          nonce: trustServerInput.nonce,
          serverId: BigInt(trustServerInput.serverId),
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
   * Gets server ID by server address from the new DataPortabilityServers contract.
   *
   * @param serverAddress - The server address to look up
   * @returns Promise resolving to the server ID
   */
  private async getServerIdByAddress(serverAddress: Address): Promise<bigint> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const serverId = (await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "serverAddressToId",
        args: [serverAddress],
      })) as bigint;

      if (serverId === 0n) {
        throw new Error(`Server not found: ${serverAddress}`);
      }

      return serverId;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get server ID: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Gets server info by server ID from the new DataPortabilityServers contract.
   *
   * @param serverId - The server ID to look up
   * @returns Promise resolving to the server info
   */
  private async getServerInfoById(serverId: bigint): Promise<{
    id: bigint;
    owner: Address;
    serverAddress: Address;
    publicKey: string;
    url: string;
  } | null> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const server = (await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "server",
        args: [serverId],
      })) as {
        id: bigint;
        owner: Address;
        serverAddress: Address;
        publicKey: string;
        url: string;
      };

      // Check if server exists (id should not be 0)
      if (server.id === 0n) {
        return null;
      }

      return server;
    } catch (error) {
      console.error("Failed to get server info by ID:", error);
      return null;
    }
  }

  /**
   * Gets or creates a grantee ID for the given address.
   *
   * @param granteeAddress - The grantee address
   * @param publicKey - The grantee's public key (optional)
   * @returns Promise resolving to the grantee ID
   */
  private async getOrCreateGranteeId(
    granteeAddress: Address,
    publicKey?: string,
  ): Promise<bigint> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityGranteesAddress = getContractAddress(
        chainId,
        "DataPortabilityGrantees",
      );
      const DataPortabilityGranteesAbi = getAbi("DataPortabilityGrantees");

      // First, try to get existing grantee ID
      let granteeId = (await this.context.publicClient.readContract({
        address: DataPortabilityGranteesAddress,
        abi: DataPortabilityGranteesAbi,
        functionName: "granteeAddressToId",
        args: [granteeAddress],
      })) as bigint;

      // If grantee doesn't exist, register a new one
      if (granteeId === 0n) {
        const owner = await this.getUserAddress();
        const pk = publicKey || ""; // Empty string if no public key provided

        // Register new grantee
        const txHash = await this.context.walletClient.writeContract({
          address: DataPortabilityGranteesAddress,
          abi: DataPortabilityGranteesAbi,
          functionName: "registerGrantee",
          args: [owner, granteeAddress, pk],
          account:
            this.context.walletClient.account || (await this.getUserAddress()),
          chain: this.context.walletClient.chain || null,
        });

        // Wait for transaction
        await this.context.publicClient.waitForTransactionReceipt({
          hash: txHash,
        });

        // Get the grantee ID again after registration
        granteeId = (await this.context.publicClient.readContract({
          address: DataPortabilityGranteesAddress,
          abi: DataPortabilityGranteesAbi,
          functionName: "granteeAddressToId",
          args: [granteeAddress],
        })) as bigint;
      }

      return granteeId;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get or create grantee: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submits a revoke transaction directly to the blockchain with signature.
   *
   * @param typedData - The EIP-712 typed data structure for the revoke operation
   * @param signature - The cryptographic signature authorizing the revoke
   * @returns Promise resolving to the transaction hash
   */
  private async submitDirectRevokeTransaction(
    typedData: GenericTypedData,
    signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityPermissionsAddress = getContractAddress(
      chainId,
      "DataPortabilityPermissions",
    );
    const DataPortabilityPermissionsAbi = getAbi("DataPortabilityPermissions");

    const txHash = await this.context.walletClient.writeContract({
      address: DataPortabilityPermissionsAddress,
      abi: DataPortabilityPermissionsAbi,
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
   * Submits an untrust server transaction with signature.
   *
   * @param typedData - The EIP-712 typed data structure for the untrust operation
   * @param signature - The cryptographic signature authorizing the untrust
   * @returns Promise resolving to the transaction hash
   */
  private async submitSignedUntrustTransaction(
    typedData: GenericTypedData,
    signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityServersAddress = getContractAddress(
      chainId,
      "DataPortabilityServers",
    );
    const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

    // Submit with signature to verify user authorization
    const txHash = await this.context.walletClient.writeContract({
      address: DataPortabilityServersAddress,
      abi: DataPortabilityServersAbi,
      functionName: "untrustServerWithSignature",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: [typedData.message as any, signature],
      account:
        this.context.walletClient.account || (await this.getUserAddress()),
      chain: this.context.walletClient.chain || null,
    });

    return txHash;
  }

  /**
   * Gets the EIP-712 domain for Server-related signatures.
   *
   * @returns Promise resolving to the EIP-712 domain configuration
   */
}
