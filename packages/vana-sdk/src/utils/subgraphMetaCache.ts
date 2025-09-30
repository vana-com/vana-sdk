/**
 * @file Simple cache for subgraph metadata to reduce redundant queries
 * @module vana-sdk/utils/subgraphMetaCache
 */

import type { SubgraphMeta } from "./subgraphConsistency";

interface CacheEntry {
  meta: SubgraphMeta;
  timestamp: number;
}

/**
 * Simple LRU cache for subgraph metadata
 *
 * @remarks
 * Reduces redundant _meta queries when multiple SDK methods are called
 * in quick succession. Uses a very short TTL to avoid masking staleness.
 */
export class SubgraphMetaCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttl: number;

  /**
   * Create a new metadata cache
   *
   * @param ttl - Time to live in milliseconds (default: 2000ms)
   * @param maxSize - Maximum cache entries (default: 10)
   */
  constructor(ttl = 2000, maxSize = 10) {
    this.ttl = ttl;
    this.maxSize = maxSize;
  }

  /**
   * Get cached metadata if fresh
   *
   * @param url - Subgraph URL as cache key
   * @returns Cached metadata or undefined if stale/missing
   */
  get(url: string): SubgraphMeta | undefined {
    const entry = this.cache.get(url);

    if (!entry) {
      return undefined;
    }

    // Check if still fresh
    if (Date.now() - entry.timestamp > this.ttl) {
      // Expired, remove it
      this.cache.delete(url);
      return undefined;
    }

    // Move to end (LRU)
    this.cache.delete(url);
    this.cache.set(url, entry);

    return entry.meta;
  }

  /**
   * Store metadata in cache
   *
   * @param url - Subgraph URL as cache key
   * @param meta - Metadata to cache
   */
  set(url: string, meta: SubgraphMeta): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(url)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(url, {
      meta,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   *
   * @returns Cache size and TTL info
   */
  stats(): { size: number; ttl: number; maxSize: number } {
    return {
      size: this.cache.size,
      ttl: this.ttl,
      maxSize: this.maxSize,
    };
  }
}

/**
 * Global cache instance (optional, can be configured per SDK instance)
 */
export const globalMetaCache = new SubgraphMetaCache();
