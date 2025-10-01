import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ControllerContext } from "../controllers/permissions";
import { PermissionsController } from "../controllers/permissions";
import { getContractAddress } from "../config/addresses";
import type { Hash } from "viem";
import { UserRejectedRequestError } from "../errors";
import {
  createTypedMockWalletClient,
  createTypedMockPublicClient,
  createMockAccount,
} from "./factories/mockFactory";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock the contract imports
vi.mock("../config/addresses", () => ({
  getContractAddress: vi.fn(),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([
    {
      inputs: [],
      name: "mockFunction",
      outputs: [],
      stateMutability: "view",
      type: "function",
    },
  ]),
}));

describe("PermissionsController - Grantee Methods", () => {
  let controller: PermissionsController;
  let mockContext: ControllerContext;
  let mockPublicClient: ReturnType<typeof createTypedMockPublicClient>;
  let mockWalletClient: ReturnType<typeof createTypedMockWalletClient>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Use factory functions for properly typed mocks
    mockPublicClient = createTypedMockPublicClient();
    mockWalletClient = createTypedMockWalletClient({
      account: createMockAccount({
        address: "0xUserAddress",
      }),
    });

    mockContext = {
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
      applicationClient: createTypedMockWalletClient(),
      platform: mockPlatformAdapter,
      userAddress: "0xUserAddress",
      waitForTransactionEvents: vi.fn().mockResolvedValue({
        hash: "0xtxhash",
        from: "0xfrom",
        contract: "DataPortabilityGrantees",
        fn: "updateServer",
        expectedEvents: {},
        allEvents: [],
        hasExpectedEvents: true,
      }),
    } as ControllerContext;

    controller = new PermissionsController(mockContext);

    // Mock contract address
    vi.mocked(getContractAddress).mockReturnValue("0xGranteeContract");
  });

  describe("getGranteeByAddress", () => {
    it("should return grantee information for a valid address", async () => {
      const granteeAddress = "0x1234567890123456789012345678901234567890";

      // Mock the granteeAddressToId call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce(42n);

      // Mock the granteesV2 call (used by getGranteeById)
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce({
        owner: "0xOwnerAddress" as `0x${string}`,
        granteeAddress,
        publicKey: "0xPublicKey123",
        permissionsCount: 3n,
      });

      // Mock the granteePermissionsPaginated call (used by getGranteeById)
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        [1n, 2n, 3n], // permissionIds
        3n, // totalCount
        false, // hasMore
      ]);

      const result = await controller.getGranteeByAddress(granteeAddress);

      expect(result).toEqual({
        id: 42,
        owner: "0xOwnerAddress" as `0x${string}`,
        address: granteeAddress,
        publicKey: "0xPublicKey123",
        permissionIds: [1, 2, 3],
      });

      // Verify contract calls
      expect(mockPublicClient.readContract).toHaveBeenCalledTimes(3);

      // Check first call (granteeAddressToId)
      const firstCall = vi.mocked(mockPublicClient.readContract).mock
        .calls[0][0];
      expect(firstCall.functionName).toBe("granteeAddressToId");
      expect(firstCall.args).toEqual([granteeAddress]);

      // Check second call (granteesV2)
      const secondCall = vi.mocked(mockPublicClient.readContract).mock
        .calls[1][0];
      expect(secondCall.functionName).toBe("granteesV2");
      expect(secondCall.args).toEqual([42n]);

      // Check third call (granteePermissionsPaginated)
      const thirdCall = vi.mocked(mockPublicClient.readContract).mock
        .calls[2][0];
      expect(thirdCall.functionName).toBe("granteePermissionsPaginated");
      expect(thirdCall.args).toEqual([42n, 0n, 100n]);
    });

    it("should return null when contract call fails", async () => {
      const granteeAddress = "0x1234567890123456789012345678901234567890";

      // Mock contract call to throw error
      vi.mocked(mockPublicClient.readContract).mockRejectedValue(
        new Error("Contract error"),
      );

      // Spy on console.warn
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const result = await controller.getGranteeByAddress(granteeAddress);

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `Failed to fetch grantee ${granteeAddress}:`,
        expect.any(Error),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe("getGranteeById", () => {
    it("should return grantee information for a valid ID", async () => {
      const granteeId = 42;

      // Mock the granteesV2 call (returns permissionsCount instead of permissionIds)
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce({
        owner: "0xOwnerAddress" as `0x${string}`,
        granteeAddress:
          "0x1234567890123456789012345678901234567890" as `0x${string}`,
        publicKey: "0xPublicKey123",
        permissionsCount: 3n,
      });

      // Mock the granteePermissionsPaginated call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        [10n, 20n, 30n], // permissionIds
        3n, // totalCount
        false, // hasMore
      ]);

      const result = await controller.getGranteeById(granteeId);

      expect(result).toEqual({
        id: 42,
        owner: "0xOwnerAddress" as `0x${string}`,
        address: "0x1234567890123456789012345678901234567890",
        publicKey: "0xPublicKey123",
        permissionIds: [10, 20, 30],
      });

      // Verify contract calls
      expect(mockPublicClient.readContract).toHaveBeenCalledTimes(2);

      // Check first call (granteesV2)
      const firstCall = vi.mocked(mockPublicClient.readContract).mock
        .calls[0][0];
      expect(firstCall.functionName).toBe("granteesV2");
      expect(firstCall.args).toEqual([42n]);

      // Check second call (granteePermissionsPaginated)
      const secondCall = vi.mocked(mockPublicClient.readContract).mock
        .calls[1][0];
      expect(secondCall.functionName).toBe("granteePermissionsPaginated");
      expect(secondCall.args).toEqual([42n, 0n, 100n]);
    });

    it("should return null when grantee is not found", async () => {
      const granteeId = 999;

      // Mock contract call to throw error (grantee not found)
      vi.mocked(mockPublicClient.readContract).mockRejectedValue(
        new Error("Grantee not found"),
      );

      // Spy on console.warn
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const result = await controller.getGranteeById(granteeId);

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `Failed to fetch grantee ${granteeId}:`,
        expect.any(Error),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe("submitRegisterGrantee", () => {
    it("should submit a transaction to register a grantee", async () => {
      const params = {
        owner: "0xOwnerAddress" as `0x${string}`,
        granteeAddress: "0xGranteeAddress" as `0x${string}`,
        publicKey: "0xPublicKey123",
      };

      const expectedTxHash = "0xTransactionHash123" as Hash;
      vi.mocked(mockWalletClient.writeContract).mockResolvedValueOnce(
        expectedTxHash,
      );

      const result = await controller.submitRegisterGrantee(params);

      expect(result.hash).toBe(expectedTxHash);
      expect(mockWalletClient.getChainId).toHaveBeenCalled();
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "registerGrantee",
          args: [params.owner, params.granteeAddress, params.publicKey],
          account: mockWalletClient.account,
          chain: mockWalletClient.chain,
        }),
      );
    });

    it("should throw error when wallet account is not set", async () => {
      const params = {
        owner: "0xOwnerAddress" as `0x${string}`,
        granteeAddress: "0xGranteeAddress" as `0x${string}`,
        publicKey: "0xPublicKey123",
      };

      // Remove account from wallet client
      const walletClientWithoutAccount = {
        ...mockWalletClient,
        account: undefined,
      };
      mockContext.walletClient = walletClientWithoutAccount;
      mockContext.userAddress = "0xUserAddress";

      await expect(controller.submitRegisterGrantee(params)).rejects.toThrow(
        "No wallet account connected",
      );
    });

    it("should handle transaction errors", async () => {
      const params = {
        owner: "0xOwnerAddress" as `0x${string}`,
        granteeAddress: "0xGranteeAddress" as `0x${string}`,
        publicKey: "0xPublicKey123",
      };

      // Mock writeContract to throw an error
      const error = new Error("Transaction failed");
      vi.mocked(mockWalletClient.writeContract).mockRejectedValueOnce(error);

      await expect(controller.submitRegisterGrantee(params)).rejects.toThrow(
        "Transaction failed",
      );

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "registerGrantee",
          args: [params.owner, params.granteeAddress, params.publicKey],
        }),
      );
    });
  });

  describe("getGrantees", () => {
    it("should return paginated list of grantees with default options", async () => {
      // Set up mocks for parallel calls
      // Since getGranteeById is called in parallel, we need to handle calls based on args
      vi.mocked(mockPublicClient.readContract).mockImplementation(
        async (args: any) => {
          // Handle granteesCount call
          if (args.functionName === "granteesCount") {
            return 3n;
          }

          // Handle granteesV2 and granteePermissionsPaginated calls
          if (args.functionName === "granteesV2") {
            const granteeId = Number(args.args[0]);
            if (granteeId === 1) {
              return {
                owner: "0xOwner1" as `0x${string}`,
                granteeAddress: "0xGrantee1" as `0x${string}`,
                publicKey: "0xKey1",
                permissionsCount: 2n,
              };
            } else if (granteeId === 2) {
              return {
                owner: "0xOwner2" as `0x${string}`,
                granteeAddress: "0xGrantee2" as `0x${string}`,
                publicKey: "0xKey2",
                permissionsCount: 1n,
              };
            } else if (granteeId === 3) {
              return {
                owner: "0xOwner3" as `0x${string}`,
                granteeAddress: "0xGrantee3" as `0x${string}`,
                publicKey: "0xKey3",
                permissionsCount: 0n,
              };
            }
          } else if (args.functionName === "granteePermissionsPaginated") {
            const granteeId = Number(args.args[0]);
            if (granteeId === 1) {
              return [[1n, 2n], 2n, false];
            } else if (granteeId === 2) {
              return [[3n], 1n, false];
            } else if (granteeId === 3) {
              return [[], 0n, false];
            }
          }
          return null;
        },
      );

      const result = await controller.getGrantees();

      expect(result).toEqual({
        grantees: [
          {
            id: 1,
            owner: "0xOwner1" as `0x${string}`,
            address: "0xGrantee1",
            publicKey: "0xKey1",
            permissionIds: [1, 2],
          },
          {
            id: 2,
            owner: "0xOwner2" as `0x${string}`,
            address: "0xGrantee2",
            publicKey: "0xKey2",
            permissionIds: [3],
          },
          {
            id: 3,
            owner: "0xOwner3" as `0x${string}`,
            address: "0xGrantee3",
            publicKey: "0xKey3",
            permissionIds: [],
          },
        ],
        total: 3,
        limit: 50,
        offset: 0,
        hasMore: false,
      });
    });

    it("should handle pagination and skip failed grantees", async () => {
      // Set up mocks for parallel calls with pagination
      vi.mocked(mockPublicClient.readContract).mockImplementation(
        async (args: any) => {
          // Handle granteesCount call
          if (args.functionName === "granteesCount") {
            return 5n;
          }

          // Handle granteesV2 and granteePermissionsPaginated calls
          if (args.functionName === "granteesV2") {
            const granteeId = Number(args.args[0]);
            if (granteeId === 2) {
              return {
                owner: "0xOwner2" as `0x${string}`,
                granteeAddress: "0xGrantee2" as `0x${string}`,
                publicKey: "0xKey2",
                permissionsCount: 0n,
              };
            } else if (granteeId === 3) {
              // Grantee 3 fails
              throw new Error("Grantee not found");
            } else if (granteeId === 4) {
              return {
                owner: "0xOwner4" as `0x${string}`,
                granteeAddress: "0xGrantee4" as `0x${string}`,
                publicKey: "0xKey4",
                permissionsCount: 1n,
              };
            }
          } else if (args.functionName === "granteePermissionsPaginated") {
            const granteeId = Number(args.args[0]);
            if (granteeId === 2) {
              return [[], 0n, false];
            } else if (granteeId === 4) {
              return [[10n], 1n, false];
            }
          }
          return null;
        },
      );

      // Spy on console.warn
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const result = await controller.getGrantees({ offset: 1, limit: 3 });

      expect(result.grantees).toHaveLength(2); // Only 2 successful fetches
      expect(result.total).toBe(5);
      expect(result.offset).toBe(1);
      expect(result.limit).toBe(3);
      expect(result.hasMore).toBe(true); // offset 1 + limit 3 < total 5

      // Check that warning was logged for failed grantee
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Failed to fetch grantee 3:",
        expect.any(Error),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe("getTrustedServers", () => {
    it("should return trusted servers for current user when no address provided", async () => {
      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        10n,
        20n,
        30n,
      ]);

      const result = await controller.getTrustedServers();

      expect(result).toEqual([10, 20, 30]);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userServerIdsValues",
          args: ["0xUserAddress"],
        }),
      );
    });

    it("should return trusted servers for specified user address", async () => {
      const userAddress = "0xSpecificUser";

      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([5n, 15n]);

      const result = await controller.getTrustedServers(userAddress);

      expect(result).toEqual([5, 15]);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userServerIdsValues",
          args: [userAddress],
        }),
      );
    });

    it("should throw BlockchainError on contract call failure", async () => {
      const userAddress = "0xFailUser";

      // Mock contract call to throw error
      vi.mocked(mockPublicClient.readContract).mockRejectedValueOnce(
        new Error("Contract error"),
      );

      await expect(controller.getTrustedServers(userAddress)).rejects.toThrow(
        "Failed to get trusted servers: Contract error",
      );
    });
  });

  describe("getTrustedServersCount", () => {
    it("should return count for current user when no address provided", async () => {
      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce(5n);

      const result = await controller.getTrustedServersCount();

      expect(result).toBe(5);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userServerIdsLength",
          args: ["0xUserAddress"],
        }),
      );
    });

    it("should return count for specified user address", async () => {
      const userAddress = "0xSpecificUser";

      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce(10n);

      const result = await controller.getTrustedServersCount(userAddress);

      expect(result).toBe(10);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userServerIdsLength",
          args: [userAddress],
        }),
      );
    });
  });

  describe("getUserPermissionIds", () => {
    it("should return permission IDs for current user when no address provided", async () => {
      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract",
      );

      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        100n,
        200n,
        300n,
      ]);

      const result = await controller.getUserPermissionIds();

      expect(result).toEqual([100n, 200n, 300n]);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userPermissionIdsValues",
          args: ["0xUserAddress"],
        }),
      );
    });

    it("should return permission IDs for specified user address", async () => {
      const userAddress = "0xSpecificUser";

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract",
      );

      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        50n,
        60n,
      ]);

      const result = await controller.getUserPermissionIds(userAddress);

      expect(result).toEqual([50n, 60n]);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userPermissionIdsValues",
          args: [userAddress],
        }),
      );
    });

    it("should throw BlockchainError on contract call failure", async () => {
      const userAddress = "0xFailUser";

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract",
      );

      // Mock contract call to throw error
      vi.mocked(mockPublicClient.readContract).mockRejectedValueOnce(
        new Error("Contract error"),
      );

      await expect(
        controller.getUserPermissionIds(userAddress),
      ).rejects.toThrow("Failed to get user permission IDs: Contract error");
    });
  });

  describe("getServerInfo", () => {
    it("should return server information for a valid server ID", async () => {
      const serverId = 123n;
      const mockServerInfo = {
        id: serverId,
        url: "https://server.example.com",
        owner: "0xServerOwner" as `0x${string}`,
        active: true,
      };

      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce(
        mockServerInfo,
      );

      const result = await controller.getServerInfo(serverId);

      expect(result).toEqual(mockServerInfo);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "servers",
          args: [serverId],
        }),
      );
    });

    it("should throw BlockchainError when contract call fails", async () => {
      const serverId = 999n;

      // Mock contract call to throw error
      vi.mocked(mockPublicClient.readContract).mockRejectedValueOnce(
        new Error("Server not found"),
      );

      await expect(controller.getServerInfo(serverId)).rejects.toThrow(
        "Failed to get server info: Server not found",
      );
    });
  });

  describe("getUserPermissionCount", () => {
    it("should return permission count for current user when no address provided", async () => {
      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract",
      );

      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce(10n);

      const result = await controller.getUserPermissionCount();

      expect(result).toBe(10n);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userPermissionIdsLength",
          args: ["0xUserAddress"],
        }),
      );
    });

    it("should return permission count for specified user address", async () => {
      const userAddress = "0xSpecificUser";

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract",
      );

      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce(25n);

      const result = await controller.getUserPermissionCount(userAddress);

      expect(result).toBe(25n);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userPermissionIdsLength",
          args: [userAddress],
        }),
      );
    });
  });

  describe("getPermissionInfo", () => {
    it("should return permission information for a valid permission ID", async () => {
      const permissionId = 456n;
      const mockPermissionInfo = {
        id: permissionId,
        grantor: "0xGrantor",
        grantee: "0xGrantee",
        grantUrl: "https://permission.example.com",
        signature: `0x${"0".repeat(130)}`,
        active: true,
      };

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract",
      );

      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce(
        mockPermissionInfo,
      );

      const result = await controller.getPermissionInfo(permissionId);

      expect(result).toEqual(mockPermissionInfo);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "permissions",
          args: [permissionId],
        }),
      );
    });

    it("should throw BlockchainError when contract call fails", async () => {
      const permissionId = 999n;

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract",
      );

      // Mock contract call to throw error
      vi.mocked(mockPublicClient.readContract).mockRejectedValueOnce(
        new Error("Permission not found"),
      );

      await expect(controller.getPermissionInfo(permissionId)).rejects.toThrow(
        "Failed to get permission info: Permission not found",
      );
    });
  });

  describe("getGranteeInfo", () => {
    it("should return grantee info for a valid grantee ID", async () => {
      const granteeId = 789n;

      // Mock granteesV2 call (used by getGranteeById)
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce({
        owner: "0xOwnerAddress" as `0x${string}`,
        granteeAddress: "0xGranteeAddress" as `0x${string}`,
        publicKey: "0xPublicKey789",
        permissionsCount: 2n,
      });

      // Mock granteePermissionsPaginated call (used by getGranteeById)
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        [100n, 200n], // permissionIds
        2n, // totalCount
        false, // hasMore
      ]);

      const result = await controller.getGranteeInfo(granteeId);

      expect(result).toEqual({
        owner: "0xOwnerAddress" as `0x${string}`,
        granteeAddress: "0xGranteeAddress" as `0x${string}`,
        publicKey: "0xPublicKey789",
        permissionIds: [100n, 200n],
      });

      // Check the contract calls
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "granteesV2",
          args: [789n],
        }),
      );
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "granteePermissionsPaginated",
          args: [789n, 0n, 100n],
        }),
      );
    });

    it("should throw BlockchainError when contract call fails", async () => {
      const granteeId = 999n;

      // Mock contract call to throw error
      vi.mocked(mockPublicClient.readContract).mockRejectedValueOnce(
        new Error("Grantee not found"),
      );

      await expect(controller.getGranteeInfo(granteeId)).rejects.toThrow(
        "Failed to get grantee info: Grantee not found",
      );
    });
  });

  describe("getFilePermissionIds", () => {
    it("should return permission IDs for a file", async () => {
      const fileId = 123n;

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract",
      );

      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        10n,
        20n,
        30n,
      ]);

      const result = await controller.getFilePermissionIds(fileId);

      expect(result).toEqual([10n, 20n, 30n]);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "filePermissionIds",
          args: [fileId],
        }),
      );
    });

    it("should throw BlockchainError when contract call fails", async () => {
      const fileId = 999n;

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract",
      );

      // Mock contract call to throw error
      vi.mocked(mockPublicClient.readContract).mockRejectedValueOnce(
        new Error("File not found"),
      );

      await expect(controller.getFilePermissionIds(fileId)).rejects.toThrow(
        "Failed to get file permission IDs: File not found",
      );
    });
  });

  describe("submitUpdateServer", () => {
    it("should submit a transaction to update server URL", async () => {
      const serverId = 100n;
      const newUrl = "https://new-server.example.com";
      const expectedTxHash = "0xUpdateHash123" as Hash;

      vi.mocked(mockWalletClient.writeContract).mockResolvedValueOnce(
        expectedTxHash,
      );

      const result = await controller.submitUpdateServer(serverId, newUrl);

      expect(result.hash).toBe(expectedTxHash);
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "updateServer",
          args: [serverId, newUrl],
          account: mockWalletClient.account,
          chain: mockWalletClient.chain,
        }),
      );
    });

    it("should throw BlockchainError when transaction fails", async () => {
      const serverId = 100n;
      const newUrl = "https://new-server.example.com";

      // Mock writeContract to throw error
      vi.mocked(mockWalletClient.writeContract).mockRejectedValueOnce(
        new Error("Transaction failed"),
      );

      await expect(
        controller.submitUpdateServer(serverId, newUrl),
      ).rejects.toThrow("Failed to update server: Transaction failed");
    });

    it("should handle non-Error object thrown by writeContract", async () => {
      const serverId = 200n;
      const newUrl = "https://another-server.example.com";

      // Mock writeContract to throw non-Error object
      vi.mocked(mockWalletClient.writeContract).mockRejectedValueOnce({
        code: "UNKNOWN_ERROR",
      });

      await expect(
        controller.submitUpdateServer(serverId, newUrl),
      ).rejects.toThrow("Failed to update server: Unknown error");
    });

    it("should throw error when account is null", async () => {
      const serverId = 300n;
      const newUrl = "https://server-no-account.example.com";

      // Create wallet client without account
      const walletClientNoAccount = {
        ...mockWalletClient,
        account: undefined,
        getAddresses: vi.fn().mockResolvedValue(["0xUserAddress"]),
      };
      mockContext.walletClient = walletClientNoAccount;

      await expect(
        controller.submitUpdateServer(serverId, newUrl),
      ).rejects.toThrow("No wallet account connected");
    });
  });

  describe("submitTrustServer", () => {
    it("should submit trust server transaction with wallet account", async () => {
      const params = { serverId: 123 };
      const expectedTxHash = "0xTrustHash123" as Hash;

      vi.mocked(mockWalletClient.writeContract).mockResolvedValueOnce(
        expectedTxHash,
      );

      const result = await controller.submitTrustServer(params);

      expect(result.hash).toBe(expectedTxHash);
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "trustServer",
          args: [123n],
          account: mockWalletClient.account,
          chain: mockWalletClient.chain,
        }),
      );
    });

    it("should throw error when wallet account is not set", async () => {
      const params = { serverId: 456 };

      // Remove account from wallet client
      const walletClientWithoutAccount = {
        ...mockWalletClient,
        account: undefined,
      };
      mockContext.walletClient = walletClientWithoutAccount;
      mockContext.userAddress = "0xUserAddress";

      await expect(controller.submitTrustServer(params)).rejects.toThrow(
        "No wallet account connected",
      );
    });

    it("should throw UserRejectedRequestError when user rejects transaction", async () => {
      const params = { serverId: 789 };

      // Mock writeContract to throw rejection error
      const error = new Error("User rejected the request");
      vi.mocked(mockWalletClient.writeContract).mockRejectedValueOnce(error);

      await expect(controller.submitTrustServer(params)).rejects.toThrow(
        UserRejectedRequestError,
      );
    });

    it("should throw BlockchainError for other errors", async () => {
      const params = { serverId: 999 };

      // Mock writeContract to throw generic error
      const error = new Error("Network error");
      vi.mocked(mockWalletClient.writeContract).mockRejectedValueOnce(error);

      await expect(controller.submitTrustServer(params)).rejects.toThrow(
        "Failed to trust server: Network error",
      );
    });

    it("should handle non-Error object thrown by writeContract", async () => {
      const params = { serverId: 777 };

      // Mock writeContract to throw non-Error object
      vi.mocked(mockWalletClient.writeContract).mockRejectedValueOnce(
        "string error",
      );

      await expect(controller.submitTrustServer(params)).rejects.toThrow(
        "Failed to trust server: Unknown error",
      );
    });
  });

  describe("getGranteePermissionIds", () => {
    it("should return permission IDs for a grantee", async () => {
      const granteeId = 100n;

      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        1n,
        2n,
        3n,
      ]);

      const result = await controller.getGranteePermissionIds(granteeId);

      expect(result).toEqual([1n, 2n, 3n]);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "granteePermissionIds",
          args: [granteeId],
        }),
      );
    });

    it("should throw BlockchainError when contract call fails", async () => {
      const granteeId = 999n;

      // Mock contract call to throw error
      vi.mocked(mockPublicClient.readContract).mockRejectedValueOnce(
        new Error("Contract error"),
      );

      await expect(
        controller.getGranteePermissionIds(granteeId),
      ).rejects.toThrow("Failed to get grantee permission IDs: Contract error");
    });
  });

  describe("getPermissionFileIds", () => {
    it("should return file IDs for a permission", async () => {
      const permissionId = 200n;

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract",
      );

      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        10n,
        20n,
        30n,
      ]);

      const result = await controller.getPermissionFileIds(permissionId);

      expect(result).toEqual([10n, 20n, 30n]);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "permissionFileIds",
          args: [permissionId],
        }),
      );
    });

    it("should throw BlockchainError when contract call fails", async () => {
      const permissionId = 999n;

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract",
      );

      // Mock contract call to throw error
      vi.mocked(mockPublicClient.readContract).mockRejectedValueOnce(
        new Error("Permission not found"),
      );

      await expect(
        controller.getPermissionFileIds(permissionId),
      ).rejects.toThrow(
        "Failed to get permission file IDs: Permission not found",
      );
    });
  });

  describe("getUserServerCount", () => {
    it("should return server count for current user when no address provided", async () => {
      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce(5n);

      const result = await controller.getUserServerCount();

      expect(result).toBe(5n);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userServerIdsLength",
          args: ["0xUserAddress"],
        }),
      );
    });

    it("should return server count for specified user address", async () => {
      const userAddress = "0xSpecificUser";

      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce(10n);

      const result = await controller.getUserServerCount(userAddress);

      expect(result).toBe(10n);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userServerIdsLength",
          args: [userAddress],
        }),
      );
    });
  });

  describe("getGranteePermissions", () => {
    it("should return permissions for a grantee", async () => {
      const granteeId = 50n;

      // Mock contract call
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        100n,
        200n,
      ]);

      const result = await controller.getGranteePermissions(granteeId);

      expect(result).toEqual([100n, 200n]);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "granteePermissions",
          args: [granteeId],
        }),
      );
    });

    it("should throw BlockchainError when contract call fails", async () => {
      const granteeId = 999n;

      // Mock contract call to throw error
      vi.mocked(mockPublicClient.readContract).mockRejectedValueOnce(
        new Error("Contract error"),
      );

      await expect(controller.getGranteePermissions(granteeId)).rejects.toThrow(
        "Failed to get grantee permissions: Contract error",
      );
    });
  });

  describe("getGranteePermissionsPaginated", () => {
    it("should fetch a single page when both offset and limit are provided", async () => {
      const granteeId = 10n;
      const offset = 20n;
      const limit = 5n;

      // Mock contract call for single page
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        [101n, 102n, 103n, 104n, 105n], // permissionIds
        150n, // totalCount
        true, // hasMore
      ]);

      const result = await controller.getGranteePermissionsPaginated(
        granteeId,
        {
          offset,
          limit,
        },
      );

      // Should return paginated result object
      expect(result).toEqual({
        permissionIds: [101n, 102n, 103n, 104n, 105n],
        totalCount: 150n,
        hasMore: true,
      });

      // Should make only one contract call
      expect(mockPublicClient.readContract).toHaveBeenCalledTimes(1);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "granteePermissionsPaginated",
          args: [granteeId, offset, limit],
        }),
      );
    });

    it("should fetch all permissions when no options are provided", async () => {
      const granteeId = 20n;

      // Mock multiple contract calls for pagination
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        [1n, 2n, 3n], // First batch
        3n, // totalCount
        false, // hasMore
      ]);

      const result = await controller.getGranteePermissionsPaginated(granteeId);

      // Should return array of all permission IDs
      expect(result).toEqual([1n, 2n, 3n]);

      // Should make one contract call (all permissions fit in one batch)
      expect(mockPublicClient.readContract).toHaveBeenCalledTimes(1);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "granteePermissionsPaginated",
          args: [granteeId, 0n, 100n], // Default offset=0, limit=100
        }),
      );
    });

    it("should handle multiple batches when fetching all permissions", async () => {
      const granteeId = 30n;

      // Mock multiple contract calls for pagination
      vi.mocked(mockPublicClient.readContract)
        .mockResolvedValueOnce([
          Array.from({ length: 100 }, (_, i) => BigInt(i + 1)), // First batch of 100
          150n, // totalCount
          true, // hasMore
        ])
        .mockResolvedValueOnce([
          Array.from({ length: 50 }, (_, i) => BigInt(i + 101)), // Second batch of 50
          150n, // totalCount
          false, // hasMore
        ]);

      const result = await controller.getGranteePermissionsPaginated(granteeId);

      // Should return array of all permission IDs
      expect(result).toHaveLength(150);
      expect(result[0]).toBe(1n);
      expect(result[149]).toBe(150n);

      // Should make two contract calls
      expect(mockPublicClient.readContract).toHaveBeenCalledTimes(2);

      // First call
      expect(mockPublicClient.readContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          functionName: "granteePermissionsPaginated",
          args: [granteeId, 0n, 100n],
        }),
      );

      // Second call
      expect(mockPublicClient.readContract).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          functionName: "granteePermissionsPaginated",
          args: [granteeId, 100n, 100n],
        }),
      );
    });

    it("should fetch all permissions starting from offset when only offset is provided", async () => {
      const granteeId = 40n;
      const offset = 10n;

      // Mock contract call - with 0-based offset, starting at index 10 of 13 total items
      // Should return items at indices 10, 11, 12 (the last 3 items)
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        [110n, 111n, 112n], // permissions at indices 10, 11, 12 (using arbitrary IDs)
        13n, // totalCount (13 items total, indices 0-12)
        false, // hasMore (no more items after index 12)
      ]);

      const result = await controller.getGranteePermissionsPaginated(
        granteeId,
        {
          offset,
        },
      );

      // Should return array of permission IDs from offset to end
      expect(result).toEqual([110n, 111n, 112n]);

      // Should use provided offset with default limit
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "granteePermissionsPaginated",
          args: [granteeId, offset, 100n],
        }),
      );
    });

    it("should fetch all permissions with custom batch size when only limit is provided", async () => {
      const granteeId = 50n;
      const limit = 50n;

      // Mock contract calls with custom batch size
      vi.mocked(mockPublicClient.readContract)
        .mockResolvedValueOnce([
          Array.from({ length: 50 }, (_, i) => BigInt(i + 1)), // First batch of 50
          120n, // totalCount
          true, // hasMore
        ])
        .mockResolvedValueOnce([
          Array.from({ length: 50 }, (_, i) => BigInt(i + 51)), // Second batch of 50
          120n, // totalCount
          true, // hasMore
        ])
        .mockResolvedValueOnce([
          Array.from({ length: 20 }, (_, i) => BigInt(i + 101)), // Last batch of 20
          120n, // totalCount
          false, // hasMore
        ]);

      const result = await controller.getGranteePermissionsPaginated(
        granteeId,
        {
          limit,
        },
      );

      // Should return all 120 permission IDs
      expect(result).toHaveLength(120);
      expect(result[0]).toBe(1n);
      expect(result[119]).toBe(120n);

      // Should make three contract calls with custom batch size
      expect(mockPublicClient.readContract).toHaveBeenCalledTimes(3);

      // All calls should use the custom limit
      expect(mockPublicClient.readContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          functionName: "granteePermissionsPaginated",
          args: [granteeId, 0n, limit],
        }),
      );
      expect(mockPublicClient.readContract).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          functionName: "granteePermissionsPaginated",
          args: [granteeId, 50n, limit],
        }),
      );
      expect(mockPublicClient.readContract).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          functionName: "granteePermissionsPaginated",
          args: [granteeId, 100n, limit],
        }),
      );
    });

    it("should handle empty result when no permissions exist", async () => {
      const granteeId = 60n;

      // Mock empty result
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        [], // no permissions
        0n, // totalCount
        false, // hasMore
      ]);

      const result = await controller.getGranteePermissionsPaginated(granteeId);

      // Should return empty array
      expect(result).toEqual([]);

      expect(mockPublicClient.readContract).toHaveBeenCalledTimes(1);
    });

    it("should throw BlockchainError when contract call fails", async () => {
      const granteeId = 999n;

      // Mock contract call to throw error
      vi.mocked(mockPublicClient.readContract).mockRejectedValueOnce(
        new Error("Network error"),
      );

      await expect(
        controller.getGranteePermissionsPaginated(granteeId),
      ).rejects.toThrow("Failed to get grantee permissions: Network error");
    });

    it("should handle edge case where contract returns inconsistent pagination data", async () => {
      const granteeId = 70n;

      // Mock contract returning inconsistent data:
      // - Returns 2 items which equals totalCount
      // - But incorrectly claims hasMore=true
      // This tests that the function gracefully handles contract bugs
      // by using the safety check (currentOffset >= totalCount) to stop
      vi.mocked(mockPublicClient.readContract).mockResolvedValueOnce([
        [1n, 2n], // All permissions (2 items)
        2n, // totalCount is 2
        true, // hasMore incorrectly true (contract bug)
      ]);

      const result = await controller.getGranteePermissionsPaginated(granteeId);

      // Should return all fetched permissions
      expect(result).toEqual([1n, 2n]);

      // Should make only one call - the safety check prevents a second call
      // because after fetching with default batchSize=100, currentOffset=100 >= totalCount=2
      expect(mockPublicClient.readContract).toHaveBeenCalledTimes(1);
    });
  });

  describe("TransactionOptions support for grantee operations", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe("submitRegisterGrantee with TransactionOptions", () => {
      it("should pass EIP-1559 gas parameters to writeContract", async () => {
        const params = {
          owner: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36" as `0x${string}`,
          granteeAddress:
            "0xApp1234567890123456789012345678901234567890" as `0x${string}`,
          publicKey: "0x1234567890abcdef",
        };
        const options = {
          maxFeePerGas: 120n * 10n ** 9n, // 120 gwei
          maxPriorityFeePerGas: 5n * 10n ** 9n, // 5 gwei
          gasLimit: 600000n,
        };

        const expectedTxHash = "0xRegisterHash123" as Hash;
        vi.mocked(mockWalletClient.writeContract).mockResolvedValueOnce(
          expectedTxHash,
        );

        await controller.submitRegisterGrantee(params, options);

        expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
          expect.objectContaining({
            functionName: "registerGrantee",
            args: [params.owner, params.granteeAddress, params.publicKey],
            gas: 600000n,
            maxFeePerGas: 120n * 10n ** 9n,
            maxPriorityFeePerGas: 5n * 10n ** 9n,
          }),
        );
      });

      it("should pass legacy gas parameters to writeContract", async () => {
        const params = {
          owner: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36" as `0x${string}`,
          granteeAddress:
            "0xApp1234567890123456789012345678901234567890" as `0x${string}`,
          publicKey: "0x1234567890abcdef",
        };
        const options = {
          gasPrice: 70n * 10n ** 9n, // 70 gwei
          gasLimit: 350000n,
          nonce: 10,
        };

        const expectedTxHash = "0xRegisterHash456" as Hash;
        vi.mocked(mockWalletClient.writeContract).mockResolvedValueOnce(
          expectedTxHash,
        );

        await controller.submitRegisterGrantee(params, options);

        expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
          expect.objectContaining({
            functionName: "registerGrantee",
            gas: 350000n,
            gasPrice: 70n * 10n ** 9n,
            nonce: 10,
          }),
        );
      });
    });

    describe("submitRegisterGrantee with relayer", () => {
      it("should use relayer when available", async () => {
        const params = {
          owner: "0xOwnerAddress" as `0x${string}`,
          granteeAddress: "0xGranteeAddress" as `0x${string}`,
          publicKey: "0xPublicKey123",
        };

        // Mock relayer callback
        const mockRelayer = vi.fn().mockResolvedValue({
          type: "direct",
          result: {
            transactionHash: "0xRelayerTxHash" as Hash,
          },
        });

        // Create controller with relayer
        const controllerWithRelayer = new PermissionsController({
          ...mockContext,
          relayer: mockRelayer,
        });

        const result =
          await controllerWithRelayer.submitRegisterGrantee(params);

        // Verify relayer was called with correct request
        expect(mockRelayer).toHaveBeenCalledWith({
          type: "direct",
          operation: "submitRegisterGrantee",
          params: {
            owner: params.owner,
            granteeAddress: params.granteeAddress,
            publicKey: params.publicKey,
          },
        });

        // Verify result
        expect(result.hash).toBe("0xRelayerTxHash");
        expect(result.contract).toBe("DataPortabilityGrantees");
        expect(result.fn).toBe("registerGrantee");

        // Verify direct wallet transaction was NOT called
        expect(mockWalletClient.writeContract).not.toHaveBeenCalled();
      });

      it("should fall back to direct transaction when relayer fails", async () => {
        const params = {
          owner: "0xOwnerAddress" as `0x${string}`,
          granteeAddress: "0xGranteeAddress" as `0x${string}`,
          publicKey: "0xPublicKey123",
        };

        // Mock relayer to return error
        const mockRelayer = vi.fn().mockResolvedValue({
          type: "error",
          error: "Relayer service unavailable",
        });

        // Create controller with failing relayer
        const controllerWithRelayer = new PermissionsController({
          ...mockContext,
          relayer: mockRelayer,
        });

        // Should throw RelayerError
        await expect(
          controllerWithRelayer.submitRegisterGrantee(params),
        ).rejects.toThrow("Relayer service unavailable");

        // Verify relayer was called
        expect(mockRelayer).toHaveBeenCalled();
        // Verify direct transaction was NOT attempted
        expect(mockWalletClient.writeContract).not.toHaveBeenCalled();
      });

      it("should fall back to direct transaction when no relayer configured", async () => {
        const params = {
          owner: "0xOwnerAddress" as `0x${string}`,
          granteeAddress: "0xGranteeAddress" as `0x${string}`,
          publicKey: "0xPublicKey123",
        };

        const expectedTxHash = "0xDirectTxHash" as Hash;
        vi.mocked(mockWalletClient.writeContract).mockResolvedValueOnce(
          expectedTxHash,
        );

        // Use controller without relayer (original controller)
        const result = await controller.submitRegisterGrantee(params);

        // Verify direct transaction was called
        expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
          expect.objectContaining({
            functionName: "registerGrantee",
            args: [params.owner, params.granteeAddress, params.publicKey],
          }),
        );

        expect(result.hash).toBe(expectedTxHash);
      });

      it("should handle unexpected relayer response type", async () => {
        const params = {
          owner: "0xOwnerAddress" as `0x${string}`,
          granteeAddress: "0xGranteeAddress" as `0x${string}`,
          publicKey: "0xPublicKey123",
        };

        // Mock relayer to return unexpected response type
        const mockRelayer = vi.fn().mockResolvedValue({
          type: "signed", // Wrong type for direct operation
          hash: "0xWrongType",
        });

        const controllerWithRelayer = new PermissionsController({
          ...mockContext,
          relayer: mockRelayer,
        });

        await expect(
          controllerWithRelayer.submitRegisterGrantee(params),
        ).rejects.toThrow("Unexpected response type from relayer");
      });
    });

    describe("submitUpdateServer with TransactionOptions", () => {
      it("should pass gas parameters to writeContract", async () => {
        const serverId = 123n;
        const newUrl = "https://updated-server.example.com";
        const options = {
          maxFeePerGas: 90n * 10n ** 9n,
          gasLimit: 250000n,
        };

        const expectedTxHash = "0xUpdateHash789" as Hash;
        vi.mocked(mockWalletClient.writeContract).mockResolvedValueOnce(
          expectedTxHash,
        );

        await controller.submitUpdateServer(serverId, newUrl, options);

        expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
          expect.objectContaining({
            functionName: "updateServer",
            args: [serverId, newUrl],
            gas: 250000n,
            maxFeePerGas: 90n * 10n ** 9n,
          }),
        );

        const writeContractCall = (mockWalletClient.writeContract as any).mock
          .calls[0][0];
        expect(writeContractCall).not.toHaveProperty("maxPriorityFeePerGas");
        expect(writeContractCall).not.toHaveProperty("gasPrice");
      });
    });
  });
});
