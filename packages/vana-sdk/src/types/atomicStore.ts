/**
 * Atomic storage primitives for distributed state management.
 *
 * @module
 */

/**
 * Interface for atomic storage operations required by the SDK's distributed components.
 *
 * @remarks
 * Implementations of this interface MUST guarantee atomicity for all operations.
 * These primitives are used by the SDK's internal components to coordinate
 * distributed state in multi-instance deployments (e.g., serverless functions).
 *
 * The SDK provides a reference Redis implementation, but you can implement
 * this interface using any storage backend that supports atomic operations:
 * - PostgreSQL with advisory locks
 * - DynamoDB with conditional writes
 * - MongoDB with findAndModify
 * - Zookeeper or etcd for coordination
 *
 * @example
 * ```typescript
 * // Using the Redis reference implementation
 * import { RedisAtomicStore } from './lib/redisAtomicStore';
 *
 * const atomicStore = new RedisAtomicStore({
 *   redis: process.env.REDIS_URL
 * });
 *
 * const vana = Vana({
 *   privateKey: process.env.RELAYER_PRIVATE_KEY,
 *   atomicStore
 * });
 * ```
 *
 * @category Storage
 */
export interface IAtomicStore {
  /**
   * Atomically increments a counter and returns the new value.
   *
   * @remarks
   * This operation MUST be atomic. If the key doesn't exist, it should be
   * initialized to 0 before incrementing. The operation must return the
   * value after incrementing.
   *
   * This is used primarily for nonce assignment where atomicity is critical
   * to prevent conflicts under concurrent load.
   *
   * @param key - The key to increment
   * @returns The new value after incrementing
   *
   * @example
   * ```typescript
   * // First call returns 1
   * const nonce1 = await store.incr('nonce:0x123:1480');
   * // Second call returns 2
   * const nonce2 = await store.incr('nonce:0x123:1480');
   * ```
   */
  incr(key: string): Promise<number>;

  /**
   * Attempts to acquire a distributed lock with automatic expiration.
   *
   * @remarks
   * This operation MUST be atomic and follow the "SET NX EX" semantics:
   * - Only succeeds if the lock doesn't exist (NX - "Not eXists")
   * - Automatically expires after the specified TTL (EX - "EXpire")
   * - Returns a unique lock ID on success for safe release
   *
   * The lock ID should be a unique value (e.g., UUID or timestamp+random)
   * that prevents accidental release by other processes.
   *
   * @param key - The lock key
   * @param ttlSeconds - Time-to-live in seconds (automatic expiration)
   * @returns A unique lock ID if acquired, null if lock is already held
   *
   * @example
   * ```typescript
   * const lockId = await store.acquireLock('nonce:lock:0x123', 5);
   * if (lockId) {
   *   try {
   *     // Critical section - only one process can be here
   *     await performCriticalOperation();
   *   } finally {
   *     await store.releaseLock('nonce:lock:0x123', lockId);
   *   }
   * }
   * ```
   */
  acquireLock(key: string, ttlSeconds: number): Promise<string | null>;

  /**
   * Releases a previously acquired lock.
   *
   * @remarks
   * This operation MUST be atomic and safe. It should only succeed if the
   * provided lockId matches the current lock value. This prevents accidental
   * release of locks acquired by other processes.
   *
   * Implementations should use compare-and-delete semantics or a Lua script
   * (in Redis) to ensure atomicity.
   *
   * @param key - The lock key
   * @param lockId - The unique ID returned by acquireLock
   *
   * @example
   * ```typescript
   * const lockId = await store.acquireLock('lock:key', 5);
   * if (lockId) {
   *   // ... do work ...
   *   await store.releaseLock('lock:key', lockId);
   * }
   * ```
   */
  releaseLock(key: string, lockId: string): Promise<void>;

  /**
   * Gets the value associated with a key.
   *
   * @remarks
   * This is a simple read operation. It should return null if the key
   * doesn't exist.
   *
   * @param key - The key to retrieve
   * @returns The stored value, or null if not found
   *
   * @example
   * ```typescript
   * const lastUsedNonce = await store.get('lastNonce:0x123:1480');
   * ```
   */
  get(key: string): Promise<string | null>;

  /**
   * Sets a key-value pair.
   *
   * @remarks
   * This is a simple write operation. It should overwrite any existing value.
   *
   * @param key - The key to set
   * @param value - The value to store
   *
   * @example
   * ```typescript
   * await store.set('lastNonce:0x123:1480', '42');
   * ```
   */
  set(key: string, value: string): Promise<void>;

  /**
   * Sets a key-value pair with expiration.
   *
   * @remarks
   * This operation sets a value with automatic expiration after the specified TTL.
   * Useful for temporary state that should be automatically cleaned up.
   *
   * @param key - The key to set
   * @param value - The value to store
   * @param ttlSeconds - Time-to-live in seconds
   *
   * @example
   * ```typescript
   * // Store operation state for 24 hours
   * await store.setWithTTL('operation:123', JSON.stringify(state), 86400);
   * ```
   */
  setWithTTL?(key: string, value: string, ttlSeconds: number): Promise<void>;

  /**
   * Deletes a key.
   *
   * @remarks
   * This operation removes a key from storage. Should be idempotent
   * (no error if key doesn't exist).
   *
   * @param key - The key to delete
   *
   * @example
   * ```typescript
   * await store.delete('temp:data:123');
   * ```
   */
  delete?(key: string): Promise<void>;
}
