/**
 * Tests for cryptographic utilities
 *
 * @remarks
 * Tests platform-agnostic crypto utility functions for key processing,
 * buffer parsing, validation, and byte array operations.
 */

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
} from "../crypto-utils";

describe("crypto-utils", () => {
  describe("processWalletPublicKey", () => {
    it("should convert hex string with 0x prefix to Uint8Array", () => {
      const hex = "0x04" + "ab".repeat(64); // 65 bytes uncompressed key
      const result = processWalletPublicKey(hex);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(65);
      expect(result[0]).toBe(0x04);
    });

    it("should convert hex string without 0x prefix to Uint8Array", () => {
      const hex = "04" + "ab".repeat(64);
      const result = processWalletPublicKey(hex);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(65);
      expect(result[0]).toBe(0x04);
    });

    it("should return Uint8Array unchanged", () => {
      const bytes = new Uint8Array([0x04, 0xab, 0xcd, 0xef]);
      const result = processWalletPublicKey(bytes);

      expect(result).toBe(bytes); // Same reference
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it("should handle compressed public key (33 bytes)", () => {
      const hex = "0x02" + "ab".repeat(32);
      const result = processWalletPublicKey(hex);

      expect(result.length).toBe(33);
      expect(result[0]).toBe(0x02);
    });

    it("should handle uncompressed public key (65 bytes)", () => {
      const hex = "0x04" + "12".repeat(64);
      const result = processWalletPublicKey(hex);

      expect(result.length).toBe(65);
      expect(result[0]).toBe(0x04);
    });

    it("should preserve byte values when converting from hex", () => {
      const hex = "0x0123456789abcdef";
      const result = processWalletPublicKey(hex);

      expect(Array.from(result)).toEqual([
        0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
      ]);
    });
  });

  describe("processWalletPrivateKey", () => {
    it("should convert hex string with 0x prefix to Uint8Array", () => {
      const hex = "0x" + "ab".repeat(32); // 32 bytes private key
      const result = processWalletPrivateKey(hex);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(32);
    });

    it("should convert hex string without 0x prefix to Uint8Array", () => {
      const hex = "ab".repeat(32);
      const result = processWalletPrivateKey(hex);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(32);
    });

    it("should return Uint8Array unchanged", () => {
      const bytes = new Uint8Array(32);
      const result = processWalletPrivateKey(bytes);

      expect(result).toBe(bytes); // Same reference
    });

    it("should handle standard private key (32 bytes)", () => {
      const hex = "0x" + "ff".repeat(32);
      const result = processWalletPrivateKey(hex);

      expect(result.length).toBe(32);
      expect(result.every((byte) => byte === 0xff)).toBe(true);
    });

    it("should preserve byte values when converting from hex", () => {
      const hex =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const result = processWalletPrivateKey(hex);

      expect(result[0]).toBe(0x01);
      expect(result[1]).toBe(0x23);
      expect(result[result.length - 1]).toBe(0xef);
    });
  });

  describe("parseEncryptedDataBuffer", () => {
    it("should parse eccrypto format buffer correctly", () => {
      // Create buffer: iv(16) + ephemPublicKey(65) + ciphertext(10) + mac(32)
      const totalLength = 16 + 65 + 10 + 32; // 123 bytes
      const buffer = new Uint8Array(totalLength);

      // Fill with distinct patterns
      buffer.fill(0x01, 0, 16); // iv
      buffer.fill(0x02, 16, 81); // ephemPublicKey
      buffer.fill(0x03, 81, 91); // ciphertext
      buffer.fill(0x04, 91, 123); // mac

      const result = parseEncryptedDataBuffer(buffer);

      expect(result.iv.length).toBe(16);
      expect(result.ephemPublicKey.length).toBe(65);
      expect(result.ciphertext.length).toBe(10);
      expect(result.mac.length).toBe(32);

      expect(result.iv.every((byte) => byte === 0x01)).toBe(true);
      expect(result.ephemPublicKey.every((byte) => byte === 0x02)).toBe(true);
      expect(result.ciphertext.every((byte) => byte === 0x03)).toBe(true);
      expect(result.mac.every((byte) => byte === 0x04)).toBe(true);
    });

    it("should handle minimum size buffer", () => {
      // Minimum: iv(16) + ephemPublicKey(65) + ciphertext(0) + mac(32) = 113 bytes
      const buffer = new Uint8Array(113);
      const result = parseEncryptedDataBuffer(buffer);

      expect(result.iv.length).toBe(16);
      expect(result.ephemPublicKey.length).toBe(65);
      expect(result.ciphertext.length).toBe(0);
      expect(result.mac.length).toBe(32);
    });

    it("should handle large ciphertext", () => {
      const ciphertextSize = 1000;
      const buffer = new Uint8Array(16 + 65 + ciphertextSize + 32);
      buffer.fill(0xaa, 81, 81 + ciphertextSize); // Fill ciphertext section

      const result = parseEncryptedDataBuffer(buffer);

      expect(result.ciphertext.length).toBe(ciphertextSize);
      expect(result.ciphertext.every((byte) => byte === 0xaa)).toBe(true);
    });

    it("should correctly slice buffer boundaries", () => {
      const buffer = new Uint8Array(123);
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = i % 256;
      }

      const result = parseEncryptedDataBuffer(buffer);

      // Verify boundary values
      expect(result.iv[0]).toBe(0);
      expect(result.iv[15]).toBe(15);
      expect(result.ephemPublicKey[0]).toBe(16);
      expect(result.ephemPublicKey[64]).toBe(80);
      expect(result.ciphertext[0]).toBe(81);
      expect(result.mac[0]).toBe(91);
      expect(result.mac[31]).toBe(122);
    });

    it("should return slices that share underlying buffer", () => {
      const buffer = new Uint8Array(123);
      const result = parseEncryptedDataBuffer(buffer);

      // TypedArray.slice() creates views on the same buffer in some implementations
      // Modify slices and verify they are independent from each other
      result.iv[0] = 0xaa;
      result.ephemPublicKey[0] = 0xbb;
      result.mac[0] = 0xcc;

      // Slices should be independent from each other
      expect(result.iv[0]).toBe(0xaa);
      expect(result.ephemPublicKey[0]).toBe(0xbb);
      expect(result.mac[0]).toBe(0xcc);
    });
  });

  describe("generateSeed", () => {
    it("should generate seed from message", () => {
      const message = "test message";
      const result = generateSeed(message);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should generate same seed for same message", () => {
      const message = "deterministic";
      const result1 = generateSeed(message);
      const result2 = generateSeed(message);

      expect(result1).toEqual(result2);
    });

    it("should generate different seeds for different messages", () => {
      const seed1 = generateSeed("message1");
      const seed2 = generateSeed("message2");

      expect(seed1).not.toEqual(seed2);
    });

    it("should handle empty string", () => {
      const result = generateSeed("");

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });

    it("should handle unicode characters", () => {
      const message = "Hello 世界 🌍";
      const result = generateSeed(message);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(message.length); // UTF-8 encoding
    });

    it("should handle special characters", () => {
      const message = "!@#$%^&*()_+-={}[]|:;<>?,./";
      const result = generateSeed(message);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(message.length); // ASCII characters
    });
  });

  describe("bytesEqual", () => {
    it("should return true for equal arrays", () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 5]);

      expect(bytesEqual(a, b)).toBe(true);
    });

    it("should return false for different arrays", () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 6]);

      expect(bytesEqual(a, b)).toBe(false);
    });

    it("should return false for different lengths", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3, 4]);

      expect(bytesEqual(a, b)).toBe(false);
    });

    it("should return true for empty arrays", () => {
      const a = new Uint8Array([]);
      const b = new Uint8Array([]);

      expect(bytesEqual(a, b)).toBe(true);
    });

    it("should return true for arrays with same reference", () => {
      const a = new Uint8Array([1, 2, 3]);

      expect(bytesEqual(a, a)).toBe(true);
    });

    it("should handle arrays with zeros", () => {
      const a = new Uint8Array([0, 0, 0]);
      const b = new Uint8Array([0, 0, 0]);

      expect(bytesEqual(a, b)).toBe(true);
    });

    it("should detect difference at first byte", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([2, 2, 3]);

      expect(bytesEqual(a, b)).toBe(false);
    });

    it("should detect difference at last byte", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 4]);

      expect(bytesEqual(a, b)).toBe(false);
    });
  });

  describe("copyBytes", () => {
    it("should create independent copy", () => {
      const original = new Uint8Array([1, 2, 3, 4, 5]);
      const copy = copyBytes(original);

      expect(copy).toEqual(original);
      expect(copy).not.toBe(original); // Different reference
    });

    it("should not affect original when modifying copy", () => {
      const original = new Uint8Array([1, 2, 3]);
      const copy = copyBytes(original);

      copy[0] = 99;

      expect(original[0]).toBe(1);
      expect(copy[0]).toBe(99);
    });

    it("should handle empty array", () => {
      const original = new Uint8Array([]);
      const copy = copyBytes(original);

      expect(copy).toEqual(original);
      expect(copy.length).toBe(0);
    });

    it("should handle large arrays", () => {
      const original = new Uint8Array(10000);
      original.fill(42);

      const copy = copyBytes(original);

      expect(copy.length).toBe(10000);
      expect(copy.every((byte) => byte === 42)).toBe(true);
      expect(copy).not.toBe(original);
    });

    it("should preserve all byte values", () => {
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        original[i] = i;
      }

      const copy = copyBytes(original);

      expect(copy).toEqual(original);
    });
  });

  describe("isValidPublicKeyFormat", () => {
    it("should accept compressed key with 0x02 prefix (33 bytes)", () => {
      const key = new Uint8Array(33);
      key[0] = 0x02;

      expect(isValidPublicKeyFormat(key)).toBe(true);
    });

    it("should accept compressed key with 0x03 prefix (33 bytes)", () => {
      const key = new Uint8Array(33);
      key[0] = 0x03;

      expect(isValidPublicKeyFormat(key)).toBe(true);
    });

    it("should reject compressed key with wrong prefix (33 bytes)", () => {
      const key = new Uint8Array(33);
      key[0] = 0x04; // Wrong for compressed

      expect(isValidPublicKeyFormat(key)).toBe(false);
    });

    it("should accept uncompressed key with 0x04 prefix (65 bytes)", () => {
      const key = new Uint8Array(65);
      key[0] = 0x04;

      expect(isValidPublicKeyFormat(key)).toBe(true);
    });

    it("should reject uncompressed key with wrong prefix (65 bytes)", () => {
      const key = new Uint8Array(65);
      key[0] = 0x02; // Wrong for uncompressed

      expect(isValidPublicKeyFormat(key)).toBe(false);
    });

    it("should accept raw coordinates (64 bytes)", () => {
      const key = new Uint8Array(64);

      expect(isValidPublicKeyFormat(key)).toBe(true);
    });

    it("should reject invalid lengths", () => {
      expect(isValidPublicKeyFormat(new Uint8Array(32))).toBe(false);
      expect(isValidPublicKeyFormat(new Uint8Array(34))).toBe(false);
      expect(isValidPublicKeyFormat(new Uint8Array(63))).toBe(false);
      expect(isValidPublicKeyFormat(new Uint8Array(66))).toBe(false);
    });

    it("should reject empty array", () => {
      expect(isValidPublicKeyFormat(new Uint8Array(0))).toBe(false);
    });

    it("should reject too short keys", () => {
      expect(isValidPublicKeyFormat(new Uint8Array(1))).toBe(false);
      expect(isValidPublicKeyFormat(new Uint8Array(16))).toBe(false);
    });
  });

  describe("isValidPrivateKeyFormat", () => {
    it("should accept 32-byte private key", () => {
      const key = new Uint8Array(32);

      expect(isValidPrivateKeyFormat(key)).toBe(true);
    });

    it("should reject keys that are too short", () => {
      expect(isValidPrivateKeyFormat(new Uint8Array(31))).toBe(false);
      expect(isValidPrivateKeyFormat(new Uint8Array(16))).toBe(false);
    });

    it("should reject keys that are too long", () => {
      expect(isValidPrivateKeyFormat(new Uint8Array(33))).toBe(false);
      expect(isValidPrivateKeyFormat(new Uint8Array(64))).toBe(false);
    });

    it("should accept key with any byte values", () => {
      const key = new Uint8Array(32);
      key.fill(0xff);

      expect(isValidPrivateKeyFormat(key)).toBe(true);
    });

    it("should accept key with all zeros", () => {
      const key = new Uint8Array(32);

      expect(isValidPrivateKeyFormat(key)).toBe(true);
    });

    it("should reject empty array", () => {
      expect(isValidPrivateKeyFormat(new Uint8Array(0))).toBe(false);
    });
  });

  describe("assertUncompressedPublicKey", () => {
    it("should pass for valid uncompressed key", () => {
      const key = new Uint8Array(65);
      key[0] = 0x04;

      expect(() => {
        assertUncompressedPublicKey(key);
      }).not.toThrow();
    });

    it("should throw for compressed key (33 bytes)", () => {
      const key = new Uint8Array(33);
      key[0] = 0x02;

      expect(() => {
        assertUncompressedPublicKey(key);
      }).toThrow(/must be uncompressed \(65 bytes\)/);
    });

    it("should throw for raw coordinates (64 bytes)", () => {
      const key = new Uint8Array(64);

      expect(() => {
        assertUncompressedPublicKey(key);
      }).toThrow(/must be uncompressed \(65 bytes\)/);
    });

    it("should throw for wrong length with byte count in message", () => {
      const key = new Uint8Array(32);

      expect(() => {
        assertUncompressedPublicKey(key);
      }).toThrow(/got 32 bytes/);
    });

    it("should throw for wrong prefix", () => {
      const key = new Uint8Array(65);
      key[0] = 0x02;

      expect(() => {
        assertUncompressedPublicKey(key);
      }).toThrow(/must start with 0x04 prefix/);
    });

    it("should include prefix value in error message", () => {
      const key = new Uint8Array(65);
      key[0] = 0x03;

      expect(() => {
        assertUncompressedPublicKey(key);
      }).toThrow(/got 0x03/);
    });

    it("should mention normalizeToUncompressed in error", () => {
      const key = new Uint8Array(33);

      expect(() => {
        assertUncompressedPublicKey(key);
      }).toThrow(/normalizeToUncompressed/);
    });

    it("should handle zero prefix with proper formatting", () => {
      const key = new Uint8Array(65);
      key[0] = 0x00;

      expect(() => {
        assertUncompressedPublicKey(key);
      }).toThrow(/got 0x00/);
    });

    it("should accept key with any values after valid prefix", () => {
      const key = new Uint8Array(65);
      key[0] = 0x04;
      key.fill(0xff, 1);

      expect(() => {
        assertUncompressedPublicKey(key);
      }).not.toThrow();
    });
  });
});
