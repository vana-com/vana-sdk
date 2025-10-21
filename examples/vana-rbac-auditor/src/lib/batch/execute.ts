/**
 * Batch execution logic
 *
 * @remarks
 * Handles direct execution of batches through connected wallets.
 * Supports both regular wallets and Safe multi-sig wallets.
 */

import type { WalletClient, PublicClient } from "viem";
import type { Batch, BatchOperation, ExecutionStatus } from "./builder-types";

/**
 * Progress callback for execution updates
 */
export type ExecutionProgressCallback = (
  operationId: string,
  status: ExecutionStatus,
) => void;

/**
 * Execute a single operation
 *
 * @param operation - Operation to execute
 * @param walletClient - Viem wallet client
 * @param publicClient - Viem public client for waiting on receipts
 * @param onProgress - Progress callback
 */
async function executeOperation(
  operation: BatchOperation,
  walletClient: WalletClient,
  publicClient: PublicClient,
  onProgress?: ExecutionProgressCallback,
): Promise<void> {
  if (!walletClient.account) {
    throw new Error("No account connected");
  }

  try {
    // Notify simulating
    onProgress?.(operation.id, { state: "simulating" });

    // Build transaction data
    const abi = [
      {
        inputs: [
          { name: "role", type: "bytes32" },
          { name: "account", type: "address" },
        ],
        name: operation.method,
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
    ] as const;

    // Notify awaiting signature
    onProgress?.(operation.id, { state: "awaiting_signature" });

    // Execute the transaction
    const hash = await walletClient.writeContract({
      address: operation.contract.address as `0x${string}`,
      abi,
      functionName: operation.method,
      args: [
        operation.parameters.role as `0x${string}`,
        operation.parameters.account as `0x${string}`,
      ],
      account: walletClient.account,
      chain: walletClient.chain,
    } as never);

    // Notify executing
    onProgress?.(operation.id, { state: "executing", txHash: hash });

    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "success") {
      onProgress?.(operation.id, {
        state: "success",
        txHash: hash,
        blockNumber: receipt.blockNumber,
      });
    } else {
      onProgress?.(operation.id, {
        state: "failed",
        error: "Transaction reverted",
        txHash: hash,
      });
      throw new Error("Transaction reverted");
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    onProgress?.(operation.id, {
      state: "failed",
      error: errorMessage,
    });

    throw error;
  }
}

/**
 * Execute an entire batch sequentially
 *
 * @param batch - Batch to execute
 * @param walletClient - Viem wallet client
 * @param publicClient - Viem public client for waiting on receipts
 * @param onProgress - Progress callback
 */
export async function executeBatch(
  batch: Batch,
  walletClient: WalletClient,
  publicClient: PublicClient,
  onProgress?: ExecutionProgressCallback,
): Promise<void> {
  for (const operation of batch.operations) {
    // Mark as pending
    onProgress?.(operation.id, { state: "pending" });

    // Execute (throws on error)
    await executeOperation(operation, walletClient, publicClient, onProgress);
  }
}
