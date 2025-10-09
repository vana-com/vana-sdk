import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataController } from "../controllers/data";
import type { ControllerContext } from "../controllers/permissions";
import { InvalidConfigurationError } from "../errors";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock external dependencies
vi.mock("../utils/encryption", () => ({
  generateEncryptionKey: vi.fn(),
  decryptBlobWithSignedKey: vi.fn(),
  encryptBlobWithSignedKey: vi.fn(),
  DEFAULT_ENCRYPTION_SEED: "Please sign to retrieve your encryption key",
}));

vi.mock("../storage", () => ({
  StorageManager: vi.fn().mockImplementation(() => ({
    upload: vi.fn().mockResolvedValue({
      url: "https://ipfs.io/ipfs/QmTestHash",
      size: 1024,
      contentType: "application/octet-stream",
    }),
  })),
}));

vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    getAddress: vi.fn((address) => address),
    createPublicClient: vi.fn(() => ({
      readContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
      getTransactionReceipt: vi.fn().mockResolvedValue({
        transactionHash: "0xTransactionHash",
        blockNumber: 12345n,
        gasUsed: 100000n,
        status: "success" as const,
        logs: [],
      }),
    })),
    getContract: vi.fn(() => ({
      write: {
        addFile: vi.fn().mockResolvedValue("0xtxhash"),
        addFileWithPermissions: vi.fn().mockResolvedValue("0xtxhash"),
      },
    })),
    http: vi.fn(),
    createWalletClient: vi.fn(),
    decodeEventLog: vi.fn(),
    parseEventLogs: vi.fn(() => []),
  };
});

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn(() => ({
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  })),
}));

vi.mock("../config/chains", () => ({
  mokshaTestnet: {
    id: 14800,
    name: "Moksha Testnet",
  },
}));

vi.mock("../config/addresses", () => ({
  getContractAddress: vi
    .fn()
    .mockReturnValue("0x1234567890123456789012345678901234567890"),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

describe("DataController - Upload Owner Validation", () => {
  let controller: DataController;
  let mockContext: ControllerContext;
  let mockWalletClient: any;
  let mockPublicClient: any;

  const walletAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const differentAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0";

  beforeEach(() => {
    vi.clearAllMocks();

    mockWalletClient = {
      account: {
        address: walletAddress,
      },
      chain: {
        id: 14800,
        name: "Moksha Testnet",
      },
      getChainId: vi.fn().mockResolvedValue(14800),
      getAddresses: vi.fn().mockResolvedValue([walletAddress]),
      signMessage: vi.fn().mockResolvedValue(`0x${"0".repeat(130)}`),
      writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    };

    mockPublicClient = {
      chain: {
        id: 14800,
        name: "Moksha Testnet",
      },
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
      getTransactionReceipt: vi.fn().mockResolvedValue({
        transactionHash: "0xTransactionHash",
        blockNumber: 12345n,
        gasUsed: 100000n,
        status: "success" as const,
        logs: [],
      }),
    };

    mockContext = {
      walletClient:
        mockWalletClient as unknown as ControllerContext["walletClient"],
      publicClient:
        mockPublicClient as unknown as ControllerContext["publicClient"],
      subgraphUrl: "https://moksha.vanagraph.io/v7",
      platform: mockPlatformAdapter,
      userAddress: walletAddress as `0x${string}`,
      storageManager: {
        upload: vi.fn().mockResolvedValue({
          url: "https://ipfs.io/ipfs/QmTestHash",
          size: 1024,
          contentType: "application/octet-stream",
        }),
        register: vi.fn(),
        getProvider: vi.fn(),
        listProviders: vi.fn().mockReturnValue(["mock"]),
        getDefaultProvider: vi.fn().mockReturnValue("mock"),
        setDefaultProvider: vi.fn(),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        getStorageProviders: vi.fn().mockReturnValue(["mock"]),
        getDefaultStorageProvider: vi.fn().mockReturnValue("mock"),
      } as any,
      relayer: vi.fn().mockImplementation(async (_request) => {
        return {
          type: "direct",
          result: {
            fileId: 123,
            transactionHash: "0x123456789abcdef",
          },
        };
      }),
    };

    controller = new DataController(mockContext);
  });

  describe("Owner parameter validation with encryption", () => {
    it("should throw InvalidConfigurationError when encrypt=true and owner differs from wallet address", async () => {
      // TDD: This test should fail initially, then pass after implementation
      await expect(
        controller.upload({
          content: "test data",
          filename: "test.txt",
          encrypt: true, // Encryption enabled
          owner: differentAddress as `0x${string}`, // Different from walletAddress
        }),
      ).rejects.toThrow(InvalidConfigurationError);

      await expect(
        controller.upload({
          content: "test data",
          filename: "test.txt",
          encrypt: true,
          owner: differentAddress as `0x${string}`,
        }),
      ).rejects.toThrow(
        "The 'owner' parameter cannot be different from the connected wallet's address when encryption is enabled",
      );
    });

    it("should throw with case-insensitive address comparison", async () => {
      // Addresses should be compared case-insensitively
      const uppercaseAddress = differentAddress.toUpperCase();

      await expect(
        controller.upload({
          content: "test data",
          filename: "test.txt",
          encrypt: true,
          owner: uppercaseAddress as `0x${string}`,
        }),
      ).rejects.toThrow(InvalidConfigurationError);
    });

    it("should allow upload when encrypt=true and owner matches wallet address", async () => {
      // This should succeed - owner matches wallet
      await expect(
        controller.upload({
          content: "test data",
          filename: "test.txt",
          encrypt: true,
          owner: walletAddress as `0x${string}`, // Same as walletAddress
        }),
      ).resolves.toBeDefined();
    });

    it("should allow upload when encrypt=true and owner is undefined (defaults to wallet)", async () => {
      // This should succeed - owner defaults to wallet address
      await expect(
        controller.upload({
          content: "test data",
          filename: "test.txt",
          encrypt: true,
          // owner is not specified, will default to wallet address
        }),
      ).resolves.toBeDefined();
    });

    it("should allow upload when encrypt=false and owner differs from wallet address", async () => {
      // This should succeed - no encryption, so owner can be different
      await expect(
        controller.upload({
          content: "test data",
          filename: "test.txt",
          encrypt: false, // Encryption disabled
          owner: differentAddress as `0x${string}`, // Can be different when not encrypting
        }),
      ).resolves.toBeDefined();
    });

    it("should allow upload when encrypt=false and owner is undefined", async () => {
      // This should succeed
      await expect(
        controller.upload({
          content: "test data",
          filename: "test.txt",
          encrypt: false,
          // owner not specified
        }),
      ).resolves.toBeDefined();
    });

    it("should provide clear error message explaining the problem", async () => {
      try {
        await controller.upload({
          content: "test data",
          filename: "test.txt",
          encrypt: true,
          owner: differentAddress as `0x${string}`,
        });
        // Should not reach here
        expect.fail("Expected upload to throw InvalidConfigurationError");
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidConfigurationError);
        expect((error as Error).message).toContain("owner");
        expect((error as Error).message).toContain("wallet");
        expect((error as Error).message).toContain("encryption");
        expect((error as Error).message).toContain("un-decryptable");
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle mixed case addresses correctly", async () => {
      const mixedCaseWallet = "0xF39fD6e51AAD88f6f4Ce6AB8827279CfFFb92266"; // Same address, mixed case

      await expect(
        controller.upload({
          content: "test data",
          filename: "test.txt",
          encrypt: true,
          owner: mixedCaseWallet as `0x${string}`,
        }),
      ).resolves.toBeDefined();
    });

    it("should validate before attempting encryption or storage operations", async () => {
      // The validation should happen early, before expensive operations
      const { generateEncryptionKey } = await import("../utils/encryption");

      try {
        await controller.upload({
          content: "test data",
          filename: "test.txt",
          encrypt: true,
          owner: differentAddress as `0x${string}`,
        });
        expect.fail("Expected upload to throw");
      } catch {
        // Encryption should not have been attempted
        expect(generateEncryptionKey).not.toHaveBeenCalled();
      }
    });

    it("should allow Blob content with mismatched owner when encrypt=false", async () => {
      const blob = new Blob(["test data"], { type: "text/plain" });

      await expect(
        controller.upload({
          content: blob,
          filename: "test.txt",
          encrypt: false,
          owner: differentAddress as `0x${string}`,
        }),
      ).resolves.toBeDefined();
    });

    it("should reject Blob content with mismatched owner when encrypt=true", async () => {
      const blob = new Blob(["test data"], { type: "text/plain" });

      await expect(
        controller.upload({
          content: blob,
          filename: "test.txt",
          encrypt: true,
          owner: differentAddress as `0x${string}`,
        }),
      ).rejects.toThrow(InvalidConfigurationError);
    });
  });
});
