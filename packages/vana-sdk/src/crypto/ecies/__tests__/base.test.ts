/**
 * Tests for BaseECIES protected methods and utilities
 */

import { describe, it, expect, beforeEach } from "vitest";
import { BaseECIES } from "../base";
import { SECURITY } from "../constants";

// Create a concrete test class to access protected methods
class TestECIES extends BaseECIES {
  // Implement abstract methods with minimal functionality for testing
  protected generateRandomBytes(length: number): Uint8Array {
    return new Uint8Array(length);
  }

  protected verifyPrivateKey(_privateKey: Uint8Array): boolean {
    return true;
  }

  protected createPublicKey(_privateKey: Uint8Array): Uint8Array {
    return new Uint8Array(65);
  }

  protected validatePublicKey(_publicKey: Uint8Array): boolean {
    return true;
  }

  protected decompressPublicKey(compressedKey: Uint8Array): Uint8Array {
    return compressedKey;
  }

  protected performECDH(
    _publicKey: Uint8Array,
    _privateKey: Uint8Array,
  ): Uint8Array {
    return new Uint8Array(32);
  }

  protected sha512(_data: Uint8Array): Uint8Array {
    return new Uint8Array(64);
  }

  protected hmacSha256(_key: Uint8Array, _data: Uint8Array): Uint8Array {
    return new Uint8Array(32);
  }

  protected async aesEncrypt(
    _key: Uint8Array,
    _iv: Uint8Array,
    _plaintext: Uint8Array,
  ): Promise<Uint8Array> {
    return new Uint8Array(0);
  }

  protected async aesDecrypt(
    _key: Uint8Array,
    _iv: Uint8Array,
    _ciphertext: Uint8Array,
  ): Promise<Uint8Array> {
    return new Uint8Array(0);
  }

  // Expose protected methods for testing
  public testClearBuffer(buffer: Uint8Array): void {
    this.clearBuffer(buffer);
  }

  public testConstantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    return this.constantTimeEqual(a, b);
  }

  public testConcatBuffers(...buffers: ArrayBufferView[]): Uint8Array {
    return this.concatBuffers(...buffers);
  }

  public testNormalizePublicKey(publicKey: Buffer): Uint8Array {
    return this.normalizePublicKey(publicKey);
  }
}

describe("BaseECIES", () => {
  let testProvider: TestECIES;

  beforeEach(() => {
    testProvider = new TestECIES();
  });

  describe("clearBuffer", () => {
    it("should securely clear sensitive data with multiple passes", () => {
      const testData = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0xab, 0xcd, 0xef,
      ]);
      const originalData = new Uint8Array(testData);

      testProvider.testClearBuffer(testData);

      // After clearing, all bytes should be zero
      expect(testData).toEqual(new Uint8Array(testData.length));
      // Ensure we actually modified the original data
      expect(testData).not.toEqual(originalData);
    });

    it("should handle empty buffers", () => {
      const emptyBuffer = new Uint8Array(0);
      expect(() => testProvider.testClearBuffer(emptyBuffer)).not.toThrow();
    });

    it("should clear all patterns according to SECURITY constants", () => {
      const testData = new Uint8Array(10).fill(0xff);

      testProvider.testClearBuffer(testData);

      // After the final pass, all should be zeros
      expect(
        testData.every((byte) => byte === SECURITY.CLEAR_PATTERNS.ZEROS),
      ).toBe(true);
    });
  });

  describe("constantTimeEqual", () => {
    it("should return true for identical arrays", () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 5]);

      expect(testProvider.testConstantTimeEqual(a, b)).toBe(true);
    });

    it("should return false for different arrays of same length", () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 6]);

      expect(testProvider.testConstantTimeEqual(a, b)).toBe(false);
    });

    it("should return false for arrays of different lengths", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3, 4]);

      expect(testProvider.testConstantTimeEqual(a, b)).toBe(false);
    });

    it("should handle empty arrays", () => {
      const a = new Uint8Array(0);
      const b = new Uint8Array(0);

      expect(testProvider.testConstantTimeEqual(a, b)).toBe(true);
    });

    it("should return false for one empty and one non-empty array", () => {
      const a = new Uint8Array([1]);
      const b = new Uint8Array(0);

      expect(testProvider.testConstantTimeEqual(a, b)).toBe(false);
    });
  });

  describe("concatBuffers", () => {
    it("should concatenate multiple buffers correctly", () => {
      const buffer1 = new Uint8Array([1, 2, 3]);
      const buffer2 = new Uint8Array([4, 5]);
      const buffer3 = new Uint8Array([6, 7, 8, 9]);

      const result = testProvider.testConcatBuffers(buffer1, buffer2, buffer3);

      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    });

    it("should handle empty buffers", () => {
      const buffer1 = new Uint8Array([1, 2]);
      const buffer2 = new Uint8Array(0);
      const buffer3 = new Uint8Array([3, 4]);

      const result = testProvider.testConcatBuffers(buffer1, buffer2, buffer3);

      expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it("should handle single buffer", () => {
      const buffer = new Uint8Array([1, 2, 3]);
      const result = testProvider.testConcatBuffers(buffer);

      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it("should handle no buffers", () => {
      const result = testProvider.testConcatBuffers();
      expect(result).toEqual(new Uint8Array(0));
    });
  });

  describe("normalizePublicKey", () => {
    it("should convert compressed public key Buffer to Uint8Array", () => {
      const buffer = Buffer.alloc(33, 0x02); // Compressed public key
      const result = testProvider.testNormalizePublicKey(buffer);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(33);
      expect(result[0]).toBe(0x02);
    });

    it("should convert uncompressed public key Buffer to Uint8Array", () => {
      const buffer = Buffer.alloc(65, 0x04); // Uncompressed public key
      buffer[0] = 0x04; // Uncompressed prefix
      const result = testProvider.testNormalizePublicKey(buffer);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(65);
      expect(result[0]).toBe(0x04);
    });

    it("should throw error for invalid public key size", () => {
      const buffer = Buffer.from([1, 2, 3, 4, 5]); // Invalid size

      expect(() => testProvider.testNormalizePublicKey(buffer)).toThrow(
        "Invalid public key format",
      );
    });
  });
});
