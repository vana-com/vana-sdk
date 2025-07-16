import { describe, it, expect, vi } from "vitest";
import { isBrowser, isNode } from "../utils/runtime";

describe("Runtime utilities", () => {
  it("should detect browser environment correctly", () => {
    const result = isBrowser();
    expect(typeof result).toBe("boolean");
  });

  it("should detect node environment correctly", () => {
    const result = isNode();
    expect(typeof result).toBe("boolean");
  });

  it("should have isBrowser and isNode return opposite values", () => {
    const browserResult = isBrowser();
    const nodeResult = isNode();
    expect(browserResult).toBe(!nodeResult);
  });

  it("should return true for isBrowser when window and document exist", () => {
    // Mock window and document to simulate browser environment
    const mockWindow = {
      document: {},
    };
    vi.stubGlobal("window", mockWindow);

    const result = isBrowser();
    expect(result).toBe(true);
    expect(isNode()).toBe(false);

    // Clean up
    vi.unstubAllGlobals();
  });

  it("should return false for isBrowser when window exists but document does not", () => {
    // Mock window without document to test the second condition
    const mockWindow = {};
    vi.stubGlobal("window", mockWindow);

    const result = isBrowser();
    expect(result).toBe(false);
    expect(isNode()).toBe(true);

    // Clean up
    vi.unstubAllGlobals();
  });

  it("should return false for isBrowser when window does not exist", () => {
    // Ensure window is undefined (default in Node.js)
    vi.stubGlobal("window", undefined);

    const result = isBrowser();
    expect(result).toBe(false);
    expect(isNode()).toBe(true);

    // Clean up
    vi.unstubAllGlobals();
  });
});