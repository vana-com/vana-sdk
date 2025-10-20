import { describe, it, expect } from "vitest";
import { BrowserPlatformAdapter } from "../platform/browser";
import { NodePlatformAdapter } from "../platform/node";

/**
 * Final verification tests for the main requirement:
 * Browser-generated keys must be compatible with encryptWithWalletPublicKey
 */
describe("Wallet Crypto Compatibility - Primary Requirement", () => {
  it("should use browser-generated public key with encryptWithWalletPublicKey on browser platform", async () => {
    const browserAdapter = new BrowserPlatformAdapter();

    // Generate a key pair using browser adapter
    const keyPair = await browserAdapter.crypto.generateKeyPair();

    // Verify it's secp256k1 format (compressed public key)
    expect(keyPair.publicKey).toMatch(/^0[23][0-9a-fA-F]{64}$/);
    expect(keyPair.privateKey).toMatch(/^[0-9a-fA-F]{64}$/);

    const testMessage = "Browser-generated key working with wallet encryption!";

    // Use the browser-generated public key with encryptWithWalletPublicKey
    const encrypted = await browserAdapter.crypto.encryptWithWalletPublicKey(
      testMessage,
      keyPair.publicKey,
    );

    // Should be able to decrypt with the corresponding private key
    const decrypted = await browserAdapter.crypto.decryptWithWalletPrivateKey(
      encrypted,
      keyPair.privateKey,
    );

    expect(decrypted).toBe(testMessage);
  });

  it("should use browser-generated public key with encryptWithWalletPublicKey on node platform", async () => {
    const browserAdapter = new BrowserPlatformAdapter();
    const nodeAdapter = new NodePlatformAdapter();

    // Generate a key pair using browser adapter
    const keyPair = await browserAdapter.crypto.generateKeyPair();

    const testMessage = "Browser key with Node.js wallet encryption!";

    // CRITICAL TEST: Use browser-generated public key with Node.js encryptWithWalletPublicKey
    const encrypted = await nodeAdapter.crypto.encryptWithWalletPublicKey(
      testMessage,
      keyPair.publicKey,
    );

    // Should be able to decrypt with browser platform using the private key
    const decrypted = await browserAdapter.crypto.decryptWithWalletPrivateKey(
      encrypted,
      keyPair.privateKey,
    );

    expect(decrypted).toBe(testMessage);
  });

  it("should use node-generated public key with encryptWithWalletPublicKey on browser platform", async () => {
    const browserAdapter = new BrowserPlatformAdapter();
    const nodeAdapter = new NodePlatformAdapter();

    // Generate a key pair using node adapter
    const keyPair = await nodeAdapter.crypto.generateKeyPair();

    const testMessage = "Node key with browser wallet encryption!";

    // Use node-generated public key with browser encryptWithWalletPublicKey
    const encrypted = await browserAdapter.crypto.encryptWithWalletPublicKey(
      testMessage,
      keyPair.publicKey,
    );

    // Should be able to decrypt with node platform using the private key
    const decrypted = await nodeAdapter.crypto.decryptWithWalletPrivateKey(
      encrypted,
      keyPair.privateKey,
    );

    expect(decrypted).toBe(testMessage);
  });

  it("should generate identical key format across platforms", async () => {
    const browserAdapter = new BrowserPlatformAdapter();
    const nodeAdapter = new NodePlatformAdapter();

    // Generate multiple keys from both platforms
    const browserKeys = await Promise.all([
      browserAdapter.crypto.generateKeyPair(),
      browserAdapter.crypto.generateKeyPair(),
      browserAdapter.crypto.generateKeyPair(),
    ]);

    const nodeKeys = await Promise.all([
      nodeAdapter.crypto.generateKeyPair(),
      nodeAdapter.crypto.generateKeyPair(),
      nodeAdapter.crypto.generateKeyPair(),
    ]);

    // All keys should follow secp256k1 format
    const allKeys = [...browserKeys, ...nodeKeys];

    for (const keyPair of allKeys) {
      // Compressed public key format: 02 or 03 prefix + 32 bytes (64 hex chars)
      expect(keyPair.publicKey).toMatch(/^0[23][0-9a-fA-F]{64}$/);
      expect(keyPair.publicKey).toHaveLength(66);

      // Private key: 32 bytes (64 hex chars)
      expect(keyPair.privateKey).toMatch(/^[0-9a-fA-F]{64}$/);
      expect(keyPair.privateKey).toHaveLength(64);
    }

    // Verify keys are unique
    const publicKeys = allKeys.map((k) => k.publicKey);
    const uniquePublicKeys = new Set(publicKeys);
    expect(uniquePublicKeys.size).toBe(publicKeys.length);
  });

  it("should maintain backward compatibility with existing wallet workflows", async () => {
    const browserAdapter = new BrowserPlatformAdapter();
    const nodeAdapter = new NodePlatformAdapter();

    // Simulate the workflow described in the requirements:
    // 1. Browser generates a key pair
    // 2. Public key is shared for encryption (could be on server)
    // 3. Data is encrypted with that public key
    // 4. Encrypted data is sent back to browser for decryption

    const userKeyPair = await browserAdapter.crypto.generateKeyPair();
    const sensitiveUserData = "Personal banking information: Account #12345";

    // Server-side encryption (using Node.js platform)
    const encryptedByServer =
      await nodeAdapter.crypto.encryptWithWalletPublicKey(
        sensitiveUserData,
        userKeyPair.publicKey,
      );

    // Client-side decryption (using browser platform)
    const decryptedByClient =
      await browserAdapter.crypto.decryptWithWalletPrivateKey(
        encryptedByServer,
        userKeyPair.privateKey,
      );

    expect(decryptedByClient).toBe(sensitiveUserData);

    // Reverse workflow: Browser encrypts, server decrypts
    const anotherMessage = "Data for server processing";
    const encryptedByBrowser =
      await browserAdapter.crypto.encryptWithWalletPublicKey(
        anotherMessage,
        userKeyPair.publicKey,
      );

    const decryptedByServer =
      await nodeAdapter.crypto.decryptWithWalletPrivateKey(
        encryptedByBrowser,
        userKeyPair.privateKey,
      );

    expect(decryptedByServer).toBe(anotherMessage);
  });

  it("should handle complex data types in cross-platform encryption", async () => {
    const browserAdapter = new BrowserPlatformAdapter();
    const nodeAdapter = new NodePlatformAdapter();

    const browserKeyPair = await browserAdapter.crypto.generateKeyPair();

    // Test various data types
    const testCases = [
      { name: "simple string", data: "Hello World" },
      { name: "empty string", data: "" },
      { name: "unicode", data: "🔐 Secure Data 🌍" },
      {
        name: "json",
        data: JSON.stringify({ userId: 123, permissions: ["read", "write"] }),
      },
      { name: "large text", data: "A".repeat(10000) },
      { name: "special chars", data: "!@#$%^&*()_+-=[]{}|;':\",./<>?" },
      { name: "multiline", data: "Line 1\nLine 2\r\nLine 3\tTabbed" },
    ];

    for (const testCase of testCases) {
      // Browser encrypt, Node decrypt
      const encryptedByBrowser =
        await browserAdapter.crypto.encryptWithWalletPublicKey(
          testCase.data,
          browserKeyPair.publicKey,
        );

      const decryptedByNode =
        await nodeAdapter.crypto.decryptWithWalletPrivateKey(
          encryptedByBrowser,
          browserKeyPair.privateKey,
        );

      expect(decryptedByNode).toBe(testCase.data);

      // Node encrypt, Browser decrypt
      const encryptedByNode =
        await nodeAdapter.crypto.encryptWithWalletPublicKey(
          testCase.data,
          browserKeyPair.publicKey,
        );

      const decryptedByBrowser =
        await browserAdapter.crypto.decryptWithWalletPrivateKey(
          encryptedByNode,
          browserKeyPair.privateKey,
        );

      expect(decryptedByBrowser).toBe(testCase.data);
    }
  });
});
