/* eslint-disable @typescript-eslint/no-explicit-any */
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
}));

vi.mock("../abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

describe("Enhanced Trusted Server Queries", () => {
  let permissionsController: PermissionsController;
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
    "0x4444444444444444444444444444444444444444",
    "0x5555555555555555555555555555555555555555",
  ];
  const serverIds: number[] = [1, 2, 3, 4, 5];

  beforeEach(() => {
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
      mockPublicClient.readContract
        .mockResolvedValueOnce(5n) // userServerIdsLength
        .mockResolvedValueOnce(serverAddresses[0]) // userServerIdsAt(0)
        .mockResolvedValueOnce(serverAddresses[1]) // userServerIdsAt(1)
        .mockResolvedValueOnce(serverAddresses[2]) // userServerIdsAt(2)
        .mockResolvedValueOnce(serverAddresses[3]) // userServerIdsAt(3)
        .mockResolvedValueOnce(serverAddresses[4]); // userServerIdsAt(4)

      const result = await permissionsController.getTrustedServersPaginated();

      expect(result).toEqual({
        servers: serverAddresses,
        total: 5,
        offset: 0,
        limit: 50, // Default limit
        hasMore: false,
      });
    });

    it("should respect pagination parameters", async () => {
      mockPublicClient.readContract
        .mockResolvedValueOnce(10n) // Total count is 10
        .mockResolvedValueOnce(serverAddresses[2]) // userServerIdsAt(2)
        .mockResolvedValueOnce(serverAddresses[3]); // userServerIdsAt(3)

      const result = await permissionsController.getTrustedServersPaginated({
        offset: 2,
        limit: 2,
      });

      expect(result).toEqual({
        servers: [serverAddresses[2], serverAddresses[3]],
        total: 10,
        offset: 2,
        limit: 2,
        hasMore: true, // 2 + 2 < 10
      });

      // Verify the correct contract calls were made
      expect(mockPublicClient.readContract).toHaveBeenNthCalledWith(2, {
        address: expect.any(String),
        abi: expect.any(Array),
        functionName: "userServerIdsAt",
        args: [userAddress, 2n],
      });
      expect(mockPublicClient.readContract).toHaveBeenNthCalledWith(3, {
        address: expect.any(String),
        abi: expect.any(Array),
        functionName: "userServerIdsAt",
        args: [userAddress, 3n],
      });
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
        .mockResolvedValueOnce(serverAddresses[0])
        .mockResolvedValueOnce(serverAddresses[1]);

      const result = await permissionsController.getTrustedServersPaginated({
        userAddress: otherUser,
      });

      expect(result.servers).toEqual([serverAddresses[0], serverAddresses[1]]);
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
        { url: "https://server1.example.com" },
        { url: "https://server2.example.com" },
        { url: "https://server3.example.com" },
      ];

      // Mock getting server IDs
      mockPublicClient.readContract
        .mockResolvedValueOnce(3n) // count
        .mockResolvedValueOnce(serverAddresses[0]) // server 0
        .mockResolvedValueOnce(serverAddresses[1]) // server 1
        .mockResolvedValueOnce(serverAddresses[2]) // server 2
        // Mock getting server info
        .mockResolvedValueOnce(serverInfos[0]) // server info 0
        .mockResolvedValueOnce(serverInfos[1]) // server info 1
        .mockResolvedValueOnce(serverInfos[2]); // server info 2

      const result = await permissionsController.getTrustedServersWithInfo();

      expect(result).toEqual([
        {
          serverId: serverAddresses[0],
          url: serverInfos[0].url,
          isTrusted: true,
          trustIndex: 0,
        },
        {
          serverId: serverAddresses[1],
          url: serverInfos[1].url,
          isTrusted: true,
          trustIndex: 1,
        },
        {
          serverId: serverAddresses[2],
          url: serverInfos[2].url,
          isTrusted: true,
          trustIndex: 2,
        },
      ]);
    });

    it("should respect limit parameter", async () => {
      const serverInfos = [
        { url: "https://server1.example.com" },
        { url: "https://server2.example.com" },
      ];

      mockPublicClient.readContract
        .mockResolvedValueOnce(5n) // total count
        .mockResolvedValueOnce(serverAddresses[0])
        .mockResolvedValueOnce(serverAddresses[1])
        .mockResolvedValueOnce(serverInfos[0])
        .mockResolvedValueOnce(serverInfos[1]);

      const result = await permissionsController.getTrustedServersWithInfo({
        limit: 2,
      });

      expect(result).toHaveLength(2);
      expect(result[0].serverId).toBe(serverAddresses[0]);
      expect(result[1].serverId).toBe(serverAddresses[1]);
    });

    it("should handle servers with missing info gracefully", async () => {
      mockPublicClient.readContract
        .mockResolvedValueOnce(2n)
        .mockResolvedValueOnce(serverAddresses[0])
        .mockResolvedValueOnce(serverAddresses[1])
        .mockResolvedValueOnce({ url: "https://server1.example.com" })
        .mockRejectedValueOnce(new Error("Server not found")); // Second server info fails

      const result = await permissionsController.getTrustedServersWithInfo();

      expect(result).toEqual([
        {
          serverId: serverAddresses[0],
          url: "https://server1.example.com",
          isTrusted: true,
          trustIndex: 0,
        },
        {
          serverId: serverAddresses[1],
          url: "",
          isTrusted: true,
          trustIndex: 1,
        },
      ]);
    });
  });

  describe("getServerInfoBatch", () => {
    it("should retrieve info for multiple servers efficiently", async () => {
      const serverInfos = [
        { url: "https://server1.example.com" },
        { url: "https://server2.example.com" },
        { url: "https://server3.example.com" },
      ];

      const serverIds = [1, 2, 3]; // Use numeric server IDs instead of addresses

      mockPublicClient.readContract
        .mockResolvedValueOnce(serverInfos[0])
        .mockResolvedValueOnce(serverInfos[1])
        .mockResolvedValueOnce(serverInfos[2]);

      const result = await permissionsController.getServerInfoBatch(serverIds);

      expect(result.servers.size).toBe(3);
      expect(result.servers.get(serverIds[0])).toEqual(serverInfos[0]);
      expect(result.servers.get(serverIds[1])).toEqual(serverInfos[1]);
      expect(result.servers.get(serverIds[2])).toEqual(serverInfos[2]);
      expect(result.failed).toEqual([]);
    });

    it("should handle partial failures in batch requests", async () => {
      const serverIds = [1, 2, 3]; // Use numeric server IDs instead of addresses

      mockPublicClient.readContract
        .mockResolvedValueOnce({ url: "https://server1.example.com" })
        .mockRejectedValueOnce(new Error("Server not found"))
        .mockResolvedValueOnce({ url: "https://server3.example.com" });

      const result = await permissionsController.getServerInfoBatch(serverIds);

      expect(result.servers.size).toBe(2);
      expect(result.servers.get(serverIds[0])).toEqual({
        url: "https://server1.example.com",
      });
      expect(result.servers.get(serverIds[2])).toEqual({
        url: "https://server3.example.com",
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
      mockPublicClient.readContract.mockRejectedValueOnce(
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
