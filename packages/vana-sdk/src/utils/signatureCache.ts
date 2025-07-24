import { Hash } from "viem";
import type { VanaCacheAdapter } from "../platform/interface";
import { toBase64 } from "../platform/shared/crypto-utils";

interface CachedSignature {
  signature: Hash;
  expires: number;
}

/**
 * Simple signature cache using platform cache adapter to avoid repeated signing of identical messages.
 * 
 * Features:
 * - Platform-appropriate storage (sessionStorage in browser, memory in Node.js)
 * - Configurable TTL (default 2 hours)
 * - Automatic cleanup of expired entries
 * - Cache keys based on wallet address + message hash
 */
export class SignatureCache {
  private static readonly PREFIX = "vana_sig_";
  private static readonly DEFAULT_TTL_HOURS = 2;

  /**
   * Get a cached signature if it exists and hasn't expired
   */
  static get(cache: VanaCacheAdapter, walletAddress: string, messageHash: string): Hash | null {
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
      } catch {}
      return null;
    }
  }

  /**
   * Store a signature in the cache
   */
  static set(
    cache: VanaCacheAdapter,
    walletAddress: string, 
    messageHash: string, 
    signature: Hash,
    ttlHours: number = this.DEFAULT_TTL_HOURS
  ): void {
    const key = this.getCacheKey(walletAddress, messageHash);
    const cached: CachedSignature = {
      signature,
      expires: Date.now() + (ttlHours * 3600000), // Convert hours to milliseconds
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
   */
  static clear(cache: VanaCacheAdapter): void {
    try {
      cache.clear();
    } catch {
      // Ignore storage errors
    }
  }

  private static getCacheKey(walletAddress: string, messageHash: string): string {
    return `${this.PREFIX}${walletAddress.toLowerCase()}:${messageHash}`;
  }

  static hashMessage(message: object): string {
    // Simple hash of the message for cache key
    // Using custom JSON.stringify with BigInt serializer to handle EIP-712 typed data
    return toBase64(JSON.stringify(message, this.bigIntReplacer)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  }

  /**
   * Custom JSON replacer that converts BigInt values to strings for serialization
   * This ensures deterministic cache key generation for EIP-712 typed data
   */
  private static bigIntReplacer(key: string, value: any): any {
    if (typeof value === 'bigint') {
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
  typedData: any,
  signFn: () => Promise<Hash>,
  ttlHours?: number
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