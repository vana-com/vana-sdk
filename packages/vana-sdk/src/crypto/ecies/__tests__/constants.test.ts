/**
 * Tests for ECIES constants and validation helpers
 */

import { describe, it, expect } from "vitest";
import {
  CURVE,
  CIPHER,
  KDF,
  MAC,
  FORMAT,
  SECURITY,
  VALIDATION,
} from "../constants";

describe("ECIES Constants", () => {
  describe("CURVE constants", () => {
    it("should have correct secp256k1 parameters", () => {
      expect(CURVE.name).toBe("secp256k1");
      expect(CURVE.PRIVATE_KEY_LENGTH).toBe(32);
      expect(CURVE.COMPRESSED_PUBLIC_KEY_LENGTH).toBe(33);
      expect(CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH).toBe(65);
    });

    it("should have correct public key prefixes", () => {
      expect(CURVE.PREFIX.UNCOMPRESSED).toBe(0x04);
      expect(CURVE.PREFIX.COMPRESSED_EVEN).toBe(0x02);
      expect(CURVE.PREFIX.COMPRESSED_ODD).toBe(0x03);
    });

    it("should have correct coordinate offsets", () => {
      expect(CURVE.X_COORDINATE_OFFSET).toBe(1);
      expect(CURVE.X_COORDINATE_END).toBe(33);
    });
  });

  describe("CIPHER constants", () => {
    it("should have correct AES-256-CBC parameters", () => {
      expect(CIPHER.algorithm).toBe("aes-256-cbc");
      expect(CIPHER.KEY_LENGTH).toBe(32);
      expect(CIPHER.IV_LENGTH).toBe(16);
      expect(CIPHER.BLOCK_SIZE).toBe(16);
    });
  });

  describe("KDF constants", () => {
    it("should have correct HMAC-SHA-512 parameters", () => {
      expect(KDF.algorithm).toBe("sha512");
      expect(KDF.OUTPUT_LENGTH).toBe(64);
      expect(KDF.ENCRYPTION_KEY_LENGTH).toBe(32);
      expect(KDF.MAC_KEY_LENGTH).toBe(32);
      expect(KDF.ENCRYPTION_KEY_OFFSET).toBe(0);
      expect(KDF.MAC_KEY_OFFSET).toBe(32);
    });
  });

  describe("MAC constants", () => {
    it("should have correct HMAC-SHA-256 parameters", () => {
      expect(MAC.algorithm).toBe("sha256");
      expect(MAC.LENGTH).toBe(32);
    });
  });

  describe("FORMAT constants", () => {
    it("should have correct offsets and lengths", () => {
      expect(FORMAT.IV_OFFSET).toBe(0);
      expect(FORMAT.IV_LENGTH).toBe(CIPHER.IV_LENGTH);
      expect(FORMAT.EPHEMERAL_KEY_OFFSET).toBe(CIPHER.IV_LENGTH);
      expect(FORMAT.EPHEMERAL_KEY_LENGTH).toBe(
        CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH,
      );
      expect(FORMAT.CIPHERTEXT_OFFSET).toBe(
        CIPHER.IV_LENGTH + CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH,
      );
      expect(FORMAT.MAC_LENGTH).toBe(MAC.LENGTH);
    });

    it("should calculate minimum encrypted length correctly", () => {
      const expected =
        CIPHER.IV_LENGTH + CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH + MAC.LENGTH;
      expect(FORMAT.MIN_ENCRYPTED_LENGTH).toBe(expected);
      expect(FORMAT.MIN_ENCRYPTED_LENGTH).toBe(16 + 65 + 32); // 113 bytes
    });

    it("should calculate total length correctly", () => {
      const ciphertextLength = 100;
      const totalLength = FORMAT.getTotalLength(ciphertextLength);
      const expected =
        CIPHER.IV_LENGTH +
        CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH +
        ciphertextLength +
        MAC.LENGTH;
      expect(totalLength).toBe(expected);
      expect(totalLength).toBe(16 + 65 + 100 + 32); // 213 bytes
    });
  });

  describe("SECURITY constants", () => {
    it("should have clear patterns for secure data clearing", () => {
      expect(SECURITY.CLEAR_PATTERNS.ZEROS).toBe(0x00);
      expect(SECURITY.CLEAR_PATTERNS.ONES).toBe(0xff);
      expect(SECURITY.CLEAR_PATTERNS.PATTERN_MULTIPLIER).toBe(7);
      expect(SECURITY.CLEAR_PATTERNS.PATTERN_OFFSET).toBe(13);
    });
  });

  describe("VALIDATION helpers", () => {
    describe("isValidPrivateKey", () => {
      it("should validate correct private key length", () => {
        const validKey = new Uint8Array(32).fill(1);
        expect(VALIDATION.isValidPrivateKey(validKey)).toBe(true);
      });

      it("should reject invalid private key length", () => {
        const shortKey = new Uint8Array(31).fill(1);
        const longKey = new Uint8Array(33).fill(1);
        expect(VALIDATION.isValidPrivateKey(shortKey)).toBe(false);
        expect(VALIDATION.isValidPrivateKey(longKey)).toBe(false);
      });
    });

    describe("isValidPublicKey", () => {
      it("should validate compressed public key length", () => {
        const compressedKey = new Uint8Array(33).fill(1);
        expect(VALIDATION.isValidPublicKey(compressedKey)).toBe(true);
      });

      it("should validate uncompressed public key length", () => {
        const uncompressedKey = new Uint8Array(65).fill(1);
        expect(VALIDATION.isValidPublicKey(uncompressedKey)).toBe(true);
      });

      it("should reject invalid public key lengths", () => {
        const shortKey = new Uint8Array(32).fill(1);
        const longKey = new Uint8Array(66).fill(1);
        const middleKey = new Uint8Array(50).fill(1);
        expect(VALIDATION.isValidPublicKey(shortKey)).toBe(false);
        expect(VALIDATION.isValidPublicKey(longKey)).toBe(false);
        expect(VALIDATION.isValidPublicKey(middleKey)).toBe(false);
      });
    });

    describe("isCompressedPublicKey", () => {
      it("should validate compressed public key with correct prefix", () => {
        const evenKey = new Uint8Array(33);
        evenKey[0] = CURVE.PREFIX.COMPRESSED_EVEN;
        expect(VALIDATION.isCompressedPublicKey(evenKey)).toBe(true);

        const oddKey = new Uint8Array(33);
        oddKey[0] = CURVE.PREFIX.COMPRESSED_ODD;
        expect(VALIDATION.isCompressedPublicKey(oddKey)).toBe(true);
      });

      it("should reject compressed key with wrong prefix", () => {
        const wrongPrefix = new Uint8Array(33);
        wrongPrefix[0] = CURVE.PREFIX.UNCOMPRESSED;
        expect(VALIDATION.isCompressedPublicKey(wrongPrefix)).toBe(false);

        const invalidPrefix = new Uint8Array(33);
        invalidPrefix[0] = 0x01;
        expect(VALIDATION.isCompressedPublicKey(invalidPrefix)).toBe(false);
      });

      it("should reject wrong length", () => {
        const wrongLength = new Uint8Array(65);
        wrongLength[0] = CURVE.PREFIX.COMPRESSED_EVEN;
        expect(VALIDATION.isCompressedPublicKey(wrongLength)).toBe(false);
      });
    });

    describe("isUncompressedPublicKey", () => {
      it("should validate uncompressed public key with correct prefix", () => {
        const uncompressedKey = new Uint8Array(65);
        uncompressedKey[0] = CURVE.PREFIX.UNCOMPRESSED;
        expect(VALIDATION.isUncompressedPublicKey(uncompressedKey)).toBe(true);
      });

      it("should reject uncompressed key with wrong prefix", () => {
        const wrongPrefix = new Uint8Array(65);
        wrongPrefix[0] = CURVE.PREFIX.COMPRESSED_EVEN;
        expect(VALIDATION.isUncompressedPublicKey(wrongPrefix)).toBe(false);

        const invalidPrefix = new Uint8Array(65);
        invalidPrefix[0] = 0x01;
        expect(VALIDATION.isUncompressedPublicKey(invalidPrefix)).toBe(false);
      });

      it("should reject wrong length", () => {
        const wrongLength = new Uint8Array(33);
        wrongLength[0] = CURVE.PREFIX.UNCOMPRESSED;
        expect(VALIDATION.isUncompressedPublicKey(wrongLength)).toBe(false);
      });
    });
  });

  describe("Constants integration", () => {
    it("should have consistent format calculations", () => {
      // Test that all format calculations are consistent
      const ciphertextLength = 256;
      const totalLength = FORMAT.getTotalLength(ciphertextLength);

      expect(totalLength).toBe(
        FORMAT.IV_LENGTH +
          FORMAT.EPHEMERAL_KEY_LENGTH +
          ciphertextLength +
          FORMAT.MAC_LENGTH,
      );
    });

    it("should have consistent offset calculations", () => {
      expect(FORMAT.EPHEMERAL_KEY_OFFSET).toBe(
        FORMAT.IV_OFFSET + FORMAT.IV_LENGTH,
      );
      expect(FORMAT.CIPHERTEXT_OFFSET).toBe(
        FORMAT.EPHEMERAL_KEY_OFFSET + FORMAT.EPHEMERAL_KEY_LENGTH,
      );
    });

    it("should handle edge cases in getTotalLength", () => {
      // Test with zero ciphertext length
      expect(FORMAT.getTotalLength(0)).toBe(FORMAT.MIN_ENCRYPTED_LENGTH);

      // Test with large ciphertext length
      const largeCiphertext = 1024 * 1024; // 1MB
      expect(FORMAT.getTotalLength(largeCiphertext)).toBe(
        FORMAT.MIN_ENCRYPTED_LENGTH + largeCiphertext,
      );
    });

    it("should verify all validation helpers work correctly together", () => {
      // Test combinations of validation functions
      const compressedKey = new Uint8Array(33);
      compressedKey[0] = CURVE.PREFIX.COMPRESSED_EVEN;

      expect(VALIDATION.isValidPublicKey(compressedKey)).toBe(true);
      expect(VALIDATION.isCompressedPublicKey(compressedKey)).toBe(true);
      expect(VALIDATION.isUncompressedPublicKey(compressedKey)).toBe(false);

      const uncompressedKey = new Uint8Array(65);
      uncompressedKey[0] = CURVE.PREFIX.UNCOMPRESSED;

      expect(VALIDATION.isValidPublicKey(uncompressedKey)).toBe(true);
      expect(VALIDATION.isCompressedPublicKey(uncompressedKey)).toBe(false);
      expect(VALIDATION.isUncompressedPublicKey(uncompressedKey)).toBe(true);
    });

    it("should validate KDF key derivation lengths", () => {
      // Ensure KDF output length equals sum of key lengths
      expect(KDF.OUTPUT_LENGTH).toBe(
        KDF.ENCRYPTION_KEY_LENGTH + KDF.MAC_KEY_LENGTH,
      );

      // Ensure offsets are correct
      expect(KDF.MAC_KEY_OFFSET).toBe(KDF.ENCRYPTION_KEY_LENGTH);
      expect(KDF.ENCRYPTION_KEY_OFFSET).toBe(0);
    });

    it("should validate CIPHER block alignment", () => {
      // Ensure IV length matches block size for proper encryption
      expect(CIPHER.IV_LENGTH).toBe(CIPHER.BLOCK_SIZE);

      // Ensure key length is appropriate for AES-256
      expect(CIPHER.KEY_LENGTH).toBe(32); // 256 bits / 8
    });
  });
});
