/**
 * Redis implementation of IAtomicStore for production use.
 *
 * @remarks
 * This is a Node.js-only implementation that requires the ioredis package.
 * It will not be included in browser bundles.
 *
 * @module
 */

import type { IAtomicStore } from "../types/atomicStore";

/**
 * Configuration for RedisAtomicStore
 */
export interface RedisAtomicStoreConfig {
  /** Redis connection URL or ioredis options */
  redis: string | any;
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
 * import Redis from 'ioredis';
 * import { RedisAtomicStore } from '@opendatalabs/vana-sdk/node';
 *
 * const redis = new Redis(process.env.REDIS_URL);
 * const atomicStore = new RedisAtomicStore({
 *   redis: redis
 * });
 *
 * const vana = Vana({
 *   walletClient,
 *   atomicStore,
 *   operationStore
 * });
 * ```
 *
 * @category Storage
 */
export class RedisAtomicStore implements IAtomicStore {
  private redis: any; // ioredis instance
  private keyPrefix: string;

  /**
   * Lua script for safe lock release.
   * This ensures we only delete a lock if the value matches our lock ID.
   */
  private readonly UNLOCK_SCRIPT = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  constructor(config: RedisAtomicStoreConfig) {
    // Dynamic import to avoid bundling ioredis in browser builds
    // The actual Redis instance should be passed in already created
    if (typeof config.redis === "string") {
      throw new Error(
        "RedisAtomicStore requires an initialized Redis client instance. " +
          "Please create the Redis client in your application and pass it to the constructor.",
      );
    }

    this.redis = config.redis;
    this.keyPrefix = config.keyPrefix ?? "atomic";

    // Validate that the redis instance has the methods we need
    if (
      !this.redis ||
      typeof this.redis.incr !== "function" ||
      typeof this.redis.set !== "function" ||
      typeof this.redis.get !== "function" ||
      typeof this.redis.eval !== "function"
    ) {
      throw new Error(
        "Invalid Redis client instance provided to RedisAtomicStore",
      );
    }
  }

  /**
   * Atomically increments a counter.
   */
  async incr(key: string): Promise<number> {
    const fullKey = `${this.keyPrefix}:${key}`;
    return await this.redis.incr(fullKey);
  }

  /**
   * Acquires a distributed lock using SET NX EX.
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
  async setWithTTL?(
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
  async delete?(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    await this.redis.del(fullKey);
  }
}
