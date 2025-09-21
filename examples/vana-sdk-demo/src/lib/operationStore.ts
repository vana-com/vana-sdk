/**
 * Production-ready Redis implementation of IOperationStore for the Vana SDK stateful relayer.
 *
 * This implementation provides persistent storage for operation state with:
 * - Atomic state transitions
 * - TTL-based cleanup of old operations
 * - JSON serialization for complex state objects
 * - BigInt handling for gas values
 * - Monitoring and debugging capabilities
 */

import Redis, { type RedisOptions } from "ioredis";
import type {
  IOperationStore,
  OperationState,
} from "@opendatalabs/vana-sdk/node";

export interface RedisOperationStoreConfig {
  /** Redis connection URL or options */
  redis: string | RedisOptions;
  /** TTL for operation records in seconds (default: 86400 = 24 hours) */
  operationTTL?: number;
  /** Key prefix for all operations (default: 'relay:ops') */
  keyPrefix?: string;
}

/**
 * Helper to serialize BigInt values in JSON.
 * Converts BigInt to strings with a special marker.
 */
function serializeBigInt(obj: any): string {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "bigint") {
      return `__BIGINT__${value.toString()}`;
    }
    return value;
  });
}

/**
 * Helper to deserialize BigInt values from JSON.
 * Converts marked strings back to BigInt.
 */
function deserializeBigInt(str: string): any {
  return JSON.parse(str, (key, value) => {
    if (typeof value === "string" && value.startsWith("__BIGINT__")) {
      return BigInt(value.slice(10));
    }
    return value;
  });
}

/**
 * Redis-backed implementation of IOperationStore for production use.
 *
 * @example
 * ```typescript
 * const operationStore = new RedisOperationStore({
 *   redis: process.env.REDIS_URL!,
 *   operationTTL: 86400 // 24 hours
 * });
 *
 * // Use with Vana SDK
 * const vana = Vana({
 *   privateKey: process.env.RELAYER_PRIVATE_KEY,
 *   operationStore
 * });
 * ```
 */
export class RedisOperationStore implements IOperationStore {
  private redis: Redis;
  private operationTTL: number;
  private keyPrefix: string;

  constructor(config: RedisOperationStoreConfig) {
    this.redis =
      typeof config.redis === "string"
        ? new Redis(config.redis)
        : new Redis(config.redis);

    this.operationTTL = config.operationTTL ?? 86400; // 24 hours default
    this.keyPrefix = config.keyPrefix ?? "relay:ops";
  }

  /**
   * Stores an operation state with TTL for automatic cleanup.
   * Properly handles BigInt values in gas parameters.
   */
  async set(operationId: string, state: OperationState): Promise<void> {
    const key = `${this.keyPrefix}:${operationId}`;
    const data = serializeBigInt(state);

    // Store with TTL to prevent unbounded growth
    await this.redis.setex(key, this.operationTTL, data);

    // Also maintain an index by status for monitoring
    const statusKey = `${this.keyPrefix}:status:${state.status}`;
    await this.redis.zadd(statusKey, Date.now(), operationId);

    // Clean up old entries from status index (older than TTL)
    const cutoff = Date.now() - this.operationTTL * 1000;
    await this.redis.zremrangebyscore(statusKey, "-inf", cutoff);

    console.log(
      `[RedisOperationStore] Stored operation ${operationId} with status ${state.status}`,
    );
  }

  /**
   * Retrieves an operation state by ID.
   * Properly handles BigInt values in gas parameters.
   */
  async get(operationId: string): Promise<OperationState | null> {
    const key = `${this.keyPrefix}:${operationId}`;
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    try {
      return deserializeBigInt(data) as OperationState;
    } catch (error) {
      console.error(
        `[RedisOperationStore] Failed to parse operation ${operationId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Deletes an operation from storage.
   */
  async delete(operationId: string): Promise<void> {
    const key = `${this.keyPrefix}:${operationId}`;

    // Get current state to clean up status index
    const state = await this.get(operationId);
    if (state) {
      const statusKey = `${this.keyPrefix}:status:${state.status}`;
      await this.redis.zrem(statusKey, operationId);
    }

    // Delete the operation data
    await this.redis.del(key);

    console.log(`[RedisOperationStore] Deleted operation ${operationId}`);
  }

  /**
   * Updates an existing operation state atomically.
   * This is useful for updating specific fields without overwriting the entire state.
   */
  async update(
    operationId: string,
    updates: Partial<OperationState>,
  ): Promise<void> {
    const current = await this.get(operationId);
    if (!current) {
      throw new Error(`Operation ${operationId} not found`);
    }

    // If status is changing, update the index
    if (updates.status && updates.status !== current.status) {
      const oldStatusKey = `${this.keyPrefix}:status:${current.status}`;
      const newStatusKey = `${this.keyPrefix}:status:${updates.status}`;

      await this.redis.zrem(oldStatusKey, operationId);
      await this.redis.zadd(newStatusKey, Date.now(), operationId);
    }

    // Merge updates with current state
    const updated: OperationState = {
      ...current,
      ...updates,
    };

    // Store updated state with BigInt serialization
    const key = `${this.keyPrefix}:${operationId}`;
    await this.redis.setex(key, this.operationTTL, serializeBigInt(updated));

    console.log(
      `[RedisOperationStore] Updated operation ${operationId} status: ${current.status} -> ${updates.status ?? current.status}`,
    );
  }

  /**
   * Gets all operations with a specific status (for monitoring/debugging).
   */
  async getByStatus(
    status: OperationState["status"],
  ): Promise<Array<{ operationId: string; state: OperationState }>> {
    const statusKey = `${this.keyPrefix}:status:${status}`;

    // Get all operation IDs with this status
    const operationIds = await this.redis.zrange(statusKey, 0, -1);

    // Fetch all operation states
    const results: Array<{ operationId: string; state: OperationState }> = [];
    for (const operationId of operationIds) {
      const state = await this.get(operationId);
      if (state) {
        results.push({ operationId, state });
      }
    }

    return results;
  }

  /**
   * Gets statistics about operations (for monitoring).
   */
  async getStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    oldestPending?: Date;
  }> {
    const statuses: Array<OperationState["status"]> = [
      "pending",
      "confirmed",
      "failed",
    ];

    const byStatus: Record<string, number> = {};
    let total = 0;
    let oldestPending: number | null = null;

    for (const status of statuses) {
      const statusKey = `${this.keyPrefix}:status:${status}`;
      const count = await this.redis.zcard(statusKey);
      byStatus[status] = count;
      total += count;

      // Find oldest pending operation
      if (status === "pending" && count > 0) {
        const oldest = await this.redis.zrange(statusKey, 0, 0, "WITHSCORES");
        if (oldest.length >= 2) {
          oldestPending = parseInt(oldest[1]);
        }
      }
    }

    return {
      total,
      byStatus,
      ...(oldestPending ? { oldestPending: new Date(oldestPending) } : {}),
    };
  }

  /**
   * Cleanup operations older than the TTL (maintenance task).
   * This is automatically handled by Redis TTL, but this method allows manual cleanup.
   */
  async cleanup(): Promise<number> {
    const pattern = `${this.keyPrefix}:*`;
    const keys = await this.redis.keys(pattern);

    let cleaned = 0;
    const cutoff = Date.now() - this.operationTTL * 1000;

    for (const key of keys) {
      // Skip index keys
      if (key.includes(":status:")) continue;

      const data = await this.redis.get(key);
      if (data) {
        try {
          const state: OperationState = deserializeBigInt(data);
          const timestamp = state.submittedAt ?? 0;

          if (timestamp < cutoff) {
            const operationId = key.replace(`${this.keyPrefix}:`, "");
            await this.delete(operationId);
            cleaned++;
          }
        } catch {
          // Invalid data, remove it
          await this.redis.del(key);
          cleaned++;
        }
      }
    }

    console.log(`[RedisOperationStore] Cleaned up ${cleaned} old operations`);
    return cleaned;
  }

  /**
   * Closes the Redis connection.
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * Factory function to create a RedisOperationStore from environment variables.
 *
 * @example
 * ```typescript
 * const operationStore = createRedisOperationStoreFromEnv();
 * ```
 */
export function createRedisOperationStoreFromEnv(): RedisOperationStore {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error(
      "REDIS_URL environment variable is required for Redis operation store",
    );
  }

  return new RedisOperationStore({
    redis: redisUrl,
    operationTTL: process.env.RELAY_OPERATION_TTL
      ? parseInt(process.env.RELAY_OPERATION_TTL)
      : 86400, // 24 hours default
    keyPrefix: process.env.RELAY_OPERATION_KEY_PREFIX ?? "relay:ops",
  });
}
