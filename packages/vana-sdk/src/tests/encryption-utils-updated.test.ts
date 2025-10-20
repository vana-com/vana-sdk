import { describe, it, expect } from "vitest";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import {
  encryptWithWalletPublicKey,
  decryptWithWalletPrivateKey,
  encryptBlobWithSignedKey,
  decryptBlobWithSignedKey,
} from "../utils/encryption";

/**
 * Tests for updated encryption utilities with auto-platform detection
 */

describe("Updated Encryption Utilities", () => {
  const testPrivateKey =
    "85271071a553feafb93839045545c233d0518e0b0fc583f88038f8b0e32e9f18";
  const testPublicKey =
    "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";
  const testWalletSignature =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  describe("Platform-aware encryption", () => {
    describe("Wallet-based encryption", () => {
      it("should encrypt/decrypt with wallet keys using auto-detected platform", async () => {
        const testData = "secret message for wallet encryption";

        const encrypted = await encryptWithWalletPublicKey(
          testData,
          testPublicKey,
          mockPlatformAdapter,
        );
        expect(typeof encrypted).toBe("string");
        expect(encrypted).toMatch(/^[0-9a-fA-F]+$/); // Should be hex string

        const decrypted = await decryptWithWalletPrivateKey(
          encrypted,
          testPrivateKey,
          mockPlatformAdapter,
        );
        expect(decrypted).toBe(testData);
      });

      it("should handle Blob input for wallet encryption", async () => {
        const testData = new Blob(["test blob data"], { type: "text/plain" });

        const encrypted = await encryptWithWalletPublicKey(
          testData,
          testPublicKey,
          mockPlatformAdapter,
        );
        expect(typeof encrypted).toBe("string");

        const decrypted = await decryptWithWalletPrivateKey(
          encrypted,
          testPrivateKey,
          mockPlatformAdapter,
        );
        expect(decrypted).toBe("test blob data");
      });
    });

    describe("Password-based encryption", () => {
      it("should encrypt/decrypt user data using auto-detected platform", async () => {
        const testData = "secret user data for PGP encryption";

        const encrypted = await encryptBlobWithSignedKey(
          testData,
          testWalletSignature,
          mockPlatformAdapter,
        );
        expect(encrypted).toBeInstanceOf(Blob);
        expect(encrypted.type).toBe("application/octet-stream");

        const decrypted = await decryptBlobWithSignedKey(
          encrypted,
          testWalletSignature,
          mockPlatformAdapter,
        );
        expect(decrypted).toBeInstanceOf(Blob);
        expect(decrypted.type).toBe("text/plain");

        const decryptedText = await decrypted.text();
        expect(decryptedText).toBe(testData);
      });

      it("should handle Blob input for user data encryption", async () => {
        const testData = new Blob(["blob user data"], {
          type: "application/json",
        });

        const encrypted = await encryptBlobWithSignedKey(
          testData,
          testWalletSignature,
          mockPlatformAdapter,
        );
        expect(encrypted).toBeInstanceOf(Blob);

        const decrypted = await decryptBlobWithSignedKey(
          encrypted,
          testWalletSignature,
          mockPlatformAdapter,
        );
        const decryptedText = await decrypted.text();
        expect(decryptedText).toBe("blob user data");
      });
    });
  });
});
