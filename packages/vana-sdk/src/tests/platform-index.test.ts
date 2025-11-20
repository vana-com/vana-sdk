import { describe, it, expect } from "vitest";
import { NodePlatformAdapter, BrowserPlatformAdapter } from "../platform/index";

describe("Platform Index", () => {
  it("should export NodePlatformAdapter", () => {
    expect(NodePlatformAdapter).toBeDefined();
    expect(typeof NodePlatformAdapter).toBe("function");
  });

  it("should export BrowserPlatformAdapter", () => {
    expect(BrowserPlatformAdapter).toBeDefined();
    expect(typeof BrowserPlatformAdapter).toBe("function");
  });

  it("should create NodePlatformAdapter instance", () => {
    const adapter = new NodePlatformAdapter();
    expect(adapter.platform).toBe("node");
    expect(adapter.crypto).toBeDefined();
    expect(adapter.pgp).toBeDefined();
    expect(adapter.http).toBeDefined();
  });

  it("should create BrowserPlatformAdapter instance", () => {
    const adapter = new BrowserPlatformAdapter();
    expect(adapter.platform).toBe("browser");
    expect(adapter.crypto).toBeDefined();
    expect(adapter.pgp).toBeDefined();
    expect(adapter.http).toBeDefined();
  });
});
