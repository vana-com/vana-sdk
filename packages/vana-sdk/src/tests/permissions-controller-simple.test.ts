import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PermissionsController,
  ControllerContext,
} from "../controllers/permissions";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";

describe("PermissionsController Simple Tests", () => {
  let permissionsController: PermissionsController;
  let mockContext: ControllerContext;

  const testAccount = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );

  beforeEach(() => {
    vi.clearAllMocks();

    const walletClient = createWalletClient({
      account: testAccount,
      chain: mokshaTestnet,
      transport: http(),
    });

    mockContext = {
      walletClient,
      publicClient: {
        readContract: vi.fn(),
        getBlockNumber: vi.fn().mockResolvedValue(1000n),
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
          status: "success",
          logs: [],
        }),
      } as any,
      applicationClient: walletClient,
      relayerCallbacks: {
        submitPermissionGrant: vi.fn().mockResolvedValue("0xgrantHash"),
        submitPermissionRevoke: vi.fn().mockResolvedValue("0xrevokeHash"),
      },
      storageManager: undefined,
      subgraphUrl: "https://api.thegraph.com/subgraphs/name/test",
      platform: mockPlatformAdapter,
    };

    permissionsController = new PermissionsController(mockContext);
  });

  describe("Permission Granting", () => {
    it("should create and sign permission", async () => {
      const result = await permissionsController.createAndSign({
        to: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        files: [1n, 2n, 3n],
        parameters: { prompt: "test prompt" },
      });

      expect(result.signature).toBeDefined();
      expect(result.typedData).toBeDefined();
    });

    it("should grant permission using relayer callback", async () => {
      const result = await permissionsController.grant({
        to: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        files: [1n, 2n, 3n],
        parameters: { prompt: "test prompt" },
      });

      expect(result).toBe("0xgrantHash");
      expect(
        mockContext.relayerCallbacks!.submitPermissionGrant,
      ).toHaveBeenCalled();
    });

    it("should grant permission directly to blockchain when no relayer", async () => {
      mockContext.relayerCallbacks = undefined;
      permissionsController = new PermissionsController(mockContext);

      mockContext.walletClient.writeContract = vi
        .fn()
        .mockResolvedValue("0xdirectHash");

      const result = await permissionsController.grant({
        to: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        files: [1n, 2n, 3n],
        parameters: { prompt: "test prompt" },
      });

      expect(result).toBe("0xdirectHash");
      expect(mockContext.walletClient.writeContract).toHaveBeenCalled();
    });
  });

  describe("Permission Revoking", () => {
    it("should revoke permission using relayer callback", async () => {
      const result = await permissionsController.revoke({
        permissionId: 123n,
      });

      expect(result).toBe("0xrevokeHash");
      expect(
        mockContext.relayerCallbacks!.submitPermissionRevoke,
      ).toHaveBeenCalled();
    });

    it("should revoke permission directly to blockchain when no relayer", async () => {
      mockContext.relayerCallbacks = undefined;
      permissionsController = new PermissionsController(mockContext);

      mockContext.walletClient.writeContract = vi
        .fn()
        .mockResolvedValue("0xdirectRevokeHash");

      const result = await permissionsController.revoke({
        permissionId: 123n,
      });

      expect(result).toBe("0xdirectRevokeHash");
    });
  });

  describe("Permission Querying", () => {
    it("should get file permission IDs", async () => {
      mockContext.publicClient.readContract = vi
        .fn()
        .mockResolvedValue([1n, 2n, 3n]);

      const permissionIds =
        await permissionsController.getFilePermissionIds(123n);
      expect(permissionIds).toEqual([1n, 2n, 3n]);
    });

    it("should get permission file IDs", async () => {
      mockContext.publicClient.readContract = vi
        .fn()
        .mockResolvedValue([456n, 789n]);

      const fileIds = await permissionsController.getPermissionFileIds(123n);
      expect(fileIds).toEqual([456n, 789n]);
    });
  });

  describe("Error Handling", () => {
    it("should handle relayer callback failure", async () => {
      mockContext.relayerCallbacks!.submitPermissionGrant = vi
        .fn()
        .mockRejectedValue(new Error("Relayer failed"));

      await expect(
        permissionsController.grant({
          to: "0x1234567890123456789012345678901234567890",
          operation: "llm_inference",
          files: [1n, 2n, 3n],
          parameters: { prompt: "test prompt" },
        }),
      ).rejects.toThrow("Relayer failed");
    });

    it("should handle missing chain ID", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockContext.walletClient,
          chain: undefined,
        },
      };

      const controller = new PermissionsController(contextWithoutChain);

      await expect(
        controller.grant({
          to: "0x1234567890123456789012345678901234567890",
          operation: "llm_inference",
          files: [1n, 2n, 3n],
          parameters: { prompt: "test prompt" },
        }),
      ).rejects.toThrow();
    });
  });
});
