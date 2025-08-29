import type { Address, Hash } from "viem";

/**
 * Makes all properties in T optional except for those in K
 *
 * @remarks
 * This utility type is useful when you want to create a variant of an interface
 * where most properties are optional, but specific properties remain required.
 * Commonly used for update operations where only certain fields must be provided.
 *
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   email: string;
 *   age: number;
 * }
 *
 * // Only 'id' is required, all other properties are optional
 * type UserUpdate = PartialExcept<User, 'id'>;
 *
 * const update: UserUpdate = {
 *   id: '123', // Required
 *   name: 'John' // Optional
 *   // email and age are also optional
 * };
 * ```
 * @category Reference
 */
export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

/**
 * Makes all properties in T required except for those in K
 *
 * @remarks
 * This utility type is useful when you want to create a variant of an interface
 * where most properties are required, but specific properties remain optional.
 * Commonly used for creation operations where most fields are mandatory.
 *
 * @example
 * ```typescript
 * interface Config {
 *   apiUrl: string;
 *   timeout?: number;
 *   retries?: number;
 *   debug?: boolean;
 * }
 *
 * // All properties required except 'debug'
 * type StrictConfig = RequiredExcept<Config, 'debug'>;
 *
 * const config: StrictConfig = {
 *   apiUrl: 'https://api.vana.com', // Required
 *   timeout: 5000, // Required (was optional, now required)
 *   retries: 3, // Required (was optional, now required)
 *   // debug remains optional
 * };
 * ```
 * @category Reference
 */
export type RequiredExcept<T, K extends keyof T> = Required<T> &
  Partial<Pick<T, K>>;

/**
 * Extracts the return type of a promise
 *
 * @remarks
 * This utility type unwraps the type contained within a Promise.
 * If the type is not a Promise, it returns the type unchanged.
 * Note: TypeScript 4.5+ includes a built-in Awaited type with similar functionality.
 *
 * @example
 * ```typescript
 * type AsyncString = Promise<string>;
 * type SyncString = string;
 *
 * // Extracts 'string' from Promise<string>
 * type Result1 = Awaited<AsyncString>; // string
 *
 * // Returns 'string' unchanged since it's not a Promise
 * type Result2 = Awaited<SyncString>; // string
 *
 * // Practical usage with async functions
 * async function fetchUser(): Promise<{ id: string; name: string }> {
 *   // ...
 * }
 *
 * type User = Awaited<ReturnType<typeof fetchUser>>; // { id: string; name: string }
 * ```
 * @category Reference
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Creates a type that accepts either T or a Promise<T>
 *
 * @remarks
 * This utility type is useful for functions that can work with both
 * synchronous and asynchronous values. It allows flexible APIs that
 * can accept immediate values or promises that resolve to those values.
 *
 * @example
 * ```typescript
 * // Function that accepts either a value or a promise of that value
 * async function processData(data: MaybePromise<string>): Promise<string> {
 *   // await works on both promises and regular values
 *   const resolved = await data;
 *   return resolved.toUpperCase();
 * }
 *
 * // Both calls are valid:
 * processData('hello'); // Synchronous value
 * processData(Promise.resolve('world')); // Asynchronous value
 *
 * // Common use case in SDK callbacks
 * interface StorageProvider {
 *   // Provider can implement sync or async file reading
 *   read(path: string): MaybePromise<Buffer>;
 * }
 * ```
 * @category Reference
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Creates a type that accepts either T or an array of T
 *
 * @remarks
 * This utility type is useful for functions that can accept either a single
 * value or an array of values, providing a more flexible API. The implementation
 * can normalize the input to always work with arrays internally.
 *
 * @example
 * ```typescript
 * // Function that accepts either a single ID or multiple IDs
 * function deleteItems(ids: MaybeArray<string>): void {
 *   // Normalize to array
 *   const idArray = Array.isArray(ids) ? ids : [ids];
 *   idArray.forEach(id => console.log(`Deleting ${id}`));
 * }
 *
 * // Both calls are valid:
 * deleteItems('item-1'); // Single item
 * deleteItems(['item-1', 'item-2', 'item-3']); // Multiple items
 *
 * // Common use case in permissions
 * interface GrantPermissionsParams {
 *   permissions: MaybeArray<Permission>;
 * }
 * ```
 * @category Reference
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
 * Pagination result containing items and metadata for navigating large datasets.
 *
 * @remarks
 * This interface standardizes paginated responses across the SDK, providing
 * consistent metadata for implementing pagination UI components and handling
 * multi-page data fetching. Supports both offset-based and cursor-based pagination.
 *
 * @example
 * ```typescript
 * // Fetching paginated user files
 * async function getAllUserFiles(userAddress: string): Promise<File[]> {
 *   const allFiles: File[] = [];
 *   let cursor: string | undefined;
 *
 *   do {
 *     const result: PaginationResult<File> = await vana.data.getUserFiles({
 *       owner: userAddress,
 *       pagination: { limit: 50, cursor }
 *     });
 *
 *     allFiles.push(...result.items);
 *     cursor = result.nextCursor;
 *
 *     console.log(`Fetched ${result.count} of ${result.total} files`);
 *   } while (result.hasMore);
 *
 *   return allFiles;
 * }
 * ```
 * @category Reference
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
 * Block range parameters for filtering blockchain events and transactions.
 *
 * @remarks
 * Used to specify a range of blocks when querying blockchain data.
 * Both parameters are optional - omitting fromBlock starts from genesis,
 * omitting toBlock goes to the latest block. Be cautious with large ranges
 * as they may result in heavy RPC loads or timeouts.
 *
 * @example
 * ```typescript
 * // Get events from the last 1000 blocks
 * const currentBlock = await vana.protocol.getBlockNumber();
 * const events = await vana.protocol.getEvents({
 *   blockRange: {
 *     fromBlock: currentBlock - 1000n,
 *     toBlock: currentBlock
 *   }
 * });
 *
 * // Get all historical events (use with caution)
 * const allEvents = await vana.protocol.getEvents({
 *   blockRange: {
 *     fromBlock: 0n
 *     // toBlock omitted = up to latest
 *   }
 * });
 * ```
 * @category Reference
 */
export interface BlockRange {
  /** Starting block number */
  fromBlock?: bigint;
  /** Ending block number */
  toBlock?: bigint;
}

/**
 * Transaction options for customizing blockchain transaction parameters.
 *
 * @remarks
 * Provides fine-grained control over transaction execution. Supports both
 * legacy (gasPrice) and EIP-1559 (maxFeePerGas) transaction types. When
 * not specified, the SDK will use appropriate defaults based on network
 * conditions. Use these options to optimize for speed or cost.
 *
 * @example
 * ```typescript
 * // High priority transaction with EIP-1559 pricing
 * await vana.permissions.grant(params, {
 *   maxFeePerGas: 100n * 10n ** 9n, // 100 gwei
 *   maxPriorityFeePerGas: 2n * 10n ** 9n, // 2 gwei tip
 * });
 *
 * // Legacy transaction with specific gas limit
 * await vana.data.registerFile(params, {
 *   gasLimit: 500000n,
 *   gasPrice: 50n * 10n ** 9n // 50 gwei
 * });
 *
 * // Send ETH with the transaction
 * await vana.protocol.execute(params, {
 *   value: 10n ** 18n, // 1 ETH
 *   gasLimit: 21000n
 * });
 * ```
 * @category Reference
 */
/**
 * Gas-related transaction options.
 *
 * @category Reference
 */
export interface GasOptions {
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
 * Transaction timeout and confirmation options.
 *
 * @category Reference
 */
export interface TransactionTimeoutOptions {
  /**
   * Timeout in milliseconds for waiting for transaction confirmation.
   *
   * @remarks
   * Controls how long to wait for a transaction receipt after submission.
   * Longer timeouts are recommended during network congestion or when
   * using lower gas prices. Default is typically 30 seconds.
   *
   * @default 30000 (30 seconds)
   */
  timeout?: number;
}

/**
 * Complete transaction options combining gas and timeout settings.
 *
 * @category Reference
 */
export interface TransactionOptions
  extends GasOptions,
    TransactionTimeoutOptions {}

/**
 * Transaction receipt with additional metadata for tracking transaction results.
 *
 * @remarks
 * Provides comprehensive information about executed transactions including
 * gas usage, success status, and emitted events. Use the logs array to
 * decode events emitted by smart contracts during transaction execution.
 * The receipt is available after a transaction is mined and included in a block.
 *
 * @example
 * ```typescript
 * // Execute transaction and wait for receipt
 * const receipt = await vana.permissions.grant({
 *   grantee: '0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36',
 *   dataId: 123
 * });
 *
 * // Check transaction success
 * if (receipt.status === 'success') {
 *   console.log(`Gas used: ${receipt.gasUsed}`);
 *   console.log(`Block: ${receipt.blockNumber}`);
 *
 *   // Decode events from logs
 *   receipt.logs.forEach(log => {
 *     if (log.topics[0] === PERMISSION_GRANTED_TOPIC) {
 *       console.log('Permission granted event detected');
 *     }
 *   });
 * } else {
 *   console.error('Transaction reverted');
 * }
 * ```
 * @category Reference
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
 * Response wrapper for API results providing consistent error handling.
 *
 * @remarks
 * Standardizes API responses across the SDK, making it easy to handle
 * both successful and failed requests. The generic type parameter T
 * represents the expected data type for successful responses. Check
 * the success flag before accessing data to ensure type safety.
 *
 * @example
 * ```typescript
 * // Handling API responses
 * async function fetchUserData(userId: string): Promise<User | null> {
 *   const response: ApiResponse<User> = await api.getUser(userId);
 *
 *   if (response.success) {
 *     console.log('User fetched:', response.data.name);
 *     // Access metadata if available
 *     if (response.metadata?.cached) {
 *       console.log('Data was cached');
 *     }
 *     return response.data;
 *   } else {
 *     console.error('Failed to fetch user:', response.error);
 *     return null;
 *   }
 * }
 *
 * // Type-safe error handling
 * interface UserData {
 *   id: string;
 *   name: string;
 * }
 *
 * const result: ApiResponse<UserData> = await api.call('/users/123');
 * if (result.success) {
 *   // TypeScript knows result.data is UserData here
 *   console.log(result.data.name);
 * }
 * ```
 * @category Reference
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
 * Retry configuration for handling transient failures with exponential backoff.
 *
 * @remarks
 * Configures automatic retry behavior for operations that may fail due to
 * temporary issues like network problems or rate limits. Supports exponential
 * backoff to avoid overwhelming services. The shouldRetry function allows
 * custom logic to determine which errors warrant a retry attempt.
 *
 * @example
 * ```typescript
 * // Simple retry configuration
 * const basicRetry: RetryConfig = {
 *   attempts: 3,
 *   delay: 1000 // 1 second between retries
 * };
 *
 * // Exponential backoff configuration
 * const exponentialRetry: RetryConfig = {
 *   attempts: 5,
 *   delay: 1000,
 *   backoffMultiplier: 2, // Double delay each time
 *   maxDelay: 30000, // Cap at 30 seconds
 *   shouldRetry: (error) => {
 *     // Only retry network and timeout errors
 *     return error.name === 'NetworkError' ||
 *            error.message.includes('timeout');
 *   }
 * };
 *
 * // Usage with SDK
 * const vana = new Vana({
 *   retryConfig: exponentialRetry
 * });
 * ```
 * @category Reference
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
 * Cache configuration for optimizing repeated data fetches.
 *
 * @remarks
 * Configures in-memory caching behavior to reduce redundant API calls and
 * improve performance. The cache automatically evicts expired entries based
 * on TTL and removes least-recently-used items when maxSize is reached.
 * Use appropriate TTL values based on your data freshness requirements.
 *
 * @example
 * ```typescript
 * // Short-lived cache for frequently changing data
 * const userCache: CacheConfig = {
 *   ttl: 60000, // 1 minute
 *   maxSize: 100, // Store up to 100 users
 *   prefix: 'user:' // Cache keys like 'user:123'
 * };
 *
 * // Long-lived cache for stable data
 * const schemaCache: CacheConfig = {
 *   ttl: 3600000, // 1 hour
 *   maxSize: 1000, // Store up to 1000 schemas
 *   prefix: 'schema:'
 * };
 *
 * // Disable caching by setting TTL to 0
 * const noCache: CacheConfig = {
 *   ttl: 0 // No caching
 * };
 * ```
 * @category Reference
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
 * Validation result for data integrity checks and schema validation.
 *
 * @remarks
 * Provides detailed feedback about validation outcomes, distinguishing between
 * errors (which prevent processing) and warnings (which indicate potential issues).
 * Used throughout the SDK for validating permissions, file formats, schemas,
 * and API parameters before operations.
 *
 * @example
 * ```typescript
 * // Validating user input
 * function validateFileUpload(file: File): ValidationResult {
 *   const errors: string[] = [];
 *   const warnings: string[] = [];
 *
 *   // Check file size
 *   if (file.size > 100 * 1024 * 1024) {
 *     errors.push('File size exceeds 100MB limit');
 *   } else if (file.size > 50 * 1024 * 1024) {
 *     warnings.push('Large file may take time to upload');
 *   }
 *
 *   // Check file type
 *   if (!file.type.startsWith('image/')) {
 *     errors.push('Only image files are allowed');
 *   }
 *
 *   return {
 *     valid: errors.length === 0,
 *     errors,
 *     warnings
 *   };
 * }
 *
 * // Using validation result
 * const result = validateFileUpload(file);
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors.join(', '));
 * } else {
 *   if (result.warnings.length > 0) {
 *     console.warn('Warnings:', result.warnings.join(', '));
 *   }
 *   // Proceed with upload
 * }
 * ```
 * @category Reference
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
 * Status information for health checks and service monitoring.
 *
 * @remarks
 * Used to report the health status of various SDK components including
 * storage providers, RPC connections, and personal servers. The details
 * field can contain provider-specific information for debugging.
 * Timestamps use Unix epoch milliseconds.
 *
 * @example
 * ```typescript
 * // Checking storage provider health
 * const status: StatusInfo = await storage.getStatus();
 *
 * if (!status.healthy) {
 *   console.error(`Storage unhealthy: ${status.message}`);
 *   // Check how long the issue has persisted
 *   const downtime = Date.now() - status.lastCheck;
 *   if (downtime > 300000) { // 5 minutes
 *     // Switch to backup provider
 *   }
 * }
 *
 * // Detailed status with custom fields
 * const serverStatus: StatusInfo = {
 *   healthy: true,
 *   message: 'All systems operational',
 *   lastCheck: Date.now(),
 *   details: {
 *     uptime: 3600000, // 1 hour
 *     requestsServed: 1234,
 *     avgResponseTime: 145, // ms
 *     activeConnections: 23
 *   }
 * };
 * ```
 * @category Reference
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
 * Rate limit information for API throttling and quota management.
 *
 * @remarks
 * Provides visibility into rate limiting status to help applications
 * implement appropriate backoff strategies. Rate limits protect services
 * from overload and ensure fair resource usage. Use this information
 * to pace requests and avoid hitting limits.
 *
 * @example
 * ```typescript
 * // Check rate limit before making requests
 * const rateLimit: RateLimitInfo = await api.getRateLimit();
 *
 * console.log(`Requests: ${rateLimit.requests}/${rateLimit.limit}`);
 * console.log(`Resets in: ${rateLimit.resetTime} seconds`);
 *
 * // Implement backoff if approaching limit
 * if (rateLimit.requests >= rateLimit.limit * 0.9) {
 *   console.warn('Approaching rate limit, slowing down');
 *   await new Promise(resolve =>
 *     setTimeout(resolve, rateLimit.resetTime * 1000)
 *   );
 * }
 *
 * // Calculate requests per second allowed
 * const rps = rateLimit.limit / rateLimit.window;
 * console.log(`Max ${rps} requests per second allowed`);
 * ```
 * @category Reference
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
 * File upload progress tracking for user feedback and monitoring.
 *
 * @remarks
 * Provides real-time progress information during file uploads, enabling
 * applications to show progress bars and estimated completion times.
 * The speed calculation is typically based on a rolling average to
 * smooth out network fluctuations.
 *
 * @example
 * ```typescript
 * // Upload with progress tracking
 * await vana.data.upload(file, {
 *   onProgress: (progress: UploadProgress) => {
 *     // Update progress bar
 *     progressBar.style.width = `${progress.percentage}%`;
 *
 *     // Show upload speed
 *     const speedMBps = (progress.speed / 1024 / 1024).toFixed(2);
 *     speedDisplay.textContent = `${speedMBps} MB/s`;
 *
 *     // Show time remaining
 *     const minutes = Math.floor(progress.estimatedTimeRemaining / 60);
 *     const seconds = progress.estimatedTimeRemaining % 60;
 *     timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
 *
 *     // Log progress milestones
 *     if (progress.percentage === 25 ||
 *         progress.percentage === 50 ||
 *         progress.percentage === 75) {
 *       console.log(`Upload ${progress.percentage}% complete`);
 *     }
 *   }
 * });
 * ```
 * @category Reference
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
 * Network information for blockchain connectivity and monitoring.
 *
 * @remarks
 * Provides comprehensive details about the connected blockchain network,
 * including configuration URLs and real-time status. Use this information
 * to verify network connectivity, display network details to users, and
 * construct explorer links for transactions.
 *
 * @example
 * ```typescript
 * // Get current network info
 * const network: NetworkInfo = await vana.protocol.getNetworkInfo();
 *
 * console.log(`Connected to: ${network.chainName} (ID: ${network.chainId})`);
 * console.log(`Current block: ${network.currentBlock}`);
 *
 * // Check network health
 * if (network.status !== 'healthy') {
 *   console.warn(`Network ${network.status}: consider switching RPC`);
 * }
 *
 * // Generate explorer link for transaction
 * function getExplorerLink(txHash: string): string {
 *   if (!network.explorerUrl) {
 *     return `Transaction: ${txHash}`;
 *   }
 *   return `${network.explorerUrl}/tx/${txHash}`;
 * }
 *
 * // Verify expected network
 * const EXPECTED_CHAIN_ID = 1337; // Vana testnet
 * if (network.chainId !== EXPECTED_CHAIN_ID) {
 *   throw new Error(`Wrong network! Expected ${EXPECTED_CHAIN_ID}, got ${network.chainId}`);
 * }
 * ```
 * @category Reference
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
 * Gas estimate information for transaction cost prediction.
 *
 * @remarks
 * Provides detailed gas pricing estimates to help users understand transaction
 * costs before execution. Supports both legacy (gasPrice) and EIP-1559
 * (maxFeePerGas) pricing models. The estimatedCost is calculated based on
 * current network conditions and may vary by the time of actual execution.
 *
 * @example
 * ```typescript
 * // Get gas estimate before transaction
 * const estimate: GasEstimate = await vana.permissions.estimateGas({
 *   grantee: '0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36',
 *   dataId: 123
 * });
 *
 * // Convert to human-readable format
 * const costInEth = Number(estimate.estimatedCost) / 1e18;
 * console.log(`Estimated cost: ${costInEth.toFixed(6)} ETH`);
 *
 * // Check if user has sufficient balance
 * const balance = await vana.protocol.getBalance(userAddress);
 * if (balance < estimate.estimatedCost) {
 *   throw new Error(`Insufficient balance. Need ${costInEth} ETH`);
 * }
 *
 * // Use estimate for transaction with buffer
 * await vana.permissions.grant(params, {
 *   gasLimit: estimate.gasLimit * 110n / 100n, // 10% buffer
 *   maxFeePerGas: estimate.maxFeePerGas,
 *   maxPriorityFeePerGas: estimate.maxPriorityFeePerGas
 * });
 * ```
 * @category Reference
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
