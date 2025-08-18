import { describe, it, expect } from "vitest";

/**
 * Tests for shared platform utilities
 * These utilities should be pure functions with no imports to avoid loading issues
 */

describe("Shared Platform Utilities", () => {
  describe("Crypto Utilities", () => {
    it("should process wallet public key with 0x prefix", async () => {
      const { processWalletPublicKey } = await import("../utils/crypto-utils");

      const publicKey =
        "0xc68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";
      const result = processWalletPublicKey(publicKey);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(65); // Should be uncompressed format
      expect(result[0]).toBe(4); // Should start with 0x04 prefix
    });

    it("should process wallet public key without 0x prefix", async () => {
      const { processWalletPublicKey } = await import("../utils/crypto-utils");

      const publicKey =
        "c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";
      const result = processWalletPublicKey(publicKey);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(65); // Should be uncompressed format
      expect(result[0]).toBe(4); // Should start with 0x04 prefix
    });

    it("should handle already uncompressed public key", async () => {
      const { processWalletPublicKey } = await import("../utils/crypto-utils");

      const publicKey =
        "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";
      const result = processWalletPublicKey(publicKey);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(65); // Should remain uncompressed format
      expect(result[0]).toBe(4); // Should still start with 0x04 prefix
    });

    it("should process wallet private key with 0x prefix", async () => {
      const { processWalletPrivateKey } = await import("../utils/crypto-utils");

      const privateKey =
        "0x85271071a553feafb93839045545c233d0518e0b0fc583f88038f8b0e32e9f18";
      const result = processWalletPrivateKey(privateKey);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(32); // Private key should be 32 bytes
      const { bytesToHex } = await import("../crypto/ecies/utils");
      expect(bytesToHex(result)).toBe(
        "85271071a553feafb93839045545c233d0518e0b0fc583f88038f8b0e32e9f18",
      );
    });

    it("should process wallet private key without 0x prefix", async () => {
      const { processWalletPrivateKey } = await import("../utils/crypto-utils");

      const privateKey =
        "85271071a553feafb93839045545c233d0518e0b0fc583f88038f8b0e32e9f18";
      const result = processWalletPrivateKey(privateKey);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(32); // Private key should be 32 bytes
      const { bytesToHex } = await import("../crypto/ecies/utils");
      expect(bytesToHex(result)).toBe(
        "85271071a553feafb93839045545c233d0518e0b0fc583f88038f8b0e32e9f18",
      );
    });

    it("should parse encrypted data buffer correctly", async () => {
      const { parseEncryptedDataBuffer } = await import(
        "../utils/crypto-utils"
      );

      // Create a test buffer with known structure
      const iv = Buffer.alloc(16, 1); // 16 bytes of 0x01
      const ephemPublicKey = Buffer.alloc(65, 2); // 65 bytes of 0x02
      const ciphertext = Buffer.alloc(32, 3); // 32 bytes of 0x03
      const mac = Buffer.alloc(32, 4); // 32 bytes of 0x04

      const testBuffer = Buffer.concat([iv, ephemPublicKey, ciphertext, mac]);
      const result = parseEncryptedDataBuffer(testBuffer);

      expect(result.iv).toEqual(iv);
      expect(result.ephemPublicKey).toEqual(ephemPublicKey);
      expect(result.ciphertext).toEqual(ciphertext);
      expect(result.mac).toEqual(mac);
    });

    it("should convert hex string to Uint8Array", async () => {
      const { hexToBytes } = await import("../crypto/ecies/utils");

      const hex = "deadbeef";
      const result = hexToBytes(hex);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(4);
      expect(Array.from(result)).toEqual([0xde, 0xad, 0xbe, 0xef]);
    });

    it("should convert Uint8Array to hex string", async () => {
      const { bytesToHex } = await import("../crypto/ecies/utils");

      const array = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      const result = bytesToHex(array);

      expect(result).toBe("deadbeef");
    });

    it("should round-trip hex conversions", async () => {
      const { hexToBytes, bytesToHex } = await import("../crypto/ecies/utils");

      const originalHex = "1234567890abcdef";
      const array = hexToBytes(originalHex);
      const backToHex = bytesToHex(array);

      expect(backToHex).toBe(originalHex);
    });
  });

  describe("PGP Utilities", () => {
    it("should provide standard PGP configuration", async () => {
      const { STANDARD_PGP_CONFIG } = await import(
        "../platform/shared/pgp-utils"
      );

      expect(STANDARD_PGP_CONFIG).toEqual({
        preferredCompressionAlgorithm: 2, // zlib
        preferredSymmetricAlgorithm: 7, // aes256
      });
    });

    it("should process PGP key options with defaults", async () => {
      const { processPGPKeyOptions } = await import(
        "../platform/shared/pgp-utils"
      );

      const result = processPGPKeyOptions();

      expect(result).toEqual({
        name: "Vana User",
        email: "user@vana.org",
        passphrase: undefined,
      });
    });

    it("should process PGP key options with custom values", async () => {
      const { processPGPKeyOptions } = await import(
        "../platform/shared/pgp-utils"
      );

      const options = {
        name: "Test User",
        email: "test@example.com",
        passphrase: "secret123",
      };
      const result = processPGPKeyOptions(options);

      expect(result).toEqual(options);
    });

    it("should process partial PGP key options", async () => {
      const { processPGPKeyOptions } = await import(
        "../platform/shared/pgp-utils"
      );

      const options = { name: "Custom User" };
      const result = processPGPKeyOptions(options);

      expect(result).toEqual({
        name: "Custom User",
        email: "user@vana.org",
        passphrase: undefined,
      });
    });

    it("should provide standard PGP key generation parameters", async () => {
      const { getPGPKeyGenParams } = await import(
        "../platform/shared/pgp-utils"
      );

      const result = getPGPKeyGenParams();

      expect(result).toEqual({
        type: "rsa",
        rsaBits: 2048,
        userIDs: [{ name: "Vana User", email: "user@vana.org" }],
        passphrase: undefined,
        config: {
          preferredCompressionAlgorithm: 2,
          preferredSymmetricAlgorithm: 7,
        },
      });
    });

    it("should provide custom PGP key generation parameters", async () => {
      const { getPGPKeyGenParams } = await import(
        "../platform/shared/pgp-utils"
      );

      const options = {
        name: "Test User",
        email: "test@example.com",
        passphrase: "secret123",
      };
      const result = getPGPKeyGenParams(options);

      expect(result).toEqual({
        type: "rsa",
        rsaBits: 2048,
        userIDs: [{ name: "Test User", email: "test@example.com" }],
        passphrase: "secret123",
        config: {
          preferredCompressionAlgorithm: 2,
          preferredSymmetricAlgorithm: 7,
        },
      });
    });
  });

  describe("Error Utilities", () => {
    it("should wrap errors with operation context", async () => {
      const { wrapCryptoError } = await import(
        "../platform/shared/error-utils"
      );

      const originalError = new Error("Something went wrong");
      const wrapped = wrapCryptoError("encryption", originalError);

      expect(wrapped.message).toBe("encryption failed: Something went wrong");
    });

    it("should wrap unknown errors", async () => {
      const { wrapCryptoError } = await import(
        "../platform/shared/error-utils"
      );

      const wrapped = wrapCryptoError("decryption", "string error");

      expect(wrapped.message).toBe("decryption failed: Unknown error");
    });

    it("should validate encrypted data structure with valid data", async () => {
      const { validateEncryptedDataStructure } = await import(
        "../platform/shared/error-utils"
      );

      const validData = {
        encrypted: [1, 2, 3],
        iv: [4, 5, 6],
        ephemeralPublicKey: [7, 8, 9],
      };

      expect(() => validateEncryptedDataStructure(validData)).not.toThrow();
    });

    it("should throw for invalid encrypted data structure", async () => {
      const { validateEncryptedDataStructure } = await import(
        "../platform/shared/error-utils"
      );

      const invalidData = { encrypted: [1, 2, 3] }; // Missing iv and ephemeralPublicKey

      expect(() => validateEncryptedDataStructure(invalidData)).toThrow(
        "Invalid encrypted data format",
      );
    });

    it("should throw for null or non-object data", async () => {
      const { validateEncryptedDataStructure } = await import(
        "../platform/shared/error-utils"
      );

      expect(() => validateEncryptedDataStructure(null)).toThrow(
        "Invalid encrypted data format",
      );
      expect(() => validateEncryptedDataStructure("string")).toThrow(
        "Invalid encrypted data format",
      );
      expect(() => validateEncryptedDataStructure(123)).toThrow(
        "Invalid encrypted data format",
      );
    });
  });

  describe("Stream Utilities", () => {
    it("should convert ReadableStream to Uint8Array", async () => {
      const { streamToUint8Array } = await import(
        "../platform/shared/stream-utils"
      );

      // Create a mock ReadableStream
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(testData.slice(0, 2)); // First chunk
          controller.enqueue(testData.slice(2)); // Second chunk
          controller.close();
        },
      });

      const result = await streamToUint8Array(stream);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toEqual(testData);
    });

    it("should handle empty ReadableStream", async () => {
      const { streamToUint8Array } = await import(
        "../platform/shared/stream-utils"
      );

      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const result = await streamToUint8Array(stream);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });
  });
});
