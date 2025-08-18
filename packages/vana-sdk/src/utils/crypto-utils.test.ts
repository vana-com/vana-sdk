import { describe, it, expect } from "vitest";
import {
  concatBytes,
  hexToBytes,
  bytesToHex,
  processWalletPublicKey,
  processWalletPrivateKey,
  parseEncryptedDataBuffer,
  generateSeed,
  bytesEqual,
  copyBytes,
  isValidPublicKeyFormat,
  isValidPrivateKeyFormat,
  normalizePublicKey,
} from "./crypto-utils";

describe("Crypto Utils", () => {
  describe("concatBytes", () => {
    it("concatenates multiple Uint8Arrays", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([4, 5]);
      const c = new Uint8Array([6, 7, 8]);
      const result = concatBytes(a, b, c);
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    });

    it("handles empty arrays", () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([]);
      const c = new Uint8Array([3]);
      const result = concatBytes(a, b, c);
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it("returns empty array when no arguments", () => {
      const result = concatBytes();
      expect(result).toEqual(new Uint8Array([]));
    });
  });

  describe("hexToBytes and bytesToHex", () => {
    it("converts hex to bytes", () => {
      expect(hexToBytes("48656c6c6f")).toEqual(
        new Uint8Array([72, 101, 108, 108, 111]),
      );
      expect(hexToBytes("0x48656c6c6f")).toEqual(
        new Uint8Array([72, 101, 108, 108, 111]),
      );
    });

    it("converts bytes to hex", () => {
      expect(bytesToHex(new Uint8Array([72, 101, 108, 108, 111]))).toBe(
        "48656c6c6f",
      );
    });

    it("handles round-trip conversion", () => {
      const original = new Uint8Array([0, 1, 127, 128, 255]);
      const hex = bytesToHex(original);
      const converted = hexToBytes(hex);
      expect(converted).toEqual(original);
    });
  });

  describe("processWalletPublicKey", () => {
    it("processes hex string public key", () => {
      const result = processWalletPublicKey("0404");
      expect(result).toEqual(new Uint8Array([4, 4]));
    });

    it("adds uncompressed prefix to 64-byte key", () => {
      const rawCoords = new Uint8Array(64);
      rawCoords.fill(42);
      const result = processWalletPublicKey(rawCoords);
      expect(result.length).toBe(65);
      expect(result[0]).toBe(4); // Uncompressed prefix
      expect(result.slice(1)).toEqual(rawCoords);
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
      expect(result).toEqual(hexToBytes("1234567890abcdef"));
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
      expect(result).toEqual(hexToBytes("abcdef"));
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

  describe("normalizePublicKey", () => {
    it("returns uncompressed key as-is", () => {
      const uncompressed = new Uint8Array(65);
      uncompressed[0] = 0x04;
      const result = normalizePublicKey(uncompressed);
      expect(result).toBe(uncompressed);
    });

    it("adds prefix to raw coordinates", () => {
      const raw = new Uint8Array(64);
      raw.fill(42);
      const result = normalizePublicKey(raw);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.length).toBe(65);
        expect(result[0]).toBe(0x04);
        expect(result.slice(1)).toEqual(raw);
      }
    });

    it("returns compressed key as-is for crypto layer to handle", () => {
      const compressed = new Uint8Array(33);
      compressed[0] = 0x02;
      const result = normalizePublicKey(compressed);
      expect(result).toEqual(compressed);
    });

    it("returns null for invalid format", () => {
      expect(normalizePublicKey(new Uint8Array(32))).toBeNull();
      expect(normalizePublicKey(new Uint8Array(100))).toBeNull();

      const invalidCompressed = new Uint8Array(33);
      invalidCompressed[0] = 0x05; // Invalid prefix
      expect(normalizePublicKey(invalidCompressed)).toBeNull();
    });
  });
});
