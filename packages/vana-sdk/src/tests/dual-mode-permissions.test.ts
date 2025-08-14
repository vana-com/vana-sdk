import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataController } from "../controllers/data";
import { ControllerContext } from "../controllers/permissions";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import type { StorageManager } from "../storage/manager";

// Mock dependencies
vi.mock("../config/addresses", () => ({
  getContractAddress: vi.fn().mockReturnValue("0xPermissionsAddress"),
}));

vi.mock("../abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

// Mock gasAwareMulticall
let gasAwareMulticallCallCount = 0;
let mockPermissionInfoFailureIndex: number | null = null;

vi.mock("../utils/multicall", () => ({
  gasAwareMulticall: vi.fn().mockImplementation(async (client, params) => {
    const callIndex = gasAwareMulticallCallCount++;

    // First call: permission IDs (allowFailure: false, returns bigints directly)
    if (callIndex % 2 === 0) {
      return params.contracts.map((_: any, i: number) => BigInt(i + 1));
    }

    // Second call: permission info (allowFailure: true, returns status/result objects)
    return params.contracts.map((_contract: any, i: number) => {
      // Check if we should simulate a failure for this index
      if (mockPermissionInfoFailureIndex === i) {
        return {
          status: "failure",
          error: new Error("Permission not found"),
        };
      }

      return {
        status: "success",
        result: {
          id: BigInt(i + 1),
          grantor: "0x1234567890123456789012345678901234567890",
          nonce: BigInt(i + 1),
          granteeId: BigInt(100 + i),
          grant: `permission-grant-${i + 1}`,
          startBlock: BigInt(1000 + i),
          endBlock: BigInt(2000 + i),
          fileIds: [BigInt(10 + i), BigInt(20 + i)],
        },
      };
    });
  }),
}));

describe("DataController - getUserPermissions dual-mode functionality", () => {
  let controller: DataController;
  let mockContext: ControllerContext;
  let mockStorageManager: Partial<StorageManager>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock state
    gasAwareMulticallCallCount = 0;
    mockPermissionInfoFailureIndex = null;

    // Create mock storage manager
    mockStorageManager = {
      upload: vi.fn().mockResolvedValue({
        url: "https://ipfs.io/ipfs/QmTestHash",
        size: 1024,
        contentType: "application/json",
      }),
      download: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
      register: vi.fn(),
      getProvider: vi.fn(),
      setDefaultProvider: vi.fn(),
      listProviders: vi.fn().mockReturnValue(["ipfs"]),
      getDefaultProvider: vi.fn().mockReturnValue("ipfs"),
      getStorageProviders: vi.fn().mockReturnValue(["ipfs"]),
      getDefaultStorageProvider: vi.fn().mockReturnValue("ipfs"),
    };

    // Create mock context
    mockContext = {
      walletClient: {
        account: { address: "0xTestAddress" },
        chain: { id: 14800, name: "Moksha Testnet" },
        writeContract: vi.fn().mockResolvedValue("0xTransactionHash"),
        getAddresses: vi.fn().mockResolvedValue(["0xTestAddress"]),
      } as any,
      publicClient: {
        readContract: vi.fn().mockImplementation(async ({ functionName }) => {
          if (functionName === "userPermissionIdsLength") {
            return BigInt(3);
          }
          return BigInt(0);
        }),
        getChainId: vi.fn().mockResolvedValue(14800),
        multicall: vi.fn().mockResolvedValue([]),
      } as any,
      platform: mockPlatformAdapter,
      storageManager: mockStorageManager as StorageManager,
      subgraphUrl: undefined, // This will force RPC mode
    };

    controller = new DataController(mockContext);
  });

  describe("RPC fallback mode (no subgraph URL)", () => {
    it("should get user permissions via RPC when no subgraph URL", async () => {
      const permissions = await controller.getUserPermissions({
        user: "0x1234567890123456789012345678901234567890",
      });

      expect(permissions).toHaveLength(3);
      expect(permissions[0]).toEqual({
        id: "1",
        grant: "permission-grant-1",
        nonce: BigInt(1),
        signature: "",
        addedAtBlock: BigInt(1000),
        addedAtTimestamp: BigInt(0),
        transactionHash: "0x0000000000000000000000000000000000000000",
        user: "0x1234567890123456789012345678901234567890",
      });
    });

    it("should return empty array when user has no permissions", async () => {
      // Mock zero permissions
      mockContext.publicClient.readContract = vi
        .fn()
        .mockImplementation(async ({ functionName }) => {
          if (functionName === "userPermissionIdsLength") {
            return BigInt(0);
          }
          return BigInt(0);
        });

      const permissions = await controller.getUserPermissions({
        user: "0x1234567890123456789012345678901234567890",
      });

      expect(permissions).toEqual([]);
    });

    it("should handle permission info failures gracefully", async () => {
      // Simulate failure for permission at index 1
      mockPermissionInfoFailureIndex = 1;

      const permissions = await controller.getUserPermissions({
        user: "0x1234567890123456789012345678901234567890",
      });

      // Should get 2 permissions (exclude the failed one)
      expect(permissions).toHaveLength(2);
      expect(permissions.map((p) => p.id)).toEqual(["1", "3"]);
    });

    it("should throw error when chain ID is not available", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockContext.walletClient,
          chain: undefined,
        },
      };
      const controllerWithoutChain = new DataController(contextWithoutChain);

      await expect(
        controllerWithoutChain.getUserPermissions({
          user: "0x1234567890123456789012345678901234567890",
        }),
      ).rejects.toThrow("RPC query failed: Chain ID not available");
    });
  });

  describe("Subgraph primary mode with RPC fallback", () => {
    beforeEach(() => {
      // Add subgraph URL to context
      mockContext.subgraphUrl = "https://subgraph.example.com/graphql";

      // Mock fetch for subgraph
      global.fetch = vi.fn().mockImplementation(async (url, _options) => {
        if (url.includes("subgraph.example.com")) {
          return {
            ok: true,
            json: async () => ({
              data: {
                user: {
                  id: "0x1234567890123456789012345678901234567890",
                  permissions: [
                    {
                      id: "perm-1",
                      grant: "subgraph-grant-1",
                      nonce: "1",
                      signature: "0xsignature1",
                      addedAtBlock: "1500",
                      addedAtTimestamp: "1600000000",
                      transactionHash: "0xhash1",
                      user: {
                        id: "0x1234567890123456789012345678901234567890",
                      },
                    },
                    {
                      id: "perm-2",
                      grant: "subgraph-grant-2",
                      nonce: "2",
                      signature: "0xsignature2",
                      addedAtBlock: "1501",
                      addedAtTimestamp: "1600001000",
                      transactionHash: "0xhash2",
                      user: {
                        id: "0x1234567890123456789012345678901234567890",
                      },
                    },
                  ],
                },
              },
            }),
          };
        }
        throw new Error("Unexpected fetch URL");
      });
    });

    it("should use subgraph when available", async () => {
      const permissions = await controller.getUserPermissions({
        user: "0x1234567890123456789012345678901234567890",
      });

      expect(permissions).toHaveLength(2);
      expect(permissions[0]).toEqual({
        id: "perm-2", // Should be sorted by timestamp, latest first
        grant: "subgraph-grant-2",
        nonce: BigInt(2),
        signature: "0xsignature2",
        addedAtBlock: BigInt(1501),
        addedAtTimestamp: BigInt(1600001000),
        transactionHash: "0xhash2",
        user: "0x1234567890123456789012345678901234567890",
      });
    });

    it("should fallback to RPC when subgraph fails", async () => {
      // Mock subgraph failure
      global.fetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes("subgraph.example.com")) {
          throw new Error("Subgraph not available");
        }
        throw new Error("Unexpected fetch URL");
      });

      const permissions = await controller.getUserPermissions({
        user: "0x1234567890123456789012345678901234567890",
      });

      // Should get RPC data instead
      expect(permissions).toHaveLength(3);
      expect(permissions[0].grant).toBe("permission-grant-1");
    });

    it("should handle subgraph returning no user data", async () => {
      // Mock subgraph with no user
      global.fetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes("subgraph.example.com")) {
          return {
            ok: true,
            json: async () => ({
              data: { user: null },
            }),
          };
        }
        throw new Error("Unexpected fetch URL");
      });

      const permissions = await controller.getUserPermissions({
        user: "0x1234567890123456789012345678901234567890",
      });

      expect(permissions).toEqual([]);
    });

    it("should handle subgraph errors gracefully and fallback", async () => {
      // Mock subgraph returning errors
      global.fetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes("subgraph.example.com")) {
          return {
            ok: true,
            json: async () => ({
              errors: [{ message: "GraphQL error" }],
            }),
          };
        }
        throw new Error("Unexpected fetch URL");
      });

      const permissions = await controller.getUserPermissions({
        user: "0x1234567890123456789012345678901234567890",
      });

      // Should fallback to RPC and get RPC data
      expect(permissions).toHaveLength(3);
      expect(permissions[0].grant).toBe("permission-grant-1");
    });

    it("should use provided subgraphUrl parameter over context", async () => {
      // Mock custom subgraph
      global.fetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes("custom.subgraph.com")) {
          return {
            ok: true,
            json: async () => ({
              data: {
                user: {
                  id: "0x1234567890123456789012345678901234567890",
                  permissions: [
                    {
                      id: "custom-perm",
                      grant: "custom-grant",
                      nonce: "99",
                      signature: "0xcustomsignature",
                      addedAtBlock: "9999",
                      addedAtTimestamp: "1700000000",
                      transactionHash: "0xcustomhash",
                      user: {
                        id: "0x1234567890123456789012345678901234567890",
                      },
                    },
                  ],
                },
              },
            }),
          };
        }
        throw new Error("Unexpected fetch URL");
      });

      const permissions = await controller.getUserPermissions({
        user: "0x1234567890123456789012345678901234567890",
        subgraphUrl: "https://custom.subgraph.com/graphql",
      });

      expect(permissions).toHaveLength(1);
      expect(permissions[0].grant).toBe("custom-grant");
    });
  });
});
