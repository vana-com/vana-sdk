/**
 * Health check and monitoring endpoint for the relayer system.
 *
 * Provides real-time status of:
 * - Redis connectivity
 * - Operation queue status
 * - Nonce synchronization
 * - Blockchain connectivity
 * - Worker process health
 */

import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RedisOperationStore } from "@/lib/operationStore";
import {
  RedisAtomicStore,
  DistributedNonceManager,
} from "@opendatalabs/vana-sdk/node";

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    redis: CheckResult;
    blockchain: CheckResult;
    nonce: CheckResult;
    operations: OperationsStatus;
    worker: WorkerStatus;
  };
  timestamp: string;
}

interface CheckResult {
  status: "ok" | "warning" | "error";
  message?: string;
  details?: any;
}

interface OperationsStatus extends CheckResult {
  stats?: {
    total: number;
    byStatus: Record<string, number>;
    oldestPending?: string;
  };
}

interface WorkerStatus extends CheckResult {
  lastRun?: string;
  nextRun?: string;
}

/**
 * GET /api/health/relayer
 *
 * Comprehensive health check for the relayer system.
 */
export async function GET() {
  const checks: HealthCheckResult["checks"] = {
    redis: { status: "error" },
    blockchain: { status: "error" },
    nonce: { status: "error" },
    operations: { status: "error" },
    worker: { status: "error" },
  };

  try {
    // Check Redis connectivity
    if (process.env.REDIS_URL) {
      try {
        const atomicStore = new RedisAtomicStore({
          redis: process.env.REDIS_URL,
        });

        // Test basic operation
        await atomicStore.set("health:check", Date.now().toString());
        const value = await atomicStore.get("health:check");

        if (value) {
          checks.redis = {
            status: "ok",
            message: "Redis connected and operational",
          };
        }

        if (atomicStore.delete) {
          await atomicStore.delete("health:check");
        }
        // Note: SDK's RedisAtomicStore manages connection internally
      } catch (error) {
        checks.redis = {
          status: "error",
          message: "Redis connection failed",
          details: error instanceof Error ? error.message : String(error),
        };
      }
    } else {
      checks.redis = {
        status: "warning",
        message: "Redis not configured (running in stateless mode)",
      };
    }

    // Check blockchain connectivity
    try {
      const chainId = process.env.NEXT_PUBLIC_MOKSHA === "true" ? 14800 : 1480;
      const rpcUrl =
        chainId === 14800
          ? (process.env.RPC_URL_VANA_MOKSHA ?? "https://rpc.moksha.vana.org")
          : (process.env.RPC_URL_VANA ?? "https://rpc.vana.org");

      const publicClient = createPublicClient({
        transport: http(rpcUrl),
      });

      const [blockNumber, gasPrice, network] = await Promise.all([
        publicClient.getBlockNumber(),
        publicClient.getGasPrice(),
        publicClient.getChainId(),
      ]);

      checks.blockchain = {
        status: "ok",
        message: "Blockchain connected",
        details: {
          network: network === 14800 ? "moksha" : "mainnet",
          blockNumber: blockNumber.toString(),
          gasPrice: gasPrice.toString(),
        },
      };
    } catch (error) {
      checks.blockchain = {
        status: "error",
        message: "Blockchain connection failed",
        details: error instanceof Error ? error.message : String(error),
      };
    }

    // Check nonce synchronization
    if (
      process.env.RELAYER_PRIVATE_KEY &&
      checks.redis.status === "ok" &&
      checks.blockchain.status === "ok"
    ) {
      try {
        const privateKey = process.env.RELAYER_PRIVATE_KEY;
        const account = privateKeyToAccount(privateKey as `0x${string}`);

        const chainId =
          process.env.NEXT_PUBLIC_MOKSHA === "true" ? 14800 : 1480;
        const rpcUrl =
          chainId === 14800
            ? (process.env.RPC_URL_VANA_MOKSHA ?? "https://rpc.moksha.vana.org")
            : (process.env.RPC_URL_VANA ?? "https://rpc.vana.org");

        const publicClient = createPublicClient({
          transport: http(rpcUrl),
        });

        const atomicStore = new RedisAtomicStore({
          redis: process.env.REDIS_URL!,
        });

        const nonceManager = new DistributedNonceManager({
          atomicStore,
          publicClient,
        });

        const state = await nonceManager.getNonceState(
          account.address,
          chainId,
        );

        // Check if nonce is in sync
        const isInSync =
          Math.abs(state.lastUsed - state.blockchainPending) <= 1;

        checks.nonce = {
          status: isInSync ? "ok" : "warning",
          message: isInSync ? "Nonce in sync" : "Nonce out of sync",
          details: {
            lastUsed: state.lastUsed,
            blockchainPending: state.blockchainPending,
            blockchainConfirmed: state.blockchainConfirmed,
            address: account.address,
          },
        };

        // SDK's RedisAtomicStore manages connection internally
      } catch (error) {
        checks.nonce = {
          status: "error",
          message: "Failed to check nonce state",
          details: error instanceof Error ? error.message : String(error),
        };
      }
    } else {
      checks.nonce = {
        status: "warning",
        message: "Nonce management not available",
      };
    }

    // Check operation queue status
    if (process.env.REDIS_URL) {
      try {
        const operationStore = new RedisOperationStore({
          redis: process.env.REDIS_URL,
        });

        const stats = await operationStore.getStats();

        // Determine health based on queue depth
        let status: "ok" | "warning" | "error" = "ok";
        let message = "Operation queue healthy";

        if (stats.total > 100) {
          status = "warning";
          message = "High operation queue depth";
        }

        if ((stats.byStatus.failed ?? 0) > 10) {
          status = "error";
          message = "High failure rate detected";
        }

        checks.operations = {
          status,
          message,
          stats: {
            ...stats,
            oldestPending: stats.oldestPending?.toISOString(),
          },
        };

        await operationStore.close();
      } catch (error) {
        checks.operations = {
          status: "error",
          message: "Failed to check operation queue",
          details: error instanceof Error ? error.message : String(error),
        };
      }
    } else {
      checks.operations = {
        status: "warning",
        message: "Operation store not configured",
      };
    }

    // Check worker process (simplified - would need actual worker status in production)
    if (process.env.REDIS_URL) {
      try {
        const atomicStore = new RedisAtomicStore({
          redis: process.env.REDIS_URL,
        });

        // Check for worker heartbeat
        const lastHeartbeat = await atomicStore.get("worker:heartbeat");

        if (lastHeartbeat) {
          const age = Date.now() - parseInt(lastHeartbeat);
          const isHealthy = age < 120000; // 2 minutes

          checks.worker = {
            status: isHealthy ? "ok" : "warning",
            message: isHealthy ? "Worker active" : "Worker may be stalled",
            lastRun: new Date(parseInt(lastHeartbeat)).toISOString(),
            nextRun: "Every minute (Vercel Cron)",
          };
        } else {
          checks.worker = {
            status: "warning",
            message: "No worker heartbeat found",
            nextRun: "Every minute (Vercel Cron)",
          };
        }

        // SDK's RedisAtomicStore manages connection internally
      } catch (error) {
        checks.worker = {
          status: "error",
          message: "Failed to check worker status",
          details: error instanceof Error ? error.message : String(error),
        };
      }
    } else {
      checks.worker = {
        status: "warning",
        message: "Worker not configured",
      };
    }
  } catch (error) {
    console.error("[Health] Unexpected error:", error);
  }

  // Determine overall health
  const hasError = Object.values(checks).some((c) => c.status === "error");
  const hasWarning = Object.values(checks).some((c) => c.status === "warning");

  const result: HealthCheckResult = {
    status: hasError ? "unhealthy" : hasWarning ? "degraded" : "healthy",
    checks,
    timestamp: new Date().toISOString(),
  };

  // Return appropriate HTTP status code
  const httpStatus = hasError ? 503 : 200;

  return NextResponse.json(result, { status: httpStatus });
}
