/**
 * System health monitoring for distributed relayer deployments.
 *
 * @module
 */

import type { IAtomicStore } from "../types/atomicStore";
import type { IOperationStore } from "../types/operationStore";
import type { PublicClient } from "viem";

/**
 * Configuration for SystemHealthChecker.
 */
export interface SystemHealthCheckerConfig {
  /** Atomic store for distributed state */
  atomicStore: IAtomicStore;
  /** Operation store for queue state */
  operationStore: IOperationStore;
  /** Public client for blockchain queries */
  publicClient: PublicClient;
  /** Chain ID to monitor */
  chainId: number;
  /** Addresses to monitor (optional) */
  addresses?: string[];
  /** Stale threshold in seconds (default: 300) */
  staleThresholdSeconds?: number;
}

/**
 * Health status for the system.
 */
export interface HealthStatus {
  /** Overall health status */
  status: "healthy" | "degraded" | "unhealthy";
  /** Timestamp of the check */
  timestamp: number;
  /** Individual component checks */
  checks: {
    atomicStore: ComponentHealth;
    operationStore: ComponentHealth;
    blockchain: ComponentHealth;
    nonces?: NonceHealth[];
    queue?: QueueHealth;
  };
  /** Any error messages */
  errors?: string[];
}

/**
 * Health status for a component.
 */
export interface ComponentHealth {
  status: "healthy" | "degraded" | "unhealthy";
  message?: string;
  latency?: number;
}

/**
 * Nonce health for an address.
 */
export interface NonceHealth {
  address: string;
  status: "healthy" | "stuck" | "desynced";
  lastUsed: number;
  blockchainPending: number;
  blockchainConfirmed: number;
  gap?: number;
}

/**
 * Queue health information.
 */
export interface QueueHealth {
  pendingCount: number;
  processingCount: number;
  failedCount: number;
  oldestPending?: number;
  isStale: boolean;
}

/**
 * System health checker for monitoring distributed relayer deployments.
 *
 * @remarks
 * This class provides comprehensive health monitoring for relayer systems:
 * - Storage backend connectivity and performance
 * - Blockchain RPC availability
 * - Nonce synchronization status
 * - Operation queue health
 * - Stuck transaction detection
 *
 * @example
 * ```typescript
 * const healthChecker = new SystemHealthChecker({
 *   atomicStore,
 *   operationStore,
 *   publicClient,
 *   chainId: 14800,
 *   addresses: [relayerAddress]
 * });
 *
 * const health = await healthChecker.check();
 * if (health.status === 'unhealthy') {
 *   console.error('System unhealthy:', health.errors);
 * }
 * ```
 *
 * @category Health
 */
export class SystemHealthChecker {
  private readonly config: Required<SystemHealthCheckerConfig>;

  constructor(config: SystemHealthCheckerConfig) {
    this.config = {
      ...config,
      addresses: config.addresses ?? [],
      staleThresholdSeconds: config.staleThresholdSeconds ?? 300,
    };
  }

  /**
   * Performs a comprehensive health check of the system.
   *
   * @returns The health status of the system
   */
  async check(): Promise<HealthStatus> {
    const timestamp = Date.now();
    const errors: string[] = [];

    // Check atomic store
    const atomicStore = await this.checkAtomicStore();
    if (atomicStore.status !== "healthy") {
      errors.push(`Atomic store ${atomicStore.status}: ${atomicStore.message}`);
    }

    // Check operation store
    const operationStore = await this.checkOperationStore();
    if (operationStore.status !== "healthy") {
      errors.push(
        `Operation store ${operationStore.status}: ${operationStore.message}`,
      );
    }

    // Check blockchain connectivity
    const blockchain = await this.checkBlockchain();
    if (blockchain.status !== "healthy") {
      errors.push(`Blockchain ${blockchain.status}: ${blockchain.message}`);
    }

    // Check nonces if addresses provided
    let nonces: NonceHealth[] | undefined;
    if (this.config.addresses.length > 0) {
      nonces = await this.checkNonces();
      for (const nonce of nonces) {
        if (nonce.status !== "healthy") {
          errors.push(`Nonce ${nonce.status} for ${nonce.address}`);
        }
      }
    }

    // Check queue health
    const queue = await this.checkQueue();
    if (queue && queue.isStale) {
      errors.push(
        `Queue is stale (oldest pending: ${queue.oldestPending}s ago)`,
      );
    }

    // Determine overall status
    let status: "healthy" | "degraded" | "unhealthy";
    if (errors.length === 0) {
      status = "healthy";
    } else if (
      atomicStore.status === "unhealthy" ||
      operationStore.status === "unhealthy" ||
      blockchain.status === "unhealthy"
    ) {
      status = "unhealthy";
    } else {
      status = "degraded";
    }

    return {
      status,
      timestamp,
      checks: {
        atomicStore,
        operationStore,
        blockchain,
        nonces,
        queue,
      },
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Checks the health of the atomic store.
   */
  private async checkAtomicStore(): Promise<ComponentHealth> {
    try {
      const start = Date.now();
      const testKey = `health:check:${Date.now()}`;

      // Test basic operations
      await this.config.atomicStore.set(testKey, "test");
      const value = await this.config.atomicStore.get(testKey);

      if (value !== "test") {
        return {
          status: "unhealthy",
          message: "Atomic store read/write test failed",
        };
      }

      // Clean up
      if (this.config.atomicStore.delete) {
        await this.config.atomicStore.delete(testKey);
      }

      const latency = Date.now() - start;

      if (latency > 1000) {
        return {
          status: "degraded",
          message: `High latency: ${latency}ms`,
          latency,
        };
      }

      return {
        status: "healthy",
        latency,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Checks the health of the operation store.
   */
  private async checkOperationStore(): Promise<ComponentHealth> {
    try {
      const start = Date.now();

      // Test basic query
      await this.config.operationStore.getQueuedOperations({ limit: 1 });

      const latency = Date.now() - start;

      if (latency > 2000) {
        return {
          status: "degraded",
          message: `High latency: ${latency}ms`,
          latency,
        };
      }

      return {
        status: "healthy",
        latency,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Checks blockchain connectivity.
   */
  private async checkBlockchain(): Promise<ComponentHealth> {
    try {
      const start = Date.now();

      // Test RPC connectivity
      const blockNumber = await this.config.publicClient.getBlockNumber();

      if (blockNumber === 0n) {
        return {
          status: "unhealthy",
          message: "Invalid block number",
        };
      }

      const latency = Date.now() - start;

      if (latency > 5000) {
        return {
          status: "degraded",
          message: `High latency: ${latency}ms`,
          latency,
        };
      }

      return {
        status: "healthy",
        latency,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Checks nonce synchronization for configured addresses.
   */
  private async checkNonces(): Promise<NonceHealth[]> {
    const results: NonceHealth[] = [];

    for (const address of this.config.addresses) {
      try {
        const lastUsedKey = `nonce:${this.config.chainId}:${address}:lastUsed`;

        // Get stored nonce
        const lastUsedStr = await this.config.atomicStore.get(lastUsedKey);
        const lastUsed = lastUsedStr ? parseInt(lastUsedStr) : -1;

        // Get blockchain nonces
        const [pendingCount, confirmedCount] = await Promise.all([
          this.config.publicClient.getTransactionCount({
            address: address as `0x${string}`,
            blockTag: "pending",
          }),
          this.config.publicClient.getTransactionCount({
            address: address as `0x${string}`,
            blockTag: "latest",
          }),
        ]);

        const blockchainPending =
          pendingCount === 0 ? -1 : Number(pendingCount) - 1;
        const blockchainConfirmed =
          confirmedCount === 0 ? -1 : Number(confirmedCount) - 1;

        // Determine status
        let status: "healthy" | "stuck" | "desynced";
        const gap = blockchainPending - blockchainConfirmed;

        if (lastUsed < blockchainConfirmed) {
          status = "desynced";
        } else if (gap > 5) {
          status = "stuck";
        } else {
          status = "healthy";
        }

        results.push({
          address,
          status,
          lastUsed,
          blockchainPending,
          blockchainConfirmed,
          gap: gap > 0 ? gap : undefined,
        });
      } catch {
        results.push({
          address,
          status: "desynced",
          lastUsed: -1,
          blockchainPending: -1,
          blockchainConfirmed: -1,
        });
      }
    }

    return results;
  }

  /**
   * Checks operation queue health.
   */
  private async checkQueue(): Promise<QueueHealth | undefined> {
    try {
      const [pending, processing, failed] = await Promise.all([
        this.config.operationStore.getQueuedOperations({ limit: 100 }),
        this.config.operationStore.getProcessingOperations?.({ limit: 100 }),
        this.config.operationStore.getFailedOperations?.({ limit: 100 }),
      ]);

      const pendingCount = pending.length;
      const processingCount = processing?.length ?? 0;
      const failedCount = failed?.length ?? 0;

      // Check for stale operations
      let oldestPending: number | undefined;
      let isStale = false;

      if (pendingCount > 0 && pending[0].createdAt) {
        const ageSeconds = Math.floor(
          (Date.now() - pending[0].createdAt) / 1000,
        );
        oldestPending = ageSeconds;
        isStale = ageSeconds > this.config.staleThresholdSeconds;
      }

      return {
        pendingCount,
        processingCount,
        failedCount,
        oldestPending,
        isStale,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Gets a simple health check response for HTTP endpoints.
   *
   * @returns A simple health object suitable for JSON response
   */
  async getSimpleHealth(): Promise<{
    healthy: boolean;
    status: string;
    timestamp: number;
    errors?: string[];
  }> {
    const health = await this.check();

    return {
      healthy: health.status === "healthy",
      status: health.status,
      timestamp: health.timestamp,
      errors: health.errors,
    };
  }
}
