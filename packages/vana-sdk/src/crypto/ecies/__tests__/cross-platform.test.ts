/**
 * Cross-Platform ECIES Integration Tests
 *
 * Ensures that data encrypted by one implementation can be decrypted by another.
 * This verifies format compatibility across Node.js and Browser implementations.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { NodeECIESProvider } from "../node";
import { BrowserECIESProvider } from "../browser";
import * as eccrypto from "eccrypto";
import { randomBytes } from "crypto";
import type { ECIESEncrypted } from "../interface";

describe("Cross-Platform ECIES Compatibility", () => {
  let nodeProvider: NodeECIESProvider;
  let browserProvider: BrowserECIESProvider;

  // Test keypairs
  let privateKey1: Buffer;
  let publicKey1: Buffer;
  let privateKey2: Buffer;
  let publicKey2: Buffer;

  // Test messages
  const testMessages = [
    Buffer.from("Hello World"),
    Buffer.from(""), // Empty message
    Buffer.from("🚀 Unicode test 测试 テスト"),
    randomBytes(100), // Binary data
    randomBytes(1024), // 1KB
    randomBytes(10 * 1024), // 10KB
  ];

  beforeAll(() => {
    nodeProvider = new NodeECIESProvider();
    browserProvider = new BrowserECIESProvider();

    // Generate test keypairs
    privateKey1 = eccrypto.generatePrivate();
    publicKey1 = eccrypto.getPublic(privateKey1);
    privateKey2 = eccrypto.generatePrivate();
    publicKey2 = eccrypto.getPublic(privateKey2);
  });

  describe("Node -> Browser Compatibility", () => {
    it("should decrypt Node-encrypted data in Browser implementation", async () => {
      for (const message of testMessages) {
        // Encrypt with Node
        const encrypted = await nodeProvider.encrypt(publicKey1, message);

        // Decrypt with Browser
        const decrypted = await browserProvider.decrypt(privateKey1, encrypted);

        expect(decrypted).toEqual(message);
      }
    });

    it("should handle compressed public keys", async () => {
      const compressedKey = eccrypto.getPublicCompressed(privateKey1);
      const message = Buffer.from("Compressed key test");

      // Encrypt with Node using compressed key
      const encrypted = await nodeProvider.encrypt(compressedKey, message);

      // Decrypt with Browser
      const decrypted = await browserProvider.decrypt(privateKey1, encrypted);

      expect(decrypted).toEqual(message);
    });
  });

  describe("Browser -> Node Compatibility", () => {
    it("should decrypt Browser-encrypted data in Node implementation", async () => {
      for (const message of testMessages) {
        // Encrypt with Browser
        const encrypted = await browserProvider.encrypt(publicKey2, message);

        // Decrypt with Node
        const decrypted = await nodeProvider.decrypt(privateKey2, encrypted);

        expect(decrypted).toEqual(message);
      }
    });

    it("should handle compressed public keys", async () => {
      const compressedKey = eccrypto.getPublicCompressed(privateKey2);
      const message = Buffer.from("Compressed key test");

      // Encrypt with Browser using compressed key
      const encrypted = await browserProvider.encrypt(compressedKey, message);

      // Decrypt with Node
      const decrypted = await nodeProvider.decrypt(privateKey2, encrypted);

      expect(decrypted).toEqual(message);
    });
  });

  describe("eccrypto Compatibility", () => {
    it("should decrypt eccrypto-encrypted data with both implementations", async () => {
      const message = Buffer.from("eccrypto compatibility test");

      // Encrypt with eccrypto
      const encrypted = await eccrypto.encrypt(publicKey1, message);

      // Decrypt with Node
      const decryptedNode = await nodeProvider.decrypt(privateKey1, encrypted);
      expect(decryptedNode).toEqual(message);

      // Decrypt with Browser
      const decryptedBrowser = await browserProvider.decrypt(
        privateKey1,
        encrypted,
      );
      expect(decryptedBrowser).toEqual(message);
    });

    it("should produce eccrypto-compatible encrypted data", async () => {
      const message = Buffer.from("Reverse compatibility test");

      // Encrypt with Node
      const encryptedNode = await nodeProvider.encrypt(publicKey1, message);

      // Decrypt with eccrypto
      const decryptedFromNode = await eccrypto.decrypt(
        privateKey1,
        encryptedNode,
      );
      expect(decryptedFromNode).toEqual(message);

      // Encrypt with Browser
      const encryptedBrowser = await browserProvider.encrypt(
        publicKey1,
        message,
      );

      // Decrypt with eccrypto
      const decryptedFromBrowser = await eccrypto.decrypt(
        privateKey1,
        encryptedBrowser,
      );
      expect(decryptedFromBrowser).toEqual(message);
    });
  });

  describe("Error Handling Consistency", () => {
    it("should handle invalid keys consistently across platforms", async () => {
      const invalidKey = Buffer.alloc(32); // All zeros - invalid private key
      const message = Buffer.from("test");

      // Both should reject with same error type
      await expect(
        nodeProvider
          .encrypt(publicKey1, message)
          .then((encrypted) => nodeProvider.decrypt(invalidKey, encrypted)),
      ).rejects.toThrow("Invalid private key");

      await expect(
        browserProvider
          .encrypt(publicKey1, message)
          .then((encrypted) => browserProvider.decrypt(invalidKey, encrypted)),
      ).rejects.toThrow("Invalid private key");
    });

    it("should handle MAC mismatches consistently", async () => {
      const message = Buffer.from("MAC test");

      // Encrypt with Node
      const encrypted = await nodeProvider.encrypt(publicKey1, message);

      // Tamper with ciphertext
      const tampered: ECIESEncrypted = {
        ...encrypted,
        ciphertext: Buffer.concat([encrypted.ciphertext, Buffer.from([1])]),
      };

      // Both should reject with MAC mismatch
      await expect(nodeProvider.decrypt(privateKey1, tampered)).rejects.toThrow(
        "MAC verification failed",
      );

      await expect(
        browserProvider.decrypt(privateKey1, tampered),
      ).rejects.toThrow("MAC verification failed");
    });
  });

  describe("Edge Cases", () => {
    it("should handle maximum message sizes", async () => {
      // Test with a very large message (100KB)
      const largeMessage = randomBytes(100 * 1024);

      // Node -> Browser
      const encryptedNode = await nodeProvider.encrypt(
        publicKey1,
        largeMessage,
      );
      const decryptedBrowser = await browserProvider.decrypt(
        privateKey1,
        encryptedNode,
      );
      expect(decryptedBrowser).toEqual(largeMessage);

      // Browser -> Node
      const encryptedBrowser = await browserProvider.encrypt(
        publicKey1,
        largeMessage,
      );
      const decryptedNode = await nodeProvider.decrypt(
        privateKey1,
        encryptedBrowser,
      );
      expect(decryptedNode).toEqual(largeMessage);
    });

    it("should handle empty messages", async () => {
      const emptyMessage = Buffer.from("");

      // Test all combinations
      const encryptedNode = await nodeProvider.encrypt(
        publicKey1,
        emptyMessage,
      );
      expect(await browserProvider.decrypt(privateKey1, encryptedNode)).toEqual(
        emptyMessage,
      );

      const encryptedBrowser = await browserProvider.encrypt(
        publicKey1,
        emptyMessage,
      );
      expect(await nodeProvider.decrypt(privateKey1, encryptedBrowser)).toEqual(
        emptyMessage,
      );
    });

    it("should handle multiple encryptions of same message differently", async () => {
      const message = Buffer.from("Randomness test");

      // Multiple encryptions should produce different ciphertexts (due to random IV/ephemeral key)
      const encrypted1 = await nodeProvider.encrypt(publicKey1, message);
      const encrypted2 = await nodeProvider.encrypt(publicKey1, message);

      expect(encrypted1.iv).not.toEqual(encrypted2.iv);
      expect(encrypted1.ephemPublicKey).not.toEqual(encrypted2.ephemPublicKey);
      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);

      // But both should decrypt to same message
      expect(await nodeProvider.decrypt(privateKey1, encrypted1)).toEqual(
        message,
      );
      expect(await nodeProvider.decrypt(privateKey1, encrypted2)).toEqual(
        message,
      );
    });
  });

  describe("Performance Characteristics", () => {
    it("should maintain consistent encryption times across message sizes", async () => {
      const sizes = [100, 1000, 10000, 50000];
      const times: { size: number; node: number; browser: number }[] = [];

      for (const size of sizes) {
        const message = randomBytes(size);

        // Measure Node encryption time
        const nodeStart = performance.now();
        await nodeProvider.encrypt(publicKey1, message);
        const nodeTime = performance.now() - nodeStart;

        // Measure Browser encryption time
        const browserStart = performance.now();
        await browserProvider.encrypt(publicKey1, message);
        const browserTime = performance.now() - browserStart;

        times.push({ size, node: nodeTime, browser: browserTime });
      }

      // Log performance characteristics for analysis
      console.log("\nEncryption time by message size:");
      times.forEach(({ size, node, browser }) => {
        console.log(
          `  ${size}B: Node=${node.toFixed(2)}ms, Browser=${browser.toFixed(2)}ms`,
        );
      });

      // Verify times are reasonable (< 100ms for messages up to 50KB)
      times.forEach(({ node, browser }) => {
        expect(node).toBeLessThan(100);
        expect(browser).toBeLessThan(100);
      });
    });
  });
});
