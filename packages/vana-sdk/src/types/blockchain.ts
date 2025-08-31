/**
 * Defines core blockchain interaction types.
 *
 * @remarks
 * This module provides fundamental types for blockchain transactions,
 * including transaction requests, confirmation options, and results.
 * These types form the basis for all blockchain interactions in the SDK.
 *
 * @category Types
 * @module types/blockchain
 */

import type { Hash, Address } from "viem";

/**
 * Represents a submitted blockchain transaction awaiting confirmation.
 *
 * @remarks
 * Returned immediately after transaction submission, before confirmation.
 * Use `waitForTransactionEvents` to wait for confirmation and retrieve events.
 *
 * @category Blockchain
 */
export interface TransactionRequest {
  /** Transaction hash */
  hash: Hash;
  /** Account that initiated the transaction */
  from: Address;
  /** Contract that was called */
  contractName: string;
  /** Function that was called */
  functionName: string;
  /** Function arguments (for debugging/logging) */
  args?: readonly unknown[];
}

/**
 * Configures transaction confirmation waiting behavior.
 *
 * @remarks
 * Controls how long and how often to check for transaction confirmation.
 * Adjust based on network congestion and application requirements.
 *
 * @category Blockchain
 */
export interface TransactionWaitOptions {
  /** Number of confirmations to wait for (default: 1) */
  confirmations?: number;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Polling interval in milliseconds (default: 4000) */
  pollingInterval?: number;
}

/**
 * Represents a confirmed blockchain transaction with metadata.
 *
 * @remarks
 * Contains essential transaction information after confirmation including
 * gas usage, block number, and function details. Extended by specific
 * result types with parsed events.
 *
 * @category Blockchain
 */
export interface TransactionResult {
  /** Transaction hash */
  transactionHash: Hash;
  /** Block number where transaction was included */
  blockNumber: bigint;
  /** Gas used by the transaction */
  gasUsed: bigint;
  /** Account that initiated the transaction */
  from: Address;
  /** Contract that was called */
  contractName: string;
  /** Function that was called */
  functionName: string;
}

/**
 * @remarks
 * Event typing strategy:
 * - Event arguments are dynamically typed based on contract mappings
 * - `parseTransaction` returns `expectedEvents` with typed args for mapped functions
 * - `allEvents` contains all parsed events from the transaction
 * - This approach lets the mapping file drive types rather than requiring
 *   specific result interfaces per event type
 *
 * @internal
 */
