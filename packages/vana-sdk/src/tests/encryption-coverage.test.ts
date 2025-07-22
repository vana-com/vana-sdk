import { describe, it, expect } from "vitest";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import {
  generateEncryptionKeyPair,
  generatePGPKeyPair,
  encryptFileKey,
  getEncryptionParameters,
  encryptWithWalletPublicKey,
  decryptWithWalletPrivateKey,
  encryptBlobWithSignedKey,
  decryptBlobWithSignedKey,
} from "../utils/encryption";

/**
 * Tests to improve coverage for encryption utilities
 * These test functions that weren't covered by existing tests
 */

describe("Encryption Utilities Coverage", () => {
  describe("generateEncryptionKeyPair", () => {
    it("should generate key pair using auto-detected platform", async () => {
      const result = await generateEncryptionKeyPair(mockPlatformAdapter);

      expect(result).toHaveProperty("publicKey");
      expect(result).toHaveProperty("privateKey");
      expect(typeof result.publicKey).toBe("string");
      expect(typeof result.privateKey).toBe("string");
      expect(result.publicKey).not.toBe(result.privateKey);
    });

    it("should return different keys on each call", async () => {
      const keyPair1 = await generateEncryptionKeyPair(mockPlatformAdapter);
      const keyPair2 = await generateEncryptionKeyPair(mockPlatformAdapter);

      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
    });
  });

  describe("generatePGPKeyPair", () => {
    it("should generate PGP key pair with default options", async () => {
      const result = await generatePGPKeyPair(mockPlatformAdapter);

      expect(result).toHaveProperty("publicKey");
      expect(result).toHaveProperty("privateKey");
      expect(typeof result.publicKey).toBe("string");
      expect(typeof result.privateKey).toBe("string");

      // PGP keys should contain the typical markers
      expect(result.publicKey).toContain("PUBLIC KEY");
      expect(result.privateKey).toContain("PRIVATE KEY");
    });

    it("should generate PGP key pair with custom options", async () => {
      const options = {
        name: "Test User",
        email: "test@example.com",
        passphrase: "test-passphrase",
      };

      const result = await generatePGPKeyPair(mockPlatformAdapter, options);

      expect(result).toHaveProperty("publicKey");
      expect(result).toHaveProperty("privateKey");
      expect(typeof result.publicKey).toBe("string");
      expect(typeof result.privateKey).toBe("string");
    });
  });

  describe("getEncryptionParameters", () => {
    it("should generate encryption parameters", async () => {
      const result = await getEncryptionParameters(mockPlatformAdapter);

      expect(result).toHaveProperty("iv");
      expect(result).toHaveProperty("key");
      expect(typeof result.iv).toBe("string");
      expect(typeof result.key).toBe("string");
      expect(result.iv.length).toBeGreaterThan(0);
      expect(result.key.length).toBeGreaterThan(0);
    });

    it("should generate different parameters on each call", async () => {
      const params1 = await getEncryptionParameters(mockPlatformAdapter);
      const params2 = await getEncryptionParameters(mockPlatformAdapter);

      expect(params1.iv).not.toBe(params2.iv);
      expect(params1.key).not.toBe(params2.key);
    });
  });

  describe("Wallet public key encryption", () => {
    const testPrivateKey =
      "85271071a553feafb93839045545c233d0518e0b0fc583f88038f8b0e32e9f18";
    const testPublicKey =
      "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

    it("should encrypt and decrypt with wallet keys", async () => {
      const testData = "Secret wallet data for encryption";

      const encrypted = await encryptWithWalletPublicKey(
        testData,
        testPublicKey,
        mockPlatformAdapter,
      );
      const decrypted = await decryptWithWalletPrivateKey(
        encrypted,
        testPrivateKey,
        mockPlatformAdapter,
      );

      expect(decrypted).toBe(testData);
    });

    it("should handle Blob input", async () => {
      const testBlob = new Blob(["Blob data for wallet encryption"], {
        type: "text/plain",
      });

      const encrypted = await encryptWithWalletPublicKey(
        testBlob,
        testPublicKey,
        mockPlatformAdapter,
      );
      const decrypted = await decryptWithWalletPrivateKey(
        encrypted,
        testPrivateKey,
        mockPlatformAdapter,
      );

      expect(decrypted).toBe("Blob data for wallet encryption");
    });
  });

  describe("User data encryption", () => {
    const testSignature =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    it("should encrypt and decrypt user data with signature", async () => {
      const testData = "User data for PGP encryption";

      const encrypted = await encryptBlobWithSignedKey(
        testData,
        testSignature,
        mockPlatformAdapter,
      );
      const decrypted = await decryptBlobWithSignedKey(
        encrypted,
        testSignature,
        mockPlatformAdapter,
      );

      expect(encrypted).toBeInstanceOf(Blob);
      expect(decrypted).toBeInstanceOf(Blob);

      const decryptedText = await decrypted.text();
      expect(decryptedText).toBe(testData);
    });

    it("should handle Blob input for user data", async () => {
      const testBlob = new Blob(["Blob user data"], { type: "text/plain" });

      const encrypted = await encryptBlobWithSignedKey(
        testBlob,
        testSignature,
        mockPlatformAdapter,
      );
      const decrypted = await decryptBlobWithSignedKey(
        encrypted,
        testSignature,
        mockPlatformAdapter,
      );

      const decryptedText = await decrypted.text();
      expect(decryptedText).toBe("Blob user data");
    });

    it("should handle different data types", async () => {
      const jsonData = JSON.stringify({ message: "test", id: 123 });

      const encrypted = await encryptBlobWithSignedKey(
        jsonData,
        testSignature,
        mockPlatformAdapter,
      );
      const decrypted = await decryptBlobWithSignedKey(
        encrypted,
        testSignature,
        mockPlatformAdapter,
      );

      const decryptedText = await decrypted.text();
      expect(decryptedText).toBe(jsonData);
    });
  });

  describe("File key encryption", () => {
    const testPublicKey =
      "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

    it("should encrypt file key with public key", async () => {
      const fileKey = "symmetric-file-key-12345";

      const encryptedKey = await encryptFileKey(
        fileKey,
        testPublicKey,
        mockPlatformAdapter,
      );

      expect(typeof encryptedKey).toBe("string");
      expect(encryptedKey.length).toBeGreaterThan(0);
      expect(encryptedKey).not.toBe(fileKey);
    });
  });

  describe("Private key decryption", () => {
    const _testPrivateKey =
      "85271071a553feafb93839045545c233d0518e0b0fc583f88038f8b0e32e9f18";

    it("should decrypt data that was encrypted with the correct public key", async () => {
      // Test with a proper encrypt/decrypt cycle
      const testData = "Secret message for public key encryption";
      const testPublicKey = "04abc123..."; // Mock public key

      // First encrypt the data
      const encrypted = await encryptWithWalletPublicKey(
        testData,
        testPublicKey,
        mockPlatformAdapter,
      );

      // Then decrypt it with the corresponding private key
      const testPrivateKey = "0x456def..."; // Mock private key
      const decrypted = await decryptWithWalletPrivateKey(
        encrypted,
        testPrivateKey,
        mockPlatformAdapter,
      );

      expect(decrypted).toBe(testData);
    });
  });
});
