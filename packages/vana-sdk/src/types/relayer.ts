/**
 * Defines types for gasless transaction relayers and server operations.
 *
 * @remarks
 * This module provides comprehensive type definitions for interacting with
 * relayer services that enable gasless transactions and auxiliary operations.
 * It includes both legacy v1 types and the simplified v2 unified interface.
 *
 * @category Types
 * @module types/relayer
 */

import type { Hash, Address, TransactionReceipt } from "viem";
import type {
  GrantFile,
  PermissionGrantTypedData,
  GenericTypedData,
} from "./permissions";

/**
 * Represents the response from storing grant files via relayer.
 *
 * @remarks
 * Contains storage location, metadata, and error information for
 * grant file upload operations.
 *
 * @category Advanced
 */
export interface RelayerStorageResponse {
  /** The IPFS URL where the grant file is stored */
  grantUrl: string;
  /** Success status */
  success: boolean;
  /** Optional error message */
  error?: string;
  /** Storage metadata */
  metadata?: {
    /** IPFS hash */
    ipfsHash: string;
    /** File size in bytes */
    size: number;
    /** Upload timestamp */
    timestamp: number;
  };
}

/**
 * Represents the response from submitting transactions via relayer.
 *
 * @remarks
 * Contains transaction hash, status, and metadata for gasless
 * transaction submissions.
 *
 * @category Advanced
 */
export interface RelayerTransactionResponse {
  /** The transaction hash of the submitted transaction */
  transactionHash: Hash;
  /** Success status */
  success: boolean;
  /** Optional error message */
  error?: string;
  /** Transaction metadata */
  metadata?: {
    /** Gas used */
    gasUsed?: bigint;
    /** Gas price */
    gasPrice?: bigint;
    /** Block number */
    blockNumber?: bigint;
    /** Transaction status */
    status?: "pending" | "confirmed" | "failed";
  };
}

/**
 * Specifies parameters for storing grant files via relayer.
 *
 * @remarks
 * Includes the grant file and optional storage configuration
 * such as encryption and pinning duration.
 *
 * @category Advanced
 */
export interface RelayerStoreParams {
  /** The grant file to store */
  grantFile: GrantFile;
  /** Optional storage options */
  options?: {
    /** IPFS pin duration in seconds */
    pinDuration?: number;
    /** Whether to use encryption */
    encrypt?: boolean;
    /** Custom metadata */
    metadata?: Record<string, unknown>;
  };
}

/**
 * Specifies parameters for submitting gasless transactions.
 *
 * @remarks
 * Contains signed typed data and transaction configuration options
 * for relayer submission.
 *
 * @category Advanced
 */
export interface RelayerSubmitParams {
  /** The signed typed data */
  typedData: PermissionGrantTypedData;
  /** The signature */
  signature: string;
  /** Optional transaction options */
  options?: {
    /** Gas limit */
    gasLimit?: bigint;
    /** Priority level */
    priority?: "low" | "medium" | "high";
    /** Whether to wait for confirmation */
    waitForConfirmation?: boolean;
  };
}

/**
 * Represents the current status and capabilities of a relayer service.
 *
 * @remarks
 * Provides information about supported chains, rate limits, and
 * current operational status for monitoring and decision-making.
 *
 * @category Advanced
 */
export interface RelayerStatus {
  /** Whether the relayer is online */
  online: boolean;
  /** Service version */
  version: string;
  /** Supported chains */
  supportedChains: number[];
  /** Current chain status */
  chainStatus: Record<
    number,
    {
      /** Whether the chain is supported */
      supported: boolean;
      /** Current block number */
      currentBlock: bigint;
      /** Gas price estimation */
      gasPrice: bigint;
      /** Queue size */
      queueSize: number;
    }
  >;
  /** Rate limit information */
  rateLimits: {
    /** Requests per minute */
    requestsPerMinute: number;
    /** Storage requests per hour */
    storageRequestsPerHour: number;
    /** Transaction requests per hour */
    transactionRequestsPerHour: number;
  };
}

/**
 * Configures behavior for relayer requests.
 *
 * @remarks
 * Controls timeout, retry logic, headers, and priority for
 * relayer operation requests.
 *
 * @category Advanced
 */
export interface RelayerRequestOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Whether to retry on failure */
  retry?: boolean;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Request priority */
  priority?: "low" | "medium" | "high";
}

/**
 * Represents an error response from the relayer service.
 *
 * @remarks
 * Provides structured error information including codes, messages,
 * and debugging details for error handling and recovery.
 *
 * @category Advanced
 */
export interface RelayerErrorResponse {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Request ID for debugging */
  requestId?: string;
  /** Timestamp of error */
  timestamp: number;
}

/**
 * Provides information about the relayer's processing queue.
 *
 * @remarks
 * Includes queue size, position, estimated processing time, and
 * performance statistics for queue monitoring.
 *
 * @category Advanced
 */
export interface RelayerQueueInfo {
  /** Current queue size */
  size: number;
  /** Estimated processing time in seconds */
  estimatedProcessingTime: number;
  /** Queue position for a specific request */
  position?: number;
  /** Processing statistics */
  stats: {
    /** Average processing time in seconds */
    averageProcessingTime: number;
    /** Requests processed in last hour */
    requestsProcessedHour: number;
    /** Success rate percentage */
    successRate: number;
  };
}

/**
 * Tracks the status of a transaction submitted via relayer.
 *
 * @remarks
 * Provides detailed tracking information including confirmation status,
 * gas usage, and historical status checks.
 *
 * @category Advanced
 */
export interface RelayerTransactionStatus {
  /** Transaction hash */
  transactionHash: Hash;
  /** Current status */
  status: "pending" | "confirmed" | "failed";
  /** Block number if confirmed */
  blockNumber?: bigint;
  /** Gas used */
  gasUsed?: bigint;
  /** Error message if failed */
  error?: string;
  /** Status checks performed */
  checks: Array<{
    /** Check timestamp */
    timestamp: number;
    /** Status at time of check */
    status: string;
    /** Block number at time of check */
    blockNumber: bigint;
  }>;
}

/**
 * Provides performance metrics for the relayer service.
 *
 * @remarks
 * Includes transaction statistics, success rates, processing times,
 * and uptime information for monitoring and optimization.
 *
 * @category Advanced
 */
export interface RelayerMetrics {
  /** Total transactions processed */
  totalTransactions: number;
  /** Successful transactions */
  successfulTransactions: number;
  /** Failed transactions */
  failedTransactions: number;
  /** Average processing time in seconds */
  averageProcessingTime: number;
  /** Current queue size */
  queueSize: number;
  /** Uptime percentage */
  uptime: number;
  /** Last 24 hour statistics */
  last24Hours: {
    /** Transactions processed */
    transactions: number;
    /** Success rate */
    successRate: number;
    /** Average response time */
    averageResponseTime: number;
  };
}

/**
 * Configures webhook notifications for relayer events.
 *
 * @remarks
 * Enables asynchronous notifications for transaction confirmations,
 * failures, and storage completions.
 *
 * @category Advanced
 */
export interface RelayerWebhookConfig {
  /** Webhook URL */
  url: string;
  /** Events to subscribe to */
  events: Array<
    "transaction_confirmed" | "transaction_failed" | "storage_complete"
  >;
  /** Webhook secret for signature verification */
  secret?: string;
  /** Whether webhook is active */
  active: boolean;
}

/**
 * Represents a webhook event payload from the relayer.
 *
 * @remarks
 * Contains event data, timestamp, and signature for verification
 * of webhook authenticity.
 *
 * @category Advanced
 */
export interface RelayerWebhookPayload {
  /** Event type */
  event: string;
  /** Event data */
  data: Record<string, unknown>;
  /** Timestamp */
  timestamp: number;
  /** Webhook ID */
  webhookId: string;
  /** Signature for verification */
  signature: string;
}

// ===== NEW SIMPLIFIED RELAYER TYPES (v2) =====

/**
 * Handles both EIP-712 signed operations and direct server operations through a single interface.
 *
 * @remarks
 * This discriminated union provides type safety through TypeScript's narrowing.
 * The `type` field determines which operation variant is being used.
 * Signed operations require blockchain transactions, while direct operations
 * handle auxiliary tasks like file storage.
 *
 * @category Relayer
 * @see {@link https://docs.vana.org/docs/gasless-transactions | Gasless Transactions Guide}
 */
export type UnifiedRelayerRequest =
  | SignedRelayerRequest
  | DirectRelayerRequest
  | {
      type: "status_check";
      operationId: string;
    };

/**
 * Represents an EIP-712 signed operation for gasless transaction submission.
 *
 * @remarks
 * Signed requests contain typed data and signatures that are verified
 * on-chain by smart contracts. The relayer pays gas fees on behalf of users.
 *
 * @category Relayer
 */
export interface SignedRelayerRequest {
  /** Discriminator field identifying this as a signed operation */
  type: "signed";
  /** Operation identifier for routing (e.g., 'submitAddPermission') */
  operation: SignedOperationType;
  /** EIP-712 typed data structure for the operation */
  typedData: GenericTypedData;
  /** User's signature of the typed data */
  signature: Hash;
  /** Optional address for additional signer verification */
  expectedUserAddress?: Address;
}

/**
 * Enumerates supported EIP-712 signed operation types.
 *
 * @remarks
 * Each operation type corresponds to a specific smart contract
 * function that accepts gasless transactions.
 *
 * @category Relayer
 */
export type SignedOperationType =
  | "submitAddPermission"
  | "submitPermissionRevoke"
  | "submitTrustServer"
  | "submitAddAndTrustServer"
  | "submitUntrustServer"
  | "submitAddServerFilesAndPermissions"
  | "submitRegisterGrantee";

/**
 * Represents direct server operations that don't require blockchain signatures.
 *
 * @remarks
 * Direct requests handle auxiliary operations like file uploads and grant storage.
 * These operations may still result in blockchain transactions but don't require
 * user signatures for gasless submission.
 *
 * @category Relayer
 */
export type DirectRelayerRequest =
  | {
      type: "direct";
      operation: "submitFileAddition";
      params: {
        url: string;
        userAddress: Address;
      };
    }
  | {
      type: "direct";
      operation: "submitFileAdditionWithPermissions";
      params: {
        url: string;
        userAddress: Address;
        permissions: Array<{ account: Address; key: string }>;
      };
    }
  | {
      type: "direct";
      operation: "submitFileAdditionComplete";
      params: {
        url: string;
        userAddress: Address;
        permissions: Array<{ account: Address; key: string }>;
        schemaId: number;
        ownerAddress?: Address;
      };
    }
  | {
      type: "direct";
      operation: "storeGrantFile";
      params: GrantFile;
    };

/**
 * Provides type-safe responses for all relayer operations.
 *
 * @remarks
 * The discriminated union ensures proper error handling and result typing.
 * Check the `type` field to determine success or failure before accessing results.
 * The new async pattern returns pending operations with operationIds for polling.
 *
 * @category Relayer
 */
export type UnifiedRelayerResponse =
  | {
      type: "pending";
      operationId: string;
    }
  | {
      type: "submitted";
      hash: Hash;
    }
  | {
      type: "confirmed";
      hash: Hash;
      // Receipt is optional; a performance hint for the client SDK's polling logic.
      receipt?: TransactionReceipt;
    }
  | {
      type: "signed";
      hash: Hash;
    }
  | {
      /** Non-transactional operations that complete immediately (e.g., IPFS uploads, file info) */
      type: "direct";
      /** The result data from the operation, structure depends on the specific operation */
      result: unknown;
    }
  | {
      type: "error";
      error: string;
    };

/**
 * Simplified relayer configuration.
 * Can be a URL string for convenience, or a callback for full control.
 *
 * @category Configuration
 * @example
 * ```typescript
 * // Option 1: Simple URL (SDK handles the transport)
 * const vana = Vana({
 *   walletClient,
 *   relayer: '/api/relay'
 * });
 *
 * // Option 2: Full control with callback
 * const vana = Vana({
 *   walletClient,
 *   relayer: async (request) => {
 *     const response = await fetch('/api/relay', {
 *       method: 'POST',
 *       body: JSON.stringify(request)
 *     });
 *     return response.json();
 *   }
 * });
 * ```
 */
export type RelayerConfig =
  | string
  | ((request: UnifiedRelayerRequest) => Promise<UnifiedRelayerResponse>);

/**
 * Simplified relayer callbacks interface (v2).
 * A single callback handles all relayer operations.
 *
 * @category Configuration
 * @example
 * ```typescript
 * const relayerCallbacks: RelayerCallbacksV2 = {
 *   submit: async (request) => {
 *     // Send to your server endpoint
 *     const response = await fetch('/api/relay', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify(request)
 *     });
 *     return response.json();
 *   }
 * };
 * ```
 */
export interface RelayerCallbacksV2 {
  /**
   * Submits any relayer operation to the server.
   *
   * @remarks
   * This single callback handles all operations:
   * - EIP-712 signed operations (permissions, server trust, etc.)
   * - Direct operations (file additions, grant storage)
   *
   * On your server, pass the entire request object to the SDK's
   * `handleRelayerOperation` helper function.
   *
   * @param request - The unified request object.
   *   Check `type` field to determine operation variant.
   * @returns Promise resolving to operation-specific response
   *
   * @example
   * ```typescript
   * async submit(request) {
   *   const response = await fetch('/api/relay', {
   *     method: 'POST',
   *     body: JSON.stringify(request)
   *   });
   *   return response.json();
   * }
   * ```
   */
  submit: (request: UnifiedRelayerRequest) => Promise<UnifiedRelayerResponse>;
}
