/**
 * ECIES Compatibility Test Suite
 *
 * Verifies that our new ECIES implementation is 100% compatible with eccrypto.
 * Uses pre-generated test vectors from eccrypto to ensure backward compatibility
 * with existing encrypted data in the Vana network.
 */

import { describe, it, expect } from "vitest";
import { NodeECIESUint8Provider } from "../node";
import { BrowserECIESUint8Provider } from "../browser";
import { eccryptoTestVectors, eccryptoFormat } from "./test-vectors";
import type { ECIESEncrypted } from "../interface";

describe("ECIES eccrypto Compatibility", () => {
  const nodeProvider = new NodeECIESUint8Provider();
  const browserProvider = new BrowserECIESUint8Provider();

  describe("Format Compatibility", () => {
    it("should match eccrypto format specifications", () => {
      expect(eccryptoFormat.ivLength).toBe(16);
      expect(eccryptoFormat.ephemPublicKeyLength).toBe(65);
      expect(eccryptoFormat.macLength).toBe(32);
    });
  });

  describe("Decryption Compatibility - Node Provider", () => {
    eccryptoTestVectors.forEach((vector) => {
      it(`should decrypt eccrypto encrypted data: ${vector.name}`, async () => {
        const privateKey = new Uint8Array(
          Buffer.from(vector.privateKey, "hex"),
        );
        const message = new Uint8Array(Buffer.from(vector.message, "hex"));

        const encrypted: ECIESEncrypted = {
          iv: new Uint8Array(Buffer.from(vector.encrypted.iv, "hex")),
          ephemPublicKey: new Uint8Array(
            Buffer.from(vector.encrypted.ephemPublicKey, "hex"),
          ),
          ciphertext: new Uint8Array(
            Buffer.from(vector.encrypted.ciphertext, "hex"),
          ),
          mac: new Uint8Array(Buffer.from(vector.encrypted.mac, "hex")),
        };

        const decrypted = await nodeProvider.decrypt(privateKey, encrypted);

        expect(decrypted).toEqual(message);
        if (vector.messageText) {
          expect(new TextDecoder().decode(decrypted)).toBe(vector.messageText);
        }
      });
    });
  });

  describe("Decryption Compatibility - Browser Provider", () => {
    eccryptoTestVectors.forEach((vector) => {
      it(`should decrypt eccrypto encrypted data: ${vector.name}`, async () => {
        const privateKey = new Uint8Array(
          Buffer.from(vector.privateKey, "hex"),
        );
        const message = new Uint8Array(Buffer.from(vector.message, "hex"));

        const encrypted: ECIESEncrypted = {
          iv: new Uint8Array(Buffer.from(vector.encrypted.iv, "hex")),
          ephemPublicKey: new Uint8Array(
            Buffer.from(vector.encrypted.ephemPublicKey, "hex"),
          ),
          ciphertext: new Uint8Array(
            Buffer.from(vector.encrypted.ciphertext, "hex"),
          ),
          mac: new Uint8Array(Buffer.from(vector.encrypted.mac, "hex")),
        };

        const decrypted = await browserProvider.decrypt(privateKey, encrypted);

        expect(decrypted).toEqual(message);
        if (vector.messageText) {
          expect(new TextDecoder().decode(decrypted)).toBe(vector.messageText);
        }
      });
    });
  });

  describe("Encryption Format Compatibility", () => {
    it("should produce eccrypto-compatible encrypted format", async () => {
      const privateKey = new Uint8Array(
        Buffer.from(
          "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          "hex",
        ),
      );
      const publicKey = new Uint8Array(
        Buffer.from(
          "04bb50e2d89a4ed70663d080659fe0ad4b9bc3e06c17a227433966cb59ceee020decddbf6e00192011648d13b1c00af770c0c1bb609d4d3a5c98a43772e0e18ef4",
          "hex",
        ),
      );
      const message = new TextEncoder().encode("Test message");

      const encrypted = await nodeProvider.encrypt(publicKey, message);

      // Check format matches eccrypto
      expect(encrypted.iv.length).toBe(eccryptoFormat.ivLength);
      expect(encrypted.ephemPublicKey.length).toBe(
        eccryptoFormat.ephemPublicKeyLength,
      );
      expect(encrypted.mac.length).toBe(eccryptoFormat.macLength);

      // Ensure we can decrypt our own encryption
      const decrypted = await nodeProvider.decrypt(privateKey, encrypted);
      expect(decrypted).toEqual(message);
    });
  });

  describe("Cross-provider Compatibility", () => {
    it("should decrypt Node-encrypted data with Browser provider", async () => {
      // Use test vector from eccrypto-vectors.json
      const privateKey = new Uint8Array(
        Buffer.from(
          "1878693c39d810ce44ee40f9fdd068a0414615e74a7ff58adaba74063b2402e4",
          "hex",
        ),
      );
      const publicKey = new Uint8Array(
        Buffer.from(
          "0486c0312c4609fc3d53c35cbd1b7af82c8900c056a0389e1697720e3b60284aa2996a6c16c9b65eeb830c9016c5ab49481a406c88666de95f8fc236d0cbb7bb79",
          "hex",
        ),
      );
      const message = new TextEncoder().encode("Cross-provider test");

      const encrypted = await nodeProvider.encrypt(publicKey, message);
      const decrypted = await browserProvider.decrypt(privateKey, encrypted);

      expect(decrypted).toEqual(message);
    });

    it("should decrypt Browser-encrypted data with Node provider", async () => {
      // Use another test vector from eccrypto-vectors.json
      const privateKey = new Uint8Array(
        Buffer.from(
          "21796c4692ba9d34b7f273c0099b96625e8dec49ada0390724d23dc35f4986d1",
          "hex",
        ),
      );
      const publicKey = new Uint8Array(
        Buffer.from(
          "04ab33f0e766d672f89c844633eb491e1ce75bce281423c11e1247503374e42f4b3877fab9a5b762ac78c8a639a0277d178280e580ffa992056b6d2ed3679f18ef",
          "hex",
        ),
      );
      const message = new TextEncoder().encode("Browser to Node test");

      const encrypted = await browserProvider.encrypt(publicKey, message);
      const decrypted = await nodeProvider.decrypt(privateKey, encrypted);

      expect(decrypted).toEqual(message);
    });
  });
});
