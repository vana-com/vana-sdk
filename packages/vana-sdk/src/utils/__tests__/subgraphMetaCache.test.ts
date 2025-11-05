/**
 * Tests for SubgraphMetaCache
 *
 * @remarks
 * Tests LRU eviction, TTL expiration, and cache statistics.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SubgraphMetaCache, globalMetaCache } from "../subgraphMetaCache";
import type { SubgraphMeta } from "../subgraphConsistency";

describe("SubgraphMetaCache", () => {
  let cache: SubgraphMetaCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new SubgraphMetaCache(2000, 3); // 2s TTL, max 3 entries
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("Basic Operations", () => {
    it("should return undefined for missing entries", () => {
      expect(cache.get("https://example.com/subgraph")).toBeUndefined();
    });

    it("should store and retrieve metadata", () => {
      const meta: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest123",
      };

      cache.set("https://example.com/subgraph", meta);

      expect(cache.get("https://example.com/subgraph")).toEqual(meta);
    });

    it("should handle multiple entries", () => {
      const meta1: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest1",
      };
      const meta2: SubgraphMeta = {
        blockNumber: 200,
        hasIndexingErrors: false,
        deployment: "QmTest2",
      };

      cache.set("https://example.com/subgraph1", meta1);
      cache.set("https://example.com/subgraph2", meta2);

      expect(cache.get("https://example.com/subgraph1")).toEqual(meta1);
      expect(cache.get("https://example.com/subgraph2")).toEqual(meta2);
    });

    it("should overwrite existing entries", () => {
      const meta1: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmOld",
      };
      const meta2: SubgraphMeta = {
        blockNumber: 200,
        hasIndexingErrors: false,
        deployment: "QmNew",
      };

      cache.set("https://example.com/subgraph", meta1);
      cache.set("https://example.com/subgraph", meta2);

      expect(cache.get("https://example.com/subgraph")).toEqual(meta2);
    });

    it("should clear all entries", () => {
      const meta: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest",
      };

      cache.set("https://example.com/subgraph1", meta);
      cache.set("https://example.com/subgraph2", meta);

      cache.clear();

      expect(cache.get("https://example.com/subgraph1")).toBeUndefined();
      expect(cache.get("https://example.com/subgraph2")).toBeUndefined();
      expect(cache.stats().size).toBe(0);
    });
  });

  describe("TTL Expiration", () => {
    it("should return undefined for expired entries", () => {
      const meta: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest",
      };

      cache.set("https://example.com/subgraph", meta);

      // Advance time beyond TTL (2000ms)
      vi.advanceTimersByTime(2001);

      expect(cache.get("https://example.com/subgraph")).toBeUndefined();
    });

    it("should remove expired entries from cache", () => {
      const meta: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest",
      };

      cache.set("https://example.com/subgraph", meta);
      expect(cache.stats().size).toBe(1);

      vi.advanceTimersByTime(2001);
      cache.get("https://example.com/subgraph");

      // Expired entry should be removed
      expect(cache.stats().size).toBe(0);
    });

    it("should return valid entries before TTL expires", () => {
      const meta: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest",
      };

      cache.set("https://example.com/subgraph", meta);

      // Advance time but stay within TTL
      vi.advanceTimersByTime(1999);

      expect(cache.get("https://example.com/subgraph")).toEqual(meta);
    });

    it("should handle entries with different ages", () => {
      const meta1: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmOld",
      };
      const meta2: SubgraphMeta = {
        blockNumber: 200,
        hasIndexingErrors: false,
        deployment: "QmNew",
      };

      cache.set("https://example.com/old", meta1);
      vi.advanceTimersByTime(1500);
      cache.set("https://example.com/new", meta2);

      // Advance to expire first entry but not second
      vi.advanceTimersByTime(600); // Total: 2100ms for old, 600ms for new

      expect(cache.get("https://example.com/old")).toBeUndefined();
      expect(cache.get("https://example.com/new")).toEqual(meta2);
    });

    it("should reset timestamp when overwriting entry", () => {
      const meta1: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmOld",
      };
      const meta2: SubgraphMeta = {
        blockNumber: 200,
        hasIndexingErrors: false,
        deployment: "QmNew",
      };

      cache.set("https://example.com/subgraph", meta1);
      vi.advanceTimersByTime(1500);
      cache.set("https://example.com/subgraph", meta2); // Reset timestamp

      vi.advanceTimersByTime(1999); // Total: 3499ms from first set, 1999ms from second

      // Should still be valid because timestamp was reset
      expect(cache.get("https://example.com/subgraph")).toEqual(meta2);
    });
  });

  describe("LRU Eviction", () => {
    it("should evict oldest entry when maxSize reached", () => {
      const meta1: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmFirst",
      };
      const meta2: SubgraphMeta = {
        blockNumber: 200,
        hasIndexingErrors: false,
        deployment: "QmSecond",
      };
      const meta3: SubgraphMeta = {
        blockNumber: 300,
        hasIndexingErrors: false,
        deployment: "QmThird",
      };
      const meta4: SubgraphMeta = {
        blockNumber: 400,
        hasIndexingErrors: false,
        deployment: "QmFourth",
      };

      cache.set("https://example.com/1", meta1);
      cache.set("https://example.com/2", meta2);
      cache.set("https://example.com/3", meta3);

      expect(cache.stats().size).toBe(3);

      // Adding 4th entry should evict first
      cache.set("https://example.com/4", meta4);

      expect(cache.stats().size).toBe(3);
      expect(cache.get("https://example.com/1")).toBeUndefined(); // Evicted
      expect(cache.get("https://example.com/2")).toEqual(meta2);
      expect(cache.get("https://example.com/3")).toEqual(meta3);
      expect(cache.get("https://example.com/4")).toEqual(meta4);
    });

    it("should move accessed entry to end (LRU)", () => {
      const meta1: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmFirst",
      };
      const meta2: SubgraphMeta = {
        blockNumber: 200,
        hasIndexingErrors: false,
        deployment: "QmSecond",
      };
      const meta3: SubgraphMeta = {
        blockNumber: 300,
        hasIndexingErrors: false,
        deployment: "QmThird",
      };
      const meta4: SubgraphMeta = {
        blockNumber: 400,
        hasIndexingErrors: false,
        deployment: "QmFourth",
      };

      cache.set("https://example.com/1", meta1);
      cache.set("https://example.com/2", meta2);
      cache.set("https://example.com/3", meta3);

      // Access first entry, moving it to end
      cache.get("https://example.com/1");

      // Adding 4th entry should now evict second (now oldest)
      cache.set("https://example.com/4", meta4);

      expect(cache.get("https://example.com/1")).toEqual(meta1); // Still present
      expect(cache.get("https://example.com/2")).toBeUndefined(); // Evicted
      expect(cache.get("https://example.com/3")).toEqual(meta3);
      expect(cache.get("https://example.com/4")).toEqual(meta4);
    });

    it("should not evict when overwriting existing entry", () => {
      const meta1: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmFirst",
      };
      const meta2: SubgraphMeta = {
        blockNumber: 200,
        hasIndexingErrors: false,
        deployment: "QmSecond",
      };
      const meta3: SubgraphMeta = {
        blockNumber: 300,
        hasIndexingErrors: false,
        deployment: "QmThird",
      };
      const meta3Updated: SubgraphMeta = {
        blockNumber: 350,
        hasIndexingErrors: false,
        deployment: "QmThirdUpdated",
      };

      cache.set("https://example.com/1", meta1);
      cache.set("https://example.com/2", meta2);
      cache.set("https://example.com/3", meta3);

      // Overwrite third entry - should not evict
      cache.set("https://example.com/3", meta3Updated);

      expect(cache.stats().size).toBe(3);
      expect(cache.get("https://example.com/1")).toEqual(meta1);
      expect(cache.get("https://example.com/2")).toEqual(meta2);
      expect(cache.get("https://example.com/3")).toEqual(meta3Updated);
    });

    it("should handle single entry cache", () => {
      const singleCache = new SubgraphMetaCache(2000, 1);
      const meta1: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmFirst",
      };
      const meta2: SubgraphMeta = {
        blockNumber: 200,
        hasIndexingErrors: false,
        deployment: "QmSecond",
      };

      singleCache.set("https://example.com/1", meta1);
      expect(singleCache.stats().size).toBe(1);

      singleCache.set("https://example.com/2", meta2);
      expect(singleCache.stats().size).toBe(1);
      expect(singleCache.get("https://example.com/1")).toBeUndefined();
      expect(singleCache.get("https://example.com/2")).toEqual(meta2);
    });
  });

  describe("Combined TTL and LRU", () => {
    it("should handle expired entries not counting toward maxSize", () => {
      const meta1: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmFirst",
      };
      const meta2: SubgraphMeta = {
        blockNumber: 200,
        hasIndexingErrors: false,
        deployment: "QmSecond",
      };
      const meta3: SubgraphMeta = {
        blockNumber: 300,
        hasIndexingErrors: false,
        deployment: "QmThird",
      };
      const meta4: SubgraphMeta = {
        blockNumber: 400,
        hasIndexingErrors: false,
        deployment: "QmFourth",
      };

      cache.set("https://example.com/1", meta1);
      cache.set("https://example.com/2", meta2);

      // Expire first two entries
      vi.advanceTimersByTime(2001);

      cache.set("https://example.com/3", meta3);
      cache.set("https://example.com/4", meta4);

      // Accessing expired entries removes them
      expect(cache.get("https://example.com/1")).toBeUndefined();
      expect(cache.get("https://example.com/2")).toBeUndefined();

      // Size should be 2 (only new entries)
      expect(cache.stats().size).toBe(2);
      expect(cache.get("https://example.com/3")).toEqual(meta3);
      expect(cache.get("https://example.com/4")).toEqual(meta4);
    });

    it("should prioritize LRU over TTL for eviction", () => {
      const meta1: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmFirst",
      };
      const meta2: SubgraphMeta = {
        blockNumber: 200,
        hasIndexingErrors: false,
        deployment: "QmSecond",
      };
      const meta3: SubgraphMeta = {
        blockNumber: 300,
        hasIndexingErrors: false,
        deployment: "QmThird",
      };
      const meta4: SubgraphMeta = {
        blockNumber: 400,
        hasIndexingErrors: false,
        deployment: "QmFourth",
      };

      cache.set("https://example.com/1", meta1);
      vi.advanceTimersByTime(500);
      cache.set("https://example.com/2", meta2);
      vi.advanceTimersByTime(500);
      cache.set("https://example.com/3", meta3);

      // All entries still valid (1000ms < 2000ms TTL)
      // But adding 4th will evict oldest by insertion order
      cache.set("https://example.com/4", meta4);

      expect(cache.get("https://example.com/1")).toBeUndefined(); // Evicted (oldest)
      expect(cache.get("https://example.com/2")).toEqual(meta2);
      expect(cache.get("https://example.com/3")).toEqual(meta3);
      expect(cache.get("https://example.com/4")).toEqual(meta4);
    });
  });

  describe("Stats", () => {
    it("should report correct initial stats", () => {
      expect(cache.stats()).toEqual({
        size: 0,
        ttl: 2000,
        maxSize: 3,
      });
    });

    it("should report correct stats after additions", () => {
      const meta: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest",
      };

      cache.set("https://example.com/1", meta);
      cache.set("https://example.com/2", meta);

      expect(cache.stats()).toEqual({
        size: 2,
        ttl: 2000,
        maxSize: 3,
      });
    });

    it("should maintain custom TTL and maxSize", () => {
      const customCache = new SubgraphMetaCache(5000, 20);

      expect(customCache.stats()).toEqual({
        size: 0,
        ttl: 5000,
        maxSize: 20,
      });
    });

    it("should report size after clear", () => {
      const meta: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest",
      };

      cache.set("https://example.com/1", meta);
      cache.clear();

      expect(cache.stats().size).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero maxSize gracefully", () => {
      const zeroCache = new SubgraphMetaCache(2000, 0);
      const meta: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest",
      };

      // Should evict immediately since maxSize is 0
      zeroCache.set("https://example.com/1", meta);
      expect(zeroCache.stats().size).toBe(1); // Still gets added
    });

    it("should handle very short TTL", () => {
      const shortCache = new SubgraphMetaCache(1, 10); // 1ms TTL
      const meta: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest",
      };

      shortCache.set("https://example.com/1", meta);
      vi.advanceTimersByTime(2);

      expect(shortCache.get("https://example.com/1")).toBeUndefined();
    });

    it("should handle very long TTL", () => {
      const longCache = new SubgraphMetaCache(1000000, 10); // 1000s TTL
      const meta: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest",
      };

      longCache.set("https://example.com/1", meta);
      vi.advanceTimersByTime(999999);

      expect(longCache.get("https://example.com/1")).toEqual(meta);
    });

    it("should handle URLs with special characters", () => {
      const meta: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest",
      };

      cache.set(
        "https://example.com/subgraph?api_key=test&version=1.0.0#fragment",
        meta,
      );

      expect(
        cache.get(
          "https://example.com/subgraph?api_key=test&version=1.0.0#fragment",
        ),
      ).toEqual(meta);
    });

    it("should treat different URLs as separate entries", () => {
      const meta1: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest1",
      };
      const meta2: SubgraphMeta = {
        blockNumber: 200,
        hasIndexingErrors: false,
        deployment: "QmTest2",
      };

      cache.set("https://example.com/subgraph", meta1);
      cache.set("https://example.com/subgraph?version=2", meta2);

      expect(cache.get("https://example.com/subgraph")).toEqual(meta1);
      expect(cache.get("https://example.com/subgraph?version=2")).toEqual(
        meta2,
      );
    });

    it("should handle metadata with missing optional fields", () => {
      const minimalMeta: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmMinimal",
      };

      cache.set("https://example.com/subgraph", minimalMeta);

      expect(cache.get("https://example.com/subgraph")).toEqual(minimalMeta);
    });

    it("should handle metadata with all fields", () => {
      const fullMeta: SubgraphMeta = {
        blockNumber: 100,
        blockHash: "0xabc123",
        blockTimestamp: 1234567890,
        deployment: "QmTest123",
        hasIndexingErrors: false,
      };

      cache.set("https://example.com/subgraph", fullMeta);

      expect(cache.get("https://example.com/subgraph")).toEqual(fullMeta);
    });
  });

  describe("Global Cache Instance", () => {
    it("should provide global cache instance", () => {
      expect(globalMetaCache).toBeInstanceOf(SubgraphMetaCache);
    });

    it("should have default configuration", () => {
      const stats = globalMetaCache.stats();
      expect(stats.ttl).toBe(2000);
      expect(stats.maxSize).toBe(10);
    });

    it("should be usable like any cache instance", () => {
      globalMetaCache.clear(); // Ensure clean state

      const meta: SubgraphMeta = {
        blockNumber: 100,
        hasIndexingErrors: false,
        deployment: "QmTest",
      };

      globalMetaCache.set("https://example.com/global", meta);
      expect(globalMetaCache.get("https://example.com/global")).toEqual(meta);

      globalMetaCache.clear(); // Clean up
    });
  });
});
