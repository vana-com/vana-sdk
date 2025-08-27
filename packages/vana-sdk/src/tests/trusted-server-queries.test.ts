import { describe, it, expect, beforeEach, vi } from "vitest";
import { type Address } from "viem";
import { vanaMainnet } from "../chains/definitions";
import {
  PermissionsController,
  type ControllerContext,
} from "../controllers/permissions";
import { createMockPlatformAdapter } from "./mocks/platformAdapter";

// Mock external dependencies
vi.mock("../config/addresses", () => ({
  getContractAddress: vi
    .fn()
    .mockReturnValue("0x1234567890123456789012345678901234567890"),
  getUtilityAddress: vi
    .fn()
    .mockReturnValue("0xcA11bde05977b3631167028862bE2a173976CA11"),
}));

// Track gasAwareMulticall calls to return appropriate data
let mockServerInfoFailure = false;
let mockServerInfoFailureIndices: number[] = [];

vi.mock("../utils/multicall", () => ({
  gasAwareMulticall: vi.fn().mockImplementation(async (_client, params) => {
    // Check if allowFailure is true (for server info calls)
    if (params.allowFailure) {
      // This is a getServerInfoBatch call - return server info with status wrapper
      if (mockServerInfoFailure) {
        // Return failure status for all server info
        return params.contracts.map((_: any) => ({
          status: "failure",
          error: new Error("Server info failed"),
        }));
      }

      // Handle partial failures based on indices
      return params.contracts.map((_contract: any, i: number) => {
        // Check if this index should fail
        if (mockServerInfoFailureIndices.includes(i)) {
          return {
            status: "failure",
            error: new Error("Server info failed"),
          };
        }

        const serverInfos = [
          {
            owner: "0x1111111111111111111111111111111111111111",
            serverAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            publicKey: "0xpubkey1",
            url: "https://server1.example.com",
          },
          {
            owner: "0x2222222222222222222222222222222222222222",
            serverAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            publicKey: "0xpubkey2",
            url: "https://server2.example.com",
          },
          {
            owner: "0x3333333333333333333333333333333333333333",
            serverAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
            publicKey: "0xpubkey3",
            url: "https://server3.example.com",
          },
        ];

        const serverInfo = serverInfos[i] || serverInfos[0];

        return {
          status: "success",
          result: {
            id: BigInt(i + 1),
            ...serverInfo,
          },
        };
      });
    }

    // For getTrustedServersPaginated, it calls gasAwareMulticall to get server IDs
    // Return array of results based on the contracts passed
    // Need to look at the contract args to determine the proper server ID
    return params.contracts.map((contract: any, i: number) => {
      // Check if this is a userServerIdsAt call
      if (contract.functionName === "userServerIdsAt" && contract.args) {
        // The second argument is the index
        const index = Number(contract.args[1]);
        return BigInt(index + 1); // Return server ID based on the requested index
      }
      return BigInt(i + 1);
    });
  }),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

describe("Enhanced Trusted Server Queries", () => {
  let permissionsController: PermissionsController;
  let mockPublicClient: {
    readContract: ReturnType<typeof vi.fn>;
    getChainId: ReturnType<typeof vi.fn>;
    multicall: ReturnType<typeof vi.fn>;
  };
  let mockWalletClient: {
    getAddresses: ReturnType<typeof vi.fn>;
    getChainId: ReturnType<typeof vi.fn>;
    chain: typeof vanaMainnet | undefined;
  };
  let context: ControllerContext;

  const userAddress: Address = "0x1234567890123456789012345678901234567890";
  const serverIds: number[] = [1, 2, 3, 4, 5];

  beforeEach(() => {
    vi.clearAllMocks();
    mockServerInfoFailure = false; // Reset server info failure flag
    mockServerInfoFailureIndices = []; // Reset partial failure indices

    // Create mock clients
    mockPublicClient = {
      readContract: vi.fn(),
      getChainId: vi.fn().mockResolvedValue(vanaMainnet.id),
      multicall: vi.fn().mockResolvedValue([]),
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
    };

    permissionsController = new PermissionsController(context);
  });

  describe("getTrustedServersCount", () => {
    it("should return the total count of trusted servers for a user", async () => {
      // Mock the contract call to return server count
      mockPublicClient.readContract.mockResolvedValueOnce(5n);

      const count = await permissionsController.getTrustedServersCount();

      expect(count).toBe(5);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: expect.any(String),
        abi: expect.any(Array),
        functionName: "userServerIdsLength",
        args: [userAddress],
      });
    });

    it("should return count for a specific user address", async () => {
      const otherUser: Address = "0x9999999999999999999999999999999999999999";
      mockPublicClient.readContract.mockResolvedValueOnce(3n);

      const count =
        await permissionsController.getTrustedServersCount(otherUser);

      expect(count).toBe(3);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: expect.any(String),
        abi: expect.any(Array),
        functionName: "userServerIdsLength",
        args: [otherUser],
      });
    });

    it("should handle zero trusted servers", async () => {
      mockPublicClient.readContract.mockResolvedValueOnce(0n);

      const count = await permissionsController.getTrustedServersCount();

      expect(count).toBe(0);
    });

    it("should throw BlockchainError on contract call failure", async () => {
      mockPublicClient.readContract.mockRejectedValueOnce(
        new Error("Contract call failed"),
      );

      await expect(
        permissionsController.getTrustedServersCount(),
      ).rejects.toThrow("Failed to get trusted servers count");
    });
  });

  describe("getTrustedServersPaginated", () => {
    it("should return paginated trusted servers with default parameters", async () => {
      // Mock total count
      const serverIds = [1n, 2n, 3n, 4n, 5n];
      mockPublicClient.readContract
        .mockResolvedValueOnce(5n) // userServerIdsLength
        .mockResolvedValueOnce(serverIds[0]) // userServerIdsAt(0)
        .mockResolvedValueOnce(serverIds[1]) // userServerIdsAt(1)
        .mockResolvedValueOnce(serverIds[2]) // userServerIdsAt(2)
        .mockResolvedValueOnce(serverIds[3]) // userServerIdsAt(3)
        .mockResolvedValueOnce(serverIds[4]); // userServerIdsAt(4)

      const result = await permissionsController.getTrustedServersPaginated();

      expect(result).toEqual({
        servers: [1, 2, 3, 4, 5], // Numeric IDs, not addresses
        total: 5,
        offset: 0,
        limit: 50, // Default limit
        hasMore: false,
      });
    });

    it("should respect pagination parameters", async () => {
      mockPublicClient.readContract
        .mockResolvedValueOnce(10n) // Total count is 10
        .mockResolvedValueOnce(3n) // userServerIdsAt(2)
        .mockResolvedValueOnce(4n); // userServerIdsAt(3)

      const result = await permissionsController.getTrustedServersPaginated({
        offset: 2,
        limit: 2,
      });

      expect(result).toEqual({
        servers: [3, 4], // Numeric IDs, not addresses
        total: 10,
        offset: 2,
        limit: 2,
        hasMore: true, // 2 + 2 < 10
      });

      // Implementation now uses gasAwareMulticall instead of individual readContract calls
    });

    it("should handle empty result sets", async () => {
      mockPublicClient.readContract.mockResolvedValueOnce(0n);

      const result = await permissionsController.getTrustedServersPaginated();

      expect(result).toEqual({
        servers: [],
        total: 0,
        offset: 0,
        limit: 50,
        hasMore: false,
      });
    });

    it("should handle offset beyond available servers", async () => {
      mockPublicClient.readContract.mockResolvedValueOnce(3n); // Total count is 3

      const result = await permissionsController.getTrustedServersPaginated({
        offset: 5,
        limit: 2,
      });

      expect(result).toEqual({
        servers: [],
        total: 3,
        offset: 5,
        limit: 2,
        hasMore: false,
      });
    });

    it("should work with different user addresses", async () => {
      const otherUser: Address = "0x9999999999999999999999999999999999999999";
      mockPublicClient.readContract
        .mockResolvedValueOnce(2n)
        .mockResolvedValueOnce(1n)
        .mockResolvedValueOnce(2n);

      const result = await permissionsController.getTrustedServersPaginated({
        userAddress: otherUser,
      });

      expect(result.servers).toEqual([1, 2]); // Numeric IDs, not addresses
      expect(mockPublicClient.readContract).toHaveBeenNthCalledWith(1, {
        address: expect.any(String),
        abi: expect.any(Array),
        functionName: "userServerIdsLength",
        args: [otherUser],
      });
    });
  });

  describe("getTrustedServersWithInfo", () => {
    it("should return trusted servers with their info", async () => {
      const serverInfos = [
        {
          owner: "0x1111111111111111111111111111111111111111",
          serverAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          publicKey: "0xpubkey1",
          url: "https://server1.example.com",
        },
        {
          owner: "0x2222222222222222222222222222222222222222",
          serverAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          publicKey: "0xpubkey2",
          url: "https://server2.example.com",
        },
        {
          owner: "0x3333333333333333333333333333333333333333",
          serverAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
          publicKey: "0xpubkey3",
          url: "https://server3.example.com",
        },
      ];

      // Create a proper mock implementation that handles different contract calls
      mockPublicClient.readContract.mockImplementation(async (args: any) => {
        // Handle pagination calls to DataPortabilityServers contract
        if (args.functionName === "userServerIdsLength") {
          return 3n;
        }
        if (args.functionName === "userServerIdsAt") {
          const index = Number(args.args[1]);
          return BigInt(index + 1); // Return server IDs 1, 2, 3
        }
        // Handle server info calls
        if (args.functionName === "servers") {
          const serverId = Number(args.args[0]);
          return serverInfos[serverId - 1]; // Return server info for IDs 1, 2, 3
        }
        throw new Error(`Unexpected contract call: ${args.functionName}`);
      });

      const result = await permissionsController.getTrustedServersWithInfo();

      expect(result).toEqual([
        {
          id: 1n,
          owner: serverInfos[0].owner,
          serverAddress: serverInfos[0].serverAddress,
          publicKey: serverInfos[0].publicKey,
          url: serverInfos[0].url,
          startBlock: 0n,
          endBlock: 0n,
        },
        {
          id: 2n,
          owner: serverInfos[1].owner,
          serverAddress: serverInfos[1].serverAddress,
          publicKey: serverInfos[1].publicKey,
          url: serverInfos[1].url,
          startBlock: 0n,
          endBlock: 0n,
        },
        {
          id: 3n,
          owner: serverInfos[2].owner,
          serverAddress: serverInfos[2].serverAddress,
          publicKey: serverInfos[2].publicKey,
          url: serverInfos[2].url,
          startBlock: 0n,
          endBlock: 0n,
        },
      ]);
    });

    it("should respect limit parameter", async () => {
      const serverInfos = [
        {
          owner: "0x1111111111111111111111111111111111111111",
          serverAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          publicKey: "0xpubkey1",
          url: "https://server1.example.com",
        },
        {
          owner: "0x2222222222222222222222222222222222222222",
          serverAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          publicKey: "0xpubkey2",
          url: "https://server2.example.com",
        },
      ];

      // Reset and setup mock implementation
      mockPublicClient.readContract.mockReset();
      mockPublicClient.readContract.mockImplementation(async (args: any) => {
        if (args.functionName === "userServerIdsLength") {
          return 5n; // Total count is 5
        }
        if (args.functionName === "userServerIdsAt") {
          const index = Number(args.args[1]);
          return BigInt(index + 1); // Return server IDs 1, 2, 3, 4, 5
        }
        if (args.functionName === "servers") {
          const serverId = Number(args.args[0]);
          if (serverId <= 2) {
            return serverInfos[serverId - 1]; // Only return first 2 servers
          }
          throw new Error("Server not found");
        }
        throw new Error(`Unexpected contract call: ${args.functionName}`);
      });

      const result = await permissionsController.getTrustedServersWithInfo({
        limit: 2,
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1n);
      expect(result[1].id).toBe(2n);
    });

    it("should handle servers with missing info gracefully", async () => {
      // Set up partial failure - second server info will fail
      mockServerInfoFailureIndices = [1];

      const goodServerInfo = {
        owner: "0x1111111111111111111111111111111111111111",
        serverAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        publicKey: "0xpubkey1",
        url: "https://server1.example.com",
      };

      // Reset and setup mock implementation
      mockPublicClient.readContract.mockReset();
      mockPublicClient.readContract.mockImplementation(async (args: any) => {
        if (args.functionName === "userServerIdsLength") {
          return 2n;
        }
        if (args.functionName === "userServerIdsAt") {
          const index = Number(args.args[1]);
          return BigInt(index + 1); // Return server IDs 1, 2
        }
        if (args.functionName === "servers") {
          const serverId = Number(args.args[0]);
          if (serverId === 1) {
            return goodServerInfo; // First server succeeds
          }
          throw new Error("Server not found"); // Second server fails
        }
        throw new Error(`Unexpected contract call: ${args.functionName}`);
      });

      const result = await permissionsController.getTrustedServersWithInfo();

      expect(result).toEqual([
        {
          id: 1n,
          owner: goodServerInfo.owner,
          serverAddress: goodServerInfo.serverAddress,
          publicKey: goodServerInfo.publicKey,
          url: goodServerInfo.url,
          startBlock: 0n,
          endBlock: 0n,
        },
        {
          id: 2n,
          owner: "0x0000000000000000000000000000000000000000",
          serverAddress: "0x0000000000000000000000000000000000000000",
          publicKey: "",
          url: "",
          startBlock: 0n,
          endBlock: 0n,
        },
      ]);
    });
  });

  describe("getServerInfoBatch", () => {
    it("should retrieve info for multiple servers efficiently", async () => {
      const serverInfos = [
        {
          id: 1n,
          owner: "0x1111111111111111111111111111111111111111",
          serverAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          publicKey: "0xpubkey1",
          url: "https://server1.example.com",
        },
        {
          id: 2n,
          owner: "0x2222222222222222222222222222222222222222",
          serverAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          publicKey: "0xpubkey2",
          url: "https://server2.example.com",
        },
        {
          id: 3n,
          owner: "0x3333333333333333333333333333333333333333",
          serverAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
          publicKey: "0xpubkey3",
          url: "https://server3.example.com",
        },
      ];

      const serverIds = [1, 2, 3]; // Use numeric server IDs instead of addresses

      // Reset and setup mock
      mockPublicClient.readContract.mockReset();
      mockWalletClient.getChainId = vi.fn().mockResolvedValue(vanaMainnet.id);
      mockPublicClient.readContract.mockImplementation(async (args: any) => {
        if (args.functionName === "servers") {
          const serverId = Number(args.args[0]);
          return serverInfos[serverId - 1]; // Return server info for IDs 1, 2, 3
        }
        throw new Error(`Unexpected contract call: ${args.functionName}`);
      });

      const result = await permissionsController.getServerInfoBatch(serverIds);

      expect(result.servers.size).toBe(3);
      expect(result.servers.get(serverIds[0])).toEqual({
        id: 1,
        owner: serverInfos[0].owner,
        serverAddress: serverInfos[0].serverAddress,
        publicKey: serverInfos[0].publicKey,
        url: serverInfos[0].url,
      });
      expect(result.servers.get(serverIds[1])).toEqual({
        id: 2,
        owner: serverInfos[1].owner,
        serverAddress: serverInfos[1].serverAddress,
        publicKey: serverInfos[1].publicKey,
        url: serverInfos[1].url,
      });
      expect(result.servers.get(serverIds[2])).toEqual({
        id: 3,
        owner: serverInfos[2].owner,
        serverAddress: serverInfos[2].serverAddress,
        publicKey: serverInfos[2].publicKey,
        url: serverInfos[2].url,
      });
      expect(result.failed).toEqual([]);
    });

    it("should handle partial failures in batch requests", async () => {
      // Set up partial failure - second server (index 1) will fail
      mockServerInfoFailureIndices = [1];

      const serverIds = [1, 2, 3]; // Use numeric server IDs instead of addresses

      const goodServerInfos = [
        {
          id: 1n,
          owner: "0x1111111111111111111111111111111111111111",
          serverAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          publicKey: "0xpubkey1",
          url: "https://server1.example.com",
        },
        {
          id: 3n,
          owner: "0x3333333333333333333333333333333333333333",
          serverAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
          publicKey: "0xpubkey3",
          url: "https://server3.example.com",
        },
      ];

      // Reset and setup mock
      mockPublicClient.readContract.mockReset();
      mockWalletClient.getChainId = vi.fn().mockResolvedValue(vanaMainnet.id);
      mockPublicClient.readContract.mockImplementation(async (args: any) => {
        if (args.functionName === "servers") {
          const serverId = Number(args.args[0]);
          if (serverId === 1) {
            return goodServerInfos[0];
          } else if (serverId === 3) {
            return goodServerInfos[1];
          } else {
            throw new Error("Server not found");
          }
        }
        throw new Error(`Unexpected contract call: ${args.functionName}`);
      });

      const result = await permissionsController.getServerInfoBatch(serverIds);

      expect(result.servers.size).toBe(2);
      expect(result.servers.get(serverIds[0])).toEqual({
        id: 1,
        owner: goodServerInfos[0].owner,
        serverAddress: goodServerInfos[0].serverAddress,
        publicKey: goodServerInfos[0].publicKey,
        url: goodServerInfos[0].url,
      });
      expect(result.servers.get(serverIds[2])).toEqual({
        id: 3,
        owner: goodServerInfos[1].owner,
        serverAddress: goodServerInfos[1].serverAddress,
        publicKey: goodServerInfos[1].publicKey,
        url: goodServerInfos[1].url,
      });
      expect(result.failed).toEqual([serverIds[1]]);
    });

    it("should handle empty input array", async () => {
      const result = await permissionsController.getServerInfoBatch([]);

      expect(result.servers.size).toBe(0);
      expect(result.failed).toEqual([]);
      expect(mockPublicClient.readContract).not.toHaveBeenCalled();
    });

    it("should handle all failures gracefully", async () => {
      // Set up to fail all server info requests
      mockServerInfoFailure = true;

      const testServerIds = serverIds.slice(0, 2);

      mockPublicClient.readContract
        .mockRejectedValueOnce(new Error("Server 1 not found"))
        .mockRejectedValueOnce(new Error("Server 2 not found"));

      const result =
        await permissionsController.getServerInfoBatch(testServerIds);

      expect(result.servers.size).toBe(0);
      expect(result.failed).toEqual(testServerIds);
    });
  });

  describe("checkServerTrustStatus", () => {
    it("should correctly identify trusted servers", async () => {
      // Mock user's trusted servers
      mockPublicClient.readContract.mockResolvedValueOnce([
        serverIds[0],
        serverIds[2],
        serverIds[4],
      ]);

      const result = await permissionsController.checkServerTrustStatus(
        serverIds[0],
      );

      expect(result).toEqual({
        serverId: serverIds[0],
        isTrusted: true,
        trustIndex: 0,
      });
    });

    it("should correctly identify untrusted servers", async () => {
      // Mock user's trusted servers (doesn't include the queried server)
      mockPublicClient.readContract.mockResolvedValueOnce([
        serverIds[1],
        serverIds[3],
      ]);

      const result = await permissionsController.checkServerTrustStatus(
        serverIds[0],
      );

      expect(result).toEqual({
        serverId: serverIds[0],
        isTrusted: false,
        trustIndex: undefined,
      });
    });

    it("should work with different user addresses", async () => {
      const otherUser: Address = "0x9999999999999999999999999999999999999999";
      mockPublicClient.readContract.mockResolvedValueOnce([serverIds[0]]);

      const result = await permissionsController.checkServerTrustStatus(
        serverIds[0],
        otherUser,
      );

      expect(result.isTrusted).toBe(true);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: expect.any(String),
        abi: expect.any(Array),
        functionName: "userServerIdsValues",
        args: [otherUser],
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle contract call failures with proper error messages", async () => {
      mockPublicClient.readContract.mockRejectedValueOnce(
        new Error("Network error"),
      );

      await expect(
        permissionsController.getTrustedServersCount(),
      ).rejects.toThrow("Failed to get trusted servers count: Network error");
    });

    it("should handle invalid user addresses", async () => {
      const invalidAddress = "0xinvalid" as Address;
      mockPublicClient.readContract.mockRejectedValue(
        new Error("Invalid address"),
      );

      await expect(
        permissionsController.getTrustedServersCount(invalidAddress),
      ).rejects.toThrow("Failed to get trusted servers count");
    });

    it("should handle chain ID unavailability", async () => {
      mockWalletClient.chain = undefined;
      mockWalletClient.getChainId = vi
        .fn()
        .mockRejectedValue(new Error("Chain not connected"));

      await expect(
        permissionsController.getTrustedServersCount(),
      ).rejects.toThrow();
    });
  });
});
