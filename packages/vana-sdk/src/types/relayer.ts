import type { Hash } from "viem";
import type { GrantFile, PermissionGrantTypedData } from "./permissions";

/**
 * Response from the relayer service for grant file storage
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
 * Response from the relayer service for transaction submission
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
 * Parameters for storing a grant file via relayer
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
 * Parameters for submitting a transaction via relayer
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
 * Relayer service status
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
 * Relayer configuration
 *
 * @category Advanced
 */
export interface RelayerConfig {
  /** Relayer service URL */
  url: string;
  /** API key for authentication */
  apiKey?: string;
  /** Timeout for requests in milliseconds */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    /** Number of retry attempts */
    attempts: number;
    /** Delay between retries in milliseconds */
    delay: number;
  };
  /** Whether to use HTTPS */
  useHttps?: boolean;
}

/**
 * Relayer request options
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
 * Relayer error response
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
 * Relayer queue information
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
 * Relayer transaction status
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
 * Relayer metrics
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
 * Relayer webhook configuration
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
 * Relayer webhook payload
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
