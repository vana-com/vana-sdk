import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createNodePlatformAdapter,
  createBrowserPlatformAdapter,
  createPlatformAdapterSafe,
} from "./browser-safe";
import { BrowserPlatformAdapter } from "./browser";
import { PlatformTestHelper } from "../tests/helpers/platformTestHelpers";

// Mock the browser module
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

describe("browser-safe", () => {
  let platformHelper: PlatformTestHelper;

  beforeEach(() => {
    vi.clearAllMocks();
    platformHelper = new PlatformTestHelper();
  });

  afterEach(() => {
    platformHelper.restore();
  });

  describe("createNodePlatformAdapter", () => {
    it("should throw error in browser environment", async () => {
      // Use helper for browser environment setup
      platformHelper.setupBrowserEnvironment();

      await expect(createNodePlatformAdapter()).rejects.toThrow(
        "NodePlatformAdapter is not available in browser environments. Use BrowserPlatformAdapter instead.",
      );
    });

    it("should create NodePlatformAdapter in Node environment", async () => {
      // Use helper for Node environment setup
      platformHelper.setupNodeEnvironment("16.0.0");

      // Mock dynamic import
      vi.doMock("./node", () => ({
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

      const adapter = await createNodePlatformAdapter();

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("node");
    });
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
    it("should return BrowserPlatformAdapter in browser environment", async () => {
      // Use helper for browser environment setup
      platformHelper.setupBrowserEnvironment();

      const adapter = await createPlatformAdapterSafe();

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("browser");
      expect(BrowserPlatformAdapter).toHaveBeenCalled();
    });

    it("should return NodePlatformAdapter in Node environment", async () => {
      // Use helper for Node environment setup
      platformHelper.setupNodeEnvironment("16.0.0");

      // Mock dynamic import
      vi.doMock("./node", () => ({
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

      const adapter = await createPlatformAdapterSafe();

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("node");
    });

    it("should return BrowserPlatformAdapter when process exists but window is defined", async () => {
      // Use helper for Node environment setup then add window
      platformHelper.setupNodeEnvironment("16.0.0");
      globalThis.window = {} as Window & typeof globalThis;

      const adapter = await createPlatformAdapterSafe();

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("browser");
      expect(BrowserPlatformAdapter).toHaveBeenCalled();
    });

    it("should default to BrowserPlatformAdapter when environment cannot be determined", async () => {
      // Use helper to setup process without versions.node
      platformHelper.setupNodeWithProcess({ versions: {} as any }); // process exists but no versions.node

      const adapter = await createPlatformAdapterSafe();

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("browser");
      expect(BrowserPlatformAdapter).toHaveBeenCalled();
    });

    it("should default to BrowserPlatformAdapter when process does not exist", async () => {
      // Use helper for ambiguous environment (no window, no process)
      platformHelper.setupAmbiguousEnvironment();

      const adapter = await createPlatformAdapterSafe();

      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe("browser");
      expect(BrowserPlatformAdapter).toHaveBeenCalled();
    });
  });
});
