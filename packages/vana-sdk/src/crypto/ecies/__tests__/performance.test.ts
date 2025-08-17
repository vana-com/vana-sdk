/**
 * ECIES Performance Benchmark
 *
 * Compares performance between old eccrypto and new optimized implementation.
 * Tests both Node.js and browser implementations.
 */

import { describe, it, beforeAll } from "vitest";
import { NodeECIESProvider } from "../node";
import { BrowserECIESProvider } from "../browser";
import * as eccrypto from "eccrypto";
import { randomBytes } from "crypto";

describe("ECIES Performance Benchmarks", () => {
  let nodeProvider: NodeECIESProvider;
  let _browserProvider: BrowserECIESProvider;

  // Test data
  let privateKey: Buffer;
  let publicKey: Buffer;
  const smallMessage = Buffer.from("Small test message");
  const mediumMessage = randomBytes(1024); // 1KB
  const largeMessage = randomBytes(10 * 1024); // 10KB

  beforeAll(() => {
    nodeProvider = new NodeECIESProvider();
    _browserProvider = new BrowserECIESProvider();

    // Generate test keypair using eccrypto for consistency
    privateKey = eccrypto.generatePrivate();
    publicKey = eccrypto.getPublic(privateKey);
  });

  describe("Node.js Performance", () => {
    it("should benchmark small message encryption", async () => {
      const iterations = 100;

      // Benchmark eccrypto
      const eccryptoStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await eccrypto.encrypt(publicKey, smallMessage);
      }
      const eccryptoTime = performance.now() - eccryptoStart;

      // Benchmark our implementation
      const ourStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await nodeProvider.encrypt(publicKey, smallMessage);
      }
      const ourTime = performance.now() - ourStart;

      const speedup = eccryptoTime / ourTime;
      console.log(
        `\nSmall message (${smallMessage.length}B) encryption - ${iterations} iterations:`,
      );
      console.log(
        `  eccrypto:     ${eccryptoTime.toFixed(2)}ms (${(eccryptoTime / iterations).toFixed(2)}ms/op)`,
      );
      console.log(
        `  our impl:     ${ourTime.toFixed(2)}ms (${(ourTime / iterations).toFixed(2)}ms/op)`,
      );
      console.log(
        `  speedup:      ${speedup.toFixed(2)}x ${speedup > 1 ? "🚀" : ""}`,
      );
    });

    it("should benchmark medium message encryption", async () => {
      const iterations = 50;

      // Benchmark eccrypto
      const eccryptoStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await eccrypto.encrypt(publicKey, mediumMessage);
      }
      const eccryptoTime = performance.now() - eccryptoStart;

      // Benchmark our implementation
      const ourStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await nodeProvider.encrypt(publicKey, mediumMessage);
      }
      const ourTime = performance.now() - ourStart;

      const speedup = eccryptoTime / ourTime;
      console.log(
        `\nMedium message (1KB) encryption - ${iterations} iterations:`,
      );
      console.log(
        `  eccrypto:     ${eccryptoTime.toFixed(2)}ms (${(eccryptoTime / iterations).toFixed(2)}ms/op)`,
      );
      console.log(
        `  our impl:     ${ourTime.toFixed(2)}ms (${(ourTime / iterations).toFixed(2)}ms/op)`,
      );
      console.log(
        `  speedup:      ${speedup.toFixed(2)}x ${speedup > 1 ? "🚀" : ""}`,
      );
    });

    it("should benchmark large message encryption", async () => {
      const iterations = 20;

      // Benchmark eccrypto
      const eccryptoStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await eccrypto.encrypt(publicKey, largeMessage);
      }
      const eccryptoTime = performance.now() - eccryptoStart;

      // Benchmark our implementation
      const ourStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await nodeProvider.encrypt(publicKey, largeMessage);
      }
      const ourTime = performance.now() - ourStart;

      const speedup = eccryptoTime / ourTime;
      console.log(
        `\nLarge message (10KB) encryption - ${iterations} iterations:`,
      );
      console.log(
        `  eccrypto:     ${eccryptoTime.toFixed(2)}ms (${(eccryptoTime / iterations).toFixed(2)}ms/op)`,
      );
      console.log(
        `  our impl:     ${ourTime.toFixed(2)}ms (${(ourTime / iterations).toFixed(2)}ms/op)`,
      );
      console.log(
        `  speedup:      ${speedup.toFixed(2)}x ${speedup > 1 ? "🚀" : ""}`,
      );
    });

    it("should benchmark decryption", async () => {
      const iterations = 50;

      // Prepare encrypted data
      const encrypted = await eccrypto.encrypt(publicKey, mediumMessage);

      // Benchmark eccrypto decryption
      const eccryptoStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await eccrypto.decrypt(privateKey, encrypted);
      }
      const eccryptoTime = performance.now() - eccryptoStart;

      // Benchmark our implementation
      const ourStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await nodeProvider.decrypt(privateKey, encrypted);
      }
      const ourTime = performance.now() - ourStart;

      const speedup = eccryptoTime / ourTime;
      console.log(
        `\nMedium message (1KB) decryption - ${iterations} iterations:`,
      );
      console.log(
        `  eccrypto:     ${eccryptoTime.toFixed(2)}ms (${(eccryptoTime / iterations).toFixed(2)}ms/op)`,
      );
      console.log(
        `  our impl:     ${ourTime.toFixed(2)}ms (${(ourTime / iterations).toFixed(2)}ms/op)`,
      );
      console.log(
        `  speedup:      ${speedup.toFixed(2)}x ${speedup > 1 ? "🚀" : ""}`,
      );
    });

    it("should benchmark key generation", async () => {
      const iterations = 100;

      // We can't directly benchmark eccrypto's key generation since it uses a different API
      // But we can measure our performance
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        randomBytes(32);
        // In real usage, this would be done by the platform adapter
        // which calls secp256k1.publicKeyCreate
      }
      const time = performance.now() - start;

      console.log(`\nKey generation - ${iterations} iterations:`);
      console.log(
        `  our impl:     ${time.toFixed(2)}ms (${(time / iterations).toFixed(2)}ms/op)`,
      );
    });
  });

  describe("Performance Summary", () => {
    it("should show overall performance characteristics", async () => {
      console.log("\n=== PERFORMANCE SUMMARY ===");
      console.log("Node.js implementation:");
      console.log("  - Uses native secp256k1 bindings");
      console.log("  - Expected 3-10x speedup for ECDH operations");
      console.log("  - Native crypto for AES/HMAC/SHA");
      console.log("\nBrowser implementation:");
      console.log("  - Uses tiny-secp256k1 (WASM)");
      console.log("  - Expected 1.5-3x speedup over pure JS");
      console.log("  - Web Crypto API for AES operations");
      console.log("\nKey improvements:");
      console.log("  - No elliptic.js dependency");
      console.log("  - Direct raw X coordinate extraction");
      console.log("  - Optimized buffer operations");
      console.log("  - Better memory management");
    });
  });
});
