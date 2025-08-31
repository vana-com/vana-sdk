import type { Hash, TransactionReceipt as ViemReceipt, Address } from "viem";
import type { GetOperationResponse } from "../generated/server/server-exports";
import type { Contract, Fn } from "../generated/event-types";

/**
 * Represents a server-side operation status and result.
 *
 * @remarks
 * Operations track asynchronous server processes like data refinement or ML inference.
 * Poll operation status using `vana.server.waitForOperation()` until completion.
 * Fully serializable for API responses and cross-process communication.
 *
 * @category Operations
 * @see {@link https://docs.vana.org/docs/operations | Operations Guide}
 */
export interface Operation<T = unknown> {
  /** Unique operation identifier */
  id: string;
  /** Current operation status */
  status: "starting" | "running" | "succeeded" | "failed" | "canceled";
  /** Unix timestamp when operation was created */
  createdAt: number;
  /** Unix timestamp when operation was last updated */
  updatedAt?: number;
  /** Operation result when status is 'succeeded' */
  result?: T;
  /** Error message when status is 'failed' */
  error?: string;
  /** Additional operation metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Represents a submitted blockchain transaction as a self-describing POJO.
 *
 * @remarks
 * Transaction results MUST include contract and function for proper event parsing.
 * This strongly-typed design enables automatic event extraction without heuristics.
 * Use `vana.waitForTransactionEvents()` to retrieve typed events from the receipt.
 *
 * **Architecture:**
 * POJOs (Plain Old JavaScript Objects) ensure serialization safety and framework
 * independence. Contract and function fields enable deterministic event parsing.
 *
 * @category Operations
 * @example
 * ```typescript
 * const result: TransactionResult = {
 *   hash: '0x123...',
 *   from: '0x456...',
 *   contract: 'DataRegistry',
 *   fn: 'addFile',
 *   chainId: 14800
 * };
 *
 * // Wait for events
 * const events = await vana.waitForTransactionEvents(result);
 * ```
 */
export interface TransactionResult<
  C extends Contract = Contract,
  F extends Fn<C> = Fn<C>,
> {
  /** Transaction hash for tracking and confirmation */
  hash: Hash;
  /** Sender's wallet address */
  from: Address;
  /** Contract that was called (required for event parsing) */
  contract: C;
  /** Function that was called (required for event parsing) */
  fn: F;
  /** Network chain ID where transaction was submitted */
  chainId?: number;
  /** Transaction value in wei (for payable functions) */
  value?: bigint;
  /** Transaction sequence number for the sender */
  nonce?: number;
  /** Contract address (if different from standard deployment) */
  to?: Address;
}

/**
 * Extends viem's TransactionReceipt with Vana-specific event data.
 *
 * @remarks
 * Includes parsed event data when available after transaction confirmation.
 * Use this for detailed transaction analysis and event processing.
 *
 * @category Operations
 */
export interface TransactionReceipt extends ViemReceipt {
  /** Parsed event data if available */
  events?: unknown;
}

/**
 * Configures polling behavior for asynchronous operations.
 *
 * @remarks
 * Controls how frequently and how long to poll for operation completion.
 * Lower intervals provide faster updates but increase server load.
 *
 * @category Operations
 */
export interface PollingOptions {
  /** Polling interval in milliseconds (default: 500) */
  pollingInterval?: number;
  /** Maximum time to wait in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Configures transaction confirmation waiting behavior.
 *
 * @remarks
 * Controls confirmation depth and timeout for transaction finality.
 * Higher confirmations provide more security against chain reorganizations.
 *
 * @category Operations
 */
export interface TransactionWaitOptions {
  /** Number of confirmations to wait for (default: 1) */
  confirmations?: number;
  /** Polling interval in milliseconds (default: 1000) */
  pollingInterval?: number;
  /** Maximum time to wait in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Validates whether an object conforms to the Operation interface.
 *
 * @remarks
 * Type guard for runtime validation of operation objects from external sources.
 * Use when deserializing operations from API responses or storage.
 *
 * @param obj - The object to validate as an Operation
 * @returns `true` if the object has required Operation properties, `false` otherwise
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/operation/123');
 * const data = await response.json();
 *
 * if (isOperation(data)) {
 *   console.log(`Operation ${data.id}: ${data.status}`);
 * }
 * ```
 *
 * @category Operations
 */
export function isOperation(obj: unknown): obj is Operation {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "status" in obj &&
    typeof (obj as Record<string, unknown>).id === "string" &&
    typeof (obj as Record<string, unknown>).status === "string"
  );
}

/**
 * Validates whether an object conforms to the TransactionResult interface.
 *
 * @remarks
 * Type guard for runtime validation of transaction results.
 * Checks for required hash field with proper `0x` prefix.
 *
 * @param obj - The object to validate as a TransactionResult
 * @returns `true` if the object has a valid transaction hash, `false` otherwise
 *
 * @example
 * ```typescript
 * if (isTransactionResult(result)) {
 *   await vana.waitForTransactionEvents(result);
 * }
 * ```
 *
 * @category Operations
 */
export function isTransactionResult(obj: unknown): obj is TransactionResult {
  if (typeof obj !== "object" || obj === null || !("hash" in obj)) {
    return false;
  }
  const { hash } = obj as Record<string, unknown>;
  return typeof hash === "string" && hash.startsWith("0x");
}

/**
 * Converts a server response to an Operation POJO.
 *
 * @remarks
 * Normalizes server responses into consistent Operation format.
 * Separates success results from error messages based on status.
 *
 * @param response - The raw server response containing operation status data
 * @returns An Operation object with normalized fields for client consumption
 *
 * @example
 * ```typescript
 * const serverResponse = await api.getOperation('op-123');
 * const operation = toOperation<MLResult>(serverResponse);
 *
 * if (operation.status === 'succeeded') {
 *   console.log('Result:', operation.result);
 * }
 * ```
 *
 * @category Operations
 */
export function toOperation<T>(response: GetOperationResponse): Operation<T> {
  return {
    id: response.id,
    status: response.status as Operation["status"],
    createdAt: Date.now(), // Server doesn't provide this, so we use current time
    result:
      response.status === "succeeded" ? (response.result as T) : undefined,
    error:
      response.status === "failed" ? (response.result ?? undefined) : undefined,
  };
}

/**
 * Extracts the operation ID from flexible input types.
 *
 * @remarks
 * Utility for handling both Operation objects and raw ID strings.
 * Enables flexible API design accepting either format.
 *
 * @param opOrId - An Operation object containing an `id` field or a raw operation ID string
 * @returns The operation ID string for use in API calls
 *
 * @example
 * ```typescript
 * // Works with both formats
 * await vana.server.getOperation(operation); // Operation object
 * await vana.server.getOperation('op-123');  // ID string
 * ```
 *
 * @category Operations
 */
export function getOperationId(opOrId: Operation | string): string {
  return typeof opOrId === "string" ? opOrId : opOrId.id;
}

/**
 * Extracts the transaction hash from flexible input types.
 *
 * @remarks
 * Utility for handling TransactionResult objects, hash objects, or raw hash strings.
 * Enables consistent hash extraction across different transaction representations.
 *
 * @param txOrHash - A TransactionResult object, any object with a `hash` field, or a raw hash string
 * @returns The transaction hash as a `0x`-prefixed string
 *
 * @example
 * ```typescript
 * // All these work
 * const hash1 = getTransactionHash(transactionResult);
 * const hash2 = getTransactionHash({ hash: '0x123...' });
 * const hash3 = getTransactionHash('0x123...');
 * ```
 *
 * @category Operations
 */
export function getTransactionHash(
  txOrHash: TransactionResult | { hash: Hash } | Hash,
): Hash {
  if (typeof txOrHash === "string") {
    return txOrHash;
  }
  return txOrHash.hash;
}
