import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataController } from "../controllers/data";
import { ControllerContext } from "../controllers/permissions";
import { Address } from "viem";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock encryption functions
vi.mock("../utils/encryption", () => ({
  generateEncryptionKey: vi.fn().mockResolvedValue("mocked-encryption-key"),
  encryptUserData: vi.fn().mockResolvedValue(new Blob(["encrypted-data"])),
  encryptWithWalletPublicKey: vi.fn().mockResolvedValue("mocked-encrypted-key"),
  DEFAULT_ENCRYPTION_SEED: "test-seed",
}));

describe("DataController Relayer Integration", () => {
  let dataController: DataController;
  let mockContext: ControllerContext;
  let mockStorageManager: any;

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
        signMessage: vi.fn().mockResolvedValue("0xSignature"),
      } as any,
      publicClient: {} as any,
      applicationClient: {} as any,
      relayerUrl: "https://test-relayer.example.com",
      storageManager: mockStorageManager,
    };

    dataController = new DataController(mockContext);
  });

  describe("uploadFileWithPermissions", () => {
    it("should use relayer when relayerUrl is configured", async () => {
      const testBlob = new Blob(["test data"], { type: "text/plain" });
      const permissions = [
        {
          account: "0xTrustedServer" as Address,
          publicKey:
            "0x04a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
        },
      ];

      // Mock successful relayer response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          fileId: 42,
          transactionHash: "0xRelayerTxHash",
        }),
      });

      const result = await dataController.uploadFileWithPermissions(
        testBlob,
        permissions,
        "test.txt",
      );

      // Verify relayer was called with correct endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test-relayer.example.com/api/relay/addFileWithPermissions",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining("ipfs://QmTestHash123"),
        }),
      );

      // Verify response structure
      expect(result).toEqual({
        fileId: 42,
        url: "ipfs://QmTestHash123",
        size: 1024,
        transactionHash: "0xRelayerTxHash",
      });
    });

    it("should include encrypted permissions in relayer request", async () => {
      const testBlob = new Blob(["test data"], { type: "text/plain" });
      const permissions = [
        {
          account: "0xTrustedServer" as Address,
          publicKey:
            "0x04a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          fileId: 42,
          transactionHash: "0xRelayerTxHash",
        }),
      });

      await dataController.uploadFileWithPermissions(
        testBlob,
        permissions,
        "test.txt",
      );

      // Verify the request body contains permissions
      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody).toEqual({
        url: "ipfs://QmTestHash123",
        userAddress: "0xTestUser",
        permissions: expect.arrayContaining([
          expect.objectContaining({
            account: "0xTrustedServer",
            key: expect.any(String), // Encrypted key
          }),
        ]),
      });
    });

    it("should fallback to direct transaction when no relayerUrl", async () => {
      // Remove relayer URL from context
      const contextWithoutRelayer = {
        ...mockContext,
        relayerUrl: undefined,
      };
      const controller = new DataController(contextWithoutRelayer);

      // Mock the addFileWithPermissions method
      const addFileWithPermissionsSpy = vi
        .spyOn(controller, "addFileWithPermissions")
        .mockResolvedValue({
          fileId: 42,
          transactionHash: "0xDirectTxHash",
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
      expect(mockFetch).not.toHaveBeenCalled();
      expect(addFileWithPermissionsSpy).toHaveBeenCalledWith(
        "ipfs://QmTestHash123",
        "0xTestUser",
        expect.any(Array),
      );

      expect(result.transactionHash).toBe("0xDirectTxHash");
    });

    it("should handle relayer errors gracefully", async () => {
      const testBlob = new Blob(["test data"], { type: "text/plain" });
      const permissions = [
        {
          account: "0xTrustedServer" as Address,
          publicKey:
            "0x04a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4",
        },
      ];

      // Mock relayer error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Internal Server Error",
      });

      await expect(
        dataController.uploadFileWithPermissions(testBlob, permissions),
      ).rejects.toThrow("Failed to register file on blockchain");
    });
  });
});
