/**
 * Tests for signature formatting utilities
 *
 * @remarks
 * Tests ECDSA signature v-value adjustment for Ethereum contract compatibility.
 */

import { describe, it, expect } from "vitest";
import { formatSignatureForContract } from "../signatureFormatter";
import type { Hash } from "viem";

describe("signatureFormatter", () => {
  describe("formatSignatureForContract", () => {
    it("should adjust v-value from 0 to 27 (0x1b)", () => {
      // Signature with v = 0 (last byte = 00)
      const signature =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef00" as Hash;

      const result = formatSignatureForContract(signature);

      // Should have v = 27 (0x1b)
      expect(result).toMatch(/1b$/);
      expect(result).not.toBe(signature);
    });

    it("should adjust v-value from 1 to 28 (0x1c)", () => {
      // Signature with v = 1 (last byte = 01)
      const signature =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef01" as Hash;

      const result = formatSignatureForContract(signature);

      // Should have v = 28 (0x1c)
      expect(result).toMatch(/1c$/);
      expect(result).not.toBe(signature);
    });

    it("should not modify v-value when already 27 (0x1b)", () => {
      const signature =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b" as Hash;

      const result = formatSignatureForContract(signature);

      expect(result).toBe(signature);
    });

    it("should not modify v-value when already 28 (0x1c)", () => {
      const signature =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1c" as Hash;

      const result = formatSignatureForContract(signature);

      expect(result).toBe(signature);
    });

    it("should handle all v-values less than 27", () => {
      for (let v = 0; v < 27; v++) {
        const vHex = v.toString(16).padStart(2, "0");
        const signature =
          `0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef${vHex}` as Hash;

        const result = formatSignatureForContract(signature);

        // Verify v-value was adjusted by 27
        const expectedV = (v + 27).toString(16).padStart(2, "0");
        expect(result).toMatch(new RegExp(`${expectedV}$`));
      }
    });

    it("should not modify v-values 27 and above", () => {
      for (let v = 27; v <= 35; v++) {
        const vHex = v.toString(16).padStart(2, "0");
        const signature =
          `0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef${vHex}` as Hash;

        const result = formatSignatureForContract(signature);

        expect(result).toBe(signature);
      }
    });

    it("should return original signature if length is not 65 bytes", () => {
      // Too short (64 bytes = 130 hex chars + 2 for 0x)
      const shortSignature =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd" as Hash;

      expect(formatSignatureForContract(shortSignature)).toBe(shortSignature);

      // Too long (66 bytes = 134 hex chars + 2 for 0x)
      const longSignature =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef0011" as Hash;

      expect(formatSignatureForContract(longSignature)).toBe(longSignature);
    });

    it("should handle empty signature", () => {
      const empty = "0x" as Hash;
      expect(formatSignatureForContract(empty)).toBe(empty);
    });

    it("should handle minimal signature", () => {
      const minimal = "0x00" as Hash;
      expect(formatSignatureForContract(minimal)).toBe(minimal);
    });

    it("should preserve r and s components while adjusting v", () => {
      const rComponent =
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const sComponent =
        "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321";
      const vOriginal = "00";

      const signature = `0x${rComponent}${sComponent}${vOriginal}` as Hash;
      const result = formatSignatureForContract(signature);

      // Verify r and s are unchanged
      expect(result.slice(0, 66)).toBe(`0x${rComponent}`);
      expect(result.slice(66, 130)).toBe(sComponent);
      // Verify v is adjusted
      expect(result.slice(130)).toBe("1b");
    });

    it("should be idempotent for already formatted signatures", () => {
      const formatted =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b" as Hash;

      const result1 = formatSignatureForContract(formatted);
      const result2 = formatSignatureForContract(result1);
      const result3 = formatSignatureForContract(result2);

      expect(result1).toBe(formatted);
      expect(result2).toBe(formatted);
      expect(result3).toBe(formatted);
    });

    it("should handle real-world signature examples", () => {
      // Example from wallet with v=0 (proper 65-byte signature = 132 hex chars)
      const walletSignature =
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb00" as Hash;

      const formatted = formatSignatureForContract(walletSignature);

      expect(formatted).toMatch(/1b$/);
      expect(formatted.length).toBe(walletSignature.length);
    });

    it("should handle signatures with all zeros", () => {
      const zeros =
        "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" as Hash;

      const result = formatSignatureForContract(zeros);

      expect(result).toMatch(/1b$/); // v adjusted from 0 to 27
    });

    it("should handle signatures with all ones", () => {
      const ones =
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff01" as Hash;

      const result = formatSignatureForContract(ones);

      expect(result).toMatch(/1c$/); // v adjusted from 1 to 28
    });

    it("should handle mixed case hex strings", () => {
      const mixedCase =
        "0xAbCdEf1234567890AbCdEf1234567890AbCdEf1234567890AbCdEf1234567890FeDcBa0987654321FeDcBa0987654321FeDcBa0987654321FeDcBa098765432100" as Hash;

      const result = formatSignatureForContract(mixedCase);

      expect(result.toLowerCase()).toMatch(/1b$/);
    });

    it("should handle v-value at exact boundary (26)", () => {
      const signature =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1a" as Hash;

      const result = formatSignatureForContract(signature);

      // v = 26 (0x1a) should become 53 (0x35)
      expect(result).toMatch(/35$/);
    });

    it("should handle chain-specific v-values correctly", () => {
      // EIP-155 chain-specific v-values (v = chainId * 2 + 35/36)
      // For chainId = 1 (mainnet): v = 37 or 38
      const eip155Signature =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef25" as Hash;

      const result = formatSignatureForContract(eip155Signature);

      // v = 37 (0x25) should remain unchanged
      expect(result).toBe(eip155Signature);
    });

    it("should produce valid hex output", () => {
      const signature =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef00" as Hash;

      const result = formatSignatureForContract(signature);

      expect(result).toMatch(/^0x[0-9a-fA-F]+$/);
      expect(result.length).toBe(132); // 0x + 130 hex chars
    });
  });
});
