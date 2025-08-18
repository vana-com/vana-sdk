import { describe, it, expect } from "vitest";
import { toBase64, fromBase64, generateSeed } from "./crypto-utils-browser";

describe("crypto-utils-browser", () => {
  describe("toBase64", () => {
    it("should encode Uint8Array to base64", () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = toBase64(data);
      expect(result).toBe("SGVsbG8=");
    });

    it("should handle empty array", () => {
      const data = new Uint8Array([]);
      const result = toBase64(data);
      expect(result).toBe("");
    });
  });

  describe("fromBase64", () => {
    it("should decode base64 to Uint8Array", () => {
      const base64 = "SGVsbG8=";
      const result = fromBase64(base64);
      expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it("should handle empty string", () => {
      const result = fromBase64("");
      expect(result).toEqual(new Uint8Array([]));
    });
  });

  describe("generateSeed", () => {
    it("should generate seed from message", () => {
      const message = "test message";
      const result = generateSeed(message);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);

      // Verify it's consistent
      const result2 = generateSeed(message);
      expect(result).toEqual(result2);
    });

    it("should handle empty message", () => {
      const result = generateSeed("");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });
  });
});
