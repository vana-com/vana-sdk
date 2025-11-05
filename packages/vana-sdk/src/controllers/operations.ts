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
import type { IOperationStore } from "../types/operationStore";
import type { IAtomicStore } from "../types/atomicStore";
import type { WalletClient, PublicClient, TransactionReceipt } from "viem";
import { BaseController } from "./base";
import { PollingManager } from "../core/pollingManager";
import { DistributedNonceManager } from "../core/nonceManager";
import { InMemoryNonceManager } from "../core/inMemoryNonceManager";
import { parseEther } from "viem";

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
  ): Promise<{ hash: string; receipt?: TransactionReceipt }> {
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
   * Processes queued operations from the operation store.
   *
   * @remarks
   * This method is designed for worker processes that handle asynchronous
   * operation processing. It fetches queued operations, processes them with
   * proper nonce management and gas escalation, and handles retries.
   *
   * This is typically called from a background worker or cron job to process
   * operations that were queued for asynchronous execution.
   *
   * @param config - Configuration for queue processing
   * @returns Promise resolving to processing results
   *
   * @example
   * ```typescript
   * // In a worker process
   * const results = await vana.operations.processQueue({
   *   operationStore,
   *   atomicStore,
   *   walletClient,
   *   publicClient,
   *   maxOperations: 10,
   *   onOperationComplete: (id, success) => {
   *     console.log(`Operation ${id}: ${success ? 'completed' : 'failed'}`);
   *   }
   * });
   *
   * console.log(`Processed ${results.processed} operations`);
   * ```
   */
  async processQueue(config: {
    operationStore: IOperationStore;
    atomicStore: IAtomicStore;
    walletClient: WalletClient;
    publicClient: PublicClient;
    maxOperations?: number;
    maxRetries?: number;
    gasEscalationFactor?: number;
    maxGasMultiplier?: number;
    onOperationComplete?: (operationId: string, success: boolean) => void;
    onError?: (operationId: string, error: Error) => void;
  }): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    errors: Array<{ operationId: string; error: string }>;
  }> {
    const {
      operationStore,
      atomicStore,
      walletClient,
      publicClient,
      maxOperations = 10,
      maxRetries = 3,
      gasEscalationFactor = 1.2,
      maxGasMultiplier = 3,
      onOperationComplete,
      onError,
    } = config;

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [] as Array<{ operationId: string; error: string }>,
    };

    // Initialize appropriate nonce manager based on configuration
    // If we have an atomicStore, use distributed nonce manager for multi-instance safety
    // Otherwise use in-memory for single-instance simplicity
    const nonceManager = atomicStore
      ? new DistributedNonceManager({
          atomicStore,
          publicClient,
        })
      : new InMemoryNonceManager(publicClient);

    // Get queued operations
    const operations = await operationStore.getQueuedOperations({
      limit: maxOperations,
    });

    console.log(
      `[OperationsController] Processing ${operations.length} queued operations`,
    );

    for (const operation of operations) {
      results.processed++;

      try {
        // Mark as processing
        await operationStore.updateStatus(operation.id, "processing");

        // Parse the stored transaction
        const storedTx = JSON.parse(operation.data, (_key, value) => {
          if (typeof value === "string" && value.startsWith("__BIGINT__")) {
            return BigInt(value.slice(10));
          }
          return value;
        });

        // Get chain ID from wallet client
        const chainId = await walletClient.getChainId();

        // Get relayer address
        const [address] = await walletClient.getAddresses();

        // Assign nonce atomically
        const nonce = await nonceManager.assignNonce(address, chainId);

        if (nonce === null || nonce === undefined) {
          throw new Error("Failed to acquire nonce");
        }

        // Calculate gas with escalation based on retry count
        const retryCount = operation.retryCount ?? 0;
        const gasMultiplier = Math.min(
          Math.pow(gasEscalationFactor, retryCount),
          maxGasMultiplier,
        );

        // Apply gas escalation
        const escalatedTx = {
          ...storedTx,
          nonce,
          maxFeePerGas: storedTx.maxFeePerGas
            ? BigInt(Math.floor(Number(storedTx.maxFeePerGas) * gasMultiplier))
            : undefined,
          maxPriorityFeePerGas: storedTx.maxPriorityFeePerGas
            ? BigInt(
                Math.floor(
                  Number(storedTx.maxPriorityFeePerGas) * gasMultiplier,
                ),
              )
            : undefined,
          gasPrice: storedTx.gasPrice
            ? BigInt(Math.floor(Number(storedTx.gasPrice) * gasMultiplier))
            : undefined,
        };

        console.log(
          `[OperationsController] Processing operation ${operation.id} with nonce ${nonce} (retry ${retryCount})`,
        );

        // Send transaction
        const hash = await walletClient.sendTransaction(escalatedTx);

        // Update status to submitted
        await operationStore.updateStatus(operation.id, "submitted", {
          hash,
          nonce,
          submittedAt: Date.now(),
        });

        console.log(
          `[OperationsController] Operation ${operation.id} submitted: ${hash}`,
        );

        // Wait for confirmation (with timeout)
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          timeout: 60000, // 1 minute timeout
        });

        if (receipt.status === "success") {
          // Update to completed
          await operationStore.updateStatus(operation.id, "completed", {
            receipt,
            completedAt: Date.now(),
          });

          results.succeeded++;
          onOperationComplete?.(operation.id, true);

          console.log(
            `[OperationsController] Operation ${operation.id} completed successfully`,
          );
        } else {
          // Transaction reverted
          throw new Error(`Transaction reverted: ${hash}`);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[OperationsController] Operation ${operation.id} failed:`,
          errorMessage,
        );

        results.failed++;
        results.errors.push({
          operationId: operation.id,
          error: errorMessage,
        });

        const retryCount = (operation.retryCount ?? 0) + 1;

        if (retryCount >= maxRetries) {
          // Max retries reached, mark as failed
          await operationStore.updateStatus(operation.id, "failed", {
            error: errorMessage,
            failedAt: Date.now(),
          });
        } else {
          // Return to queue for retry
          await operationStore.updateStatus(operation.id, "queued", {
            retryCount,
            lastError: errorMessage,
            lastAttemptAt: Date.now(),
          });
        }

        onOperationComplete?.(operation.id, false);
        onError?.(
          operation.id,
          error instanceof Error ? error : new Error(errorMessage),
        );
      }
    }

    return results;
  }

  /**
   * Burns a stuck nonce by sending a minimal self-transfer.
   *
   * @remarks
   * This method is used to unblock the transaction queue when a transaction
   * is stuck. It sends a minimal amount to the same address with the stuck
   * nonce and higher gas to ensure it gets mined.
   *
   * @param config - Configuration for nonce burning
   * @returns Promise resolving to the burn transaction hash
   *
   * @example
   * ```typescript
   * const hash = await vana.operations.burnStuckNonce({
   *   walletClient,
   *   publicClient,
   *   atomicStore,
   *   address: relayerAddress,
   *   stuckNonce: 42
   * });
   *
   * console.log(`Burned stuck nonce with tx: ${hash}`);
   * ```
   */
  async burnStuckNonce(config: {
    walletClient: WalletClient;
    publicClient: PublicClient;
    atomicStore: IAtomicStore;
    address: `0x${string}`;
    stuckNonce: number;
  }): Promise<string> {
    const { walletClient, publicClient, atomicStore, address, stuckNonce } =
      config;

    console.log(
      `[OperationsController] Burning stuck nonce ${stuckNonce} for ${address}`,
    );

    // Get current gas prices with 50% premium
    const gasPrice = await publicClient.getGasPrice();
    const premiumGasPrice = (gasPrice * 150n) / 100n;

    // Send minimal self-transfer
    const account = walletClient.account;
    if (!account) {
      throw new Error(
        "WalletClient must be configured with an account to burn stuck nonces",
      );
    }

    const hash = await walletClient.sendTransaction({
      account,
      chain: walletClient.chain,
      to: address,
      value: parseEther("0.00001"), // Minimal amount
      nonce: stuckNonce,
      gasPrice: premiumGasPrice,
      gas: 21000n, // Standard transfer gas
    });

    console.log(`[OperationsController] Nonce burn transaction sent: ${hash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 120000, // 2 minutes
    });

    if (receipt.status === "success") {
      console.log(
        `[OperationsController] Nonce ${stuckNonce} successfully burned`,
      );

      // Update stored nonce to reflect the burn
      const chainId = await walletClient.getChainId();
      const lastUsedKey = `nonce:${chainId}:${address}:lastUsed`;

      // Only update if this nonce was higher than stored
      const currentLastUsed = await atomicStore.get(lastUsedKey);
      if (!currentLastUsed || parseInt(currentLastUsed) < stuckNonce) {
        await atomicStore.set(lastUsedKey, stuckNonce.toString());
      }
    } else {
      throw new Error(`Nonce burn transaction failed: ${hash}`);
    }

    return hash;
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
