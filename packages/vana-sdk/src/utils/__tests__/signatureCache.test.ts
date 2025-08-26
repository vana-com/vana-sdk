import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignatureCache, withSignatureCache } from "../signatureCache";
import { getAddress } from "viem";

// Mock cache adapter
const mockCacheAdapter = {
  store: new Map<string, string>(),
  get: vi.fn((key: string) => mockCacheAdapter.store.get(key) || null),
  set: vi.fn((key: string, value: string) => {
    mockCacheAdapter.store.set(key, value);
  }),
  delete: vi.fn((key: string) => {
    mockCacheAdapter.store.delete(key);
  }),
  clear: vi.fn(() => {
    mockCacheAdapter.store.clear();
  }),
};

describe("SignatureCache", () => {
  const walletAddress = "0x1234567890123456789012345678901234567890";
  const checksummedAddress = getAddress(walletAddress); // Get checksummed version
  const messageHash = "test-message-hash";
  const signature = "0xabcdef" as const;

  beforeEach(() => {
    mockCacheAdapter.store.clear();
    SignatureCache.clear(mockCacheAdapter);
    vi.clearAllMocks();
  });

  describe("get", () => {
    it("should return null if no signature is cached", () => {
      const result = SignatureCache.get(
        mockCacheAdapter,
        walletAddress,
        messageHash,
      );
      expect(result).toBeNull();
    });

    it("should return cached signature if valid", () => {
      const expires = Date.now() + 3600000; // 1 hour from now
      const cached = JSON.stringify({ signature, expires });
      const key = `vana_sig_${checksummedAddress}:${messageHash}`;

      mockCacheAdapter.store.set(key, cached);

      const result = SignatureCache.get(
        mockCacheAdapter,
        walletAddress,
        messageHash,
      );
      expect(result).toBe(signature);
    });

    it("should return null and clean up if signature is expired", () => {
      const expires = Date.now() - 1000; // 1 second ago (expired)
      const cached = JSON.stringify({ signature, expires });
      const key = `vana_sig_${checksummedAddress}:${messageHash}`;

      mockCacheAdapter.store.set(key, cached);

      const result = SignatureCache.get(
        mockCacheAdapter,
        walletAddress,
        messageHash,
      );
      expect(result).toBeNull();
      expect(mockCacheAdapter.delete).toHaveBeenCalledWith(key);
    });

    it("should handle invalid JSON gracefully", () => {
      const key = `vana_sig_${checksummedAddress}:${messageHash}`;
      mockCacheAdapter.store.set(key, "invalid-json");

      const result = SignatureCache.get(
        mockCacheAdapter,
        walletAddress,
        messageHash,
      );
      expect(result).toBeNull();
      expect(mockCacheAdapter.delete).toHaveBeenCalledWith(key);
    });
  });

  describe("set", () => {
    it("should store signature with default TTL", () => {
      SignatureCache.set(
        mockCacheAdapter,
        walletAddress,
        messageHash,
        signature,
      );

      expect(mockCacheAdapter.set).toHaveBeenCalled();
      const [key, value] = mockCacheAdapter.set.mock.calls[0];
      expect(key).toBe(`vana_sig_${checksummedAddress}:${messageHash}`);

      const parsed = JSON.parse(value);
      expect(parsed.signature).toBe(signature);
      expect(parsed.expires).toBeGreaterThan(Date.now());
    });

    it("should store signature with custom TTL", () => {
      const customTtlHours = 1;
      SignatureCache.set(
        mockCacheAdapter,
        walletAddress,
        messageHash,
        signature,
        customTtlHours,
      );

      const [, value] = mockCacheAdapter.set.mock.calls[0];
      const parsed = JSON.parse(value);

      // Should expire in about 1 hour (allowing for test execution time)
      const expectedExpiry = Date.now() + customTtlHours * 3600000;
      expect(parsed.expires).toBeCloseTo(expectedExpiry, -3); // Within 1 second
    });
  });

  describe("clear", () => {
    it("should clear all cached signatures", () => {
      // Set up some test data
      mockCacheAdapter.store.set("vana_sig_test1", "data1");
      mockCacheAdapter.store.set("vana_sig_test2", "data2");
      mockCacheAdapter.store.set("other_key", "other_data");

      SignatureCache.clear(mockCacheAdapter);

      expect(mockCacheAdapter.clear).toHaveBeenCalled();
    });
  });

  describe("withSignatureCache", () => {
    it("should call sign function if no cached signature", async () => {
      const typedData = { message: "test" };
      const signFn = vi.fn().mockResolvedValue(signature);

      const result = await withSignatureCache(
        mockCacheAdapter,
        walletAddress,
        typedData,
        signFn,
      );

      expect(signFn).toHaveBeenCalled();
      expect(result).toBe(signature);
      expect(mockCacheAdapter.set).toHaveBeenCalled();
    });

    it("should return cached signature without calling sign function", async () => {
      const typedData = { message: "test" };
      const signFn = vi.fn().mockResolvedValue(signature);

      // Set up cache first
      await withSignatureCache(
        mockCacheAdapter,
        walletAddress,
        typedData,
        signFn,
      );
      vi.clearAllMocks();

      // Second call should use cache
      const result = await withSignatureCache(
        mockCacheAdapter,
        walletAddress,
        typedData,
        signFn,
      );

      expect(signFn).not.toHaveBeenCalled();
      expect(result).toBe(signature);
      expect(mockCacheAdapter.set).not.toHaveBeenCalled();
    });

    it("should create different cache keys for different typed data", async () => {
      const typedData1 = { message: "test1" };
      const typedData2 = { message: "test2" };
      const signFn = vi.fn().mockResolvedValue(signature);

      await withSignatureCache(
        mockCacheAdapter,
        walletAddress,
        typedData1,
        signFn,
      );
      await withSignatureCache(
        mockCacheAdapter,
        walletAddress,
        typedData2,
        signFn,
      );

      expect(signFn).toHaveBeenCalledTimes(2);
      expect(mockCacheAdapter.set).toHaveBeenCalledTimes(2);
    });

    it("should handle BigInt values in typed data without throwing", async () => {
      const typedDataWithBigInt = {
        domain: {
          name: "TestDomain",
          version: "1",
          chainId: 1337n, // BigInt value
          verifyingContract: "0x1234567890123456789012345678901234567890",
        },
        message: {
          nonce: 12345n, // BigInt value
          timestamp: BigInt(Date.now()),
          value: "test",
        },
      };
      const signFn = vi.fn().mockResolvedValue(signature);

      // This should not throw "Do not know how to serialize a BigInt" error
      const result = await withSignatureCache(
        mockCacheAdapter,
        walletAddress,
        typedDataWithBigInt,
        signFn,
      );

      expect(signFn).toHaveBeenCalled();
      expect(result).toBe(signature);
      expect(mockCacheAdapter.set).toHaveBeenCalled();
    });

    it("should create consistent cache keys for equivalent BigInt values", async () => {
      const typedData1 = { chainId: 1337n, nonce: 123n };
      const typedData2 = { chainId: BigInt(1337), nonce: BigInt("123") };
      const signFn = vi.fn().mockResolvedValue(signature);

      // First call should cache the signature
      await withSignatureCache(
        mockCacheAdapter,
        walletAddress,
        typedData1,
        signFn,
      );
      vi.clearAllMocks();

      // Second call with equivalent BigInt values should use cache
      const result = await withSignatureCache(
        mockCacheAdapter,
        walletAddress,
        typedData2,
        signFn,
      );

      expect(signFn).not.toHaveBeenCalled(); // Should use cached value
      expect(result).toBe(signature);
      expect(mockCacheAdapter.set).not.toHaveBeenCalled();
    });
  });

  describe("hashMessage", () => {
    it("should handle objects without BigInt values", () => {
      const message = { test: "value", number: 123 };
      const hash = SignatureCache.hashMessage(message);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(66); // SHA-256 produces 64 hex characters + 0x prefix
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/); // Should be valid hex with 0x prefix
    });

    it("should handle objects with BigInt values", () => {
      const message = { chainId: 1337n, nonce: 123n, test: "value" };

      // Should not throw
      expect(() => SignatureCache.hashMessage(message)).not.toThrow();

      const hash = SignatureCache.hashMessage(message);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(66); // SHA-256 produces 64 hex characters + 0x prefix
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/); // Should be valid hex with 0x prefix
    });

    it("should create consistent hashes for equivalent BigInt values", () => {
      const message1 = { chainId: 1337n, nonce: 123n };
      const message2 = { chainId: BigInt(1337), nonce: BigInt("123") };

      const hash1 = SignatureCache.hashMessage(message1);
      const hash2 = SignatureCache.hashMessage(message2);

      expect(hash1).toBe(hash2);
    });

    it("should create different hashes for different BigInt values", () => {
      const message1 = { chainId: 1337n };
      const message2 = { chainId: 1338n };

      const hash1 = SignatureCache.hashMessage(message1);
      const hash2 = SignatureCache.hashMessage(message2);

      expect(hash1).not.toBe(hash2);
    });

    it("should handle nested objects with BigInt values", () => {
      const message = {
        domain: {
          chainId: 1337n,
          version: "1",
        },
        message: {
          nonce: BigInt("999999999999999999"), // Large BigInt
          values: [1n, 2n, 3n],
        },
      };

      expect(() => SignatureCache.hashMessage(message)).not.toThrow();

      const hash = SignatureCache.hashMessage(message);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(66); // SHA-256 produces 64 hex characters + 0x prefix
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/); // Should be valid hex with 0x prefix
    });
  });
});
