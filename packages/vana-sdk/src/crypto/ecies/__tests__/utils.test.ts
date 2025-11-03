import { describe, it, expect } from "vitest";
import { constantTimeEqual, bufferToBytes, bytesToBuffer } from "../utils";

describe("ECIES utils", () => {
  describe("constantTimeEqual", () => {
    it("should return true for equal arrays", () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 5]);
      expect(constantTimeEqual(a, b)).toBe(true);
    });

    it("should return false for arrays with different lengths", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3, 4]);
      expect(constantTimeEqual(a, b)).toBe(false);
    });

    it("should return false for arrays with different values", () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 6]);
      expect(constantTimeEqual(a, b)).toBe(false);
    });

    it("should return true for empty arrays", () => {
      const a = new Uint8Array([]);
      const b = new Uint8Array([]);
      expect(constantTimeEqual(a, b)).toBe(true);
    });

    it("should work with large arrays", () => {
      const a = new Uint8Array(1000).fill(42);
      const b = new Uint8Array(1000).fill(42);
      expect(constantTimeEqual(a, b)).toBe(true);
    });
  });

  describe("bufferToBytes", () => {
    it("should return Uint8Array when input is already Uint8Array", () => {
      const input = new Uint8Array([1, 2, 3, 4, 5]);
      const result = bufferToBytes(input);
      expect(result).toBe(input); // Should return same instance
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it("should convert Buffer to Uint8Array", () => {
      // In Node.js environment
      if (typeof Buffer !== "undefined") {
        const buffer = Buffer.from([1, 2, 3, 4, 5]);
        const result = bufferToBytes(buffer);
        expect(result).toBeInstanceOf(Uint8Array);
        expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
      }
    });
  });

  describe("bytesToBuffer", () => {
    it("should convert Uint8Array to Buffer in Node.js environment", () => {
      if (typeof Buffer !== "undefined") {
        const bytes = new Uint8Array([1, 2, 3, 4, 5]);
        const result = bytesToBuffer(bytes);
        expect(Buffer.isBuffer(result)).toBe(true);
        expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
      } else {
        // In browser, should throw
        const bytes = new Uint8Array([1, 2, 3, 4, 5]);
        expect(() => bytesToBuffer(bytes)).toThrow(
          "Buffer is not available in browser environment",
        );
      }
    });

    it("should throw error in browser environment", () => {
      // Mock browser environment
      const originalBuffer = global.Buffer;
      // @ts-expect-error - Testing browser environment
      global.Buffer = undefined;

      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      expect(() => bytesToBuffer(bytes)).toThrow(
        "Buffer is not available in browser environment",
      );

      // Restore
      global.Buffer = originalBuffer;
    });
  });
});
