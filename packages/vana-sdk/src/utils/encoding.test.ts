import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  toBase64,
  fromBase64,
  isNodeEnvironment,
  isBrowserEnvironment,
} from "./encoding";

describe("Encoding Utils", () => {
  describe("Base64 encoding/decoding", () => {
    const testCases = [
      { bytes: new Uint8Array([72, 101, 108, 108, 111]), base64: "SGVsbG8=" }, // "Hello"
      { bytes: new Uint8Array([0, 1, 2, 3, 4, 5]), base64: "AAECAwQF" },
      { bytes: new Uint8Array([255, 254, 253, 252]), base64: "//79/A==" },
      { bytes: new Uint8Array([]), base64: "" },
    ];

    testCases.forEach(({ bytes, base64 }) => {
      it(`encodes ${bytes.length} bytes to base64`, () => {
        expect(toBase64(bytes)).toBe(base64);
      });

      it(`decodes base64 '${base64}' to bytes`, () => {
        expect(fromBase64(base64)).toEqual(bytes);
      });
    });

    it("handles round-trip encoding/decoding", () => {
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        original[i] = i;
      }
      const encoded = toBase64(original);
      const decoded = fromBase64(encoded);
      expect(decoded).toEqual(original);
    });
  });

  describe("Platform detection", () => {
    it("detects Node.js environment when Buffer is available", () => {
      // In test environment, Buffer should be available
      if (typeof Buffer !== "undefined") {
        expect(isNodeEnvironment()).toBe(true);
      }
    });

    it("detects browser environment when window is available", () => {
      // Mock browser environment
      const originalWindow = global.window;
      global.window = { document: {} } as Window & typeof globalThis;

      expect(isBrowserEnvironment()).toBe(true);

      // Restore
      if (originalWindow === undefined) {
        Reflect.deleteProperty(global, "window");
      } else {
        global.window = originalWindow;
      }
    });
  });

  describe("Cross-platform consistency", () => {
    // Save original globals
    let originalBuffer: unknown;
    let originalBtoa: unknown;
    let originalAtob: unknown;

    beforeEach(() => {
      originalBuffer = (global as Record<string, unknown>).Buffer;
      originalBtoa = (global as Record<string, unknown>).btoa;
      originalAtob = (global as Record<string, unknown>).atob;
    });

    afterEach(() => {
      (global as Record<string, unknown>).Buffer = originalBuffer;
      (global as Record<string, unknown>).btoa = originalBtoa;
      (global as Record<string, unknown>).atob = originalAtob;
    });

    it("base64 encoding produces same result in Node and browser paths", () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);

      // Get Node.js result (if available)
      const nodeResult =
        typeof Buffer !== "undefined" ? toBase64(testData) : null;

      // Force browser path
      const savedBuffer = (global as Record<string, unknown>)
        .Buffer as typeof Buffer;
      (global as Record<string, unknown>).Buffer = undefined;
      (global as Record<string, unknown>).btoa = (str: string) => {
        // Simple btoa implementation for testing
        // Note: using savedBuffer here since we set Buffer to undefined
        return savedBuffer.from(str, "binary").toString("base64");
      };

      const browserResult = toBase64(testData);

      // Restore
      (global as Record<string, unknown>).Buffer = savedBuffer;

      if (nodeResult !== null) {
        expect(browserResult).toBe(nodeResult);
      }
    });

    it("base64 decoding produces same result in Node and browser paths", () => {
      const testBase64 = "AQIDBAU="; // [1, 2, 3, 4, 5]

      // Get Node.js result (if available)
      const nodeResult =
        typeof Buffer !== "undefined" ? fromBase64(testBase64) : null;

      // Force browser path
      const savedBuffer = (global as Record<string, unknown>)
        .Buffer as typeof Buffer;
      (global as Record<string, unknown>).Buffer = undefined;
      (global as Record<string, unknown>).atob = (str: string) => {
        // Simple atob implementation for testing
        return savedBuffer.from(str, "base64").toString("binary");
      };

      const browserResult = fromBase64(testBase64);

      // Restore
      (global as Record<string, unknown>).Buffer = savedBuffer;

      if (nodeResult !== null) {
        expect(browserResult).toEqual(nodeResult);
      }
    });
  });
});
