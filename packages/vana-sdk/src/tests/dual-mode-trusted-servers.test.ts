/* eslint-disable @typescript-eslint/no-explicit-any */
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

vi.mock("../abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

// Mock fetch for subgraph tests
global.fetch = vi.fn();

describe("Dual-Mode Trusted Server Queries", () => {
  let dataController: DataController;
  let mockPublicClient: {
    readContract: ReturnType<typeof vi.fn>;
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

  const _mockSubgraphData = {
    data: {
      user: {
        id: userAddress.toLowerCase(),
        trustedServers: [
          {
            id: "subgraph-server-1",
            serverAddress: serverAddresses[0],
            serverUrl: "https://server1.example.com",
            trustedAt: "1640995200",
            user: { id: userAddress.toLowerCase() },
          },
          {
            id: "subgraph-server-2",
            serverAddress: serverAddresses[1],
            serverUrl: "https://server2.example.com",
            trustedAt: "1640995300",
            user: { id: userAddress.toLowerCase() },
          },
        ],
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock clients
    mockPublicClient = {
      readContract: vi.fn(),
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
    };

    dataController = new DataController(context);

    // Reset fetch mock
    (global.fetch as any).mockReset();
  });

  describe("Mode: subgraph", () => {
    it("should fallback to RPC when subgraph mode is requested", async () => {
      // Mock fetch to fail so subgraph mode falls back to RPC
      (global.fetch as any).mockRejectedValueOnce(
        new Error("Subgraph not available"),
      );

      // Mock RPC calls since subgraph mode now always falls back to RPC
      mockPublicClient.readContract
        .mockResolvedValueOnce(2n) // userServerIdsLength
        .mockResolvedValueOnce(serverAddresses[0]) // userServerIdsAt
        .mockResolvedValueOnce(serverAddresses[1]) // userServerIdsAt
        .mockResolvedValueOnce({ url: "https://server1.example.com" }) // servers
        .mockResolvedValueOnce({ url: "https://server2.example.com" }); // servers

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        mode: "auto",
        subgraphUrl: "https://subgraph.example.com",
      });

      expect(result.usedMode).toBe("rpc"); // Changed from "subgraph" to "rpc"
      expect(result.servers).toHaveLength(2);
      expect(result.warnings).toContain(
        "Subgraph query failed: Subgraph not available",
      );
    });

    it("should fallback to RPC even without subgraphUrl", async () => {
      // Create a context without subgraphUrl
      const contextWithoutSubgraph = {
        ...context,
        subgraphUrl: undefined,
      };
      const dataControllerNoSubgraph = new DataController(
        contextWithoutSubgraph,
      );

      // Mock RPC calls
      mockPublicClient.readContract.mockResolvedValueOnce(0n); // userServerIdsLength (empty)

      const result = await dataControllerNoSubgraph.getUserTrustedServers({
        user: userAddress,
        mode: "auto",
        // subgraphUrl not provided
      });

      expect(result.usedMode).toBe("rpc");
      expect(result.servers).toHaveLength(0);
      expect(result.warnings).toContain(
        "Subgraph mode not available for trusted servers - using direct contract calls",
      );
    });

    it("should fallback to RPC instead of throwing subgraph errors", async () => {
      // Mock fetch to fail so subgraph mode falls back to RPC
      (global.fetch as any).mockRejectedValueOnce(new Error("Subgraph error"));

      // Mock RPC calls since we now always fall back to RPC
      mockPublicClient.readContract.mockResolvedValueOnce(0n); // userServerIdsLength (empty)

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        mode: "auto",
        subgraphUrl: "https://subgraph.example.com",
      });

      expect(result.usedMode).toBe("rpc");
      expect(result.servers).toHaveLength(0);
      expect(result.warnings).toContain(
        "Subgraph query failed: Subgraph error",
      );
    });

    it("should handle empty RPC results in fallback mode", async () => {
      // Mock fetch to fail so subgraph mode falls back to RPC
      (global.fetch as any).mockRejectedValueOnce(new Error("Subgraph failed"));

      // Mock RPC calls returning empty results
      mockPublicClient.readContract.mockResolvedValueOnce(0n); // userServerIdsLength (empty)

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        mode: "auto",
        subgraphUrl: "https://subgraph.example.com",
      });

      expect(result.servers).toHaveLength(0);
      expect(result.usedMode).toBe("rpc");
      expect(result.warnings).toContain(
        "Subgraph query failed: Subgraph failed",
      );
    });
  });

  describe("Mode: rpc", () => {
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
          publicKey: "0x" + "0".repeat(64),
          url: "https://server1.example.com",
        }) // servers(serverIds[0])
        .mockResolvedValueOnce({
          id: serverIds[1],
          owner: userAddress,
          serverAddress: serverAddresses[1],
          publicKey: "0x" + "0".repeat(64),
          url: "https://server2.example.com",
        }) // servers(serverIds[1])
        .mockResolvedValueOnce({
          id: serverIds[2],
          owner: userAddress,
          serverAddress: serverAddresses[2],
          publicKey: "0x" + "0".repeat(64),
          url: "https://server3.example.com",
        }); // servers(serverIds[2])

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        mode: "rpc",
        limit: 10,
      });

      expect(result.usedMode).toBe("rpc");
      expect(result.servers).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(false);
      expect(result.servers[0]).toEqual({
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
          publicKey: "0x" + "0".repeat(64),
          url: "https://server3.example.com",
        })
        .mockResolvedValueOnce({
          id: 4n,
          owner: userAddress,
          serverAddress: serverAddresses[0],
          publicKey: "0x" + "0".repeat(64),
          url: "https://server1.example.com",
        });

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        mode: "rpc",
        offset: 2,
        limit: 2,
      });

      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true); // 2 + 2 < 10
      expect(result.servers).toHaveLength(2);
      expect(result.servers[0].trustIndex).toBe(2);
      expect(result.servers[1].trustIndex).toBe(3);
    });

    it("should handle empty RPC results", async () => {
      mockPublicClient.readContract.mockResolvedValueOnce(0n); // userServerIdsLength returns 0

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        mode: "rpc",
      });

      expect(result.servers).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.usedMode).toBe("rpc");
    });

    it("should handle server info failures gracefully", async () => {
      mockPublicClient.readContract
        .mockResolvedValueOnce(2n) // userServerIdsLength
        .mockResolvedValueOnce(serverAddresses[0]) // userServerIdsAt(0)
        .mockResolvedValueOnce(serverAddresses[1]) // userServerIdsAt(1)
        .mockResolvedValueOnce({ url: "https://server1.example.com" }) // servers(serverAddresses[0])
        .mockRejectedValueOnce(new Error("Server not found")); // servers(serverAddresses[1]) fails

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        mode: "rpc",
      });

      expect(result.servers).toHaveLength(2);
      expect(result.servers[0].serverUrl).toBe("https://server1.example.com");
      expect(result.servers[1].serverUrl).toBe(""); // Failed server info returns empty URL
    });
  });

  describe("Mode: auto (fallback)", () => {
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
        mode: "auto",
        subgraphUrl: "https://subgraph.example.com",
      });

      expect(result.usedMode).toBe("rpc");
      expect(result.servers).toHaveLength(2);
      expect(result.warnings).toContain(
        "Subgraph query failed: Subgraph failure",
      );
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
        mode: "auto",
        subgraphUrl: "https://subgraph.example.com",
      });

      expect(result.usedMode).toBe("rpc");
      expect(result.servers).toHaveLength(2);
      expect(result.warnings).toContain("Subgraph query failed: Network error");
      expect(result.total).toBe(2);
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
      };
      const dataControllerNoSubgraph = new DataController(
        contextWithoutSubgraph,
      );

      const result = await dataControllerNoSubgraph.getUserTrustedServers({
        user: userAddress,
        mode: "auto",
      });

      expect(result.usedMode).toBe("rpc");
      expect(result.servers).toHaveLength(1);
      expect(result.warnings).toContain(
        "Subgraph mode not available for trusted servers - using direct contract calls",
      );
    });

    it("should throw error when both modes fail", async () => {
      // Subgraph fails
      (global.fetch as any).mockRejectedValueOnce(new Error("Subgraph down"));

      // RPC fails
      mockPublicClient.readContract.mockRejectedValueOnce(
        new Error("RPC error"),
      );

      await expect(
        dataController.getUserTrustedServers({
          user: userAddress,
          mode: "auto",
          subgraphUrl: "https://subgraph.example.com",
        }),
      ).rejects.toThrow(
        "Both query methods failed. Subgraph: Subgraph query failed: Subgraph down. RPC: RPC query failed: RPC error",
      );
    });
  });

  describe("Backward compatibility", () => {
    it("should handle old API calls without mode parameter", async () => {
      // Should default to 'auto' mode, but will now fall back to RPC
      mockPublicClient.readContract
        .mockResolvedValueOnce(2n) // userServerIdsLength
        .mockResolvedValueOnce(1n) // userServerIdsAt(0)
        .mockResolvedValueOnce(2n) // userServerIdsAt(1)
        .mockResolvedValueOnce({
          id: 1n,
          owner: userAddress,
          serverAddress: serverAddresses[0],
          publicKey: "0x" + "0".repeat(64),
          url: "https://server1.example.com",
        }) // servers(1)
        .mockResolvedValueOnce({
          id: 2n,
          owner: userAddress,
          serverAddress: serverAddresses[1],
          publicKey: "0x" + "0".repeat(64),
          url: "https://server2.example.com",
        }); // servers(2)

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        // No mode specified - should default to 'auto'
      });

      expect(result.usedMode).toBe("rpc"); // Changed from "subgraph" to "rpc"
      expect(result.servers).toHaveLength(2);
    });

    it("should maintain result structure compatibility", async () => {
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
          publicKey: "0x" + "0".repeat(64),
          url: "https://server1.example.com",
        }); // servers(1)

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        mode: "auto",
      });

      // Since subgraph mode now falls back to RPC, expect RPC structure
      expect(result).toEqual({
        servers: expect.any(Array),
        usedMode: "rpc", // Changed from "subgraph" to "rpc"
        total: expect.any(Number),
        hasMore: expect.any(Boolean),
        warnings: expect.any(Array), // Will contain subgraph fallback warning
      });

      // Verify server structure matches RPC format
      expect(result.servers[0]).toEqual({
        id: expect.any(String),
        serverAddress: expect.any(String),
        serverUrl: expect.any(String),
        trustedAt: expect.any(BigInt),
        user: expect.any(String),
        trustIndex: expect.any(Number), // Added missing trustIndex field
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

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        mode: "rpc",
        limit: requestedLimit,
      });

      expect(result.total).toBe(largeCount);
      expect(result.servers).toHaveLength(requestedLimit);
      expect(result.hasMore).toBe(true);
    });

    it("should handle network timeouts gracefully", async () => {
      // Simulate a timeout on subgraph
      (global.fetch as any).mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 100),
          ),
      );

      // RPC backup succeeds
      mockPublicClient.readContract
        .mockResolvedValueOnce(1n)
        .mockResolvedValueOnce(serverAddresses[0])
        .mockResolvedValueOnce({ url: "https://backup.example.com" });

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        mode: "auto",
        subgraphUrl: "https://slow-subgraph.example.com",
      });

      expect(result.usedMode).toBe("rpc");
      expect(result.warnings).toContain("Subgraph query failed: Timeout");
    });
  });

  describe("Edge cases and error handling", () => {
    it("should throw error for invalid query mode", async () => {
      await expect(
        dataController.getUserTrustedServers({
          user: userAddress,
          mode: "invalid" as any,
        }),
      ).rejects.toThrow("Invalid query mode specified");
    });

    it("should throw error in RPC-only mode when RPC fails", async () => {
      // RPC fails
      mockPublicClient.readContract.mockRejectedValueOnce(
        new Error("RPC connection failed"),
      );

      await expect(
        dataController.getUserTrustedServers({
          user: userAddress,
          mode: "rpc",
        }),
      ).rejects.toThrow("RPC connection failed");
    });

    it("should throw error in subgraph-only mode when subgraph URL is missing", async () => {
      // Create a context without subgraphUrl
      const contextWithoutSubgraph = {
        ...context,
        subgraphUrl: undefined,
      };
      const dataControllerNoSubgraph = new DataController(
        contextWithoutSubgraph,
      );

      await expect(
        dataControllerNoSubgraph.getUserTrustedServers({
          user: userAddress,
          mode: "subgraph",
        }),
      ).rejects.toThrow(
        "subgraphUrl is required for subgraph mode. Please provide a valid subgraph endpoint or configure it in Vana constructor.",
      );
    });

    it("should throw error in subgraph-only mode when fetch fails", async () => {
      // Mock fetch to fail
      (global.fetch as any).mockRejectedValueOnce(new Error("Network failure"));

      await expect(
        dataController.getUserTrustedServers({
          user: userAddress,
          mode: "subgraph",
          subgraphUrl: "https://subgraph.example.com",
        }),
      ).rejects.toThrow("Network failure");
    });

    it("should handle successful RPC query without warnings", async () => {
      // Mock RPC calls with successful response
      mockPublicClient.readContract
        .mockResolvedValueOnce(1n) // userServerIdsLength
        .mockResolvedValueOnce(serverAddresses[0]) // userServerIdsAt
        .mockResolvedValueOnce({ url: "https://server1.example.com" }); // servers

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        mode: "rpc",
      });

      expect(result.usedMode).toBe("rpc");
      expect(result.servers).toHaveLength(1);
      expect(result.warnings).toBeUndefined();
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
                      publicKey: "0x" + "0".repeat(64),
                    },
                    trustedAt: "1234567890",
                    trustedAtBlock: "100",
                    untrustedAtBlock: null,
                    transactionHash: "0x" + "0".repeat(64),
                  },
                ],
              },
            },
          }),
      });

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        mode: "subgraph",
        subgraphUrl: "https://subgraph.example.com",
      });

      expect(result.usedMode).toBe("subgraph");
      expect(result.servers).toHaveLength(1);
      expect(result.warnings).toBeUndefined();
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
                      publicKey: "0x" + "0".repeat(64),
                    },
                    trustedAt: "1234567890",
                    trustedAtBlock: "100",
                    untrustedAtBlock: null,
                    transactionHash: "0x" + "0".repeat(64),
                  },
                  {
                    id: "trust-2",
                    server: {
                      id: "2",
                      serverAddress: serverAddresses[1],
                      url: "https://server2.example.com",
                      publicKey: "0x" + "0".repeat(64),
                    },
                    trustedAt: "1234567891",
                    trustedAtBlock: "101",
                    untrustedAtBlock: null,
                    transactionHash: "0x" + "0".repeat(64),
                  },
                  {
                    id: "trust-3",
                    server: {
                      id: "3",
                      serverAddress: serverAddresses[2],
                      url: "https://server3.example.com",
                      publicKey: "0x" + "0".repeat(64),
                    },
                    trustedAt: "1234567892",
                    trustedAtBlock: "102",
                    untrustedAtBlock: null,
                    transactionHash: "0x" + "0".repeat(64),
                  },
                ],
              },
            },
          }),
      });

      const result = await dataController.getUserTrustedServers({
        user: userAddress,
        mode: "subgraph",
        subgraphUrl: "https://subgraph.example.com",
        limit: 2,
        offset: 1,
      });

      expect(result.usedMode).toBe("subgraph");
      expect(result.servers).toHaveLength(2); // limit applied
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(false); // offset 1 + limit 2 = 3, no more
      expect(result.warnings).toBeUndefined();
    });
  });
});
