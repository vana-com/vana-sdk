/**
 * Shared type definitions for controller contexts.
 *
 * @remarks
 * These types ensure consistency across all controllers and prevent drift.
 * Single source of truth following Rich Hickey's principles.
 */

import type { WalletClient, PublicClient, Address } from "viem";
import type { VanaPlatformAdapter } from "../platform/interface";
import type { StorageManager } from "../storage";
import type { DownloadRelayerCallbacks } from "./config";
import type { UnifiedRelayerRequest, UnifiedRelayerResponse } from "./relayer";
import type {
  TransactionResult,
  TransactionWaitOptions,
  Operation,
  PollingOptions,
} from "./operations";
import type { IOperationStore, IRelayerStateStore } from "./operationStore";
import type {
  Contract,
  Fn,
  TypedTransactionResult,
} from "../generated/event-types";

/**
 * Type definition for waitForTransactionEvents function.
 *
 * @remarks
 * This is THE single definition used everywhere to prevent drift.
 * If you need to change the signature, change it here.
 */
export type WaitForTransactionEventsFn = <C extends Contract, F extends Fn<C>>(
  transaction: TransactionResult<C, F>,
  options?: TransactionWaitOptions,
) => Promise<TypedTransactionResult<C, F>>;

/**
 * Type definition for waitForOperation function.
 */
export type WaitForOperationFn = (
  opOrId: Operation | string,
  options?: PollingOptions,
) => Promise<Operation>;

/**
 * Shared controller context interface.
 *
 * @remarks
 * This is the contract that all controllers depend on.
 * Changing this interface is a breaking change.
 */
export interface ControllerContext {
  /** Signs transactions and messages using the user's private key. Optional to support read-only mode. */
  walletClient?: WalletClient;
  /** Queries blockchain state and smart contracts without signing. */
  publicClient: PublicClient;
  /** Address of the user for operations requiring user identification in read-only mode. */
  userAddress: Address;
  /** Signs application-specific operations when different from primary wallet. */
  applicationClient?: WalletClient;
  /** Handles gasless transaction submission through relayer services. */
  relayer?: (request: UnifiedRelayerRequest) => Promise<UnifiedRelayerResponse>;
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
  waitForTransactionEvents?: WaitForTransactionEventsFn;
  /** Waits for an operation to complete with polling. */
  waitForOperation?: WaitForOperationFn;
  /** Tracks async relayed transactions for resilient management. */
  operationStore?: IOperationStore | IRelayerStateStore;
}

/**
 * Minimal SDK interface for enhanced response handling.
 *
 * @remarks
 * This interface defines the minimal SDK surface that EnhancedTransactionResponse needs
 * to avoid circular dependencies while maintaining type safety. It represents a subset
 * of the full SDK functionality.
 *
 * @category Client
 */
export interface EnhancedResponseSDK {
  /** Public client for blockchain queries. */
  publicClient: PublicClient;
  /** Waits for transaction confirmation and parses typed events. */
  waitForTransactionEvents: WaitForTransactionEventsFn;
  /** Relayer callback for polling pending operations. */
  relayer?: (request: UnifiedRelayerRequest) => Promise<UnifiedRelayerResponse>;
}

/**
 * SDK interface for accessing controllers with their context.
 *
 * @remarks
 * This interface defines the minimal SDK surface needed by server-side relayer handlers
 * to access controller contexts. It provides type-safe access to controllers without
 * requiring the full SDK interface, avoiding unsafe type assertions.
 *
 * Note: The context property is protected on the actual DataController, so we use
 * this interface as a type bridge to safely access it in server-side contexts where
 * we know the SDK instance has been properly initialized with storage.
 *
 * @category Server
 */
export interface RelayerHandlerSDK {
  /** Data controller for file operations and storage access. */
  readonly data: {
    /** Controller context containing storage and client configuration. Protected in actual class but exposed via type bridge. */
    readonly context: ControllerContext;
  };
}
