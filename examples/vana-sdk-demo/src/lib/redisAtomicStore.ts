/**
 * Redis implementation of IAtomicStore for production use.
 *
 * This is the reference implementation for the SDK's atomic storage interface,
 * using Redis for its strong atomic operation guarantees.
 */

import Redis, { type RedisOptions } from "ioredis";
import type { IAtomicStore } from "@opendatalabs/vana-sdk/node";

export interface RedisAtomicStoreConfig {
  /** Redis connection URL or options */
  redis: string | RedisOptions;
  /** Key prefix for all operations (default: 'atomic') */
  keyPrefix?: string;
}

/**
 * Redis-backed implementation of IAtomicStore.
 *
 * @remarks
 * This implementation uses Redis's native atomic operations:
 * - INCR for atomic counter increments
 * - SET NX EX for distributed locking
 * - Lua script for safe lock release
 *
 * Redis is ideal for this use case because:
 * - All operations are atomic by design
 * - Built-in TTL support for automatic cleanup
 * - High performance (sub-millisecond operations)
 * - Battle-tested in production environments
 *
 * @example
 * ```typescript
 * const atomicStore = new RedisAtomicStore({
 *   redis: process.env.REDIS_URL!
 * });
 *
 * const vana = Vana({
 *   privateKey: process.env.RELAYER_PRIVATE_KEY,
 *   atomicStore,
 *   operationStore
 * });
 * ```
 */
export class RedisAtomicStore implements IAtomicStore {
  private redis: Redis;
  private keyPrefix: string;

  /**
   * Lua script for safe lock release.
   * This ensures we only delete a lock if the value matches our lock ID.
   * This is the canonical Redis distributed lock release script.
   */
  private readonly UNLOCK_SCRIPT = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  constructor(config: RedisAtomicStoreConfig) {
    this.redis =
      typeof config.redis === "string"
        ? new Redis(config.redis)
        : new Redis(config.redis);

    this.keyPrefix = config.keyPrefix ?? "atomic";
  }

  /**
   * Atomically increments a counter.
   *
   * @remarks
   * Uses Redis INCR which is guaranteed to be atomic.
   * If the key doesn't exist, Redis initializes it to 0 before incrementing.
   */
  async incr(key: string): Promise<number> {
    const fullKey = `${this.keyPrefix}:${key}`;
    return await this.redis.incr(fullKey);
  }

  /**
   * Acquires a distributed lock using SET NX EX.
   *
   * @remarks
   * This uses Redis's atomic SET command with:
   * - NX: Only set if key doesn't exist
   * - EX: Set expiration time in seconds
   *
   * The lock ID is generated with timestamp and random value to ensure uniqueness.
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const fullKey = `${this.keyPrefix}:${key}`;
    const lockId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    // SET key value NX EX ttl
    const result = await this.redis.set(
      fullKey,
      lockId,
      "EX",
      ttlSeconds,
      "NX",
    );

    if (result === "OK") {
      console.log(`[RedisAtomicStore] Lock acquired: ${key} with ID ${lockId}`);
      return lockId;
    }

    return null;
  }

  /**
   * Releases a lock using a Lua script for atomicity.
   *
   * @remarks
   * The Lua script ensures we only delete the lock if the stored value
   * matches our lock ID. This prevents accidentally releasing another
   * process's lock if our lock expired.
   */
  async releaseLock(key: string, lockId: string): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;

    // Use Lua script for atomic compare-and-delete
    const result = (await this.redis.eval(
      this.UNLOCK_SCRIPT,
      1, // Number of keys
      fullKey, // KEYS[1]
      lockId, // ARGV[1]
    )) as number;

    if (result === 1) {
      console.log(`[RedisAtomicStore] Lock released: ${key}`);
    } else {
      console.warn(
        `[RedisAtomicStore] Lock release failed: ${key} (lock not held or expired)`,
      );
    }
  }

  /**
   * Gets a value from Redis.
   */
  async get(key: string): Promise<string | null> {
    const fullKey = `${this.keyPrefix}:${key}`;
    return await this.redis.get(fullKey);
  }

  /**
   * Sets a value in Redis.
   */
  async set(key: string, value: string): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    await this.redis.set(fullKey, value);
  }

  /**
   * Sets a value with TTL for automatic expiration.
   */
  async setWithTTL(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    await this.redis.setex(fullKey, ttlSeconds, value);
  }

  /**
   * Deletes a key from Redis.
   */
  async delete(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    await this.redis.del(fullKey);
  }

  /**
   * Gets statistics about the store (for monitoring).
   */
  async getStats(): Promise<{
    keyCount: number;
    memoryUsage: string;
  }> {
    const info = await this.redis.info("memory");
    const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
    const memoryUsage = memoryMatch ? memoryMatch[1] : "unknown";

    // Count keys with our prefix
    const keys = await this.redis.keys(`${this.keyPrefix}:*`);

    return {
      keyCount: keys.length,
      memoryUsage,
    };
  }

  /**
   * Closes the Redis connection.
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * Factory function to create a RedisAtomicStore from environment variables.
 *
 * @example
 * ```typescript
 * const atomicStore = createRedisAtomicStoreFromEnv();
 * ```
 */
export function createRedisAtomicStoreFromEnv(): RedisAtomicStore {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error(
      "REDIS_URL environment variable is required for Redis atomic store",
    );
  }

  return new RedisAtomicStore({
    redis: redisUrl,
    keyPrefix: process.env.ATOMIC_STORE_KEY_PREFIX ?? "atomic",
  });
}
