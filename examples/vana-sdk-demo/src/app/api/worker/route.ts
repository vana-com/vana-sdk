/**
 * Worker process for handling queued relayer operations.
 *
 * This endpoint should be triggered by a cron job (Vercel Cron, GitHub Actions, etc.)
 * to process pending transactions from the operation store.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  Vana,
  RedisAtomicStore,
  handleRelayerOperation,
  mokshaTestnet,
  vanaMainnet,
} from "@opendatalabs/vana-sdk/node";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RedisOperationStore } from "@/lib/operationStore";

// Configuration from environment
const MAX_RETRIES = parseInt(process.env.WORKER_MAX_RETRIES ?? "3");
const GAS_ESCALATION_FACTOR = parseFloat(
  process.env.WORKER_GAS_ESCALATION ?? "1.2",
); // 20% increase
const MAX_GAS_MULTIPLIER = parseFloat(
  process.env.WORKER_MAX_GAS_MULTIPLIER ?? "3",
); // 3x max
const MAX_OPERATIONS = parseInt(process.env.WORKER_MAX_OPERATIONS ?? "10");

/**
 * GET /api/worker
 *
 * Main worker endpoint triggered by cron job.
 * Processes pending operations from the store and retries stuck transactions.
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
    const chain = chainId === 14800 ? mokshaTestnet : vanaMainnet;
    const rpcUrl =
      chainId === 14800
        ? (process.env.RPC_URL_VANA_MOKSHA ?? "https://rpc.moksha.vana.org")
        : (process.env.RPC_URL_VANA ?? "https://rpc.vana.org");

    // Create clients
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    // Initialize SDK with the stores
    const vana = Vana({
      walletClient,
      operationStore,
      atomicStore,
    });

    // Process pending operations
    // Note: The demo app uses IRelayerStateStore (simpler interface) rather than
    // IOperationStore (required by SDK's processQueue), so we process manually
    const allPendingOps = (await operationStore.getByStatus?.("pending")) || [];
    const pendingOps = allPendingOps.slice(0, MAX_OPERATIONS);

    console.log(
      `[Worker] Found ${allPendingOps.length} pending operations, processing ${pendingOps.length}`,
    );

    const results = {
      processed: 0,
      confirmed: 0,
      failed: 0,
      retried: 0,
      errors: [] as string[],
    };

    // Process each operation
    for (const { operationId, state } of pendingOps) {
      try {
        console.log(`[Worker] Processing operation ${operationId}`);
        results.processed++;

        // Check if transaction is confirmed
        const receipt = await publicClient
          .getTransactionReceipt({
            hash: state.transactionHash,
          })
          .catch(() => null);

        if (receipt) {
          if (receipt.status === "success") {
            // Transaction confirmed successfully
            await operationStore.set(operationId, {
              ...state,
              status: "confirmed",
              finalReceipt: receipt as any,
            });
            results.confirmed++;
            console.log(`[Worker] Operation ${operationId} confirmed`);
          } else {
            // Transaction reverted
            await operationStore.set(operationId, {
              ...state,
              status: "failed",
              error: "Transaction reverted on chain",
            });
            results.failed++;
            console.log(`[Worker] Operation ${operationId} reverted`);
          }
        } else {
          // Transaction not found or stuck - retry with higher gas
          const age = Date.now() - state.submittedAt;

          if (age > 300000 && state.retryCount < MAX_RETRIES) {
            // 5 minutes
            console.log(`[Worker] Retrying stuck operation ${operationId}`);

            // Retry using the SDK's handleRelayerOperation with escalated gas
            const baseFeePerGas = await publicClient.getGasPrice();
            const escalationMultiplier = Math.min(
              Math.pow(GAS_ESCALATION_FACTOR, state.retryCount + 1),
              MAX_GAS_MULTIPLIER,
            );

            const maxFeePerGas = BigInt(
              Math.floor(Number(baseFeePerGas) * escalationMultiplier),
            );

            // Use handleRelayerOperation to retry - it handles nonce management internally
            const result = await handleRelayerOperation(
              vana,
              state.originalRequest,
              {
                maxFeePerGas,
                maxPriorityFeePerGas: BigInt(2e9), // 2 gwei
              },
            ).catch((error: Error) => ({
              type: "error" as const,
              error: error.message,
            }));

            if (result.type !== "error") {
              await operationStore.set(operationId, {
                ...state,
                retryCount: state.retryCount + 1,
                lastAttemptedGas: {
                  maxFeePerGas: maxFeePerGas.toString(),
                  maxPriorityFeePerGas: "2000000000",
                },
              });
              results.retried++;
            } else {
              results.failed++;
            }
          } else if (state.retryCount >= MAX_RETRIES) {
            // Max retries exceeded
            await operationStore.set(operationId, {
              ...state,
              status: "failed",
              error: `Max retries (${MAX_RETRIES}) exceeded`,
            });
            results.failed++;
            console.log(
              `[Worker] Operation ${operationId} failed after max retries`,
            );
          }
        }
      } catch (error) {
        console.error(
          `[Worker] Error processing operation ${operationId}:`,
          error,
        );
        results.errors.push(`${operationId}: ${String(error)}`);
      }
    }

    console.log(
      `[Worker] Processing complete: ${results.processed} processed, ${results.confirmed} confirmed, ${results.failed} failed, ${results.retried} retried`,
    );

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
      cleaned,
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
 * POST /api/worker
 *
 * Manual trigger for debugging or immediate processing.
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
