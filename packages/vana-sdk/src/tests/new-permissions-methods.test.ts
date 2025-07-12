import { describe, it, expect, vi, beforeEach } from "vitest";
import { Address } from "viem";
import {
  PermissionsController,
  ControllerContext,
} from "../controllers/permissions";

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

vi.mock("../abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

describe("New PermissionsController Methods", () => {
  let controller: PermissionsController;
  let mockContext: ControllerContext;
  let mockWalletClient: {
    writeContract: ReturnType<typeof vi.fn>;
    signTypedData: ReturnType<typeof vi.fn>;
    account: { address: string };
    chain: { id: number };
    getChainId: ReturnType<typeof vi.fn>;
  };
  let mockPublicClient: {
    readContract: ReturnType<typeof vi.fn>;
    getChainId: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockWalletClient = {
      writeContract: vi.fn(),
      signTypedData: vi.fn(),
      account: { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
      chain: { id: 14800 },
      getChainId: vi.fn().mockResolvedValue(14800),
    };

    mockPublicClient = {
      readContract: vi.fn(),
      getChainId: vi.fn().mockResolvedValue(14800),
    };

    mockContext = {
      walletClient: mockWalletClient,
      publicClient: mockPublicClient,
    };

    controller = new PermissionsController(mockContext);
  });

  describe("revokeWithSignature", () => {
    beforeEach(() => {
      // Mock getUserNonce for typed data creation
      vi.spyOn(
        controller as Record<string, unknown>,
        "getUserNonce",
      ).mockResolvedValue(123n);

      // Mock getPermissionDomain
      vi.spyOn(
        controller as Record<string, unknown>,
        "getPermissionDomain",
      ).mockResolvedValue({
        name: "DataPermissions",
        version: "1",
        chainId: 14800,
        verifyingContract: "0x1234567890123456789012345678901234567890",
      });

      // Mock signTypedData
      vi.spyOn(
        controller as Record<string, unknown>,
        "signTypedData",
      ).mockResolvedValue(
        "0xsignature123456789012345678901234567890123456789012345678901234567890",
      );
    });

    it("should successfully revoke permission with signature via relayer", async () => {
      // Mock relayerCallbacks for the controller
      const mockSubmitPermissionRevoke = vi
        .fn()
        .mockResolvedValue(
          "0xhash123456789012345678901234567890123456789012345678901234567890",
        );

      const contextWithRelayerCallbacks = {
        ...mockContext,
        relayerCallbacks: {
          submitPermissionRevoke: mockSubmitPermissionRevoke,
        },
      };

      const controllerWithRelayer = new PermissionsController(
        contextWithRelayerCallbacks,
      );

      // Mock methods
      vi.spyOn(
        controllerWithRelayer as Record<string, unknown>,
        "getUserNonce",
      ).mockResolvedValue(123n);
      vi.spyOn(
        controllerWithRelayer as Record<string, unknown>,
        "getPermissionDomain",
      ).mockResolvedValue({
        name: "DataPermissions",
        version: "1",
        chainId: 14800,
        verifyingContract: "0x1234567890123456789012345678901234567890",
      });
      vi.spyOn(
        controllerWithRelayer as Record<string, unknown>,
        "signTypedData",
      ).mockResolvedValue(
        "0xsignature123456789012345678901234567890123456789012345678901234567890",
      );

      const params = {
        permissionId: 42n,
      };

      const result = await controllerWithRelayer.revokeWithSignature(params);

      expect(result).toBe(
        "0xhash123456789012345678901234567890123456789012345678901234567890",
      );

      // Verify that relayerCallbacks.submitPermissionRevoke was called
      expect(mockSubmitPermissionRevoke).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: {
            name: "DataPermissions",
            version: "1",
            chainId: 14800,
            verifyingContract: "0x1234567890123456789012345678901234567890",
          },
          types: {
            RevokePermission: [
              { name: "nonce", type: "uint256" },
              { name: "permissionId", type: "uint256" },
            ],
          },
          primaryType: "RevokePermission",
          message: {
            nonce: 123n,
            permissionId: 42n,
          },
        }),
        "0xsignature123456789012345678901234567890123456789012345678901234567890",
      );
    });

    it("should successfully revoke permission with signature via direct transaction", async () => {
      // Use context without relayerCallbacks to trigger direct transaction path
      const directController = new PermissionsController(mockContext);

      // Mock methods for direct controller
      vi.spyOn(
        directController as Record<string, unknown>,
        "getUserNonce",
      ).mockResolvedValue(123n);
      vi.spyOn(
        directController as Record<string, unknown>,
        "getPermissionDomain",
      ).mockResolvedValue({
        name: "DataPermissions",
        version: "1",
        chainId: 14800,
        verifyingContract: "0x1234567890123456789012345678901234567890",
      });
      vi.spyOn(
        directController as Record<string, unknown>,
        "signTypedData",
      ).mockResolvedValue(
        "0xsignature123456789012345678901234567890123456789012345678901234567890",
      );

      // Mock submitDirectRevokeTransaction
      vi.spyOn(
        directController as Record<string, unknown>,
        "submitDirectRevokeTransaction",
      ).mockResolvedValue(
        "0xhash123456789012345678901234567890123456789012345678901234567890",
      );

      const params = {
        permissionId: 42n,
      };

      const result = await directController.revokeWithSignature(params);

      expect(result).toBe(
        "0xhash123456789012345678901234567890123456789012345678901234567890",
      );
    });

    it("should handle missing chain ID error", async () => {
      const noChainContext = {
        ...mockContext,
        walletClient: {
          ...mockWalletClient,
          chain: undefined, // No chain
        },
      };

      const noChainController = new PermissionsController(noChainContext);

      const params = {
        permissionId: 42n,
      };

      await expect(
        noChainController.revokeWithSignature(params),
      ).rejects.toThrow(
        "Failed to revoke permission with signature: Chain ID not available",
      );
    });
  });

  describe("Permission Query Methods", () => {
    beforeEach(() => {
      // Reset mock
      mockPublicClient.readContract.mockReset();
    });

    describe("getFilePermissionIds", () => {
      it("should successfully get permission IDs for a file", async () => {
        const mockPermissionIds = [1n, 2n, 3n];
        mockPublicClient.readContract.mockResolvedValue(mockPermissionIds);

        const result = await controller.getFilePermissionIds(123n);

        expect(result).toEqual(mockPermissionIds);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "filePermissionIds",
          args: [123n],
        });
      });

      it("should handle contract read errors", async () => {
        mockPublicClient.readContract.mockRejectedValue(
          new Error("Contract read failed"),
        );

        await expect(controller.getFilePermissionIds(123n)).rejects.toThrow(
          "Failed to get file permission IDs: Contract read failed",
        );
      });
    });

    describe("getPermissionFileIds", () => {
      it("should successfully get file IDs for a permission", async () => {
        const mockFileIds = [10n, 20n, 30n];
        mockPublicClient.readContract.mockResolvedValue(mockFileIds);

        const result = await controller.getPermissionFileIds(456n);

        expect(result).toEqual(mockFileIds);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "permissionFileIds",
          args: [456n],
        });
      });

      it("should handle contract read errors", async () => {
        mockPublicClient.readContract.mockRejectedValue(
          new Error("Contract read failed"),
        );

        await expect(controller.getPermissionFileIds(456n)).rejects.toThrow(
          "Failed to get permission file IDs: Contract read failed",
        );
      });
    });

    describe("isActivePermission", () => {
      it("should return true for active permission", async () => {
        mockPublicClient.readContract.mockResolvedValue(true);

        const result = await controller.isActivePermission(789n);

        expect(result).toBe(true);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "isActivePermission",
          args: [789n],
        });
      });

      it("should return false for inactive permission", async () => {
        mockPublicClient.readContract.mockResolvedValue(false);

        const result = await controller.isActivePermission(789n);

        expect(result).toBe(false);
      });

      it("should handle contract read errors", async () => {
        mockPublicClient.readContract.mockRejectedValue(
          new Error("Contract read failed"),
        );

        await expect(controller.isActivePermission(789n)).rejects.toThrow(
          "Failed to check permission status: Contract read failed",
        );
      });
    });

    describe("getPermissionInfo", () => {
      it("should successfully get permission info", async () => {
        const mockPermissionInfo = {
          id: 111n,
          grantor: "0xabcdef1234567890123456789012345678901234" as Address,
          nonce: 55n,
          grant: "ipfs://Qm...",
          signature: "0xsig123" as `0x${string}`,
          isActive: true,
          fileIds: [1n, 2n, 3n],
        };

        mockPublicClient.readContract.mockResolvedValue(mockPermissionInfo);

        const result = await controller.getPermissionInfo(111n);

        expect(result).toEqual(mockPermissionInfo);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "permissions",
          args: [111n],
        });
      });

      it("should handle contract read errors", async () => {
        mockPublicClient.readContract.mockRejectedValue(
          new Error("Contract read failed"),
        );

        await expect(controller.getPermissionInfo(111n)).rejects.toThrow(
          "Failed to get permission info: Contract read failed",
        );
      });
    });
  });

  describe("Direct Transaction Methods", () => {
    beforeEach(() => {
      // Mock writeContract
      mockWalletClient.writeContract.mockResolvedValue(
        "0xhash123456789012345678901234567890123456789012345678901234567890",
      );

      // Mock getUserAddress
      vi.spyOn(
        controller as Record<string, unknown>,
        "getUserAddress",
      ).mockResolvedValue("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    });

    describe("submitDirectRevokeTransaction", () => {
      it("should successfully submit direct revoke transaction", async () => {
        const typedData = {
          domain: {
            name: "DataPermissions",
            version: "1",
            chainId: 14800,
            verifyingContract:
              "0x1234567890123456789012345678901234567890" as Address,
          },
          types: {
            RevokePermission: [
              { name: "nonce", type: "uint256" },
              { name: "permissionId", type: "uint256" },
            ],
          },
          primaryType: "RevokePermission" as const,
          message: {
            nonce: 123n,
            permissionId: 42n,
          },
        };

        const signature =
          "0xsignature123456789012345678901234567890123456789012345678901234567890";

        const result = await (
          controller as Record<string, unknown>
        ).submitDirectRevokeTransaction(typedData, signature);

        expect(result).toBe(
          "0xhash123456789012345678901234567890123456789012345678901234567890",
        );

        expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "revokePermissionWithSignature",
          args: [typedData.message, signature],
          account: mockWalletClient.account,
          chain: mockWalletClient.chain,
        });
      });

      it("should handle blockchain errors", async () => {
        mockWalletClient.writeContract.mockRejectedValue(
          new Error("Transaction failed"),
        );

        const typedData = {
          domain: {
            name: "DataPermissions",
            version: "1",
            chainId: 14800,
            verifyingContract:
              "0x1234567890123456789012345678901234567890" as Address,
          },
          types: {
            RevokePermission: [
              { name: "nonce", type: "uint256" },
              { name: "permissionId", type: "uint256" },
            ],
          },
          primaryType: "RevokePermission" as const,
          message: {
            nonce: 123n,
            permissionId: 42n,
          },
        };

        const signature =
          "0xsignature123456789012345678901234567890123456789012345678901234567890";

        await expect(
          (controller as Record<string, unknown>).submitDirectRevokeTransaction(
            typedData,
            signature,
          ),
        ).rejects.toThrow("Transaction failed");
      });
    });
  });
});
