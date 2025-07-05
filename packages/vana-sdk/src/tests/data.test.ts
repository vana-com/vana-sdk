import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { DataController } from "../controllers/data";
import { ControllerContext } from "../controllers/permissions";

// Mock ALL external dependencies for pure unit tests
vi.mock("../utils/encryption", () => ({
  generateEncryptionKey: vi.fn(),
  decryptUserData: vi.fn(),
  encryptUserData: vi.fn(),
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
    },
  })),
  http: vi.fn(),
  createWalletClient: vi.fn(),
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

describe("DataController", () => {
  let controller: DataController;
  let mockContext: ControllerContext;
  let mockWalletClient: any;

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

    mockContext = {
      walletClient: mockWalletClient,
      relayerUrl: "https://test-relayer.com",
    };

    controller = new DataController(mockContext);
  });

  describe("getUserFiles", () => {
    it("should return no data when no subgraph URL configured", async () => {
      // Don't set NEXT_PUBLIC_SUBGRAPH_URL
      delete process.env.NEXT_PUBLIC_SUBGRAPH_URL;

      const result = await controller.getUserFiles({
        owner: mockWalletClient.account.address as `0x${string}`,
      });

      expect(result).toHaveLength(0);
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

      // Mock contract calls for file details
      const { createPublicClient } = await import("viem");
      const mockPublicClient = {
        readContract: vi
          .fn()
          .mockResolvedValue([
            BigInt(12),
            "ipfs://QmTestFile",
            testAddress,
            BigInt(123456),
          ]),
      };
      vi.mocked(createPublicClient).mockReturnValueOnce(
        mockPublicClient as any,
      );

      const result = await controller.getUserFiles({
        owner: testAddress as `0x${string}`,
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 12,
        url: "ipfs://QmTestFile",
        ownerAddress: testAddress,
        addedAtBlock: BigInt(123456),
      });
    });

    it("should handle subgraph errors gracefully", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await controller.getUserFiles({
        owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      // Should fallback to mock data
      expect(result).toHaveLength(3);
    });
  });

  describe("getTotalFilesCount", () => {
    it("should return file count from contract", async () => {
      const { createPublicClient } = await import("viem");
      const mockPublicClient = {
        readContract: vi.fn().mockResolvedValue(BigInt(42)),
      };
      vi.mocked(createPublicClient).mockReturnValueOnce(
        mockPublicClient as any,
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
      const { encryptUserData, generateEncryptionKey } = await import(
        "../utils/encryption"
      );
      const { StorageManager } = await import("../storage");
      const mockFetch = fetch as Mock;

      const testFile = new Blob(["test content"], { type: "text/plain" });
      const encryptedBlob = new Blob(["encrypted content"]);

      // Mock storage manager in context
      const mockStorageManager = new StorageManager();
      mockContext.storageManager = mockStorageManager;
      controller = new DataController(mockContext);

      // Mock encryption
      vi.mocked(generateEncryptionKey).mockResolvedValue("0xencryptionkey");
      vi.mocked(encryptUserData).mockResolvedValue(encryptedBlob);

      // Mock relayer response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            fileId: 42,
            transactionHash: "0xtxhash",
          }),
      });

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
      delete mockContext.relayerUrl;

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

      const { decryptUserData } = await import("../utils/encryption");
      vi.mocked(decryptUserData).mockRejectedValue(
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

      const { decryptUserData } = await import("../utils/encryption");
      vi.mocked(decryptUserData).mockRejectedValue(
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

      const { decryptUserData } = await import("../utils/encryption");
      vi.mocked(decryptUserData).mockRejectedValueOnce(
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

      const { decryptUserData } = await import("../utils/encryption");
      vi.mocked(decryptUserData).mockRejectedValueOnce(
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

      const { decryptUserData } = await import("../utils/encryption");
      vi.mocked(decryptUserData).mockResolvedValueOnce(
        new Blob(["decrypted content"]),
      );

      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(["encrypted content"])),
      });

      const result = await controller.decryptFile(mockFile);

      expect(result).toBeInstanceOf(Blob);
      expect(mockFetch).toHaveBeenCalledWith("https://ipfs.io/ipfs/QmTestHash");
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
        "File is empty or could not be retrieved",
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
        "Access denied. You may not have permission to access this file",
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

      const { decryptUserData } = await import("../utils/encryption");
      vi.mocked(decryptUserData).mockRejectedValueOnce(
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

      const result = await controller.getUserFiles({
        owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      // Should fallback to mock data
      expect(result).toHaveLength(3);
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
        },
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
      } as any);

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

      // Mock getContract to return object format instead of array
      const { getContract } = await import("viem");
      vi.mocked(getContract).mockReturnValueOnce({
        read: {
          files: vi.fn().mockResolvedValue({
            id: BigInt(12),
            url: "ipfs://QmTestFile",
            ownerAddress:
              "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
            addedAtBlock: BigInt(123456),
          }),
        },
      } as any);

      const result = await controller.getUserFiles({
        owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 12,
        url: "ipfs://QmTestFile",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: BigInt(123456),
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
        },
      };

      const controllerWithoutChain = new DataController(contextWithoutChain);

      await expect(controllerWithoutChain.getFileById(1)).rejects.toThrow(
        "Chain ID not available",
      );
    });

    it("should handle null file details response", async () => {
      const { getContract } = await import("viem");
      vi.mocked(getContract).mockReturnValueOnce({
        read: {
          files: vi.fn().mockResolvedValue(null),
        },
      } as any);

      await expect(controller.getFileById(1)).rejects.toThrow("File not found");
    });

    it("should handle zero ID in array format", async () => {
      const { getContract } = await import("viem");
      vi.mocked(getContract).mockReturnValueOnce({
        read: {
          files: vi.fn().mockResolvedValue([
            BigInt(0), // Zero ID means file not found
            "ipfs://QmTestFile",
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
            BigInt(123456),
          ]),
        },
      } as any);

      await expect(controller.getFileById(1)).rejects.toThrow("File not found");
    });

    it("should handle zero ID in object format", async () => {
      const { getContract } = await import("viem");
      vi.mocked(getContract).mockReturnValueOnce({
        read: {
          files: vi.fn().mockResolvedValue({
            id: BigInt(0), // Zero ID means file not found
            url: "ipfs://QmTestFile",
            ownerAddress:
              "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
            addedAtBlock: BigInt(123456),
          }),
        },
      } as any);

      await expect(controller.getFileById(1)).rejects.toThrow("File not found");
    });

    it("should handle missing ID in object format", async () => {
      const { getContract } = await import("viem");
      vi.mocked(getContract).mockReturnValueOnce({
        read: {
          files: vi.fn().mockResolvedValue({
            // Missing id field
            url: "ipfs://QmTestFile",
            ownerAddress:
              "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
            addedAtBlock: BigInt(123456),
          }),
        },
      } as any);

      await expect(controller.getFileById(1)).rejects.toThrow("File not found");
    });

    it("should handle object format response correctly", async () => {
      const { getContract } = await import("viem");
      vi.mocked(getContract).mockReturnValueOnce({
        read: {
          files: vi.fn().mockResolvedValue({
            id: BigInt(5),
            url: "ipfs://QmObjectFormat",
            ownerAddress:
              "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
            addedAtBlock: BigInt(789123),
          }),
        },
      } as any);

      const result = await controller.getFileById(5);

      expect(result).toEqual({
        id: 5,
        url: "ipfs://QmObjectFormat",
        ownerAddress:
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
        addedAtBlock: BigInt(789123),
      });
    });
  });

  describe("getTotalFilesCount additional branches", () => {
    it("should handle missing chainId", async () => {
      const contextWithoutChain = {
        ...mockContext,
        walletClient: {
          ...mockWalletClient,
          chain: undefined,
        },
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
      } as any);

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
      const mockFetch = fetch as Mock;

      const mockStorageManager = new StorageManager();
      mockContext.storageManager = mockStorageManager;
      controller = new DataController(mockContext);

      // Mock relayer to return error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const testFile = new Blob(["test content"]);

      await expect(controller.uploadEncryptedFile(testFile)).rejects.toThrow(
        "Failed to register file on blockchain: Internal Server Error",
      );
    });

    it("should handle relayer success false response", async () => {
      const { StorageManager } = await import("../storage");
      const mockFetch = fetch as Mock;

      const mockStorageManager = new StorageManager();
      mockContext.storageManager = mockStorageManager;
      controller = new DataController(mockContext);

      // Mock relayer to return success: false
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: "Custom relayer error",
          }),
      });

      const testFile = new Blob(["test content"]);

      await expect(controller.uploadEncryptedFile(testFile)).rejects.toThrow(
        "Custom relayer error",
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
        },
      };

      const controllerWithoutChain = new DataController(contextWithoutChain);
      const testFile = new Blob(["test content"]);

      await expect(
        controllerWithoutChain.uploadEncryptedFile(testFile),
      ).rejects.toThrow("Chain ID not available");
    });
  });
});
