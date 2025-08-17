import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserPlatformAdapter } from "./browser";

// Mock modules
vi.mock("eccrypto-js", () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  getPublicCompressed: vi.fn(),
}));

vi.mock("openpgp", () => ({
  generateKey: vi.fn(),
  readKey: vi.fn(),
  createMessage: vi.fn(),
  encrypt: vi.fn(),
  readMessage: vi.fn(),
  decrypt: vi.fn(),
  config: {
    preferredHashAlgorithm: 8,
    preferredSymmetricAlgorithm: 9,
    preferredCompressionAlgorithm: 2,
    showComment: false,
    showVersion: false,
  },
  enums: {
    hash: {
      sha256: 8,
    },
    symmetric: {
      aes256: 9,
    },
    compression: {
      zlib: 2,
    },
  },
}));

describe("BrowserPlatformAdapter", () => {
  let adapter: BrowserPlatformAdapter;
  const originalSessionStorage = global.sessionStorage;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new BrowserPlatformAdapter();

    // Mock sessionStorage (the cache adapter uses sessionStorage for security)
    const sessionStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    };
    Object.defineProperty(global, "sessionStorage", {
      value: sessionStorageMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalSessionStorage) {
      global.sessionStorage = originalSessionStorage;
    } else {
      delete (global as any).sessionStorage;
    }
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete (global as any).fetch;
    }
  });

  describe("platform properties", () => {
    it("should identify as browser platform", () => {
      expect(adapter.platform).toBe("browser");
    });
  });

  describe("cache adapter", () => {
    describe("delete", () => {
      it("should delete item from sessionStorage", () => {
        adapter.cache.delete("testKey");

        expect(global.sessionStorage.removeItem).toHaveBeenCalledWith(
          "vana_cache_testKey",
        );
      });

      it("should handle sessionStorage not available", () => {
        delete (global as any).sessionStorage;

        // Should not throw
        expect(() => adapter.cache.delete("testKey")).not.toThrow();
      });

      it("should silently handle sessionStorage errors", () => {
        global.sessionStorage.removeItem = vi.fn().mockImplementation(() => {
          throw new Error("Storage error");
        });

        // Should not throw
        expect(() => adapter.cache.delete("testKey")).not.toThrow();
      });
    });

    describe("clear", () => {
      it("should clear all prefixed items from sessionStorage", () => {
        // Mock sessionStorage with some items
        const mockStorage: Record<string, string> = {
          vana_cache_key1: "value1",
          vana_cache_key2: "value2",
          other_key: "other_value",
          vana_cache_key3: "value3",
        };

        Object.defineProperty(global.sessionStorage, "length", {
          get: () => Object.keys(mockStorage).length,
          configurable: true,
        });

        global.sessionStorage.key = vi.fn((index: number) => {
          return Object.keys(mockStorage)[index] || null;
        });

        // Mock Object.keys for sessionStorage
        const originalObjectKeys = Object.keys;
        Object.keys = vi.fn((obj: any) => {
          if (obj === global.sessionStorage) {
            return Object.keys(mockStorage);
          }
          return originalObjectKeys(obj);
        });

        adapter.cache.clear();

        // Should remove only vana_cache_ prefixed items
        expect(global.sessionStorage.removeItem).toHaveBeenCalledTimes(3);
        expect(global.sessionStorage.removeItem).toHaveBeenCalledWith(
          "vana_cache_key1",
        );
        expect(global.sessionStorage.removeItem).toHaveBeenCalledWith(
          "vana_cache_key2",
        );
        expect(global.sessionStorage.removeItem).toHaveBeenCalledWith(
          "vana_cache_key3",
        );
        expect(global.sessionStorage.removeItem).not.toHaveBeenCalledWith(
          "other_key",
        );

        // Restore Object.keys
        Object.keys = originalObjectKeys;
      });

      it("should handle sessionStorage not available", () => {
        delete (global as any).sessionStorage;

        // Should not throw
        expect(() => adapter.cache.clear()).not.toThrow();
      });

      it("should silently handle sessionStorage errors", () => {
        const originalObjectKeys = Object.keys;
        Object.keys = vi.fn(() => {
          throw new Error("Storage error");
        });

        // Should not throw
        expect(() => adapter.cache.clear()).not.toThrow();

        // Restore Object.keys
        Object.keys = originalObjectKeys;
      });

      it("should handle empty sessionStorage", () => {
        const originalObjectKeys = Object.keys;
        Object.keys = vi.fn((obj: any) => {
          if (obj === global.sessionStorage) {
            return [];
          }
          return originalObjectKeys(obj);
        });

        adapter.cache.clear();

        expect(global.sessionStorage.removeItem).not.toHaveBeenCalled();

        // Restore Object.keys
        Object.keys = originalObjectKeys;
      });
    });

    describe("get", () => {
      it("should get item from sessionStorage", () => {
        global.sessionStorage.getItem = vi.fn().mockReturnValue("testValue");

        const result = adapter.cache.get("testKey");

        expect(global.sessionStorage.getItem).toHaveBeenCalledWith(
          "vana_cache_testKey",
        );
        expect(result).toBe("testValue");
      });

      it("should return null when sessionStorage not available", () => {
        delete (global as any).sessionStorage;

        const result = adapter.cache.get("testKey");

        expect(result).toBe(null);
      });

      it("should return null on sessionStorage errors", () => {
        global.sessionStorage.getItem = vi.fn().mockImplementation(() => {
          throw new Error("Storage error");
        });

        const result = adapter.cache.get("testKey");

        expect(result).toBe(null);
      });
    });

    describe("set", () => {
      it("should set item in sessionStorage", () => {
        adapter.cache.set("testKey", "testValue");

        expect(global.sessionStorage.setItem).toHaveBeenCalledWith(
          "vana_cache_testKey",
          "testValue",
        );
      });

      it("should handle sessionStorage not available", () => {
        delete (global as any).sessionStorage;

        // Should not throw
        expect(() => adapter.cache.set("testKey", "testValue")).not.toThrow();
      });

      it("should silently handle sessionStorage errors", () => {
        global.sessionStorage.setItem = vi.fn().mockImplementation(() => {
          throw new Error("Quota exceeded");
        });

        // Should not throw
        expect(() => adapter.cache.set("testKey", "testValue")).not.toThrow();
      });
    });
  });

  describe("http adapter", () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue(new Response());
    });

    it("should use fetch API", async () => {
      const url = "https://example.com";
      const options = { method: "POST" };

      await adapter.http.fetch(url, options);

      expect(global.fetch).toHaveBeenCalledWith(url, options);
    });

    it("should throw when fetch is not available", async () => {
      delete (global as any).fetch;

      await expect(adapter.http.fetch("https://example.com")).rejects.toThrow(
        "Fetch API not available in this browser environment",
      );
    });
  });
});
