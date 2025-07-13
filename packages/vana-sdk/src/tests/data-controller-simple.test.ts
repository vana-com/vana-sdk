import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataController } from "../controllers/data";
import { ControllerContext } from "../controllers/permissions";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";

describe("DataController Simple Tests", () => {
  let dataController: DataController;
  let mockContext: ControllerContext;

  const testAccount = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );

  beforeEach(() => {
    vi.clearAllMocks();

    const walletClient = createWalletClient({
      account: testAccount,
      chain: mokshaTestnet,
      transport: http(),
    });

    mockContext = {
      walletClient,
      publicClient: {
        readContract: vi.fn().mockResolvedValue(1n),
        getBlockNumber: vi.fn().mockResolvedValue(1000n),
      } as any,
      applicationClient: walletClient,
      relayerCallbacks: undefined,
      storageManager: undefined,
      subgraphUrl: "https://api.thegraph.com/subgraphs/name/test",
      platform: mockPlatformAdapter,
    };

    dataController = new DataController(mockContext);
  });

  describe("Schema Validation", () => {
    it("should validate schema ID existence", async () => {
      mockContext.publicClient.readContract = vi.fn().mockResolvedValue(true);

      const isValid = await dataController.isValidSchemaId(1);
      expect(isValid).toBe(true);
    });

    it("should return false for invalid schema ID", async () => {
      mockContext.publicClient.readContract = vi.fn().mockResolvedValue(false);

      const isValid = await dataController.isValidSchemaId(999);
      expect(isValid).toBe(false);
    });
  });

  describe("Count Methods", () => {
    it("should get schemas count", async () => {
      mockContext.publicClient.readContract = vi.fn().mockResolvedValue(5n);

      const count = await dataController.getSchemasCount();
      expect(count).toBe(5);
    });

    it("should get refiners count", async () => {
      mockContext.publicClient.readContract = vi.fn().mockResolvedValue(3n);

      const count = await dataController.getRefinersCount();
      expect(count).toBe(3);
    });

    it("should get total files count", async () => {
      mockContext.publicClient.readContract = vi.fn().mockResolvedValue(100n);

      const count = await dataController.getTotalFilesCount();
      expect(count).toBe(100);
    });
  });

  describe("Error Handling", () => {
    it("should handle contract read errors gracefully", async () => {
      mockContext.publicClient.readContract = vi
        .fn()
        .mockRejectedValue(new Error("Contract error"));

      const count = await dataController.getSchemasCount();
      expect(count).toBe(0);
    });

    it("should handle invalid chain ID", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockContext.walletClient,
          chain: undefined,
        },
      };

      const controller = new DataController(contextWithoutChain);

      await expect(
        controller.addSchema({
          name: "Test Schema",
          type: "data",
          definitionUrl: "ipfs://test",
        }),
      ).rejects.toThrow("Chain ID not available");
    });
  });

  describe("Schema and Refiner Getters", () => {
    it("should get schema by ID", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              schema: {
                id: "1",
                name: "Test Schema",
                type: "data",
                definitionUrl: "ipfs://test",
              },
            },
          }),
      });

      const schema = await dataController.getSchema(1);
      expect(schema.name).toBe("Test Schema");
    });

    it("should get refiner by ID", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              refiner: {
                id: "1",
                name: "Test Refiner",
                refinementInstructionUrl: "https://test.com",
              },
            },
          }),
      });

      const refiner = await dataController.getRefiner(1);
      expect(refiner.name).toBe("Test Refiner");
    });
  });
});
