/**
 * ECIES Serialization Test Suite
 *
 * Tests for serializeECIES and deserializeECIES functions to ensure
 * proper validation and error handling, especially for security-critical
 * prefix validation and truncated data handling.
 */

import { describe, it, expect } from "vitest";
import {
  serializeECIES,
  deserializeECIES,
  ECIESError,
  type ECIESEncrypted,
} from "../interface";
import { CURVE } from "../constants";

describe("ECIES Serialization", () => {
  describe("serializeECIES", () => {
    it("should serialize valid encrypted data with uncompressed ephemeral key", () => {
      const encrypted: ECIESEncrypted = {
        iv: new Uint8Array(16).fill(0x01),
        ephemPublicKey: new Uint8Array(65).fill(0x02),
        ciphertext: new Uint8Array(32).fill(0x03),
        mac: new Uint8Array(32).fill(0x04),
      };
      encrypted.ephemPublicKey[0] = CURVE.PREFIX.UNCOMPRESSED;

      const hex = serializeECIES(encrypted);

      expect(hex).toBeDefined();
      expect(hex).toMatch(/^[0-9a-f]+$/); // Valid hex string without 0x prefix
      expect(hex.length).toBe((16 + 65 + 32 + 32) * 2); // Each byte = 2 hex chars
    });

    it("should serialize valid encrypted data with compressed ephemeral key", () => {
      const encrypted: ECIESEncrypted = {
        iv: new Uint8Array(16).fill(0x01),
        ephemPublicKey: new Uint8Array(33).fill(0x02),
        ciphertext: new Uint8Array(32).fill(0x03),
        mac: new Uint8Array(32).fill(0x04),
      };
      encrypted.ephemPublicKey[0] = CURVE.PREFIX.COMPRESSED_EVEN;

      const hex = serializeECIES(encrypted);

      expect(hex).toBeDefined();
      expect(hex).toMatch(/^[0-9a-f]+$/);
      expect(hex.length).toBe((16 + 33 + 32 + 32) * 2);
    });
  });

  describe("deserializeECIES", () => {
    describe("valid inputs", () => {
      it("should deserialize data with uncompressed ephemeral key (0x04 prefix)", () => {
        // Create valid serialized data: IV(16) + ephemPubKey(65) + ciphertext(32) + MAC(32)
        const iv = new Uint8Array(16).fill(0x01);
        const ephemPubKey = new Uint8Array(65).fill(0x02);
        ephemPubKey[0] = CURVE.PREFIX.UNCOMPRESSED; // 0x04
        const ciphertext = new Uint8Array(32).fill(0x03);
        const mac = new Uint8Array(32).fill(0x04);

        const combined = new Uint8Array([
          ...iv,
          ...ephemPubKey,
          ...ciphertext,
          ...mac,
        ]);
        const hex = Array.from(combined)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const result = deserializeECIES(hex);

        expect(result.iv).toEqual(iv);
        expect(result.ephemPublicKey).toEqual(ephemPubKey);
        expect(result.ephemPublicKey.length).toBe(65);
        expect(result.ephemPublicKey[0]).toBe(CURVE.PREFIX.UNCOMPRESSED);
        expect(result.ciphertext).toEqual(ciphertext);
        expect(result.mac).toEqual(mac);
      });

      it("should reject compressed ephemeral key with 0x02 prefix", () => {
        const iv = new Uint8Array(16).fill(0x01);
        const ephemPubKey = new Uint8Array(33).fill(0x02);
        ephemPubKey[0] = CURVE.PREFIX.COMPRESSED_EVEN; // 0x02
        const ciphertext = new Uint8Array(32).fill(0x03);
        const mac = new Uint8Array(32).fill(0x04);

        const combined = new Uint8Array([
          ...iv,
          ...ephemPubKey,
          ...ciphertext,
          ...mac,
        ]);
        const hex = Array.from(combined)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        expect(() => deserializeECIES(hex)).toThrow(
          /Invalid ephemeral public key.*0x04 prefix.*got 0x02/i,
        );
      });

      it("should reject compressed ephemeral key with 0x03 prefix", () => {
        const iv = new Uint8Array(16).fill(0x01);
        const ephemPubKey = new Uint8Array(33).fill(0x03);
        ephemPubKey[0] = CURVE.PREFIX.COMPRESSED_ODD; // 0x03
        const ciphertext = new Uint8Array(32).fill(0x03);
        const mac = new Uint8Array(32).fill(0x04);

        const combined = new Uint8Array([
          ...iv,
          ...ephemPubKey,
          ...ciphertext,
          ...mac,
        ]);
        const hex = Array.from(combined)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        expect(() => deserializeECIES(hex)).toThrow(
          /Invalid ephemeral public key.*0x04 prefix.*got 0x03/i,
        );
      });

      it("should handle hex with 0x prefix", () => {
        const iv = new Uint8Array(16).fill(0x01);
        const ephemPubKey = new Uint8Array(65).fill(0x02);
        ephemPubKey[0] = CURVE.PREFIX.UNCOMPRESSED;
        const ciphertext = new Uint8Array(1).fill(0x03);
        const mac = new Uint8Array(32).fill(0x04);

        const combined = new Uint8Array([
          ...iv,
          ...ephemPubKey,
          ...ciphertext,
          ...mac,
        ]);
        const hex =
          "0x" +
          Array.from(combined)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        const result = deserializeECIES(hex);

        expect(result.iv).toEqual(iv);
      });
    });

    describe("invalid prefix validation", () => {
      it("should reject invalid ephemeral key prefix 0x00", () => {
        const iv = new Uint8Array(16).fill(0x01);
        const ephemPubKey = new Uint8Array(33).fill(0x02);
        ephemPubKey[0] = 0x00; // Invalid prefix
        const ciphertext = new Uint8Array(32).fill(0x03);
        const mac = new Uint8Array(32).fill(0x04);

        const combined = new Uint8Array([
          ...iv,
          ...ephemPubKey,
          ...ciphertext,
          ...mac,
        ]);
        const hex = Array.from(combined)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        expect(() => deserializeECIES(hex)).toThrow(ECIESError);
        expect(() => deserializeECIES(hex)).toThrow(
          /Invalid ephemeral public key.*0x04 prefix.*got 0x00/i,
        );
      });

      it("should reject invalid ephemeral key prefix 0x01", () => {
        const iv = new Uint8Array(16).fill(0x01);
        const ephemPubKey = new Uint8Array(33).fill(0x02);
        ephemPubKey[0] = 0x01; // Invalid prefix
        const ciphertext = new Uint8Array(32).fill(0x03);
        const mac = new Uint8Array(32).fill(0x04);

        const combined = new Uint8Array([
          ...iv,
          ...ephemPubKey,
          ...ciphertext,
          ...mac,
        ]);
        const hex = Array.from(combined)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        expect(() => deserializeECIES(hex)).toThrow(ECIESError);
        expect(() => deserializeECIES(hex)).toThrow(
          /Invalid ephemeral public key.*0x04 prefix.*got 0x01/i,
        );
      });

      it("should reject invalid ephemeral key prefix 0x05", () => {
        const iv = new Uint8Array(16).fill(0x01);
        const ephemPubKey = new Uint8Array(33).fill(0x02);
        ephemPubKey[0] = 0x05; // Invalid prefix
        const ciphertext = new Uint8Array(32).fill(0x03);
        const mac = new Uint8Array(32).fill(0x04);

        const combined = new Uint8Array([
          ...iv,
          ...ephemPubKey,
          ...ciphertext,
          ...mac,
        ]);
        const hex = Array.from(combined)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        expect(() => deserializeECIES(hex)).toThrow(ECIESError);
        expect(() => deserializeECIES(hex)).toThrow(
          /Invalid ephemeral public key.*0x04 prefix.*got 0x05/i,
        );
      });

      it("should reject invalid ephemeral key prefix 0xff", () => {
        const iv = new Uint8Array(16).fill(0x01);
        const ephemPubKey = new Uint8Array(33).fill(0x02);
        ephemPubKey[0] = 0xff; // Invalid prefix
        const ciphertext = new Uint8Array(32).fill(0x03);
        const mac = new Uint8Array(32).fill(0x04);

        const combined = new Uint8Array([
          ...iv,
          ...ephemPubKey,
          ...ciphertext,
          ...mac,
        ]);
        const hex = Array.from(combined)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        expect(() => deserializeECIES(hex)).toThrow(ECIESError);
        expect(() => deserializeECIES(hex)).toThrow(
          /Invalid ephemeral public key.*0x04 prefix.*got 0xff/i,
        );
      });
    });

    describe("truncated data handling (regression tests)", () => {
      it("should reject completely empty data", () => {
        expect(() => deserializeECIES("")).toThrow(ECIESError);
        expect(() => deserializeECIES("")).toThrow(/too short/);
      });

      it("should reject data with only 1 byte", () => {
        const hex = "00";

        expect(() => deserializeECIES(hex)).toThrow(ECIESError);
        expect(() => deserializeECIES(hex)).toThrow(/too short/);
      });

      it("should reject data shorter than IV (< 16 bytes)", () => {
        const truncated = new Uint8Array(10).fill(0x01); // Only 10 bytes
        const hex = Array.from(truncated)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        expect(() => deserializeECIES(hex)).toThrow(ECIESError);
        expect(() => deserializeECIES(hex)).toThrow(/too short.*10 bytes/);
      });

      it("should reject data with only IV (16 bytes, missing ephemeral key prefix)", () => {
        const onlyIv = new Uint8Array(16).fill(0x01);
        const hex = Array.from(onlyIv)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        expect(() => deserializeECIES(hex)).toThrow(ECIESError);
        expect(() => deserializeECIES(hex)).toThrow(/too short.*16 bytes/);
      });

      it("should reject truncated data before it tries to read prefix (regression)", () => {
        // This is the key regression test for the bug found by the reviewer
        // Data with 15 bytes (less than EPHEMERAL_KEY_OFFSET which is 16)
        const truncated = new Uint8Array(15).fill(0x01);
        const hex = Array.from(truncated)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        // Should throw ECIESError, NOT TypeError from undefined.toString()
        expect(() => deserializeECIES(hex)).toThrow(ECIESError);
        expect(() => deserializeECIES(hex)).toThrow(/too short/);
        expect(() => deserializeECIES(hex)).not.toThrow(TypeError);
      });

      it("should reject data with IV + prefix but missing ephemeral key", () => {
        const iv = new Uint8Array(16).fill(0x01);
        const prefix = new Uint8Array([CURVE.PREFIX.UNCOMPRESSED]);
        // Only 17 bytes total, needs at least 16 + 65 + 32 + 1 for uncompressed
        const truncated = new Uint8Array([...iv, ...prefix]);
        const hex = Array.from(truncated)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        expect(() => deserializeECIES(hex)).toThrow(ECIESError);
        expect(() => deserializeECIES(hex)).toThrow(/too short/);
      });

      it("should reject data with IV + ephemeral key but missing MAC", () => {
        const iv = new Uint8Array(16).fill(0x01);
        const ephemPubKey = new Uint8Array(65).fill(0x02);
        ephemPubKey[0] = CURVE.PREFIX.UNCOMPRESSED;
        const ciphertext = new Uint8Array(1).fill(0x03);
        // Missing MAC (32 bytes)
        const truncated = new Uint8Array([
          ...iv,
          ...ephemPubKey,
          ...ciphertext,
        ]);
        const hex = Array.from(truncated)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        expect(() => deserializeECIES(hex)).toThrow(ECIESError);
        expect(() => deserializeECIES(hex)).toThrow(/too short/);
      });
    });

    describe("round-trip serialization", () => {
      it("should correctly round-trip serialize and deserialize", () => {
        const original: ECIESEncrypted = {
          iv: new Uint8Array(16).fill(0xaa),
          ephemPublicKey: new Uint8Array(65).fill(0xbb),
          ciphertext: new Uint8Array(100).fill(0xcc),
          mac: new Uint8Array(32).fill(0xdd),
        };
        original.ephemPublicKey[0] = CURVE.PREFIX.UNCOMPRESSED;

        const serialized = serializeECIES(original);
        const deserialized = deserializeECIES(serialized);

        expect(deserialized.iv).toEqual(original.iv);
        expect(deserialized.ephemPublicKey).toEqual(original.ephemPublicKey);
        expect(deserialized.ciphertext).toEqual(original.ciphertext);
        expect(deserialized.mac).toEqual(original.mac);
      });
    });
  });
});
