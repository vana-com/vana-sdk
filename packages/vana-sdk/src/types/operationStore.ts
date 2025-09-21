/**
 * Operation storage interfaces for queuing and managing asynchronous operations.
 *
 * @module
 */

import type { Hash, TransactionReceipt } from "viem";
import type { UnifiedRelayerRequest } from "./relayer";

/**
 * The state of an asynchronous, relayed operation.
 *
 * @remarks
 * This is the data the application backend is responsible for persisting.
 * It serves as a complete recovery log for a given operation.
 *
 * @category Operations
 */
export interface OperationState {
  status: "pending" | "confirmed" | "failed";
  transactionHash: Hash;
  originalRequest: UnifiedRelayerRequest;
  nonce?: number;
  retryCount: number;
  lastAttemptedGas: { maxFeePerGas?: string; maxPriorityFeePerGas?: string };
  submittedAt: number; // Unix timestamp (ms)
  finalReceipt?: TransactionReceipt;
  error?: string;
}

/**
 * Simple storage interface for operation state tracking.
 *
 * @remarks
 * This interface is used by the relayer handler to track operation state
 * in a stateful mode. Implementations can use any backend storage system.
 *
 * @category Operations
 */
export interface IRelayerStateStore {
  /**
   * Gets the state of an operation.
   *
   * @param operationId - The operation ID
   * @returns The operation state or null if not found
   */
  get(operationId: string): Promise<OperationState | null>;

  /**
   * Sets the state of an operation.
   *
   * @param operationId - The operation ID
   * @param state - The operation state to store
   */
  set(operationId: string, state: OperationState): Promise<void>;
}

/**
 * Represents a stored operation in the queue.
 */
export interface StoredOperation {
  /** Unique identifier for the operation */
  id: string;
  /** Current status of the operation */
  status: "queued" | "processing" | "submitted" | "completed" | "failed";
  /** Serialized transaction or operation data */
  data: string;
  /** Number of retry attempts */
  retryCount?: number;
  /** Timestamp when the operation was created */
  createdAt?: number;
  /** Additional metadata */
  metadata?: any;
}

/**
 * Interface for operation storage backends.
 *
 * @remarks
 * Implementations of this interface provide persistent storage for queued
 * operations in a distributed relayer system. This allows operations to
 * be processed asynchronously and recovered after failures.
 *
 * Common implementations include:
 * - PostgreSQL for production environments
 * - MongoDB for document-based storage
 * - DynamoDB for serverless deployments
 * - In-memory storage for testing
 *
 * @example
 * ```typescript
 * class PostgresOperationStore implements IOperationStore {
 *   async storeOperation(operation) {
 *     await this.db.query(
 *       'INSERT INTO operations (id, status, data) VALUES ($1, $2, $3)',
 *       [operation.id, 'queued', operation.data]
 *     );
 *   }
 *
 *   async getQueuedOperations(options) {
 *     const result = await this.db.query(
 *       'SELECT * FROM operations WHERE status = $1 LIMIT $2',
 *       ['queued', options.limit || 100]
 *     );
 *     return result.rows;
 *   }
 * }
 * ```
 *
 * @category Storage
 */
export interface IOperationStore {
  /**
   * Stores a new operation in the queue.
   *
   * @param operation - The operation to store
   * @returns Promise that resolves when the operation is stored
   */
  storeOperation(operation: {
    id: string;
    data: any;
    metadata?: any;
  }): Promise<void>;

  /**
   * Retrieves queued operations for processing.
   *
   * @param options - Query options
   * @returns Promise resolving to an array of queued operations
   */
  getQueuedOperations(options?: { limit?: number }): Promise<StoredOperation[]>;

  /**
   * Updates the status of an operation.
   *
   * @param operationId - The ID of the operation to update
   * @param status - The new status
   * @param metadata - Optional metadata to store with the update
   * @returns Promise that resolves when the status is updated
   */
  updateStatus(
    operationId: string,
    status: string,
    metadata?: any,
  ): Promise<void>;

  /**
   * Gets operations currently being processed.
   *
   * @param options - Query options
   * @returns Promise resolving to an array of processing operations
   */
  getProcessingOperations?(options?: {
    limit?: number;
  }): Promise<StoredOperation[]>;

  /**
   * Gets failed operations.
   *
   * @param options - Query options
   * @returns Promise resolving to an array of failed operations
   */
  getFailedOperations?(options?: {
    limit?: number;
  }): Promise<StoredOperation[]>;

  /**
   * Gets the status of a specific operation.
   *
   * @param operationId - The ID of the operation to check
   * @returns Promise resolving to the operation or null if not found
   */
  getOperation?(operationId: string): Promise<StoredOperation | null>;

  /**
   * Deletes an operation from storage.
   *
   * @param operationId - The ID of the operation to delete
   * @returns Promise that resolves when the operation is deleted
   */
  deleteOperation?(operationId: string): Promise<void>;
}
