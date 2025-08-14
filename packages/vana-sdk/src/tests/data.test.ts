import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { DataController } from "../controllers/data";
import { ControllerContext } from "../controllers/permissions";
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
      contenttype: "application/octet-stream",
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
        dialect: "json",
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
        contenttype: "text/plain",
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
      expect(result).toEqual({
        url: expectedUrl,
        size: testBlob.size,
        contenttype: "text/plain",
      });

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
        contenttype: "text/plain",
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

      expect(result).toEqual({
        url: expectedUrl,
        size: 9,
        contenttype: "text/plain",
      });
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
        contenttype: "application/octet-stream",
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

      expect(result).toEqual({
        url: expectedUrl,
        size: testBuffer.length,
        contenttype: "application/octet-stream",
      });
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
      const contenttypes = [
        {
          content: "text content",
          name: "text.txt",
          expectedtype: "text/plain",
        },
        {
          content: Buffer.from("buffer data"),
          name: "buffer.bin",
          expectedtype: "application/octet-stream",
        },
        {
          content: new Blob(["blob data"], { type: "image/png" }),
          name: "image.png",
          expectedtype: "image/png",
        },
        {
          content: { key: "value" },
          name: "data.json",
          expectedtype: "application/json",
        },
      ];

      const mockStorageManager = createMockStorageManager();

      const contextWithStorage = {
        ...mockContext,
        storageManager: mockStorageManager,
      };

      const controllerWithStorage = new DataController(contextWithStorage);

      for (const item of contenttypes) {
        const expectedUrl = `https://storage.example.com/${item.name}`;

        mockStorageManager.upload.mockResolvedValue({
          url: expectedUrl,
          size: 100,
          contenttype: item.expectedtype,
        });

        const result = await controllerWithStorage.uploadToStorage(
          item.content as string | Blob | Buffer,
          item.name,
        );

        expect(result).toEqual({
          url: expectedUrl,
          size: 100,
          contenttype: item.expectedtype,
        });
        expect(mockStorageManager.upload).toHaveBeenCalledWith(
          expect.any(Blob),
          item.name,
          undefined,
        );

        const uploadedBlob =
          mockStorageManager.upload.mock.calls[
            mockStorageManager.upload.mock.calls.length - 1
          ][0];
        expect(uploadedBlob.type).toBe(item.expectedtype);
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
          contenttype: "text/plain",
        });

        const result = await controllerWithStorage.uploadToStorage(
          testContent,
          "test.txt",
          false,
          provider,
        );

        expect(result).toEqual({
          url: expectedUrl,
          size: 9,
          contenttype: "text/plain",
        });
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
        contenttype: "application/json",
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

      expect(result).toEqual({
        url: expectedUrl,
        size: 37, // Size of JSON.stringify({ data: "test", count: 42 })
        contenttype: "application/json",
      });
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
        contenttype: "application/octet-stream",
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

      expect(result).toEqual({
        url: expectedUrl,
        size: 9,
        contenttype: "application/octet-stream",
      });

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
        contenttype: "text/plain",
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

      expect(result).toEqual({
        url: expectedUrl,
        size: 10,
        contenttype: "text/plain",
      });

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
