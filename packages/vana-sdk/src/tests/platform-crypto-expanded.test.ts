import { describe, it, expect } from "vitest";
import { BrowserPlatformAdapter } from "../platform/browser";
import { NodePlatformAdapter } from "../platform/node";

/**
 * Tests for expanded platform adapter crypto interface
 * This ensures consistent abstraction usage across all encryption methods
 */

describe("Platform Adapter Crypto Interface Expansion", () => {
  describe("Browser Platform Adapter", () => {
    const browserAdapter = new BrowserPlatformAdapter();

    describe("Wallet-based encryption methods", () => {
      it("should provide encryptWithWalletPublicKey method", () => {
        expect(typeof browserAdapter.crypto.encryptWithWalletPublicKey).toBe(
          "function",
        );
      });

      it("should provide decryptWithWalletPrivateKey method", () => {
        expect(typeof browserAdapter.crypto.decryptWithWalletPrivateKey).toBe(
          "function",
        );
      });

      it("should encrypt data with wallet public key using ECDH", async () => {
        const testData = "secret signature";
        const publicKey =
          "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

        const encrypted =
          await browserAdapter.crypto.encryptWithWalletPublicKey(
            testData,
            publicKey,
          );
        expect(typeof encrypted).toBe("string");
        expect(encrypted).toMatch(/^[0-9a-fA-F]+$/); // Should be hex string
      });

      it("should round-trip encrypt/decrypt with wallet keys", async () => {
        const testData = "0x1234567890abcdef";
        const privateKey =
          "85271071a553feafb93839045545c233d0518e0b0fc583f88038f8b0e32e9f18";
        const publicKey =
          "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

        const encrypted =
          await browserAdapter.crypto.encryptWithWalletPublicKey(
            testData,
            publicKey,
          );
        const decrypted =
          await browserAdapter.crypto.decryptWithWalletPrivateKey(
            encrypted,
            privateKey,
          );

        expect(decrypted).toBe(testData);
      });
    });

    describe("Password-based encryption methods", () => {
      it("should provide encryptWithPassword method", () => {
        expect(typeof browserAdapter.crypto.encryptWithPassword).toBe(
          "function",
        );
      });

      it("should provide decryptWithPassword method", () => {
        expect(typeof browserAdapter.crypto.decryptWithPassword).toBe(
          "function",
        );
      });

      it("should encrypt data with password using PGP", async () => {
        const testData = new Uint8Array(Buffer.from("Hello Vana!"));
        const password =
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

        const encrypted = await browserAdapter.crypto.encryptWithPassword(
          testData,
          password,
        );
        expect(encrypted).toBeInstanceOf(Uint8Array);
        expect(encrypted.length).toBeGreaterThan(0);
      });

      it("should round-trip encrypt/decrypt with password", async () => {
        const originalText = "Hello Vana Platform Adapter!";
        const testData = new Uint8Array(Buffer.from(originalText));
        const password = "0xsignature123";

        const encrypted = await browserAdapter.crypto.encryptWithPassword(
          testData,
          password,
        );
        const decrypted = await browserAdapter.crypto.decryptWithPassword(
          encrypted,
          password,
        );

        const decryptedText = Buffer.from(decrypted).toString();
        expect(decryptedText).toBe(originalText);
      });
    });
  });

  describe("Node Platform Adapter", () => {
    const nodeAdapter = new NodePlatformAdapter();

    describe("Wallet-based encryption methods", () => {
      it("should provide encryptWithWalletPublicKey method", () => {
        expect(typeof nodeAdapter.crypto.encryptWithWalletPublicKey).toBe(
          "function",
        );
      });

      it("should provide decryptWithWalletPrivateKey method", () => {
        expect(typeof nodeAdapter.crypto.decryptWithWalletPrivateKey).toBe(
          "function",
        );
      });

      it("should encrypt data with wallet public key using Node.js crypto", async () => {
        const testData = "secret signature";
        const publicKey =
          "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

        const encrypted = await nodeAdapter.crypto.encryptWithWalletPublicKey(
          testData,
          publicKey,
        );
        expect(typeof encrypted).toBe("string");
        expect(encrypted).toMatch(/^[0-9a-fA-F]+$/); // Should be hex string
      });

      it("should round-trip encrypt/decrypt with wallet keys", async () => {
        const testData = "0x1234567890abcdef";
        const privateKey =
          "85271071a553feafb93839045545c233d0518e0b0fc583f88038f8b0e32e9f18";
        const publicKey =
          "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

        const encrypted = await nodeAdapter.crypto.encryptWithWalletPublicKey(
          testData,
          publicKey,
        );
        const decrypted = await nodeAdapter.crypto.decryptWithWalletPrivateKey(
          encrypted,
          privateKey,
        );

        expect(decrypted).toBe(testData);
      });
    });

    describe("Password-based encryption methods", () => {
      it("should provide encryptWithPassword method", () => {
        expect(typeof nodeAdapter.crypto.encryptWithPassword).toBe("function");
      });

      it("should provide decryptWithPassword method", () => {
        expect(typeof nodeAdapter.crypto.decryptWithPassword).toBe("function");
      });

      it("should encrypt data with password using Node.js PGP", async () => {
        const testData = new Uint8Array(Buffer.from("Hello Vana!"));
        const password =
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

        const encrypted = await nodeAdapter.crypto.encryptWithPassword(
          testData,
          password,
        );
        expect(encrypted).toBeInstanceOf(Uint8Array);
        expect(encrypted.length).toBeGreaterThan(0);
      });

      it("should round-trip encrypt/decrypt with password", async () => {
        const originalText = "Hello Vana Platform Adapter!";
        const testData = new Uint8Array(Buffer.from(originalText));
        const password = "0xsignature123";

        const encrypted = await nodeAdapter.crypto.encryptWithPassword(
          testData,
          password,
        );
        const decrypted = await nodeAdapter.crypto.decryptWithPassword(
          encrypted,
          password,
        );

        const decryptedText = Buffer.from(decrypted).toString();
        expect(decryptedText).toBe(originalText);
      });
    });
  });

  describe("Cross-platform compatibility", () => {
    it("should encrypt on browser and decrypt on node with wallet keys", async () => {
      const browserAdapter = new BrowserPlatformAdapter();
      const nodeAdapter = new NodePlatformAdapter();

      const testData = "cross-platform test";
      const privateKey =
        "85271071a553feafb93839045545c233d0518e0b0fc583f88038f8b0e32e9f18";
      const publicKey =
        "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

      // Encrypt on browser
      const encrypted = await browserAdapter.crypto.encryptWithWalletPublicKey(
        testData,
        publicKey,
      );

      // Decrypt on node
      const decrypted = await nodeAdapter.crypto.decryptWithWalletPrivateKey(
        encrypted,
        privateKey,
      );

      expect(decrypted).toBe(testData);
    });

    it("should encrypt on node and decrypt on browser with password", async () => {
      const browserAdapter = new BrowserPlatformAdapter();
      const nodeAdapter = new NodePlatformAdapter();

      const originalText = "cross-platform password test";
      const testData = new Uint8Array(Buffer.from(originalText));
      const password = "0xsignature123";

      // Encrypt on node
      const encrypted = await nodeAdapter.crypto.encryptWithPassword(
        testData,
        password,
      );

      // Decrypt on browser
      const decrypted = await browserAdapter.crypto.decryptWithPassword(
        encrypted,
        password,
      );

      const decryptedText = Buffer.from(decrypted).toString();
      expect(decryptedText).toBe(originalText);
    });
  });
});
