/**
 * Provides signature caching to improve UX by avoiding repeated wallet prompts.
 *
 * @remarks
 * This module implements a secure signature cache that stores signed messages
 * temporarily to avoid repeatedly prompting users for the same signature.
 * It uses platform-appropriate storage (sessionStorage in browser, memory in Node.js)
 * and includes automatic expiration and cleanup.
 *
 * @category Utilities
 * @module utils/signatureCache
 */

import type { Hash } from "viem";
import { getAddress, toHex } from "viem";
import type { VanaCacheAdapter } from "../platform/interface";
import { sha256 } from "@noble/hashes/sha256";

/**
 * Represents a cached signature with expiration metadata.
 *
 * @internal
 */
interface CachedSignature {
  /** The cached signature hash */
  signature: Hash;
  /** Unix timestamp when this cache entry expires */
  expires: number;
}

/**
 * Simple signature cache using platform cache adapter to avoid repeated signing of identical messages.
 *
 * @remarks
 * This cache significantly improves UX by avoiding repeated wallet signature prompts
 * for identical operations. It's particularly useful for operations that may be
 * retried or called multiple times with the same parameters.
 *
 * Features:
 * - Platform-appropriate storage (sessionStorage in browser, memory in Node.js)
 * - Configurable TTL (default 2 hours)
 * - Automatic cleanup of expired entries
 * - Cache keys based on wallet address + message hash
 *
 * @example
 * ```typescript
 * // Check cache before requesting signature
 * const cached = SignatureCache.get(cache, walletAddress, messageHash);
 * if (cached) {
 *   return cached;
 * }
 *
 * // Request signature and cache it
 * const signature = await wallet.signTypedData(typedData);
 * SignatureCache.set(cache, walletAddress, messageHash, signature);
 * ```
 * @category Utilities
 */
export class SignatureCache {
  private static readonly PREFIX = "vana_sig_";
  private static readonly DEFAULT_TTL_HOURS = 2;

  /**
   * Get a cached signature if it exists and hasn't expired
   *
   * @param cache - Platform cache adapter instance
   * @param walletAddress - Wallet address that created the signature
   * @param messageHash - Hash of the message that was signed
   * @returns The cached signature if valid, null if expired or not found
   * @example
   * ```typescript
   * const messageHash = SignatureCache.hashMessage(typedData);
   * const cached = SignatureCache.get(cache, '0x123...', messageHash);
   * if (cached) {
   *   console.log('Using cached signature:', cached);
   * }
   * ```
   */
  static get(
    cache: VanaCacheAdapter,
    walletAddress: string,
    messageHash: string,
  ): Hash | null {
    const key = this.getCacheKey(walletAddress, messageHash);

    try {
      const stored = cache.get(key);
      if (!stored) return null;

      const cached: CachedSignature = JSON.parse(stored);

      // Check if expired
      if (Date.now() > cached.expires) {
        cache.delete(key);
        return null;
      }

      return cached.signature;
    } catch {
      // Invalid JSON or storage error, clean up
      try {
        cache.delete(key);
      } catch {
        // Ignore cache cleanup errors
      }
      return null;
    }
  }

  /**
   * Store a signature in the cache with configurable TTL
   *
   * @param cache - Platform cache adapter instance
   * @param walletAddress - Wallet address that created the signature
   * @param messageHash - Hash of the message that was signed
   * @param signature - The signature to cache
   * @param ttlHours - Time to live in hours (default: 2)
   * @example
   * ```typescript
   * const signature = await wallet.signTypedData(typedData);
   * const messageHash = SignatureCache.hashMessage(typedData);
   *
   * // Cache for default 2 hours
   * SignatureCache.set(cache, walletAddress, messageHash, signature);
   *
   * // Cache for 24 hours
   * SignatureCache.set(cache, walletAddress, messageHash, signature, 24);
   * ```
   */
  static set(
    cache: VanaCacheAdapter,
    walletAddress: string,
    messageHash: string,
    signature: Hash,
    ttlHours: number = this.DEFAULT_TTL_HOURS,
  ): void {
    const key = this.getCacheKey(walletAddress, messageHash);
    const cached: CachedSignature = {
      signature,
      expires: Date.now() + ttlHours * 3600000, // Convert hours to milliseconds
    };

    try {
      cache.set(key, JSON.stringify(cached));
    } catch {
      // Storage quota exceeded or other error, ignore silently
      // Better to continue without caching than to fail
    }
  }

  /**
   * Clear all cached signatures (useful for testing or explicit cleanup)
   *
   * @param cache - Platform cache adapter instance
   * @example
   * ```typescript
   * // Clear all signatures when user logs out
   * SignatureCache.clear(cache);
   *
   * // Clear before running tests
   * beforeEach(() => {
   *   SignatureCache.clear(cache);
   * });
   * ```
   */
  static clear(cache: VanaCacheAdapter): void {
    try {
      cache.clear();
    } catch {
      // Ignore storage errors
    }
  }

  private static getCacheKey(
    walletAddress: string,
    messageHash: string,
  ): string {
    return `${this.PREFIX}${getAddress(walletAddress)}:${messageHash}`;
  }

  /**
   * Generate a deterministic hash of a message object for cache key generation
   *
   * @remarks
   * Creates a cryptographically secure hash from complex objects including EIP-712 typed data.
   * Uses SHA-256 for collision resistance and deterministic key generation.
   * Handles BigInt serialization and sorts object keys for consistency.
   *
   * @param message - The message object to hash (typically EIP-712 typed data)
   * @returns A hex string hash (SHA-256) suitable for cache keys
   * @example
   * ```typescript
   * const typedData = {
   *   domain: { name: 'Vana', version: '1' },
   *   message: { nonce: 123n, grant: '...' }
   * };
   *
   * const hash = SignatureCache.hashMessage(typedData);
   * // Returns SHA-256 hash like: "a1b2c3d4e5f6..."
   * ```
   */
  static hashMessage(message: object): string {
    // Deterministically stringify the object with sorted keys
    const jsonString = JSON.stringify(message, this.deterministicReplacer);

    // Use SHA-256 for cryptographic hashing
    const hashBytes = sha256(new TextEncoder().encode(jsonString));
    return toHex(hashBytes);
  }

  /**
   * Deterministic JSON replacer for consistent cache key generation.
   *
   * @remarks
   * Handles BigInt serialization and sorts object keys to ensure
   * identical objects always produce the same hash regardless of
   * property order.
   *
   * @param _key - The object key being serialized (unused)
   * @param value - The value to serialize
   * @returns The serialized value with sorted keys for objects
   *
   * @internal
   */
  private static deterministicReplacer(_key: string, value: unknown): unknown {
    if (typeof value === "bigint") {
      return `__BIGINT__${value.toString()}`;
    }
    // Sort object keys for deterministic serialization
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce(
          (sorted, key) => {
            sorted[key] = (value as Record<string, unknown>)[key];
            return sorted;
          },
          {} as Record<string, unknown>,
        );
    }
    return value;
  }
}

/**
 * Wraps signature operations with caching to avoid repeated prompts.
 *
 * @remarks
 * This helper function checks the cache before requesting a signature
 * and stores new signatures for future use. It significantly improves
 * UX for operations that may be retried or called multiple times.
 *
 * @param cache - The cache adapter to use for storage.
 *   Obtain from platform adapter.
 * @param walletAddress - The wallet address signing the message.
 *   Obtain from wallet connection.
 * @param typedData - The EIP-712 typed data being signed.
 *   Typically permission or grant data.
 * @param signFn - Async function that performs the actual signing.
 *   Usually calls wallet.signTypedData().
 * @param ttlHours - Cache TTL in hours.
 *   Defaults to 2 hours.
 * @returns The signature (cached or newly generated)
 *
 * @example
 * ```typescript
 * const signature = await withSignatureCache(
 *   platformAdapter.cache,
 *   walletAddress,
 *   typedData,
 *   async () => wallet.signTypedData(typedData),
 *   24 // Cache for 24 hours
 * );
 * ```
 *
 * @category Utilities
 */
export async function withSignatureCache(
  cache: VanaCacheAdapter,
  walletAddress: string,
  typedData: Record<string, unknown>,
  signFn: () => Promise<Hash>,
  ttlHours?: number,
): Promise<Hash> {
  // Create a hash of the typed data for the cache key
  const messageHash = SignatureCache.hashMessage(typedData);

  // Try to get from cache first
  const cached = SignatureCache.get(cache, walletAddress, messageHash);
  if (cached) {
    return cached;
  }

  // Not in cache, sign and store
  const signature = await signFn();
  SignatureCache.set(cache, walletAddress, messageHash, signature, ttlHours);

  return signature;
}
