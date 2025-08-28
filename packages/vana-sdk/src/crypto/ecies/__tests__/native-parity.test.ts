/**
 * Native secp256k1 Parity Tests
 *
 * Critical tests to ensure native secp256k1 produces identical results
 * to @noble/secp256k1, especially for ECDH operations.
 */

import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";

// Dynamically import to avoid issues during browser testing
const getProviders = async () => {
  const { NodeECIESUint8Provider } = await import("../node");
  const { BrowserECIESUint8Provider } = await import("../browser");
  return { NodeECIESUint8Provider, BrowserECIESUint8Provider };
};

// Helper to get secp256k1 modules
const getSecp256k1Modules = async () => {
  const native = await import("secp256k1");
  const noble = await import("@noble/secp256k1");
  return { native, noble };
};

describe("ECDH Native vs Noble Parity", () => {
  it("produces identical 32-byte X coordinate", async () => {
    const { native, noble } = await getSecp256k1Modules();

    // Generate test keys using native
    const privateKey = randomBytes(32);
    const publicKey = native.publicKeyCreate(privateKey, false);

    // Native secp256k1 with identity function
    const output = Buffer.alloc(32);
    native.ecdh(
      publicKey,
      privateKey,
      {
        hashfn: (x: Uint8Array, _y: Uint8Array, out?: Uint8Array) => {
          if (out) {
            out.set(x);
            return out;
          }
          return x;
        },
      },
      output,
    );

    // @noble/secp256k1 for comparison
    const nobleShared = noble.getSharedSecret(privateKey, publicKey, true);
    const nobleX = nobleShared.slice(1); // Remove 0x02/0x03 prefix

    // Must be byte-identical
    expect(Buffer.from(output)).toEqual(Buffer.from(nobleX));
    expect(output.length).toBe(32);
  });

  it("handles compressed and uncompressed keys identically", async () => {
    const { native, noble } = await getSecp256k1Modules();

    const privateKey = randomBytes(32);
    const compressedKey = native.publicKeyCreate(privateKey, true); // 33 bytes
    const uncompressedKey = native.publicKeyCreate(privateKey, false); // 65 bytes

    // Test with compressed key
    const output1 = Buffer.alloc(32);
    native.ecdh(
      compressedKey,
      privateKey,
      {
        hashfn: (x: Uint8Array, _y: Uint8Array, out?: Uint8Array) => {
          if (out) {
            out.set(x);
            return out;
          }
          return x;
        },
      },
      output1,
    );

    // Test with uncompressed key
    const output2 = Buffer.alloc(32);
    native.ecdh(
      uncompressedKey,
      privateKey,
      {
        hashfn: (x: Uint8Array, _y: Uint8Array, out?: Uint8Array) => {
          if (out) {
            out.set(x);
            return out;
          }
          return x;
        },
      },
      output2,
    );

    // Both should produce identical results
    expect(output1).toEqual(output2);

    // Compare with noble
    const nobleShared = noble.getSharedSecret(
      privateKey,
      uncompressedKey,
      true,
    );
    const nobleX = nobleShared.slice(1);

    expect(Buffer.from(output1)).toEqual(Buffer.from(nobleX));
  });
});

describe("Cross-Platform Encryption Parity", () => {
  it("encrypts with Node (native), decrypts with Browser (@noble)", async () => {
    const { NodeECIESUint8Provider, BrowserECIESUint8Provider } =
      await getProviders();
    const nodeProvider = new NodeECIESUint8Provider();
    const browserProvider = new BrowserECIESUint8Provider();

    const privateKey = randomBytes(32);
    const { native } = await getSecp256k1Modules();
    const publicKey = new Uint8Array(native.publicKeyCreate(privateKey, false));
    const message = new TextEncoder().encode("Cross-platform test message");

    // Encrypt with Node (native secp256k1)
    const encrypted = await nodeProvider.encrypt(publicKey, message);

    // Decrypt with Browser (@noble/secp256k1)
    const decrypted = await browserProvider.decrypt(
      new Uint8Array(privateKey),
      encrypted,
    );

    expect(decrypted).toEqual(message);
  });

  it("encrypts with Browser (@noble), decrypts with Node (native)", async () => {
    const { NodeECIESUint8Provider, BrowserECIESUint8Provider } =
      await getProviders();
    const nodeProvider = new NodeECIESUint8Provider();
    const browserProvider = new BrowserECIESUint8Provider();

    const privateKey = randomBytes(32);
    const { native } = await getSecp256k1Modules();
    const publicKey = new Uint8Array(native.publicKeyCreate(privateKey, false));
    const message = new TextEncoder().encode("Browser to Node test");

    // Encrypt with Browser (@noble/secp256k1)
    const encrypted = await browserProvider.encrypt(publicKey, message);

    // Decrypt with Node (native secp256k1)
    const decrypted = await nodeProvider.decrypt(
      new Uint8Array(privateKey),
      encrypted,
    );

    expect(decrypted).toEqual(message);
  });
});

describe("Public API Type Enforcement", () => {
  it("Node provider uses only Uint8Array in public API", async () => {
    const { NodeECIESUint8Provider } = await getProviders();
    const nodeProvider = new NodeECIESUint8Provider();

    const privateKey = new Uint8Array(randomBytes(32));
    const { native } = await getSecp256k1Modules();
    const publicKey = new Uint8Array(
      native.publicKeyCreate(Buffer.from(privateKey), false),
    );
    const message = new Uint8Array([1, 2, 3, 4, 5]);

    // Test encryption
    const encrypted = await nodeProvider.encrypt(publicKey, message);

    // All fields must be Uint8Array
    expect(encrypted.iv).toBeInstanceOf(Uint8Array);
    expect(encrypted.ephemPublicKey).toBeInstanceOf(Uint8Array);
    expect(encrypted.ciphertext).toBeInstanceOf(Uint8Array);
    expect(encrypted.mac).toBeInstanceOf(Uint8Array);

    // Test decryption
    const decrypted = await nodeProvider.decrypt(privateKey, encrypted);
    expect(decrypted).toBeInstanceOf(Uint8Array);
    expect(decrypted).toEqual(message);
  });

  it("has no Buffer methods in public interface", async () => {
    const { NodeECIESUint8Provider } = await getProviders();
    const nodeProvider = new NodeECIESUint8Provider();

    // Ensure Buffer helper methods don't exist
    // Type assertion to check for non-existent properties
    const providerWithBufferMethods = nodeProvider as unknown as {
      encryptWithBuffer?: unknown;
      decryptWithBuffer?: unknown;
    };
    expect(providerWithBufferMethods.encryptWithBuffer).toBeUndefined();
    expect(providerWithBufferMethods.decryptWithBuffer).toBeUndefined();
  });
});

describe("MAC Tampering Detection", () => {
  it("detects tampering in any component", async () => {
    const { NodeECIESUint8Provider, BrowserECIESUint8Provider } =
      await getProviders();
    const nodeProvider = new NodeECIESUint8Provider();
    const browserProvider = new BrowserECIESUint8Provider();

    const privateKey = new Uint8Array(randomBytes(32));
    const { native } = await getSecp256k1Modules();
    const publicKey = new Uint8Array(
      native.publicKeyCreate(Buffer.from(privateKey), false),
    );
    const message = new TextEncoder().encode("Integrity test");

    for (const encryptProvider of [nodeProvider, browserProvider]) {
      const encrypted = await encryptProvider.encrypt(publicKey, message);

      // Helper to flip a bit
      const flipBit = (data: Uint8Array, index: number): Uint8Array => {
        const copy = new Uint8Array(data);
        copy[index] ^= 0x01;
        return copy;
      };

      // Test tampering each component
      const components = ["iv", "ephemPublicKey", "ciphertext", "mac"] as const;

      for (const component of components) {
        const tampered = { ...encrypted };
        tampered[component] = flipBit(encrypted[component], 0);

        // Both providers must reject
        for (const decryptProvider of [nodeProvider, browserProvider]) {
          // When tampering ephemPublicKey at position 0, it may fail with invalid key error
          // before MAC check. Both are valid security behaviors.
          if (component === "ephemPublicKey") {
            await expect(
              decryptProvider.decrypt(privateKey, tampered),
            ).rejects.toThrow(); // Any error is acceptable for invalid key
          } else {
            await expect(
              decryptProvider.decrypt(privateKey, tampered),
            ).rejects.toThrow(/MAC/);
          }
        }
      }

      // Original must still decrypt
      const decrypted = await encryptProvider.decrypt(privateKey, encrypted);
      expect(decrypted).toEqual(message);
    }
  });
});

describe("Performance Benchmarking", () => {
  it("logs native secp256k1 performance metrics", async () => {
    const { NodeECIESUint8Provider } = await getProviders();
    const nodeProvider = new NodeECIESUint8Provider();

    const iterations = 50; // Reduced for test speed
    const privateKey = new Uint8Array(randomBytes(32));
    const { native } = await getSecp256k1Modules();
    const publicKey = new Uint8Array(
      native.publicKeyCreate(Buffer.from(privateKey), false),
    );
    const message = new Uint8Array(randomBytes(1024)); // 1KB

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const encrypted = await nodeProvider.encrypt(publicKey, message);
      await nodeProvider.decrypt(privateKey, encrypted);
    }
    const duration = performance.now() - start;

    const perOp = duration / (iterations * 2);
    console.log(
      `Native secp256k1 performance: ${perOp.toFixed(2)}ms per operation`,
    );
    console.log(
      `Total: ${duration.toFixed(0)}ms for ${iterations * 2} operations`,
    );

    // Log warning if slower than expected (but don't fail)
    if (perOp > 5) {
      console.warn(`Performance slower than expected: ${perOp.toFixed(2)}ms`);
    }

    // Always pass - this is just for logging
    expect(true).toBe(true);
  });
});
