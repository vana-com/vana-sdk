import { describe, it, expect } from "vitest";
import type { Address, Hash } from "viem";
import type {
  VanaContractName,
  ContractInfo,
  ContractDeployment,
  ContractAddresses,
} from "../types/contracts";

describe("Contract Types", () => {
  describe("VanaContractName", () => {
    it("should accept valid contract names", () => {
      const validNames: VanaContractName[] = [
        "DataPermissions",
        "DataRegistry",
        "TeePool",
        "ComputeEngine",
        "TeePoolPhala",
        "DataRefinerRegistry",
        "QueryEngine",
        "ComputeInstructionRegistry",
        "TeePoolEphemeralStandard",
        "TeePoolPersistentStandard",
        "TeePoolPersistentGpu",
        "TeePoolDedicatedStandard",
        "TeePoolDedicatedGpu",
        "VanaEpoch",
        "DLPRegistry",
        "DLPRegistryTreasury",
        "DLPPerformance",
        "DLPRewardDeployer",
        "DLPRewardDeployerTreasury",
        "DLPRewardSwap",
        "SwapHelper",
        "VanaPoolStaking",
        "VanaPoolEntity",
        "VanaPoolTreasury",
        "DAT",
        "DATFactory",
        "DATPausable",
        "DATVotes",
        "DataLiquidityPool",
        "DLPRoot",
      ];

      expect(validNames).toHaveLength(30);
      expect(validNames[0]).toBe("DataPermissions");
      expect(validNames[29]).toBe("DLPRoot");
    });
  });

  describe("ContractInfo", () => {
    it("should properly structure contract info", () => {
      const contractInfo: ContractInfo = {
        address: "0x1234567890123456789012345678901234567890" as Address,
        abi: [],
      };

      expect(contractInfo.address).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(contractInfo.abi).toEqual([]);
    });

    it("should handle typed ABI", () => {
      const typedAbi = [
        {
          name: "testFunction",
          type: "function" as const,
          inputs: [],
          outputs: [],
          stateMutability: "view" as const,
        },
      ] as const;

      const contractInfo: ContractInfo<typeof typedAbi> = {
        address: "0x1234567890123456789012345678901234567890" as Address,
        abi: typedAbi,
      };

      expect(contractInfo.abi).toEqual(typedAbi);
      expect(contractInfo.abi[0].name).toBe("testFunction");
    });
  });

  describe("ContractDeployment", () => {
    it("should properly structure deployment info", () => {
      const deployment: ContractDeployment = {
        address: "0x1234567890123456789012345678901234567890" as Address,
        blockNumber: 12345n,
        transactionHash:
          "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hash,
      };

      expect(deployment.address).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(deployment.blockNumber).toBe(12345n);
      expect(deployment.transactionHash).toBe(
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      );
    });
  });

  describe("ContractAddresses", () => {
    it("should properly structure contract addresses mapping", () => {
      const addresses: ContractAddresses = {
        14800: {
          DataPermissions:
            "0x1234567890123456789012345678901234567890" as Address,
          DataRegistry: "0x2345678901234567890123456789012345678901" as Address,
        },
        1: {
          DataPermissions:
            "0x3456789012345678901234567890123456789012" as Address,
        },
      };

      expect(addresses[14800].DataPermissions).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(addresses[14800].DataRegistry).toBe(
        "0x2345678901234567890123456789012345678901",
      );
      expect(addresses[1].DataPermissions).toBe(
        "0x3456789012345678901234567890123456789012",
      );
    });

    it("should allow optional contract entries", () => {
      const addresses: ContractAddresses = {
        14800: {
          DataPermissions:
            "0x1234567890123456789012345678901234567890" as Address,
          // Other contracts are optional
        },
      };

      expect(addresses[14800].DataPermissions).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(addresses[14800].DataRegistry).toBeUndefined();
    });
  });

  describe("Type Safety", () => {
    it("should enforce address format", () => {
      const address: Address =
        "0x1234567890123456789012345678901234567890" as Address;
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("should enforce hash format", () => {
      const hash: Hash =
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hash;
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should work with bigint values", () => {
      const blockNumber = 12345n;
      const deployment: ContractDeployment = {
        address: "0x1234567890123456789012345678901234567890" as Address,
        blockNumber,
        transactionHash:
          "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hash,
      };

      expect(typeof deployment.blockNumber).toBe("bigint");
      expect(deployment.blockNumber).toBe(12345n);
    });
  });

  describe("Contract Name Validation", () => {
    it("should include all major Vana contracts", () => {
      const coreContracts: VanaContractName[] = [
        "DataPermissions",
        "DataRegistry",
        "TeePool",
        "ComputeEngine",
      ];

      const dlpContracts: VanaContractName[] = [
        "DLPRegistry",
        "DLPRegistryTreasury",
        "DLPPerformance",
        "DataLiquidityPool",
      ];

      const teePoolVariants: VanaContractName[] = [
        "TeePoolPhala",
        "TeePoolEphemeralStandard",
        "TeePoolPersistentStandard",
        "TeePoolPersistentGpu",
        "TeePoolDedicatedStandard",
        "TeePoolDedicatedGpu",
      ];

      expect(coreContracts).toHaveLength(4);
      expect(dlpContracts).toHaveLength(4);
      expect(teePoolVariants).toHaveLength(6);
    });
  });
});
