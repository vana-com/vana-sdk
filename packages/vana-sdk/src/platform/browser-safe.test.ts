import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createNodePlatformAdapter,
  createBrowserPlatformAdapter,
  createPlatformAdapterSafe,
} from "./browser-safe";
import { BrowserPlatformAdapter } from "./browser";

// Mock the browser module
vi.mock("./browser", () => ({
  BrowserPlatformAdapter: vi.fn().mockImplementation(() => ({
    isNode: false,
    isBrowser: true,
    environment: "browser",
  })),
}));

describe("browser-safe", () => {
  const originalWindow = global.window;
  const originalProcess = global.process;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original values
    global.window = originalWindow;
    global.process = originalProcess;
  });

  describe("createNodePlatformAdapter", () => {
    it("should throw error in browser environment", async () => {
      // Simulate browser environment
      global.window = {} as any;

      await expect(createNodePlatformAdapter()).rejects.toThrow(
        "NodePlatformAdapter is not available in browser environments. Use BrowserPlatformAdapter instead."
      );
    });

    it("should create NodePlatformAdapter in Node environment", async () => {
      // Simulate Node environment
      delete (global as any).window;
      global.process = {
        versions: { node: "16.0.0" },
      } as any;

      // Mock dynamic import
      vi.doMock("./node", () => ({
        NodePlatformAdapter: vi.fn().mockImplementation(() => ({
          isNode: true,
          isBrowser: false,
          environment: "node",
        })),
      }));

      const adapter = await createNodePlatformAdapter();
      
      expect(adapter).toBeDefined();
      expect(adapter.isNode).toBe(true);
      expect(adapter.isBrowser).toBe(false);
      expect(adapter.environment).toBe("node");
    });
  });

  describe("createBrowserPlatformAdapter", () => {
    it("should create and return a BrowserPlatformAdapter instance", () => {
      const adapter = createBrowserPlatformAdapter();
      
      expect(adapter).toBeDefined();
      expect(adapter.isNode).toBe(false);
      expect(adapter.isBrowser).toBe(true);
      expect(adapter.environment).toBe("browser");
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
      // Simulate browser environment
      global.window = {} as any;

      const adapter = await createPlatformAdapterSafe();
      
      expect(adapter).toBeDefined();
      expect(adapter.isNode).toBe(false);
      expect(adapter.isBrowser).toBe(true);
      expect(adapter.environment).toBe("browser");
      expect(BrowserPlatformAdapter).toHaveBeenCalled();
    });

    it("should return NodePlatformAdapter in Node environment", async () => {
      // Simulate Node environment
      delete (global as any).window;
      global.process = {
        versions: { node: "16.0.0" },
      } as any;

      // Mock dynamic import
      vi.doMock("./node", () => ({
        NodePlatformAdapter: vi.fn().mockImplementation(() => ({
          isNode: true,
          isBrowser: false,
          environment: "node",
        })),
      }));

      const adapter = await createPlatformAdapterSafe();
      
      expect(adapter).toBeDefined();
      expect(adapter.isNode).toBe(true);
      expect(adapter.isBrowser).toBe(false);
      expect(adapter.environment).toBe("node");
    });

    it("should return BrowserPlatformAdapter when process exists but window is defined", async () => {
      // Simulate an edge case where both window and process exist
      global.window = {} as any;
      global.process = {
        versions: { node: "16.0.0" },
      } as any;

      const adapter = await createPlatformAdapterSafe();
      
      expect(adapter).toBeDefined();
      expect(adapter.isNode).toBe(false);
      expect(adapter.isBrowser).toBe(true);
      expect(adapter.environment).toBe("browser");
      expect(BrowserPlatformAdapter).toHaveBeenCalled();
    });

    it("should default to BrowserPlatformAdapter when environment cannot be determined", async () => {
      // Simulate environment where neither window nor process.versions.node exists
      delete (global as any).window;
      global.process = {} as any; // process exists but no versions.node

      const adapter = await createPlatformAdapterSafe();
      
      expect(adapter).toBeDefined();
      expect(adapter.isNode).toBe(false);
      expect(adapter.isBrowser).toBe(true);
      expect(adapter.environment).toBe("browser");
      expect(BrowserPlatformAdapter).toHaveBeenCalled();
    });

    it("should default to BrowserPlatformAdapter when process does not exist", async () => {
      // Simulate environment where neither window nor process exists
      delete (global as any).window;
      delete (global as any).process;

      const adapter = await createPlatformAdapterSafe();
      
      expect(adapter).toBeDefined();
      expect(adapter.isNode).toBe(false);
      expect(adapter.isBrowser).toBe(true);
      expect(adapter.environment).toBe("browser");
      expect(BrowserPlatformAdapter).toHaveBeenCalled();
    });
  });
});