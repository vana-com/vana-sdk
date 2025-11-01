import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IRedisClient } from "../redisAtomicStore";
import { RedisAtomicStore } from "../redisAtomicStore";

// Mock ioredis
const mockRedis: IRedisClient = {
  incr: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  eval: vi.fn(),
  setex: vi.fn(),
};

describe("RedisAtomicStore", () => {
  let store: RedisAtomicStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new RedisAtomicStore({
      redis: mockRedis,
      keyPrefix: "test",
    });
  });

  describe("incr", () => {
    it("should atomically increment a counter", async () => {
      mockRedis.incr.mockResolvedValue(42);

      const result = await store.incr("counter");

      expect(result).toBe(42);
      expect(mockRedis.incr).toHaveBeenCalledWith("test:counter");
    });
  });

  describe("acquireLock", () => {
    it("should acquire lock when available", async () => {
      mockRedis.set.mockResolvedValue("OK");

      const lockId = await store.acquireLock("resource", 5);

      expect(lockId).toBeTruthy();
      expect(lockId).toContain("-");
      expect(mockRedis.set).toHaveBeenCalledWith(
        "test:resource",
        expect.any(String),
        "EX",
        5,
        "NX",
      );
    });

    it("should return null when lock is held", async () => {
      mockRedis.set.mockResolvedValue(null);

      const lockId = await store.acquireLock("resource", 5);

      expect(lockId).toBeNull();
    });
  });

  describe("releaseLock", () => {
    it("should release lock with matching ID", async () => {
      mockRedis.eval.mockResolvedValue(1);

      await store.releaseLock("resource", "lock-123");

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining("if redis.call"),
        1,
        "test:resource",
        "lock-123",
      );
    });

    it("should warn when lock ID doesn't match", async () => {
      mockRedis.eval.mockResolvedValue(0);
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await store.releaseLock("resource", "wrong-id");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Lock release failed"),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("get/set", () => {
    it("should store and retrieve values", async () => {
      mockRedis.get.mockResolvedValue("stored-value");

      await store.set("key", "stored-value");
      const value = await store.get("key");

      expect(mockRedis.set).toHaveBeenCalledWith("test:key", "stored-value");
      expect(value).toBe("stored-value");
    });

    it("should return null for missing keys", async () => {
      mockRedis.get.mockResolvedValue(null);

      const value = await store.get("missing");

      expect(value).toBeNull();
    });
  });

  describe("setWithTTL", () => {
    it("should set value with expiration", async () => {
      await store.setWithTTL?.("key", "value", 3600);

      expect(mockRedis.setex).toHaveBeenCalledWith("test:key", 3600, "value");
    });
  });

  describe("delete", () => {
    it("should delete a key", async () => {
      await store.delete?.("key");

      expect(mockRedis.del).toHaveBeenCalledWith("test:key");
    });
  });

  describe("error handling", () => {
    it("should validate redis client has required methods", () => {
      expect(() => {
        new RedisAtomicStore({
          redis: {} as unknown as IRedisClient,
        });
      }).toThrow("Invalid Redis client instance");
    });

    it("should reject string redis connection", () => {
      expect(() => {
        new RedisAtomicStore({
          redis: "redis://localhost:6379",
        });
      }).toThrow("requires an initialized Redis client instance");
    });
  });
});
