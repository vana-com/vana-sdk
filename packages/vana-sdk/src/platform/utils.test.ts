import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectPlatform,
  createPlatformAdapter,
  createPlatformAdapterFor,
  isPlatformSupported,
  getPlatformCapabilities,
} from "./utils";

// Mock the browser and node modules
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

vi.mock("./node", () => ({
  NodePlatformAdapter: vi.fn().mockImplementation(() => ({
    platform: "node" as const,
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

import { PlatformTestHelper } from "../tests/helpers/platformTestHelpers";

describe("platform utils", () => {
  let platformHelper: PlatformTestHelper;

  beforeEach(() => {
    vi.clearAllMocks();
    platformHelper = new PlatformTestHelper();
  });

  afterEach(() => {
    platformHelper.restore();
    vi.unstubAllGlobals();
  });

  describe("detectPlatform", () => {
    it("should detect Node.js environment", () => {
      // Use type-safe helper instead of manual global manipulation
      platformHelper.setupNodeEnvironment("16.0.0");

      expect(detectPlatform()).toBe("node");
    });

    it("should detect browser environment", () => {
      // Use type-safe helper instead of manual global manipulation
      platformHelper.setupBrowserEnvironment();

      expect(detectPlatform()).toBe("browser");
    });

    it("should default to Node.js when environment cannot be determined", () => {
      // Use helper to create ambiguous environment
      platformHelper.setupAmbiguousEnvironment();

      expect(detectPlatform()).toBe("node");
    });

    it("should detect Node.js even when process exists without versions", () => {
      // Use helper to create process without versions
      platformHelper.setupNodeWithProcess({ versions: undefined });

      expect(detectPlatform()).toBe("node");
    });
  });

  describe("createPlatformAdapter", () => {
    it("should create NodePlatformAdapter in Node environment", async () => {
      // Use helper for Node environment setup
      platformHelper.setupNodeEnvironment("16.0.0");

      const adapter = await createPlatformAdapter();

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("node");
    });

    it("should create BrowserPlatformAdapter in browser environment", async () => {
      // Use helper for browser environment setup
      platformHelper.setupBrowserEnvironment();

      const adapter = await createPlatformAdapter();

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("browser");
    });

    it("should throw error when trying to create NodePlatformAdapter in browser", async () => {
      // Simulate edge case: Node.js detected but window exists
      platformHelper.setupNodeEnvironment("16.0.0");
      globalThis.window = {} as Window & typeof globalThis;

      await expect(createPlatformAdapter()).rejects.toThrow(
        "Failed to create platform adapter for node: NodePlatformAdapter is not available in browser environments. Use BrowserPlatformAdapter instead.",
      );
    });

    it("should handle constructor errors gracefully", async () => {
      // Use helper for browser environment setup
      platformHelper.setupBrowserEnvironment();

      // Mock BrowserPlatformAdapter to throw during construction
      const { BrowserPlatformAdapter } = await import("./browser");
      const mockAdapter = vi.mocked(BrowserPlatformAdapter);
      mockAdapter.mockImplementationOnce(() => {
        throw new Error("Constructor failed");
      });

      await expect(createPlatformAdapter()).rejects.toThrow(
        "Failed to create platform adapter for browser: Constructor failed",
      );
    });
  });

  describe("createPlatformAdapterFor", () => {
    it("should create NodePlatformAdapter when specified", async () => {
      // Use helper for Node environment setup
      platformHelper.setupNodeEnvironment("16.0.0");

      const adapter = await createPlatformAdapterFor("node");

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("node");
    });

    it("should create BrowserPlatformAdapter when specified", async () => {
      // Any environment should work for browser adapter
      const adapter = await createPlatformAdapterFor("browser");

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("browser");
    });

    it("should throw error when trying to create NodePlatformAdapter in browser", async () => {
      // Use helper for browser environment setup
      platformHelper.setupBrowserEnvironment();

      await expect(createPlatformAdapterFor("node")).rejects.toThrow(
        "Failed to create platform adapter for node: NodePlatformAdapter is not available in browser environments. Use BrowserPlatformAdapter instead.",
      );
    });

    it("should handle constructor errors gracefully", async () => {
      // Mock BrowserPlatformAdapter to throw during construction
      const { BrowserPlatformAdapter } = await import("./browser");
      const mockAdapter = vi.mocked(BrowserPlatformAdapter);
      mockAdapter.mockImplementationOnce(() => {
        throw new Error("Browser constructor failed");
      });

      await expect(createPlatformAdapterFor("browser")).rejects.toThrow(
        "Failed to create platform adapter for browser: Browser constructor failed",
      );
    });

    it("should handle non-Error exceptions in createPlatformAdapterFor", async () => {
      // Mock BrowserPlatformAdapter to throw a non-Error
      const { BrowserPlatformAdapter } = await import("./browser");
      const mockAdapter = vi.mocked(BrowserPlatformAdapter);
      mockAdapter.mockImplementationOnce(() => {
        throw { message: "Object error" };
      });

      await expect(createPlatformAdapterFor("browser")).rejects.toThrow(
        "Failed to create platform adapter for browser: Unknown error",
      );
    });
  });

  describe("createPlatformAdapter error handling", () => {
    it("should handle non-Error exceptions in createPlatformAdapter", async () => {
      // Use helper for browser environment setup
      platformHelper.setupBrowserEnvironment();

      // Mock BrowserPlatformAdapter to throw a non-Error
      const { BrowserPlatformAdapter } = await import("./browser");
      const mockAdapter = vi.mocked(BrowserPlatformAdapter);
      mockAdapter.mockImplementationOnce(() => {
        throw "String error";
      });

      await expect(createPlatformAdapter()).rejects.toThrow(
        "Failed to create platform adapter for browser: Unknown error",
      );
    });
  });

  describe("isPlatformSupported", () => {
    it("should return true when platform matches in Node", () => {
      // Use helper for Node environment setup
      platformHelper.setupNodeEnvironment("16.0.0");

      expect(isPlatformSupported("node")).toBe(true);
      expect(isPlatformSupported("browser")).toBe(false);
    });

    it("should return true when platform matches in browser", () => {
      // Use helper for browser environment setup
      platformHelper.setupBrowserEnvironment();

      expect(isPlatformSupported("browser")).toBe(true);
      expect(isPlatformSupported("node")).toBe(false);
    });
  });

  describe("getPlatformCapabilities", () => {
    it("should return Node.js capabilities", () => {
      // Use helper for Node environment setup with crypto
      platformHelper.setupNodeEnvironment("16.0.0");
      vi.stubGlobal("crypto", {
        subtle: {},
      });
      vi.stubGlobal("fetch", vi.fn());
      vi.stubGlobal("ReadableStream", vi.fn());

      const capabilities = getPlatformCapabilities();

      expect(capabilities).toEqual({
        platform: "node",
        crypto: {
          webCrypto: {},
          nodeCrypto: "16.0.0", // Returns the node version string
        },
        fetch: true,
        streams: true,
      });
    });

    it("should return browser capabilities", () => {
      // Use helper for browser environment setup
      platformHelper.setupBrowserEnvironment();
      vi.stubGlobal("crypto", {
        subtle: {},
      });
      vi.stubGlobal("fetch", vi.fn());
      vi.stubGlobal("ReadableStream", vi.fn());

      const capabilities = getPlatformCapabilities();

      expect(capabilities).toEqual({
        platform: "browser",
        crypto: {
          webCrypto: {},
          nodeCrypto: false,
        },
        fetch: true,
        streams: true,
      });
    });

    it("should handle missing capabilities", () => {
      // Use helper for minimal environment setup
      platformHelper.setupAmbiguousEnvironment();
      // Remove global capabilities
      Reflect.deleteProperty(globalThis, "crypto");
      Reflect.deleteProperty(globalThis, "fetch");
      Reflect.deleteProperty(globalThis, "ReadableStream");

      const capabilities = getPlatformCapabilities();

      expect(capabilities).toEqual({
        platform: "node",
        crypto: {
          webCrypto: false,
          nodeCrypto: false,
        },
        fetch: false,
        streams: false,
      });
    });

    it("should detect globalThis.fetch when fetch is not directly available", () => {
      // Use helper for minimal environment setup
      platformHelper.setupAmbiguousEnvironment();
      vi.unstubAllGlobals(); // Clear any previous stubs
      vi.stubGlobal("fetch", undefined); // Remove direct fetch
      Object.defineProperty(globalThis, "fetch", {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });

      const capabilities = getPlatformCapabilities();

      expect(capabilities.fetch).toBe(true);
    });
  });
});
