import { describe, it, expect, vi, beforeEach } from "vitest";
import { Address } from "viem";
import {
  PermissionsController,
  ControllerContext,
} from "../controllers/permissions";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock ALL external dependencies to ensure pure unit tests
vi.mock("viem", () => ({
  createPublicClient: vi.fn(() => ({
    readContract: vi.fn(),
  })),
  getContract: vi.fn(() => ({
    read: {
      userPermissionIdsLength: vi.fn(),
      userPermissionIdsAt: vi.fn(),
      permissions: vi.fn(),
    },
  })),
  http: vi.fn(),
  createWalletClient: vi.fn(),
}));

vi.mock("../config/addresses", () => ({
  getContractAddress: vi
    .fn()
    .mockReturnValue("0x1234567890123456789012345678901234567890"),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

// Mock the blockchain registry utility
vi.mock("../utils/blockchain/registry", () => ({
  fetchSchemaFromChain: vi.fn(),
}));

// Mock the schema validation utility
vi.mock("../utils/schemaValidation", () => ({
  validateDataAgainstSchema: vi.fn(),
  SchemaValidationError: class extends Error {
    constructor(
      message: string,
      public errors: unknown[],
    ) {
      super(message);
      this.name = "SchemaValidationError";
    }
  },
}));

// Mock fetch globally
global.fetch = vi.fn();

describe("Permissions Schema Validation", () => {
  let controller: PermissionsController;
  let mockContext: ControllerContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      walletClient: {
        account: { address: "0xTestAddress" },
        chain: { id: 14800, name: "Moksha Testnet" },
        writeContract: vi.fn().mockResolvedValue("0xTxHash"),
        getAddresses: vi.fn().mockResolvedValue(["0xTestAddress"]),
        getChainId: vi.fn().mockResolvedValue(14800),
        signTypedData: vi.fn().mockResolvedValue("0xSignature"),
      } as any,
      publicClient: {
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
          status: "success",
          logs: [],
        }),
        readContract: vi.fn().mockResolvedValue(1n), // Mock nonce
      } as any,
      storageManager: undefined,
      subgraphUrl: undefined,
      platform: mockPlatformAdapter,
    };

    controller = new PermissionsController(mockContext);
  });

  describe("submitAddServerFilesAndPermissions with schemas", () => {
    const baseParams = {
      granteeId: 1n,
      grant: "https://grant.example.com/grant.json",
      fileUrls: ["https://storage.example.com/file1.json"],
      schemaIds: [0], // Default: no schema
      serverAddress: "0x1234567890123456789012345678901234567890" as Address,
      serverUrl: "https://server.example.com",
      serverPublicKey: "serverPublicKey123",
      filePermissions: [
        [
          {
            account: "0x1234567890123456789012345678901234567890" as Address,
            key: "encryptedKey123",
          },
        ],
      ],
    };

    beforeEach(() => {
      // Setup wallet client mocks
      mockContext.walletClient.writeContract = vi
        .fn()
        .mockResolvedValue("0xTxHash");

      // Mock public client to simulate transaction events
      mockContext.publicClient.waitForTransactionReceipt = vi
        .fn()
        .mockResolvedValue({
          status: "success",
          logs: [
            {
              eventName: "PermissionGranted",
              args: {
                permissionId: 123n,
              },
            },
          ],
        });

      // Mock the relayer callback
      const mockRelayerCallback = vi.fn().mockResolvedValue({
        hash: "0xTxHash",
        wait: vi.fn().mockResolvedValue({
          status: "success",
          logs: [],
        }),
      });

      (mockContext as any).submitAddServerFilesAndPermissions =
        mockRelayerCallback;
    });

    it("should accept files without schemas (schemaId = 0)", async () => {
      const params = {
        ...baseParams,
        schemaIds: [0], // No schema validation needed
      };

      // The method should succeed without any validation
      const result =
        await controller.submitAddServerFilesAndPermissions(params);

      expect(result).toBeDefined();
      expect(result.hash).toBe("0xTxHash");
    });

    it("should throw error if schemaIds array length doesn't match fileUrls", async () => {
      const params = {
        ...baseParams,
        fileUrls: ["file1.json", "file2.json"],
        schemaIds: [123], // Only one schema ID for two files
      };

      await expect(
        controller.submitAddServerFilesAndPermissions(params),
      ).rejects.toThrow(
        "schemaIds array length (1) must match fileUrls array length (2)",
      );
    });
  });
});
