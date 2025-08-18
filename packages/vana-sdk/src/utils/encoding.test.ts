/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  toBase64,
  fromBase64,
  toHex,
  fromHex,
  stringToBytes,
  bytesToString,
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

  describe("Hex encoding/decoding", () => {
    const testCases = [
      { bytes: new Uint8Array([72, 101, 108, 108, 111]), hex: "48656c6c6f" },
      { bytes: new Uint8Array([0, 1, 2, 3, 4, 5]), hex: "000102030405" },
      { bytes: new Uint8Array([255, 254, 253, 252]), hex: "fffefdfc" },
      { bytes: new Uint8Array([]), hex: "" },
    ];

    testCases.forEach(({ bytes, hex }) => {
      it(`encodes ${bytes.length} bytes to hex`, () => {
        expect(toHex(bytes)).toBe(hex);
      });

      it(`decodes hex '${hex}' to bytes`, () => {
        expect(fromHex(hex)).toEqual(bytes);
      });

      it(`decodes hex with 0x prefix '0x${hex}'`, () => {
        expect(fromHex(`0x${hex}`)).toEqual(bytes);
      });
    });

    it("handles round-trip encoding/decoding", () => {
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        original[i] = i;
      }
      const encoded = toHex(original);
      const decoded = fromHex(encoded);
      expect(decoded).toEqual(original);
    });

    it("throws on invalid hex string (odd length)", () => {
      expect(() => fromHex("12345")).toThrow("Invalid hex string: odd length");
    });

    it("throws on invalid hex string (non-hex characters)", () => {
      expect(() => fromHex("12gx")).toThrow(
        "Invalid hex string: contains non-hex characters",
      );
    });
  });

  describe("String encoding/decoding", () => {
    const testCases = [
      { str: "Hello, World!", desc: "ASCII" },
      { str: "Здравствуй, мир!", desc: "Cyrillic" },
      { str: "你好，世界！", desc: "Chinese" },
      { str: "🚀🌟✨", desc: "Emojis" },
      { str: "", desc: "Empty string" },
      { str: "Line1\nLine2\rLine3\r\n", desc: "Newlines" },
    ];

    testCases.forEach(({ str, desc }) => {
      it(`encodes/decodes ${desc}`, () => {
        const bytes = stringToBytes(str);
        const decoded = bytesToString(bytes);
        expect(decoded).toBe(str);
      });
    });

    it("handles long strings", () => {
      const longStr = "x".repeat(10000);
      const bytes = stringToBytes(longStr);
      const decoded = bytesToString(bytes);
      expect(decoded).toBe(longStr);
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
    let originalTextEncoder: any;
    let originalTextDecoder: any;

    beforeEach(() => {
      originalBuffer = (global as any).Buffer;
      originalBtoa = (global as any).btoa;
      originalAtob = (global as any).atob;
      originalTextEncoder = (global as any).TextEncoder;
      originalTextDecoder = (global as any).TextDecoder;
    });

    afterEach(() => {
      (global as any).Buffer = originalBuffer;
      (global as any).btoa = originalBtoa;
      (global as any).atob = originalAtob;
      (global as any).TextEncoder = originalTextEncoder;
      (global as any).TextDecoder = originalTextDecoder;
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

    it("hex encoding produces same result in Node and browser paths", () => {
      const testData = new Uint8Array([255, 128, 0, 42]);

      // Get Node.js result (if available)
      const nodeResult = typeof Buffer !== "undefined" ? toHex(testData) : null;

      // Force browser path
      const originalBuffer = (global as any).Buffer;
      (global as any).Buffer = undefined;

      const browserResult = toHex(testData);

      // Restore
      (global as any).Buffer = originalBuffer;

      if (nodeResult !== null) {
        expect(browserResult).toBe(nodeResult);
      }
    });
  });

  describe("Error handling", () => {
    it("throws when no base64 encoding method available", () => {
      const originalBuffer = (global as any).Buffer;
      const originalBtoa = (global as any).btoa;

      (global as any).Buffer = undefined;
      (global as any).btoa = undefined;

      expect(() => toBase64(new Uint8Array([1, 2, 3]))).toThrow(
        "No base64 encoding method available",
      );

      // Restore
      (global as any).Buffer = originalBuffer;
      (global as any).btoa = originalBtoa;
    });

    it("throws when no base64 decoding method available", () => {
      const originalBuffer = (global as any).Buffer;
      const originalAtob = (global as any).atob;

      (global as any).Buffer = undefined;
      (global as any).atob = undefined;

      expect(() => fromBase64("AQID")).toThrow(
        "No base64 decoding method available",
      );

      // Restore
      (global as any).Buffer = originalBuffer;
      (global as any).atob = originalAtob;
    });
  });
});
