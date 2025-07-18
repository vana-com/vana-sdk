import { describe, it, expect, vi, afterEach } from "vitest";
import { browserPlatformAdapter } from "../platform/browser";
import { nodePlatformAdapter } from "../platform/node";

// Store original fetch for restoration
const originalFetch = globalThis.fetch;

describe("Platform Crypto Integration Tests", () => {
  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe("Browser Platform Crypto", () => {
    describe("ECDH Encryption", () => {
      it("should encrypt and decrypt data with generated key pair", async () => {
        const data = "sensitive test data";

        // Generate a real key pair
        const keyPair = await browserPlatformAdapter.crypto.generateKeyPair();

        // Encrypt with public key
        const encrypted =
          await browserPlatformAdapter.crypto.encryptWithPublicKey(
            data,
            keyPair.publicKey,
          );

        // Should be hex string encrypted data
        expect(/^[0-9a-f]+$/i.test(encrypted)).toBe(true);
        expect(encrypted).not.toBe(data);

        // Decrypt with private key
        const decrypted =
          await browserPlatformAdapter.crypto.decryptWithPrivateKey(
            encrypted,
            keyPair.privateKey,
          );

        expect(decrypted).toBe(data);
      });

      it("should generate unique key pairs", async () => {
        const keyPair1 = await browserPlatformAdapter.crypto.generateKeyPair();
        const keyPair2 = await browserPlatformAdapter.crypto.generateKeyPair();

        expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
        expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);

        // Should be valid hex strings
        expect(/^[0-9a-f]+$/i.test(keyPair1.publicKey)).toBe(true);
        expect(/^[0-9a-f]+$/i.test(keyPair1.privateKey)).toBe(true);
      });

      it("should fail decryption with wrong private key", async () => {
        const data = "test data";

        const keyPair1 = await browserPlatformAdapter.crypto.generateKeyPair();
        const keyPair2 = await browserPlatformAdapter.crypto.generateKeyPair();

        const encrypted =
          await browserPlatformAdapter.crypto.encryptWithPublicKey(
            data,
            keyPair1.publicKey,
          );

        await expect(
          browserPlatformAdapter.crypto.decryptWithPrivateKey(
            encrypted,
            keyPair2.privateKey,
          ),
        ).rejects.toThrow();
      });
    });

    describe("PGP Encryption", () => {
      it("should encrypt and decrypt with PGP key pair", async () => {
        const data = "confidential document";

        // Generate PGP key pair
        const keyPair = await browserPlatformAdapter.pgp.generateKeyPair({
          name: "Test User",
          email: "test@vana.org",
        });

        // Encrypt
        const encrypted = await browserPlatformAdapter.pgp.encrypt(
          data,
          keyPair.publicKey,
        );

        expect(encrypted).toContain("-----BEGIN PGP MESSAGE-----");
        expect(encrypted).toContain("-----END PGP MESSAGE-----");

        // Decrypt
        const decrypted = await browserPlatformAdapter.pgp.decrypt(
          encrypted,
          keyPair.privateKey,
        );

        expect(decrypted).toBe(data);
      }, 15000);

      it("should generate proper PGP key format", async () => {
        const keyPair = await browserPlatformAdapter.pgp.generateKeyPair({
          name: "Vana User",
          email: "user@vana.org",
        });

        expect(keyPair.publicKey).toContain(
          "-----BEGIN PGP PUBLIC KEY BLOCK-----",
        );
        expect(keyPair.publicKey).toContain(
          "-----END PGP PUBLIC KEY BLOCK-----",
        );
        expect(keyPair.privateKey).toContain(
          "-----BEGIN PGP PRIVATE KEY BLOCK-----",
        );
        expect(keyPair.privateKey).toContain(
          "-----END PGP PRIVATE KEY BLOCK-----",
        );

        // Key should be properly formatted (user info is base64-encoded in binary format)
        expect(keyPair.publicKey.length).toBeGreaterThan(500); // Reasonable length for RSA-2048 key
      }, 10000);
    });
  });

  describe("Node.js Platform Crypto", () => {
    describe("ECDH Encryption", () => {
      it("should encrypt and decrypt data with generated key pair", async () => {
        const data = "sensitive node test data";

        // Generate a real key pair
        const keyPair = await nodePlatformAdapter.crypto.generateKeyPair();

        // Encrypt with public key
        const encrypted = await nodePlatformAdapter.crypto.encryptWithPublicKey(
          data,
          keyPair.publicKey,
        );

        // Should be hex string encrypted data
        expect(/^[0-9a-f]+$/i.test(encrypted)).toBe(true);
        expect(encrypted).not.toBe(data);

        // Decrypt with private key
        const decrypted =
          await nodePlatformAdapter.crypto.decryptWithPrivateKey(
            encrypted,
            keyPair.privateKey,
          );

        expect(decrypted).toBe(data);
      });

      it("should generate unique key pairs", async () => {
        const keyPair1 = await nodePlatformAdapter.crypto.generateKeyPair();
        const keyPair2 = await nodePlatformAdapter.crypto.generateKeyPair();

        expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
        expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);

        // Should be valid hex strings
        expect(/^[0-9a-f]+$/i.test(keyPair1.publicKey)).toBe(true);
        expect(/^[0-9a-f]+$/i.test(keyPair1.privateKey)).toBe(true);
      });
    });

    describe("PGP Encryption", () => {
      it("should encrypt and decrypt with PGP key pair", async () => {
        const data = "node confidential document";

        // Generate PGP key pair
        const keyPair = await nodePlatformAdapter.pgp.generateKeyPair({
          name: "Node Test User",
          email: "nodetest@vana.org",
        });

        // Encrypt
        const encrypted = await nodePlatformAdapter.pgp.encrypt(
          data,
          keyPair.publicKey,
        );

        expect(encrypted).toContain("-----BEGIN PGP MESSAGE-----");
        expect(encrypted).toContain("-----END PGP MESSAGE-----");

        // Decrypt
        const decrypted = await nodePlatformAdapter.pgp.decrypt(
          encrypted,
          keyPair.privateKey,
        );

        expect(decrypted).toBe(data);
      }, 15000);
    });
  });

  describe("Cross-Platform Compatibility", () => {
    it("should decrypt browser-encrypted data in Node.js with same key", async () => {
      // Both platforms now use secp256k1, enabling cross-platform compatibility
      const data = "cross-platform test data";

      // Generate key pair with browser
      const keyPair = await browserPlatformAdapter.crypto.generateKeyPair();

      // Encrypt with browser
      const encrypted =
        await browserPlatformAdapter.crypto.encryptWithPublicKey(
          data,
          keyPair.publicKey,
        );

      // Decrypt with Node.js
      const decrypted = await nodePlatformAdapter.crypto.decryptWithPrivateKey(
        encrypted,
        keyPair.privateKey,
      );

      expect(decrypted).toBe(data);
    });

    it("should decrypt node-encrypted data in browser with same key", async () => {
      // Both platforms now use secp256k1, enabling cross-platform compatibility
      const data = "node-to-browser test data";

      // Generate key pair with Node.js
      const keyPair = await nodePlatformAdapter.crypto.generateKeyPair();

      // Encrypt with Node.js
      const encrypted = await nodePlatformAdapter.crypto.encryptWithPublicKey(
        data,
        keyPair.publicKey,
      );

      // Decrypt with browser
      const decrypted =
        await browserPlatformAdapter.crypto.decryptWithPrivateKey(
          encrypted,
          keyPair.privateKey,
        );

      expect(decrypted).toBe(data);
    });
  });
});
