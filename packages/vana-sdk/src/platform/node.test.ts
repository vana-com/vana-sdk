import { describe, it, expect, vi, beforeEach } from "vitest";
import { NodePlatformAdapter } from "./node";

describe("NodePlatformAdapter", () => {
  let adapter: NodePlatformAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new NodePlatformAdapter();
  });

  describe("cache adapter", () => {
    describe("get", () => {
      it("should return null for non-existent key", () => {
        const result = adapter.cache.get("nonExistentKey");
        expect(result).toBeNull();
      });

      it("should return value for existing key", () => {
        adapter.cache.set("testKey", "testValue");
        const result = adapter.cache.get("testKey");
        expect(result).toBe("testValue");
      });

      it("should return null for expired entry and delete it", () => {
        // Set a value with immediate expiration
        const cache = (adapter.cache as any).cache;
        cache.set("expiredKey", {
          value: "expiredValue",
          expires: Date.now() - 1000, // Expired 1 second ago
        });

        // First get should return null and delete the entry
        const result = adapter.cache.get("expiredKey");
        expect(result).toBeNull();

        // Verify the entry was deleted
        expect(cache.has("expiredKey")).toBe(false);
      });
    });

    describe("set", () => {
      it("should set value with TTL", () => {
        const now = Date.now();
        vi.setSystemTime(now);

        adapter.cache.set("testKey", "testValue");

        const cache = (adapter.cache as any).cache;
        const entry = cache.get("testKey");

        expect(entry).toBeDefined();
        expect(entry.value).toBe("testValue");
        expect(entry.expires).toBe(now + 2 * 60 * 60 * 1000); // 2 hours

        vi.useRealTimers();
      });
    });

    describe("delete", () => {
      it("should delete item from cache", () => {
        adapter.cache.set("testKey", "testValue");
        adapter.cache.delete("testKey");

        const result = adapter.cache.get("testKey");
        expect(result).toBeNull();
      });
    });

    describe("clear", () => {
      it("should clear all items from cache", () => {
        adapter.cache.set("key1", "value1");
        adapter.cache.set("key2", "value2");

        adapter.cache.clear();

        expect(adapter.cache.get("key1")).toBeNull();
        expect(adapter.cache.get("key2")).toBeNull();
      });
    });
  });
});
