import { describe, it, expect } from "vitest";
import { NodeECIESUint8Provider } from "../node";
import { BrowserECIESUint8Provider } from "../browser";

describe("ECIES Provider Public Key Normalization", () => {
  // Test both providers
  const providers = [
    { name: "NodeECIESUint8Provider", Provider: NodeECIESUint8Provider },
    { name: "BrowserECIESUint8Provider", Provider: BrowserECIESUint8Provider },
  ];

  providers.forEach(({ name, Provider }) => {
    describe(name, () => {
      const provider = new Provider();

      describe("normalizeToUncompressed", () => {
        it("returns already uncompressed key as-is", () => {
          const uncompressed = new Uint8Array(65);
          uncompressed[0] = 0x04;
          uncompressed.fill(42, 1);

          const result = provider.normalizeToUncompressed(uncompressed);
          expect(result).toBe(uncompressed); // Same reference
          expect(result.length).toBe(65);
          expect(result[0]).toBe(0x04);
        });

        it("rejects 64-byte raw coordinates (strict policy)", () => {
          const rawCoords = new Uint8Array(64);
          rawCoords.fill(42);

          expect(() => provider.normalizeToUncompressed(rawCoords)).toThrow(
            "Raw public key coordinates (64 bytes) are not accepted",
          );
        });

        it("rejects invalid lengths", () => {
          const tooShort = new Uint8Array(32);
          const tooLong = new Uint8Array(100);

          expect(() => provider.normalizeToUncompressed(tooShort)).toThrow(
            "Invalid public key format: expected compressed (33 bytes) or uncompressed (65 bytes), got 32 bytes",
          );

          expect(() => provider.normalizeToUncompressed(tooLong)).toThrow(
            "Invalid public key format: expected compressed (33 bytes) or uncompressed (65 bytes), got 100 bytes",
          );
        });

        it("rejects invalid uncompressed prefix", () => {
          const invalidPrefix = new Uint8Array(65);
          invalidPrefix[0] = 0x05; // Invalid prefix
          invalidPrefix.fill(42, 1);

          expect(() => provider.normalizeToUncompressed(invalidPrefix)).toThrow(
            "Invalid public key format",
          );
        });

        it("decompresses valid compressed key with 0x02 prefix", async () => {
          // Use a known valid compressed public key
          // This is the compressed form of a test key
          const compressed = new Uint8Array([
            0x02, // Compressed prefix for even Y
            0x79,
            0xbe,
            0x66,
            0x7e,
            0xf9,
            0xdc,
            0xbb,
            0xac,
            0x55,
            0xa0,
            0x62,
            0x95,
            0xce,
            0x87,
            0x0b,
            0x07,
            0x02,
            0x9b,
            0xfc,
            0xdb,
            0x2d,
            0xce,
            0x28,
            0xd9,
            0x59,
            0xf2,
            0x81,
            0x5b,
            0x16,
            0xf8,
            0x17,
            0x98,
          ]);

          const result = provider.normalizeToUncompressed(compressed);
          expect(result.length).toBe(65);
          expect(result[0]).toBe(0x04);
        });

        it("decompresses valid compressed key with 0x03 prefix", async () => {
          // Use a known valid compressed public key
          // This is the compressed form of a test key
          const compressed = new Uint8Array([
            0x03, // Compressed prefix for odd Y
            0x79,
            0xbe,
            0x66,
            0x7e,
            0xf9,
            0xdc,
            0xbb,
            0xac,
            0x55,
            0xa0,
            0x62,
            0x95,
            0xce,
            0x87,
            0x0b,
            0x07,
            0x02,
            0x9b,
            0xfc,
            0xdb,
            0x2d,
            0xce,
            0x28,
            0xd9,
            0x59,
            0xf2,
            0x81,
            0x5b,
            0x16,
            0xf8,
            0x17,
            0x98,
          ]);

          const result = provider.normalizeToUncompressed(compressed);
          expect(result.length).toBe(65);
          expect(result[0]).toBe(0x04);
        });

        it("throws for invalid compressed key", () => {
          const invalidCompressed = new Uint8Array(33);
          invalidCompressed[0] = 0x02;
          // Fill with invalid curve point
          invalidCompressed.fill(0xff, 1);

          expect(() =>
            provider.normalizeToUncompressed(invalidCompressed),
          ).toThrow("Failed to decompress public key");
        });

        it("rejects compressed key with invalid prefix", () => {
          const invalidPrefix = new Uint8Array(33);
          invalidPrefix[0] = 0x04; // Wrong prefix for compressed
          invalidPrefix.fill(42, 1);

          expect(() => provider.normalizeToUncompressed(invalidPrefix)).toThrow(
            "Invalid public key format",
          );
        });
      });
    });
  });
});
