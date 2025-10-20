import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataController } from "../controllers/data";
import type { ControllerContext } from "../controllers/permissions";

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
      relayer: vi.fn().mockImplementation(async (request) => {
        if (
          request.type === "direct" &&
          request.operation === "submitFileAdditionWithPermissions"
        ) {
          return {
            type: "direct",
            result: {
              fileId: 456,
              transactionHash: "0xabcdef123456789",
            },
          };
        }
        return {
          type: "direct",
          result: {
            fileId: 123,
            transactionHash: "0x123456789abcdef",
          },
        };
      }),
      storageManager:
        mockStorageManager as unknown as ControllerContext["storageManager"],
      platform: mockPlatformAdapter,
      userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    };

    dataController = new DataController(mockContext);
  });

  describe("uploadFileWithPermissions", () => {
    it("should use relayer when relayer is configured", async () => {
      const testBlob = new Blob(["test data"], { type: "text/plain" });
      const permissions = [
        {
          account: "0xTrustedServer" as `0x${string}`,
          publicKey:
            "0x04a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
        },
      ];

      const result = await dataController.uploadFileWithPermissions({
        data: testBlob,
        permissions,
        filename: "test.txt",
      });

      // Verify relayer was called with correct request
      expect(mockContext.relayer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "direct",
          operation: "submitFileAdditionWithPermissions",
          params: expect.objectContaining({
            url: "ipfs://QmTestHash123",
            userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            permissions: expect.arrayContaining([
              expect.objectContaining({
                account: "0xTrustedServer",
                key: expect.any(String), // Encrypted key
              }),
            ]),
          }),
        }),
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
          account: "0xTrustedServer" as `0x${string}`,
          publicKey:
            "0x04a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
        },
      ];

      await dataController.uploadFileWithPermissions({
        data: testBlob,
        permissions,
        filename: "test.txt",
      });

      // Verify the relayer was called with correct request
      expect(mockContext.relayer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "direct",
          operation: "submitFileAdditionWithPermissions",
          params: expect.objectContaining({
            url: "ipfs://QmTestHash123",
            userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            permissions: expect.arrayContaining([
              expect.objectContaining({
                account: "0xTrustedServer",
                key: expect.any(String), // Encrypted key
              }),
            ]),
          }),
        }),
      );
    });

    it("should fallback to direct transaction when no relayer", async () => {
      // Remove relayer callbacks from context but add waitForTransactionEvents and publicClient
      const contextWithoutRelayer = {
        ...mockContext,
        relayer: undefined,
        publicClient: {
          chain: { id: 14800, name: "Moksha Testnet" },
        },
        waitForTransactionEvents: vi.fn().mockResolvedValue({
          expectedEvents: {
            FileAdded: {
              fileId: BigInt(789),
            },
          },
        }),
      };
      const controller = new DataController(
        contextWithoutRelayer as unknown as ControllerContext,
      );

      // Spy on the addFileWithPermissions method without mocking its implementation
      const addFileWithPermissionsSpy = vi.spyOn(
        controller,
        "addFileWithPermissions",
      );

      // Mock the writeContract on wallet client to return a transaction hash
      (contextWithoutRelayer.walletClient!.writeContract as any) = vi
        .fn()
        .mockResolvedValue("0xDirectTxHash");

      const testBlob = new Blob(["test data"], { type: "text/plain" });
      const permissions = [
        {
          account: "0xTrustedServer" as `0x${string}`,
          publicKey:
            "0x04a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
        },
      ];

      const result = await controller.uploadFileWithPermissions({
        data: testBlob,
        permissions,
        filename: "test.txt",
      });

      // Verify direct transaction was used (addFileWithPermissions should have been called)
      expect(addFileWithPermissionsSpy).toHaveBeenCalled();

      expect(result.transactionHash).toBe("0xDirectTxHash");
      expect(result.fileId).toBe(789);
    });

    it("should handle relayer errors gracefully", async () => {
      // Create context with relayer callback that throws an error
      const contextWithError = {
        ...mockContext,
        relayer: vi
          .fn()
          .mockRejectedValue(
            new Error("Failed to register file on blockchain"),
          ),
      };
      const controller = new DataController(contextWithError);

      const testBlob = new Blob(["test data"], { type: "text/plain" });
      const permissions = [
        {
          account: "0xTrustedServer" as `0x${string}`,
          publicKey:
            "0x04a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
        },
      ];

      await expect(
        controller.uploadFileWithPermissions({ data: testBlob, permissions }),
      ).rejects.toThrow("Failed to upload file with permissions");
    });
  });
});
