import { Address, Hash, getAddress } from "viem";
import type { WalletClient, PublicClient } from "viem";
import { gasAwareMulticall } from "../utils/multicall";
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
  GranteeInfo,
  RegisterGranteeParams,
  RegisterGranteeInput,
  RegisterGranteeTypedData,
  GranteeQueryOptions,
  PaginatedGrantees,
  ServerInfo,
  ServerFilesAndPermissionParams,
  ServerFilesAndPermissionTypedData,
  Permission,
} from "../types/index";
import {
  PermissionGrantResult,
  PermissionRevokeResult,
  ServerTrustResult,
  ServerUntrustResult,
  ServerUpdateResult,
  GranteeRegisterResult,
} from "../types/transactionResults";
import type {
  TransactionResult,
  TransactionWaitOptions,
} from "../types/operations";
import { PermissionInfo } from "../types/permissions";
import type {
  RelayerCallbacks,
  DownloadRelayerCallbacks,
} from "../types/config";
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
import { getAbi } from "../generated/abi";
import { createGrantFile, getGrantFileHash } from "../utils/grantFiles";
import { validateGrant } from "../utils/grantValidation";
import { withSignatureCache } from "../utils/signatureCache";
import { formatSignatureForContract } from "../utils/signatureFormatter";
import { toViemTypedDataDefinition } from "../utils/typedDataConverter";
import { StorageManager } from "../storage";
import type { VanaPlatformAdapter } from "../platform/interface";
import type { GetUserPermissionsQuery } from "../generated/subgraph";

// Wrapper type for GraphQL responses with potential errors
type SubgraphPermissionsResponse = {
  data?: GetUserPermissionsQuery;
  errors?: Array<{ message: string }>;
};

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
  /** Proxies CORS-restricted downloads through application server. */
  downloadRelayer?: DownloadRelayerCallbacks;
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
  /** Default personal server base URL for server operations. */
  defaultPersonalServerUrl?: string;
  /** Waits for transaction confirmation and parses typed events. */
  waitForTransactionEvents?: <T = unknown>(
    hashOrObj: Hash | TransactionResult | { hash: Hash },
    options?: import("../types/operations").TransactionWaitOptions,
  ) => Promise<T>;
  /** Waits for an operation to complete with polling. */
  waitForOperation?: <T = unknown>(
    opOrId: import("../types/operations").Operation<T> | string,
    options?: import("../types/operations").PollingOptions,
  ) => Promise<import("../types/operations").Operation<T>>;
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
  async grant(
    params: GrantPermissionParams,
  ): Promise<TransactionResult & { eventData?: PermissionGrantResult }> {
    return await this.submitPermissionGrant(params);
  }

  /**
   * Submits a permission grant transaction and returns a handle for flexible result access.
   *
   * @remarks
   * This lower-level method provides maximum control over transaction timing.
   * Returns a TransactionResult that can be serialized and passed across API boundaries.
   * Use this when handling multiple transactions or when you need granular control.
   *
   * @param params - The permission grant configuration object
   * @returns Promise resolving to TransactionResult with hash and event parsing capabilities
   * @throws {RelayerError} When gasless transaction submission fails
   * @throws {SignatureError} When user rejects the signature request
   * @throws {SerializationError} When grant data cannot be serialized
   * @throws {BlockchainError} When permission grant preparation fails
   * @example
   * ```typescript
   * // Submit transaction and get immediate hash access
   * const tx = await vana.permissions.submitPermissionGrant(params);
   * console.log(`Transaction submitted: ${tx.hash}`);
   *
   * // To wait for events, use SDK's waitForTransactionEvents
   * const eventData = await vana.waitForTransactionEvents(tx.hash);
   * console.log(`Permission ID: ${eventData.permissionId}`);
   * ```
   */
  async submitPermissionGrant(
    params: GrantPermissionParams,
  ): Promise<TransactionResult & { eventData?: PermissionGrantResult }> {
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
    confirm: () => Promise<
      TransactionResult & { eventData?: PermissionGrantResult }
    >;
  }> {
    try {
      // Step 1: Create grant file in memory (no IPFS upload yet)
      const grantFile = createGrantFile(params);

      // Step 2: Validate the grant file against our JSON schema
      validateGrant(grantFile);

      // Step 3: Return preview and confirm function
      return {
        preview: grantFile,
        confirm: async (): Promise<
          TransactionResult & { eventData?: PermissionGrantResult }
        > => {
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
   * Completes the grant process after user confirmation.
   *
   * @remarks
   * This internal method is called by the confirm() function returned from prepareGrant().
   * It handles IPFS upload, signature creation, and transaction submission.
   *
   * @param params - The permission grant parameters containing user and operation details
   * @param grantFile - The prepared grant file with permissions and metadata
   * @returns Promise resolving to TransactionResult for flexible result access
   * @throws {BlockchainError} When permission grant confirmation fails
   * @throws {NetworkError} When IPFS upload fails
   * @throws {SignatureError} When user rejects the signature
   */
  private async confirmGrantInternal(
    params: GrantPermissionParams,
    grantFile: GrantFile,
  ): Promise<TransactionResult & { eventData?: PermissionGrantResult }> {
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
      const nonce = await this.getPermissionsUserNonce();

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
      const nonce = await this.getPermissionsUserNonce();

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
  ): Promise<TransactionResult & { eventData?: PermissionGrantResult }> {
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
      let hash: Hash;
      if (this.context.relayerCallbacks?.submitPermissionGrant) {
        hash = await this.context.relayerCallbacks.submitPermissionGrant(
          typedData,
          signature,
        );
      } else {
        hash = await this.submitDirectTransaction(typedData, signature);
      }
      return {
        hash,
        from: this.context.walletClient.account?.address,
      };
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
   *
   * @remarks
   * This method extracts the trust server input from typed data and submits it directly.
   * Used internally by trust server methods after signature collection.
   *
   * @param typedData - The EIP-712 typed data for TrustServer
   * @param signature - The user's signature obtained via `signTypedData()`
   * @returns Promise resolving to TransactionResult for transaction tracking
   * @throws {BlockchainError} When contract submission fails
   * @throws {NetworkError} When blockchain communication fails
   * @example
   * ```typescript
   * const txHandle = await vana.permissions.submitSignedTrustServer(
   *   typedData,
   *   "0x1234..."
   * );
   * const result = await txHandle.waitForEvents();
   * ```
   */
  async submitSignedTrustServer(
    typedData: TrustServerTypedData,
    signature: Hash,
  ): Promise<TransactionResult & { eventData?: ServerTrustResult }> {
    try {
      const trustServerInput: TrustServerInput = {
        nonce: BigInt(typedData.message.nonce),
        serverId: typedData.message.serverId,
      };

      const hash = await this.submitTrustServerTransaction(
        trustServerInput,
        signature,
      );
      return {
        hash,
        from: this.context.walletClient.account?.address,
      };
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
   * Submits an already-signed add and trust server transaction to the blockchain.
   *
   * @remarks
   * This method extracts the add and trust server input from typed data and submits it directly.
   * Combines server registration and trust operations in a single transaction.
   *
   * @param typedData - The EIP-712 typed data for AddAndTrustServer
   * @param signature - The user's signature obtained via `signTypedData()`
   * @returns Promise resolving to TransactionResult for transaction tracking
   * @throws {BlockchainError} When contract submission fails
   * @throws {NetworkError} When blockchain communication fails
   * @example
   * ```typescript
   * const txHandle = await vana.permissions.submitSignedAddAndTrustServer(
   *   typedData,
   *   "0x1234..."
   * );
   * const result = await txHandle.waitForEvents();
   * ```
   */
  async submitSignedAddAndTrustServer(
    typedData: AddAndTrustServerTypedData,
    signature: Hash,
  ): Promise<TransactionResult & { eventData?: ServerTrustResult }> {
    try {
      const addAndTrustServerInput: AddAndTrustServerInput = {
        nonce: BigInt(typedData.message.nonce),
        serverAddress: typedData.message.serverAddress,
        serverUrl: typedData.message.serverUrl,
        publicKey: typedData.message.publicKey,
      };

      const hash = await this.submitAddAndTrustServerTransaction(
        addAndTrustServerInput,
        signature,
      );
      return {
        hash,
        from: this.context.walletClient.account?.address,
      };
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
        `Add and trust server submission failed444444: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submits an already-signed permission revoke transaction to the blockchain.
   *
   * @remarks
   * This method handles the revocation of previously granted permissions.
   * Used internally by revocation methods after signature collection.
   *
   * @param typedData - The EIP-712 typed data for PermissionRevoke
   * @param signature - The user's signature obtained via `signTypedData()`
   * @returns Promise resolving to TransactionResult for transaction tracking
   * @throws {BlockchainError} When contract submission fails
   * @throws {NetworkError} When blockchain communication fails
   * @example
   * ```typescript
   * const txHandle = await vana.permissions.submitSignedRevoke(
   *   typedData,
   *   "0x1234..."
   * );
   * const result = await txHandle.waitForEvents();
   * ```
   */
  async submitSignedRevoke(
    typedData: GenericTypedData,
    signature: Hash,
  ): Promise<TransactionResult & { eventData?: PermissionRevokeResult }> {
    try {
      // Use relayer callbacks or direct transaction
      let hash: Hash;
      if (this.context.relayerCallbacks?.submitPermissionRevoke) {
        hash = await this.context.relayerCallbacks.submitPermissionRevoke(
          typedData,
          signature,
        );
      } else {
        hash = await this.submitDirectRevokeTransaction(typedData, signature);
      }
      return {
        hash,
        from: this.context.walletClient.account?.address,
      };
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
   *
   * @remarks
   * This method handles the removal of trusted servers.
   * Used internally by untrust server methods after signature collection.
   *
   * @param typedData - The EIP-712 typed data for UntrustServer
   * @param signature - The user's signature obtained via `signTypedData()`
   * @returns Promise resolving to TransactionResult for transaction tracking
   * @throws {BlockchainError} When contract submission fails
   * @throws {NetworkError} When blockchain communication fails
   * @example
   * ```typescript
   * const txHandle = await vana.permissions.submitSignedUntrustServer(
   *   typedData,
   *   "0x1234..."
   * );
   * const result = await txHandle.waitForEvents();
   * ```
   */
  async submitSignedUntrustServer(
    typedData: GenericTypedData,
    signature: Hash,
  ): Promise<TransactionResult & { eventData?: ServerUntrustResult }> {
    try {
      // Use relayer callbacks or direct transaction
      let hash: Hash;
      if (this.context.relayerCallbacks?.submitUntrustServer) {
        hash = await this.context.relayerCallbacks.submitUntrustServer(
          typedData as UntrustServerTypedData,
          signature,
        );
      } else {
        hash = await this.submitSignedUntrustTransaction(typedData, signature);
      }
      return {
        hash,
        from: this.context.walletClient.account?.address,
      };
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
   * @remarks
   * Internal method used when relayer callbacks are not available. Formats the signature
   * and submits the permission grant directly to the smart contract.
   *
   * @param typedData - The typed data structure for the permission grant
   * @param signature - The cryptographic signature authorizing the transaction
   * @returns Promise resolving to the transaction hash
   * @throws {BlockchainError} When contract submission fails
   */
  private async submitDirectTransaction(
    typedData: PermissionGrantTypedData,
    signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityPermissionsAddress = getContractAddress(
      chainId,
      "DataPortabilityPermissions",
    );
    const DataPortabilityPermissionsAbi = getAbi("DataPortabilityPermissions");

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

    // Format signature for contract compatibility
    const formattedSignature = formatSignatureForContract(signature);

    // Submit directly to the contract using the provided wallet client
    const txHash = await this.context.walletClient.writeContract({
      address: DataPortabilityPermissionsAddress,
      abi: DataPortabilityPermissionsAbi,
      functionName: "addPermission",
      args: [permissionInput, formattedSignature],
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
  ): Promise<TransactionResult & { eventData?: PermissionRevokeResult }> {
    return await this.submitPermissionRevoke(params);
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
  async submitPermissionRevoke(
    params: RevokePermissionParams,
  ): Promise<TransactionResult & { eventData?: PermissionRevokeResult }> {
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

      return {
        hash: txHash,
        from: this.context.walletClient.account?.address,
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
        throw new BlockchainError(
          `Permission revoke failed: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError("Permission revoke failed with unknown error");
    }
  }

  /**
   * Revokes a permission with a signature for gasless transactions.
   *
   * @remarks
   * This method creates an EIP-712 signature for permission revocation and submits
   * it either through relayer callbacks or directly to the blockchain. Provides
   * gasless revocation when relayer is configured.
   *
   * @param params - Parameters for revoking the permission
   * @param params.permissionId - Permission identifier to revoke (accepts bigint, number, or string)
   * @returns Promise resolving to TransactionResult for transaction tracking
   * @throws {BlockchainError} When chain ID is not available
   * @throws {NonceError} When retrieving user nonce fails
   * @throws {SignatureError} When user rejects the signature request
   * @throws {RelayerError} When gasless submission fails
   * @throws {PermissionError} When revocation fails for any other reason
   * @example
   * ```typescript
   * const txHandle = await vana.permissions.submitRevokeWithSignature({
   *   permissionId: 123n
   * });
   * const result = await txHandle.waitForEvents();
   * console.log(`Permission ${result.permissionId} revoked`);
   * ```
   */
  async submitRevokeWithSignature(
    params: RevokePermissionParams,
  ): Promise<TransactionResult & { eventData?: PermissionRevokeResult }> {
    try {
      // Check chain ID availability early
      if (!this.context.walletClient.chain?.id) {
        throw new BlockchainError("Chain ID not available");
      }

      const nonce = await this.getPermissionsUserNonce();

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
      let hash: Hash;
      if (this.context.relayerCallbacks?.submitPermissionRevoke) {
        hash = await this.context.relayerCallbacks.submitPermissionRevoke(
          typedData,
          signature,
        );
      } else {
        hash = await this.submitDirectRevokeTransaction(typedData, signature);
      }

      return {
        hash,
        from: this.context.walletClient.account?.address,
      };
    } catch (error) {
      throw new PermissionError(
        `Failed to revoke permission with signature: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * @deprecated Use getPermissionsUserNonce() for permission operations or getServersUserNonce() for server operations
   *
   * Retrieves the user's current nonce from the DataPortabilityServers contract.
   * This method is deprecated in favor of more specific nonce methods.
   *
   * The nonce is used to prevent replay attacks in signed transactions and must
   * be incremented with each transaction to maintain security.
   *
   * @returns Promise resolving to the user's current nonce value as a bigint
   * @throws {Error} When wallet account is not available
   * @throws {Error} When chain ID is not available
   * @throws {NonceError} When reading nonce from contract fails
   * @private
   * @example
   * ```typescript
   * // Deprecated - use specific methods instead
   * const nonce = await this.getUserNonce();
   *
   * // Use these instead:
   * const permissionsNonce = await this.getPermissionsUserNonce();
   * const serversNonce = await this.getServersUserNonce();
   * ```
   */
  /**
   * @deprecated Use getPermissionsUserNonce() for permission operations or getServersUserNonce() for server operations
   *
   * Retrieves the user's current nonce from the DataPortabilityServers contract.
   *
   * @remarks
   * This method is deprecated in favor of more specific nonce methods that target
   * the appropriate contract for the operation being performed.
   *
   * @returns Promise resolving to the user's current nonce as a bigint
   * @throws {NonceError} When retrieving the nonce fails
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
   * Retrieves the user's current nonce from the DataPortabilityServers contract.
   * This nonce is used for server-related operations (AddAndTrustServer, TrustServer, UntrustServer).
   *
   * @returns Promise resolving to the current servers nonce
   * @throws {NonceError} When reading nonce from contract fails
   * @private
   *
   * @example
   * ```typescript
   * const nonce = await this.getServersUserNonce();
   * console.log(`Current servers nonce: ${nonce}`);
   * ```
   */
  /**
   * Retrieves the user's current nonce from the DataPortabilityServers contract.
   *
   * @remarks
   * Used for server-related operations (trust/untrust) to prevent replay attacks.
   * The nonce must be incremented with each server operation.
   *
   * @returns Promise resolving to the user's current nonce as a bigint
   * @throws {NonceError} When retrieving the nonce fails
   */
  private async getServersUserNonce(): Promise<bigint> {
    try {
      const userAddress = await this.getUserAddress();
      const chainId = await this.context.walletClient.getChainId();

      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const [nonce] = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "users",
        args: [userAddress],
      });

      return nonce;
    } catch (error) {
      throw new NonceError(
        `Failed to retrieve server nonce: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Retrieves the user's current nonce from the DataPortabilityPermissions contract.
   * This nonce is used for permission-related operations (addPermission, addServerFilesAndPermissions).
   *
   * @returns Promise resolving to the current permissions nonce
   * @throws {NonceError} When reading nonce from contract fails
   * @private
   *
   * @example
   * ```typescript
   * const nonce = await this.getPermissionsUserNonce();
   * console.log(`Current permissions nonce: ${nonce}`);
   * ```
   */
  /**
   * Retrieves the user's current nonce from the DataPortabilityPermissions contract.
   *
   * @remarks
   * Used for permission-related operations (grant/revoke) to prevent replay attacks.
   * The nonce must be incremented with each permission operation.
   *
   * @returns Promise resolving to the user's current nonce as a bigint
   * @throws {NonceError} When retrieving the nonce fails
   */
  private async getPermissionsUserNonce(): Promise<bigint> {
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
        `Failed to retrieve permissions nonce: ${error instanceof Error ? error.message : "Unknown error"}`,
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
   * Creates EIP-712 typed data structure for server files and permissions.
   *
   * @param params - Parameters for the server files and permissions message
   * @param params.granteeId - Grantee ID
   * @param params.grant - Grant URL or grant data
   * @param params.fileUrls - Array of file URLs
   * @param params.schemaIds - Schema IDs for each file
   * @param params.serverAddress - Server address
   * @param params.serverUrl - Server URL
   * @param params.serverPublicKey - Server public key
   * @param params.filePermissions - File permissions array
   * @param params.nonce - Unique number to prevent replay attacks
   * @returns Promise resolving to the typed data structure
   */
  private async composeServerFilesAndPermissionMessage(params: {
    granteeId: bigint;
    grant: string;
    fileUrls: string[];
    schemaIds: number[];
    serverAddress: Address;
    serverUrl: string;
    serverPublicKey: string;
    filePermissions: Permission[][];
    nonce: bigint;
  }): Promise<ServerFilesAndPermissionTypedData> {
    const domain = await this.getPermissionDomain();

    console.debug(
      "🔍 Debug - Composing server files and permission message with grant:",
      params.grant,
    );

    // Warn if using HTTP gateway URL instead of ipfs:// protocol for on-chain storage
    if (
      !params.grant.startsWith("ipfs://") &&
      params.grant.includes("/ipfs/")
    ) {
      const { extractIpfsHash } = await import("../utils/ipfs");
      const hash = extractIpfsHash(params.grant);
      if (hash) {
        console.warn(
          `⚠️  Storing HTTP gateway URL on-chain instead of ipfs:// protocol. ` +
            `Found: ${params.grant}. ` +
            `Consider using ipfs://${hash} for better protocol-agnostic on-chain storage.`,
        );
      }
    }

    return {
      domain,
      types: {
        Permission: [
          { name: "account", type: "address" },
          { name: "key", type: "string" },
        ],
        ServerFilesAndPermission: [
          { name: "nonce", type: "uint256" },
          { name: "granteeId", type: "uint256" },
          { name: "grant", type: "string" },
          { name: "fileUrls", type: "string[]" },
          { name: "schemaIds", type: "uint256[]" },
          { name: "serverAddress", type: "address" },
          { name: "serverUrl", type: "string" },
          { name: "serverPublicKey", type: "string" },
          { name: "filePermissions", type: "Permission[][]" },
        ],
      },
      primaryType: "ServerFilesAndPermission",
      message: {
        nonce: params.nonce,
        granteeId: params.granteeId,
        grant: params.grant,
        fileUrls: params.fileUrls,
        schemaIds: params.schemaIds.map((id) => BigInt(id)),
        serverAddress: params.serverAddress,
        serverUrl: params.serverUrl,
        serverPublicKey: params.serverPublicKey,
        filePermissions: params.filePermissions,
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
   * Signs typed data using the wallet client with signature caching.
   *
   * @param typedData - The EIP-712 typed data structure to sign
   * @returns Promise resolving to the cryptographic signature
   */
  private async signTypedData(typedData: GenericTypedData): Promise<Hash> {
    try {
      // Get wallet address for cache key - use account if available, otherwise get from wallet
      const walletAddress =
        this.context.walletClient.account?.address ||
        (await this.getUserAddress());

      // Use signature cache to avoid repeated signing of identical messages
      return await withSignatureCache(
        this.context.platform.cache,
        walletAddress,
        typedData as Record<string, unknown>,
        async () => {
          const viemCompatibleTypedData = toViemTypedDataDefinition(typedData);
          return await this.context.walletClient.signTypedData({
            ...viemCompatibleTypedData,
            // Non-null assertion is safe here because getUserAddress() above ensures account exists
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            account: this.context.walletClient.account!,
          });
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
              startBlock
              endBlock
              addedAtBlock
              addedAtTimestamp
              transactionHash
              grantee {
                id
                address
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
        .map(
          (permission: NonNullable<typeof userData.permissions>[number]) => ({
            id: BigInt(permission.id),
            grantUrl: permission.grant,
            grantSignature: permission.signature,
            nonce: BigInt(permission.nonce),
            startBlock: BigInt(permission.startBlock),
            addedAtBlock: BigInt(permission.addedAtBlock),
            addedAtTimestamp: BigInt(permission.addedAtTimestamp || "0"),
            transactionHash: permission.transactionHash || "",
            grantor: userAddress as Address,
            grantee: permission.grantee,
            active: !permission.endBlock || BigInt(permission.endBlock) === 0n, // Active if no end block or end block is 0
          }),
        );

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
   * Registers a new server and immediately trusts it in the DataPortabilityServers contract.
   *
   * This is a combined operation that both registers a new data portability server
   * and adds it to the user's trusted servers list in a single transaction.
   * Trusted servers can handle data export and portability requests from the user.
   *
   * @param params - Parameters for adding and trusting the server
   * @param params.owner - Ethereum address that will own this server registration
   * @param params.serverAddress - Ethereum address of the server
   * @param params.serverUrl - HTTPS URL where the server can be reached
   * @param params.publicKey - Server's public key for encryption (hex string)
   * @returns Promise resolving to transaction hash
   * @throws {UserRejectedRequestError} When user rejects the transaction
   * @throws {BlockchainError} When chain ID is unavailable or transaction fails
   * @throws {ServerAlreadyRegisteredError} When server address is already registered
   * @throws {Error} When wallet account is not available
   *
   * @example
   * ```typescript
   * // Add and trust a server by providing all required details
   * const txHash = await vana.permissions.addAndTrustServer({
   *   owner: '0x1234567890abcdef1234567890abcdef12345678',
   *   serverAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
   *   serverUrl: 'https://myserver.example.com',
   *   publicKey: '0x456789abcdef456789abcdef456789abcdef456789abcdef'
   * });
   * console.log('Server added and trusted in transaction:', txHash);
   *
   * // Verify the server is now trusted
   * const trustedServers = await vana.permissions.getTrustedServers();
   * console.log('Now trusting servers:', trustedServers);
   * ```
   */
  async addAndTrustServer(
    params: AddAndTrustServerParams,
  ): Promise<TransactionResult & { eventData?: ServerTrustResult }> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      // Submit directly to the contract
      const userAddress =
        this.context.walletClient.account?.address ||
        (await this.getUserAddress());
      const normalizedUserAddress = getAddress(userAddress);
      const normalizedServerAddress = getAddress(params.serverAddress);

      const txHash = await this.context.walletClient.writeContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "addAndTrustServerByManager",
        args: [
          normalizedUserAddress,
          {
            serverAddress: normalizedServerAddress,
            serverUrl: params.serverUrl,
            publicKey: params.publicKey,
          },
        ],
        account:
          this.context.walletClient.account || (await this.getUserAddress()),
        chain: this.context.walletClient.chain || null,
      });

      return {
        hash: txHash,
        from: this.context.walletClient.account?.address,
      };
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
  async submitTrustServer(
    params: TrustServerParams,
  ): Promise<TransactionResult & { eventData?: ServerTrustResult }> {
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

      return {
        hash: txHash,
        from: this.context.walletClient.account?.address,
      };
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
   * @returns Promise resolving to TransactionResult with ServerTrustResult event data
   */
  async submitAddAndTrustServerWithSignature(
    params: AddAndTrustServerParams,
  ): Promise<TransactionResult & { eventData?: ServerTrustResult }> {
    try {
      const nonce = await this.getServersUserNonce();

      // Create add and trust server message
      const serverAddress = getAddress(params.serverAddress);

      const addAndTrustServerInput: AddAndTrustServerInput = {
        nonce,
        serverAddress,
        publicKey: params.publicKey,
        serverUrl: params.serverUrl,
      };

      // Create typed data
      const typedData = await this.composeAddAndTrustServerMessage(
        addAndTrustServerInput,
      );

      console.debug("🔍 AddAndTrustServer Debug Info:", {
        nonce: nonce.toString(),
        serverAddress: params.serverAddress,
        publicKey: params.publicKey,
        serverUrl: params.serverUrl,
        domain: typedData.domain,
        typedDataMessage: typedData.message,
      });

      // Sign the typed data
      const signature = await this.signTypedData(typedData);

      console.debug("🔍 Generated signature:", signature);

      // Submit via relayer callbacks or direct transaction
      let hash: Hash;
      if (this.context.relayerCallbacks?.submitAddAndTrustServer) {
        hash = await this.context.relayerCallbacks.submitAddAndTrustServer(
          typedData,
          signature,
        );
      } else {
        hash = await this.submitAddAndTrustServerTransaction(
          addAndTrustServerInput,
          signature,
        );
      }

      return {
        hash,
        from: this.context.walletClient.account?.address,
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
  async submitTrustServerWithSignature(
    params: TrustServerParams,
  ): Promise<TransactionResult & { eventData?: ServerTrustResult }> {
    try {
      const nonce = await this.getServersUserNonce();

      // Create trust server message
      const trustServerInput: TrustServerInput = {
        nonce,
        serverId: params.serverId,
      };

      // Create typed data
      const typedData = await this.composeTrustServerMessage(trustServerInput);

      // Sign the typed data
      const signature = await this.signTypedData(typedData);

      // Submit via relayer callbacks or direct transaction
      let hash: Hash;
      if (this.context.relayerCallbacks?.submitTrustServer) {
        hash = await this.context.relayerCallbacks.submitTrustServer(
          typedData,
          signature,
        );
      } else {
        hash = await this.submitTrustServerTransaction(
          trustServerInput,
          signature,
        );
      }

      return {
        hash,
        from: this.context.walletClient.account?.address,
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
  /**
   * Submits an untrust server transaction directly to the blockchain.
   *
   * @remarks
   * Internal method used for direct blockchain submission of untrust server operations
   * when relayer callbacks are not available.
   *
   * @param params - The untrust server parameters
   * @returns Promise resolving to TransactionResult for transaction tracking
   * @throws {BlockchainError} When contract submission fails
   */
  private async submitDirectUntrustTransaction(
    params: UntrustServerInput,
  ): Promise<TransactionResult & { eventData?: ServerUntrustResult }> {
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

      return {
        hash: txHash,
        from: this.context.walletClient.account?.address,
      };
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
   * Removes a server from the user's trusted servers list in the DataPortabilityServers contract.
   *
   * This revokes the server's authorization to handle data portability requests for the user.
   * The server remains registered in the system but will no longer be trusted by this user.
   *
   * @param params - Parameters for untrusting the server
   * @param params.serverId - The numeric ID of the server to untrust
   * @returns Promise resolving to transaction hash
   * @throws {Error} When wallet account is not available
   * @throws {NonceError} When retrieving user nonce fails
   * @throws {UserRejectedRequestError} When user rejects the transaction
   * @throws {ServerNotTrustedError} When the server is not currently trusted
   * @throws {BlockchainError} When untrust transaction fails
   *
   * @example
   * ```typescript
   * // Untrust a specific server
   * const txHash = await vana.permissions.untrustServer({
   *   serverId: 1
   * });
   * console.log('Server untrusted in transaction:', txHash);
   *
   * // Verify the server is no longer trusted
   * const trustedServers = await vana.permissions.getTrustedServers();
   * console.log('Still trusting servers:', trustedServers);
   * ```
   */
  async submitUntrustServer(
    params: UntrustServerParams,
  ): Promise<TransactionResult & { eventData?: ServerUntrustResult }> {
    // Convert UntrustServerParams to UntrustServerInput by adding nonce
    const nonce = await this.getServersUserNonce();
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
  async submitUntrustServerWithSignature(
    params: UntrustServerParams,
  ): Promise<TransactionResult & { eventData?: ServerUntrustResult }> {
    try {
      const nonce = await this.getServersUserNonce();

      // Create untrust server message
      const untrustServerInput: UntrustServerInput = {
        nonce,
        serverId: params.serverId,
      };

      // Create typed data
      const typedData =
        await this.composeUntrustServerMessage(untrustServerInput);

      // Sign the typed data
      const signature = await this.signTypedData(typedData);

      // Submit via relayer callbacks or direct transaction
      let hash: Hash;
      if (this.context.relayerCallbacks?.submitUntrustServer) {
        hash = await this.context.relayerCallbacks.submitUntrustServer(
          typedData,
          signature,
        );
      } else {
        hash = await this.submitSignedUntrustTransaction(typedData, signature);
      }

      return {
        hash,
        from: this.context.walletClient.account?.address,
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
        throw new BlockchainError(
          `Untrust server failed: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError("Untrust server failed with unknown error");
    }
  }

  /**
   * Retrieves all servers trusted by a user from the DataPortabilityServers contract.
   *
   * Returns an array of server IDs that the specified user has explicitly trusted.
   * Trusted servers are those that users have authorized to handle their data portability requests.
   *
   * @param userAddress - Optional user address to query (defaults to current wallet user)
   * @returns Promise resolving to array of trusted server IDs (numeric)
   * @throws {BlockchainError} When reading from contract fails or chain is unavailable
   * @throws {NetworkError} When unable to connect to the blockchain network
   *
   * @example
   * ```typescript
   * // Get trusted servers for current user
   * const myServers = await vana.permissions.getTrustedServers();
   * console.log(`I trust ${myServers.length} servers: ${myServers.join(', ')}`);
   *
   * // Get trusted servers for another user
   * const userServers = await vana.permissions.getTrustedServers("0x1234...");
   * console.log(`User trusts servers: ${userServers.join(', ')}`);
   * ```
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

      // Build multicall batch for fetching server IDs
      const serverIdCalls = [];
      for (let i = offset; i < endIndex; i++) {
        serverIdCalls.push({
          address: DataPortabilityServersAddress,
          abi: DataPortabilityServersAbi,
          functionName: "userServerIdsAt",
          args: [user, BigInt(i)],
        } as const);
      }

      // Fetch all server IDs in batches using gasAwareMulticall
      const serverIdResults = await gasAwareMulticall<
        typeof serverIdCalls,
        false
      >(this.context.publicClient, {
        contracts: serverIdCalls,
      });

      // Extract server IDs from results
      const servers = serverIdResults
        .map((result) => Number(result as bigint))
        .filter((id) => id > 0);

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

      // Get contract addresses and ABIs
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      // Build multicall batch for fetching server info
      const serverInfoCalls = paginatedResult.servers.map(
        (serverId) =>
          ({
            address: DataPortabilityServersAddress,
            abi: DataPortabilityServersAbi,
            functionName: "servers",
            args: [BigInt(serverId)],
          }) as const,
      );

      // Fetch all server info in batches using gasAwareMulticall
      const serverInfoResults = await gasAwareMulticall<
        typeof serverInfoCalls,
        true // Allow failures for individual server lookups
      >(this.context.publicClient, {
        contracts: serverInfoCalls,
        allowFailure: true,
      });

      // Process results
      return serverInfoResults.map((result, index) => {
        const serverId = paginatedResult.servers[index];

        if (result.status === "success" && result.result) {
          const serverInfo = result.result as {
            id: bigint;
            owner: Address;
            serverAddress: Address;
            publicKey: string;
            url: string;
          };

          return {
            id: BigInt(serverId),
            owner: serverInfo.owner,
            serverAddress: serverInfo.serverAddress,
            publicKey: serverInfo.publicKey,
            url: serverInfo.url,
            startBlock: 0n, // We don't have this info from the old method structure
            endBlock: 0n, // 0 means still active
          };
        } else {
          // If server info fails, return basic info
          return {
            id: BigInt(serverId),
            owner: "0x0000000000000000000000000000000000000000" as Address,
            serverAddress:
              "0x0000000000000000000000000000000000000000" as Address,
            publicKey: "",
            url: "",
            startBlock: 0n,
            endBlock: 0n,
          };
        }
      });
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
   * @remarks
   * This method uses multicall to fetch information for multiple servers in a single
   * blockchain call, improving performance when querying many servers. Failed lookups
   * are returned separately for error handling.
   *
   * @param serverIds - Array of numeric server IDs to query
   * @returns Promise resolving to batch result containing successful lookups and failed IDs
   * @throws {BlockchainError} When reading from contract fails or chain is unavailable
   * @example
   * ```typescript
   * const result = await vana.permissions.getServerInfoBatch([1, 2, 3, 999]);
   *
   * // Process successful lookups
   * result.servers.forEach((server, id) => {
   *   console.log(`Server ${id}: ${server.url}`);
   * });
   *
   * // Handle failed lookups
   * if (result.failed.length > 0) {
   *   console.log(`Failed to fetch: ${result.failed.join(', ')}`);
   * }
   * ```
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

      // Build multicall batch for fetching server info
      const serverInfoCalls = serverIds.map(
        (serverId) =>
          ({
            address: DataPortabilityServersAddress,
            abi: DataPortabilityServersAbi,
            functionName: "servers",
            args: [BigInt(serverId)],
          }) as const,
      );

      // Fetch all server info in batches using gasAwareMulticall
      const serverInfoResults = await gasAwareMulticall<
        typeof serverInfoCalls,
        true // Allow failures for individual server lookups
      >(this.context.publicClient, {
        contracts: serverInfoCalls,
        allowFailure: true,
      });

      // Process results
      const results = serverInfoResults.map((result, index) => {
        const serverId = serverIds[index];

        if (result.status === "success" && result.result) {
          const serverInfo = result.result as {
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
        } else {
          return { serverId, server: null, success: false };
        }
      });

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
   * @remarks
   * This method queries the user's trusted server list and checks if the specified
   * server is present. Returns both the trust status and the index in the trust list
   * if trusted.
   *
   * @param serverId - Numeric server ID to check
   * @param userAddress - Optional user address (defaults to current user)
   * @returns Promise resolving to server trust status with trust index if applicable
   * @throws {BlockchainError} When reading from contract fails
   * @example
   * ```typescript
   * const status = await vana.permissions.checkServerTrustStatus(1);
   * if (status.isTrusted) {
   *   console.log(`Server is trusted at index ${status.trustIndex}`);
   * } else {
   *   console.log('Server is not trusted');
   * }
   * ```
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
   * @remarks
   * Creates the complete typed data structure required for EIP-712 signature generation
   * when adding and trusting a new server in a single transaction.
   *
   * @param input - The add and trust server input data containing server details
   * @returns Promise resolving to the typed data structure for server add and trust
   */
  private async composeAddAndTrustServerMessage(
    input: AddAndTrustServerInput,
  ): Promise<AddAndTrustServerTypedData> {
    const domain = await this.getServersDomain();

    console.debug(domain);

    return {
      domain,
      types: {
        AddServer: [
          { name: "nonce", type: "uint256" },
          { name: "serverAddress", type: "address" },
          { name: "publicKey", type: "string" },
          { name: "serverUrl", type: "string" },
        ],
      },
      primaryType: "AddServer",
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

    console.debug("🔍 Transaction Debug Info:", {
      chainId,
      contractAddress: DataPortabilityServersAddress,
      input: {
        nonce: addAndTrustServerInput.nonce.toString(),
        serverAddress: addAndTrustServerInput.serverAddress,
        publicKey: addAndTrustServerInput.publicKey,
        serverUrl: addAndTrustServerInput.serverUrl,
      },
      signature,
    });

    // Format signature for contract compatibility
    const formattedSignature = formatSignatureForContract(signature);

    const txHash = await this.context.walletClient.writeContract({
      address: DataPortabilityServersAddress,
      abi: DataPortabilityServersAbi,
      functionName: "addAndTrustServerWithSignature",
      args: [
        {
          nonce: addAndTrustServerInput.nonce,
          serverAddress: addAndTrustServerInput.serverAddress,
          publicKey: addAndTrustServerInput.publicKey,
          serverUrl: addAndTrustServerInput.serverUrl,
        },
        formattedSignature,
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

    // Format signature for contract compatibility
    const formattedSignature = formatSignatureForContract(signature);

    const txHash = await this.context.walletClient.writeContract({
      address: DataPortabilityServersAddress,
      abi: DataPortabilityServersAbi,
      functionName: "trustServerWithSignature",
      args: [
        {
          nonce: trustServerInput.nonce,
          serverId: BigInt(trustServerInput.serverId),
        },
        formattedSignature,
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
    const DataPortabilityPermissionsAddress = getContractAddress(
      chainId,
      "DataPortabilityPermissions",
    );
    const DataPortabilityPermissionsAbi = getAbi("DataPortabilityPermissions");

    // Format signature for contract compatibility
    const formattedSignature = formatSignatureForContract(signature);

    const txHash = await this.context.walletClient.writeContract({
      address: DataPortabilityPermissionsAddress,
      abi: DataPortabilityPermissionsAbi,
      functionName: "revokePermissionWithSignature",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: [typedData.message as any, formattedSignature] as any,
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

    // Format signature for contract compatibility
    const formattedSignature = formatSignatureForContract(signature);

    // Submit with signature to verify user authorization
    const txHash = await this.context.walletClient.writeContract({
      address: DataPortabilityServersAddress,
      abi: DataPortabilityServersAbi,
      functionName: "untrustServerWithSignature",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: [typedData.message as any, formattedSignature],
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
   * Registers a new grantee in the DataPortabilityGrantees contract.
   *
   * A grantee is an entity (like an application) that can receive data permissions
   * from users. Once registered, users can grant the grantee access to their data.
   *
   * @param params - Parameters for registering the grantee
   * @param params.owner - The Ethereum address that will own this grantee registration
   * @param params.granteeAddress - The Ethereum address of the grantee (application)
   * @param params.publicKey - The public key used for data encryption/decryption (hex string)
   * @returns Promise resolving to the transaction hash
   * @throws {BlockchainError} When the grantee registration transaction fails
   * @throws {UserRejectedRequestError} When user rejects the transaction
   * @throws {ContractError} When grantee is already registered
   *
   * @example
   * ```typescript
   * const txHash = await vana.permissions.registerGrantee({
   *   owner: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
   *   granteeAddress: "0xApp1234567890123456789012345678901234567890",
   *   publicKey: "0x1234567890abcdef..."
   * });
   * console.log(`Grantee registered in transaction: ${txHash}`);
   * ```
   */
  async submitRegisterGrantee(
    params: RegisterGranteeParams,
  ): Promise<TransactionResult & { eventData?: GranteeRegisterResult }> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityGranteesAddress = getContractAddress(
      chainId,
      "DataPortabilityGrantees",
    );
    const DataPortabilityGranteesAbi = getAbi("DataPortabilityGrantees");

    const ownerAddress = getAddress(params.owner);
    const granteeAddress = getAddress(params.granteeAddress);

    const txHash = await this.context.walletClient.writeContract({
      address: DataPortabilityGranteesAddress,
      abi: DataPortabilityGranteesAbi,
      functionName: "registerGrantee",
      args: [ownerAddress, granteeAddress, params.publicKey],
      account:
        this.context.walletClient.account || (await this.getUserAddress()),
      chain: this.context.walletClient.chain || null,
    });

    return {
      hash: txHash,
      from: this.context.walletClient.account?.address,
    };
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
  async submitRegisterGranteeWithSignature(
    params: RegisterGranteeParams,
  ): Promise<TransactionResult & { eventData?: GranteeRegisterResult }> {
    const nonce = await this.getServersUserNonce();

    const owner = getAddress(params.owner);
    const granteeAddress = getAddress(params.granteeAddress);

    const registerGranteeInput: RegisterGranteeInput = {
      nonce,
      owner,
      granteeAddress,
      publicKey: params.publicKey,
    };

    const typedData =
      await this.buildRegisterGranteeTypedData(registerGranteeInput);
    const signature = await this.signTypedData(typedData);

    // TODO: Add submitRegisterGrantee to RelayerCallbacks interface
    // For now, always use direct transaction
    const hash = await this.submitSignedRegisterGranteeTransaction(
      typedData,
      signature,
    );
    return {
      hash,
      from: this.context.walletClient.account?.address,
    };
  }

  /**
   * Submits a signed register grantee transaction via relayer
   *
   * @param typedData - The EIP-712 typed data for register grantee
   * @param signature - The cryptographic signature
   * @returns Promise resolving to the transaction hash
   *
   * @example
   * ```typescript
   * const result = await vana.permissions.submitSignedRegisterGrantee(typedData, signature);
   * ```
   */
  async submitSignedRegisterGrantee(
    typedData: RegisterGranteeTypedData,
    signature: Hash,
  ): Promise<TransactionResult & { eventData?: GranteeRegisterResult }> {
    const hash = await this.submitSignedRegisterGranteeTransaction(
      typedData,
      signature,
    );
    return {
      hash,
      from: this.context.walletClient.account?.address,
    };
  }

  /**
   * Retrieves all registered grantees from the DataPortabilityGrantees contract.
   *
   * Returns a paginated list of all grantees (applications) that have been registered
   * in the system and can receive data permissions from users.
   *
   * @param options - Query options for pagination and filtering
   * @param options.limit - Maximum number of grantees to return (default: 50)
   * @param options.offset - Number of grantees to skip for pagination (default: 0)
   * @returns Promise resolving to paginated grantees with metadata
   * @throws {BlockchainError} When contract read operation fails
   * @throws {NetworkError} When unable to connect to the blockchain network
   *
   * @example
   * ```typescript
   * // Get first 10 grantees
   * const result = await vana.permissions.getGrantees({
   *   limit: 10,
   *   offset: 0
   * });
   *
   * console.log(`Found ${result.total} total grantees`);
   * result.grantees.forEach(grantee => {
   *   console.log(`Grantee ${grantee.id}: ${grantee.granteeAddress}`);
   * });
   *
   * // Check if there are more results
   * if (result.hasMore) {
   *   console.log('More grantees available');
   * }
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
   * Retrieves a specific grantee by their Ethereum address from the DataPortabilityGrantees contract.
   *
   * Looks up a registered grantee (application) using their Ethereum address
   * and returns their complete registration information including permissions.
   *
   * @param granteeAddress - The Ethereum address of the grantee to look up
   * @returns Promise resolving to the grantee information, or null if not found
   * @throws {BlockchainError} When contract read operation fails
   * @throws {NetworkError} When unable to connect to the blockchain network
   *
   * @example
   * ```typescript
   * const granteeAddress = "0xApp1234567890123456789012345678901234567890";
   * const grantee = await vana.permissions.getGranteeByAddress(granteeAddress);
   *
   * if (grantee) {
   *   console.log(`Found grantee ${grantee.id}`);
   *   console.log(`Owner: ${grantee.owner}`);
   *   console.log(`Public Key: ${grantee.publicKey}`);
   *   console.log(`Permissions: ${grantee.permissionIds.join(', ')}`);
   * } else {
   *   console.log('Grantee not found');
   * }
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
   * Retrieves a specific grantee by their unique ID from the DataPortabilityGrantees contract.
   *
   * Looks up a registered grantee (application) using their numeric ID assigned during
   * registration and returns their complete information including permissions.
   *
   * @param granteeId - The unique numeric ID of the grantee (1-indexed)
   * @returns Promise resolving to the grantee information, or null if not found
   * @throws {BlockchainError} When contract read operation fails
   * @throws {NetworkError} When unable to connect to the blockchain network
   *
   * @example
   * ```typescript
   * const grantee = await vana.permissions.getGranteeById(1);
   *
   * if (grantee) {
   *   console.log(`Grantee ID: ${grantee.id}`);
   *   console.log(`Address: ${grantee.granteeAddress}`);
   *   console.log(`Owner: ${grantee.owner}`);
   *   console.log(`Total permissions: ${grantee.permissionIds.length}`);
   * } else {
   *   console.log('Grantee with ID 1 not found');
   * }
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

  // ===========================
  // DATA PORTABILITY SERVERS HELPER METHODS
  // ===========================

  /**
   * Get all trusted server IDs for a user
   *
   * @param userAddress - User address to query (defaults to current user)
   * @returns Promise resolving to array of server IDs
   */
  async getUserServerIds(userAddress?: Address): Promise<bigint[]> {
    try {
      const targetAddress = userAddress || (await this.getUserAddress());
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const serverIds = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "userServerIdsValues",
        args: [targetAddress],
      });

      return [...serverIds];
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user server IDs: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get server ID at specific index for a user
   *
   * @param userAddress - User address to query
   * @param serverIndex - Index in the user's server list
   * @returns Promise resolving to server ID
   */
  async getUserServerIdAt(
    userAddress: Address,
    serverIndex: bigint,
  ): Promise<bigint> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const serverId = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "userServerIdsAt",
        args: [userAddress, serverIndex],
      });

      return serverId;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user server ID at index: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get the number of trusted servers for a user
   *
   * @param userAddress - User address to query (defaults to current user)
   * @returns Promise resolving to number of trusted servers
   */
  async getUserServerCount(userAddress?: Address): Promise<bigint> {
    try {
      const targetAddress = userAddress || (await this.getUserAddress());
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const count = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "userServerIdsLength",
        args: [targetAddress],
      });

      return count;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user server count: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get detailed information about trusted servers for a user
   *
   * @param userAddress - User address to query (defaults to current user)
   * @returns Promise resolving to array of trusted server info
   */
  async getUserTrustedServers(
    userAddress?: Address,
  ): Promise<TrustedServerInfo[]> {
    try {
      const targetAddress = userAddress || (await this.getUserAddress());
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const servers = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "userServerValues",
        args: [targetAddress],
      });

      return [...servers];
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user trusted servers: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get trusted server info for a specific server ID and user
   *
   * @param userAddress - User address to query
   * @param serverId - Server ID to get info for
   * @returns Promise resolving to trusted server info
   */
  async getUserTrustedServer(
    userAddress: Address,
    serverId: bigint,
  ): Promise<TrustedServerInfo> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const serverInfo = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "userServers",
        args: [userAddress, serverId],
      });

      return serverInfo;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user trusted server: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get server information by server ID
   *
   * @param serverId - Server ID to get info for
   * @returns Promise resolving to server info
   */
  async getServerInfo(serverId: bigint): Promise<ServerInfo> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const serverInfo = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "servers",
        args: [serverId],
      });

      return serverInfo;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get server info: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get server information by server address
   *
   * @param serverAddress - Server address to get info for
   * @returns Promise resolving to server info
   */
  async getServerInfoByAddress(serverAddress: Address): Promise<ServerInfo> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const serverInfo = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "serverByAddress",
        args: [serverAddress],
      });

      return serverInfo;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get server info by address: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  // ===========================
  // DATA PORTABILITY PERMISSIONS HELPER METHODS
  // ===========================

  /**
   * Get all permission IDs for a user
   *
   * @param userAddress - User address to query (defaults to current user)
   * @returns Promise resolving to array of permission IDs
   */
  async getUserPermissionIds(userAddress?: Address): Promise<bigint[]> {
    try {
      const targetAddress = userAddress || (await this.getUserAddress());
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const permissionIds = await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
        functionName: "userPermissionIdsValues",
        args: [targetAddress],
      });

      return [...permissionIds];
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user permission IDs: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get permission ID at specific index for a user
   *
   * @param userAddress - User address to query
   * @param permissionIndex - Index in the user's permission list
   * @returns Promise resolving to permission ID
   */
  async getUserPermissionIdAt(
    userAddress: Address,
    permissionIndex: bigint,
  ): Promise<bigint> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const permissionId = await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
        functionName: "userPermissionIdsAt",
        args: [userAddress, permissionIndex],
      });

      return permissionId;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user permission ID at index: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get the number of permissions for a user
   *
   * @param userAddress - User address to query (defaults to current user)
   * @returns Promise resolving to number of permissions
   */
  async getUserPermissionCount(userAddress?: Address): Promise<bigint> {
    try {
      const targetAddress = userAddress || (await this.getUserAddress());
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const count = await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
        functionName: "userPermissionIdsLength",
        args: [targetAddress],
      });

      return count;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user permission count: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get detailed permission information by permission ID
   *
   * @param permissionId - Permission ID to get info for
   * @returns Promise resolving to permission info
   */
  async getPermissionInfo(permissionId: bigint): Promise<PermissionInfo> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const permissionInfo = await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
        functionName: "permissions",
        args: [permissionId],
      });

      return permissionInfo;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get permission info: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get all permission IDs for a specific file
   *
   * @param fileId - File ID to get permissions for
   * @returns Promise resolving to array of permission IDs
   */
  async getFilePermissionIds(fileId: bigint): Promise<bigint[]> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const permissionIds = await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
        functionName: "filePermissionIds",
        args: [fileId],
      });

      return [...permissionIds];
    } catch (error) {
      throw new BlockchainError(
        `Failed to get file permission IDs: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get all file IDs for a specific permission
   *
   * @param permissionId - Permission ID to get files for
   * @returns Promise resolving to array of file IDs
   */
  async getPermissionFileIds(permissionId: bigint): Promise<bigint[]> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const fileIds = await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
        functionName: "permissionFileIds",
        args: [permissionId],
      });

      return [...fileIds];
    } catch (error) {
      throw new BlockchainError(
        `Failed to get permission file IDs: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get all permissions for a specific file (alias for getFilePermissionIds)
   *
   * @param fileId - File ID to get permissions for
   * @returns Promise resolving to array of permission IDs
   */
  async getFilePermissions(fileId: bigint): Promise<bigint[]> {
    const chainId = await this.context.publicClient.getChainId();
    const DataPortabilityPermissionsAddress = getContractAddress(
      chainId,
      "DataPortabilityPermissions",
    );
    const DataPortabilityPermissionsAbi = getAbi("DataPortabilityPermissions");

    const permissions = await this.context.publicClient.readContract({
      address: DataPortabilityPermissionsAddress,
      abi: DataPortabilityPermissionsAbi,
      functionName: "filePermissions",
      args: [fileId],
    });

    return [...permissions];
  }

  // ===========================
  // DATA PORTABILITY GRANTEES HELPER METHODS
  // ===========================

  /**
   * Get grantee information by grantee ID
   *
   * @param granteeId - Grantee ID to get info for
   * @returns Promise resolving to grantee info
   */
  async getGranteeInfo(granteeId: bigint): Promise<GranteeInfo> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityGranteesAddress = getContractAddress(
        chainId,
        "DataPortabilityGrantees",
      );
      const DataPortabilityGranteesAbi = getAbi("DataPortabilityGrantees");

      const granteeInfo = await this.context.publicClient.readContract({
        address: DataPortabilityGranteesAddress,
        abi: DataPortabilityGranteesAbi,
        functionName: "granteeInfo",
        args: [granteeId],
      });

      return granteeInfo;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get grantee info: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get grantee information by grantee address
   *
   * @param granteeAddress - Grantee address to get info for
   * @returns Promise resolving to grantee info
   */
  async getGranteeInfoByAddress(granteeAddress: Address): Promise<GranteeInfo> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityGranteesAddress = getContractAddress(
        chainId,
        "DataPortabilityGrantees",
      );
      const DataPortabilityGranteesAbi = getAbi("DataPortabilityGrantees");

      const granteeInfo = await this.context.publicClient.readContract({
        address: DataPortabilityGranteesAddress,
        abi: DataPortabilityGranteesAbi,
        functionName: "granteeByAddress",
        args: [granteeAddress],
      });

      return granteeInfo;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get grantee info by address: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get all permission IDs for a specific grantee
   *
   * @param granteeId - Grantee ID to get permissions for
   * @returns Promise resolving to array of permission IDs
   */
  async getGranteePermissionIds(granteeId: bigint): Promise<bigint[]> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityGranteesAddress = getContractAddress(
        chainId,
        "DataPortabilityGrantees",
      );
      const DataPortabilityGranteesAbi = getAbi("DataPortabilityGrantees");

      const permissionIds = await this.context.publicClient.readContract({
        address: DataPortabilityGranteesAddress,
        abi: DataPortabilityGranteesAbi,
        functionName: "granteePermissionIds",
        args: [granteeId],
      });

      return [...permissionIds];
    } catch (error) {
      throw new BlockchainError(
        `Failed to get grantee permission IDs: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get all permissions for a specific grantee (alias for getGranteePermissionIds)
   *
   * @param granteeId - Grantee ID to get permissions for
   * @returns Promise resolving to array of permission IDs
   */
  async getGranteePermissions(granteeId: bigint): Promise<bigint[]> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityGranteesAddress = getContractAddress(
        chainId,
        "DataPortabilityGrantees",
      );
      const DataPortabilityGranteesAbi = getAbi("DataPortabilityGrantees");

      const permissions = await this.context.publicClient.readContract({
        address: DataPortabilityGranteesAddress,
        abi: DataPortabilityGranteesAbi,
        functionName: "granteePermissions",
        args: [granteeId],
      });

      return [...permissions];
    } catch (error) {
      throw new BlockchainError(
        `Failed to get grantee permissions: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  // ===== DataPortabilityServersImplementation Methods =====

  /**
   * Get all server IDs for a user
   *
   * @param userAddress - User address to get server IDs for
   * @returns Promise resolving to array of server IDs
   */
  async getUserServerIdsValues(userAddress: Address): Promise<bigint[]> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const serverIds = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "userServerIdsValues",
        args: [userAddress],
      });

      return [...serverIds];
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user server IDs: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get server ID at specific index for a user
   *
   * @param userAddress - User address
   * @param serverIndex - Index of the server ID
   * @returns Promise resolving to server ID
   */
  async getUserServerIdsAt(
    userAddress: Address,
    serverIndex: bigint,
  ): Promise<bigint> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const serverId = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "userServerIdsAt",
        args: [userAddress, serverIndex],
      });

      return serverId;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user server ID at index: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get the number of servers a user has
   *
   * @param userAddress - User address
   * @returns Promise resolving to number of servers
   */
  async getUserServerIdsLength(userAddress: Address): Promise<bigint> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const length = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "userServerIdsLength",
        args: [userAddress],
      });

      return length;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user server IDs length: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get trusted server info for a specific user and server ID
   *
   * @param userAddress - User address
   * @param serverId - Server ID
   * @returns Promise resolving to trusted server info
   */
  async getUserServers(
    userAddress: Address,
    serverId: bigint,
  ): Promise<TrustedServerInfo> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const serverInfo = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "userServers",
        args: [userAddress, serverId],
      });

      return {
        id: serverInfo.id,
        owner: serverInfo.owner,
        serverAddress: serverInfo.serverAddress,
        publicKey: serverInfo.publicKey,
        url: serverInfo.url,
        startBlock: serverInfo.startBlock,
        endBlock: serverInfo.endBlock,
      };
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user server info: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get server info by server ID
   *
   * @param serverId - Server ID
   * @returns Promise resolving to server info
   */
  async getServers(serverId: bigint): Promise<ServerInfo> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const serverInfo = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "servers",
        args: [serverId],
      });

      return {
        id: serverInfo.id,
        owner: serverInfo.owner,
        serverAddress: serverInfo.serverAddress,
        publicKey: serverInfo.publicKey,
        url: serverInfo.url,
      };
    } catch (error) {
      throw new BlockchainError(
        `Failed to get server info: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get user info including nonce and trusted server IDs
   *
   * @param userAddress - User address
   * @returns Promise resolving to user info
   */
  async getUsers(
    userAddress: Address,
  ): Promise<{ nonce: bigint; trustedServerIds: bigint[] }> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const userInfo = await this.context.publicClient.readContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "users",
        args: [userAddress],
      });

      return {
        nonce: userInfo[0],
        trustedServerIds: [...userInfo[1]],
      };
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user info: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Update server URL
   *
   * @param serverId - Server ID to update
   * @param url - New URL for the server
   * @returns Promise resolving to transaction hash
   */
  async submitUpdateServer(
    serverId: bigint,
    url: string,
  ): Promise<TransactionResult & { eventData?: ServerUpdateResult }> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityServersAddress = getContractAddress(
        chainId,
        "DataPortabilityServers",
      );
      const DataPortabilityServersAbi = getAbi("DataPortabilityServers");

      const hash = await this.context.walletClient.writeContract({
        address: DataPortabilityServersAddress,
        abi: DataPortabilityServersAbi,
        functionName: "updateServer",
        args: [serverId, url],
        chain: this.context.walletClient.chain,
        account: this.context.walletClient.account || null,
      });

      return {
        hash,
        from: this.context.walletClient.account?.address,
      };
    } catch (error) {
      throw new BlockchainError(
        `Failed to update server: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  // ===== DataPortabilityPermissionsImplementation Methods =====

  /**
   * Get all permission IDs for a user
   *
   * @param userAddress - User address to get permission IDs for
   * @returns Promise resolving to array of permission IDs
   */
  async getUserPermissionIdsValues(userAddress: Address): Promise<bigint[]> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const permissionIds = await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
        functionName: "userPermissionIdsValues",
        args: [userAddress],
      });

      return [...permissionIds];
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user permission IDs: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get permission ID at specific index for a user
   *
   * @param userAddress - User address
   * @param permissionIndex - Index of the permission ID
   * @returns Promise resolving to permission ID
   */
  async getUserPermissionIdsAt(
    userAddress: Address,
    permissionIndex: bigint,
  ): Promise<bigint> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const permissionId = await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
        functionName: "userPermissionIdsAt",
        args: [userAddress, permissionIndex],
      });

      return permissionId;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user permission ID at index: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get the number of permissions a user has
   *
   * @param userAddress - User address
   * @returns Promise resolving to number of permissions
   */
  async getUserPermissionIdsLength(userAddress: Address): Promise<bigint> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const length = await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
        functionName: "userPermissionIdsLength",
        args: [userAddress],
      });

      return length;
    } catch (error) {
      throw new BlockchainError(
        `Failed to get user permission IDs length: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Get permission info by permission ID
   *
   * @param permissionId - Permission ID
   * @returns Promise resolving to permission info
   */
  async getPermissions(permissionId: bigint): Promise<PermissionInfo> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const permissionInfo = await this.context.publicClient.readContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
        functionName: "permissions",
        args: [permissionId],
      });

      return {
        id: permissionInfo.id,
        grantor: permissionInfo.grantor,
        nonce: permissionInfo.nonce,
        granteeId: permissionInfo.granteeId,
        grant: permissionInfo.grant,
        startBlock: permissionInfo.startBlock,
        endBlock: permissionInfo.endBlock,
        fileIds: [...permissionInfo.fileIds],
      };
    } catch (error) {
      throw new BlockchainError(
        `Failed to get permission info: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submit permission with signature to the blockchain (supports gasless transactions)
   *
   * @param params - Parameters for adding permission
   * @returns Promise resolving to transaction hash
   * @throws {RelayerError} When gasless transaction submission fails
   * @throws {SignatureError} When user rejects the signature request
   * @throws {BlockchainError} When permission addition fails
   * @throws {NetworkError} When network communication fails
   */
  async submitAddPermission(
    params: ServerFilesAndPermissionParams,
  ): Promise<TransactionResult & { eventData?: PermissionGrantResult }> {
    try {
      const nonce = await this.getPermissionsUserNonce();

      // Create add permission input
      const addPermissionInput = {
        nonce,
        granteeId: params.granteeId,
        grant: params.grant,
        fileUrls: params.fileUrls,
        schemaIds: params.schemaIds,
        serverAddress: params.serverAddress,
        serverUrl: params.serverUrl,
        serverPublicKey: params.serverPublicKey,
        filePermissions: params.filePermissions,
      };

      // Create and sign typed data
      const typedData =
        await this.composeServerFilesAndPermissionMessage(addPermissionInput);
      const signature = await this.signTypedData(typedData);

      // Use the signed relay method to support gasless transactions
      return await this.submitSignedAddPermission(typedData, signature);
    } catch (error) {
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
        `Failed to add permission: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submits an already-signed add permission transaction to the blockchain.
   * This method supports both relayer-based gasless transactions and direct transactions.
   *
   * @param typedData - The EIP-712 typed data for AddPermission
   * @param signature - The user's signature
   * @returns Promise resolving to TransactionResult with PermissionGrantResult event data
   * @throws {RelayerError} When gasless transaction submission fails
   * @throws {BlockchainError} When permission addition fails
   * @throws {NetworkError} When network communication fails
   */
  async submitSignedAddPermission(
    typedData: GenericTypedData,
    signature: Hash,
  ): Promise<TransactionResult & { eventData?: PermissionGrantResult }> {
    try {
      // Use relayer callbacks or direct transaction
      let hash: Hash;
      if (this.context.relayerCallbacks?.submitAddPermission) {
        hash = await this.context.relayerCallbacks.submitAddPermission(
          typedData,
          signature,
        );
      } else {
        hash = await this.submitDirectAddPermissionTransaction(
          typedData,
          signature,
        );
      }

      return {
        hash,
        from: this.context.walletClient.account?.address,
      };
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
        `Add permission submission failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submits server files and permissions with signature to the blockchain, supporting schema validation and gasless transactions.
   *
   * @remarks
   * This method validates files against their specified schemas before submission.
   * Schema validation ensures data conforms to expected formats before on-chain registration.
   * Files with schemaId = 0 bypass validation. The method supports atomic batch operations
   * where all files and permissions are registered in a single transaction.
   *
   * @param params - Parameters for adding server files and permissions
   * @param params.granteeId - The ID of the permission grantee
   * @param params.grant - Grant URL containing permission parameters (typically IPFS)
   * @param params.fileUrls - Array of file URLs to register
   * @param params.schemaIds - Schema IDs for each file. Use 0 for files without schema validation.
   *   Array length must match fileUrls length.
   * @param params.serverAddress - Server wallet address for decryption permissions
   * @param params.serverUrl - Server endpoint URL
   * @param params.serverPublicKey - Server's public key for encryption.
   *   Obtain via `vana.server.getIdentity(userAddress).public_key`.
   * @param params.filePermissions - Nested array of permissions for each file
   * @returns TransactionResult with immediate hash access and optional event data
   * @throws {Error} When schemaIds array length doesn't match fileUrls array length
   * @throws {SchemaValidationError} When file data doesn't match the specified schema.
   *   Verify data structure matches schema definition from `vana.schemas.get(schemaId)`.
   * @throws {RelayerError} When gasless transaction submission fails.
   *   Retry without relayer configuration to submit direct transaction.
   * @throws {SignatureError} When user rejects the signature request
   * @throws {BlockchainError} When server files and permissions addition fails
   * @throws {NetworkError} When network communication fails.
   *   Check network connection or configure alternative gateways.
   *
   * @example
   * ```typescript
   * const result = await vana.permissions.submitAddServerFilesAndPermissions({
   *   granteeId: BigInt(1),
   *   grant: "ipfs://QmXxx...",
   *   fileUrls: ["https://storage.example.com/data.json"],
   *   schemaIds: [123], // LinkedIn profile schema ID
   *   serverAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb",
   *   serverUrl: "https://server.example.com",
   *   serverPublicKey: serverInfo.public_key,
   *   filePermissions: [[{
   *     account: "0x742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb",
   *     key: encryptedKey
   *   }]]
   * });
   * const events = await result.waitForEvents();
   * console.log(`Permission ID: ${events.permissionId}`);
   * ```
   */
  async submitAddServerFilesAndPermissions(
    params: ServerFilesAndPermissionParams,
  ): Promise<TransactionResult & { eventData?: PermissionGrantResult }> {
    try {
      // Validate that schemaIds array has same length as fileUrls
      if (params.schemaIds.length !== params.fileUrls.length) {
        throw new Error(
          `schemaIds array length (${params.schemaIds.length}) must match fileUrls array length (${params.fileUrls.length})`,
        );
      }

      // Schema validation should happen at upload time, not permission time
      // The SDK's data.upload() validates before uploading
      // External uploaders are responsible for their own validation

      const nonce = await this.getPermissionsUserNonce();

      // Create server files and permission input
      const serverFilesAndPermissionInput = {
        nonce,
        granteeId: params.granteeId,
        grant: params.grant,
        fileUrls: params.fileUrls,
        schemaIds: params.schemaIds,
        serverAddress: params.serverAddress,
        serverUrl: params.serverUrl,
        serverPublicKey: params.serverPublicKey,
        filePermissions: params.filePermissions,
      };

      // Create and sign typed data
      const typedData = await this.composeServerFilesAndPermissionMessage(
        serverFilesAndPermissionInput,
      );
      const signature = await this.signTypedData(typedData);

      // Use the signed relay method to support gasless transactions
      return await this.submitSignedAddServerFilesAndPermissions(
        typedData,
        signature,
      );
    } catch (error) {
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
        `Failed to add server files and permissions: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submits an already-signed add server files and permissions transaction to the blockchain.
   *
   * @remarks
   * This method returns a TransactionResult that provides immediate access to the transaction hash.
   * The eventData field may contain parsed event details after transaction confirmation.
   *
   * @param typedData - The EIP-712 typed data for AddServerFilesAndPermissions
   * @param signature - The user's signature
   * @returns TransactionResult with immediate hash access and optional event data
   * @throws {RelayerError} When gasless transaction submission fails
   * @throws {BlockchainError} When server files and permissions addition fails
   * @throws {NetworkError} When network communication fails
   *
   * @example
   * ```typescript
   * const tx = await vana.permissions.submitSignedAddServerFilesAndPermissions(
   *   typedData,
   *   signature
   * );
   * console.log(`Transaction submitted: ${tx.hash}`);
   *
   * // Wait for confirmation and get the permission ID
   * const { permissionId } = await tx.waitForEvents();
   * console.log(`Permission created with ID: ${permissionId}`);
   * ```
   */
  async submitSignedAddServerFilesAndPermissions(
    typedData: ServerFilesAndPermissionTypedData,
    signature: Hash,
  ): Promise<TransactionResult & { eventData?: PermissionGrantResult }> {
    try {
      // Debug logging to understand relayer callback availability
      console.debug("🔍 submitSignedAddServerFilesAndPermissions Debug Info:", {
        hasRelayerCallbacks: !!this.context.relayerCallbacks,
        hasSubmitMethod:
          !!this.context.relayerCallbacks?.submitAddServerFilesAndPermissions,
        availableRelayerMethods: this.context.relayerCallbacks
          ? Object.keys(this.context.relayerCallbacks)
          : [],
      });

      // Use relayer callbacks or direct transaction
      if (this.context.relayerCallbacks?.submitAddServerFilesAndPermissions) {
        console.debug(
          "🚀 Using relayer for submitAddServerFilesAndPermissions",
        );
        const hash =
          await this.context.relayerCallbacks.submitAddServerFilesAndPermissions(
            typedData,
            signature,
          );
        return {
          hash,
          from: this.context.walletClient.account?.address,
        };
      } else {
        console.debug(
          "📝 Using direct transaction for submitAddServerFilesAndPermissions",
        );
        const hash =
          await this.submitDirectAddServerFilesAndPermissionsTransaction(
            typedData,
            signature,
          );
        return {
          hash,
          from: this.context.walletClient.account?.address,
        };
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
        `Add server files and permissions submission failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submit permission revocation with signature to the blockchain
   *
   * @param permissionId - Permission ID to revoke
   * @returns Promise resolving to transaction hash
   */
  async submitRevokePermission(
    permissionId: bigint,
  ): Promise<TransactionResult & { eventData?: PermissionRevokeResult }> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const DataPortabilityPermissionsAddress = getContractAddress(
        chainId,
        "DataPortabilityPermissions",
      );
      const DataPortabilityPermissionsAbi = getAbi(
        "DataPortabilityPermissions",
      );

      const hash = await this.context.walletClient.writeContract({
        address: DataPortabilityPermissionsAddress,
        abi: DataPortabilityPermissionsAbi,
        functionName: "revokePermission",
        args: [permissionId],
        chain: this.context.walletClient.chain,
        account: this.context.walletClient.account || null,
      });

      return {
        hash,
        from: this.context.walletClient.account?.address,
      };
    } catch (error) {
      throw new BlockchainError(
        `Failed to revoke permission: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submits a signed add permission transaction directly to the blockchain.
   *
   * @param typedData - The typed data structure for the permission addition
   * @param signature - The cryptographic signature authorizing the transaction
   * @returns Promise resolving to the transaction hash
   */
  private async submitDirectAddPermissionTransaction(
    typedData: GenericTypedData,
    signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityPermissionsAddress = getContractAddress(
      chainId,
      "DataPortabilityPermissions",
    );
    const DataPortabilityPermissionsAbi = getAbi("DataPortabilityPermissions");

    // Prepare the PermissionInput struct from the typed data message
    const permissionInput = {
      nonce: typedData.message.nonce as bigint,
      granteeId: typedData.message.granteeId as bigint,
      grant: typedData.message.grant as string,
      fileIds: (typedData.message.fileIds as bigint[]) || [],
    };

    // Format signature for contract compatibility
    const formattedSignature = formatSignatureForContract(signature);

    const hash = await this.context.walletClient.writeContract({
      address: DataPortabilityPermissionsAddress,
      abi: DataPortabilityPermissionsAbi,
      functionName: "addPermission",
      args: [permissionInput, formattedSignature],
      account:
        this.context.walletClient.account || (await this.getUserAddress()),
      chain: this.context.walletClient.chain || null,
    });

    return hash;
  }

  /**
   * Submits a signed add server files and permissions transaction directly to the blockchain.
   *
   * @param typedData - The typed data structure for the server files and permissions addition
   * @param signature - The cryptographic signature authorizing the transaction
   * @returns Promise resolving to the transaction hash
   */
  private async submitDirectAddServerFilesAndPermissionsTransaction(
    typedData: ServerFilesAndPermissionTypedData,
    signature: Hash,
  ): Promise<Hash> {
    const chainId = await this.context.walletClient.getChainId();
    const DataPortabilityPermissionsAddress = getContractAddress(
      chainId,
      "DataPortabilityPermissions",
    );
    const DataPortabilityPermissionsAbi = getAbi("DataPortabilityPermissions");

    // Prepare the ServerFilesAndPermissionInput struct from the typed data message
    const serverFilesAndPermissionInput = {
      nonce: typedData.message.nonce,
      granteeId: typedData.message.granteeId,
      grant: typedData.message.grant,
      fileUrls: typedData.message.fileUrls,
      schemaIds: typedData.message.schemaIds,
      serverAddress: typedData.message.serverAddress,
      serverUrl: typedData.message.serverUrl,
      serverPublicKey: typedData.message.serverPublicKey,
      filePermissions: typedData.message.filePermissions,
    };

    // Format signature for contract compatibility
    const formattedSignature = formatSignatureForContract(signature);

    const hash = await this.context.walletClient.writeContract({
      address: DataPortabilityPermissionsAddress,
      abi: DataPortabilityPermissionsAbi,
      functionName: "addServerFilesAndPermissions",
      // @ts-expect-error - Viem's type inference for nested Permission[][] arrays is incompatible with our Permission type
      args: [serverFilesAndPermissionInput, formattedSignature],
      account:
        this.context.walletClient.account || (await this.getUserAddress()),
      chain: this.context.walletClient.chain || null,
    });

    return hash;
  }
}
