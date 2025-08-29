import { describe, it, expect } from "vitest";
import { extractViemGasOptions } from "../utils/transactionOptions";

describe("Transaction Options Utilities", () => {
  describe("extractViemGasOptions", () => {
    it("should return empty object when no options provided", () => {
      const result = extractViemGasOptions();
      expect(result).toEqual({});
    });

    it("should convert gasLimit to gas for viem compatibility", () => {
      const result = extractViemGasOptions({
        gasLimit: 500000n,
      });

      expect(result).toEqual({
        gas: 500000n,
      });
    });

    it("should pass through EIP-1559 gas options", () => {
      const result = extractViemGasOptions({
        gasLimit: 500000n,
        maxFeePerGas: 50000000000n, // 50 gwei
        maxPriorityFeePerGas: 2000000000n, // 2 gwei
        nonce: 42,
      });

      expect(result).toEqual({
        gas: 500000n,
        maxFeePerGas: 50000000000n,
        maxPriorityFeePerGas: 2000000000n,
        nonce: 42,
      });
    });

    it("should include value when provided", () => {
      const result = extractViemGasOptions({
        gasLimit: 21000n,
        value: 1000000000000000000n, // 1 ETH
      });

      expect(result).toEqual({
        gas: 21000n,
        value: 1000000000000000000n,
      });
    });

    it("should exclude legacy gasPrice by default", () => {
      const result = extractViemGasOptions({
        gasLimit: 500000n,
        gasPrice: 20000000000n, // 20 gwei
        maxFeePerGas: 50000000000n,
      });

      expect(result).toEqual({
        gas: 500000n,
        maxFeePerGas: 50000000000n,
      });
      expect(result.gasPrice).toBeUndefined();
    });

    it("should include legacy gasPrice when supportLegacyGas is true", () => {
      const result = extractViemGasOptions(
        {
          gasLimit: 500000n,
          gasPrice: 20000000000n, // 20 gwei
        },
        true,
      ); // supportLegacyGas = true

      expect(result).toEqual({
        gas: 500000n,
        gasPrice: 20000000000n,
      });
    });

    it("should ignore timeout options (not gas-related)", () => {
      const result = extractViemGasOptions({
        gasLimit: 500000n,
        timeout: 180000,
        maxFeePerGas: 50000000000n,
      });

      expect(result).toEqual({
        gas: 500000n,
        maxFeePerGas: 50000000000n,
      });
      expect(result.timeout).toBeUndefined();
    });

    it("should handle mixed options correctly", () => {
      const result = extractViemGasOptions({
        gasLimit: 300000n,
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 1000000000n,
        nonce: 15,
        value: 500000000000000000n, // 0.5 ETH
        timeout: 120000, // Should be ignored
      });

      expect(result).toEqual({
        gas: 300000n,
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 1000000000n,
        nonce: 15,
        value: 500000000000000000n,
      });
      expect(result.timeout).toBeUndefined();
    });
  });
});
