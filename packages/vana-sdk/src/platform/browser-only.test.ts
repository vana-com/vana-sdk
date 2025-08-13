import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createBrowserPlatformAdapter,
  createPlatformAdapterSafe,
} from "./browser-only";
import { BrowserPlatformAdapter } from "./browser";

vi.mock("./browser", () => ({
  BrowserPlatformAdapter: vi.fn().mockImplementation(() => ({
    isNode: false,
    isBrowser: true,
    environment: "browser",
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
    it("should create and return a BrowserPlatformAdapter instance", () => {
      const adapter = createPlatformAdapterSafe();
      
      expect(adapter).toBeDefined();
      expect(adapter.isNode).toBe(false);
      expect(adapter.isBrowser).toBe(true);
      expect(adapter.environment).toBe("browser");
      expect(BrowserPlatformAdapter).toHaveBeenCalled();
    });

    it("should always return a browser adapter (safe for browser environments)", () => {
      const adapter = createPlatformAdapterSafe();
      
      expect(adapter.environment).toBe("browser");
      expect(adapter.isBrowser).toBe(true);
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
      
      expect(adapter1.isNode).toBe(adapter2.isNode);
      expect(adapter1.isBrowser).toBe(adapter2.isBrowser);
      expect(adapter1.environment).toBe(adapter2.environment);
    });
  });
});