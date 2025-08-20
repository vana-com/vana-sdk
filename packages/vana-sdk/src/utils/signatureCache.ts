import { Hash, getAddress } from "viem";
import type { VanaCacheAdapter } from "../platform/interface";
import { toBase64 } from "../platform/shared/crypto-utils";

interface CachedSignature {
  signature: Hash;
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
   * Creates a consistent hash from complex objects including EIP-712 typed data.
   * Handles BigInt serialization and produces a 32-character hash that balances
   * uniqueness with key length constraints.
   *
   * @param message - The message object to hash (typically EIP-712 typed data)
   * @returns A 32-character hash string suitable for cache keys
   * @example
   * ```typescript
   * const typedData = {
   *   domain: { name: 'Vana', version: '1' },
   *   message: { nonce: 123n, grant: '...' }
   * };
   *
   * const hash = SignatureCache.hashMessage(typedData);
   * // Returns something like: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
   * ```
   */
  static hashMessage(message: object): string {
    // Simple hash of the message for cache key
    // Using custom JSON.stringify with BigInt serializer to handle EIP-712 typed data
    const jsonString = JSON.stringify(message, this.bigIntReplacer);
    const base64Hash = toBase64(jsonString);
    // Use a longer substring and include some characters from the end to avoid collisions
    const cleaned = base64Hash.replace(/[^a-zA-Z0-9]/g, "");
    // Take first 16 characters + last 16 characters to create a 32-char hash that's more unique
    if (cleaned.length > 32) {
      return cleaned.substring(0, 16) + cleaned.substring(cleaned.length - 16);
    }
    return cleaned.substring(0, 32);
  }

  /**
   * Custom JSON replacer that converts BigInt values to strings for serialization
   * This ensures deterministic cache key generation for EIP-712 typed data
   *
   * @param _key - The object key being serialized (unused)
   * @param value - The value to serialize
   * @returns The serialized value
   */
  private static bigIntReplacer(_key: string, value: unknown): unknown {
    if (typeof value === "bigint") {
      return `__BIGINT__${value.toString()}`;
    }
    return value;
  }
}

/**
 * Wrapper function to cache signature operations
 *
 * @param cache - The cache adapter to use for storage
 * @param walletAddress - The wallet address signing the message
 * @param typedData - The EIP-712 typed data being signed
 * @param signFn - Function that performs the actual signing
 * @param ttlHours - Cache TTL in hours (default 2)
 * @returns The signature (cached or newly generated)
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
