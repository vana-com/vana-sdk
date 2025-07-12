import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Platform Index", () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as Record<string, unknown>).window;
  });

  afterEach(() => {
    // Restore original window
    if (originalWindow !== undefined) {
      (globalThis as Record<string, unknown>).window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
    vi.resetModules();
  });

  it("should return browser adapter when window is available", async () => {
    // Mock browser environment
    (globalThis as Record<string, unknown>).window = {};

    // Re-import module to get fresh instance
    const { getPlatformAdapter } = await import("../platform/index");

    const adapter = getPlatformAdapter();

    expect(adapter.platform).toBe("browser");
  });

  it("should return node adapter when window is not available", async () => {
    // Mock Node.js environment by removing window
    delete (globalThis as Record<string, unknown>).window;

    // Re-import module to get fresh instance
    const { getPlatformAdapter } = await import("../platform/index");

    const adapter = getPlatformAdapter();

    expect(adapter.platform).toBe("node");
  });

  it("should return node adapter when globalThis is undefined", async () => {
    // Create a mock environment without globalThis.window
    const mockGlobalThis = {};
    Object.defineProperty(mockGlobalThis, "window", {
      value: undefined,
      configurable: true,
    });

    // Replace globalThis temporarily
    Object.assign(globalThis, mockGlobalThis);

    // Re-import module to get fresh instance
    const { getPlatformAdapter } = await import("../platform/index");

    const adapter = getPlatformAdapter();

    expect(adapter.platform).toBe("node");
  });

  it("should handle edge case where window property exists but is undefined", async () => {
    // Mock an environment where window property exists but is undefined
    Object.defineProperty(globalThis, "window", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    // Re-import module to get fresh instance
    const { getPlatformAdapter } = await import("../platform/index");

    const adapter = getPlatformAdapter();

    expect(adapter.platform).toBe("node");
  });

  it("should handle edge case where globalThis has window as null", async () => {
    // Mock an environment where window is null
    (globalThis as Record<string, unknown>).window = null;

    // Re-import module to get fresh instance
    const { getPlatformAdapter } = await import("../platform/index");

    const adapter = getPlatformAdapter();

    // null is not undefined, so this will still be detected as browser environment
    // This is the current behavior of the platform detection logic
    expect(adapter.platform).toBe("browser");
  });

  it("should return browser adapter when window is a valid object", async () => {
    // Mock browser environment with a realistic window object
    (globalThis as Record<string, unknown>).window = {
      document: {},
      location: { href: "https://example.com" },
      navigator: { userAgent: "test" },
    };

    // Re-import module to get fresh instance
    const { getPlatformAdapter } = await import("../platform/index");

    const adapter = getPlatformAdapter();

    expect(adapter.platform).toBe("browser");
  });

  it("should export adapter types", async () => {
    const module = await import("../platform/index");

    // Check that the types are exported (they won't have runtime values but the imports should succeed)
    expect(typeof module.nodePlatformAdapter).toBe("object");
    expect(typeof module.browserPlatformAdapter).toBe("object");
    expect(typeof module.getPlatformAdapter).toBe("function");
  });

  it("should export individual platform adapters", async () => {
    const { nodePlatformAdapter, browserPlatformAdapter } = await import(
      "../platform/index"
    );

    expect(nodePlatformAdapter.platform).toBe("node");
    expect(browserPlatformAdapter.platform).toBe("browser");

    // Check they have the required interfaces
    expect(nodePlatformAdapter.crypto).toBeDefined();
    expect(nodePlatformAdapter.pgp).toBeDefined();
    expect(nodePlatformAdapter.http).toBeDefined();

    expect(browserPlatformAdapter.crypto).toBeDefined();
    expect(browserPlatformAdapter.pgp).toBeDefined();
    expect(browserPlatformAdapter.http).toBeDefined();
  });
});
