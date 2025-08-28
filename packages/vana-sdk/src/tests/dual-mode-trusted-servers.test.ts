import { describe, it, expect, beforeEach, vi } from "vitest";
import { type Address } from "viem";
import { vanaMainnet } from "../chains/definitions";
import { DataController } from "../controllers/data";
import { createMockPlatformAdapter } from "./mocks/platformAdapter";
import type { ControllerContext } from "../controllers/permissions";

// Mock external dependencies
vi.mock("../config/addresses", () => ({
  getContractAddress: vi
    .fn()
    .mockReturnValue("0x1234567890123456789012345678901234567890"),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

// Track gasAwareMulticall calls to return appropriate data
let gasAwareMulticallCallCount = 0;
let mockServerInfoFailureIndex: number | null = null;

vi.mock("../utils/multicall", () => ({
  gasAwareMulticall: vi.fn().mockImplementation(async (_client, params) => {
    const callIndex = gasAwareMulticallCallCount++;

    // First call: server IDs (allowFailure: false, returns bigints directly)
    if (callIndex % 2 === 0) {
      return params.contracts.map((_: any, i: number) => BigInt(i + 1));
    }

    // Second call: server info (allowFailure: true, returns status/result objects)
    return params.contracts.map((_contract: any, i: number) => {
      // Check if we should simulate a failure for this index
      if (mockServerInfoFailureIndex === i) {
        return {
          status: "failure",
          error: new Error("Server not found"),
        };
      }

      return {
        status: "success",
        result: {
          id: BigInt(i + 1),
          owner: "0x1234567890123456789012345678901234567890",
          serverAddress:
            [
              "0x1111111111111111111111111111111111111111",
              "0x2222222222222222222222222222222222222222",
              "0x3333333333333333333333333333333333333333",
            ][i] || "0x0000000000000000000000000000000000000000",
          publicKey: `0x${"0".repeat(64)}`,
          url: `https://server${i + 1}.example.com`,
        },
      };
    });
  }),
}));

// Mock fetch for subgraph tests
global.fetch = vi.fn();

describe("Trusted Server Queries with Automatic Fallback", () => {
  let dataController: DataController;
  let mockPublicClient: {
    readContract: ReturnType<typeof vi.fn>;
    getChainId: ReturnType<typeof vi.fn>;
  };
  let mockWalletClient: {
    getAddresses: ReturnType<typeof vi.fn>;
    getChainId: ReturnType<typeof vi.fn>;
    chain: typeof vanaMainnet | undefined;
  };
  let context: ControllerContext;

  const userAddress: Address = "0x1234567890123456789012345678901234567890";
  const serverAddresses: Address[] = [
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    gasAwareMulticallCallCount = 0; // Reset the counter
    mockServerInfoFailureIndex = null; // Reset the failure index

    // Create mock clients
    mockPublicClient = {
      chain: {
        id: vanaMainnet.id,
        name: vanaMainnet.name,
      },
      readContract: vi.fn(),
      getChainId: vi.fn().mockResolvedValue(vanaMainnet.id),
    };

    mockWalletClient = {
      getAddresses: vi.fn().mockResolvedValue([userAddress]),
      getChainId: vi.fn().mockResolvedValue(vanaMainnet.id),
      chain: vanaMainnet,
    };

    context = {
      walletClient: mockWalletClient as any,
      publicClient: mockPublicClient as any,
      platform: createMockPlatformAdapter(),
      subgraphUrl: "https://subgraph.example.com",
      userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
    };

    dataController = new DataController(context);

    // Reset fetch mock
    (global.fetch as any).mockReset();
  });

  describe("Subgraph fallback behavior", () => {
    it("should fallback to RPC when subgraph fails", async () => {
      // Mock fetch to fail so subgraph mode falls back to RPC
      (global.fetch as any).mockRejectedValueOnce(
        new Error("Subgraph not available"),
      );

      // Mock RPC calls since subgraph mode now always falls back to RPC
      mockPublicClient.readContract.mockResolvedValueOnce(2n); // userServerIdsLength

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        subgraphUrl: "https://subgraph.example.com",
        userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      });

      expect(result).toHaveLength(2);
      expect(mockPublicClient.readContract).toHaveBeenCalled();
    });

    it("should fallback to RPC even without subgraphUrl", async () => {
      // Create a context without subgraphUrl
      const contextWithoutSubgraph = {
        ...context,
        subgraphUrl: undefined,
        userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      };
      const dataControllerNoSubgraph = new DataController(
        contextWithoutSubgraph,
      );

      // Mock RPC calls
      mockPublicClient.readContract.mockResolvedValueOnce(0n); // userServerIdsLength (empty)

      const result = await dataControllerNoSubgraph.getUserTrustedServers({
        user: userAddress,
        // subgraphUrl not provided
      });

      expect(result).toHaveLength(0);
      expect(mockPublicClient.readContract).toHaveBeenCalled();
    });

    it("should fallback to RPC instead of throwing subgraph errors", async () => {
      // Mock fetch to fail so subgraph mode falls back to RPC
      (global.fetch as any).mockRejectedValueOnce(new Error("Subgraph error"));

      // Mock RPC calls since we now always fall back to RPC
      mockPublicClient.readContract.mockResolvedValueOnce(0n); // userServerIdsLength (empty)

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        subgraphUrl: "https://subgraph.example.com",
        userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      });

      expect(result).toHaveLength(0);
      expect(mockPublicClient.readContract).toHaveBeenCalled();
    });

    it("should handle empty RPC results in fallback mode", async () => {
      // Mock fetch to fail so subgraph mode falls back to RPC
      (global.fetch as any).mockRejectedValueOnce(new Error("Subgraph failed"));

      // Mock RPC calls returning empty results
      mockPublicClient.readContract.mockResolvedValueOnce(0n); // userServerIdsLength (empty)

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        subgraphUrl: "https://subgraph.example.com",
        userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      });

      expect(result).toHaveLength(0);
      expect(mockPublicClient.readContract).toHaveBeenCalled();
    });
  });

  describe("Direct RPC queries", () => {
    it("should successfully query trusted servers via RPC", async () => {
      // Mock contract calls for RPC mode
      const serverIds = [1n, 2n, 3n]; // Numeric server IDs
      mockPublicClient.readContract
        .mockResolvedValueOnce(3n) // userServerIdsLength
        .mockResolvedValueOnce(serverIds[0]) // userServerIdsAt(0)
        .mockResolvedValueOnce(serverIds[1]) // userServerIdsAt(1)
        .mockResolvedValueOnce(serverIds[2]) // userServerIdsAt(2)
        .mockResolvedValueOnce({
          id: serverIds[0],
          owner: userAddress,
          serverAddress: serverAddresses[0],
          publicKey: `0x${"0".repeat(64)}`,
          url: "https://server1.example.com",
        }) // servers(serverIds[0])
        .mockResolvedValueOnce({
          id: serverIds[1],
          owner: userAddress,
          serverAddress: serverAddresses[1],
          publicKey: `0x${"0".repeat(64)}`,
          url: "https://server2.example.com",
        }) // servers(serverIds[1])
        .mockResolvedValueOnce({
          id: serverIds[2],
          owner: userAddress,
          serverAddress: serverAddresses[2],
          publicKey: `0x${"0".repeat(64)}`,
          url: "https://server3.example.com",
        }); // servers(serverIds[2])

      // Without subgraph configured, should use RPC directly
      const contextNoSubgraph = { ...context, subgraphUrl: undefined };
      const dataControllerRpc = new DataController(contextNoSubgraph);

      const result = await dataControllerRpc.getUserTrustedServers({
        user: userAddress,
        limit: 10,
      });

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        id: `${userAddress.toLowerCase()}-1`,
        serverAddress: serverAddresses[0],
        serverUrl: "https://server1.example.com",
        trustedAt: expect.any(BigInt),
        user: userAddress,
        trustIndex: 0,
      });
    });

    it("should handle pagination correctly", async () => {
      mockPublicClient.readContract
        .mockResolvedValueOnce(10n) // Total count is 10
        .mockResolvedValueOnce(3n) // userServerIdsAt(2)
        .mockResolvedValueOnce(4n) // userServerIdsAt(3)
        .mockResolvedValueOnce({
          id: 3n,
          owner: userAddress,
          serverAddress: serverAddresses[2],
          publicKey: `0x${"0".repeat(64)}`,
          url: "https://server3.example.com",
        })
        .mockResolvedValueOnce({
          id: 4n,
          owner: userAddress,
          serverAddress: serverAddresses[0],
          publicKey: `0x${"0".repeat(64)}`,
          url: "https://server1.example.com",
        });

      // Without subgraph configured, should use RPC directly
      const contextNoSubgraph = { ...context, subgraphUrl: undefined };
      const dataControllerRpc = new DataController(contextNoSubgraph);

      const result = await dataControllerRpc.getUserTrustedServers({
        user: userAddress,
        offset: 2,
        limit: 2,
      });

      expect(result).toHaveLength(2);
      expect(result[0].trustIndex).toBe(2);
      expect(result[1].trustIndex).toBe(3);
    });

    it("should handle empty RPC results", async () => {
      mockPublicClient.readContract.mockResolvedValueOnce(0n); // userServerIdsLength returns 0

      // Without subgraph configured, should use RPC directly
      const contextNoSubgraph = { ...context, subgraphUrl: undefined };
      const dataControllerRpc = new DataController(contextNoSubgraph);

      const result = await dataControllerRpc.getUserTrustedServers({
        user: userAddress,
        userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      });

      expect(result).toHaveLength(0);
    });

    it("should handle server info failures gracefully", async () => {
      // Set up to simulate failure for the second server info
      mockServerInfoFailureIndex = 1; // Fail the second server info call

      mockPublicClient.readContract.mockResolvedValueOnce(2n); // userServerIdsLength

      // Without subgraph configured, should use RPC directly
      const contextNoSubgraph = { ...context, subgraphUrl: undefined };
      const dataControllerRpc = new DataController(contextNoSubgraph);

      const result = await dataControllerRpc.getUserTrustedServers({
        user: userAddress,
        userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      });

      expect(result).toHaveLength(2);
      expect(result[0].serverUrl).toBe("https://server1.example.com");
      expect(result[1].serverUrl).toBe(""); // Failed server info returns empty URL
    });
  });

  describe("Automatic fallback behavior", () => {
    it("should fallback to RPC in auto mode", async () => {
      // Mock fetch to fail so subgraph mode falls back to RPC
      (global.fetch as any).mockRejectedValueOnce(
        new Error("Subgraph failure"),
      );

      // Mock RPC calls since subgraph mode always falls back to RPC
      mockPublicClient.readContract
        .mockResolvedValueOnce(2n) // userServerIdsLength
        .mockResolvedValueOnce(serverAddresses[0]) // userServerIdsAt
        .mockResolvedValueOnce(serverAddresses[1]) // userServerIdsAt
        .mockResolvedValueOnce({ url: "https://server1.example.com" }) // servers
        .mockResolvedValueOnce({ url: "https://server2.example.com" }); // servers

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        subgraphUrl: "https://subgraph.example.com",
        userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      });

      expect(result).toHaveLength(2);
      expect(mockPublicClient.readContract).toHaveBeenCalled();
    });

    it("should fallback to RPC when subgraph fails", async () => {
      // Subgraph fails
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      // RPC succeeds
      mockPublicClient.readContract
        .mockResolvedValueOnce(2n) // userServerIdsLength
        .mockResolvedValueOnce(serverAddresses[0]) // userServerIdsAt(0)
        .mockResolvedValueOnce(serverAddresses[1]) // userServerIdsAt(1)
        .mockResolvedValueOnce({ url: "https://server1.example.com" })
        .mockResolvedValueOnce({ url: "https://server2.example.com" });

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        subgraphUrl: "https://subgraph.example.com",
        userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      });

      expect(result).toHaveLength(2);
      expect(mockPublicClient.readContract).toHaveBeenCalled();
    });

    it("should fallback to RPC when no subgraphUrl is provided", async () => {
      // No subgraphUrl provided, should skip subgraph and go to RPC
      mockPublicClient.readContract
        .mockResolvedValueOnce(1n) // userServerIdsLength
        .mockResolvedValueOnce(serverAddresses[0]) // userServerIdsAt(0)
        .mockResolvedValueOnce({ url: "https://server1.example.com" });

      // Set context without subgraphUrl
      const contextWithoutSubgraph = {
        ...context,
        subgraphUrl: undefined,
        userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      };
      const dataControllerNoSubgraph = new DataController(
        contextWithoutSubgraph,
      );

      const result = await dataControllerNoSubgraph.getUserTrustedServers({
        user: userAddress,
      });

      expect(result).toHaveLength(1);
      expect(mockPublicClient.readContract).toHaveBeenCalled();
    });

    it("should throw error when RPC fails after subgraph fallback", async () => {
      // Subgraph fails
      (global.fetch as any).mockRejectedValueOnce(new Error("Subgraph down"));

      // RPC fails
      mockPublicClient.readContract.mockRejectedValueOnce(
        new Error("RPC error"),
      );

      await expect(
        dataController.getUserTrustedServers({
          user: userAddress,
          subgraphUrl: "https://subgraph.example.com",
          userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
        }),
      ).rejects.toThrow("RPC query failed: RPC error");
    });
  });

  describe("Default behavior", () => {
    it("should automatically choose best method", async () => {
      // Should default to 'auto' mode, but will now fall back to RPC
      mockPublicClient.readContract
        .mockResolvedValueOnce(2n) // userServerIdsLength
        .mockResolvedValueOnce(1n) // userServerIdsAt(0)
        .mockResolvedValueOnce(2n) // userServerIdsAt(1)
        .mockResolvedValueOnce({
          id: 1n,
          owner: userAddress,
          serverAddress: serverAddresses[0],
          publicKey: `0x${"0".repeat(64)}`,
          url: "https://server1.example.com",
        }) // servers(1)
        .mockResolvedValueOnce({
          id: 2n,
          owner: userAddress,
          serverAddress: serverAddresses[1],
          publicKey: `0x${"0".repeat(64)}`,
          url: "https://server2.example.com",
        }); // servers(2)

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
      });

      expect(result).toHaveLength(2);
    });

    it("should return simple array structure", async () => {
      // Mock fetch to fail so subgraph mode falls back to RPC
      (global.fetch as any).mockRejectedValueOnce(
        new Error("Subgraph unavailable"),
      );

      // Mock RPC calls since subgraph mode now falls back to RPC
      mockPublicClient.readContract
        .mockResolvedValueOnce(1n) // userServerIdsLength
        .mockResolvedValueOnce(1n) // userServerIdsAt(0)
        .mockResolvedValueOnce({
          id: 1n,
          owner: userAddress,
          serverAddress: serverAddresses[0],
          publicKey: `0x${"0".repeat(64)}`,
          url: "https://server1.example.com",
        }); // servers(1)

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
      });

      // Now returns simple array
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);

      // Verify server structure
      expect(result[0]).toEqual({
        id: expect.any(String),
        serverAddress: expect.any(String),
        serverUrl: expect.any(String),
        trustedAt: expect.any(BigInt),
        user: expect.any(String),
        trustIndex: expect.any(Number),
      });
    });
  });

  describe("Performance and edge cases", () => {
    it("should handle large server lists efficiently in RPC mode", async () => {
      const largeCount = 1000;
      const requestedLimit = 50;

      mockPublicClient.readContract.mockResolvedValueOnce(BigInt(largeCount)); // userServerIdsLength

      // Mock server ID calls
      for (let i = 0; i < requestedLimit; i++) {
        mockPublicClient.readContract.mockResolvedValueOnce(
          serverAddresses[i % serverAddresses.length],
        );
      }

      // Mock server info calls
      for (let i = 0; i < requestedLimit; i++) {
        mockPublicClient.readContract.mockResolvedValueOnce({
          url: `https://server${i}.example.com`,
        });
      }

      // Without subgraph configured, should use RPC directly
      const contextNoSubgraph = { ...context, subgraphUrl: undefined };
      const dataControllerRpc = new DataController(contextNoSubgraph);

      const result = await dataControllerRpc.getUserTrustedServers({
        user: userAddress,
        limit: requestedLimit,
      });

      expect(result).toHaveLength(requestedLimit);
    });

    it("should handle network timeouts gracefully", async () => {
      // Simulate a timeout on subgraph
      (global.fetch as any).mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => {
              reject(new Error("Timeout"));
            }, 100),
          ),
      );

      // RPC backup succeeds
      mockPublicClient.readContract
        .mockResolvedValueOnce(1n)
        .mockResolvedValueOnce(serverAddresses[0])
        .mockResolvedValueOnce({ url: "https://backup.example.com" });

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        subgraphUrl: "https://slow-subgraph.example.com",
        userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      });

      expect(result).toHaveLength(1);
      expect(mockPublicClient.readContract).toHaveBeenCalled();
    });
  });

  describe("Edge cases and error handling", () => {
    it("should throw error when RPC fails and no subgraph available", async () => {
      // Without subgraph configured, should use RPC directly
      const contextNoSubgraph = { ...context, subgraphUrl: undefined };
      const dataControllerRpc = new DataController(contextNoSubgraph);

      // RPC fails
      mockPublicClient.readContract.mockRejectedValueOnce(
        new Error("RPC connection failed"),
      );

      await expect(
        dataControllerRpc.getUserTrustedServers({
          user: userAddress,
        }),
      ).rejects.toThrow("RPC query failed: RPC connection failed");
    });

    it("should handle successful RPC query", async () => {
      // Without subgraph configured, should use RPC directly
      const contextNoSubgraph = { ...context, subgraphUrl: undefined };
      const dataControllerRpc = new DataController(contextNoSubgraph);

      // Mock RPC calls with successful response
      mockPublicClient.readContract
        .mockResolvedValueOnce(1n) // userServerIdsLength
        .mockResolvedValueOnce(serverAddresses[0]) // userServerIdsAt
        .mockResolvedValueOnce({ url: "https://server1.example.com" }); // servers

      const result = await dataControllerRpc.getUserTrustedServers({
        user: userAddress,
        userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      });

      expect(result).toHaveLength(1);
    });

    it("should handle successful subgraph query", async () => {
      // Mock successful subgraph response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              user: {
                id: userAddress.toLowerCase(),
                serverTrusts: [
                  {
                    id: "trust-1",
                    server: {
                      id: "1",
                      serverAddress: serverAddresses[0],
                      url: "https://server1.example.com",
                      publicKey: `0x${"0".repeat(64)}`,
                    },
                    trustedAt: "1234567890",
                    trustedAtBlock: "100",
                    untrustedAtBlock: null,
                    transactionHash: `0x${"0".repeat(64)}`,
                  },
                ],
              },
            },
          }),
      });

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        subgraphUrl: "https://subgraph.example.com",
        userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      });

      expect(result).toHaveLength(1);
    });

    it("should handle subgraph query with pagination", async () => {
      // Mock successful subgraph response with multiple servers
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              user: {
                id: userAddress.toLowerCase(),
                serverTrusts: [
                  {
                    id: "trust-1",
                    server: {
                      id: "1",
                      serverAddress: serverAddresses[0],
                      url: "https://server1.example.com",
                      publicKey: `0x${"0".repeat(64)}`,
                    },
                    trustedAt: "1234567890",
                    trustedAtBlock: "100",
                    untrustedAtBlock: null,
                    transactionHash: `0x${"0".repeat(64)}`,
                  },
                  {
                    id: "trust-2",
                    server: {
                      id: "2",
                      serverAddress: serverAddresses[1],
                      url: "https://server2.example.com",
                      publicKey: `0x${"0".repeat(64)}`,
                    },
                    trustedAt: "1234567891",
                    trustedAtBlock: "101",
                    untrustedAtBlock: null,
                    transactionHash: `0x${"0".repeat(64)}`,
                  },
                  {
                    id: "trust-3",
                    server: {
                      id: "3",
                      serverAddress: serverAddresses[2],
                      url: "https://server3.example.com",
                      publicKey: `0x${"0".repeat(64)}`,
                    },
                    trustedAt: "1234567892",
                    trustedAtBlock: "102",
                    untrustedAtBlock: null,
                    transactionHash: `0x${"0".repeat(64)}`,
                  },
                ],
              },
            },
          }),
      });

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        subgraphUrl: "https://subgraph.example.com",
        limit: 2,
        offset: 1,
      });

      expect(result).toHaveLength(2); // limit applied
    });
  });
});
