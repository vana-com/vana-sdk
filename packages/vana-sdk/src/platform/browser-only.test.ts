import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createBrowserPlatformAdapter,
  createPlatformAdapterSafe,
} from "./browser-only";
import { BrowserPlatformAdapter } from "./browser";

vi.mock("./browser", () => ({
  BrowserPlatformAdapter: vi.fn().mockImplementation(() => ({
    platform: "browser" as const,
    crypto: {
      encryptWithPublicKey: vi.fn(),
      decryptWithPrivateKey: vi.fn(),
      generateKeyPair: vi.fn(),
      encryptWithWalletPublicKey: vi.fn(),
      decryptWithWalletPrivateKey: vi.fn(),
      encryptWithPassword: vi.fn(),
      decryptWithPassword: vi.fn(),
    },
    pgp: {
      encrypt: vi.fn(),
      decrypt: vi.fn(),
      generateKeyPair: vi.fn(),
    },
    http: {
      fetch: vi.fn(),
    },
    cache: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    },
  })),
}));

describe("browser-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  describe("createBrowserPlatformAdapter", () => {
    it("should create and return a BrowserPlatformAdapter instance", () => {
      const adapter = createBrowserPlatformAdapter();

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("browser");
      expect(BrowserPlatformAdapter).toHaveBeenCalled();
    });

    it("should create a new instance each time it is called", () => {
      const adapter1 = createBrowserPlatformAdapter();
      const adapter2 = createBrowserPlatformAdapter();

      expect(adapter1).not.toBe(adapter2);
      expect(BrowserPlatformAdapter).toHaveBeenCalledTimes(2);
    });
  });

  describe("createPlatformAdapterSafe", () => {
    it("should create and return a BrowserPlatformAdapter instance", () => {
      const adapter = createPlatformAdapterSafe();

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("browser");
      expect(BrowserPlatformAdapter).toHaveBeenCalled();
    });

    it("should always return a browser adapter (safe for browser environments)", () => {
      const adapter = createPlatformAdapterSafe();

      expect(adapter.platform).toBe("browser");
    });

    it("should create a new instance each time it is called", () => {
      const adapter1 = createPlatformAdapterSafe();
      const adapter2 = createPlatformAdapterSafe();

      expect(adapter1).not.toBe(adapter2);
      expect(BrowserPlatformAdapter).toHaveBeenCalledTimes(2);
    });
  });

  describe("integration", () => {
    it("both factory functions should return compatible adapter instances", () => {
      const adapter1 = createBrowserPlatformAdapter();
      const adapter2 = createPlatformAdapterSafe();

      expect(adapter1.platform).toBe(adapter2.platform);
      expect(adapter1.platform).toBe("browser");
      expect(adapter2.platform).toBe("browser");
    });
  });
});
