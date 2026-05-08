import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InMemoryTokenStore, type TokenRecord } from "./token-store";

describe("InMemoryTokenStore", () => {
  let store: InMemoryTokenStore;

  beforeEach(() => {
    store = new InMemoryTokenStore();
  });

  it("returns the same record after set", async () => {
    const record: TokenRecord = { token: "abc" };
    await store.set("k", record);
    await expect(store.get("k")).resolves.toEqual(record);
  });

  it("preserves expiresAt on round-trip", async () => {
    const record: TokenRecord = { token: "abc", expiresAt: 9_999_999_999 };
    await store.set("k", record);
    const got = await store.get("k");
    expect(got).toEqual(record);
  });

  it("returns null for a missing key", async () => {
    await expect(store.get("missing")).resolves.toBeNull();
  });

  it("overwrites existing entries on set", async () => {
    await store.set("k", { token: "first" });
    await store.set("k", { token: "second" });
    await expect(store.get("k")).resolves.toEqual({ token: "second" });
  });

  describe("expiration", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns null after expiresAt has passed", async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      await store.set("k", { token: "abc", expiresAt: nowSeconds + 60 });

      await expect(store.get("k")).resolves.toEqual({
        token: "abc",
        expiresAt: nowSeconds + 60,
      });

      vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));
      await expect(store.get("k")).resolves.toBeNull();
    });

    it("treats expiresAt equal to now as expired", async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      await store.set("k", { token: "abc", expiresAt: nowSeconds });
      await expect(store.get("k")).resolves.toBeNull();
    });

    it("evicts expired entries on read", async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      await store.set("k", { token: "abc", expiresAt: nowSeconds + 1 });
      expect(store.size).toBe(1);

      vi.setSystemTime(new Date("2026-01-01T00:00:05Z"));
      await store.get("k");
      expect(store.size).toBe(0);
    });

    it("never expires when expiresAt is omitted", async () => {
      await store.set("k", { token: "abc" });
      vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
      await expect(store.get("k")).resolves.toEqual({ token: "abc" });
    });
  });

  describe("delete", () => {
    it("removes a stored record", async () => {
      await store.set("k", { token: "abc" });
      await store.delete("k");
      await expect(store.get("k")).resolves.toBeNull();
    });

    it("is idempotent for missing keys", async () => {
      await expect(store.delete("missing")).resolves.toBeUndefined();
    });
  });

  describe("clear", () => {
    it("removes all entries", async () => {
      await store.set("a", { token: "1" });
      await store.set("b", { token: "2" });
      await store.clear();
      await expect(store.get("a")).resolves.toBeNull();
      await expect(store.get("b")).resolves.toBeNull();
      expect(store.size).toBe(0);
    });
  });
});
