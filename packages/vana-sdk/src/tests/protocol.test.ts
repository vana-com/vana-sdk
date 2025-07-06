import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";
import { ProtocolController } from "../controllers/protocol";
import { ControllerContext } from "../controllers/permissions";
import { ContractNotFoundError } from "../errors";

// Mock the config and ABI modules
vi.mock("../config/addresses", () => ({
  getContractAddress: vi.fn(),
}));

vi.mock("../abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

// Import the mocked functions
import { getContractAddress } from "../config/addresses";
import { getAbi } from "../abi";

// Type the mocked functions
const mockGetContractAddress = getContractAddress as any;
const mockGetAbi = getAbi as any;

// Test account
const testAccount = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

describe("ProtocolController", () => {
  let controller: ProtocolController;
  let mockContext: ControllerContext;
  let mockWalletClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWalletClient = createWalletClient({
      account: testAccount,
      chain: mokshaTestnet,
      transport: http("https://rpc.moksha.vana.org"),
    });

    mockContext = {
      walletClient: mockWalletClient,
      relayerUrl: "https://test-relayer.com",
    };

    controller = new ProtocolController(mockContext);
  });

  describe("getContract", () => {
    it("should return contract info for valid contract", () => {
      const mockAddress = "0x1234567890123456789012345678901234567890";
      const mockAbi: any[] = [{ type: "function", name: "test" }];

      mockGetContractAddress.mockReturnValue(mockAddress);
      mockGetAbi.mockReturnValue(mockAbi);

      const result = controller.getContract("DataRegistry");

      expect(result).toEqual({
        address: mockAddress,
        abi: mockAbi,
      });

      expect(getContractAddress).toHaveBeenCalledWith(14800, "DataRegistry");
      expect(getAbi).toHaveBeenCalledWith("DataRegistry");
    });

    it("should throw ContractNotFoundError for non-existent contract", () => {
      mockGetContractAddress.mockImplementation(() => {
        throw new Error(
          "Contract address not found for NonExistentContract on chain 14800",
        );
      });

      expect(() => {
        controller.getContract("DataRegistry");
      }).toThrow(ContractNotFoundError);
    });

    it("should handle missing chain ID gracefully", () => {
      // Mock wallet client without chain
      const noChainClient = {
        ...mockWalletClient,
        chain: undefined,
      };

      const noChainController = new ProtocolController({
        walletClient: noChainClient,
        relayerUrl: "https://test-relayer.com",
      });

      expect(() => {
        noChainController.getContract("DataRegistry");
      }).toThrow("Chain ID not available from wallet client");
    });

    it("should work with all contract types", () => {
      mockGetContractAddress.mockReturnValue(
        "0x1234567890123456789012345678901234567890",
      );
      mockGetAbi.mockReturnValue([]);

      // Test a few different contract types
      const contracts = [
        "DataRegistry",
        "PermissionRegistry",
        "TeePoolPhala",
        "ComputeEngine",
      ] as const;

      contracts.forEach((contractName) => {
        const result = controller.getContract(contractName);
        expect(result).toHaveProperty("address");
        expect(result).toHaveProperty("abi");
      });
    });

    it("should handle unexpected errors gracefully", () => {
      mockGetContractAddress.mockImplementation(() => {
        throw new Error("Unexpected error");
      });

      expect(() => {
        controller.getContract("DataRegistry");
      }).toThrow("Unexpected error");
    });

    it("should handle non-Error exceptions in getContract", () => {
      // Mock a rejection with a non-Error object
      mockGetContractAddress.mockImplementation(() => {
        throw "String error message";
      });

      expect(() => {
        controller.getContract("DataRegistry");
      }).toThrow("Failed to get contract DataRegistry: Unknown error");
    });

    it("should handle undefined/null exceptions in getContract", () => {
      // Mock a rejection with null/undefined
      mockGetContractAddress.mockImplementation(() => {
        throw null;
      });

      expect(() => {
        controller.getContract("DataRegistry");
      }).toThrow("Failed to get contract DataRegistry: Unknown error");
    });

    it("should handle object exceptions in getContract", () => {
      // Mock a rejection with an object that's not an Error
      mockGetContractAddress.mockImplementation(() => {
        throw { code: 500, message: "Server error" };
      });

      expect(() => {
        controller.getContract("DataRegistry");
      }).toThrow("Failed to get contract DataRegistry: Unknown error");
    });
  });

  describe("getAvailableContracts", () => {
    it("should return array of all available contract names", () => {
      const contracts = controller.getAvailableContracts();

      expect(Array.isArray(contracts)).toBe(true);
      expect(contracts.length).toBeGreaterThan(0);

      // Should include core contracts
      expect(contracts).toContain("PermissionRegistry");
      expect(contracts).toContain("DataRegistry");
      expect(contracts).toContain("TeePoolPhala");
      expect(contracts).toContain("ComputeEngine");

      // Should include DLP contracts
      expect(contracts).toContain("DLPRegistry");
      expect(contracts).toContain("VanaEpoch");

      // Should include TEE pool variants
      expect(contracts).toContain("TeePoolEphemeralStandard");
      expect(contracts).toContain("TeePoolPersistentStandard");
    });

    it("should return unique contract names", () => {
      const contracts = controller.getAvailableContracts();
      const uniqueContracts = [...new Set(contracts)];

      expect(contracts).toHaveLength(uniqueContracts.length);
    });

    it("should return consistent results across calls", () => {
      const contracts1 = controller.getAvailableContracts();
      const contracts2 = controller.getAvailableContracts();

      expect(contracts1).toEqual(contracts2);
    });
  });

  describe("getChainId", () => {
    it("should return chain ID from wallet client", () => {
      const chainId = controller.getChainId();
      expect(chainId).toBe(14800);
    });

    it("should throw error when chain ID is not available", () => {
      const noChainClient = {
        ...mockWalletClient,
        chain: undefined,
      };

      const noChainController = new ProtocolController({
        walletClient: noChainClient,
        relayerUrl: "https://test-relayer.com",
      });

      expect(() => {
        noChainController.getChainId();
      }).toThrow("Chain ID not available from wallet client");
    });
  });

  describe("getChainName", () => {
    it("should return chain name from wallet client", () => {
      const chainName = controller.getChainName();
      expect(chainName).toBe("Vana Moksha Testnet");
    });

    it("should throw error when chain name is not available", () => {
      const noChainClient = {
        ...mockWalletClient,
        chain: { ...mockWalletClient.chain, name: undefined },
      };

      const noChainController = new ProtocolController({
        walletClient: noChainClient,
        relayerUrl: "https://test-relayer.com",
      });

      expect(() => {
        noChainController.getChainName();
      }).toThrow("Chain name not available from wallet client");
    });
  });

  describe("Integration with contract system", () => {
    it("should properly integrate with address configuration", () => {
      mockGetContractAddress.mockReturnValue(
        "0x1234567890123456789012345678901234567890",
      );

      controller.getContract("DataRegistry");

      // Should call with correct chain ID
      expect(getContractAddress).toHaveBeenCalledWith(14800, "DataRegistry");
    });

    it("should properly integrate with ABI system", () => {
      mockGetContractAddress.mockReturnValue(
        "0x1234567890123456789012345678901234567890",
      );
      const mockAbi: any[] = [
        { type: "function", name: "version", inputs: [], outputs: [] },
      ];
      mockGetAbi.mockReturnValue(mockAbi);

      const result = controller.getContract("DataRegistry");

      expect(getAbi).toHaveBeenCalledWith("DataRegistry");
      expect(result.abi).toBe(mockAbi);
    });
  });

  describe("Error scenarios", () => {
    it("should handle ABI retrieval errors", () => {
      mockGetContractAddress.mockReturnValue(
        "0x1234567890123456789012345678901234567890",
      );
      mockGetAbi.mockImplementation(() => {
        throw new Error("ABI not found");
      });

      expect(() => {
        controller.getContract("DataRegistry");
      }).toThrow("ABI not found");
    });

    it("should use chain ID fallback when handling contract address errors", async () => {
      // Create context with missing chain entirely
      const contextWithoutChain = {
        walletClient: {
          chain: null, // No chain object
        },
      };

      const controller = new ProtocolController(contextWithoutChain);

      expect(() => {
        controller.getContract("DataRegistry");
      }).toThrow("Chain ID not available from wallet client");
    });
  });
});
