/**
 * Redis implementation of IAtomicStore for production use.
 *
 * @remarks
 * This is a Node.js-only implementation that requires the ioredis package.
 * It will not be included in browser bundles.
 *
 * @module
 */

import type { IAtomicStoreWithNonceSupport } from "../types/atomicStore";

/**
 * Minimal interface for Redis client compatibility.
 *
 * @remarks
 * This interface defines the methods that RedisAtomicStore requires from a Redis client.
 * It's compatible with ioredis (Redis instance) and other Redis clients that implement
 * these core methods. Users should pass an already-instantiated Redis client.
 *
 * @internal
 */
export interface IRedisClient {
  /** Atomic increment operation */
  incr(key: string): Promise<number>;
  /** SET with options (NX, EX, etc.) */
  set(
    key: string,
    value: string,
    ...args: Array<string | number>
  ): Promise<string | null>;
  /** GET operation */
  get(key: string): Promise<string | null>;
  /** Delete operation */
  del(key: string): Promise<number>;
  /** SETEX operation (SET with TTL) */
  setex(key: string, seconds: number, value: string): Promise<string>;
  /** Execute Lua script */
  eval(
    script: string,
    numKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown>;
}

/**
 * Configuration for RedisAtomicStore
 */
export interface RedisAtomicStoreConfig {
  /** Redis client instance (ioredis.Redis or compatible) */
  redis: IRedisClient;
  /** Key prefix for all operations (default: 'vana-sdk:atomic') */
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
export class RedisAtomicStore implements IAtomicStoreWithNonceSupport {
  private redis: IRedisClient;
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
    this.keyPrefix = config.keyPrefix ?? "vana-sdk:atomic";

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

  /**
   * Executes a Lua script atomically.
   *
   * @remarks
   * This provides generic script execution for complex atomic operations.
   * Keys passed to the script will be automatically prefixed.
   *
   * @param script - The Lua script to execute
   * @param keys - Array of keys (will be prefixed)
   * @param args - Array of arguments
   * @returns The script's return value
   */
  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    // Apply key prefix to all keys
    const prefixedKeys = keys.map((key) => `${this.keyPrefix}:${key}`);

    // Execute the Lua script
    const result = await this.redis.eval(
      script,
      keys.length,
      ...prefixedKeys,
      ...args,
    );

    return result;
  }

  /**
   * Atomically assigns a nonce using Vana App's battle-tested logic.
   *
   * @remarks
   * This is a Redis-specific optimization that uses a Lua script for
   * atomic nonce assignment with gap prevention. This method is called
   * by DistributedNonceManager when it detects a Redis store.
   *
   * Ported from apps/web/app/api/relay/route.ts (Vana App production code)
   * DO NOT MODIFY without thorough testing in production environment.
   *
   * @param key - The key for storing the last used nonce
   * @param pendingCount - The current pending transaction count from blockchain
   * @returns The assigned nonce
   */
  async atomicAssignNonce(key: string, pendingCount: number): Promise<number> {
    const LUA_ASSIGN_NONCE = `
      -- KEYS[1] = lastUsedKey
      -- ARGV[1] = pendingCount (integer)

      local last = tonumber(redis.call("GET", KEYS[1]) or "-1")
      local pending = tonumber(ARGV[1])
      local candidate = last + 1
      if pending > candidate or (candidate - pending > 500) then
        -- If pending is ahead OR if candidate is too far ahead (>500 nonces), reset to pending
        candidate = pending
      end

      -- IMPORTANT: Atomically update the last used nonce
      redis.call("SET", KEYS[1], candidate)

      return candidate
    `;

    const fullKey = `${this.keyPrefix}:${key}`;
    const nonce = (await this.redis.eval(
      LUA_ASSIGN_NONCE,
      1, // Number of keys
      fullKey, // KEYS[1]
      pendingCount.toString(), // ARGV[1]
    )) as number;

    return nonce;
  }
}
