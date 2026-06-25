import { describe, it, expect } from "vitest";
import {
  getContractAddress,
  getUtilityAddress,
  type VanaContractAddress,
} from "../../generated/addresses";

describe("addresses", () => {
  describe("getContractAddress", () => {
    it("should return contract address for valid chain and contract", () => {
      const address = getContractAddress(14800, "DataRegistry");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof address).toBe("string");
    });

    it("should throw error for invalid contract on valid chain", () => {
      expect(() => {
        // @ts-expect-error - Testing invalid contract name
        getContractAddress(14800, "NonExistentContract");
      }).toThrow(
        "Contract address not found for NonExistentContract on chain 14800",
      );
    });

    it("should throw error for invalid chain", () => {
      expect(() => {
        getContractAddress(99999, "DataRegistry");
      }).toThrow();
    });

    it("should accept DataPortabilityEscrow (address-only contract added in #164)", () => {
      // This was the unaddressed Low finding from #164: addresses were present in
      // CONTRACTS but the public VanaContract type (derived from contractAbis) excluded
      // them because they have no ABI. VanaContractAddress now includes registry
      // keys, so these two names type-check correctly.
      const address = getContractAddress(14800, "DataPortabilityEscrow");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      const mainnetAddress = getContractAddress(1480, "DataPortabilityEscrow");
      expect(mainnetAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("should accept FeeRegistry (address-only contract added in #164)", () => {
      const address = getContractAddress(14800, "FeeRegistry");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      const mainnetAddress = getContractAddress(1480, "FeeRegistry");
      expect(mainnetAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("VanaContractAddress includes DataPortabilityEscrow and FeeRegistry", () => {
      // Type-level assertion: these strings must be assignable to VanaContractAddress.
      // The assignment below is a compile-time check — if either name is missing from
      // VanaContractAddress, TypeScript will error here.
      const addressOnlyContracts: VanaContractAddress[] = [
        "DataPortabilityEscrow",
        "FeeRegistry",
      ];
      expect(addressOnlyContracts).toEqual([
        "DataPortabilityEscrow",
        "FeeRegistry",
      ]);
    });
  });

  describe("getUtilityAddress", () => {
    it("should return utility address for valid chain and utility", () => {
      const address = getUtilityAddress(14800, "Multicall3");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof address).toBe("string");
    });

    it("should handle mainnet utility addresses", () => {
      const address = getUtilityAddress(1480, "Multicall3");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof address).toBe("string");
    });

    it("should return utility address for Multisend", () => {
      const address = getUtilityAddress(14800, "Multisend");
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof address).toBe("string");
    });

    it("should return undefined for non-existent utility", () => {
      // @ts-expect-error - Testing non-existent utility
      const address = getUtilityAddress(14800, "nonExistentUtility");
      expect(address).toBeUndefined();
    });
  });
});
