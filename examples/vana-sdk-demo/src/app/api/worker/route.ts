/**
 * Worker process for handling queued relayer operations.
 *
 * This endpoint should be triggered by a cron job (Vercel Cron, GitHub Actions, etc.)
 * to process pending transactions, retry failures, and burn stuck nonces.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  Vana,
  handleRelayerOperation,
  type IRelayerStateStore,
  type OperationState,
} from "@opendatalabs/vana-sdk/node";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hash,
  type Address,
  parseGwei,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RedisOperationStore } from "@/lib/operationStore";
import { RedisAtomicStore } from "@/lib/redisAtomicStore";
import { DistributedNonceManager } from "@opendatalabs/vana-sdk/node";

// Configuration from environment
const MAX_RETRIES = parseInt(process.env.WORKER_MAX_RETRIES ?? "3");
const GAS_ESCALATION_FACTOR = parseFloat(
  process.env.WORKER_GAS_ESCALATION ?? "1.2",
); // 20% increase
const MAX_GAS_MULTIPLIER = parseFloat(
  process.env.WORKER_MAX_GAS_MULTIPLIER ?? "3",
); // 3x max
const STUCK_TRANSACTION_TIMEOUT = parseInt(
  process.env.WORKER_STUCK_TIMEOUT ?? "300000",
); // 5 minutes
const BURN_NONCE_ENABLED = process.env.WORKER_BURN_NONCE === "true";

/**
 * GET /api/worker
 *
 * Main worker endpoint triggered by cron job.
 * Processes all pending operations in the queue.
 */
export async function GET(request: NextRequest) {
  // Verify authorization (basic auth or API key)
  const authHeader = request.headers.get("authorization");
  const expectedAuth = process.env.WORKER_AUTH_TOKEN;

  if (expectedAuth && authHeader !== `Bearer ${expectedAuth}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Worker] Starting operation processing");

  try {
    // Initialize stores
    const operationStore = new RedisOperationStore({
      redis: process.env.REDIS_URL!,
    });

    const atomicStore = new RedisAtomicStore({
      redis: process.env.REDIS_URL!,
    });

    // Update worker heartbeat
    await atomicStore.set("worker:heartbeat", Date.now().toString());
    console.log("[Worker] Updated heartbeat");

    // Get relayer configuration
    const privateKey = process.env.RELAYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("RELAYER_PRIVATE_KEY not configured");
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const chainId = process.env.NEXT_PUBLIC_MOKSHA === "true" ? 14800 : 1480;
    const rpcUrl =
      chainId === 14800
        ? (process.env.RPC_URL_VANA_MOKSHA ?? "https://rpc.moksha.vana.org")
        : (process.env.RPC_URL_VANA ?? "https://rpc.vana.org");

    // Create clients
    const publicClient = createPublicClient({
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      transport: http(rpcUrl),
    });

    // Initialize SDK with wallet client
    const vana = Vana({
      walletClient,
      operationStore,
      atomicStore,
    });

    // Get all pending operations
    const pendingOps = await operationStore.getByStatus("pending");
    console.log(`[Worker] Found ${pendingOps.length} pending operations`);

    const results = {
      processed: 0,
      confirmed: 0,
      failed: 0,
      retried: 0,
      nonceBurned: 0,
      errors: [] as string[],
    };

    // Process each operation
    for (const { operationId, state } of pendingOps) {
      try {
        console.log(`[Worker] Processing operation ${operationId}`);

        // Check if transaction is confirmed
        const receipt = await checkTransactionStatus(
          publicClient,
          state.transactionHash,
        );

        if (receipt) {
          if (receipt.status === "success") {
            // Transaction confirmed successfully
            const updatedState: OperationState = {
              ...state,
              status: "confirmed",
              finalReceipt: receipt as any,
            };
            await operationStore.set(operationId, updatedState);
            results.confirmed++;
            console.log(`[Worker] Operation ${operationId} confirmed`);
          } else {
            // Transaction reverted
            const updatedState: OperationState = {
              ...state,
              status: "failed",
              error: "Transaction reverted on chain",
            };
            await operationStore.set(operationId, updatedState);
            results.failed++;
            console.log(`[Worker] Operation ${operationId} reverted`);
          }
        } else {
          // Transaction not found or stuck
          const age = Date.now() - state.submittedAt;

          if (age > STUCK_TRANSACTION_TIMEOUT) {
            console.log(
              `[Worker] Operation ${operationId} is stuck (age: ${age}ms)`,
            );

            // Check if we should burn the nonce
            if (BURN_NONCE_ENABLED && state.nonce !== undefined) {
              const burned = await burnStuckNonce(
                walletClient,
                publicClient,
                account.address,
                state.nonce,
                state.lastAttemptedGas,
              );

              if (burned) {
                results.nonceBurned++;
                console.log(
                  `[Worker] Burned nonce ${state.nonce} for operation ${operationId}`,
                );
              }
            }

            // Retry the operation with higher gas
            if (state.retryCount < MAX_RETRIES) {
              const retried = await retryOperation(
                vana,
                operationStore,
                atomicStore,
                operationId,
                state,
                publicClient,
              );

              if (retried) {
                results.retried++;
              } else {
                results.failed++;
              }
            } else {
              // Max retries exceeded
              const updatedState: OperationState = {
                ...state,
                status: "failed",
                error: `Max retries (${MAX_RETRIES}) exceeded`,
              };
              await operationStore.set(operationId, updatedState);
              results.failed++;
              console.log(
                `[Worker] Operation ${operationId} failed after max retries`,
              );
            }
          }
        }

        results.processed++;
      } catch (error) {
        console.error(
          `[Worker] Error processing operation ${operationId}:`,
          error,
        );
        results.errors.push(`${operationId}: ${String(error)}`);
      }
    }

    // Cleanup old operations (if supported by the store implementation)
    let cleaned = 0;
    if (
      "cleanup" in operationStore &&
      typeof (operationStore as any).cleanup === "function"
    ) {
      cleaned = await (operationStore as any).cleanup();
      console.log(`[Worker] Cleaned up ${cleaned} old operations`);
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Worker] Fatal error:", error);
    return NextResponse.json(
      {
        error: "Worker process failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * Checks if a transaction is confirmed on the blockchain.
 */
async function checkTransactionStatus(publicClient: any, txHash: Hash) {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    return receipt;
  } catch (error: any) {
    if (error?.name === "TransactionReceiptNotFoundError") {
      // Transaction not mined yet
      return null;
    }
    throw error;
  }
}

/**
 * Retries an operation with escalated gas prices.
 */
async function retryOperation(
  vana: any,
  operationStore: IRelayerStateStore,
  atomicStore: any,
  operationId: string,
  state: OperationState,
  publicClient: any,
): Promise<boolean> {
  try {
    console.log(
      `[Worker] Retrying operation ${operationId} (attempt ${state.retryCount + 1})`,
    );

    // Calculate escalated gas prices
    const baseFeePerGas = await publicClient.getGasPrice();
    const escalationMultiplier = Math.min(
      Math.pow(GAS_ESCALATION_FACTOR, state.retryCount + 1),
      MAX_GAS_MULTIPLIER,
    );

    const maxFeePerGas = BigInt(
      Math.floor(Number(baseFeePerGas) * escalationMultiplier),
    );
    const maxPriorityFeePerGas = parseGwei("2"); // 2 gwei priority fee

    console.log(
      `[Worker] Using gas prices - maxFee: ${maxFeePerGas}, priority: ${maxPriorityFeePerGas}`,
    );

    // Get new nonce using distributed manager
    const nonceManager = new DistributedNonceManager({
      atomicStore,
      publicClient,
    });

    const chainId = await publicClient.getChainId();
    const privateKey = process.env.RELAYER_PRIVATE_KEY!;
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const newNonce = await nonceManager.assignNonce(account.address, chainId);

    if (newNonce === null) {
      console.error(`[Worker] Failed to get nonce for retry`);
      return false;
    }

    // Retry the original request with new gas and nonce
    const result = await handleRelayerOperation(vana, state.originalRequest, {
      nonce: newNonce,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    if (result.type === "pending" && result.operationId) {
      // Update the operation with new attempt
      const updatedState: OperationState = {
        ...state,
        retryCount: state.retryCount + 1,
        lastAttemptedGas: {
          maxFeePerGas: maxFeePerGas.toString(),
          maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
        },
      };
      await operationStore.set(operationId, updatedState);

      console.log(`[Worker] Retry submitted for operation ${operationId}`);
      return true;
    } else if (result.type === "error") {
      console.error(
        `[Worker] Retry failed for operation ${operationId}: ${result.error}`,
      );
      const updatedState: OperationState = {
        ...state,
        status: "failed",
        error: result.error ?? "Retry failed",
      };
      await operationStore.set(operationId, updatedState);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[Worker] Error retrying operation ${operationId}:`, error);
    return false;
  }
}

/**
 * Burns a stuck nonce by sending a minimal self-transfer with higher gas.
 * This unblocks the queue by replacing the stuck transaction.
 */
async function burnStuckNonce(
  walletClient: any,
  publicClient: any,
  address: Address,
  nonce: number,
  lastGas?: { maxFeePerGas?: string; maxPriorityFeePerGas?: string },
): Promise<boolean> {
  try {
    console.log(`[Worker] Burning stuck nonce ${nonce} for ${address}`);

    // Calculate higher gas prices to replace the stuck transaction
    const baseFeePerGas = await publicClient.getGasPrice();
    const lastMaxFee = lastGas?.maxFeePerGas
      ? BigInt(lastGas.maxFeePerGas)
      : baseFeePerGas;

    // Increase by 50% to ensure replacement
    const maxFeePerGas = (lastMaxFee * 150n) / 100n;
    const maxPriorityFeePerGas = parseGwei("5"); // Higher priority

    // Send minimal self-transfer to burn the nonce
    const hash = await walletClient.sendTransaction({
      to: address, // Self-transfer
      value: 0n, // Zero value
      nonce,
      maxFeePerGas,
      maxPriorityFeePerGas,
      gas: 21000n, // Minimal gas for transfer
    });

    console.log(`[Worker] Nonce burn transaction sent: ${hash}`);

    // Wait for confirmation (with timeout)
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 30000, // 30 seconds
    });

    if (receipt.status === "success") {
      console.log(`[Worker] Nonce ${nonce} successfully burned`);
      return true;
    } else {
      console.error(`[Worker] Nonce burn transaction reverted`);
      return false;
    }
  } catch (error) {
    console.error(`[Worker] Error burning nonce ${nonce}:`, error);
    return false;
  }
}

/**
 * POST /api/worker
 *
 * Manual trigger for debugging or immediate processing.
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
