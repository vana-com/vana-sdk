import type { Address, Hash } from "viem";

/**
 * Makes all properties in T optional except for those in K
 */
export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

/**
 * Makes all properties in T required except for those in K
 */
export type RequiredExcept<T, K extends keyof T> = Required<T> &
  Partial<Pick<T, K>>;

/**
 * Extracts the return type of a promise
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Creates a type that accepts either T or a Promise<T>
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Creates a type that accepts either T or an array of T
 */
export type MaybeArray<T> = T | T[];

/**
 * Pagination parameters for controlling result set size and navigation.
 *
 * Used across SDK methods that return lists of items to control how many items
 * are returned and to navigate through large result sets efficiently.
 *
 * @category Reference
 * @example
 * ```typescript
 * const pagination: PaginationParams = {
 *   limit: 20, // Return 20 items
 *   offset: 40, // Skip first 40 items (page 3)
 *   cursor: 'eyJpZCI6MTIzfQ==' // Or use cursor-based pagination
 * };
 * 
 * const files = await vana.data.getUserFiles({ 
 *   owner: userAddress, 
 *   pagination 
 * });
 * ```
 */
export interface PaginationParams {
  /** Maximum number of items to return */
  limit?: number;
  /** Number of items to skip */
  offset?: number;
  /** Cursor for cursor-based pagination */
  cursor?: string;
}

/**
 * Pagination result
 */
export interface PaginationResult<T> {
  /** Array of items */
  items: T[];
  /** Total number of items available */
  total: number;
  /** Number of items returned */
  count: number;
  /** Whether there are more items available */
  hasMore: boolean;
  /** Cursor for next page */
  nextCursor?: string;
}

/**
 * Block range parameters
 */
export interface BlockRange {
  /** Starting block number */
  fromBlock?: bigint;
  /** Ending block number */
  toBlock?: bigint;
}

/**
 * Transaction options
 */
export interface TransactionOptions {
  /** Gas limit */
  gasLimit?: bigint;
  /** Gas price */
  gasPrice?: bigint;
  /** Max fee per gas (EIP-1559) */
  maxFeePerGas?: bigint;
  /** Max priority fee per gas (EIP-1559) */
  maxPriorityFeePerGas?: bigint;
  /** Nonce */
  nonce?: number;
  /** Value to send with transaction */
  value?: bigint;
}

/**
 * Transaction receipt with additional metadata
 */
export interface TransactionReceipt {
  /** Transaction hash */
  transactionHash: Hash;
  /** Block number */
  blockNumber: bigint;
  /** Block hash */
  blockHash: Hash;
  /** Gas used */
  gasUsed: bigint;
  /** Transaction status */
  status: "success" | "reverted";
  /** Contract address if contract deployment */
  contractAddress?: Address;
  /** Event logs */
  logs: Array<{
    address: Address;
    topics: Hash[];
    data: string;
  }>;
}

/**
 * Response wrapper for API results
 */
export interface ApiResponse<T> {
  /** Response data */
  data: T;
  /** Success status */
  success: boolean;
  /** Error message if not successful */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Number of retry attempts */
  attempts: number;
  /** Delay between retries in milliseconds */
  delay: number;
  /** Backoff multiplier */
  backoffMultiplier?: number;
  /** Maximum delay in milliseconds */
  maxDelay?: number;
  /** Function to determine if error should be retried */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Cache TTL in milliseconds */
  ttl: number;
  /** Maximum cache size */
  maxSize?: number;
  /** Cache key prefix */
  prefix?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}

/**
 * Status information
 */
export interface StatusInfo {
  /** Whether the service is healthy */
  healthy: boolean;
  /** Status message */
  message?: string;
  /** Last check timestamp */
  lastCheck: number;
  /** Additional status details */
  details?: Record<string, unknown>;
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  /** Current request count */
  requests: number;
  /** Maximum requests allowed */
  limit: number;
  /** Time window in seconds */
  window: number;
  /** Time until reset in seconds */
  resetTime: number;
}

/**
 * File upload progress
 */
export interface UploadProgress {
  /** Bytes uploaded */
  loaded: number;
  /** Total bytes to upload */
  total: number;
  /** Upload percentage (0-100) */
  percentage: number;
  /** Upload speed in bytes per second */
  speed: number;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining: number;
}

/**
 * Network information
 */
export interface NetworkInfo {
  /** Chain ID */
  chainId: number;
  /** Chain name */
  chainName: string;
  /** RPC URL */
  rpcUrl: string;
  /** Block explorer URL */
  explorerUrl?: string;
  /** Current block number */
  currentBlock: bigint;
  /** Network status */
  status: "healthy" | "degraded" | "down";
}

/**
 * Gas estimate information
 */
export interface GasEstimate {
  /** Gas limit */
  gasLimit: bigint;
  /** Gas price */
  gasPrice: bigint;
  /** Max fee per gas */
  maxFeePerGas?: bigint;
  /** Max priority fee per gas */
  maxPriorityFeePerGas?: bigint;
  /** Estimated cost in wei */
  estimatedCost: bigint;
}

/**
 * Time range parameters for filtering operations by time period.
 *
 * Used in various SDK methods to specify date/time ranges for queries,
 * analytics, and data filtering operations. Times are specified as Unix timestamps.
 *
 * @category Reference
 * @example
 * ```typescript
 * const lastWeek: TimeRange = {
 *   from: Date.now() - (7 * 24 * 60 * 60 * 1000), // 7 days ago
 *   to: Date.now()
 * };
 * 
 * const permissions = await vana.permissions.getUserPermissions({
 *   timeRange: lastWeek
 * });
 * ```
 */
export interface TimeRange {
  /** Start time (Unix timestamp) */
  from?: number;
  /** End time (Unix timestamp) */
  to?: number;
}
