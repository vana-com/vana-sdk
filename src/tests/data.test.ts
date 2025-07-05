import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { DataController, ControllerContext } from "../controllers/data";

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
        mockPublicClient as any
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
        mockPublicClient as any
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
      const mockStorageManager = new StorageManager({ providers: [] });
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
      const mockStorageManager = new StorageManager({ providers: [] });
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
        "Upload failed: Signing failed"
      );
    });
  });

  describe("decryptFile Error Handling", () => {
    const mockFile = {
      id: 1,
      url: "https://example.com/file.dat",
      ownerAddress: "0x1234567890123456789012345678901234567890" as const,
      addedAtBlock: BigInt(123456),
    };

    it("should handle network errors during file retrieval", async () => {
      const mockFetch = fetch as Mock;
      const { generateEncryptionKey } = await import("../utils/encryption");

      // Mock encryption key generation
      vi.mocked(generateEncryptionKey).mockResolvedValue("0xencryptionkey");

      // Mock network error (Failed to fetch)
      mockFetch.mockRejectedValue(new Error("Failed to fetch"));

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions."
      );
    });

    it("should handle network errors with Network error message", async () => {
      const mockFetch = fetch as Mock;
      const { generateEncryptionKey } = await import("../utils/encryption");

      // Mock encryption key generation
      vi.mocked(generateEncryptionKey).mockResolvedValue("0xencryptionkey");

      // Mock network error with "Network error" in message
      mockFetch.mockRejectedValue(new Error("Network error occurred"));

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions."
      );
    });

    it("should handle invalid OpenPGP message format errors", async () => {
      const mockFetch = fetch as Mock;
      const { generateEncryptionKey, decryptUserData } = await import(
        "../utils/encryption"
      );

      // Mock encryption key generation
      vi.mocked(generateEncryptionKey).mockResolvedValue("0xencryptionkey");

      // Mock successful fetch but invalid OpenPGP format
      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["invalid data"])),
      });

      vi.mocked(decryptUserData).mockRejectedValue(
        new Error("not a valid OpenPGP message")
      );

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Invalid file format: This file doesn't appear to be encrypted with the Vana protocol."
      );
    });

    it("should handle wrong encryption key errors", async () => {
      const mockFetch = fetch as Mock;
      const { generateEncryptionKey, decryptUserData } = await import(
        "../utils/encryption"
      );

      // Mock successful fetch
      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["encrypted data"])),
      });

      // Mock encryption key generation
      vi.mocked(generateEncryptionKey).mockResolvedValue("0xencryptionkey");

      // Mock decryption failure with wrong key
      vi.mocked(decryptUserData).mockRejectedValue(
        new Error("Error decrypting message")
      );

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Wrong encryption key. This file may have been encrypted with a different wallet or encryption seed. Try using the same wallet that originally encrypted this file."
      );
    });

    it("should handle file not found errors", async () => {
      const mockFetch = fetch as Mock;
      const { generateEncryptionKey } = await import("../utils/encryption");

      // Mock encryption key generation
      vi.mocked(generateEncryptionKey).mockResolvedValue("0xencryptionkey");

      // Mock file not found error
      mockFetch.mockRejectedValue(new Error("File not found"));

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "File not found: The encrypted file is no longer available at the stored URL."
      );
    });

    it("should preserve other errors unchanged", async () => {
      const mockFetch = fetch as Mock;
      const { generateEncryptionKey } = await import("../utils/encryption");

      // Mock encryption key generation
      vi.mocked(generateEncryptionKey).mockResolvedValue("0xencryptionkey");

      // Mock some other error
      mockFetch.mockRejectedValue(new Error("Some other error"));

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "Some other error"
      );
    });

    it("should handle HTTP status errors during file retrieval", async () => {
      const mockFetch = fetch as Mock;
      const { generateEncryptionKey } = await import("../utils/encryption");

      // Mock encryption key generation
      vi.mocked(generateEncryptionKey).mockResolvedValue("0xencryptionkey");

      // Mock fetch to return HTTP error
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(controller.decryptFile(mockFile)).rejects.toThrow(
        "File not found: The encrypted file is no longer available at the stored URL."
      );
    });

    it("should handle IPFS URL conversion correctly", async () => {
      const mockFetch = fetch as Mock;
      const { generateEncryptionKey, decryptUserData } = await import(
        "../utils/encryption"
      );

      // Mock encryption key generation
      vi.mocked(generateEncryptionKey).mockResolvedValue("0xencryptionkey");

      // Mock successful fetch from IPFS
      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["encrypted content"])),
      });

      // Mock successful decryption
      vi.mocked(decryptUserData).mockResolvedValue("decrypted content");

      const ipfsFile = {
        id: 1,
        url: "ipfs://QmTestHash123",
        ownerAddress: mockWalletClient.account.address,
        addedAtBlock: 123456n,
      };

      const result = await controller.decryptFile(ipfsFile);

      expect(result).toBe("decrypted content");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://ipfs.io/ipfs/QmTestHash123"
      );
    });
  });
});
