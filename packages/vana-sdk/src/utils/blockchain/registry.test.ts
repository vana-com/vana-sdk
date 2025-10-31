import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchSchemaFromChain, fetchSchemaCountFromChain } from "./registry";
import { getContract, type PublicClient, type WalletClient } from "viem";
import { getContractAddress } from "../../generated/addresses";
import { getAbi } from "../../generated/abi";

// Mock external dependencies
vi.mock("viem", () => ({
  getContract: vi.fn(),
}));

vi.mock("../../generated/addresses", () => ({
  getContractAddress: vi.fn(),
}));

vi.mock("../../generated/abi", () => ({
  getAbi: vi.fn(),
}));

interface BlockchainContext {
  walletClient: WalletClient;
  publicClient: PublicClient;
}

describe("Blockchain Registry Utilities", () => {
  const mockContext: BlockchainContext = {
    walletClient: {
      chain: { id: 14800 },
    } as WalletClient,
    publicClient: {} as PublicClient,
  };

  const mockContract = {
    address: "0xContractAddress" as `0x${string}`,
    abi: [],
    read: {
      schemas: vi.fn(),
      schemasCount: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getContractAddress).mockReturnValue("0xContractAddress");
    (getAbi as ReturnType<typeof vi.fn>).mockReturnValue([]);
    // TODO(TYPES): Complex viem type - needs port pattern
    vi.mocked(getContract).mockReturnValue(
      mockContract as ReturnType<typeof getContract>,
    );
  });

  describe("fetchSchemaFromChain", () => {
    it("should fetch schema successfully", async () => {
      const mockSchemaData = {
        name: "Test Schema",
        dialect: "json",
        definitionUrl: "https://example.com/schema.json",
      };

      mockContract.read.schemas.mockResolvedValue(mockSchemaData);

      const result = await fetchSchemaFromChain(mockContext, 1);

      expect(result).toEqual({
        id: 1,
        name: "Test Schema",
        dialect: "json",
        definitionUrl: "https://example.com/schema.json",
      });

      expect(mockContract.read.schemas).toHaveBeenCalledWith([BigInt(1)]);
      expect(getContractAddress).toHaveBeenCalledWith(
        14800,
        "DataRefinerRegistry",
      );
      expect(getAbi).toHaveBeenCalledWith("DataRefinerRegistry");
    });

    it("should throw error when chain ID is not available", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: { chain: undefined },
      };

      await expect(
        fetchSchemaFromChain(contextWithoutChain as BlockchainContext, 1),
      ).rejects.toThrow("Chain ID not available");
    });

    it("should throw error when schema not found", async () => {
      mockContract.read.schemas.mockResolvedValue(null);

      await expect(fetchSchemaFromChain(mockContext, 1)).rejects.toThrow(
        "Schema with ID 1 not found",
      );
    });

    it("should throw error when schema data is incomplete", async () => {
      const incompleteSchemaData = {
        name: "Test Schema",
        dialect: "json",
        // Missing definitionUrl
      };

      mockContract.read.schemas.mockResolvedValue(incompleteSchemaData);

      await expect(fetchSchemaFromChain(mockContext, 1)).rejects.toThrow(
        "Incomplete schema data",
      );
    });

    it("should handle contract read errors", async () => {
      mockContract.read.schemas.mockRejectedValue(new Error("Contract error"));

      await expect(fetchSchemaFromChain(mockContext, 1)).rejects.toThrow(
        "Contract error",
      );
    });

    it("should handle missing schema name", async () => {
      const schemaWithoutName = {
        name: "",
        dialect: "json",
        definitionUrl: "https://example.com/schema.json",
      };

      mockContract.read.schemas.mockResolvedValue(schemaWithoutName);

      await expect(fetchSchemaFromChain(mockContext, 1)).rejects.toThrow(
        "Incomplete schema data",
      );
    });

    it("should handle missing schema type", async () => {
      const schemaWithoutdialecte = {
        name: "Test Schema",
        dialect: "",
        definitionUrl: "https://example.com/schema.json",
      };

      mockContract.read.schemas.mockResolvedValue(schemaWithoutdialecte);

      await expect(fetchSchemaFromChain(mockContext, 1)).rejects.toThrow(
        "Incomplete schema data",
      );
    });

    it("should handle missing schema definition URL", async () => {
      const schemaWithoutUrl = {
        name: "Test Schema",
        dialect: "json",
        definitionUrl: "",
      };

      mockContract.read.schemas.mockResolvedValue(schemaWithoutUrl);

      await expect(fetchSchemaFromChain(mockContext, 1)).rejects.toThrow(
        "Incomplete schema data",
      );
    });
  });

  describe("fetchSchemaCountFromChain", () => {
    it("should fetch count successfully", async () => {
      mockContract.read.schemasCount.mockResolvedValue(BigInt(42));

      const result = await fetchSchemaCountFromChain(mockContext);

      expect(result).toBe(42);
      expect(mockContract.read.schemasCount).toHaveBeenCalled();
      expect(getContractAddress).toHaveBeenCalledWith(
        14800,
        "DataRefinerRegistry",
      );
      expect(getAbi).toHaveBeenCalledWith("DataRefinerRegistry");
    });

    it("should throw error when chain ID is not available", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: { chain: undefined },
      };

      await expect(
        fetchSchemaCountFromChain(contextWithoutChain as BlockchainContext),
      ).rejects.toThrow("Chain ID not available");
    });

    it("should handle contract read errors", async () => {
      mockContract.read.schemasCount.mockRejectedValue(
        new Error("Contract read failed"),
      );

      await expect(fetchSchemaCountFromChain(mockContext)).rejects.toThrow(
        "Contract read failed",
      );
    });

    it("should handle zero count", async () => {
      mockContract.read.schemasCount.mockResolvedValue(BigInt(0));

      const result = await fetchSchemaCountFromChain(mockContext);

      expect(result).toBe(0);
    });

    it("should handle large counts", async () => {
      mockContract.read.schemasCount.mockResolvedValue(BigInt(1000000));

      const result = await fetchSchemaCountFromChain(mockContext);

      expect(result).toBe(1000000);
    });
  });
});
