import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Address } from "viem";
import { DataController } from "../controllers/data";
import type { ControllerContext } from "../controllers/permissions";
import {
  generateEncryptionKey,
  encryptWithWalletPublicKey,
} from "../utils/encryption";

// Mock the encryption utilities
vi.mock("../utils/encryption", () => ({
  generateEncryptionKey: vi.fn(),
  encryptWithWalletPublicKey: vi.fn(),
  DEFAULT_ENCRYPTION_SEED: "test-seed",
}));

// Mock the transaction helpers
vi.mock("../utils/transactionHelpers", () => ({
  tx: vi.fn((params) => ({
    ...params,
    waitForEvents: vi.fn(),
  })),
}));

// Mock the config modules
vi.mock("../config/addresses", () => ({
  getContractAddress: vi.fn(() => "0xDataRegistryAddress" as Address),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn(() => []),
}));

describe("DataController - addFileWithPermissionsAndSchema", () => {
  let controller: DataController;
  let mockContext: ControllerContext;
  let mockWriteContract: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWriteContract = vi.fn().mockResolvedValue("0xtxhash");

    mockContext = {
      publicClient: {
        chain: { id: 1, name: "Mainnet" },
      },
      walletClient: {
        chain: { id: 1, name: "Mainnet" },
        account: "0xUserAddress" as Address,
        writeContract: mockWriteContract,
      },
      platform: "browser",
    } as unknown as ControllerContext;

    controller = new DataController(mockContext);
  });

  describe("with publicKey (automatic encryption)", () => {
    it("should automatically encrypt permissions when publicKey is provided", async () => {
      const url = "ipfs://QmHash123";
      const ownerAddress = "0xOwnerAddress" as Address;
      const permissions = [
        {
          account: "0xAccount1" as Address,
          publicKey: "0x04abc123...",
        },
        {
          account: "0xAccount2" as Address,
          publicKey: "0x04def456...",
        },
      ];
      const schemaId = 42;

      // Setup mocks
      (generateEncryptionKey as any).mockResolvedValue("userEncryptionKey");
      (encryptWithWalletPublicKey as any)
        .mockResolvedValueOnce("encryptedKey1")
        .mockResolvedValueOnce("encryptedKey2");

      await controller.addFileWithPermissionsAndSchema(
        url,
        ownerAddress,
        permissions,
        schemaId,
      );

      // Verify encryption key was generated
      expect(generateEncryptionKey).toHaveBeenCalledWith(
        mockContext.walletClient,
        mockContext.platform,
        "test-seed",
      );

      // Verify each permission was encrypted
      expect(encryptWithWalletPublicKey).toHaveBeenCalledWith(
        "userEncryptionKey",
        "0x04abc123...",
        "browser",
      );
      expect(encryptWithWalletPublicKey).toHaveBeenCalledWith(
        "userEncryptionKey",
        "0x04def456...",
        "browser",
      );

      // Verify the contract was called with encrypted permissions
      expect(mockWriteContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "addFileWithPermissionsAndSchema",
          args: [
            url,
            ownerAddress,
            [
              { account: "0xAccount1", key: "encryptedKey1" },
              { account: "0xAccount2", key: "encryptedKey2" },
            ],
            BigInt(schemaId),
          ],
        }),
      );
    });
  });

  describe("error handling", () => {
    it("should throw error when publicKey is missing", async () => {
      const permissions = [
        {
          account: "0xAccount1" as Address,
          // Missing publicKey
        },
      ] as any;

      await expect(
        controller.addFileWithPermissionsAndSchema(
          "ipfs://hash",
          "0xOwner" as Address,
          permissions,
          0,
        ),
      ).rejects.toThrow("Permission for 0xAccount1 must include 'publicKey'");
    });

    it("should throw error when encryption key generation fails", async () => {
      const permissions = [
        {
          account: "0xAccount1" as Address,
          publicKey: "0x04abc...",
        },
      ];

      (generateEncryptionKey as any).mockRejectedValue(
        new Error("Wallet error"),
      );

      await expect(
        controller.addFileWithPermissionsAndSchema(
          "ipfs://hash",
          "0xOwner" as Address,
          permissions,
          0,
        ),
      ).rejects.toThrow(
        "Failed to add file with permissions and schema: Wallet error",
      );
    });

    it("should throw error when public key encryption fails", async () => {
      const permissions = [
        {
          account: "0xAccount1" as Address,
          publicKey: "0x04invalid",
        },
      ];

      (generateEncryptionKey as any).mockResolvedValue("userEncryptionKey");
      (encryptWithWalletPublicKey as any).mockRejectedValue(
        new Error("Invalid public key"),
      );

      await expect(
        controller.addFileWithPermissionsAndSchema(
          "ipfs://hash",
          "0xOwner" as Address,
          permissions,
          0,
        ),
      ).rejects.toThrow(
        "Failed to add file with permissions and schema: Invalid public key",
      );
    });
  });

  describe("with no permissions", () => {
    it("should handle empty permissions array", async () => {
      const url = "ipfs://QmHashNoPerms";
      const ownerAddress = "0xOwnerAddress" as Address;
      const schemaId = 5;

      await controller.addFileWithPermissionsAndSchema(
        url,
        ownerAddress,
        [],
        schemaId,
      );

      // Verify no encryption was attempted
      expect(generateEncryptionKey).not.toHaveBeenCalled();
      expect(encryptWithWalletPublicKey).not.toHaveBeenCalled();

      // Verify the contract was called with empty permissions
      expect(mockWriteContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "addFileWithPermissionsAndSchema",
          args: [url, ownerAddress, [], BigInt(schemaId)],
        }),
      );
    });
  });
});
