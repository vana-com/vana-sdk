/**
 * Core blockchain types for the Vana SDK
 */

import type { Hash, Address } from "viem";

/**
 * Represents a transaction that has been submitted to the blockchain
 * This is what contract calls return before confirmation
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
 * Options for waiting for transaction confirmation
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
 * Base result for all confirmed transactions
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
 * Event arguments are dynamically typed based on the contract mappings.
 * The parseTransaction function will:
 * 1. Return expectedEvents with typed args for mapped functions
 * 2. Return allEvents with all parsed events from the transaction
 *
 * This approach avoids the need for specific result interfaces per event type,
 * letting the mapping file drive the types instead.
 */
