import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataController } from "../controllers/data";
import type { ControllerContext } from "../controllers/permissions";
import type { Address } from "viem";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock encryption functions
vi.mock("../utils/encryption", () => ({
  generateEncryptionKey: vi.fn().mockResolvedValue("mocked-encryption-key"),
  encryptBlobWithSignedKey: vi
    .fn()
    .mockResolvedValue(new Blob(["encrypted-data"])),
  encryptWithWalletPublicKey: vi.fn().mockResolvedValue("mocked-encrypted-key"),
  DEFAULT_ENCRYPTION_SEED: "test-seed",
}));

describe("DataController Relayer Integration", () => {
  let dataController: DataController;
  let mockContext: ControllerContext;
  let mockStorageManager: {
    upload: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock storage manager
    mockStorageManager = {
      upload: vi.fn().mockResolvedValue({
        url: "ipfs://QmTestHash123",
        size: 1024,
        contentType: "application/octet-stream",
      }),
    };

    // Create mock context with relayer URL
    mockContext = {
      walletClient: {
        account: { address: "0xTestUser" },
        getAddresses: vi.fn().mockResolvedValue(["0xTestUser"]),
        signMessage: vi.fn().mockResolvedValue(`0x${"0".repeat(130)}`),
      } as unknown as ControllerContext["walletClient"],
      publicClient: {} as unknown as ControllerContext["publicClient"],
      applicationClient:
        {} as unknown as ControllerContext["applicationClient"],
      relayerCallbacks: {
        submitFileAddition: vi.fn().mockResolvedValue({
          fileId: 123,
          transactionHash: "0x123456789abcdef",
        }),
        submitFileAdditionWithPermissions: vi.fn().mockResolvedValue({
          fileId: 456,
          transactionHash: "0xabcdef123456789",
        }),
      },
      storageManager:
        mockStorageManager as unknown as ControllerContext["storageManager"],
      platform: mockPlatformAdapter,
    };

    dataController = new DataController(mockContext);
  });

  describe("uploadFileWithPermissions", () => {
    it("should use relayer when relayerCallbacks is configured", async () => {
      const testBlob = new Blob(["test data"], { type: "text/plain" });
      const permissions = [
        {
          account: "0xTrustedServer" as Address,
          publicKey:
            "0x04a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
        },
      ];

      const result = await dataController.uploadFileWithPermissions(
        testBlob,
        permissions,
        "test.txt",
      );

      // Verify relayer callback was called with correct parameters
      expect(
        mockContext.relayerCallbacks?.submitFileAdditionWithPermissions,
      ).toHaveBeenCalledWith(
        "ipfs://QmTestHash123",
        "0xTestUser",
        expect.arrayContaining([
          expect.objectContaining({
            account: "0xTrustedServer",
            key: expect.any(String), // Encrypted key
          }),
        ]),
      );

      // Verify response structure
      expect(result).toEqual({
        fileId: 456,
        url: "ipfs://QmTestHash123",
        size: 1024,
        transactionHash: "0xabcdef123456789",
      });
    });

    it("should include encrypted permissions in relayer callback", async () => {
      const testBlob = new Blob(["test data"], { type: "text/plain" });
      const permissions = [
        {
          account: "0xTrustedServer" as Address,
          publicKey:
            "0x04a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
        },
      ];

      await dataController.uploadFileWithPermissions(
        testBlob,
        permissions,
        "test.txt",
      );

      // Verify the callback was called with correct parameters
      expect(
        mockContext.relayerCallbacks?.submitFileAdditionWithPermissions,
      ).toHaveBeenCalledWith(
        "ipfs://QmTestHash123",
        "0xTestUser",
        expect.arrayContaining([
          expect.objectContaining({
            account: "0xTrustedServer",
            key: expect.any(String), // Encrypted key
          }),
        ]),
      );
    });

    it("should fallback to direct transaction when no relayerCallbacks", async () => {
      // Remove relayer callbacks from context
      const contextWithoutRelayer = {
        ...mockContext,
        relayerCallbacks: undefined,
      };
      const controller = new DataController(contextWithoutRelayer);

      // Mock the addFileWithPermissions method
      const addFileWithPermissionsSpy = vi
        .spyOn(controller, "addFileWithPermissions")
        .mockResolvedValue({
          hash: "0xDirectTxHash" as `0x${string}`,
          from: "0xuser" as `0x${string}`,
          contract: "DataRegistry",
          fn: "addFileWithPermissions",
        });

      const testBlob = new Blob(["test data"], { type: "text/plain" });
      const permissions = [
        {
          account: "0xTrustedServer" as Address,
          publicKey:
            "0x04a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
        },
      ];

      const result = await controller.uploadFileWithPermissions(
        testBlob,
        permissions,
        "test.txt",
      );

      // Verify direct transaction was used
      expect(addFileWithPermissionsSpy).toHaveBeenCalledWith(
        "ipfs://QmTestHash123",
        "0xTestUser",
        expect.any(Array),
      );

      expect(result.transactionHash).toBe("0xDirectTxHash");
    });

    it("should handle relayer errors gracefully", async () => {
      // Create context with relayer callback that throws an error
      const contextWithError = {
        ...mockContext,
        relayerCallbacks: {
          ...mockContext.relayerCallbacks,
          submitFileAdditionWithPermissions: vi
            .fn()
            .mockRejectedValue(
              new Error("Failed to register file on blockchain"),
            ),
        },
      };
      const controller = new DataController(contextWithError);

      const testBlob = new Blob(["test data"], { type: "text/plain" });
      const permissions = [
        {
          account: "0xTrustedServer" as Address,
          publicKey:
            "0x04a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
        },
      ];

      await expect(
        controller.uploadFileWithPermissions(testBlob, permissions),
      ).rejects.toThrow("Failed to upload file with permissions");
    });
  });
});
