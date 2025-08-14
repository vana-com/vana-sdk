import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchSchemaFromChain, fetchSchemaCountFromChain } from "./registry";
import { getContract } from "viem";
import { getContractAddress } from "../../config/addresses";
import { getAbi } from "../../abi";

// Mock external dependencies
vi.mock("viem", () => ({
  getContract: vi.fn(),
}));

vi.mock("../../config/addresses", () => ({
  getContractAddress: vi.fn(),
}));

vi.mock("../../abi", () => ({
  getAbi: vi.fn(),
}));

describe("Blockchain Registry Utilities", () => {
  const mockContext = {
    walletClient: {
      chain: { id: 14800 },
    },
    publicClient: {},
  };

  const mockContract = {
    read: {
      schemas: vi.fn(),
      schemasCount: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getContractAddress as any).mockReturnValue("0xContractAddress");
    (getAbi as any).mockReturnValue([]);
    (getContract as any).mockReturnValue(mockContract);
  });

  describe("fetchSchemaFromChain", () => {
    it("should fetch schema successfully", async () => {
      const mockSchemaData = {
        name: "Test Schema",
        dialect: "json",
        definitionUrl: "https://example.com/schema.json",
      };

      mockContract.read.schemas.mockResolvedValue(mockSchemaData);

      const result = await fetchSchemaFromChain(mockContext as any, 1);

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
        fetchSchemaFromChain(contextWithoutChain as any, 1),
      ).rejects.toThrow("Chain ID not available");
    });

    it("should throw error when schema not found", async () => {
      mockContract.read.schemas.mockResolvedValue(null);

      await expect(fetchSchemaFromChain(mockContext as any, 1)).rejects.toThrow(
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

      await expect(fetchSchemaFromChain(mockContext as any, 1)).rejects.toThrow(
        "Incomplete schema data",
      );
    });

    it("should handle contract read errors", async () => {
      mockContract.read.schemas.mockRejectedValue(new Error("Contract error"));

      await expect(fetchSchemaFromChain(mockContext as any, 1)).rejects.toThrow(
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

      await expect(fetchSchemaFromChain(mockContext as any, 1)).rejects.toThrow(
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

      await expect(fetchSchemaFromChain(mockContext as any, 1)).rejects.toThrow(
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

      await expect(fetchSchemaFromChain(mockContext as any, 1)).rejects.toThrow(
        "Incomplete schema data",
      );
    });
  });

  describe("fetchSchemaCountFromChain", () => {
    it("should fetch count successfully", async () => {
      mockContract.read.schemasCount.mockResolvedValue(BigInt(42));

      const result = await fetchSchemaCountFromChain(mockContext as any);

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
        fetchSchemaCountFromChain(contextWithoutChain as any),
      ).rejects.toThrow("Chain ID not available");
    });

    it("should handle contract read errors", async () => {
      mockContract.read.schemasCount.mockRejectedValue(
        new Error("Contract read failed"),
      );

      await expect(
        fetchSchemaCountFromChain(mockContext as any),
      ).rejects.toThrow("Contract read failed");
    });

    it("should handle zero count", async () => {
      mockContract.read.schemasCount.mockResolvedValue(BigInt(0));

      const result = await fetchSchemaCountFromChain(mockContext as any);

      expect(result).toBe(0);
    });

    it("should handle large counts", async () => {
      mockContract.read.schemasCount.mockResolvedValue(BigInt(1000000));

      const result = await fetchSchemaCountFromChain(mockContext as any);

      expect(result).toBe(1000000);
    });
  });
});
