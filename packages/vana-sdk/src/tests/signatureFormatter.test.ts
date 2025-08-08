import { describe, it, expect } from "vitest";
import { formatSignatureForContract } from "../utils/signatureFormatter";
import type { Hash } from "viem";

describe("signatureFormatter", () => {
  describe("formatSignatureForContract", () => {
    it("should add 27 to v value when v is 0", () => {
      const signature = "0x" + "a".repeat(64) + "b".repeat(64) + "00";
      const result = formatSignatureForContract(signature as Hash);
      expect(result).toBe("0x" + "a".repeat(64) + "b".repeat(64) + "1b");
    });

    it("should add 27 to v value when v is 1", () => {
      const signature = "0x" + "a".repeat(64) + "b".repeat(64) + "01";
      const result = formatSignatureForContract(signature as Hash);
      expect(result).toBe("0x" + "a".repeat(64) + "b".repeat(64) + "1c");
    });

    it("should not modify signature when v is already 27", () => {
      const signature = "0x" + "a".repeat(64) + "b".repeat(64) + "1b";
      const result = formatSignatureForContract(signature as Hash);
      expect(result).toBe(signature);
    });

    it("should not modify signature when v is already 28", () => {
      const signature = "0x" + "a".repeat(64) + "b".repeat(64) + "1c";
      const result = formatSignatureForContract(signature as Hash);
      expect(result).toBe(signature);
    });

    it("should handle signatures without 0x prefix", () => {
      const signature = "a".repeat(64) + "b".repeat(64) + "00";
      const result = formatSignatureForContract(signature as Hash);
      expect(result).toBe("0x" + "a".repeat(64) + "b".repeat(64) + "1b");
    });

    it("should return original signature if length is not 130 chars (excluding 0x)", () => {
      const signature = "0x" + "a".repeat(60);
      const result = formatSignatureForContract(signature as Hash);
      expect(result).toBe(signature);
    });

    it("should return original signature if v value is invalid", () => {
      const signature = "0x" + "a".repeat(64) + "b".repeat(64) + "gg";
      const result = formatSignatureForContract(signature as Hash);
      expect(result).toBe(signature);
    });
  });
});
