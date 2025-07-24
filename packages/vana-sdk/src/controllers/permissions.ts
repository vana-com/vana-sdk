import { Address, Hash } from "viem";
import type { WalletClient, PublicClient } from "viem";
import {
  GrantPermissionParams,
  RevokePermissionParams,
  PermissionGrantTypedData,
  GenericTypedData,
  OnChainPermissionGrant,
  GetUserPermissionsOptions,
  AddAndTrustServerParams,
  TrustServerParams,
  UntrustServerParams,
  AddAndTrustServerInput,
  TrustServerInput,
  UntrustServerInput,
  AddAndTrustServerTypedData,
  TrustServerTypedData,
  UntrustServerTypedData,
  Server,
  TrustedServerInfo,
  PaginatedTrustedServers,
  TrustedServerQueryOptions,
  BatchServerInfoResult,
  ServerTrustStatus,
  GrantFile,
  Grantee,
  RegisterGranteeParams,
  RegisterGranteeInput,
  RegisterGranteeTypedData,
  GranteeQueryOptions,
  PaginatedGrantees,
} from "../types/index";
import {
  PermissionGrantResult,
  PermissionRevokeResult,
} from "../types/transactionResults";
import { parseTransactionResult } from "../utils/transactionParsing";
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
import { createGrantFile, getGrantFileHash } from "../utils/grantFiles";
import { validateGrant } from "../utils/grantValidation";
import { withSignatureCache } from "../utils/signatureCache";
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
        addedAtTimestamp?: string;
        transactionHash?: string;
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
  /** Validates that storage is available for storage-dependent operations. */
  validateStorageRequired?: () => void;
  /** Checks whether storage is configured without throwing an error. */
  hasStorage?: () => boolean;
  /** Default IPFS gateways to use for fetching files. */
  ipfsGateways?: string[];
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
 * **Permission Architecture:**
 * Permissions use dual storage: detailed parameters stored on IPFS, references stored on blockchain.
 * This enables complex permissions while maintaining minimal on-chain data.
 *
 * **Method Selection:**
 * - `grant()` creates new permissions with automatic IPFS upload and blockchain registration
 * - `prepareGrant()` allows preview before signing for interactive applications
 * - `revoke()` removes permissions by ID, supporting both gasless and direct transactions
 * - `getUserPermissionGrantsOnChain()` queries existing permissions efficiently
 * - `trustServer()` and `untrustServer()` manage server access for data processing
 *
 * **Transaction Types:**
 * Methods with gasless support: `grant()`, `revoke()`, `trustServer()`, `untrustServer()`
 * Methods requiring direct transactions: none (all support both gasless and direct)
 * @example
 * ```typescript
 * // Grant permission for an app to access your data
 * const txHash = await vana.permissions.grant({
 *   grantee: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
 *   operation: "llm_inference",
 *   files: [1, 2, 3],
 *   parameters: { model: "gpt-4", maxTokens: 1000 },
 * });
 *
 * // Trust a server for data processing
 * await vana.permissions.trustServer({
 *   serverId: "0x123...",
 *   serverUrl: "https://personal-server.vana.org",
 * });
 *
 * // Query current permissions
 * const permissions = await vana.permissions.getUserPermissionGrantsOnChain();
 * ```
 * @category Permissions
 * @see {@link https://docs.vana.com/developer/permissions | Vana Permissions System} for conceptual overview
 */
export class PermissionsController {
  constructor(private readonly context: ControllerContext) {}

  /**
   * Grants permission for an application to access user data with gasless transactions.
   *
   * This method provides a complete end-to-end permission grant flow that returns
   * the permission ID and other relevant data immediately after successful submission.
   * For advanced users who need more control over the transaction lifecycle, use
   * `submitPermissionGrant()` instead.
   *
   * @param params - The permission grant configuration object
   * @returns Promise resolving to permission data from the PermissionAdded event
   * @throws {RelayerError} When gasless transaction submission fails
   * @throws {SignatureError} When user rejects the signature request
   * @throws {SerializationError} When grant data cannot be serialized
   * @throws {BlockchainError} When permission grant fails or event parsing fails
   * @throws {NetworkError} When transaction confirmation times out
   * @example
   * ```typescript
   * const result = await vana.permissions.grant({
   *   grantee: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
   *   operation: "llm_inference",
   *   parameters: {
   *     model: "gpt-4",
   *     maxTokens: 1000,
   *     temperature: 0.7,
   *   },
   * });
   *
   * console.log(`Permission ${result.permissionId} granted to ${result.user}`);
   * console.log(`Transaction: ${result.transactionHash}`);
   *
   * // Can immediately use the permission ID for other operations
   * await vana.permissions.revoke({ permissionId: result.permissionId });
   * ```
   */
  async grant(params: GrantPermissionParams): Promise<PermissionGrantResult> {
    const txHash = await this.submitPermissionGrant(params);
    return parseTransactionResult(this.context, txHash, "grant");
  }

  /**
   * Submits a permission grant transaction and returns the transaction hash immediately.
   *
   * This is the lower-level method that provides maximum control over transaction timing.
   * Use this when you want to handle transaction confirmation and event parsing separately,
   * or when submitting multiple transactions in batch.
   *
   * @param params - The permission grant configuration object
   * @returns Promise that resolves to the transaction hash when successfully submitted
   * @throws {RelayerError} When gasless transaction submission fails
   * @throws {SignatureError} When user rejects the signature request
   * @throws {SerializationError} When grant data cannot be serialized
   * @throws {BlockchainError} When permission grant preparation fails
   * @example
   * ```typescript
   * // Submit transaction and handle confirmation later
   * const txHash = await vana.permissions.submitPermissionGrant(params);
   * console.log(`Transaction submitted: ${txHash}`);
   *
   * // Later, when you need the permission data:
   * const result = await parseTransactionResult(context, txHash, 'grant');
   * console.log(`Permission ID: ${result.permissionId}`);
   * ```
   */
  async submitPermissionGrant(params: GrantPermissionParams): Promise<Hash> {
    const { typedData, signature } = await this.createAndSign(params);
    return await this.submitSignedGrant(typedData, signature);
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
   * @throws {SerializationError} When grant parameters are invalid or cannot be serialized
   * @throws {BlockchainError} When grant validation fails or preparation encounters an error
   * @example
   * ```typescript
   * const { preview, confirm } = await vana.permissions.prepareGrant({
   *   grantee: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
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
        // Validate storage is available using the centralized validation method
        if (
          !this.context.relayerCallbacks?.storeGrantFile &&
          !this.context.storageManager
        ) {
          // Use centralized validation if available, otherwise fall back to old behavior
          if (this.context.validateStorageRequired) {
            this.context.validateStorageRequired();
          } else {
            throw new Error(
              "No storage available. Provide a grantUrl, configure relayerCallbacks.storeGrantFile, or storageManager.",
            );
          }
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
        grantee: params.grantee,
        operation: params.operation, // Placeholder - real data is in IPFS
        files: params.files, // Placeholder - real data is in IPFS
        grantUrl,
        serializedParameters: getGrantFileHash(grantFile), // Hash as placeholder
        nonce,
      });

      // Step 4: User signature
      const signature = await this.signTypedData(typedData);

      // Step 5: Submit the signed grant
      return await this.submitSignedGrant(typedData, signature);
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
   *   grantee: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
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
        // Validate storage is available using the centralized validation method
        if (
          !this.context.relayerCallbacks?.storeGrantFile &&
          !this.context.storageManager
        ) {
          // Use centralized validation if available, otherwise fall back to old behavior
          if (this.context.validateStorageRequired) {
            this.context.validateStorageRequired();
          } else {
            throw new Error(
              "No storage available. Provide a grantUrl, configure relayerCallbacks.storeGrantFile, or storageManager.",
            );
          }
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
        grantee: params.grantee,
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
   * @returns Promise resolving to the transaction hash
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
      granteeId: typedData.message.granteeId,
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
   * This method provides complete revocation with automatic event parsing to confirm
   * the permission was successfully revoked. For advanced users who need more control,
   * use `submitPermissionRevoke()` instead.
   *
   * @param params - Parameters for revoking the permission
   * @param params.permissionId - Permission identifier (accepts bigint, number, or string).
   *   Obtain from permission grants via `getUserPermissionGrantsOnChain()`.
   * @returns Promise resolving to revocation data from PermissionRevoked event
   * @throws {BlockchainError} When revocation fails or event parsing fails
   * @throws {UserRejectedRequestError} When user rejects the transaction
   * @throws {NetworkError} When transaction confirmation times out
   * @example
   * ```typescript
   * // Revoke a permission and get confirmation
   * const result = await vana.permissions.revoke({
   *   permissionId: 123n
   * });
   * console.log(`Permission ${result.permissionId} revoked in transaction ${result.transactionHash}`);
   * console.log(`Revoked in block ${result.blockNumber}`);
   * ```
   */
  async revoke(
    params: RevokePermissionParams,
  ): Promise<PermissionRevokeResult> {
    const txHash = await this.submitPermissionRevoke(params);
    return parseTransactionResult(this.context, txHash, "revoke");
  }

  /**
   * Submits a permission revocation transaction and returns the transaction hash immediately.
   *
   * This is the lower-level method that provides maximum control over transaction timing.
   * Use this when you want to handle transaction confirmation and event parsing separately.
   *
   * @param params - Parameters for revoking the permission
   * @returns Promise resolving to the transaction hash when successfully submitted
   * @throws {BlockchainError} When revocation transaction fails
   * @throws {UserRejectedRequestError} When user rejects the transaction
   * @example
   * ```typescript
   * // Submit revocation and handle confirmation later
   * const txHash = await vana.permissions.submitPermissionRevoke({
   *   permissionId: 123n
   * });
   * console.log(`Revocation submitted: ${txHash}`);
   * ```
   */
  async submitPermissionRevoke(params: RevokePermissionParams): Promise<Hash> {
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
   * @throws {BlockchainError} When chain ID is not available
   * @throws {NonceError} When retrieving user nonce fails
   * @throws {SignatureError} When user rejects the signature request
   * @throws {RelayerError} When gasless submission fails
   * @throws {PermissionError} When revocation fails for any other reason
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
   * Retrieves the user's current nonce from the DataPortabilityServers contract.
   *
   * @returns Promise resolving to the user's current nonce value
   * @throws {Error} When wallet account is not available
   * @throws {Error} When chain ID is not available
   * @throws {NonceError} When reading nonce from contract fails
   */
  private async getUserNonce(): Promise<bigint> {
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
        `Failed to retrieve user nonce: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Composes the EIP-712 typed data for PermissionGrant (new simplified format).
   *
   * @param params - The parameters for composing the permission grant message
   * @param params.grantee - The recipient address for the permission grant
   * @param params.operation - The type of operation being granted permission for
   * @param params.files - Array of file IDs that the permission applies to
   * @param params.grantUrl - URL where the grant details are stored
   * @param params.serializedParameters - Serialized parameters for the operation
   * @param params.nonce - Unique number to prevent replay attacks
   * @returns Promise resolving to the typed data structure
   */
  private async composePermissionGrantMessage(params: {
    grantee: Address;
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

    // Get granteeId from grantee address
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityGranteesAddress = getContractAddress(
      chainId,
      "DataPortabilityGrantees",
    );
    const DataPortabilityGranteesAbi = getAbi("DataPortabilityGrantees");

    const granteeId = await this.context.publicClient.readContract({
      address: DataPortabilityGranteesAddress,
      abi: DataPortabilityGranteesAbi,
      functionName: "granteeAddressToId",
      args: [params.grantee],
    });

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
          { name: "granteeId", type: "uint256" },
          { name: "grant", type: "string" },
          { name: "fileIds", type: "uint256[]" },
        ],
      },
      primaryType: "Permission",
      message: {
        nonce: params.nonce,
        granteeId: granteeId as bigint,
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
   * Signs typed data using the wallet client with signature caching.
   *
   * @param typedData - The EIP-712 typed data structure to sign
   * @returns Promise resolving to the cryptographic signature
   */
  private async signTypedData(
    typedData: PermissionGrantTypedData | GenericTypedData,
  ): Promise<Hash> {
    try {
      // Get wallet address for cache key - use account if available, otherwise get from wallet
      const walletAddress =
        this.context.walletClient.account?.address ||
        (await this.getUserAddress());

      // Use signature cache to avoid repeated signing of identical messages
      return await withSignatureCache(
        this.context.platform.cache,
        walletAddress,
        typedData as unknown as Record<string, unknown>,
        async () => {
          return await this.context.walletClient.signTypedData(
            typedData as Parameters<
              typeof this.context.walletClient.signTypedData
            >[0],
          );
        },
      );
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
   * Gets on-chain permission grant data without expensive off-chain resolution.
   *
   * @remarks
   * This method provides a fast, performance-focused way to retrieve permission grants
   * by querying only the subgraph without making expensive IPFS or individual contract calls.
   * It eliminates the N+1 query problem of the legacy `getUserPermissions()` method.
   *
   * The returned data contains all on-chain information but does NOT include resolved
   * operation details, parameters, or file IDs. Use `retrieveGrantFile()` separately
   * for specific grants when detailed data is needed.
   *
   * **Performance**: Completes in ~100-500ms regardless of permission count.
   * **Reliability**: Single point of failure (subgraph) with clear RPC fallback path.
   *
   * @param options - Options for retrieving permissions (limit, subgraph URL)
   * @returns A Promise that resolves to an array of `OnChainPermissionGrant` objects
   * @throws {BlockchainError} When subgraph query fails
   * @throws {NetworkError} When network requests fail
   * @example
   * ```typescript
   * // Fast: Get all on-chain permission data
   * const grants = await vana.permissions.getUserPermissionGrantsOnChain({ limit: 20 });
   *
   * // Display in UI immediately
   * grants.forEach(grant => {
   *   console.log(`Permission ${grant.id}: ${grant.grantUrl}`);
   * });
   *
   * // Lazy load detailed data for specific permission when user clicks
   * const grantFile = await retrieveGrantFile(grants[0].grantUrl);
   * console.log(`Operation: ${grantFile.operation}`);
   * console.log(`Parameters:`, grantFile.parameters);
   * ```
   */
  async getUserPermissionGrantsOnChain(
    options: GetUserPermissionsOptions = {},
  ): Promise<OnChainPermissionGrant[]> {
    const { limit = 50, subgraphUrl } = options;

    try {
      const userAddress = await this.getUserAddress();

      // Use provided subgraph URL or default from context
      const graphqlEndpoint = subgraphUrl || this.context.subgraphUrl;

      if (!graphqlEndpoint) {
        throw new BlockchainError(
          "subgraphUrl is required. Please provide a valid subgraph endpoint or configure it in Vana constructor.",
        );
      }

      // Query the subgraph for user's permissions - SINGLE QUERY, NO LOOPS
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

      if (result.errors) {
        throw new BlockchainError(
          `Subgraph errors: ${result.errors.map((e: { message: string }) => e.message).join(", ")}`,
        );
      }

      const userData = result.data?.user;
      if (!userData || !userData.permissions?.length) {
        return [];
      }

      // Process permissions without expensive network calls - FAST PATH
      const onChainGrants: OnChainPermissionGrant[] = userData.permissions
        .slice(0, limit)
        .map((permission) => ({
          id: BigInt(permission.id),
          grantUrl: permission.grant,
          grantSignature: permission.grantSignature,
          grantHash: permission.grantHash,
          nonce: BigInt(permission.nonce),
          addedAtBlock: BigInt(permission.addedAtBlock),
          addedAtTimestamp: BigInt(permission.addedAtTimestamp || "0"),
          transactionHash: permission.transactionHash || "",
          grantor: userAddress as Address,
          active: true, // TODO: Add revocation status from subgraph when available
        }));

      return onChainGrants.sort((a, b) => {
        // Sort by ID - most recent first
        if (a.id < b.id) return 1;
        if (a.id > b.id) return -1;
        return 0;
      });
    } catch (error) {
      if (error instanceof BlockchainError || error instanceof NetworkError) {
        throw error;
      }
      throw new BlockchainError(
        `Failed to fetch user permission grants: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Gets all permission IDs for a specific file.
   *
   * @param fileId - The file ID to query permissions for
   * @returns Promise resolving to array of permission IDs
   * @throws {BlockchainError} When reading from contract fails or chain is unavailable
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
   * @throws {BlockchainError} When reading from contract fails or chain is unavailable
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
   * @throws {BlockchainError} When reading from contract fails or chain is unavailable
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
   * @throws {BlockchainError} When reading from contract fails or chain is unavailable
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
   * Adds and trusts a server for data processing.
   *
   * @param params - Parameters for adding and trusting the server
   * @returns Promise resolving to transaction hash
   * @throws {UserRejectedRequestError} When user rejects the transaction
   * @throws {BlockchainError} When chain ID is unavailable or transaction fails
   * @throws {Error} When wallet account is not available
   * @example
   * ```typescript
   * // Add and trust a server by providing all required details
   * const txHash = await vana.permissions.addAndTrustServer({
   *   owner: '0x1234...',
   *   serverAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
   *   serverUrl: 'https://myserver.example.com',
   *   publicKey: '0x456...'
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
            serverUrl: params.serverUrl,
            publicKey: params.publicKey as `0x${string}`,
          },
        ],
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
        `Failed to add and trust server: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Trusts a server for data processing (legacy method).
   *
   * @param params - Parameters for trusting the server
   * @returns Promise resolving to transaction hash
   * @deprecated Use addAndTrustServer instead
   */
  async trustServer(params: TrustServerParams): Promise<Hash> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      // Submit directly to the contract using trustServer method
      const txHash = await this.context.walletClient.writeContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "trustServer",
        args: [BigInt(params.serverId)],
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
   * Adds and trusts a server using a signature (gasless transaction).
   *
   * @param params - Parameters for adding and trusting the server
   * @returns Promise resolving to transaction hash
   */
  async addAndTrustServerWithSignature(
    params: AddAndTrustServerParams,
  ): Promise<Hash> {
    try {
      const nonce = await this.getUserNonce();

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
      // TODO: Add submitAddAndTrustServer to RelayerCallbacks interface
      // For now, always use direct transaction
      return await this.submitAddAndTrustServerTransaction(
        addAndTrustServerInput,
        signature,
      );
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
   * Trusts a server using a signature (gasless transaction - legacy method).
   *
   * @param params - Parameters for trusting the server
   * @returns Promise resolving to transaction hash
   * @deprecated Use addAndTrustServerWithSignature instead
   * @throws {BlockchainError} When chain ID is not available
   * @throws {NonceError} When retrieving user nonce fails
   * @throws {SignatureError} When user rejects the signature request
   * @throws {RelayerError} When gasless submission fails
   * @throws {ServerUrlMismatchError} When server URL doesn't match existing registration
   * @throws {BlockchainError} When trust operation fails for any other reason
   */
  async trustServerWithSignature(params: TrustServerParams): Promise<Hash> {
    try {
      const nonce = await this.getUserNonce();

      // Create trust server message
      const trustServerInput: TrustServerInput = {
        nonce,
        serverId: params.serverId,
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

      // Submit directly to the contract
      const txHash = await this.context.walletClient.writeContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "untrustServer",
        args: [BigInt(params.serverId)],
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
   * @param params.serverId - The server's Ethereum address to untrust
   * @returns Promise resolving to transaction hash
   * @throws {Error} When wallet account is not available
   * @throws {NonceError} When retrieving user nonce fails
   * @throws {UserRejectedRequestError} When user rejects the transaction
   * @throws {BlockchainError} When untrust transaction fails
   */
  async untrustServer(params: UntrustServerParams): Promise<Hash> {
    // Convert UntrustServerParams to UntrustServerInput by adding nonce
    const nonce = await this.getUserNonce();
    const untrustServerInput: UntrustServerInput = {
      nonce,
      serverId: params.serverId,
    };

    return await this.submitDirectUntrustTransaction(untrustServerInput);
  }

  /**
   * Untrusts a server using a signature (gasless transaction).
   *
   * @param params - Parameters for untrusting the server
   * @param params.serverId - The server's Ethereum address to untrust
   * @returns Promise resolving to transaction hash
   * @throws {Error} When wallet account is not available
   * @throws {NonceError} When retrieving user nonce fails
   * @throws {SignatureError} When user rejects the signature request
   * @throws {RelayerError} When gasless submission fails
   * @throws {BlockchainError} When untrust transaction fails
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
   * Gets all servers trusted by a user.
   *
   * @param userAddress - Optional user address (defaults to current user)
   * @returns Promise resolving to array of trusted server IDs (numeric)
   * @throws {BlockchainError} When reading from contract fails or chain is unavailable
   */
  async getTrustedServers(userAddress?: Address): Promise<number[]> {
    try {
      const user = userAddress || (await this.getUserAddress());
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const serverIds = (await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "userServerIdsValues",
        args: [user],
      })) as bigint[];

      return serverIds.map((id) => Number(id));
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
   * @param serverId - Server ID (numeric)
   * @returns Promise resolving to server information
   * @throws {BlockchainError} When reading from contract fails or chain is unavailable
   */
  async getServerInfo(serverId: number): Promise<Server> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const serverInfo = (await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "servers",
        args: [BigInt(serverId)],
      })) as {
        id: bigint;
        owner: Address;
        url: string;
        serverAddress: Address;
        publicKey: string;
      };

      return {
        id: Number(serverInfo.id),
        owner: serverInfo.owner,
        url: serverInfo.url,
        serverAddress: serverInfo.serverAddress,
        publicKey: serverInfo.publicKey,
      };
    } catch (error) {
      throw new BlockchainError(
        `Failed to get server info: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Checks if a server is active.
   *
   * @param serverId - Server ID (numeric)
   * @returns Promise resolving to boolean indicating if server is active
   */
  async isActiveServer(serverId: number): Promise<boolean> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const isActive = (await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "isActiveServer",
        args: [BigInt(serverId)],
      })) as boolean;

      return isActive;
    } catch (error) {
      throw new BlockchainError(
        `Failed to check server status: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Checks if a server is active for a specific user.
   *
   * @param serverId - Server ID (numeric)
   * @param userAddress - Optional user address (defaults to current user)
   * @returns Promise resolving to boolean indicating if server is active for the user
   */
  async isActiveServerForUser(
    serverId: number,
    userAddress?: Address,
  ): Promise<boolean> {
    try {
      const user = userAddress || (await this.getUserAddress());
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const isActive = (await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "isActiveServerForUser",
        args: [user, BigInt(serverId)],
      })) as boolean;

      return isActive;
    } catch (error) {
      throw new BlockchainError(
        `Failed to check server status for user: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Gets the total count of trusted servers for a user.
   *
   * @param userAddress - Optional user address (defaults to current user)
   * @returns Promise resolving to the number of trusted servers
   * @throws {BlockchainError} When reading from contract fails or chain is unavailable
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

      const count = (await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
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
   * @throws {BlockchainError} When reading from contract fails or chain is unavailable
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
      const totalCount = (await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
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
      const serverPromises: Promise<bigint>[] = [];
      for (let i = offset; i < endIndex; i++) {
        const promise = this.context.publicClient.readContract({
          address: DataPortabilityServersAddress,
          abi: DataPortabilityServersAbi,
          functionName: "userServerIdsAt",
          args: [user, BigInt(i)],
        }) as Promise<bigint>;
        serverPromises.push(promise);
      }

      const serverIds = await Promise.all(serverPromises);
      const servers = serverIds.map((id) => Number(id));

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
   * @throws {BlockchainError} When reading from contract fails or chain is unavailable
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
              owner: serverInfo.owner,
              url: serverInfo.url,
              serverAddress: serverInfo.serverAddress,
              publicKey: serverInfo.publicKey,
              isTrusted: true,
              trustIndex: options.offset ? options.offset + index : index,
            };
          } catch {
            // If we can't get server info, return basic info
            return {
              serverId,
              owner: "0x0000000000000000000000000000000000000000" as Address,
              url: "",
              serverAddress:
                "0x0000000000000000000000000000000000000000" as Address,
              publicKey: "",
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
   * @throws {BlockchainError} When reading from contract fails or chain is unavailable
   */
  async getServerInfoBatch(
    serverIds: number[],
  ): Promise<BatchServerInfoResult> {
    if (serverIds.length === 0) {
      return {
        servers: new Map(),
        failed: [],
      };
    }

    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      // Create promises for all server info requests
      const serverInfoPromises = serverIds.map(async (serverId) => {
        try {
          const serverInfo = (await this.context.publicClient.readContract({
            address: DataPortabilityServersAddress,
            abi: DataPortabilityServersAbi,
            functionName: "servers",
            args: [BigInt(serverId)],
          })) as {
            id: bigint;
            owner: Address;
            url: string;
            serverAddress: Address;
            publicKey: string;
          };

          const server: Server = {
            id: Number(serverInfo.id),
            owner: serverInfo.owner,
            url: serverInfo.url,
            serverAddress: serverInfo.serverAddress,
            publicKey: serverInfo.publicKey,
          };

          return { serverId, server, success: true };
        } catch {
          return { serverId, server: null, success: false };
        }
      });

      const results = await Promise.all(serverInfoPromises);

      // Separate successful and failed requests
      const servers = new Map<number, Server>();
      const failed: number[] = [];

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
   * @param serverId - Server ID to check (numeric)
   * @param userAddress - Optional user address (defaults to current user)
   * @returns Promise resolving to server trust status
   */
  async checkServerTrustStatus(
    serverId: number,
    userAddress?: Address,
  ): Promise<ServerTrustStatus> {
    try {
      const user = userAddress || (await this.getUserAddress());
      const trustedServers = await this.getTrustedServers(user);

      const trustIndex = trustedServers.findIndex(
        (server) => server === serverId,
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
   * Composes EIP-712 typed data for AddAndTrustServer.
   *
   * @param input - The add and trust server input data containing server details
   * @returns Promise resolving to the typed data structure for server add and trust
   */
  private async composeAddAndTrustServerMessage(
    input: AddAndTrustServerInput,
  ): Promise<AddAndTrustServerTypedData> {
    const domain = await this.getServersDomain();

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
   * Composes EIP-712 typed data for TrustServer.
   *
   * @param input - The trust server input data containing server details
   * @returns Promise resolving to the typed data structure for server trust
   */
  private async composeTrustServerMessage(
    input: TrustServerInput,
  ): Promise<TrustServerTypedData> {
    const domain = await this.getServersDomain();

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
    const domain = await this.getServersDomain();

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
   * Gets the EIP-712 domain for DataPortabilityServers signatures.
   *
   * @returns Promise resolving to the EIP-712 domain configuration
   */
  private async getServersDomain() {
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
          publicKey: addAndTrustServerInput.publicKey as `0x${string}`,
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

  // ===========================
  // GRANTEE METHODS
  // ===========================

  /**
   * Registers a new grantee
   *
   * @param params - Parameters for registering the grantee
   * @returns Promise resolving to the transaction hash
   *
   * @example
   * ```typescript
   * const txHash = await vana.permissions.registerGrantee({
   *   owner: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
   *   granteeAddress: "0xApp1234567890123456789012345678901234567890",
   *   publicKey: "0x1234567890abcdef..."
   * });
   * ```
   */
  async registerGrantee(params: RegisterGranteeParams): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityGranteesAddress = getContractAddress(
      chainId,
      "DataPortabilityGrantees",
    );
    const DataPortabilityGranteesAbi = getAbi("DataPortabilityGrantees");

    const txHash = await this.context.walletClient.writeContract({
      address: DataPortabilityGranteesAddress,
      abi: DataPortabilityGranteesAbi,
      functionName: "registerGrantee",
      args: [params.owner, params.granteeAddress, params.publicKey],
      account:
        this.context.walletClient.account || (await this.getUserAddress()),
      chain: this.context.walletClient.chain || null,
    });

    return txHash;
  }

  /**
   * Registers a grantee with a signature (gasless transaction)
   *
   * @param params - Parameters for registering the grantee
   * @returns Promise resolving to the transaction hash
   *
   * @example
   * ```typescript
   * const txHash = await vana.permissions.registerGranteeWithSignature({
   *   owner: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
   *   granteeAddress: "0xApp1234567890123456789012345678901234567890",
   *   publicKey: "0x1234567890abcdef..."
   * });
   * ```
   */
  async registerGranteeWithSignature(
    params: RegisterGranteeParams,
  ): Promise<Hash> {
    const nonce = await this.getUserNonce();

    const registerGranteeInput: RegisterGranteeInput = {
      nonce,
      owner: params.owner,
      granteeAddress: params.granteeAddress,
      publicKey: params.publicKey,
    };

    const typedData =
      await this.buildRegisterGranteeTypedData(registerGranteeInput);
    const signature = await this.signTypedData(typedData);

    // TODO: Add submitRegisterGrantee to RelayerCallbacks interface
    // For now, always use direct transaction
    return this.submitSignedRegisterGranteeTransaction(typedData, signature);
  }

  /**
   * Gets all grantees
   *
   * @param options - Query options
   * @returns Promise resolving to paginated grantees
   *
   * @example
   * ```typescript
   * const result = await vana.permissions.getGrantees({
   *   limit: 10,
   *   offset: 0
   * });
   * ```
   */
  async getGrantees(
    options: GranteeQueryOptions = {},
  ): Promise<PaginatedGrantees> {
    const chainId = await this.context.publicClient.getChainId();
    const DataPortabilityGranteesAddress = getContractAddress(
      chainId,
      "DataPortabilityGrantees",
    );
    const DataPortabilityGranteesAbi = getAbi("DataPortabilityGrantees");

    // Get total count
    const totalCount = (await this.context.publicClient.readContract({
      address: DataPortabilityGranteesAddress,
      abi: DataPortabilityGranteesAbi,
      functionName: "granteesCount",
    })) as bigint;

    const total = Number(totalCount);
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const grantees: Grantee[] = [];

    // Fetch grantees in the requested range
    const endIndex = Math.min(offset + limit, total);

    for (let i = offset; i < endIndex; i++) {
      try {
        const granteeInfo = (await this.context.publicClient.readContract({
          address: DataPortabilityGranteesAddress,
          abi: DataPortabilityGranteesAbi,
          functionName: "grantees",
          args: [BigInt(i + 1)], // Grantee IDs are 1-indexed
        })) as {
          owner: Address;
          granteeAddress: Address;
          publicKey: string;
          permissionIds: readonly bigint[];
        };

        grantees.push({
          id: i + 1,
          owner: granteeInfo.owner,
          address: granteeInfo.granteeAddress,
          publicKey: granteeInfo.publicKey,
          permissionIds: granteeInfo.permissionIds.map((id) => Number(id)),
        });
      } catch (error) {
        console.warn(`Failed to fetch grantee ${i + 1}:`, error);
      }
    }

    return {
      grantees,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Gets a grantee by their address
   *
   * @param granteeAddress - The grantee's address
   * @returns Promise resolving to the grantee info or null if not found
   *
   * @example
   * ```typescript
   * const grantee = await vana.permissions.getGranteeByAddress("0x1234...");
   * ```
   */
  async getGranteeByAddress(granteeAddress: Address): Promise<Grantee | null> {
    const chainId = await this.context.publicClient.getChainId();
    const DataPortabilityGranteesAddress = getContractAddress(
      chainId,
      "DataPortabilityGrantees",
    );
    const DataPortabilityGranteesAbi = getAbi("DataPortabilityGrantees");

    try {
      const granteeInfo = (await this.context.publicClient.readContract({
        address: DataPortabilityGranteesAddress,
        abi: DataPortabilityGranteesAbi,
        functionName: "granteeByAddress",
        args: [granteeAddress],
      })) as {
        owner: Address;
        granteeAddress: Address;
        publicKey: string;
        permissionIds: readonly bigint[];
      };

      // Get the grantee ID
      const granteeId = (await this.context.publicClient.readContract({
        address: DataPortabilityGranteesAddress,
        abi: DataPortabilityGranteesAbi,
        functionName: "granteeAddressToId",
        args: [granteeAddress],
      })) as bigint;

      return {
        id: Number(granteeId),
        owner: granteeInfo.owner,
        address: granteeInfo.granteeAddress,
        publicKey: granteeInfo.publicKey,
        permissionIds: granteeInfo.permissionIds.map((id) => Number(id)),
      };
    } catch (error) {
      console.warn(`Failed to fetch grantee ${granteeAddress}:`, error);
      return null;
    }
  }

  /**
   * Gets a grantee by their ID
   *
   * @param granteeId - The grantee's ID
   * @returns Promise resolving to the grantee info or null if not found
   *
   * @example
   * ```typescript
   * const grantee = await vana.permissions.getGranteeById(1);
   * ```
   */
  async getGranteeById(granteeId: number): Promise<Grantee | null> {
    const chainId = await this.context.publicClient.getChainId();
    const DataPortabilityGranteesAddress = getContractAddress(
      chainId,
      "DataPortabilityGrantees",
    );
    const DataPortabilityGranteesAbi = getAbi("DataPortabilityGrantees");

    try {
      const granteeInfo = (await this.context.publicClient.readContract({
        address: DataPortabilityGranteesAddress,
        abi: DataPortabilityGranteesAbi,
        functionName: "grantees",
        args: [BigInt(granteeId)],
      })) as {
        owner: Address;
        granteeAddress: Address;
        publicKey: string;
        permissionIds: readonly bigint[];
      };

      return {
        id: granteeId,
        owner: granteeInfo.owner,
        address: granteeInfo.granteeAddress,
        publicKey: granteeInfo.publicKey,
        permissionIds: granteeInfo.permissionIds.map((id) => Number(id)),
      };
    } catch (error) {
      console.warn(`Failed to fetch grantee ${granteeId}:`, error);
      return null;
    }
  }

  /**
   * Builds EIP-712 typed data for grantee registration
   *
   * @param input - The register grantee input
   * @returns Promise resolving to the typed data structure
   * @private
   */
  private async buildRegisterGranteeTypedData(
    input: RegisterGranteeInput,
  ): Promise<RegisterGranteeTypedData> {
    const chainId = await this.context.walletClient.getChainId();
    const verifyingContract = getContractAddress(
      chainId,
      "DataPortabilityGrantees",
    );

    return {
      domain: {
        name: "DataPortabilityGrantees",
        version: "1",
        chainId,
        verifyingContract,
      },
      types: {
        RegisterGrantee: [
          { name: "nonce", type: "uint256" },
          { name: "owner", type: "address" },
          { name: "granteeAddress", type: "address" },
          { name: "publicKey", type: "string" },
        ],
      },
      primaryType: "RegisterGrantee",
      message: input,
    };
  }

  /**
   * Submits a register grantee transaction with signature.
   *
   * @param typedData - The EIP-712 typed data structure for the registration
   * @param _signature - The cryptographic signature authorizing the registration (currently unused)
   * @returns Promise resolving to the transaction hash
   * @private
   */
  private async submitSignedRegisterGranteeTransaction(
    typedData: GenericTypedData,
    _signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityGranteesAddress = getContractAddress(
      chainId,
      "DataPortabilityGrantees",
    );
    const DataPortabilityGranteesAbi = getAbi("DataPortabilityGrantees");

    // TODO: Add registerGranteeWithSignature to DataPortabilityGrantees contract
    // For now, use direct registerGrantee function
    const txHash = await this.context.walletClient.writeContract({
      address: DataPortabilityGranteesAddress,
      abi: DataPortabilityGranteesAbi,
      functionName: "registerGrantee",
      args: [
        (typedData.message as RegisterGranteeInput).owner,
        (typedData.message as RegisterGranteeInput).granteeAddress,
        (typedData.message as RegisterGranteeInput).publicKey,
      ],
      account:
        this.context.walletClient.account || (await this.getUserAddress()),
      chain: this.context.walletClient.chain || null,
    });

    return txHash;
  }
}
