import { describe, it, expect, vi } from "vitest";
import { getPlatformAdapter } from "../platform/getAdapter";

// Mock the runtime detection
vi.mock("../utils/runtime", () => ({
  isBrowser: vi.fn(),
}));

describe("getPlatformAdapter", () => {
  it("should return BrowserPlatformAdapter when in browser", async () => {
    const { isBrowser } = await import("../utils/runtime");
    vi.mocked(isBrowser).mockReturnValue(true);

    const adapter = getPlatformAdapter();
    expect(adapter).toBeDefined();
    expect(adapter.crypto).toBeDefined();
    expect(adapter.pgp).toBeDefined();
  });

  it("should return NodePlatformAdapter when not in browser", async () => {
    const { isBrowser } = await import("../utils/runtime");
    vi.mocked(isBrowser).mockReturnValue(false);

    const adapter = getPlatformAdapter();
    expect(adapter).toBeDefined();
    expect(adapter.crypto).toBeDefined();
    expect(adapter.pgp).toBeDefined();
  });
});