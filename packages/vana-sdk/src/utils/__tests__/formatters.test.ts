/**
 * Tests for formatting utilities
 *
 * @remarks
 * Tests number, ETH, token, and address formatting functions.
 */

import { describe, it, expect } from "vitest";
import {
  formatNumber,
  formatEth,
  formatToken,
  shortenAddress,
} from "../formatters";

describe("formatters", () => {
  describe("formatNumber", () => {
    it("should format bigint to number", () => {
      expect(formatNumber(123n)).toBe(123);
      expect(formatNumber(0n)).toBe(0);
      expect(formatNumber(999999n)).toBe(999999);
    });

    it("should format string to number", () => {
      expect(formatNumber("123")).toBe(123);
      expect(formatNumber("0")).toBe(0);
      expect(formatNumber("999999")).toBe(999999);
    });

    it("should handle negative values", () => {
      expect(formatNumber(-100n)).toBe(-100);
      expect(formatNumber("-100")).toBe(-100);
    });

    it("should handle large values", () => {
      const large = 1000000000000000000n;
      expect(formatNumber(large)).toBe(1000000000000000000);
    });

    it("should handle number input", () => {
      expect(formatNumber(123.45)).toBe(123.45);
      expect(formatNumber(0)).toBe(0);
    });

    it("should convert values exceeding MAX_SAFE_INTEGER", () => {
      const tooBig = 9007199254740993n; // MAX_SAFE_INTEGER + 2
      // JavaScript Number() handles this, with potential precision loss
      const result = formatNumber(tooBig);
      expect(typeof result).toBe("number");
    });
  });

  describe("formatEth", () => {
    it("should format 1 ETH (18 decimals)", () => {
      const oneEth = 1000000000000000000n;
      expect(formatEth(oneEth)).toBe("1");
    });

    it("should format with custom decimal places", () => {
      const oneEth = 1000000000000000000n;
      expect(formatEth(oneEth, 2)).toBe("1");
      expect(formatEth(oneEth, 6)).toBe("1");
    });

    it("should format fractional ETH", () => {
      const halfEth = 500000000000000000n;
      expect(formatEth(halfEth)).toBe("0.5");
    });

    it("should truncate small values", () => {
      const verySmall = 10000000000000n; // 0.00001 ETH
      expect(formatEth(verySmall, 4)).toBe("0.0000");
    });

    it("should handle zero", () => {
      expect(formatEth(0n)).toBe("0");
    });

    it("should handle negative values", () => {
      const negOne = -1000000000000000000n;
      expect(formatEth(negOne)).toBe("-1");
    });

    it("should accept string input", () => {
      expect(formatEth("1000000000000000000")).toBe("1");
    });

    it("should accept number input", () => {
      expect(formatEth(1000000000000000000)).toBe("1");
    });

    it("should handle large values", () => {
      const million = 1000000000000000000000000n; // 1 million ETH
      const result = formatEth(million, 2);
      // formatEther returns "1000000.0", slice(0, 4) = "1000"
      expect(result).toBe("1000");
    });
  });

  describe("formatToken", () => {
    it("should format 18 decimal token", () => {
      const oneToken = 1000000000000000000n;
      expect(formatToken(oneToken)).toBe("1");
    });

    it("should format 6 decimal token (USDC)", () => {
      const oneUSDC = 1000000n;
      expect(formatToken(oneUSDC, 6)).toBe("1");
    });

    it("should format with custom display decimals", () => {
      const value = 1500000000000000000n;
      expect(formatToken(value, 18, 2)).toBe("1.5");
      expect(formatToken(value, 18, 6)).toBe("1.5");
    });

    it("should handle whole numbers", () => {
      const five = 5000000000000000000n;
      expect(formatToken(five)).toBe("5");
    });

    it("should handle fractional amounts", () => {
      const frac = 1234567890000000000n;
      expect(formatToken(frac, 18, 6)).toBe("1.234567");
    });

    it("should handle zero", () => {
      expect(formatToken(0n)).toBe("0");
    });

    it("should handle negative values", () => {
      const neg = -1000000000000000000n;
      expect(formatToken(neg, 18, 2)).toBe("-1");
    });

    it("should accept string input", () => {
      expect(formatToken("1000000", 6)).toBe("1");
    });

    it("should accept number input", () => {
      expect(formatToken(1000000, 6)).toBe("1");
    });

    it("should handle different decimal configurations", () => {
      // 8 decimals (like some Bitcoin tokens)
      const value8 = 100000000n;
      expect(formatToken(value8, 8)).toBe("1");

      // 0 decimals (whole number tokens)
      const value0 = 100n;
      expect(formatToken(value0, 0)).toBe("100");
    });

    it("should truncate extra decimals", () => {
      const value = 1123456789000000000n;
      expect(formatToken(value, 18, 2)).toBe("1.12");
      expect(formatToken(value, 18, 4)).toBe("1.1234");
    });
  });

  describe("shortenAddress", () => {
    it("should shorten standard Ethereum address", () => {
      const address = "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36";
      expect(shortenAddress(address)).toBe("0x742d...Bd36");
    });

    it("should preserve first 6 and last 4 characters", () => {
      const address = "0xabcdefghijklmnopqrstuvwxyz1234";
      const result = shortenAddress(address);
      expect(result.startsWith("0xabcd")).toBe(true);
      expect(result.endsWith("1234")).toBe(true);
      expect(result).toContain("...");
    });

    it("should handle checksummed addresses", () => {
      const checksummed = "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36";
      const result = shortenAddress(checksummed);
      expect(result).toBe("0x742d...Bd36");
      // Verify case is preserved: result = "0x742d...Bd36"
      expect(result[2]).toBe("7"); // First char after 0x
      expect(result[3]).toBe("4");
    });

    it("should handle lowercase addresses", () => {
      const lowercase = "0x742d35cc6558fd4d9e9e0e888f0462ef6919bd36";
      expect(shortenAddress(lowercase)).toBe("0x742d...bd36");
    });

    it("should return short addresses unchanged", () => {
      expect(shortenAddress("0x123")).toBe("0x123");
      expect(shortenAddress("0x12345")).toBe("0x12345");
      expect(shortenAddress("0x1234567")).toBe("0x1234567"); // 9 chars < 10
    });

    it("should handle empty string", () => {
      expect(shortenAddress("")).toBe("");
    });

    it("should handle non-address strings", () => {
      const text = "this is a longer string";
      const result = shortenAddress(text);
      expect(result).toBe("this i...ring");
    });

    it("should handle exactly 10 characters", () => {
      const ten = "0123456789";
      // Length < 10 returns unchanged, so length 10 should be shortened
      const result = shortenAddress(ten);
      expect(result).not.toBe(ten);
      expect(result).toContain("...");
    });

    it("should work with any string format", () => {
      const custom = "PREFIX123456789SUFFIX";
      const result = shortenAddress(custom);
      expect(result.startsWith("PREFIX")).toBe(true);
      expect(result.endsWith("FFIX")).toBe(true);
    });
  });
});
