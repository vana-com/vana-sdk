/**
 * Tests for encoding utilities
 *
 * @remarks
 * Tests platform-aware base64 encoding/decoding and environment detection.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  toBase64,
  fromBase64,
  isNodeEnvironment,
  isBrowserEnvironment,
} from "../encoding";

describe("encoding", () => {
  describe("toBase64", () => {
    it("should encode empty array", () => {
      const data = new Uint8Array([]);
      const result = toBase64(data);

      expect(result).toBe("");
    });

    it("should encode single byte", () => {
      const data = new Uint8Array([65]); // 'A'
      const result = toBase64(data);

      expect(result).toBe("QQ==");
    });

    it("should encode Hello", () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = toBase64(data);

      expect(result).toBe("SGVsbG8=");
    });

    it("should encode binary data", () => {
      const data = new Uint8Array([0x00, 0xff, 0xaa, 0x55]);
      const result = toBase64(data);

      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("should encode all zero bytes", () => {
      const data = new Uint8Array([0, 0, 0, 0]);
      const result = toBase64(data);

      expect(result).toBe("AAAAAA==");
    });

    it("should encode all 0xff bytes", () => {
      const data = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
      const result = toBase64(data);

      expect(result).toBe("/////w==");
    });

    it("should handle large arrays", () => {
      const data = new Uint8Array(1000);
      data.fill(42);

      const result = toBase64(data);

      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should encode sequential bytes", () => {
      const data = new Uint8Array([0, 1, 2, 3, 4, 5]);
      const result = toBase64(data);

      expect(result).toBe("AAECAwQF");
    });

    it("should produce valid base64 string", () => {
      const data = new Uint8Array([1, 2, 3]);
      const result = toBase64(data);

      // Base64 uses [A-Za-z0-9+/=]
      expect(result).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it("should handle UTF-8 encoded text", () => {
      const encoder = new TextEncoder();
      const data = encoder.encode("Hello World!");
      const result = toBase64(data);

      expect(result).toBe("SGVsbG8gV29ybGQh");
    });
  });

  describe("fromBase64", () => {
    it("should decode empty string", () => {
      const result = fromBase64("");

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });

    it("should decode single character", () => {
      const result = fromBase64("QQ==");

      expect(result).toEqual(new Uint8Array([65])); // 'A'
    });

    it("should decode Hello", () => {
      const result = fromBase64("SGVsbG8=");

      expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it("should decode binary data", () => {
      const original = new Uint8Array([0x00, 0xff, 0xaa, 0x55]);
      const encoded = toBase64(original);
      const decoded = fromBase64(encoded);

      expect(decoded).toEqual(original);
    });

    it("should decode all zeros", () => {
      const result = fromBase64("AAAAAA==");

      expect(result).toEqual(new Uint8Array([0, 0, 0, 0]));
    });

    it("should decode all 0xff", () => {
      const result = fromBase64("/////w==");

      expect(result).toEqual(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
    });

    it("should handle padding correctly", () => {
      expect(fromBase64("QQ==").length).toBe(1);
      expect(fromBase64("QUE=").length).toBe(2);
      expect(fromBase64("QUFB").length).toBe(3);
    });

    it("should decode sequential bytes", () => {
      const result = fromBase64("AAECAwQF");

      expect(result).toEqual(new Uint8Array([0, 1, 2, 3, 4, 5]));
    });

    it("should roundtrip encode/decode", () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const encoded = toBase64(original);
      const decoded = fromBase64(encoded);

      expect(decoded).toEqual(original);
    });

    it("should roundtrip with large data", () => {
      const original = new Uint8Array(1000);
      for (let i = 0; i < 1000; i++) {
        original[i] = i % 256;
      }

      const encoded = toBase64(original);
      const decoded = fromBase64(encoded);

      expect(decoded).toEqual(original);
    });

    it("should roundtrip with random data", () => {
      const original = new Uint8Array(100);
      for (let i = 0; i < 100; i++) {
        original[i] = Math.floor(Math.random() * 256);
      }

      const encoded = toBase64(original);
      const decoded = fromBase64(encoded);

      expect(decoded).toEqual(original);
    });

    it("should decode UTF-8 text", () => {
      const decoded = fromBase64("SGVsbG8gV29ybGQh");
      const text = new TextDecoder().decode(decoded);

      expect(text).toBe("Hello World!");
    });
  });

  describe("toBase64 and fromBase64 integration", () => {
    it("should preserve data through encode/decode cycle", () => {
      const testCases = [
        new Uint8Array([]),
        new Uint8Array([0]),
        new Uint8Array([255]),
        new Uint8Array([0, 1, 2, 3]),
        new Uint8Array([255, 254, 253, 252]),
        new Uint8Array([72, 101, 108, 108, 111]), // Hello
      ];

      testCases.forEach((original) => {
        const encoded = toBase64(original);
        const decoded = fromBase64(encoded);

        expect(decoded).toEqual(original);
      });
    });

    it("should handle edge cases in roundtrip", () => {
      // Single byte values across full range
      for (let i = 0; i < 256; i++) {
        const original = new Uint8Array([i]);
        const encoded = toBase64(original);
        const decoded = fromBase64(encoded);

        expect(decoded[0]).toBe(i);
      }
    });

    it("should preserve binary patterns", () => {
      const patterns = [
        new Uint8Array([0b10101010, 0b01010101]),
        new Uint8Array([0b11110000, 0b00001111]),
        new Uint8Array([0b11111111, 0b00000000]),
      ];

      patterns.forEach((pattern) => {
        const encoded = toBase64(pattern);
        const decoded = fromBase64(encoded);

        expect(decoded).toEqual(pattern);
      });
    });
  });

  describe("isNodeEnvironment", () => {
    it("should return boolean", () => {
      const result = isNodeEnvironment();

      expect(typeof result).toBe("boolean");
    });

    it("should detect Node.js environment", () => {
      // In vitest with node environment, this should be true
      const result = isNodeEnvironment();

      // We're running in Node.js via vitest
      expect(result).toBe(true);
    });

    it("should check for Buffer", () => {
      // In Node.js, Buffer should exist
      expect(typeof Buffer).not.toBe("undefined");
      expect(typeof Buffer.from).toBe("function");
    });

    it("should check for process", () => {
      // In Node.js, process should exist
      expect(typeof process).not.toBe("undefined");
      expect(process.versions?.node).toBeDefined();
    });
  });

  describe("isBrowserEnvironment", () => {
    it("should return boolean", () => {
      const result = isBrowserEnvironment();

      expect(typeof result).toBe("boolean");
    });

    it("should not detect browser in Node.js tests", () => {
      // In vitest node environment, this should be false
      const result = isBrowserEnvironment();

      expect(result).toBe(false);
    });

    it("should check for window object", () => {
      // In Node.js, window should not exist
      expect(typeof window).toBe("undefined");
    });
  });

  describe("Environment detection consistency", () => {
    it("should have consistent environment detection", () => {
      const isNode = isNodeEnvironment();
      const isBrowser = isBrowserEnvironment();

      // In most environments, should be one or the other (not both)
      if (isNode) {
        expect(isBrowser).toBe(false);
      }
      // Note: In some test environments, both might be false
    });

    it("should use Buffer in Node.js", () => {
      if (isNodeEnvironment()) {
        const data = new Uint8Array([72, 101, 108, 108, 111]);
        const result = toBase64(data);

        expect(result).toBe("SGVsbG8=");
      }
    });
  });

  describe("Error handling", () => {
    let originalBuffer: typeof Buffer | undefined;
    let originalBtoa: typeof btoa | undefined;
    let originalAtob: typeof atob | undefined;

    beforeEach(() => {
      // Save originals
      originalBuffer = globalThis.Buffer;
      originalBtoa = (globalThis as any).btoa;
      originalAtob = (globalThis as any).atob;
    });

    afterEach(() => {
      // Restore originals
      if (originalBuffer !== undefined) {
        globalThis.Buffer = originalBuffer;
      }
      if (originalBtoa !== undefined) {
        (globalThis as any).btoa = originalBtoa;
      }
      if (originalAtob !== undefined) {
        (globalThis as any).atob = originalAtob;
      }
    });

    it("should throw when no encoding method available", () => {
      // Remove both Buffer and btoa
      (globalThis as any).Buffer = undefined;
      (globalThis as any).btoa = undefined;

      const data = new Uint8Array([1, 2, 3]);

      expect(() => {
        toBase64(data);
      }).toThrow(/No base64 encoding method available/);
    });

    it("should throw when no decoding method available", () => {
      // Remove both Buffer and atob
      (globalThis as any).Buffer = undefined;
      (globalThis as any).atob = undefined;

      expect(() => {
        fromBase64("SGVsbG8=");
      }).toThrow(/No base64 decoding method available/);
    });

    it("should use btoa fallback when Buffer unavailable", () => {
      // Remove Buffer but keep btoa (simulate browser)
      (globalThis as any).Buffer = undefined;
      (globalThis as any).btoa = (str: string) => {
        // Simple mock btoa
        return originalBuffer
          ? originalBuffer.from(str, "binary").toString("base64")
          : "";
      };

      const data = new Uint8Array([72, 101, 108, 108, 111]);
      const result = toBase64(data);

      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("should use atob fallback when Buffer unavailable", () => {
      // Remove Buffer but keep atob (simulate browser)
      (globalThis as any).Buffer = undefined;
      (globalThis as any).atob = (str: string) => {
        // Simple mock atob
        return originalBuffer
          ? originalBuffer.from(str, "base64").toString("binary")
          : "";
      };

      const result = fromBase64("SGVsbG8=");

      expect(result).toBeInstanceOf(Uint8Array);
    });
  });
});
