import type { Hash, TransactionReceipt as ViemReceipt, Address } from "viem";
import type { GetOperationResponse } from "../generated/server/server-exports";

/**
 * Server operation result as a plain object.
 * Fully serializable for API responses and cross-process communication.
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
 * Transaction submission result as a plain object.
 * Contains immediate transaction details without waiting for confirmation.
 */
export interface TransactionResult {
  /** Transaction hash */
  hash: Hash;
  /** Sender address */
  from?: Address;
  /** Recipient address */
  to?: Address;
  /** Transaction nonce */
  nonce?: number;
  /** Transaction value in wei */
  value?: bigint;
  /** Chain ID where transaction was submitted */
  chainId?: number;
}

/**
 * Extended transaction receipt with Vana-specific fields
 */
export interface TransactionReceipt extends ViemReceipt {
  /** Parsed event data if available */
  events?: unknown;
}

/**
 * Options for polling operations
 */
export interface PollingOptions {
  /** Polling interval in milliseconds (default: 500) */
  pollingInterval?: number;
  /** Maximum time to wait in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Options for waiting for transaction confirmation
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
 * @param obj - The object to validate as an Operation.
 * @returns `true` if the object has required Operation properties, `false` otherwise.
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
 * @param obj - The object to validate as a TransactionResult.
 * @returns `true` if the object has a valid transaction hash, `false` otherwise.
 */
export function isTransactionResult(obj: unknown): obj is TransactionResult {
  if (typeof obj !== "object" || obj === null || !("hash" in obj)) {
    return false;
  }
  const hash = (obj as Record<string, unknown>).hash;
  return typeof hash === "string" && hash.startsWith("0x");
}

/**
 * Converts a server response to an Operation POJO.
 *
 * @param response - The raw server response containing operation status data.
 * @returns An Operation object with normalized fields for client consumption.
 */
export function toOperation<T>(response: GetOperationResponse): Operation<T> {
  return {
    id: response.id,
    status: response.status as Operation["status"],
    createdAt: Date.now(), // Server doesn't provide this, so we use current time
    result:
      response.status === "succeeded" ? (response.result as T) : undefined,
    error:
      response.status === "failed" ? response.result || undefined : undefined,
  };
}

/**
 * Extracts the operation ID from flexible input types.
 *
 * @param opOrId - An Operation object containing an `id` field or a raw operation ID string.
 * @returns The operation ID string for use in API calls.
 */
export function getOperationId(opOrId: Operation | string): string {
  return typeof opOrId === "string" ? opOrId : opOrId.id;
}

/**
 * Extracts the transaction hash from flexible input types.
 *
 * @param txOrHash - A TransactionResult object, any object with a `hash` field, or a raw hash string.
 * @returns The transaction hash as a `0x`-prefixed string.
 */
export function getTransactionHash(
  txOrHash: TransactionResult | { hash: Hash } | Hash,
): Hash {
  if (typeof txOrHash === "string") {
    return txOrHash;
  }
  return txOrHash.hash;
}
