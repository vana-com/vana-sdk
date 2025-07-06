import { describe, it, expect } from "vitest";
import { getAbi } from "../index";

describe("ABI utilities", () => {
  describe("getAbi", () => {
    it("should return ABI for valid contract", () => {
      const abi = getAbi("DataRegistry");
      expect(abi).toBeDefined();
      expect(Array.isArray(abi)).toBe(true);
      expect(abi.length).toBeGreaterThan(0);
    });

    it("should return ABI for PermissionRegistry", () => {
      const abi = getAbi("PermissionRegistry");
      expect(abi).toBeDefined();
      expect(Array.isArray(abi)).toBe(true);
      expect(abi.length).toBeGreaterThan(0);
    });

    it("should throw error for unsupported contract", () => {
      expect(() => {
        // @ts-expect-error - Testing invalid contract name
        getAbi("NonExistentContract");
      }).toThrow("Unsupported contract: NonExistentContract");
    });

    it("should return different ABIs for different contracts", () => {
      const dataRegistryAbi = getAbi("DataRegistry");
      const permissionRegistryAbi = getAbi("PermissionRegistry");

      expect(dataRegistryAbi).not.toEqual(permissionRegistryAbi);
    });

    it("should return ABI for newly added contracts", () => {
      const dlpRootAbi = getAbi("DLPRoot");
      expect(dlpRootAbi).toBeDefined();
      expect(Array.isArray(dlpRootAbi)).toBe(true);
      expect(dlpRootAbi.length).toBeGreaterThan(0);
    });

    it("should return ABI for DataLiquidityPool", () => {
      const dlpAbi = getAbi("DataLiquidityPool");
      expect(dlpAbi).toBeDefined();
      expect(Array.isArray(dlpAbi)).toBe(true);
      expect(dlpAbi.length).toBeGreaterThan(0);
    });

    it("should return ABI for DLPRewardDeployerTreasury", () => {
      const treasuryAbi = getAbi("DLPRewardDeployerTreasury");
      expect(treasuryAbi).toBeDefined();
      expect(Array.isArray(treasuryAbi)).toBe(true);
      expect(treasuryAbi.length).toBeGreaterThan(0);
    });

    it("should return ABI for DLPRegistryTreasuryImplementation", () => {
      const registryTreasuryAbi = getAbi("DLPRegistryTreasuryImplementation");
      expect(registryTreasuryAbi).toBeDefined();
      expect(Array.isArray(registryTreasuryAbi)).toBe(true);
      expect(registryTreasuryAbi.length).toBeGreaterThan(0);
    });
  });
});
