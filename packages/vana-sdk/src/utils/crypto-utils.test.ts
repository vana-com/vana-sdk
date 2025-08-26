import { describe, it, expect } from "vitest";
import {
  processWalletPublicKey,
  processWalletPrivateKey,
  parseEncryptedDataBuffer,
  generateSeed,
  bytesEqual,
  copyBytes,
  isValidPublicKeyFormat,
  isValidPrivateKeyFormat,
  assertUncompressedPublicKey,
} from "./crypto-utils";

describe("Crypto Utils", () => {
  describe("processWalletPublicKey", () => {
    it("processes hex string public key", () => {
      const result = processWalletPublicKey("0404");
      expect(result).toEqual(new Uint8Array([4, 4]));
    });

    it("returns 64-byte key as-is (no longer adds prefix)", () => {
      const rawCoords = new Uint8Array(64);
      rawCoords.fill(42);
      const result = processWalletPublicKey(rawCoords);
      expect(result.length).toBe(64);
      expect(result).toEqual(rawCoords);
      // Note: Normalization to uncompressed format should be done by the crypto provider
    });

    it("processes hex string without 0x prefix", () => {
      const hexKey = "0404";
      const result = processWalletPublicKey(hexKey);
      expect(result).toEqual(new Uint8Array([4, 4]));
    });

    it("returns key as-is when already properly formatted", () => {
      const uncompressedKey = new Uint8Array(65);
      uncompressedKey[0] = 4;
      const result = processWalletPublicKey(uncompressedKey);
      expect(result).toEqual(uncompressedKey);
    });
  });

  describe("processWalletPrivateKey", () => {
    it("processes hex string private key", () => {
      const hexKey = "0x1234567890abcdef";
      const result = processWalletPrivateKey(hexKey);
      expect(result).toEqual(
        new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef]),
      );
    });

    it("processes Uint8Array private key", () => {
      const privateKey = new Uint8Array(32);
      privateKey.fill(7);
      const result = processWalletPrivateKey(privateKey);
      expect(result).toEqual(privateKey);
    });

    it("handles hex without 0x prefix", () => {
      const hexKey = "abcdef";
      const result = processWalletPrivateKey(hexKey);
      expect(result).toEqual(new Uint8Array([0xab, 0xcd, 0xef]));
    });
  });

  describe("parseEncryptedDataBuffer", () => {
    it("parses eccrypto format correctly", () => {
      // Create mock encrypted buffer: iv(16) + ephemPublicKey(65) + ciphertext(10) + mac(32) = 123 bytes
      const buffer = new Uint8Array(123);

      // Fill with recognizable patterns
      buffer.fill(1, 0, 16); // iv
      buffer.fill(2, 16, 81); // ephemPublicKey
      buffer.fill(3, 81, 91); // ciphertext
      buffer.fill(4, 91, 123); // mac

      const parsed = parseEncryptedDataBuffer(buffer);

      expect(parsed.iv.length).toBe(16);
      expect(parsed.ephemPublicKey.length).toBe(65);
      expect(parsed.ciphertext.length).toBe(10);
      expect(parsed.mac.length).toBe(32);

      expect(parsed.iv[0]).toBe(1);
      expect(parsed.ephemPublicKey[0]).toBe(2);
      expect(parsed.ciphertext[0]).toBe(3);
      expect(parsed.mac[0]).toBe(4);
    });

    it("handles minimum size buffer (113 bytes)", () => {
      const buffer = new Uint8Array(113); // iv(16) + ephemPublicKey(65) + ciphertext(0) + mac(32)
      buffer.fill(5);

      const parsed = parseEncryptedDataBuffer(buffer);

      expect(parsed.iv.length).toBe(16);
      expect(parsed.ephemPublicKey.length).toBe(65);
      expect(parsed.ciphertext.length).toBe(0);
      expect(parsed.mac.length).toBe(32);
    });
  });

  describe("generateSeed", () => {
    it("generates deterministic seed from message", () => {
      const seed1 = generateSeed("test message");
      const seed2 = generateSeed("test message");
      expect(seed1).toEqual(seed2);
    });

    it("generates different seeds for different messages", () => {
      const seed1 = generateSeed("message1");
      const seed2 = generateSeed("message2");
      expect(seed1).not.toEqual(seed2);
    });

    it("handles empty string", () => {
      const seed = generateSeed("");
      expect(seed).toEqual(new Uint8Array([]));
    });
  });

  describe("bytesEqual", () => {
    it("returns true for equal arrays", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      expect(bytesEqual(a, b)).toBe(true);
    });

    it("returns false for different arrays", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 4]);
      expect(bytesEqual(a, b)).toBe(false);
    });

    it("returns false for different lengths", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2]);
      expect(bytesEqual(a, b)).toBe(false);
    });

    it("returns true for empty arrays", () => {
      const a = new Uint8Array([]);
      const b = new Uint8Array([]);
      expect(bytesEqual(a, b)).toBe(true);
    });
  });

  describe("copyBytes", () => {
    it("creates a copy of the array", () => {
      const original = new Uint8Array([1, 2, 3]);
      const copy = copyBytes(original);

      expect(copy).toEqual(original);
      expect(copy).not.toBe(original); // Different reference

      // Modify original, copy should remain unchanged
      original[0] = 99;
      expect(copy[0]).toBe(1);
    });

    it("handles empty arrays", () => {
      const original = new Uint8Array([]);
      const copy = copyBytes(original);
      expect(copy).toEqual(original);
      expect(copy).not.toBe(original);
    });
  });

  describe("isValidPublicKeyFormat", () => {
    it("validates compressed public key (33 bytes)", () => {
      const compressed = new Uint8Array(33);
      compressed[0] = 0x02;
      expect(isValidPublicKeyFormat(compressed)).toBe(true);

      compressed[0] = 0x03;
      expect(isValidPublicKeyFormat(compressed)).toBe(true);

      compressed[0] = 0x04;
      expect(isValidPublicKeyFormat(compressed)).toBe(false);
    });

    it("validates uncompressed public key (65 bytes)", () => {
      const uncompressed = new Uint8Array(65);
      uncompressed[0] = 0x04;
      expect(isValidPublicKeyFormat(uncompressed)).toBe(true);

      uncompressed[0] = 0x02;
      expect(isValidPublicKeyFormat(uncompressed)).toBe(false);
    });

    it("validates raw coordinates (64 bytes)", () => {
      const raw = new Uint8Array(64);
      expect(isValidPublicKeyFormat(raw)).toBe(true);
    });

    it("rejects invalid lengths", () => {
      expect(isValidPublicKeyFormat(new Uint8Array(32))).toBe(false);
      expect(isValidPublicKeyFormat(new Uint8Array(34))).toBe(false);
      expect(isValidPublicKeyFormat(new Uint8Array(66))).toBe(false);
    });
  });

  describe("isValidPrivateKeyFormat", () => {
    it("validates 32-byte private key", () => {
      expect(isValidPrivateKeyFormat(new Uint8Array(32))).toBe(true);
    });

    it("rejects invalid lengths", () => {
      expect(isValidPrivateKeyFormat(new Uint8Array(31))).toBe(false);
      expect(isValidPrivateKeyFormat(new Uint8Array(33))).toBe(false);
      expect(isValidPrivateKeyFormat(new Uint8Array(64))).toBe(false);
    });
  });

  describe("assertUncompressedPublicKey", () => {
    it("accepts valid uncompressed key", () => {
      const uncompressed = new Uint8Array(65);
      uncompressed[0] = 0x04;
      expect(() => assertUncompressedPublicKey(uncompressed)).not.toThrow();
    });

    it("throws for compressed keys", () => {
      const compressed = new Uint8Array(33);
      compressed[0] = 0x02;
      expect(() => assertUncompressedPublicKey(compressed)).toThrow(
        "Public key must be uncompressed (65 bytes), got 33 bytes",
      );
    });

    it("throws for raw coordinates", () => {
      const raw = new Uint8Array(64);
      expect(() => assertUncompressedPublicKey(raw)).toThrow(
        "Public key must be uncompressed (65 bytes), got 64 bytes",
      );
    });

    it("throws for invalid prefix", () => {
      const invalidPrefix = new Uint8Array(65);
      invalidPrefix[0] = 0x05;
      expect(() => assertUncompressedPublicKey(invalidPrefix)).toThrow(
        "Uncompressed public key must start with 0x04 prefix, got 0x05",
      );
    });

    it("throws for invalid lengths", () => {
      expect(() => assertUncompressedPublicKey(new Uint8Array(32))).toThrow(
        "Public key must be uncompressed (65 bytes), got 32 bytes",
      );
      expect(() => assertUncompressedPublicKey(new Uint8Array(100))).toThrow(
        "Public key must be uncompressed (65 bytes), got 100 bytes",
      );
    });
  });
});
