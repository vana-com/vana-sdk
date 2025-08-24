import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PermissionsController,
  ControllerContext,
} from "../controllers/permissions";
import { getContractAddress } from "../config/addresses";
import type { Address, Hash } from "viem";
import { UserRejectedRequestError } from "../errors";

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
  let mockPublicClient: any;
  let mockWalletClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPublicClient = {
      getChainId: vi.fn().mockResolvedValue(14800),
      readContract: vi.fn(),
    };

    mockWalletClient = {
      getChainId: vi.fn().mockResolvedValue(14800),
      writeContract: vi.fn(),
      account: { address: "0xUserAddress" as Address },
      chain: { id: 14800 },
    };

    mockContext = {
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
      applicationClient: {} as any,
      platform: {} as any,
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
    vi.mocked(getContractAddress).mockReturnValue(
      "0xGranteeContract" as Address,
    );
  });

  describe("getGranteeByAddress", () => {
    it("should return grantee information for a valid address", async () => {
      const granteeAddress =
        "0x1234567890123456789012345678901234567890" as Address;

      // Mock the first contract call (granteeByAddress)
      mockPublicClient.readContract.mockResolvedValueOnce({
        owner: "0xOwnerAddress" as Address,
        granteeAddress: granteeAddress,
        publicKey: "0xPublicKey123",
        permissionIds: [1n, 2n, 3n],
      });

      // Mock the second contract call (granteeAddressToId)
      mockPublicClient.readContract.mockResolvedValueOnce(42n);

      const result = await controller.getGranteeByAddress(granteeAddress);

      expect(result).toEqual({
        id: 42,
        owner: "0xOwnerAddress" as Address,
        address: granteeAddress,
        publicKey: "0xPublicKey123",
        permissionIds: [1, 2, 3],
      });

      // Verify contract calls
      expect(mockPublicClient.readContract).toHaveBeenCalledTimes(2);

      // Check first call
      const firstCall = mockPublicClient.readContract.mock.calls[0][0];
      expect(firstCall.functionName).toBe("granteeByAddress");
      expect(firstCall.args).toEqual([granteeAddress]);

      // Check second call
      const secondCall = mockPublicClient.readContract.mock.calls[1][0];
      expect(secondCall.functionName).toBe("granteeAddressToId");
      expect(secondCall.args).toEqual([granteeAddress]);
    });

    it("should return null when contract call fails", async () => {
      const granteeAddress =
        "0x1234567890123456789012345678901234567890" as Address;

      // Mock contract call to throw error
      mockPublicClient.readContract.mockRejectedValue(
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

      // Mock the contract call
      mockPublicClient.readContract.mockResolvedValueOnce({
        owner: "0xOwnerAddress" as Address,
        granteeAddress: "0x1234567890123456789012345678901234567890" as Address,
        publicKey: "0xPublicKey123",
        permissionIds: [10n, 20n, 30n],
      });

      const result = await controller.getGranteeById(granteeId);

      expect(result).toEqual({
        id: 42,
        owner: "0xOwnerAddress" as Address,
        address: "0x1234567890123456789012345678901234567890",
        publicKey: "0xPublicKey123",
        permissionIds: [10, 20, 30],
      });

      // Verify contract call
      expect(mockPublicClient.readContract).toHaveBeenCalledTimes(1);
      const call = mockPublicClient.readContract.mock.calls[0][0];
      expect(call.functionName).toBe("grantees");
      expect(call.args).toEqual([42n]);
    });

    it("should return null when grantee is not found", async () => {
      const granteeId = 999;

      // Mock contract call to throw error (grantee not found)
      mockPublicClient.readContract.mockRejectedValue(
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
        owner: "0xOwnerAddress" as Address,
        granteeAddress: "0xGranteeAddress" as Address,
        publicKey: "0xPublicKey123",
      };

      const expectedTxHash = "0xTransactionHash123" as Hash;
      mockWalletClient.writeContract.mockResolvedValueOnce(expectedTxHash);

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

    it("should get user address when wallet account is not set", async () => {
      const params = {
        owner: "0xOwnerAddress" as Address,
        granteeAddress: "0xGranteeAddress" as Address,
        publicKey: "0xPublicKey123",
      };

      // Remove account from wallet client
      const walletClientWithoutAccount = {
        ...mockWalletClient,
        account: null,
      };
      mockContext.walletClient = walletClientWithoutAccount;

      // Mock getUserAddress private method
      const getUserAddressSpy = vi
        .spyOn(controller as any, "getUserAddress")
        .mockResolvedValueOnce("0xUserAddress" as Address);

      const expectedTxHash = "0xTransactionHash123" as Hash;
      walletClientWithoutAccount.writeContract.mockResolvedValueOnce(
        expectedTxHash,
      );

      const result = await controller.submitRegisterGrantee(params);

      expect(result.hash).toBe(expectedTxHash);
      expect(getUserAddressSpy).toHaveBeenCalled();
      expect(walletClientWithoutAccount.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "registerGrantee",
          args: [params.owner, params.granteeAddress, params.publicKey],
          account: "0xUserAddress",
          chain: walletClientWithoutAccount.chain,
        }),
      );

      getUserAddressSpy.mockRestore();
    });

    it("should handle transaction errors", async () => {
      const params = {
        owner: "0xOwnerAddress" as Address,
        granteeAddress: "0xGranteeAddress" as Address,
        publicKey: "0xPublicKey123",
      };

      // Mock writeContract to throw an error
      const error = new Error("Transaction failed");
      mockWalletClient.writeContract.mockRejectedValueOnce(error);

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
      // Mock granteesCount
      mockPublicClient.readContract.mockResolvedValueOnce(3n);

      // Mock individual grantee fetches
      mockPublicClient.readContract
        .mockResolvedValueOnce({
          owner: "0xOwner1" as Address,
          granteeAddress: "0xGrantee1" as Address,
          publicKey: "0xKey1",
          permissionIds: [1n, 2n],
        })
        .mockResolvedValueOnce({
          owner: "0xOwner2" as Address,
          granteeAddress: "0xGrantee2" as Address,
          publicKey: "0xKey2",
          permissionIds: [3n],
        })
        .mockResolvedValueOnce({
          owner: "0xOwner3" as Address,
          granteeAddress: "0xGrantee3" as Address,
          publicKey: "0xKey3",
          permissionIds: [],
        });

      const result = await controller.getGrantees();

      expect(result).toEqual({
        grantees: [
          {
            id: 1,
            owner: "0xOwner1",
            address: "0xGrantee1",
            publicKey: "0xKey1",
            permissionIds: [1, 2],
          },
          {
            id: 2,
            owner: "0xOwner2",
            address: "0xGrantee2",
            publicKey: "0xKey2",
            permissionIds: [3],
          },
          {
            id: 3,
            owner: "0xOwner3",
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
      // Mock granteesCount
      mockPublicClient.readContract.mockResolvedValueOnce(5n);

      // Mock individual grantee fetches - second one fails
      mockPublicClient.readContract
        .mockResolvedValueOnce({
          owner: "0xOwner2" as Address,
          granteeAddress: "0xGrantee2" as Address,
          publicKey: "0xKey2",
          permissionIds: [],
        })
        .mockRejectedValueOnce(new Error("Grantee not found")) // This one fails
        .mockResolvedValueOnce({
          owner: "0xOwner4" as Address,
          granteeAddress: "0xGrantee4" as Address,
          publicKey: "0xKey4",
          permissionIds: [10n],
        });

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
      // Mock getUserAddress to return a user address
      const getUserAddressSpy = vi
        .spyOn(controller as any, "getUserAddress")
        .mockResolvedValueOnce("0xUserAddress" as Address);

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce([10n, 20n, 30n]);

      const result = await controller.getTrustedServers();

      expect(result).toEqual([10, 20, 30]);
      expect(getUserAddressSpy).toHaveBeenCalled();
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userServerIdsValues",
          args: ["0xUserAddress"],
        }),
      );

      getUserAddressSpy.mockRestore();
    });

    it("should return trusted servers for specified user address", async () => {
      const userAddress = "0xSpecificUser" as Address;

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce([5n, 15n]);

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
      const userAddress = "0xFailUser" as Address;

      // Mock contract call to throw error
      mockPublicClient.readContract.mockRejectedValueOnce(
        new Error("Contract error"),
      );

      await expect(controller.getTrustedServers(userAddress)).rejects.toThrow(
        "Failed to get trusted servers: Contract error",
      );
    });
  });

  describe("getTrustedServersCount", () => {
    it("should return count for current user when no address provided", async () => {
      // Mock getUserAddress to return a user address
      const getUserAddressSpy = vi
        .spyOn(controller as any, "getUserAddress")
        .mockResolvedValueOnce("0xUserAddress" as Address);

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce(5n);

      const result = await controller.getTrustedServersCount();

      expect(result).toBe(5);
      expect(getUserAddressSpy).toHaveBeenCalled();
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userServerIdsLength",
          args: ["0xUserAddress"],
        }),
      );

      getUserAddressSpy.mockRestore();
    });

    it("should return count for specified user address", async () => {
      const userAddress = "0xSpecificUser" as Address;

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce(10n);

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
      // Mock getUserAddress to return a user address
      const getUserAddressSpy = vi
        .spyOn(controller as any, "getUserAddress")
        .mockResolvedValueOnce("0xUserAddress" as Address);

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract" as Address,
      );

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce([100n, 200n, 300n]);

      const result = await controller.getUserPermissionIds();

      expect(result).toEqual([100n, 200n, 300n]);
      expect(getUserAddressSpy).toHaveBeenCalled();
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userPermissionIdsValues",
          args: ["0xUserAddress"],
        }),
      );

      getUserAddressSpy.mockRestore();
    });

    it("should return permission IDs for specified user address", async () => {
      const userAddress = "0xSpecificUser" as Address;

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract" as Address,
      );

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce([50n, 60n]);

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
      const userAddress = "0xFailUser" as Address;

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract" as Address,
      );

      // Mock contract call to throw error
      mockPublicClient.readContract.mockRejectedValueOnce(
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
        owner: "0xServerOwner" as Address,
        active: true,
      };

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce(mockServerInfo);

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
      mockPublicClient.readContract.mockRejectedValueOnce(
        new Error("Server not found"),
      );

      await expect(controller.getServerInfo(serverId)).rejects.toThrow(
        "Failed to get server info: Server not found",
      );
    });
  });

  describe("getUserPermissionCount", () => {
    it("should return permission count for current user when no address provided", async () => {
      // Mock getUserAddress to return a user address
      const getUserAddressSpy = vi
        .spyOn(controller as any, "getUserAddress")
        .mockResolvedValueOnce("0xUserAddress" as Address);

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract" as Address,
      );

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce(10n);

      const result = await controller.getUserPermissionCount();

      expect(result).toBe(10n);
      expect(getUserAddressSpy).toHaveBeenCalled();
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userPermissionIdsLength",
          args: ["0xUserAddress"],
        }),
      );

      getUserAddressSpy.mockRestore();
    });

    it("should return permission count for specified user address", async () => {
      const userAddress = "0xSpecificUser" as Address;

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract" as Address,
      );

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce(25n);

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
        grantor: "0xGrantor" as Address,
        grantee: "0xGrantee" as Address,
        grantUrl: "https://permission.example.com",
        signature: "0xSignature123",
        active: true,
      };

      // Mock getContractAddress to return DataPortabilityPermissions address
      vi.mocked(getContractAddress).mockReturnValueOnce(
        "0xPermissionsContract" as Address,
      );

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce(mockPermissionInfo);

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
        "0xPermissionsContract" as Address,
      );

      // Mock contract call to throw error
      mockPublicClient.readContract.mockRejectedValueOnce(
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
      const mockGranteeInfo = {
        id: granteeId,
        address: "0xGranteeAddress" as Address,
        publicKey: "0xPublicKey789",
        owner: "0xOwnerAddress" as Address,
      };

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce(mockGranteeInfo);

      const result = await controller.getGranteeInfo(granteeId);

      expect(result).toEqual(mockGranteeInfo);
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "granteeInfo",
          args: [granteeId],
        }),
      );
    });

    it("should throw BlockchainError when contract call fails", async () => {
      const granteeId = 999n;

      // Mock contract call to throw error
      mockPublicClient.readContract.mockRejectedValueOnce(
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
        "0xPermissionsContract" as Address,
      );

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce([10n, 20n, 30n]);

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
        "0xPermissionsContract" as Address,
      );

      // Mock contract call to throw error
      mockPublicClient.readContract.mockRejectedValueOnce(
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

      mockWalletClient.writeContract.mockResolvedValueOnce(expectedTxHash);

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
      mockWalletClient.writeContract.mockRejectedValueOnce(
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
      mockWalletClient.writeContract.mockRejectedValueOnce({
        code: "UNKNOWN_ERROR",
      });

      await expect(
        controller.submitUpdateServer(serverId, newUrl),
      ).rejects.toThrow("Failed to update server: Unknown error");
    });

    it("should handle null account correctly", async () => {
      const serverId = 300n;
      const newUrl = "https://server-no-account.example.com";
      const expectedTxHash = "0xNullAccountHash" as Hash;

      // Create wallet client without account
      const walletClientNoAccount = {
        ...mockWalletClient,
        account: null,
      };
      mockContext.walletClient = walletClientNoAccount;

      walletClientNoAccount.writeContract.mockResolvedValueOnce(expectedTxHash);

      const result = await controller.submitUpdateServer(serverId, newUrl);

      expect(result.hash).toBe(expectedTxHash);
      expect(walletClientNoAccount.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "updateServer",
          args: [serverId, newUrl],
          account: null,
          chain: walletClientNoAccount.chain,
        }),
      );
    });
  });

  describe("submitTrustServer", () => {
    it("should submit trust server transaction with wallet account", async () => {
      const params = { serverId: 123 };
      const expectedTxHash = "0xTrustHash123" as Hash;

      mockWalletClient.writeContract.mockResolvedValueOnce(expectedTxHash);

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

    it("should get user address when wallet account is not set", async () => {
      const params = { serverId: 456 };

      // Remove account from wallet client
      const walletClientWithoutAccount = {
        ...mockWalletClient,
        account: null,
      };
      mockContext.walletClient = walletClientWithoutAccount;

      // Mock getUserAddress private method
      const getUserAddressSpy = vi
        .spyOn(controller as any, "getUserAddress")
        .mockResolvedValueOnce("0xUserAddress" as Address);

      const expectedTxHash = "0xTrustHash456" as Hash;
      walletClientWithoutAccount.writeContract.mockResolvedValueOnce(
        expectedTxHash,
      );

      const result = await controller.submitTrustServer(params);

      expect(result.hash).toBe(expectedTxHash);
      expect(getUserAddressSpy).toHaveBeenCalled();
      expect(walletClientWithoutAccount.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "trustServer",
          args: [456n],
          account: "0xUserAddress",
        }),
      );

      getUserAddressSpy.mockRestore();
    });

    it("should throw UserRejectedRequestError when user rejects transaction", async () => {
      const params = { serverId: 789 };

      // Mock writeContract to throw rejection error
      const error = new Error("User rejected the request");
      mockWalletClient.writeContract.mockRejectedValueOnce(error);

      await expect(controller.submitTrustServer(params)).rejects.toThrow(
        UserRejectedRequestError,
      );
    });

    it("should throw BlockchainError for other errors", async () => {
      const params = { serverId: 999 };

      // Mock writeContract to throw generic error
      const error = new Error("Network error");
      mockWalletClient.writeContract.mockRejectedValueOnce(error);

      await expect(controller.submitTrustServer(params)).rejects.toThrow(
        "Failed to trust server: Network error",
      );
    });

    it("should handle non-Error object thrown by writeContract", async () => {
      const params = { serverId: 777 };

      // Mock writeContract to throw non-Error object
      mockWalletClient.writeContract.mockRejectedValueOnce("string error");

      await expect(controller.submitTrustServer(params)).rejects.toThrow(
        "Failed to trust server: Unknown error",
      );
    });
  });

  describe("getGranteePermissionIds", () => {
    it("should return permission IDs for a grantee", async () => {
      const granteeId = 100n;

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce([1n, 2n, 3n]);

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
      mockPublicClient.readContract.mockRejectedValueOnce(
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
        "0xPermissionsContract" as Address,
      );

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce([10n, 20n, 30n]);

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
        "0xPermissionsContract" as Address,
      );

      // Mock contract call to throw error
      mockPublicClient.readContract.mockRejectedValueOnce(
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
      // Mock getUserAddress to return a user address
      const getUserAddressSpy = vi
        .spyOn(controller as any, "getUserAddress")
        .mockResolvedValueOnce("0xUserAddress" as Address);

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce(5n);

      const result = await controller.getUserServerCount();

      expect(result).toBe(5n);
      expect(getUserAddressSpy).toHaveBeenCalled();
      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "userServerIdsLength",
          args: ["0xUserAddress"],
        }),
      );

      getUserAddressSpy.mockRestore();
    });

    it("should return server count for specified user address", async () => {
      const userAddress = "0xSpecificUser" as Address;

      // Mock contract call
      mockPublicClient.readContract.mockResolvedValueOnce(10n);

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
      mockPublicClient.readContract.mockResolvedValueOnce([100n, 200n]);

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
      mockPublicClient.readContract.mockRejectedValueOnce(
        new Error("Contract error"),
      );

      await expect(controller.getGranteePermissions(granteeId)).rejects.toThrow(
        "Failed to get grantee permissions: Contract error",
      );
    });
  });
});
