import { describe, it, expect } from "vitest";
import {
  ECIESError,
  isECIESEncrypted,
  serializeECIES,
  deserializeECIES,
  type ECIESEncrypted,
} from "../interface";

describe("ECIES interface utilities", () => {
  describe("ECIESError", () => {
    it("should create error with code and message", () => {
      const error = new ECIESError("Test error", "INVALID_KEY");
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("ECIESError");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe("INVALID_KEY");
    });

    it("should preserve cause when provided", () => {
      const cause = new Error("Original error");
      const error = new ECIESError("Wrapped error", "ENCRYPTION_FAILED", cause);
      expect(error.cause).toBe(cause);
    });

    it("should support all error codes", () => {
      const codes = [
        "INVALID_KEY",
        "ENCRYPTION_FAILED",
        "DECRYPTION_FAILED",
        "MAC_MISMATCH",
        "ECDH_FAILED",
      ] as const;

      codes.forEach((code) => {
        const error = new ECIESError("Test", code);
        expect(error.code).toBe(code);
      });
    });
  });

  describe("isECIESEncrypted", () => {
    const validEncrypted: ECIESEncrypted = {
      iv: new Uint8Array(16),
      ephemPublicKey: new Uint8Array(65), // Uncompressed
      ciphertext: new Uint8Array(10),
      mac: new Uint8Array(32),
    };

    it("should return true for valid ECIESEncrypted object", () => {
      expect(isECIESEncrypted(validEncrypted)).toBe(true);
    });

    it("should return true for compressed ephemPublicKey (33 bytes)", () => {
      const compressed = {
        ...validEncrypted,
        ephemPublicKey: new Uint8Array(33),
      };
      expect(isECIESEncrypted(compressed)).toBe(true);
    });

    it("should return false for null", () => {
      expect(isECIESEncrypted(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isECIESEncrypted(undefined)).toBe(false);
    });

    it("should return false for non-object types", () => {
      expect(isECIESEncrypted("string")).toBe(false);
      expect(isECIESEncrypted(123)).toBe(false);
      expect(isECIESEncrypted(true)).toBe(false);
    });

    it("should return false for missing properties", () => {
      expect(isECIESEncrypted({})).toBe(false);
      expect(
        isECIESEncrypted({
          iv: new Uint8Array(16),
          ephemPublicKey: new Uint8Array(65),
        }),
      ).toBe(false);
    });

    it("should return false for wrong iv length", () => {
      const invalid = { ...validEncrypted, iv: new Uint8Array(15) };
      expect(isECIESEncrypted(invalid)).toBe(false);
    });

    it("should return false for wrong ephemPublicKey length", () => {
      const invalid = { ...validEncrypted, ephemPublicKey: new Uint8Array(64) };
      expect(isECIESEncrypted(invalid)).toBe(false);
    });

    it("should return false for empty ciphertext", () => {
      const invalid = { ...validEncrypted, ciphertext: new Uint8Array(0) };
      expect(isECIESEncrypted(invalid)).toBe(false);
    });

    it("should return false for wrong mac length", () => {
      const invalid = { ...validEncrypted, mac: new Uint8Array(31) };
      expect(isECIESEncrypted(invalid)).toBe(false);
    });

    it("should handle Buffer objects in Node.js", () => {
      if (typeof Buffer !== "undefined") {
        const withBuffers = {
          iv: Buffer.alloc(16),
          ephemPublicKey: Buffer.alloc(65),
          ciphertext: Buffer.alloc(10),
          mac: Buffer.alloc(32),
        };
        expect(isECIESEncrypted(withBuffers)).toBe(true);
      }
    });
  });

  describe("serializeECIES and deserializeECIES", () => {
    const testData: ECIESEncrypted = {
      iv: new Uint8Array([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
      ]),
      ephemPublicKey: new Uint8Array(65).fill(42),
      ciphertext: new Uint8Array([97, 98, 99, 100]), // "abcd"
      mac: new Uint8Array(32).fill(255),
    };

    // Set proper prefix for uncompressed key
    testData.ephemPublicKey[0] = 0x04;

    it("should serialize ECIESEncrypted to hex string", () => {
      const hex = serializeECIES(testData);
      expect(typeof hex).toBe("string");
      expect(hex).toMatch(/^[0-9a-f]+$/);
      // Should not include '0x' prefix
      expect(hex.startsWith("0x")).toBe(false);
    });

    it("should deserialize hex string back to ECIESEncrypted", () => {
      const hex = serializeECIES(testData);
      const deserialized = deserializeECIES(hex);

      expect(deserialized.iv).toEqual(testData.iv);
      expect(deserialized.ephemPublicKey).toEqual(testData.ephemPublicKey);
      expect(deserialized.ciphertext).toEqual(testData.ciphertext);
      expect(deserialized.mac).toEqual(testData.mac);
    });

    it("should handle hex with 0x prefix", () => {
      const hex = serializeECIES(testData);
      const withPrefix = `0x${hex}`;
      const deserialized = deserializeECIES(withPrefix);

      expect(deserialized.iv).toEqual(testData.iv);
      expect(deserialized.ephemPublicKey).toEqual(testData.ephemPublicKey);
    });

    it("should handle compressed ephemeral keys", () => {
      const compressed = {
        ...testData,
        ephemPublicKey: new Uint8Array(33),
      };
      compressed.ephemPublicKey[0] = 0x02; // Compressed prefix

      const hex = serializeECIES(compressed);
      const deserialized = deserializeECIES(hex);

      expect(deserialized.ephemPublicKey.length).toBe(33);
      expect(deserialized.ephemPublicKey[0]).toBe(0x02);
    });

    it("should round-trip correctly", () => {
      const hex1 = serializeECIES(testData);
      const deserialized1 = deserializeECIES(hex1);
      const hex2 = serializeECIES(deserialized1);
      const deserialized2 = deserializeECIES(hex2);

      expect(hex1).toBe(hex2);
      expect(deserialized1).toEqual(deserialized2);
    });

    it("should throw error for invalid hex (too short)", () => {
      const tooShort = "0102030405";
      expect(() => deserializeECIES(tooShort)).toThrow(ECIESError);
      expect(() => deserializeECIES(tooShort)).toThrow("too short");
    });

    it("should handle different ciphertext lengths", () => {
      const testCases = [1, 10, 100, 1000];

      testCases.forEach((length) => {
        const data = {
          ...testData,
          ciphertext: new Uint8Array(length).fill(123),
        };

        const hex = serializeECIES(data);
        const deserialized = deserializeECIES(hex);

        expect(deserialized.ciphertext.length).toBe(length);
        expect(deserialized.ciphertext).toEqual(data.ciphertext);
      });
    });
  });
});
