/**
 * @file Standard option types for Vana SDK methods
 * @module vana-sdk/types/options
 */

/**
 * Transaction options for blockchain write operations.
 *
 * @remarks
 * Aligned with viem's transaction parameters for consistency.
 * These options control gas pricing, limits, and other transaction-specific settings.
 *
 * @example
 * ```typescript
 * await vana.data.upload(params, {
 *   gas: 1000000n,
 *   maxFeePerGas: 20000000000n
 * });
 * ```
 *
 * @category Options
 */
export interface TransactionOptions {
  /** Gas limit for the transaction */
  gas?: bigint;

  /** Gas price in wei (for legacy transactions) */
  gasPrice?: bigint;

  /** Maximum fee per gas in wei (EIP-1559) */
  maxFeePerGas?: bigint;

  /** Maximum priority fee per gas in wei (EIP-1559) */
  maxPriorityFeePerGas?: bigint;

  /** Transaction nonce override */
  nonce?: number;

  /** ETH value to send with transaction */
  value?: bigint;
}

/**
 * Source selection for data queries.
 *
 * @remarks
 * - `chain`: Query directly from blockchain (immediate consistency)
 * - `subgraph`: Query from indexed subgraph (may lag 15-60s)
 * - `auto`: SDK chooses optimal source (default)
 *
 * @category Options
 */
export type DataSource = "chain" | "subgraph" | "auto";

/**
 * Consistency options for read operations.
 *
 * @remarks
 * Controls data freshness requirements and source selection.
 * Essential for read-after-write consistency when data must reflect recent transactions.
 *
 * @example
 * ```typescript
 * // Ensure data includes a recent transaction
 * const files = await vana.data.getUserFiles({ owner }, {
 *   minBlock: receipt.blockNumber,
 *   waitForSync: 30000  // Wait up to 30s
 * });
 * ```
 *
 * @category Options
 */
export interface ConsistencyOptions {
  /**
   * Minimum block number the data source must have indexed.
   *
   * @remarks
   * Operation will fail or wait (if waitForSync set) until source reaches this block.
   * Critical for ensuring recently created data is visible.
   */
  minBlock?: number;

  /**
   * Maximum milliseconds to wait for data source to sync to minBlock.
   *
   * @remarks
   * If not set, operation fails immediately when source is behind.
   * Useful for critical operations where waiting is preferable to failure.
   *
   * @default undefined (no waiting)
   */
  waitForSync?: number;

  /**
   * Explicitly select data source.
   *
   * @remarks
   * Useful for debugging or when specific consistency guarantees are needed.
   * Not all methods support all sources - unsupported selections will error.
   *
   * @default 'auto'
   */
  source?: DataSource;

  /**
   * AbortSignal for cancelling long-running operations.
   *
   * @remarks
   * Particularly useful with waitForSync to cancel polling operations.
   * Properly cleans up timers and pending requests when aborted.
   *
   * @example
   * ```typescript
   * const controller = new AbortController();
   * const promise = vana.data.getUserFiles(
   *   { owner },
   *   { waitForSync: 30000, signal: controller.signal }
   * );
   *
   * // Cancel after 5 seconds
   * setTimeout(() => controller.abort(), 5000);
   * ```
   */
  signal?: AbortSignal;
}

/**
 * Pagination options for list operations.
 *
 * @remarks
 * Controls result set size, ordering, and pagination.
 * By default returns first 100 items to prevent accidental large fetches.
 *
 * @example
 * ```typescript
 * // Get all files (explicit opt-in)
 * const allFiles = await vana.data.getUserFiles({ owner }, {
 *   fetchAll: true
 * });
 *
 * // Get 10 most recent files
 * const recentFiles = await vana.data.getUserFiles({ owner }, {
 *   limit: 10,
 *   orderBy: 'addedAtBlock',
 *   orderDirection: 'desc'
 * });
 * ```
 *
 * @category Options
 */
export interface PaginationOptions {
  /**
   * Maximum number of items to return.
   *
   * @remarks
   * Prevents accidental large fetches. Use fetchAll: true for unlimited.
   *
   * @default 100
   */
  limit?: number;

  /**
   * Number of items to skip (for manual pagination).
   *
   * @default 0
   */
  offset?: number;

  /**
   * Field to order results by.
   *
   * @remarks
   * Field names depend on the entity type.
   * Common: 'id', 'addedAtBlock', 'addedAtTimestamp'
   */
  orderBy?: string;

  /**
   * Sort direction for orderBy field.
   *
   * @default 'desc' for timestamp/block fields, 'asc' for others
   */
  orderDirection?: "asc" | "desc";

  /**
   * Explicitly fetch all available items.
   *
   * @remarks
   * Override safety limit. SDK will paginate internally to fetch all results.
   * Use with caution - can result in many API calls and large memory usage.
   *
   * @default false
   */
  fetchAll?: boolean;
}

/**
 * Combined options for read operations that return lists.
 *
 * @remarks
 * Convenience type combining consistency and pagination controls.
 *
 * @category Options
 */
export type ListOptions = ConsistencyOptions & PaginationOptions;

/**
 * Combined options for write operations that may read data.
 *
 * @remarks
 * Some write operations need to read data (e.g., schema validation).
 * This type combines transaction and consistency options.
 *
 * @category Options
 */
export type WriteOptions = TransactionOptions & ConsistencyOptions;

/**
 * Legacy transaction options type for backwards compatibility.
 *
 * @deprecated Use TransactionOptions instead. Will be removed in next major version.
 * @category Options
 */
export interface LegacyTransactionOptions {
  /** @deprecated Use `gas` instead */
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
  value?: bigint;
}
