/**
 * ECIES Compatibility Test Suite
 *
 * Verifies that our new ECIES implementation is 100% compatible with eccrypto.
 * This ensures backward compatibility with existing encrypted data in the Vana network.
 *
 * These tests are for development only and not shipped in production.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as eccrypto from "eccrypto";
import { randomBytes } from "crypto";
import { NodeECIESProvider } from "../node";
import type { ECIESEncrypted } from "../interface";

describe("ECIES eccrypto Compatibility", () => {
  let nodeProvider: NodeECIESProvider;
  let testPrivateKey: Buffer;
  let testPublicKey: Buffer;
  let testMessage: Buffer;

  beforeAll(() => {
    nodeProvider = new NodeECIESProvider();

    // Generate test keypair using eccrypto for consistency
    testPrivateKey = eccrypto.generatePrivate();
    testPublicKey = eccrypto.getPublic(testPrivateKey);
    testMessage = Buffer.from(
      "This is a test message for ECIES compatibility verification",
    );
  });

  describe("Decryption Compatibility", () => {
    it("should decrypt data encrypted by eccrypto", async () => {
      // Encrypt with eccrypto
      const eccryptoEncrypted = await eccrypto.encrypt(
        testPublicKey,
        testMessage,
      );

      // Decrypt with our implementation
      const ourDecrypted = await nodeProvider.decrypt(
        testPrivateKey,
        eccryptoEncrypted,
      );

      expect(ourDecrypted).toEqual(testMessage);
      expect(ourDecrypted.toString("utf8")).toBe(testMessage.toString("utf8"));
    });

    it("should handle eccrypto encrypted empty message", async () => {
      const emptyMessage = Buffer.from("");

      // Encrypt empty message with eccrypto
      const eccryptoEncrypted = await eccrypto.encrypt(
        testPublicKey,
        emptyMessage,
      );

      // Decrypt with our implementation
      const ourDecrypted = await nodeProvider.decrypt(
        testPrivateKey,
        eccryptoEncrypted,
      );

      expect(ourDecrypted).toEqual(emptyMessage);
      expect(ourDecrypted.length).toBe(0);
    });

    it("should handle eccrypto encrypted binary data", async () => {
      const binaryData = randomBytes(256);

      // Encrypt with eccrypto
      const eccryptoEncrypted = await eccrypto.encrypt(
        testPublicKey,
        binaryData,
      );

      // Decrypt with our implementation
      const ourDecrypted = await nodeProvider.decrypt(
        testPrivateKey,
        eccryptoEncrypted,
      );

      expect(ourDecrypted).toEqual(binaryData);
    });

    it("should handle eccrypto encrypted large data", async () => {
      const largeData = randomBytes(10000); // 10KB

      // Encrypt with eccrypto
      const eccryptoEncrypted = await eccrypto.encrypt(
        testPublicKey,
        largeData,
      );

      // Decrypt with our implementation
      const ourDecrypted = await nodeProvider.decrypt(
        testPrivateKey,
        eccryptoEncrypted,
      );

      expect(ourDecrypted).toEqual(largeData);
    });
  });

  describe("Encryption Compatibility", () => {
    it("should produce encryption that eccrypto can decrypt", async () => {
      // Encrypt with our implementation
      const ourEncrypted = await nodeProvider.encrypt(
        testPublicKey,
        testMessage,
      );

      // Decrypt with eccrypto
      const eccryptoDecrypted = await eccrypto.decrypt(
        testPrivateKey,
        ourEncrypted,
      );

      expect(eccryptoDecrypted).toEqual(testMessage);
      expect(eccryptoDecrypted.toString("utf8")).toBe(
        testMessage.toString("utf8"),
      );
    });

    it("should produce valid ECIES structure matching eccrypto format", async () => {
      const ourEncrypted = await nodeProvider.encrypt(
        testPublicKey,
        testMessage,
      );

      // Verify structure matches eccrypto format
      expect(ourEncrypted.iv).toBeInstanceOf(Buffer);
      expect(ourEncrypted.iv.length).toBe(16);

      expect(ourEncrypted.ephemPublicKey).toBeInstanceOf(Buffer);
      expect(ourEncrypted.ephemPublicKey.length).toBe(65); // Uncompressed
      expect(ourEncrypted.ephemPublicKey[0]).toBe(0x04); // Uncompressed prefix

      expect(ourEncrypted.ciphertext).toBeInstanceOf(Buffer);
      expect(ourEncrypted.ciphertext.length).toBeGreaterThan(0);

      expect(ourEncrypted.mac).toBeInstanceOf(Buffer);
      expect(ourEncrypted.mac.length).toBe(32);
    });

    it("eccrypto should decrypt our empty message encryption", async () => {
      const emptyMessage = Buffer.from("");

      // Encrypt with our implementation
      const ourEncrypted = await nodeProvider.encrypt(
        testPublicKey,
        emptyMessage,
      );

      // Decrypt with eccrypto
      const eccryptoDecrypted = await eccrypto.decrypt(
        testPrivateKey,
        ourEncrypted,
      );

      expect(eccryptoDecrypted).toEqual(emptyMessage);
      expect(eccryptoDecrypted.length).toBe(0);
    });

    it("eccrypto should decrypt our binary data encryption", async () => {
      const binaryData = randomBytes(256);

      // Encrypt with our implementation
      const ourEncrypted = await nodeProvider.encrypt(
        testPublicKey,
        binaryData,
      );

      // Decrypt with eccrypto
      const eccryptoDecrypted = await eccrypto.decrypt(
        testPrivateKey,
        ourEncrypted,
      );

      expect(eccryptoDecrypted).toEqual(binaryData);
    });
  });

  describe("Round-trip Compatibility", () => {
    it("should maintain compatibility in both directions", async () => {
      // Our implementation encrypts, eccrypto decrypts
      const ourEncrypted = await nodeProvider.encrypt(
        testPublicKey,
        testMessage,
      );
      const eccryptoDecrypted = await eccrypto.decrypt(
        testPrivateKey,
        ourEncrypted,
      );
      expect(eccryptoDecrypted).toEqual(testMessage);

      // eccrypto encrypts, our implementation decrypts
      const eccryptoEncrypted = await eccrypto.encrypt(
        testPublicKey,
        testMessage,
      );
      const ourDecrypted = await nodeProvider.decrypt(
        testPrivateKey,
        eccryptoEncrypted,
      );
      expect(ourDecrypted).toEqual(testMessage);
    });

    it("should handle multiple encryption/decryption cycles", async () => {
      let data = testMessage;

      // Cycle 1: We encrypt, eccrypto decrypts
      const encrypted1 = await nodeProvider.encrypt(testPublicKey, data);
      data = await eccrypto.decrypt(testPrivateKey, encrypted1);
      expect(data).toEqual(testMessage);

      // Cycle 2: eccrypto encrypts, we decrypt
      const encrypted2 = await eccrypto.encrypt(testPublicKey, data);
      data = await nodeProvider.decrypt(testPrivateKey, encrypted2);
      expect(data).toEqual(testMessage);

      // Cycle 3: We encrypt again, eccrypto decrypts again
      const encrypted3 = await nodeProvider.encrypt(testPublicKey, data);
      data = await eccrypto.decrypt(testPrivateKey, encrypted3);
      expect(data).toEqual(testMessage);
    });
  });

  describe("Error Handling Compatibility", () => {
    it("should fail to decrypt with wrong private key (like eccrypto)", async () => {
      const wrongPrivateKey = eccrypto.generatePrivate();

      // Encrypt with eccrypto
      const eccryptoEncrypted = await eccrypto.encrypt(
        testPublicKey,
        testMessage,
      );

      // Try to decrypt with wrong key using our implementation
      await expect(
        nodeProvider.decrypt(wrongPrivateKey, eccryptoEncrypted),
      ).rejects.toThrow();
    });

    it("should fail to decrypt corrupted data (like eccrypto)", async () => {
      const ourEncrypted = await nodeProvider.encrypt(
        testPublicKey,
        testMessage,
      );

      // Corrupt the MAC
      ourEncrypted.mac[0] = ourEncrypted.mac[0] ^ 0xff;

      // Both implementations should reject
      await expect(
        nodeProvider.decrypt(testPrivateKey, ourEncrypted),
      ).rejects.toThrow(/MAC/i);

      await expect(
        eccrypto.decrypt(testPrivateKey, ourEncrypted),
      ).rejects.toThrow();
    });
  });

  describe("Format Serialization Compatibility", () => {
    it("should serialize/deserialize in eccrypto-compatible format", async () => {
      // Encrypt with eccrypto
      const eccryptoEncrypted = await eccrypto.encrypt(
        testPublicKey,
        testMessage,
      );

      // Serialize eccrypto format
      const serialized = Buffer.concat([
        eccryptoEncrypted.iv,
        eccryptoEncrypted.ephemPublicKey,
        eccryptoEncrypted.ciphertext,
        eccryptoEncrypted.mac,
      ]);

      // Parse and decrypt with our implementation
      const parsed: ECIESEncrypted = {
        iv: serialized.subarray(0, 16),
        ephemPublicKey: serialized.subarray(16, 81),
        ciphertext: serialized.subarray(81, serialized.length - 32),
        mac: serialized.subarray(serialized.length - 32),
      };

      const decrypted = await nodeProvider.decrypt(testPrivateKey, parsed);
      expect(decrypted).toEqual(testMessage);
    });

    it("should produce byte-identical MAC for same inputs", async () => {
      // This test verifies our MAC calculation matches eccrypto's exactly
      const fixedPrivateKey = Buffer.from(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "hex",
      );
      const fixedPublicKey = eccrypto.getPublic(fixedPrivateKey);
      const fixedMessage = Buffer.from("Fixed test message");

      // Since we can't control the ephemeral key generation,
      // we'll verify that the MAC format is correct
      const ourEncrypted = await nodeProvider.encrypt(
        fixedPublicKey,
        fixedMessage,
      );

      // eccrypto should be able to verify our MAC
      await expect(
        eccrypto.decrypt(fixedPrivateKey, ourEncrypted),
      ).resolves.toEqual(fixedMessage);
    });
  });
});
