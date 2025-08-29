import { describe, it, expect, vi, beforeEach } from "vitest";
import { PermissionsController } from "../controllers/permissions";
import type { ControllerContext } from "../controllers/permissions";
import type { Hash } from "viem";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

describe("Permissions Revoke via Relayer", () => {
  let permissionsController: PermissionsController;
  let mockContext: ControllerContext;
  let mockRelayer: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRelayer = vi.fn();

    mockContext = {
      walletClient: {
        account: { address: "0xTestUser" },
        getAddresses: vi.fn().mockResolvedValue(["0xTestUser"]),
        signTypedData: vi.fn().mockResolvedValue("0xSignature" as Hash),
        chain: { id: 14800 }, // Add chain ID to wallet client
      } as any,
      publicClient: {
        readContract: vi.fn().mockResolvedValue(1n), // nonce
        getChainId: vi.fn().mockResolvedValue(14800),
      } as any,
      relayer: mockRelayer,
      platform: mockPlatformAdapter,
      userAddress: "0xTestUser" as `0x${string}`,
    };

    permissionsController = new PermissionsController(mockContext);
  });

  describe("submitSignedRevoke", () => {
    it("should pass correct operation type 'submitPermissionRevoke' to relayer", async () => {
      const typedData = {
        domain: {
          name: "DataPortabilityPermissions",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as `0x${string}`,
        },
        types: {
          RevokePermission: [
            { name: "nonce", type: "uint256" },
            { name: "permissionId", type: "uint256" },
          ],
        },
        primaryType: "RevokePermission",
        message: {
          nonce: 1n,
          permissionId: 123n,
        },
      };

      const signature = "0xSignature" as Hash;

      // Mock relayer to return success
      mockRelayer.mockResolvedValue({
        type: "signed",
        hash: "0xTransactionHash" as Hash,
      });

      // Call the method that takes typed data directly
      await permissionsController.submitSignedRevoke(typedData, signature);

      // CRITICAL: Verify the relayer was called with correct operation
      expect(mockRelayer).toHaveBeenCalledWith({
        type: "signed",
        operation: "submitPermissionRevoke", // NOT 'submitAddPermission'!
        typedData,
        signature,
        expectedUserAddress: "0xTestUser",
      });
    });

    it("should handle relayer error responses correctly", async () => {
      const typedData = {
        domain: {
          name: "DataPortabilityPermissions",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as `0x${string}`,
        },
        types: {
          RevokePermission: [
            { name: "nonce", type: "uint256" },
            { name: "permissionId", type: "uint256" },
          ],
        },
        primaryType: "RevokePermission",
        message: {
          nonce: 1n,
          permissionId: 123n,
        },
      };

      const signature = "0xSignature" as Hash;

      // Mock relayer to return error
      mockRelayer.mockResolvedValue({
        type: "error",
        error: "Invalid signature",
      });

      // Should throw when relayer returns error
      await expect(
        permissionsController.submitSignedRevoke(typedData, signature),
      ).rejects.toThrow("Relayer error: Invalid signature");
    });
  });

  describe("submitSignedUntrustServer", () => {
    it("should pass correct operation type 'submitUntrustServer' to relayer", async () => {
      const typedData = {
        domain: {
          name: "DataPortabilityServers",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as `0x${string}`,
        },
        types: {
          UntrustServer: [
            { name: "nonce", type: "uint256" },
            { name: "serverId", type: "uint256" },
          ],
        },
        primaryType: "UntrustServer",
        message: {
          nonce: 1n,
          serverId: 456n,
        },
      };

      const signature = "0xSignature" as Hash;

      // Mock relayer to return success
      mockRelayer.mockResolvedValue({
        type: "signed",
        hash: "0xTransactionHash" as Hash,
      });

      // Call the method
      await permissionsController.submitSignedUntrustServer(
        typedData,
        signature,
      );

      // CRITICAL: Verify the relayer was called with correct operation
      expect(mockRelayer).toHaveBeenCalledWith({
        type: "signed",
        operation: "submitUntrustServer", // NOT 'submitAddPermission'!
        typedData,
        signature,
        expectedUserAddress: "0xTestUser",
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing relayer gracefully", async () => {
      // Remove relayer from context
      const contextWithoutRelayer = {
        ...mockContext,
        relayer: undefined,
        walletClient: {
          ...mockContext.walletClient,
          writeContract: vi.fn().mockResolvedValue("0xDirectTxHash" as Hash),
          getChainId: vi.fn().mockResolvedValue(14800),
        } as any,
      };

      const controller = new PermissionsController(contextWithoutRelayer);

      const typedData = {
        domain: {
          name: "DataPortabilityPermissions",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as `0x${string}`,
        },
        types: {
          RevokePermission: [
            { name: "nonce", type: "uint256" },
            { name: "permissionId", type: "uint256" },
          ],
        },
        primaryType: "RevokePermission",
        message: {
          nonce: 1n,
          permissionId: 123n,
        },
      };

      const signature =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01" as Hash;

      // Should fall back to direct transaction
      const result = await controller.submitSignedRevoke(typedData, signature);

      expect(result.hash).toBe("0xDirectTxHash");
      expect(
        contextWithoutRelayer.walletClient.writeContract,
      ).toHaveBeenCalled();
    });

    it("should handle unexpected relayer response types", async () => {
      const typedData = {
        domain: {
          name: "DataPortabilityPermissions",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as `0x${string}`,
        },
        types: {
          RevokePermission: [
            { name: "nonce", type: "uint256" },
            { name: "permissionId", type: "uint256" },
          ],
        },
        primaryType: "RevokePermission",
        message: {
          nonce: 1n,
          permissionId: 123n,
        },
      };

      const signature = "0xSignature" as Hash;

      // Mock relayer to return unexpected response
      mockRelayer.mockResolvedValue({
        type: "direct", // Wrong type for signed operation!
        result: { something: "unexpected" },
      });

      // Should throw when relayer returns unexpected response
      await expect(
        permissionsController.submitSignedRevoke(typedData, signature),
      ).rejects.toThrow(
        "Invalid response from relayer: expected signed transaction",
      );
    });
  });
});
