import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import type { TransactionReceipt } from "viem";
import { DataController } from "../controllers/data";
import { ControllerContext } from "../controllers/permissions";
import { mokshaTestnet } from "../config/chains";
import type { StorageManager } from "../storage/manager";
import type {
  StorageProvider as _StorageProvider,
  StorageUploadResult as _StorageUploadResult,
  StorageFile as _StorageFile,
  StorageListOptions as _StorageListOptions,
} from "../storage/index";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock ALL external dependencies for pure unit tests
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

vi.mock("viem", () => ({
  createPublicClient: vi.fn(() => ({
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
  })),
  getContract: vi.fn(() => ({
    read: {
      filesCount: vi.fn().mockResolvedValue(BigInt(42)),
      files: vi
        .fn()
        .mockResolvedValue([
          BigInt(1),
          "ipfs://QmTestFile",
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          BigInt(123456),
        ]),
      schemas: vi.fn().mockResolvedValue({
        name: "Test Schema",
        typ: "json",
        definitionUrl: "https://example.com/schema.json",
      }),
      schemasCount: vi.fn().mockResolvedValue(BigInt(5)),
      refiners: vi.fn().mockResolvedValue({
        dlpId: BigInt(1),
        owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        name: "Test Refiner",
        schemaId: BigInt(0),
        refinementInstructionUrl: "https://example.com/instructions",
      }),
      isValidSchemaId: vi.fn().mockResolvedValue(true),
    },
  })),
  http: vi.fn(),
  createWalletClient: vi.fn(),
  decodeEventLog: vi.fn(),
  parseEventLogs: vi.fn(() => []),
}));

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

vi.mock("../abi", () => ({
  getAbi: vi.fn().mockReturnValue([
    {
      name: "fileCount",
      type: "function",
      inputs: [],
      outputs: [{ name: "", type: "uint256" }],
    },
    {
      name: "files",
      type: "function",
      inputs: [{ name: "id", type: "uint256" }],
      outputs: [
        { name: "id", type: "uint256" },
        { name: "url", type: "string" },
        { name: "owner", type: "address" },
        { name: "addedAtBlock", type: "uint256" },
      ],
    },
  ]),
}));

// Mock fetch globally - no real network calls
global.fetch = vi.fn();

interface MockWalletClient {
  account: {
    address: string;
  };
  chain: {
    id: number;
    name: string;
  };
  getChainId: ReturnType<typeof vi.fn>;
  getAddresses: ReturnType<typeof vi.fn>;
  signMessage: ReturnType<typeof vi.fn>;
  writeContract: ReturnType<typeof vi.fn>;
}

interface MockPublicClient {
  waitForTransactionReceipt: ReturnType<typeof vi.fn>;
}

describe("DataController", () => {
  let controller: DataController;
  let mockContext: ControllerContext;
  let mockWalletClient: MockWalletClient;
  let mockPublicClient: MockPublicClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a fully mocked wallet client - no real viem objects
    mockWalletClient = {
      account: {
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      },
      chain: {
        id: 14800,
        name: "Moksha Testnet",
      },
      getChainId: vi.fn().mockResolvedValue(14800),
      getAddresses: vi
        .fn()
        .mockResolvedValue(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]),
      signMessage: vi.fn().mockResolvedValue("0xsignature"),
      writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    };

    // Create a fully mocked public client
    mockPublicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    };

    // Base context without relayer (for direct transaction tests)
    mockContext = {
      walletClient:
        mockWalletClient as unknown as ControllerContext["walletClient"],
      publicClient:
        mockPublicClient as unknown as ControllerContext["publicClient"],
      subgraphUrl:
        "https://api.goldsky.com/api/public/project_cm168cz887zva010j39il7a6p/subgraphs/moksha/7.0.6/gn",
      platform: mockPlatformAdapter,
    };

    controller = new DataController(mockContext);
  });

  describe("getUserFiles", () => {
    it("should throw error when no subgraph URL configured", async () => {
      // Don't set NEXT_PUBLIC_SUBGRAPH_URL
      delete process.env.NEXT_PUBLIC_SUBGRAPH_URL;

      // Create controller without subgraph URL
      const contextWithoutSubgraph = {
        ...mockContext,
        subgraphUrl: undefined,
      };
      const controllerWithoutSubgraph = new DataController(
        contextWithoutSubgraph,
      );

      await expect(
        controllerWithoutSubgraph.getUserFiles({
          owner: mockWalletClient.account.address as `0x${string}`,
        }),
      ).rejects.toThrow(
        "subgraphUrl is required. Please provide a valid subgraph endpoint or configure it in Vana constructor.",
      );
    });

    it("should query subgraph when URL provided", async () => {
      const mockFetch = fetch as Mock;

      const testAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              user: {
                id: testAddress.toLowerCase(),
                files: [
                  {
                    id: "12",
                    url: "ipfs://QmTestFile",
                    schemaId: "0",
                    addedAtBlock: "123456",
                    addedAtTimestamp: "1640995200",
                    transactionHash: "0x123...",
                    owner: {
                      id: testAddress.toLowerCase(),
                    },
                  },
                ],
              },
            },
          }),
      });

      const result = await controller.getUserFiles({
        owner: testAddress as `0x${string}`,
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 12,
        url: "ipfs://QmTestFile",
        ownerAddress: testAddress.toLowerCase(),
        addedAtBlock: BigInt(123456),
        schemaId: 0,
        addedAtTimestamp: BigInt(1640995200),
        transactionHash: "0x123...",
      });
    });

    it("should handle subgraph errors gracefully", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        controller.getUserFiles({
          owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
          subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
        }),
      ).rejects.toThrow(
        "Failed to fetch user files from subgraph: Network error",
      );
    });
  });

  describe("getTotalFilesCount", () => {
    it("should return file count from contract", async () => {
      const { createPublicClient } = await import("viem");
      const mockPublicClient = {
        readContract: vi.fn().mockResolvedValue(BigInt(42)),
      };
      vi.mocked(createPublicClient).mockReturnValueOnce(
        mockPublicClient as unknown as ReturnType<typeof createPublicClient>,
      );

      const result = await controller.getTotalFilesCount();

      expect(result).toBe(42);
    });
  });

  describe("getFileById", () => {
    it("should return file by ID from contract", async () => {
      const result = await controller.getFileById(1);

      expect(result).toEqual({
        id: 1,
        url: "ipfs://QmTestFile",
        ownerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        addedAtBlock: BigInt(123456),
      });
    });
  });

  describe("uploadEncryptedFile", () => {
    it("should upload and encrypt file successfully", async () => {
      const { encryptBlobWithSignedKey, generateEncryptionKey } = await import(
        "../utils/encryption"
      );
      const { StorageManager } = await import("../storage");

      const testFile = new Blob(["test content"], { type: "text/plain" });
      const encryptedBlob = new Blob(["encrypted content"]);

      // Mock storage manager in context
      const mockStorageManager = new StorageManager();
      mockContext.storageManager = mockStorageManager;
      controller = new DataController(mockContext);

      // Mock encryption
      vi.mocked(generateEncryptionKey).mockResolvedValue("0xencryptionkey");
      vi.mocked(encryptBlobWithSignedKey).mockResolvedValue(encryptedBlob);

      // Mock direct transaction (writeContract and event parsing)
      mockWalletClient.writeContract = vi.fn().mockResolvedValue("0xtxhash");

      // Mock transaction receipt with FileAdded event
      mockPublicClient.waitForTransactionReceipt = vi.fn().mockResolvedValue({
        logs: [
          {
            topics: ["0xFileAdded"],
            data: "0x...",
          },
        ],
      });

      // Mock decodeEventLog to return the FileAdded event
      const { decodeEventLog } = await import("viem");
      vi.mocked(decodeEventLog).mockReturnValue({
        eventName: "FileAdded",
        args: {
          fileId: 42n,
        },
      } as ReturnType<typeof decodeEventLog>);

      const result = await controller.uploadEncryptedFile(testFile, "test.txt");

      expect(result).toEqual({
        fileId: 42,
        url: "https://ipfs.io/ipfs/QmTestHash",
        size: 1024,
        transactionHash: "0xtxhash",
      });
    });

    it("should handle upload errors", async () => {
      const { StorageManager } = await import("../storage");

      // Set up storage manager in context so we get past the initial check
      const mockStorageManager = new StorageManager();
      mockContext.storageManager = mockStorageManager;

      // Remove relayerUrl to force direct transaction path where signing occurs
      delete mockContext.relayerCallbacks;

      // Mock writeContract to throw signing error
      mockWalletClient.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("Signing failed"));

      controller = new DataController(mockContext);

      const testFile = new Blob(["test content"]);

      await expect(controller.uploadEncryptedFile(testFile)).rejects.toThrow(
        "Upload failed: Signing failed",
      );
    });
  });

  describe("decryptFile Error Handling", () => {
    it("should handle network errors during file retrieval", async () => {
      const mockFile = {
        id: 1,
        url: "ipfs://QmTestHash",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: 123456n,
      };

      const mockFetch = fetch as Mock;
      mockFetch.mockRejectedValue(new Error("Failed to fetch"));

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions.",
      );
    });

    it("should handle network errors with Network error message", async () => {
      const mockFile = {
        id: 1,
        url: "ipfs://QmTestHash",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: 123456n,
      };

      const mockFetch = fetch as Mock;
      mockFetch.mockRejectedValue(new Error("Network error: timeout"));

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions.",
      );
    });

    it("should handle invalid OpenPGP message format errors", async () => {
      const mockFile = {
        id: 1,
        url: "ipfs://QmTestHash",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: 123456n,
      };

      const { generateEncryptionKey } = await import("../utils/encryption");
      vi.mocked(generateEncryptionKey).mockResolvedValue("test-key");

      const { decryptBlobWithSignedKey } = await import("../utils/encryption");
      vi.mocked(decryptBlobWithSignedKey).mockRejectedValue(
        new Error("Error: not a valid OpenPGP message"),
      );

      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["encrypted content"])),
      });

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Invalid file format: This file doesn't appear to be encrypted with the Vana protocol",
      );
    });

    it("should handle wrong encryption key errors", async () => {
      const mockFile = {
        id: 1,
        url: "ipfs://QmTestHash",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: 123456n,
      };

      const { generateEncryptionKey } = await import("../utils/encryption");
      vi.mocked(generateEncryptionKey).mockResolvedValue("wrong-key");

      const { decryptBlobWithSignedKey } = await import("../utils/encryption");
      vi.mocked(decryptBlobWithSignedKey).mockRejectedValue(
        new Error("Session key decryption failed"),
      );

      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["encrypted content"])),
      });

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Wrong encryption key",
      );
    });

    it("should handle file not found errors", async () => {
      const mockFile = {
        id: 1,
        url: "ipfs://QmTestHash",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: 123456n,
      };

      const { generateEncryptionKey } = await import("../utils/encryption");
      vi.mocked(generateEncryptionKey).mockResolvedValueOnce("test-key");

      const { decryptBlobWithSignedKey } = await import("../utils/encryption");
      vi.mocked(decryptBlobWithSignedKey).mockRejectedValueOnce(
        new Error("File not found"),
      );

      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(["encrypted content"])),
      });

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "File not found: The encrypted file is no longer available",
      );
    });

    it("should preserve other errors unchanged", async () => {
      const mockFile = {
        id: 1,
        url: "ipfs://QmTestHash",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: 123456n,
      };

      const { generateEncryptionKey } = await import("../utils/encryption");
      vi.mocked(generateEncryptionKey).mockResolvedValueOnce("test-key");

      const { decryptBlobWithSignedKey } = await import("../utils/encryption");
      vi.mocked(decryptBlobWithSignedKey).mockRejectedValueOnce(
        new Error("Some other error"),
      );

      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(["encrypted content"])),
      });

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Some other error",
      );
    });

    it("should handle HTTP status errors during file retrieval", async () => {
      const mockFile = {
        id: 1,
        url: "ipfs://QmTestHash",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: 123456n,
      };

      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions.",
      );
    });

    it("should handle IPFS URL conversion correctly", async () => {
      const mockFile = {
        id: 1,
        url: "ipfs://QmTestHash",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: 123456n,
      };

      const { generateEncryptionKey } = await import("../utils/encryption");
      vi.mocked(generateEncryptionKey).mockResolvedValueOnce("test-key");

      const { decryptBlobWithSignedKey } = await import("../utils/encryption");
      vi.mocked(decryptBlobWithSignedKey).mockResolvedValueOnce(
        new Blob(["decrypted content"]),
      );

      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(["encrypted content"])),
      });

      const result = await controller.decryptFile(mockFile);

      expect(result).toBeInstanceOf(Blob);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://dweb.link/ipfs/QmTestHash",
      );
    });

    it("should handle empty blob response", async () => {
      const mockFile = {
        id: 1,
        url: "ipfs://QmTestHash",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: 123456n,
      };

      const { generateEncryptionKey } = await import("../utils/encryption");
      vi.mocked(generateEncryptionKey).mockResolvedValueOnce("test-key");

      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob([])), // Empty blob
      });

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions.",
      );
    });

    it("should handle 403 forbidden errors", async () => {
      const mockFile = {
        id: 1,
        url: "ipfs://QmTestHash",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: 123456n,
      };

      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions.",
      );
    });

    it("should handle 404 not found errors", async () => {
      const mockFile = {
        id: 1,
        url: "ipfs://QmTestHash",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: 123456n,
      };

      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "File not found: The encrypted file is no longer available at the stored URL.",
      );
    });

    it("should handle Error decrypting message errors", async () => {
      const mockFile = {
        id: 1,
        url: "ipfs://QmTestHash",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: 123456n,
      };

      const { generateEncryptionKey } = await import("../utils/encryption");
      vi.mocked(generateEncryptionKey).mockResolvedValueOnce("test-key");

      const { decryptBlobWithSignedKey } = await import("../utils/encryption");
      vi.mocked(decryptBlobWithSignedKey).mockRejectedValueOnce(
        new Error("Error decrypting message: invalid format"),
      );

      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(["encrypted content"])),
      });

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Wrong encryption key",
      );
    });
  });

  describe("getUserFiles additional branches", () => {
    it("should handle subgraph response with errors", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            errors: [{ message: "GraphQL error occurred" }],
          }),
      });

      await expect(
        controller.getUserFiles({
          owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
          subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
        }),
      ).rejects.toThrow(
        "Failed to fetch user files from subgraph: Subgraph errors: GraphQL error occurred",
      );
    });

    it("should handle missing user in subgraph response", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { user: null },
          }),
      });

      const result = await controller.getUserFiles({
        owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      expect(result).toHaveLength(0);
    });

    it("should handle user with no file contributions", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              user: {
                id: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
                fileContributions: [],
              },
            },
          }),
      });

      const result = await controller.getUserFiles({
        owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      expect(result).toHaveLength(0);
    });

    it("should handle missing chainId in getUserFiles", async () => {
      const mockFetch = fetch as Mock;

      // Mock wallet client without chain
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockWalletClient,
          chain: undefined,
        } as unknown as ControllerContext["walletClient"],
      };

      const controllerWithoutChain = new DataController(contextWithoutChain);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              user: {
                id: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
                fileContributions: [
                  {
                    id: "1",
                    fileId: "12",
                    createdAt: "1640995200",
                    createdAtBlock: "123456",
                  },
                ],
              },
            },
          }),
      });

      const result = await controllerWithoutChain.getUserFiles({
        owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      // Should return empty array when no chainId
      expect(result).toHaveLength(0);
    });

    it("should handle contract call failure for file details", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              user: {
                id: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
                fileContributions: [
                  {
                    id: "1",
                    fileId: "12",
                    createdAt: "1640995200",
                    createdAtBlock: "123456",
                  },
                ],
              },
            },
          }),
      });

      // Mock getContract to return contract that throws error
      const { getContract } = await import("viem");
      vi.mocked(getContract).mockReturnValueOnce({
        read: {
          files: vi.fn().mockRejectedValue(new Error("Contract call failed")),
        },
      } as unknown as ReturnType<typeof getContract>);

      const result = await controller.getUserFiles({
        owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      // Should return empty array when contract calls fail
      expect(result).toHaveLength(0);
    });

    it("should handle object format in file details response", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              user: {
                id: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
                files: [
                  {
                    id: "12",
                    url: "ipfs://QmTestFile",
                    schemaId: "0",
                    addedAtBlock: "123456",
                    addedAtTimestamp: "1640995200",
                    transactionHash: "0x123...",
                    owner: {
                      id: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
                    },
                  },
                ],
              },
            },
          }),
      });

      const result = await controller.getUserFiles({
        owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 12,
        url: "ipfs://QmTestFile",
        ownerAddress:
          "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" as `0x${string}`,
        addedAtBlock: BigInt(123456),
        schemaId: 0,
        addedAtTimestamp: BigInt(1640995200),
        transactionHash: "0x123...",
      });
    });
  });

  describe("getFileById additional branches", () => {
    it("should handle missing chainId", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockWalletClient,
          chain: undefined,
        } as unknown as ControllerContext["walletClient"],
      };

      const controllerWithoutChain = new DataController(contextWithoutChain);

      await expect(controllerWithoutChain.getFileById(1)).rejects.toThrow(
        "Chain ID not available",
      );
    });
  });

  describe("getTotalFilesCount additional branches", () => {
    it("should handle missing chainId", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockWalletClient,
          chain: undefined,
        } as unknown as ControllerContext["walletClient"],
      };

      const controllerWithoutChain = new DataController(contextWithoutChain);

      await expect(controllerWithoutChain.getTotalFilesCount()).rejects.toThrow(
        "Chain ID not available",
      );
    });

    it("should handle contract errors gracefully", async () => {
      const { getContract } = await import("viem");
      vi.mocked(getContract).mockReturnValueOnce({
        read: {
          filesCount: vi.fn().mockRejectedValue(new Error("Contract error")),
        },
      } as unknown as ReturnType<typeof getContract>);

      const result = await controller.getTotalFilesCount();

      expect(result).toBe(0);
    });
  });

  describe("uploadEncryptedFile additional branches", () => {
    it("should handle missing storage manager", async () => {
      const contextWithoutStorage = {
        ...mockContext,
        storageManager: undefined,
      };

      const controllerWithoutStorage = new DataController(
        contextWithoutStorage,
      );
      const testFile = new Blob(["test content"]);

      await expect(
        controllerWithoutStorage.uploadEncryptedFile(testFile),
      ).rejects.toThrow(
        "Storage manager not configured. Please provide storage providers in VanaConfig.",
      );
    });

    it("should handle relayer registration failure", async () => {
      const { StorageManager } = await import("../storage");

      const mockStorageManager = new StorageManager();

      // Create context with failing relayer callback
      const contextWithFailingRelayer = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerCallbacks: {
          submitFileAddition: vi
            .fn()
            .mockRejectedValue(
              new Error(
                "Failed to register file on blockchain: Internal Server Error",
              ),
            ),
        },
      };

      const controller = new DataController(contextWithFailingRelayer);
      const testFile = new Blob(["test content"]);

      await expect(controller.uploadEncryptedFile(testFile)).rejects.toThrow(
        "Upload failed: Failed to register file on blockchain: Internal Server Error",
      );
    });

    it("should handle relayer success false response", async () => {
      const { StorageManager } = await import("../storage");

      const mockStorageManager = new StorageManager();

      // Create context with failing relayer callback
      const contextWithFailingRelayer = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerCallbacks: {
          submitFileAddition: vi
            .fn()
            .mockRejectedValue(new Error("Custom relayer error")),
        },
      };

      const controller = new DataController(contextWithFailingRelayer);
      const testFile = new Blob(["test content"]);

      await expect(controller.uploadEncryptedFile(testFile)).rejects.toThrow(
        "Upload failed: Custom relayer error",
      );
    });

    it("should handle direct transaction path with missing chainId", async () => {
      const { StorageManager } = await import("../storage");

      const mockStorageManager = new StorageManager();
      const contextWithoutChain = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerUrl: undefined,
        walletClient: {
          ...mockWalletClient,
          chain: undefined,
        } as unknown as ControllerContext["walletClient"],
      };

      const controllerWithoutChain = new DataController(contextWithoutChain);
      const testFile = new Blob(["test content"]);

      await expect(
        controllerWithoutChain.uploadEncryptedFile(testFile),
      ).rejects.toThrow("Chain ID not available");
    });

    it("should handle direct transaction path successfully", async () => {
      const { StorageManager } = await import("../storage");

      const mockStorageManager = new StorageManager();
      const mockWalletClient = {
        ...mockContext.walletClient,
        writeContract: vi.fn().mockResolvedValue("0xsuccessfultxhash"),
        chain: mokshaTestnet,
      };

      const contextWithDirectTx = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerUrl: undefined, // No relayer URL forces direct transaction
        walletClient: mockWalletClient,
      };

      const controller = new DataController(contextWithDirectTx);
      const testFile = new Blob(["test content"]);

      const result = await controller.uploadEncryptedFile(testFile);

      expect(result.fileId).toBe(0); // Direct transaction returns 0 as per TODO comment
      expect(result.url).toBe("https://ipfs.io/ipfs/QmTestHash");
      expect(result.size).toBe(1024);
      expect(result.transactionHash).toBe("0xsuccessfultxhash");
    });

    it("should handle relayer failure with success false", async () => {
      const { StorageManager } = await import("../storage");

      const mockStorageManager = new StorageManager();

      // Create context with failing relayer callback
      const contextWithFailingRelayer = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerCallbacks: {
          submitFileAddition: vi
            .fn()
            .mockRejectedValue(new Error("Blockchain registration failed")),
        },
      };

      const controller = new DataController(contextWithFailingRelayer);
      const testFile = new Blob(["test content"]);

      await expect(controller.uploadEncryptedFile(testFile)).rejects.toThrow(
        "Upload failed: Blockchain registration failed",
      );
    });

    it("should handle relayer failure with success false and no error message", async () => {
      const { StorageManager } = await import("../storage");

      const mockStorageManager = new StorageManager();

      // Create context with failing relayer callback
      const contextWithFailingRelayer = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerCallbacks: {
          submitFileAddition: vi
            .fn()
            .mockRejectedValue(
              new Error("Failed to register file on blockchain"),
            ),
        },
      };

      const controller = new DataController(contextWithFailingRelayer);
      const testFile = new Blob(["test content"]);

      await expect(controller.uploadEncryptedFile(testFile)).rejects.toThrow(
        "Upload failed: Failed to register file on blockchain",
      );
    });
  });

  describe("convertIpfsUrl private method testing", () => {
    it("should handle non-IPFS URLs", async () => {
      const controller = new DataController(mockContext);

      // Test via decryptFile which calls convertIpfsUrl internally
      const testFile: import("../types").UserFile = {
        id: 1,
        url: "https://example.com/file.dat", // Non-IPFS URL
        ownerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        addedAtBlock: BigInt(123456),
      };

      // Mock fetch to simulate file retrieval
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(["encrypted content"])),
      });

      const { decryptBlobWithSignedKey } = await import("../utils/encryption");
      (decryptBlobWithSignedKey as Mock).mockResolvedValueOnce(
        new Blob(["decrypted content"]),
      );

      await controller.decryptFile(testFile);

      // Verify that fetch was called with the non-IPFS URL directly
      expect(global.fetch).toHaveBeenCalledWith("https://example.com/file.dat");
    });
  });

  describe("getUserAddress error handling", () => {
    it("should handle wallet client with no addresses", async () => {
      const contextWithNoAddresses = {
        ...mockContext,
        walletClient: {
          ...mockContext.walletClient,
          getAddresses: vi.fn().mockResolvedValue([]), // Empty array
        },
      };

      // Test via uploadEncryptedFile which calls getUserAddress internally
      const { StorageManager } = await import("../storage");
      const mockStorageManager = new StorageManager();
      const contextWithStorage = {
        ...contextWithNoAddresses,
        storageManager: mockStorageManager,
        relayerUrl: "https://relayer.test.com",
      };

      const controllerWithStorage = new DataController(contextWithStorage);
      const testFile = new Blob(["test content"]);

      await expect(
        controllerWithStorage.uploadEncryptedFile(testFile),
      ).rejects.toThrow("No addresses available in wallet client");
    });
  });

  describe("getUserFiles subgraph error handling", () => {
    it("should handle failed subgraph HTTP request", async () => {
      // Mock fetch to return non-ok response
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const controller = new DataController(mockContext);

      await expect(
        controller.getUserFiles({
          owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          subgraphUrl: "https://subgraph.test.com",
        }),
      ).rejects.toThrow(
        "Failed to fetch user files from subgraph: Subgraph request failed: 500 Internal Server Error",
      );
    });

    it("should handle duplicate file IDs in subgraph response", async () => {
      // Mock fetch to return response with duplicate file IDs
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              user: {
                id: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
                files: [
                  {
                    id: "10",
                    url: "ipfs://QmFile10",
                    schemaId: "0",
                    addedAtBlock: "100000",
                    addedAtTimestamp: "1640995200",
                    transactionHash: "0x123...",
                    owner: {
                      id: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
                    },
                  },
                  {
                    id: "20",
                    url: "ipfs://QmFile20",
                    schemaId: "0",
                    addedAtBlock: "100001",
                    addedAtTimestamp: "1640995300",
                    transactionHash: "0x456...",
                    owner: {
                      id: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
                    },
                  },
                  {
                    id: "10", // Duplicate ID
                    url: "ipfs://QmFile10Duplicate",
                    schemaId: "0",
                    addedAtBlock: "100002",
                    addedAtTimestamp: "1640995400",
                    transactionHash: "0x789...",
                    owner: {
                      id: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
                    },
                  },
                ],
              },
            },
          }),
      });

      const controller = new DataController(mockContext);

      const result = await controller.getUserFiles({
        owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        subgraphUrl: "https://subgraph.test.com",
      });

      // Should return only 2 unique files, with duplicates filtered (keeps latest entry for each ID)
      expect(result).toHaveLength(2);
      // Results should be sorted by latest timestamp first
      expect(result[0].id).toBe(10); // Latest timestamp for file ID 10 (1640995400)
      expect(result[1].id).toBe(20); // File ID 20 (1640995300)
    });
  });

  describe("Non-Error Exception Handling", () => {
    it("should handle non-Error exceptions in getFileById", async () => {
      // Create a controller that will directly trigger the error path
      const contextWithError = {
        ...mockContext,
        walletClient: {
          ...mockContext.walletClient,
          chain: undefined, // This will cause chainId to be falsy, triggering error
        },
      };

      const controller = new DataController(contextWithError);

      await expect(controller.getFileById(123)).rejects.toThrow(
        "Chain ID not available",
      );
    });

    it("should handle non-Error exceptions in uploadEncryptedFile", async () => {
      const { StorageManager } = await import("../storage");
      const mockStorageManager = new StorageManager();

      // Mock storage manager to throw non-Error
      mockStorageManager.upload = vi.fn().mockImplementation(() => {
        throw { code: 500, message: "Server error" }; // Non-Error object
      });

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
      };

      const controller = new DataController(contextWithStorage);
      const testFile = new Blob(["test content"]);

      await expect(controller.uploadEncryptedFile(testFile)).rejects.toThrow(
        "Upload failed: Unknown error",
      );
    });

    it("should use fallbacks when wallet client missing account/chain", async () => {
      const { StorageManager } = await import("../storage");
      const mockStorageManager = new StorageManager();

      // Mock successful storage upload
      mockStorageManager.upload = vi.fn().mockResolvedValue({
        url: "https://ipfs.io/ipfs/QmTestHash",
        size: 1024,
        contentType: "application/octet-stream",
      });

      // Mock wallet client with missing account and chain properties but valid chain ID
      const contextWithPartialWallet = {
        ...mockContext,
        relayerUrl: undefined, // Disable relayer to test direct transaction path
        storageManager: mockStorageManager,
        walletClient: {
          ...mockContext.walletClient,
          account: undefined, // Missing account - should use userAddress fallback
          chain: mokshaTestnet, // Valid chain object
          writeContract: vi.fn().mockResolvedValue("0xsuccesshash"),
          getAddresses: vi.fn().mockResolvedValue(["0xfallbackaddress"]),
        },
      };

      const controller = new DataController(contextWithPartialWallet);
      const testFile = new Blob(["test content"]);

      const result = await controller.uploadEncryptedFile(testFile);

      // Should succeed and use fallback values
      expect(result.transactionHash).toBe("0xsuccesshash");
      expect(result.fileId).toBe(0); // Direct transaction path

      // Verify writeContract was called with fallback values
      expect(
        contextWithPartialWallet.walletClient.writeContract,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          account: "0xfallbackaddress", // Should use getUserAddress result
          // Chain should be the actual chain object, not null in this case
        }),
      );
    });

    it("should use chain fallback (|| null) in direct transaction path", async () => {
      const { StorageManager } = await import("../storage");
      const mockStorageManager = new StorageManager();

      // Mock successful storage upload
      mockStorageManager.upload = vi.fn().mockResolvedValue({
        url: "https://ipfs.io/ipfs/QmTestHash",
        size: 1024,
        contentType: "application/octet-stream",
      });

      // Mock wallet client with valid chain id but chain property that can become undefined
      const mockWalletClientWithChain = {
        ...mockContext.walletClient,
        chain: mokshaTestnet, // Use proper Chain type
        writeContract: vi
          .fn()
          .mockImplementation(({ chain: _chain, ..._rest }) => {
            // This tests that line 407 gets executed with the fallback
            // The fallback is: this.context.walletClient.chain || null
            return Promise.resolve("0xsuccesshash");
          }),
      };

      // After the writeContract call verifies the chain parameter,
      // temporarily set chain to undefined to verify the fallback would work
      const originalChain = mockWalletClientWithChain.chain;

      const contextWithPartialWallet = {
        ...mockContext,
        relayerUrl: undefined, // Disable relayer to test direct transaction path
        storageManager: mockStorageManager,
        walletClient: mockWalletClientWithChain,
      };

      const controller = new DataController(contextWithPartialWallet);
      const testFile = new Blob(["test content"]);

      const result = await controller.uploadEncryptedFile(testFile);

      // Should succeed
      expect(result.transactionHash).toBe("0xsuccesshash");
      expect(result.fileId).toBe(0); // Direct transaction path

      // Verify writeContract was called (which tests line 407 indirectly)
      expect(mockWalletClientWithChain.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: originalChain, // Should pass the chain object
        }),
      );
    });

    it("should use null chain fallback when wallet client chain becomes undefined during writeContract call", async () => {
      const { StorageManager } = await import("../storage");
      const mockStorageManager = new StorageManager();

      // Mock successful storage upload
      mockStorageManager.upload = vi.fn().mockResolvedValue({
        url: "https://ipfs.io/ipfs/QmTestHash",
        size: 1024,
        contentType: "application/octet-stream",
      });

      // Create wallet client with dynamic chain property
      let chainCallCount = 0;
      const mockWalletClientDynamic = {
        ...mockContext.walletClient,
        writeContract: vi.fn().mockImplementation((params) => {
          // Verify chain parameter is null (from || null fallback)
          expect(params.chain).toBe(null);
          return Promise.resolve("0xsuccesshash");
        }),
      };

      // Override chain getter to return undefined on second access (during writeContract)
      Object.defineProperty(mockWalletClientDynamic, "chain", {
        get() {
          chainCallCount++;
          // First call returns valid chain (for initial checks)
          // Second call returns undefined (triggering || null fallback)
          return chainCallCount === 1 ? mokshaTestnet : undefined;
        },
        configurable: true,
      });

      const contextWithDynamicChain = {
        ...mockContext,
        relayerUrl: undefined, // Force direct transaction path
        storageManager: mockStorageManager,
        walletClient: mockWalletClientDynamic,
      };

      const controller = new DataController(contextWithDynamicChain);
      const testFile = new Blob(["test content"]);

      const result = await controller.uploadEncryptedFile(testFile);

      // Should succeed with fallback
      expect(result.transactionHash).toBe("0xsuccesshash");
      expect(result.fileId).toBe(0);

      // Verify writeContract was called with chain: null
      expect(mockWalletClientDynamic.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: null, // The || null fallback was triggered
        }),
      );
    });
  });

  // Note: Pinata non-Error exception tests are in pinataStorage.test.ts
  // as they require direct access to PinataStorage without mocking conflicts

  // Note: Grant files non-Error exception tests are in utils-grantFiles.test.ts
  // as they require specific mocking to trigger the outer catch block

  describe("Schema Management", () => {
    const mockSchema = {
      id: 1,
      name: "Test Schema",
      type: "json",
      definitionUrl: "https://example.com/schema.json",
    };

    beforeEach(() => {
      // Reset all mocks for schema tests
      vi.clearAllMocks();
    });

    it("should add schema successfully", async () => {
      // Mock decodeEventLog to simulate SchemaAdded event
      const { decodeEventLog } = await import("viem");
      vi.mocked(decodeEventLog).mockReturnValue({
        eventName: "SchemaAdded",
        args: { schemaId: BigInt(1) },
      } as ReturnType<typeof decodeEventLog>);

      // Mock the public client to return a receipt with logs
      mockPublicClient.waitForTransactionReceipt = vi.fn().mockResolvedValue({
        logs: [
          {
            data: "0x",
            topics: ["0x1234567890abcdef"],
          },
        ],
      });

      const result = await controller.addSchema({
        name: mockSchema.name,
        type: mockSchema.type,
        definitionUrl: mockSchema.definitionUrl,
      });

      expect(result.schemaId).toBe(1);
      expect(result.transactionHash).toBe("0xtxhash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "addSchema",
          args: [mockSchema.name, mockSchema.type, mockSchema.definitionUrl],
        }),
      );
    });

    it("should add refiner with schema ID", async () => {
      // Mock decodeEventLog to simulate RefinerAdded event
      const { decodeEventLog } = await import("viem");
      vi.mocked(decodeEventLog).mockReturnValue({
        eventName: "RefinerAdded",
        args: { refinerId: BigInt(1) },
      } as ReturnType<typeof decodeEventLog>);

      // Mock the public client to return a receipt with logs
      mockPublicClient.waitForTransactionReceipt = vi.fn().mockResolvedValue({
        logs: [
          {
            data: "0x",
            topics: ["0x1234567890abcdef"],
          },
        ],
      });

      const result = await controller.addRefiner({
        dlpId: 1,
        name: "Test Refiner",
        schemaId: 1,
        refinementInstructionUrl: "https://example.com/instructions",
      });

      expect(result.refinerId).toBe(1);
      expect(result.transactionHash).toBe("0xtxhash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "addRefinerWithSchemaId",
          args: [
            BigInt(1),
            "Test Refiner",
            BigInt(1),
            "https://example.com/instructions",
          ],
        }),
      );
    });

    it("should update schema ID for existing refiner", async () => {
      const result = await controller.updateSchemaId({
        refinerId: 1,
        newSchemaId: 2,
      });

      expect(result.transactionHash).toBe("0xtxhash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "updateSchemaId",
          args: [BigInt(1), BigInt(2)],
        }),
      );
    });

    it("should handle missing chainId for schema operations", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockWalletClient,
          chain: undefined,
        } as unknown as ControllerContext["walletClient"],
      };

      const controllerWithoutChain = new DataController(contextWithoutChain);

      await expect(
        controllerWithoutChain.addSchema({
          name: "Test Schema",
          type: "json",
          definitionUrl: "https://example.com/schema.json",
        }),
      ).rejects.toThrow("Chain ID not available");

      await expect(controllerWithoutChain.getSchema(1)).rejects.toThrow(
        "Chain ID not available",
      );

      // getSchemasCount catches errors and returns 0, so test that behavior
      const result = await controllerWithoutChain.getSchemasCount();
      expect(result).toBe(0);
    });

    it("should upload encrypted file with schema", async () => {
      // Mock storage manager
      const mockStorageManager = {
        upload: vi.fn().mockResolvedValue({
          url: "https://ipfs.io/ipfs/test-hash",
          size: 1024,
        }),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        register: vi.fn(),
        getProvider: vi.fn(),
        setDefaultProvider: vi.fn(),
        listProviders: vi.fn(),
        getDefaultProvider: vi.fn(),
        getStorageProviders: vi.fn(),
        getDefaultStorageProvider: vi.fn(),
      } as unknown as StorageManager;

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerUrl: undefined, // Ensure no relayer to test direct mode
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      const { decodeEventLog } = await import("viem");
      vi.mocked(decodeEventLog).mockReturnValueOnce({
        eventName: "FileAdded",
        args: { fileId: BigInt(123) },
      } as ReturnType<typeof decodeEventLog>);

      vi.mocked(
        mockContext.publicClient.waitForTransactionReceipt,
      ).mockResolvedValueOnce({
        logs: [
          {
            data: "0x123",
            topics: ["0x456"],
          },
        ],
      } as unknown as TransactionReceipt);

      const testFile = new Blob(["test data"], { type: "text/plain" });
      const result = await controllerWithStorage.uploadEncryptedFileWithSchema(
        testFile,
        1,
        "test.txt",
      );

      expect(result).toEqual({
        fileId: 123,
        url: "https://ipfs.io/ipfs/test-hash",
        size: 1024,
        transactionHash: "0xtxhash",
      });

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "addFileWithSchema",
          args: ["https://ipfs.io/ipfs/test-hash", BigInt(1)],
        }),
      );
    });

    it("should register file with schema", async () => {
      const { decodeEventLog } = await import("viem");
      vi.mocked(decodeEventLog).mockReturnValueOnce({
        eventName: "FileAdded",
        args: { fileId: BigInt(123) },
      } as ReturnType<typeof decodeEventLog>);

      vi.mocked(
        mockContext.publicClient.waitForTransactionReceipt,
      ).mockResolvedValueOnce({
        logs: [
          {
            data: "0x123",
            topics: ["0x456"],
          },
        ],
      } as unknown as TransactionReceipt);

      const result = await controller.registerFileWithSchema(
        "https://example.com/file.json",
        2,
      );

      expect(result).toEqual({
        fileId: 123,
        transactionHash: "0xtxhash",
      });

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "addFileWithSchema",
          args: ["https://example.com/file.json", BigInt(2)],
        }),
      );
    });

    it("should handle missing storage manager for schema upload", async () => {
      const contextWithoutStorage = {
        ...mockContext,
        storageManager: undefined,
      };

      const controllerWithoutStorage = new DataController(
        contextWithoutStorage,
      );
      const testFile = new Blob(["test data"], { type: "text/plain" });

      await expect(
        controllerWithoutStorage.uploadEncryptedFileWithSchema(testFile, 1),
      ).rejects.toThrow("Storage manager not configured");
    });

    it("should handle missing chainId for schema upload", async () => {
      const mockStorageManager = {
        upload: vi.fn().mockResolvedValue({
          url: "https://ipfs.io/ipfs/test-hash",
          size: 1024,
        }),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        register: vi.fn(),
        getProvider: vi.fn(),
        setDefaultProvider: vi.fn(),
        listProviders: vi.fn(),
        getDefaultProvider: vi.fn(),
        getStorageProviders: vi.fn(),
        getDefaultStorageProvider: vi.fn(),
      } as unknown as StorageManager;

      const contextWithoutChain = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerUrl: undefined, // Ensure no relayer to test chain ID check
        walletClient: {
          ...mockWalletClient,
          chain: undefined,
        } as unknown as ControllerContext["walletClient"],
      };

      const controllerWithoutChain = new DataController(contextWithoutChain);
      const testFile = new Blob(["test data"], { type: "text/plain" });

      await expect(
        controllerWithoutChain.uploadEncryptedFileWithSchema(testFile, 1),
      ).rejects.toThrow("Chain ID not available");
    });

    it("should handle missing chainId for registerFileWithSchema", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockWalletClient,
          chain: undefined,
        } as unknown as ControllerContext["walletClient"],
      };

      const controllerWithoutChain = new DataController(contextWithoutChain);

      await expect(
        controllerWithoutChain.registerFileWithSchema(
          "https://example.com/file.json",
          1,
        ),
      ).rejects.toThrow("Chain ID not available");
    });

    it("should handle writeContract failure for schema upload", async () => {
      const mockStorageManager = {
        upload: vi.fn().mockResolvedValue({
          url: "https://ipfs.io/ipfs/test-hash",
          size: 1024,
        }),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        register: vi.fn(),
        getProvider: vi.fn(),
        setDefaultProvider: vi.fn(),
        listProviders: vi.fn(),
        getDefaultProvider: vi.fn(),
        getStorageProviders: vi.fn(),
        getDefaultStorageProvider: vi.fn(),
      } as unknown as StorageManager;

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerUrl: undefined,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      // Mock writeContract to fail
      vi.mocked(mockWalletClient.writeContract).mockRejectedValueOnce(
        new Error("Transaction failed"),
      );

      const testFile = new Blob(["test data"], { type: "text/plain" });

      await expect(
        controllerWithStorage.uploadEncryptedFileWithSchema(testFile, 1),
      ).rejects.toThrow("Upload failed: Transaction failed");
    });

    it("should handle writeContract failure for registerFileWithSchema", async () => {
      // Mock writeContract to fail
      vi.mocked(mockWalletClient.writeContract).mockRejectedValueOnce(
        new Error("Registration failed"),
      );

      await expect(
        controller.registerFileWithSchema("https://example.com/file.json", 1),
      ).rejects.toThrow("Registration failed: Registration failed");
    });

    it("should handle missing chainId for isValidSchemaId", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockWalletClient,
          chain: undefined,
        } as unknown as ControllerContext["walletClient"],
      };

      const controllerWithoutChain = new DataController(contextWithoutChain);

      const result = await controllerWithoutChain.isValidSchemaId(1);
      expect(result).toBe(false);
    });

    it("should handle event parsing failure in schema upload", async () => {
      const mockStorageManager = {
        upload: vi.fn().mockResolvedValue({
          url: "https://ipfs.io/ipfs/test-hash",
          size: 1024,
        }),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        register: vi.fn(),
        getProvider: vi.fn(),
        setDefaultProvider: vi.fn(),
        listProviders: vi.fn(),
        getDefaultProvider: vi.fn(),
        getStorageProviders: vi.fn(),
        getDefaultStorageProvider: vi.fn(),
      } as unknown as StorageManager;

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerUrl: undefined,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      const { decodeEventLog } = await import("viem");

      // Mock decodeEventLog to always throw (no valid events)
      vi.mocked(decodeEventLog).mockImplementation(() => {
        throw new Error("No matching event");
      });

      vi.mocked(
        mockContext.publicClient.waitForTransactionReceipt,
      ).mockResolvedValueOnce({
        logs: [
          {
            data: "0x123",
            topics: ["0x456"],
          },
        ],
      } as unknown as TransactionReceipt);

      const testFile = new Blob(["test data"], { type: "text/plain" });
      const result = await controllerWithStorage.uploadEncryptedFileWithSchema(
        testFile,
        1,
        "test.txt",
      );

      // Should return with fileId 0 when no event can be parsed
      expect(result).toEqual({
        fileId: 0,
        url: "https://ipfs.io/ipfs/test-hash",
        size: 1024,
        transactionHash: "0xtxhash",
      });
    });

    it("should handle event parsing failure in registerFileWithSchema", async () => {
      const { decodeEventLog } = await import("viem");

      // Mock decodeEventLog to always throw (no valid events)
      vi.mocked(decodeEventLog).mockImplementation(() => {
        throw new Error("No matching event");
      });

      vi.mocked(
        mockContext.publicClient.waitForTransactionReceipt,
      ).mockResolvedValueOnce({
        logs: [
          {
            data: "0x123",
            topics: ["0x456"],
          },
        ],
      } as unknown as TransactionReceipt);

      const result = await controller.registerFileWithSchema(
        "https://example.com/file.json",
        2,
      );

      // Should return with fileId 0 when no event can be parsed
      expect(result).toEqual({
        fileId: 0,
        transactionHash: "0xtxhash",
      });
    });

    it("should handle storage upload failure for schema upload", async () => {
      const mockStorageManager = {
        upload: vi.fn().mockRejectedValue(new Error("Storage upload failed")),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        register: vi.fn(),
        getProvider: vi.fn(),
        setDefaultProvider: vi.fn(),
        listProviders: vi.fn(),
        getDefaultProvider: vi.fn(),
        getStorageProviders: vi.fn(),
        getDefaultStorageProvider: vi.fn(),
      } as unknown as StorageManager;

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerUrl: undefined,
      };

      const controllerWithStorage = new DataController(contextWithStorage);
      const testFile = new Blob(["test data"], { type: "text/plain" });

      await expect(
        controllerWithStorage.uploadEncryptedFileWithSchema(testFile, 1),
      ).rejects.toThrow("Upload failed: Storage upload failed");
    });

    it("should handle no logs in transaction receipt for schema upload", async () => {
      const mockStorageManager = {
        upload: vi.fn().mockResolvedValue({
          url: "https://ipfs.io/ipfs/test-hash",
          size: 1024,
        }),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        register: vi.fn(),
        getProvider: vi.fn(),
        setDefaultProvider: vi.fn(),
        listProviders: vi.fn(),
        getDefaultProvider: vi.fn(),
        getStorageProviders: vi.fn(),
        getDefaultStorageProvider: vi.fn(),
      } as unknown as StorageManager;

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerUrl: undefined,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      vi.mocked(
        mockContext.publicClient.waitForTransactionReceipt,
      ).mockResolvedValueOnce({
        logs: [], // No logs
      } as unknown as TransactionReceipt);

      const testFile = new Blob(["test data"], { type: "text/plain" });
      const result = await controllerWithStorage.uploadEncryptedFileWithSchema(
        testFile,
        1,
        "test.txt",
      );

      // Should return with fileId 0 when no logs
      expect(result).toEqual({
        fileId: 0,
        url: "https://ipfs.io/ipfs/test-hash",
        size: 1024,
        transactionHash: "0xtxhash",
      });
    });

    it("should handle no logs in transaction receipt for registerFileWithSchema", async () => {
      vi.mocked(
        mockContext.publicClient.waitForTransactionReceipt,
      ).mockResolvedValueOnce({
        logs: [], // No logs
      } as unknown as TransactionReceipt);

      const result = await controller.registerFileWithSchema(
        "https://example.com/file.json",
        2,
      );

      // Should return with fileId 0 when no logs
      expect(result).toEqual({
        fileId: 0,
        transactionHash: "0xtxhash",
      });
    });

    it("should handle non-FileAdded event in logs for schema upload", async () => {
      const mockStorageManager = {
        upload: vi.fn().mockResolvedValue({
          url: "https://ipfs.io/ipfs/test-hash",
          size: 1024,
        }),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        register: vi.fn(),
        getProvider: vi.fn(),
        setDefaultProvider: vi.fn(),
        listProviders: vi.fn(),
        getDefaultProvider: vi.fn(),
        getStorageProviders: vi.fn(),
        getDefaultStorageProvider: vi.fn(),
      } as unknown as StorageManager;

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerUrl: undefined,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      const { decodeEventLog } = await import("viem");

      // Mock decodeEventLog to return different event
      vi.mocked(decodeEventLog).mockReturnValueOnce({
        eventName: "DifferentEvent",
        args: { someOtherField: BigInt(999) },
      } as ReturnType<typeof decodeEventLog>);

      vi.mocked(
        mockContext.publicClient.waitForTransactionReceipt,
      ).mockResolvedValueOnce({
        logs: [
          {
            data: "0x123",
            topics: ["0x456"],
          },
        ],
      } as unknown as TransactionReceipt);

      const testFile = new Blob(["test data"], { type: "text/plain" });
      const result = await controllerWithStorage.uploadEncryptedFileWithSchema(
        testFile,
        1,
        "test.txt",
      );

      // Should return with fileId 0 when event is not FileAdded
      expect(result).toEqual({
        fileId: 0,
        url: "https://ipfs.io/ipfs/test-hash",
        size: 1024,
        transactionHash: "0xtxhash",
      });
    });

    it("should handle non-FileAdded event in logs for registerFileWithSchema", async () => {
      const { decodeEventLog } = await import("viem");

      // Mock decodeEventLog to return different event
      vi.mocked(decodeEventLog).mockReturnValueOnce({
        eventName: "DifferentEvent",
        args: { someOtherField: BigInt(999) },
      } as ReturnType<typeof decodeEventLog>);

      vi.mocked(
        mockContext.publicClient.waitForTransactionReceipt,
      ).mockResolvedValueOnce({
        logs: [
          {
            data: "0x123",
            topics: ["0x456"],
          },
        ],
      } as unknown as TransactionReceipt);

      const result = await controller.registerFileWithSchema(
        "https://example.com/file.json",
        2,
      );

      // Should return with fileId 0 when event is not FileAdded
      expect(result).toEqual({
        fileId: 0,
        transactionHash: "0xtxhash",
      });
    });

    it("should throw error when uploading with schema via relayer", async () => {
      const mockStorageManager = {
        upload: vi.fn().mockResolvedValue({
          url: "https://ipfs.io/ipfs/test-hash",
          size: 1024,
        }),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        register: vi.fn(),
        getProvider: vi.fn(),
        setDefaultProvider: vi.fn(),
        listProviders: vi.fn(),
        getDefaultProvider: vi.fn(),
        getStorageProviders: vi.fn(),
        getDefaultStorageProvider: vi.fn(),
      } as unknown as StorageManager;

      const contextWithRelayer = {
        ...mockContext,
        storageManager: mockStorageManager,
        relayerCallbacks: {
          submitFileAddition: vi.fn().mockResolvedValue({
            fileId: 123,
            transactionHash: "0x123456789abcdef",
          }),
        },
      };

      const controllerWithRelayer = new DataController(contextWithRelayer);
      const testFile = new Blob(["test data"], { type: "text/plain" });

      await expect(
        controllerWithRelayer.uploadEncryptedFileWithSchema(testFile, 1),
      ).rejects.toThrow(
        "Upload failed: Relayer does not yet support uploading files with schema",
      );
    });
  });

  describe("uploadToStorage", () => {
    // Helper to create a mock storage manager with all required public methods
    const createMockStorageManager = () => {
      const mock = {
        register: vi.fn(),
        getProvider: vi.fn(),
        listProviders: vi.fn().mockReturnValue(["mock"]),
        getDefaultProvider: vi.fn().mockReturnValue("mock"),
        setDefaultProvider: vi.fn(),
        upload: vi.fn(),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        getStorageProviders: vi.fn().mockReturnValue(["mock"]),
        getDefaultStorageProvider: vi.fn().mockReturnValue("mock"),
      };
      return mock as unknown as StorageManager & typeof mock;
    };

    it("should upload a Blob to storage and return the file URL", async () => {
      const testBlob = new Blob(["test data"], { type: "text/plain" });
      const expectedUrl = "https://storage.example.com/file123";

      // Create mock storage manager
      const mockStorageManager = createMockStorageManager();
      mockStorageManager.upload.mockResolvedValue({
        url: expectedUrl,
        size: testBlob.size,
        contentType: "text/plain",
      });

      // Create context with storage manager
      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      // Call the method with provider as 4th param
      const result = await controllerWithStorage.uploadToStorage(
        testBlob,
        "test.txt",
        false,
        "ipfs",
      );

      // Verify the result
      expect(result).toBe(expectedUrl);

      // Verify storage manager was called correctly
      expect(mockStorageManager.upload).toHaveBeenCalledWith(
        testBlob,
        "test.txt",
        "ipfs",
      );
      expect(mockStorageManager.upload).toHaveBeenCalledTimes(1);
    });

    it("should upload a string to storage and return the file URL", async () => {
      const testString = "test data";
      const expectedUrl = "ipfs://QmTestHash";

      const mockStorageManager = createMockStorageManager();
      mockStorageManager.upload.mockResolvedValue({
        url: expectedUrl,
        size: 9,
        contentType: "text/plain",
      });

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      const result = await controllerWithStorage.uploadToStorage(
        testString,
        "test.txt",
      );

      expect(result).toBe(expectedUrl);
      // Verify it was converted to a Blob with text/plain type
      expect(mockStorageManager.upload).toHaveBeenCalledWith(
        expect.any(Blob),
        "test.txt",
        undefined,
      );
      const uploadedBlob = mockStorageManager.upload.mock.calls[0][0];
      expect(uploadedBlob.type).toBe("text/plain");
    });

    it("should upload a Buffer to storage and return the file URL", async () => {
      // Create a Buffer
      const testBuffer = Buffer.from("test data");
      const expectedUrl = "https://storage.example.com/buffer-file";

      const mockStorageManager = createMockStorageManager();
      mockStorageManager.upload.mockResolvedValue({
        url: expectedUrl,
        size: testBuffer.length,
        contentType: "application/octet-stream",
      });

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      const result = await controllerWithStorage.uploadToStorage(
        testBuffer,
        "buffer-file.bin",
      );

      expect(result).toBe(expectedUrl);
      // Verify it was converted to a Blob with application/octet-stream type
      expect(mockStorageManager.upload).toHaveBeenCalledWith(
        expect.any(Blob),
        "buffer-file.bin",
        undefined,
      );
      const uploadedBlob = mockStorageManager.upload.mock.calls[0][0];
      expect(uploadedBlob.type).toBe("application/octet-stream");
    });

    it("should throw an error if storage manager is not configured", async () => {
      // Create context without storage manager
      const contextWithoutStorage = {
        ...mockContext,
        storageManager: undefined,
      };

      const controllerWithoutStorage = new DataController(
        contextWithoutStorage,
      );
      const testContent = "test data";

      await expect(
        controllerWithoutStorage.uploadToStorage(testContent, "test.txt"),
      ).rejects.toThrow(
        "Storage manager not configured. Please provide storage providers in VanaConfig.",
      );
    });

    it("should handle storage upload errors", async () => {
      const testContent = "test data";
      const errorMessage = "Network error during upload";

      const mockStorageManager = createMockStorageManager();
      mockStorageManager.upload.mockRejectedValue(new Error(errorMessage));

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      await expect(
        controllerWithStorage.uploadToStorage(testContent, "test.txt"),
      ).rejects.toThrow(`Upload failed: ${errorMessage}`);

      expect(mockStorageManager.upload).toHaveBeenCalledWith(
        expect.any(Blob),
        "test.txt",
        undefined,
      );
    });

    it("should handle different content types", async () => {
      const contentTypes = [
        {
          content: "text content",
          name: "text.txt",
          expectedType: "text/plain",
        },
        {
          content: Buffer.from("buffer data"),
          name: "buffer.bin",
          expectedType: "application/octet-stream",
        },
        {
          content: new Blob(["blob data"], { type: "image/png" }),
          name: "image.png",
          expectedType: "image/png",
        },
        {
          content: { key: "value" },
          name: "data.json",
          expectedType: "application/json",
        },
      ];

      const mockStorageManager = createMockStorageManager();

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      for (const item of contentTypes) {
        const expectedUrl = `https://storage.example.com/${item.name}`;

        mockStorageManager.upload.mockResolvedValue({
          url: expectedUrl,
          size: 100,
          contentType: item.expectedType,
        });

        const result = await controllerWithStorage.uploadToStorage(
          item.content as string | Blob | Buffer,
          item.name,
        );

        expect(result).toBe(expectedUrl);
        expect(mockStorageManager.upload).toHaveBeenCalledWith(
          expect.any(Blob),
          item.name,
          undefined,
        );

        const uploadedBlob =
          mockStorageManager.upload.mock.calls[
            mockStorageManager.upload.mock.calls.length - 1
          ][0];
        expect(uploadedBlob.type).toBe(item.expectedType);
      }
    });

    it("should use specified storage provider", async () => {
      const testContent = "test data";
      const providers = ["ipfs", "pinata", "arweave", "filecoin"];

      const mockStorageManager = createMockStorageManager();

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      for (const provider of providers) {
        const expectedUrl = `https://${provider}.example.com/file`;

        mockStorageManager.upload.mockResolvedValue({
          url: expectedUrl,
          size: 9,
          contentType: "text/plain",
        });

        const result = await controllerWithStorage.uploadToStorage(
          testContent,
          "test.txt",
          false,
          provider,
        );

        expect(result).toBe(expectedUrl);
        expect(mockStorageManager.upload).toHaveBeenCalledWith(
          expect.any(Blob),
          "test.txt",
          provider,
        );
      }
    });

    it("should handle non-Error objects in catch block", async () => {
      const testContent = "test data";

      const mockStorageManager = createMockStorageManager();
      mockStorageManager.upload.mockRejectedValue("String error");

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      await expect(
        controllerWithStorage.uploadToStorage(testContent, "test.txt"),
      ).rejects.toThrow("Upload failed: Unknown error");
    });

    it("should handle objects by JSON stringifying them", async () => {
      const testObject = { key: "value", nested: { data: 123 } };
      const expectedUrl = "https://storage.example.com/object.json";

      const mockStorageManager = createMockStorageManager();
      mockStorageManager.upload.mockResolvedValue({
        url: expectedUrl,
        size: JSON.stringify(testObject).length,
        contentType: "application/json",
      });

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      // uploadToStorage should handle objects by JSON stringifying
      const result = await controllerWithStorage.uploadToStorage(
        testObject,
        "object.json",
      );

      expect(result).toBe(expectedUrl);
      // Verify it was converted to a Blob with application/json type
      expect(mockStorageManager.upload).toHaveBeenCalledWith(
        expect.any(Blob),
        "object.json",
        undefined,
      );
      const uploadedBlob = mockStorageManager.upload.mock.calls[0][0];
      expect(uploadedBlob.type).toBe("application/json");

      // Verify no blockchain methods were called
      expect(
        contextWithStorage.walletClient.writeContract,
      ).not.toHaveBeenCalled();
      expect(
        contextWithStorage.publicClient.waitForTransactionReceipt,
      ).not.toHaveBeenCalled();
    });

    it("should encrypt content when encrypt parameter is true", async () => {
      const testContent = "sensitive data";
      const expectedUrl = "https://storage.example.com/encrypted.txt";

      // Mock encryption functions
      const { generateEncryptionKey, encryptBlobWithSignedKey } = await import(
        "../utils/encryption"
      );
      (generateEncryptionKey as Mock).mockResolvedValue("mock-encryption-key");
      (encryptBlobWithSignedKey as Mock).mockResolvedValue(
        new Blob(["encrypted"], { type: "application/octet-stream" }),
      );

      const mockStorageManager = createMockStorageManager();
      mockStorageManager.upload.mockResolvedValue({
        url: expectedUrl,
        size: 9,
        contentType: "application/octet-stream",
      });

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      // Call with encrypt = true
      const result = await controllerWithStorage.uploadToStorage(
        testContent,
        "encrypted.txt",
        true,
      );

      expect(result).toBe(expectedUrl);

      // Verify encryption functions were called
      expect(generateEncryptionKey).toHaveBeenCalled();
      expect(encryptBlobWithSignedKey).toHaveBeenCalled();

      // Verify the encrypted blob was uploaded
      expect(mockStorageManager.upload).toHaveBeenCalledWith(
        expect.any(Blob),
        "encrypted.txt",
        undefined,
      );
    });

    it("should not encrypt content when encrypt parameter is false", async () => {
      const testContent = "plain data";
      const expectedUrl = "https://storage.example.com/plain.txt";

      const mockStorageManager = createMockStorageManager();
      mockStorageManager.upload.mockResolvedValue({
        url: expectedUrl,
        size: 10,
        contentType: "text/plain",
      });

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      // Call with encrypt = false (default)
      const result = await controllerWithStorage.uploadToStorage(
        testContent,
        "plain.txt",
      );

      expect(result).toBe(expectedUrl);

      // Verify the plain text blob was uploaded
      expect(mockStorageManager.upload).toHaveBeenCalledWith(
        expect.any(Blob),
        "plain.txt",
        undefined,
      );
      const uploadedBlob = mockStorageManager.upload.mock.calls[0][0];
      expect(uploadedBlob.type).toBe("text/plain");
    });
  });
});
