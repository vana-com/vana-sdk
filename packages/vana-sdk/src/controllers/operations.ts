/**
 * Operations controller for managing and recovering asynchronous relayer operations.
 *
 * @module
 */

import type { ControllerContext } from "./permissions";
import type { OperationStatus } from "../types/options";
import type {
  UnifiedRelayerRequest,
  UnifiedRelayerResponse,
} from "../types/relayer";
import { BaseController } from "./base";
import { PollingManager } from "../core/pollingManager";

/**
 * Controller for managing asynchronous operations.
 *
 * This controller provides methods to check the status of pending operations
 * and recover from interrupted transactions.
 *
 * @category Controllers
 * @example
 * ```typescript
 * // Recover an orphaned operation
 * try {
 *   const result = await vana.permissions.grant(...);
 * } catch (error) {
 *   if (error instanceof TransactionPendingError) {
 *     // Save the operation ID
 *     localStorage.setItem('pendingOp', error.operationId);
 *
 *     // Later, check the status
 *     const operationId = localStorage.getItem('pendingOp');
 *     const status = await vana.operations.getStatus(operationId);
 *
 *     if (status.type === 'confirmed') {
 *       console.log('Transaction confirmed:', status.receipt);
 *     }
 *   }
 * }
 * ```
 */
export class OperationsController extends BaseController {
  constructor(context: ControllerContext) {
    super(context);
  }

  /**
   * Gets the current status of an operation.
   *
   * @remarks
   * This method allows recovery of operations that were interrupted due to:
   * - Browser tab closure
   * - Network disconnection
   * - Application errors
   * - Timeout during polling
   *
   * The method queries the backend for the current operation state without
   * starting a new polling session.
   *
   * @param operationId - The unique identifier of the operation to check
   * @returns Promise resolving to the current operation status
   * @throws {Error} When relayer is not configured
   * @throws {Error} When operation is not found
   *
   * @example
   * ```typescript
   * const status = await vana.operations.getStatus('550e8400-e29b-41d4-a716-446655440000');
   *
   * switch(status.type) {
   *   case 'pending':
   *     console.log('Still processing...');
   *     break;
   *   case 'queued':
   *     console.log(`Position in queue: ${status.position}`);
   *     break;
   *   case 'confirmed':
   *     console.log(`Transaction confirmed: ${status.receipt.transactionHash}`);
   *     break;
   *   case 'failed':
   *     console.error(`Operation failed: ${status.error}`);
   *     break;
   * }
   * ```
   */
  async getStatus(operationId: string): Promise<OperationStatus> {
    if (!this.context.relayer) {
      throw new Error("Relayer not configured");
    }

    const request: UnifiedRelayerRequest = {
      type: "status_check",
      operationId,
    };

    const response = await this.context.relayer(request);

    return this.mapResponseToStatus(response, operationId);
  }

  /**
   * Waits for an operation to complete and returns the final result.
   *
   * @remarks
   * This method is useful for resuming polling of an operation that was
   * previously interrupted. Unlike `getStatus`, this method will actively
   * poll until the operation reaches a final state (confirmed or failed).
   *
   * @param operationId - The unique identifier of the operation to wait for
   * @param options - Optional configuration for polling behavior
   * @returns Promise resolving when the operation is confirmed
   * @throws {TransactionPendingError} When polling times out
   * @throws {Error} When the operation fails
   *
   * @example
   * ```typescript
   * // Resume polling with status updates
   * const result = await vana.operations.waitForConfirmation(operationId, {
   *   onStatusUpdate: (status) => {
   *     console.log(`Current status: ${status.type}`);
   *   },
   *   timeout: 600000 // 10 minutes
   * });
   *
   * console.log('Transaction confirmed:', result.hash);
   * ```
   */
  async waitForConfirmation(
    operationId: string,
    options?: {
      signal?: AbortSignal;
      onStatusUpdate?: (status: OperationStatus) => void;
      timeout?: number;
      initialInterval?: number;
      maxInterval?: number;
    },
  ): Promise<{ hash: string; receipt?: any }> {
    if (!this.context.relayer) {
      throw new Error("Relayer not configured");
    }

    // First check if already completed
    const currentStatus = await this.getStatus(operationId);

    if (currentStatus.type === "confirmed") {
      return {
        hash: currentStatus.hash,
        receipt: currentStatus.receipt,
      };
    }

    if (currentStatus.type === "failed") {
      throw new Error(currentStatus.error);
    }

    // Start polling if still pending
    const pollingManager = new PollingManager(this.context.relayer);

    return await pollingManager.startPolling(operationId, {
      signal: options?.signal,
      onStatusUpdate: options?.onStatusUpdate,
      timeout: options?.timeout,
      initialInterval: options?.initialInterval,
      maxInterval: options?.maxInterval,
    });
  }

  /**
   * Cancels a pending operation if supported by the backend.
   *
   * @remarks
   * Not all backends support operation cancellation. This method will
   * attempt to cancel the operation but success is not guaranteed.
   *
   * @param operationId - The unique identifier of the operation to cancel
   * @returns Promise resolving to true if cancellation was successful
   * @throws {Error} When cancellation is not supported or fails
   *
   * @example
   * ```typescript
   * try {
   *   const cancelled = await vana.operations.cancel(operationId);
   *   if (cancelled) {
   *     console.log('Operation cancelled successfully');
   *   }
   * } catch (error) {
   *   console.error('Failed to cancel operation:', error);
   * }
   * ```
   */
  async cancel(_operationId: string): Promise<boolean> {
    if (!this.context.relayer) {
      throw new Error("Relayer not configured");
    }

    // This would require a new request type in the relayer protocol
    // For now, we'll throw an error indicating it's not implemented
    throw new Error("Operation cancellation is not yet implemented");

    // Future implementation would look like:
    // const request: UnifiedRelayerRequest = {
    //   type: 'cancel_operation',
    //   operationId: _operationId
    // };
    //
    // const response = await this.context.relayer(request);
    // return response.type === 'success';
  }

  /**
   * Maps a relayer response to an OperationStatus object.
   * @internal
   */
  private mapResponseToStatus(
    response: UnifiedRelayerResponse,
    operationId: string,
  ): OperationStatus {
    switch (response.type) {
      case "pending":
        return {
          type: "pending",
          operationId: response.operationId,
        };

      case "submitted":
        return {
          type: "submitted",
          hash: response.hash,
        };

      case "confirmed":
        return {
          type: "confirmed",
          hash: response.hash,
          receipt: response.receipt,
        };

      case "error":
        return {
          type: "failed",
          error: response.error || "Unknown error",
          operationId,
        };

      case "signed":
        // Signed responses are considered submitted
        return {
          type: "submitted",
          hash: response.hash,
        };

      case "direct":
        // Direct responses are immediately confirmed
        // For direct operations, we don't have a transaction hash
        return {
          type: "confirmed",
          hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
          receipt: undefined,
        };

      default:
        // Handle other response types as pending
        return {
          type: "pending",
          operationId,
        };
    }
  }
}
