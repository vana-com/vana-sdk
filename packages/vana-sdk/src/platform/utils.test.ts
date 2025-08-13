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

describe("platform utils", () => {
  const originalWindow = global.window;
  const originalDocument = global.document;
  const originalProcess = global.process;
  const _originalCrypto = global.crypto;
  const _originalFetch = global.fetch;
  const _originalReadableStream = global.ReadableStream;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset globals for each test
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    // Restore original values using Object.defineProperty
    if (originalWindow !== undefined) {
      Object.defineProperty(global, "window", {
        value: originalWindow,
        writable: true,
        configurable: true,
      });
    } else {
      delete (global as any).window;
    }

    if (originalDocument !== undefined) {
      Object.defineProperty(global, "document", {
        value: originalDocument,
        writable: true,
        configurable: true,
      });
    } else {
      delete (global as any).document;
    }

    if (originalProcess !== undefined) {
      Object.defineProperty(global, "process", {
        value: originalProcess,
        writable: true,
        configurable: true,
      });
    } else {
      delete (global as any).process;
    }

    vi.unstubAllGlobals();
  });

  describe("detectPlatform", () => {
    it("should detect Node.js environment", () => {
      // Simulate Node environment
      delete (global as any).window;
      delete (global as any).document;
      global.process = {
        versions: { node: "16.0.0" },
      } as any;

      expect(detectPlatform()).toBe("node");
    });

    it("should detect browser environment", () => {
      // Simulate browser environment
      global.window = {} as any;
      global.document = {} as any;
      delete (global as any).process;

      expect(detectPlatform()).toBe("browser");
    });

    it("should default to Node.js when environment cannot be determined", () => {
      // Simulate ambiguous environment
      delete (global as any).window;
      delete (global as any).document;
      delete (global as any).process;

      expect(detectPlatform()).toBe("node");
    });

    it("should detect Node.js even when process exists without versions", () => {
      // Simulate incomplete process object
      delete (global as any).window;
      delete (global as any).document;
      global.process = {} as any;

      expect(detectPlatform()).toBe("node");
    });
  });

  describe("createPlatformAdapter", () => {
    it("should create NodePlatformAdapter in Node environment", async () => {
      // Simulate Node environment
      delete (global as any).window;
      global.process = {
        versions: { node: "16.0.0" },
      } as any;

      const adapter = await createPlatformAdapter();

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("node");
    });

    it("should create BrowserPlatformAdapter in browser environment", async () => {
      // Simulate browser environment
      global.window = {} as any;
      global.document = {} as any;
      delete (global as any).process;

      const adapter = await createPlatformAdapter();

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("browser");
    });

    it("should throw error when trying to create NodePlatformAdapter in browser", async () => {
      // Simulate edge case: Node.js detected but window exists
      global.window = {} as any;
      global.process = {
        versions: { node: "16.0.0" },
      } as any;

      await expect(createPlatformAdapter()).rejects.toThrow(
        "Failed to create platform adapter for node: NodePlatformAdapter is not available in browser environments. Use BrowserPlatformAdapter instead.",
      );
    });

    it("should handle constructor errors gracefully", async () => {
      // Simulate browser environment
      global.window = {} as any;
      global.document = {} as any;
      delete (global as any).process;

      // Mock BrowserPlatformAdapter to throw during construction
      const { BrowserPlatformAdapter } = await import("./browser");
      (BrowserPlatformAdapter as any).mockImplementationOnce(() => {
        throw new Error("Constructor failed");
      });

      await expect(createPlatformAdapter()).rejects.toThrow(
        "Failed to create platform adapter for browser: Constructor failed",
      );
    });
  });

  describe("createPlatformAdapterFor", () => {
    it("should create NodePlatformAdapter when specified", async () => {
      // Simulate Node environment
      delete (global as any).window;
      global.process = {
        versions: { node: "16.0.0" },
      } as any;

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
      // Simulate browser environment
      global.window = {} as any;

      await expect(createPlatformAdapterFor("node")).rejects.toThrow(
        "Failed to create platform adapter for node: NodePlatformAdapter is not available in browser environments. Use BrowserPlatformAdapter instead.",
      );
    });

    it("should handle constructor errors gracefully", async () => {
      // Mock BrowserPlatformAdapter to throw during construction
      const { BrowserPlatformAdapter } = await import("./browser");
      (BrowserPlatformAdapter as any).mockImplementationOnce(() => {
        throw new Error("Browser constructor failed");
      });

      await expect(createPlatformAdapterFor("browser")).rejects.toThrow(
        "Failed to create platform adapter for browser: Browser constructor failed",
      );
    });

    it("should handle non-Error exceptions in createPlatformAdapterFor", async () => {
      // Mock BrowserPlatformAdapter to throw a non-Error
      const { BrowserPlatformAdapter } = await import("./browser");
      (BrowserPlatformAdapter as any).mockImplementationOnce(() => {
        throw { message: "Object error" };
      });

      await expect(createPlatformAdapterFor("browser")).rejects.toThrow(
        "Failed to create platform adapter for browser: Unknown error",
      );
    });
  });

  describe("createPlatformAdapter error handling", () => {
    it("should handle non-Error exceptions in createPlatformAdapter", async () => {
      // Simulate browser environment
      global.window = {} as any;
      global.document = {} as any;
      delete (global as any).process;

      // Mock BrowserPlatformAdapter to throw a non-Error
      const { BrowserPlatformAdapter } = await import("./browser");
      (BrowserPlatformAdapter as any).mockImplementationOnce(() => {
        throw "String error";
      });

      await expect(createPlatformAdapter()).rejects.toThrow(
        "Failed to create platform adapter for browser: Unknown error",
      );
    });
  });

  describe("isPlatformSupported", () => {
    it("should return true when platform matches in Node", () => {
      // Simulate Node environment
      delete (global as any).window;
      delete (global as any).document;
      global.process = {
        versions: { node: "16.0.0" },
      } as any;

      expect(isPlatformSupported("node")).toBe(true);
      expect(isPlatformSupported("browser")).toBe(false);
    });

    it("should return true when platform matches in browser", () => {
      // Simulate browser environment
      global.window = {} as any;
      global.document = {} as any;
      delete (global as any).process;

      expect(isPlatformSupported("browser")).toBe(true);
      expect(isPlatformSupported("node")).toBe(false);
    });
  });

  describe("getPlatformCapabilities", () => {
    it("should return Node.js capabilities", () => {
      // Simulate Node environment with crypto
      delete (global as any).window;
      delete (global as any).document;
      global.process = {
        versions: { node: "16.0.0" },
      } as any;
      vi.stubGlobal("crypto", {
        subtle: {} as any,
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
      // Simulate browser environment
      global.window = {} as any;
      global.document = {} as any;
      delete (global as any).process;
      vi.stubGlobal("crypto", {
        subtle: {} as any,
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
      // Simulate minimal environment
      delete (global as any).window;
      delete (global as any).document;
      delete (global as any).process;
      delete (global as any).crypto;
      delete (global as any).fetch;
      delete (global as any).ReadableStream;

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
      // Simulate environment with globalThis.fetch but not direct fetch
      delete (global as any).window;
      delete (global as any).document;
      delete (global as any).process;
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
