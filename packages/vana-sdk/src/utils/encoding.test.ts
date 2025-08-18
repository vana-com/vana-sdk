/* eslint-disable @typescript-eslint/no-explicit-any */
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
      global.window = { document: {} } as any;

      expect(isBrowserEnvironment()).toBe(true);

      // Restore
      if (originalWindow === undefined) {
        delete (global as any).window;
      } else {
        global.window = originalWindow;
      }
    });
  });

  describe("Cross-platform consistency", () => {
    // Save original globals
    let originalBuffer: any;
    let originalBtoa: any;
    let originalAtob: any;

    beforeEach(() => {
      originalBuffer = (global as any).Buffer;
      originalBtoa = (global as any).btoa;
      originalAtob = (global as any).atob;
    });

    afterEach(() => {
      (global as any).Buffer = originalBuffer;
      (global as any).btoa = originalBtoa;
      (global as any).atob = originalAtob;
    });

    it("base64 encoding produces same result in Node and browser paths", () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);

      // Get Node.js result (if available)
      const nodeResult =
        typeof Buffer !== "undefined" ? toBase64(testData) : null;

      // Force browser path
      const savedBuffer = (global as any).Buffer;
      (global as any).Buffer = undefined;
      (global as any).btoa = (str: string) => {
        // Simple btoa implementation for testing
        // Note: using savedBuffer here since we set Buffer to undefined
        return savedBuffer.from(str, "binary").toString("base64");
      };

      const browserResult = toBase64(testData);

      // Restore
      (global as any).Buffer = savedBuffer;

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
      const savedBuffer = (global as any).Buffer;
      (global as any).Buffer = undefined;
      (global as any).atob = (str: string) => {
        // Simple atob implementation for testing
        return savedBuffer.from(str, "base64").toString("binary");
      };

      const browserResult = fromBase64(testBase64);

      // Restore
      (global as any).Buffer = savedBuffer;

      if (nodeResult !== null) {
        expect(browserResult).toEqual(nodeResult);
      }
    });
  });
});
