import { describe, it, expect } from "vitest";
import {
  encryptWithWalletPublicKey,
  decryptWithWalletPrivateKey,
  encryptUserData,
  decryptUserData,
} from "../utils/encryption";
import { BrowserPlatformAdapter } from "../platform/browser";
import { NodePlatformAdapter } from "../platform/node";

/**
 * Tests for updated encryption utilities that use platform adapter consistently
 */

describe("Updated Encryption Utilities", () => {
  const testPrivateKey =
    "85271071a553feafb93839045545c233d0518e0b0fc583f88038f8b0e32e9f18";
  const testPublicKey =
    "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";
  const testWalletSignature =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  describe("Browser Platform", () => {
    const browserAdapter = new BrowserPlatformAdapter();

    describe("Wallet-based encryption", () => {
      it("should encrypt/decrypt with wallet keys using platform adapter", async () => {
        const testData = "secret message for wallet encryption";

        const encrypted = await encryptWithWalletPublicKey(
          testData,
          testPublicKey,
          browserAdapter,
        );
        expect(typeof encrypted).toBe("string");
        expect(encrypted).toMatch(/^[0-9a-fA-F]+$/); // Should be hex string

        const decrypted = await decryptWithWalletPrivateKey(
          encrypted,
          testPrivateKey,
          browserAdapter,
        );
        expect(decrypted).toBe(testData);
      });

      it("should handle Blob input for wallet encryption", async () => {
        const testData = new Blob(["test blob data"], { type: "text/plain" });

        const encrypted = await encryptWithWalletPublicKey(
          testData,
          testPublicKey,
          browserAdapter,
        );
        expect(typeof encrypted).toBe("string");

        const decrypted = await decryptWithWalletPrivateKey(
          encrypted,
          testPrivateKey,
          browserAdapter,
        );
        expect(decrypted).toBe("test blob data");
      });
    });

    describe("Password-based encryption", () => {
      it("should encrypt/decrypt user data using platform adapter", async () => {
        const testData = "secret user data for PGP encryption";

        const encrypted = await encryptUserData(
          testData,
          testWalletSignature,
          browserAdapter,
        );
        expect(encrypted).toBeInstanceOf(Blob);
        expect(encrypted.type).toBe("application/octet-stream");

        const decrypted = await decryptUserData(
          encrypted,
          testWalletSignature,
          browserAdapter,
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

        const encrypted = await encryptUserData(
          testData,
          testWalletSignature,
          browserAdapter,
        );
        expect(encrypted).toBeInstanceOf(Blob);

        const decrypted = await decryptUserData(
          encrypted,
          testWalletSignature,
          browserAdapter,
        );
        const decryptedText = await decrypted.text();
        expect(decryptedText).toBe("blob user data");
      });
    });
  });

  describe("Node Platform", () => {
    const nodeAdapter = new NodePlatformAdapter();

    describe("Wallet-based encryption", () => {
      it("should encrypt/decrypt with wallet keys using platform adapter", async () => {
        const testData = "secret message for node wallet encryption";

        const encrypted = await encryptWithWalletPublicKey(
          testData,
          testPublicKey,
          nodeAdapter,
        );
        expect(typeof encrypted).toBe("string");
        expect(encrypted).toMatch(/^[0-9a-fA-F]+$/); // Should be hex string

        const decrypted = await decryptWithWalletPrivateKey(
          encrypted,
          testPrivateKey,
          nodeAdapter,
        );
        expect(decrypted).toBe(testData);
      });

      it("should handle Blob input for wallet encryption", async () => {
        const testData = new Blob(["node test blob data"], {
          type: "text/plain",
        });

        const encrypted = await encryptWithWalletPublicKey(
          testData,
          testPublicKey,
          nodeAdapter,
        );
        expect(typeof encrypted).toBe("string");

        const decrypted = await decryptWithWalletPrivateKey(
          encrypted,
          testPrivateKey,
          nodeAdapter,
        );
        expect(decrypted).toBe("node test blob data");
      });
    });

    describe("Password-based encryption", () => {
      it("should encrypt/decrypt user data using platform adapter", async () => {
        const testData = "secret node user data for PGP encryption";

        const encrypted = await encryptUserData(
          testData,
          testWalletSignature,
          nodeAdapter,
        );
        expect(encrypted).toBeInstanceOf(Blob);
        expect(encrypted.type).toBe("application/octet-stream");

        const decrypted = await decryptUserData(
          encrypted,
          testWalletSignature,
          nodeAdapter,
        );
        expect(decrypted).toBeInstanceOf(Blob);
        expect(decrypted.type).toBe("text/plain");

        const decryptedText = await decrypted.text();
        expect(decryptedText).toBe(testData);
      });

      it("should handle Blob input for user data encryption", async () => {
        const testData = new Blob(["node blob user data"], {
          type: "application/json",
        });

        const encrypted = await encryptUserData(
          testData,
          testWalletSignature,
          nodeAdapter,
        );
        expect(encrypted).toBeInstanceOf(Blob);

        const decrypted = await decryptUserData(
          encrypted,
          testWalletSignature,
          nodeAdapter,
        );
        const decryptedText = await decrypted.text();
        expect(decryptedText).toBe("node blob user data");
      });
    });
  });

  describe("Cross-platform compatibility", () => {
    const browserAdapter = new BrowserPlatformAdapter();
    const nodeAdapter = new NodePlatformAdapter();

    it("should encrypt on browser, decrypt on node (wallet)", async () => {
      const testData = "cross-platform wallet test";

      const encrypted = await encryptWithWalletPublicKey(
        testData,
        testPublicKey,
        browserAdapter,
      );
      const decrypted = await decryptWithWalletPrivateKey(
        encrypted,
        testPrivateKey,
        nodeAdapter,
      );

      expect(decrypted).toBe(testData);
    });

    it("should encrypt on node, decrypt on browser (wallet)", async () => {
      const testData = "reverse cross-platform wallet test";

      const encrypted = await encryptWithWalletPublicKey(
        testData,
        testPublicKey,
        nodeAdapter,
      );
      const decrypted = await decryptWithWalletPrivateKey(
        encrypted,
        testPrivateKey,
        browserAdapter,
      );

      expect(decrypted).toBe(testData);
    });

    it("should encrypt on browser, decrypt on node (password)", async () => {
      const testData = "cross-platform password test";

      const encrypted = await encryptUserData(
        testData,
        testWalletSignature,
        browserAdapter,
      );
      const decrypted = await decryptUserData(
        encrypted,
        testWalletSignature,
        nodeAdapter,
      );
      const decryptedText = await decrypted.text();

      expect(decryptedText).toBe(testData);
    });

    it("should encrypt on node, decrypt on browser (password)", async () => {
      const testData = "reverse cross-platform password test";

      const encrypted = await encryptUserData(
        testData,
        testWalletSignature,
        nodeAdapter,
      );
      const decrypted = await decryptUserData(
        encrypted,
        testWalletSignature,
        browserAdapter,
      );
      const decryptedText = await decrypted.text();

      expect(decryptedText).toBe(testData);
    });
  });
});
