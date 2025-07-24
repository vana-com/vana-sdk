import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import type { Hash, Address, PublicClient } from "viem";
import {
  PermissionsController,
  ControllerContext,
} from "../controllers/permissions";
import {
  RelayerError,
  UserRejectedRequestError,
  NonceError,
  NetworkError,
  BlockchainError,
  SignatureError,
  PermissionError,
} from "../errors";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock ALL external dependencies to ensure pure unit tests
vi.mock("viem", () => ({
  createPublicClient: vi.fn(() => ({
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
  })),
  getContract: vi.fn(() => ({
    read: {
      userPermissionIdsLength: vi.fn(),
      userPermissionIdsAt: vi.fn(),
      permissions: vi.fn(),
    },
  })),
  http: vi.fn(),
  createWalletClient: vi.fn(),
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
      name: "userNonce",
      type: "function",
      inputs: [{ name: "user", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
    },
    {
      name: "addPermission",
      type: "function",
      inputs: [
        { name: "permission", type: "tuple" },
        { name: "signature", type: "bytes" },
      ],
      outputs: [],
    },
  ]),
}));

// Mock fetch globally - no real network calls
global.fetch = vi.fn();

// Mock grant file utilities - no real IPFS operations
vi.mock("../utils/grantFiles", () => ({
  createGrantFile: vi.fn(),
  storeGrantFile: vi.fn().mockResolvedValue("https://ipfs.io/ipfs/Qm..."),
  getGrantFileHash: vi.fn().mockReturnValue("0xgrantfilehash"),
}));

// Import the mocked functions for configuration
import { createGrantFile } from "../utils/grantFiles";

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
  signTypedData: ReturnType<typeof vi.fn>;
  writeContract: ReturnType<typeof vi.fn>;
}

interface MockPublicClient {
  readContract: ReturnType<typeof vi.fn>;
  waitForTransactionReceipt: ReturnType<typeof vi.fn>;
}

describe("PermissionsController", () => {
  let controller: PermissionsController;
  let mockContext: ControllerContext;
  let mockWalletClient: MockWalletClient;
  let mockPublicClient: MockPublicClient;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup parseEventLogs mock - will be configured per test
    const { parseEventLogs } = await import("viem");
    vi.mocked(parseEventLogs).mockImplementation((params) => {
      // Return appropriate event based on the event name
      if ((params as any).eventName === "PermissionAdded") {
        return [
          {
            eventName: "PermissionAdded",
            args: {
              permissionId: 75n,
              user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
              grant: "https://mock-grant-url.com",
              fileIds: [],
            },
          },
        ] as any;
      } else if ((params as any).eventName === "PermissionRevoked") {
        return [
          {
            eventName: "PermissionRevoked",
            args: {
              permissionId: 123n,
            },
          },
        ] as any;
      }
      return [];
    });

    // Set up default mock for createGrantFile to return valid grant files
    const mockCreateGrantFile = createGrantFile as Mock;
    mockCreateGrantFile.mockImplementation(
      (params: Record<string, unknown>) => ({
        grantee: params.grantee,
        operation: params.operation,
        parameters: params.parameters,
        expires: params.expiresAt || Math.floor(Date.now() / 1000) + 3600,
      }),
    );

    // Reset fetch mock to a working state
    const mockFetch = fetch as Mock;
    mockFetch.mockReset();

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
      signTypedData: vi.fn().mockResolvedValue("0xsignature" as Hash),
      writeContract: vi.fn().mockResolvedValue("0xtxhash" as Hash),
    };

    // Create a mock publicClient
    mockPublicClient = {
      readContract: vi.fn().mockResolvedValue(BigInt(0)),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        blockNumber: 12345n,
        gasUsed: 100000n,
        logs: [],
      }),
    };

    mockContext = {
      walletClient:
        mockWalletClient as unknown as ControllerContext["walletClient"],
      publicClient:
        mockPublicClient as unknown as ControllerContext["publicClient"],
      relayerCallbacks: {
        storeGrantFile: vi.fn().mockResolvedValue("https://mock-grant-url.com"),
        submitPermissionGrant: vi.fn().mockResolvedValue("0xtxhash"),
      },
      platform: mockPlatformAdapter,
    };

    controller = new PermissionsController(mockContext);
  });

  describe("grant", () => {
    const mockGrantParams = {
      grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      operation: "llm_inference",
      files: [],
      parameters: {
        prompt: "Test prompt",
        maxTokens: 100,
      },
    };

    it("should successfully grant permission with complete flow", async () => {
      const result = await controller.grant(mockGrantParams);

      expect(result).toMatchObject({
        permissionId: 75n,
        user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        grant: "https://mock-grant-url.com",
        fileIds: [],
        transactionHash: "0xtxhash",
        blockNumber: 12345n,
        gasUsed: 100000n,
      });
      expect(mockWalletClient.signTypedData).toHaveBeenCalled();
      // Should use relayerCallbacks pattern
      expect(mockContext.relayerCallbacks?.storeGrantFile).toHaveBeenCalled();
      expect(
        mockContext.relayerCallbacks?.submitPermissionGrant,
      ).toHaveBeenCalled();
    });

    it("should handle user rejection gracefully", async () => {
      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      } as unknown as PublicClient);

      // Mock user rejection
      mockWalletClient.signTypedData.mockRejectedValue(
        new Error("User rejected request"),
      );

      await expect(controller.grant(mockGrantParams)).rejects.toThrow(
        UserRejectedRequestError,
      );
    });

    it("should handle relayer errors", async () => {
      // Mock relayer callbacks to fail
      const failingContext = {
        ...mockContext,
        relayerCallbacks: {
          ...mockContext.relayerCallbacks,
          submitPermissionGrant: vi
            .fn()
            .mockRejectedValue(new RelayerError("Relayer failed")),
        },
      };

      const failingController = new PermissionsController(failingContext);

      await expect(failingController.grant(mockGrantParams)).rejects.toThrow(
        RelayerError,
      );
    });

    it("should handle network errors gracefully", async () => {
      // Mock relayer callbacks to fail with network error
      const failingContext = {
        ...mockContext,
        relayerCallbacks: {
          ...mockContext.relayerCallbacks,
          submitPermissionGrant: vi
            .fn()
            .mockRejectedValue(new NetworkError("Network error")),
        },
      };

      const failingController = new PermissionsController(failingContext);

      await expect(failingController.grant(mockGrantParams)).rejects.toThrow(
        NetworkError,
      );
    });
  });

  describe("revoke", () => {
    const mockRevokeParams = {
      permissionId: BigInt(123),
    };

    it("should successfully revoke permission", async () => {
      const { createPublicClient } = await import("viem");
      const mockPublicClient = createPublicClient({
        chain: mockWalletClient.chain,
        transport: () => ({}),
      } as unknown as Parameters<typeof createPublicClient>[0]);
      vi.mocked(mockPublicClient.readContract).mockResolvedValue(BigInt(1));

      // Mock writeContract to return the expected hash
      mockWalletClient.writeContract = vi
        .fn()
        .mockResolvedValue("0xrevokehash");

      const result = await controller.revoke(mockRevokeParams);

      expect(result).toMatchObject({
        permissionId: 123n,
        transactionHash: "0xrevokehash",
        blockNumber: 12345n,
        gasUsed: 100000n,
      });
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0x1234567890123456789012345678901234567890",
          abi: expect.any(Array),
          functionName: "revokePermission",
          args: [mockRevokeParams.permissionId],
        }),
      );
    });

    it("should handle revoke errors", async () => {
      const { createPublicClient } = await import("viem");
      const mockPublicClient = createPublicClient({
        chain: mockWalletClient.chain,
        transport: () => ({}),
      } as unknown as Parameters<typeof createPublicClient>[0]);
      vi.mocked(mockPublicClient.readContract).mockResolvedValue(BigInt(1));

      // Mock writeContract to throw an error
      mockWalletClient.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("Transaction failed"));

      await expect(controller.revoke(mockRevokeParams)).rejects.toThrow(
        BlockchainError,
      );
    });
  });

  describe("EIP-712 message composition", () => {
    it("should compose correct EIP-712 typed data", async () => {
      const { createPublicClient } = await import("viem");
      const mockPublicClient = createPublicClient({
        chain: mockWalletClient.chain,
        transport: () => ({}),
      } as unknown as Parameters<typeof createPublicClient>[0]);
      vi.mocked(mockPublicClient.readContract).mockResolvedValue(BigInt(0));

      // Access private method for testing
      const compose = (
        controller as unknown as {
          composePermissionGrantMessage: (
            params: Record<string, unknown>,
          ) => Promise<Record<string, unknown>>;
        }
      ).composePermissionGrantMessage.bind(controller);

      const params = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test_operation",
        files: [1, 2, 3],
        grantUrl: "https://example.com/grant",
        serializedParameters: "0xparamshash" as Hash,
        nonce: BigInt(5),
      };

      const typedData = (await compose(params)) as unknown as {
        domain: { name: string; version: string; chainId: number };
        primaryType: string;
        message: { nonce: bigint; grant: string };
      };

      expect(typedData.domain.name).toBe("VanaDataPermissions");
      expect(typedData.domain.version).toBe("1");
      expect(typedData.domain.chainId).toBe(14800);
      expect(typedData.primaryType).toBe("Permission");
      expect(typedData.message.nonce).toBe(params.nonce);
      expect(typedData.message.grant).toBe(params.grantUrl);
      // Files are now only in message.fileIds, not at the top level
    });
  });

  describe("Direct Transaction Path", () => {
    let directController: PermissionsController;

    beforeEach(() => {
      // Create controller without relayer URL for direct transactions
      directController = new PermissionsController({
        walletClient:
          mockWalletClient as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        // No relayerUrl - forces direct transaction path
      });
    });

    it("should throw error when no grantUrl provided and no relayer configured", async () => {
      const mockParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [],
        parameters: { prompt: "Test prompt" },
        // No grantUrl and no relayer
      };

      await expect(directController.grant(mockParams)).rejects.toThrow(
        "No storage available. Provide a grantUrl, configure relayerCallbacks.storeGrantFile, or storageManager.",
      );
    });

    it("should execute direct transaction when grantUrl is provided", async () => {
      const mockParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "Test prompt" },
        grantUrl: "https://example.com/grant.json",
      };

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(5)),
      } as unknown as PublicClient);

      // Mock direct transaction
      mockWalletClient.writeContract = vi
        .fn()
        .mockResolvedValue("0xdirecttxhash");

      const result = await directController.grant(mockParams);

      expect(result).toMatchObject({
        permissionId: 75n,
        user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        grant: "https://mock-grant-url.com",
        fileIds: [],
        transactionHash: "0xdirecttxhash",
        blockNumber: 12345n,
        gasUsed: 100000n,
      });
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0x1234567890123456789012345678901234567890",
          abi: expect.any(Array),
          functionName: "addPermission",
        }),
      );
    });
  });

  describe("Error handling", () => {
    it("should handle nonce retrieval errors", async () => {
      // Mock fetch to allow grant file storage to succeed first
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            url: "https://ipfs.io/ipfs/QmGrantFile123",
          }),
      });

      // Mock the publicClient to fail on readContract (nonce retrieval)
      mockPublicClient.readContract.mockRejectedValueOnce(
        new Error("Contract call failed"),
      );

      const params = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [],
        parameters: { test: "value" },
      };

      await expect(controller.grant(params)).rejects.toThrow(NonceError);
    });

    it("should handle wallet address retrieval errors", async () => {
      // Mock wallet client with no addresses
      mockWalletClient.getAddresses.mockResolvedValue([]);

      const mockParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [],
        parameters: { test: "value" },
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(NonceError);
      expect(mockWalletClient.getAddresses).toHaveBeenCalled();
    });

    it("should handle signature errors with specific messages", async () => {
      const mockParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [],
        parameters: { test: "value" },
      };

      // Mock grant file storage
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            grantUrl: "https://ipfs.io/ipfs/QmTest",
          }),
      });

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      const mockPublicClient = createPublicClient({
        chain: mockWalletClient.chain,
        transport: () => ({}),
      } as unknown as Parameters<typeof createPublicClient>[0]);
      vi.mocked(mockPublicClient.readContract).mockResolvedValue(BigInt(0));

      // Mock signature failure with specific error
      mockWalletClient.signTypedData.mockRejectedValue(
        new Error("Signature verification failed"),
      );

      await expect(controller.grant(mockParams)).rejects.toThrow(
        SignatureError,
      );
    });
  });

  describe("Grant File Handling", () => {
    it("should create and store grant file when no grantUrl provided", async () => {
      const mockParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "Test prompt", maxTokens: 100 },
      };

      // Create controller with relayerCallbacks.storeGrantFile configured
      const mockStoreGrantFile = vi
        .fn()
        .mockResolvedValue("https://ipfs.io/ipfs/QmGrantFile");
      const contextWithStorage = {
        ...mockContext,
        relayerCallbacks: {
          ...mockContext.relayerCallbacks,
          storeGrantFile: mockStoreGrantFile,
        },
      };
      const controllerWithStorage = new PermissionsController(
        contextWithStorage,
      );

      // Mock other dependencies
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      } as unknown as PublicClient);

      const result = await controllerWithStorage.grant(mockParams);

      expect(mockStoreGrantFile).toHaveBeenCalledWith(
        expect.objectContaining({
          grantee: mockParams.grantee,
          operation: mockParams.operation,
          parameters: mockParams.parameters,
        }),
      );
      expect(result).toMatchObject({
        permissionId: 75n,
        user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        grant: "https://mock-grant-url.com",
        fileIds: [],
        transactionHash: "0xtxhash",
        blockNumber: 12345n,
        gasUsed: 100000n,
      });
    });
  });

  describe("getUserPermissionGrantsOnChain", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should get user permissions successfully", async () => {
      const mockFetch = fetch as Mock;

      // Mock subgraph response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              user: {
                id: mockWalletClient.account.address.toLowerCase(),
                permissions: [
                  {
                    id: "1",
                    grant: "https://ipfs.io/ipfs/Qm1",
                    nonce: "1",
                    signature: "0xsig1",
                    addedAtBlock: "123456",
                    addedAtTimestamp: "1640995200",
                    transactionHash: "0x123...",
                    user: {
                      id: mockWalletClient.account.address.toLowerCase(),
                    },
                  },
                  {
                    id: "2",
                    grant: "https://ipfs.io/ipfs/Qm2",
                    nonce: "2",
                    signature: "0xsig2",
                    addedAtBlock: "123457",
                    addedAtTimestamp: "1640995300",
                    transactionHash: "0x456...",
                    user: {
                      id: mockWalletClient.account.address.toLowerCase(),
                    },
                  },
                ],
              },
            },
          }),
      });

      const result = await controller.getUserPermissionGrantsOnChain({
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 2n,
          grantUrl: "https://ipfs.io/ipfs/Qm2",
          nonce: 2n,
          addedAtBlock: 123457n,
        }),
      );
      expect(result[1]).toEqual(
        expect.objectContaining({
          id: 1n,
          grantUrl: "https://ipfs.io/ipfs/Qm1",
          nonce: 1n,
          addedAtBlock: 123456n,
        }),
      );
    });

    it("should return empty array when user has no permissions", async () => {
      const mockFetch = fetch as Mock;

      // Mock subgraph response with no permissions
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              user: {
                id: mockWalletClient.account.address.toLowerCase(),
                permissions: [],
              },
            },
          }),
      });

      const result = await controller.getUserPermissionGrantsOnChain({
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      expect(result).toEqual([]);
    });

    it("should handle permissions with limit parameter", async () => {
      const mockFetch = fetch as Mock;

      // Mock subgraph response with 5 permissions but we'll limit to 2
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              user: {
                id: mockWalletClient.account.address.toLowerCase(),
                permissions: [
                  {
                    id: "1",
                    grant: "https://ipfs.io/ipfs/Qm1",
                    nonce: "1",
                    signature: "0xsig1",
                    addedAtBlock: "123456",
                    addedAtTimestamp: "1640995200",
                    transactionHash: "0x123...",
                    user: {
                      id: mockWalletClient.account.address.toLowerCase(),
                    },
                  },
                  {
                    id: "2",
                    grant: "https://ipfs.io/ipfs/Qm2",
                    nonce: "2",
                    signature: "0xsig2",
                    addedAtBlock: "123457",
                    addedAtTimestamp: "1640995300",
                    transactionHash: "0x456...",
                    user: {
                      id: mockWalletClient.account.address.toLowerCase(),
                    },
                  },
                  // We include more than 2 to test the limit
                  {
                    id: "3",
                    grant: "https://ipfs.io/ipfs/Qm3",
                    nonce: "3",
                    signature: "0xsig3",
                    addedAtBlock: "123458",
                    addedAtTimestamp: "1640995400",
                    transactionHash: "0x789...",
                    user: {
                      id: mockWalletClient.account.address.toLowerCase(),
                    },
                  },
                ],
              },
            },
          }),
      });

      const result = await controller.getUserPermissionGrantsOnChain({
        limit: 2,
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      expect(result).toHaveLength(2);
    });

    it("should handle missing subgraph URL error", async () => {
      const controllerWithoutSubgraph = new PermissionsController({
        walletClient:
          mockWalletClient as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        relayerCallbacks: {
          submitPermissionGrant: vi.fn().mockResolvedValue("0xtxhash"),
          submitPermissionRevoke: vi.fn().mockResolvedValue("0xtxhash"),
        },
        // No subgraphUrl provided
      });

      await expect(
        controllerWithoutSubgraph.getUserPermissionGrantsOnChain(),
      ).rejects.toThrow("subgraphUrl is required");
    });

    it("should handle subgraph errors gracefully", async () => {
      const mockFetch = fetch as Mock;

      // Mock subgraph error response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            errors: [
              {
                message: "Subgraph indexing error",
              },
            ],
          }),
      });

      await expect(
        controller.getUserPermissionGrantsOnChain({
          subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
        }),
      ).rejects.toThrow(BlockchainError);
    });

    it("should handle permission reading errors at specific indices", async () => {
      const mockFetch = fetch as Mock;

      // Mock subgraph response with one permission that will have retrieveGrantFile error
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              user: {
                id: mockWalletClient.account.address.toLowerCase(),
                permissions: [
                  {
                    id: "1",
                    grant: "https://ipfs.io/ipfs/QmInvalidGrant", // This will fail in retrieveGrantFile
                    nonce: "1",
                    signature: "0xsig1",
                    addedAtBlock: "123456",
                    addedAtTimestamp: "1640995200",
                    transactionHash: "0x123...",
                    user: {
                      id: mockWalletClient.account.address.toLowerCase(),
                    },
                  },
                ],
              },
            },
          }),
      });

      const result = await controller.getUserPermissionGrantsOnChain({
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      // Should still return the one permission even with grant file retrieval error
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 1n,
          grantUrl: "https://ipfs.io/ipfs/QmInvalidGrant",
          nonce: 1n,
          addedAtBlock: 123456n,
        }),
      );
    });
  });

  describe("Additional Error Handling", () => {
    it("should handle relayer callback errors", async () => {
      // Create controller with failing relayerCallbacks
      const failingController = new PermissionsController({
        walletClient:
          mockWalletClient as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        relayerCallbacks: {
          submitPermissionGrant: vi
            .fn()
            .mockRejectedValue(new NetworkError("Network timeout")),
          storeGrantFile: vi
            .fn()
            .mockResolvedValue("https://ipfs.io/ipfs/QmGrantFile"),
        },
      });

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      } as unknown as PublicClient);

      const mockParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [],
        parameters: { test: "value" },
      };

      await expect(failingController.grant(mockParams)).rejects.toThrow(
        NetworkError,
      );
    });

    it("should handle relayer callback generic errors", async () => {
      // Create controller with failing relayerCallbacks
      const failingController = new PermissionsController({
        walletClient:
          mockWalletClient as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        relayerCallbacks: {
          submitPermissionGrant: vi
            .fn()
            .mockRejectedValue(new Error("Generic relayer error")),
          storeGrantFile: vi
            .fn()
            .mockResolvedValue("https://ipfs.io/ipfs/QmGrantFile"),
        },
      });

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      } as unknown as PublicClient);

      const mockParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [],
        parameters: { test: "value" },
      };

      await expect(failingController.grant(mockParams)).rejects.toThrow(
        "Permission submission failed",
      );
    });

    it("should handle direct transaction blockchain errors", async () => {
      const directController = new PermissionsController({
        walletClient:
          mockWalletClient as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        // No relayerUrl - forces direct transaction path
      });

      const mockParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: { test: "value" },
        grantUrl: "https://example.com/grant.json",
      };

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(5)),
      } as unknown as PublicClient);

      // Mock direct transaction failure
      mockWalletClient.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("Transaction failed"));

      await expect(directController.grant(mockParams)).rejects.toThrow(
        BlockchainError,
      );
    });

    it("should handle missing chain ID in direct transaction", async () => {
      const noChainWallet = {
        ...mockWalletClient,
        chain: null,
        getChainId: vi
          .fn()
          .mockRejectedValue(new Error("Chain ID not available")),
      };

      const directController = new PermissionsController({
        walletClient:
          noChainWallet as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        // No relayerUrl - forces direct transaction path
      });

      const mockParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: { test: "value" },
        grantUrl: "https://example.com/grant.json",
      };

      await expect(directController.grant(mockParams)).rejects.toThrow(
        NonceError,
      );
    });

    it("should handle missing wallet account in direct transaction", async () => {
      const noAccountWallet = {
        ...mockWalletClient,
        account: undefined,
      };

      const directController = new PermissionsController({
        walletClient:
          noAccountWallet as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        // No relayerUrl - forces direct transaction path
      });

      const mockParams = {
        grantee: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: { test: "value" },
        grantUrl: "https://example.com/grant.json",
      };

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(5)),
      } as unknown as PublicClient);

      // Mock getUserAddress to return an address
      noAccountWallet.getAddresses = vi
        .fn()
        .mockResolvedValue(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]);

      // Mock direct transaction failure due to missing account
      noAccountWallet.writeContract = vi.fn().mockResolvedValue("0xtxhash");

      const result = await directController.grant(mockParams);
      expect(result).toMatchObject({
        permissionId: 75n,
        user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        grant: "https://mock-grant-url.com",
        fileIds: [],
        transactionHash: "0xtxhash",
        blockNumber: 12345n,
        gasUsed: 100000n,
      });
    });

    it("should handle revoke with missing chain ID", async () => {
      const noChainWallet = {
        ...mockWalletClient,
        chain: null,
      };

      const noChainController = new PermissionsController({
        walletClient:
          noChainWallet as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        relayerCallbacks: {
          submitPermissionGrant: vi.fn().mockResolvedValue("0xtxhash"),
          submitPermissionRevoke: vi.fn().mockResolvedValue("0xtxhash"),
        },
      });

      const mockRevokeParams = {
        permissionId: 1n,
      };

      await expect(noChainController.revoke(mockRevokeParams)).rejects.toThrow(
        BlockchainError,
      );
    });

    it("should handle submitToRelayer network errors", async () => {
      // Create controller with failing relayerCallbacks to test network error
      const failingController = new PermissionsController({
        walletClient:
          mockWalletClient as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        relayerCallbacks: {
          submitPermissionGrant: vi
            .fn()
            .mockRejectedValue(new NetworkError("Network timeout")),
          storeGrantFile: vi
            .fn()
            .mockResolvedValue("https://ipfs.io/ipfs/QmGrantFile"),
        },
      });

      const mockParams = {
        grantee: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
        operation: "read",
        files: [],
        parameters: { someKey: "someValue" },
      };

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      } as unknown as PublicClient);

      await expect(failingController.grant(mockParams)).rejects.toThrow(
        NetworkError,
      );
    });

    it("should handle getUserPermissions with non-Error exceptions", async () => {
      const controller = new PermissionsController({
        walletClient:
          mockWalletClient as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        relayerCallbacks: {
          submitPermissionGrant: vi.fn().mockResolvedValue("0xtxhash"),
          submitPermissionRevoke: vi.fn().mockResolvedValue("0xtxhash"),
        },
      });

      // Mock getAddresses to throw non-Error object
      mockWalletClient.getAddresses.mockRejectedValue(null);

      await expect(controller.getUserPermissionGrantsOnChain()).rejects.toThrow(
        "Failed to fetch user permission grants: Unknown error",
      );
    });

    it("should handle grant with non-Error exceptions", async () => {
      // Create controller with storage but failing nonce retrieval
      const failingWalletClient = {
        ...mockWalletClient,
        getAddresses: vi.fn().mockRejectedValue("string error"),
      };

      const controller = new PermissionsController({
        walletClient:
          failingWalletClient as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        relayerCallbacks: {
          submitPermissionGrant: vi.fn().mockResolvedValue("0xtxhash"),
          storeGrantFile: vi
            .fn()
            .mockResolvedValue("https://ipfs.io/ipfs/QmGrantFile"),
        },
      });

      const mockParams = {
        grantee: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
        operation: "read",
        files: [],
        parameters: { someKey: "someValue" },
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(
        "Failed to retrieve user nonce: Unknown error",
      );
    });

    it("should handle revoke with non-Error exceptions", async () => {
      // Create a mock wallet client that throws non-Error object early in the process
      const faultyWalletClient = {
        ...mockWalletClient,
        chain: {
          get id() {
            throw "string error"; // Non-Error thrown
          },
        },
      };

      const controller = new PermissionsController({
        walletClient:
          faultyWalletClient as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        relayerCallbacks: {
          submitPermissionGrant: vi.fn().mockResolvedValue("0xtxhash"),
          submitPermissionRevoke: vi.fn().mockResolvedValue("0xtxhash"),
        },
      });

      const mockRevokeParams = {
        permissionId: 1n,
      };

      await expect(controller.revoke(mockRevokeParams)).rejects.toThrow(
        "Permission revoke failed with unknown error",
      );
    });

    it("should handle direct revoke transaction path", async () => {
      const controller = new PermissionsController({
        walletClient:
          mockWalletClient as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        // No relayer callbacks to force direct transaction path
      });

      const mockRevokeParams = {
        permissionId: 1n,
      };

      // Mock writeContract to return the expected hash
      mockWalletClient.writeContract = vi
        .fn()
        .mockResolvedValue(
          "0xmockabcdef1234567890abcdef1234567890abcdef1234567890abcdef123456",
        );

      const result = await controller.revoke(mockRevokeParams);

      // Should return event data from parsed transaction
      expect(result).toMatchObject({
        permissionId: 123n,
        transactionHash:
          "0xmockabcdef1234567890abcdef1234567890abcdef1234567890abcdef123456",
        blockNumber: 12345n,
        gasUsed: 100000n,
      });
    });

    it("should handle relayTransaction with missing relayer URL", async () => {
      const controller = new PermissionsController({
        walletClient:
          mockWalletClient as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        // No relayer callbacks
      });

      const mockParams = {
        grantee: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
        operation: "read",
        files: [1, 2, 3],
        parameters: { someKey: "someValue" },
        // No grantUrl provided to trigger the error we want to test
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(
        "No storage available. Provide a grantUrl, configure relayerCallbacks.storeGrantFile, or storageManager.",
      );
    });

    it("should handle submitToRelayer with missing relayer URL", async () => {
      const mockRevokeParams = {
        permissionId: 1n,
      };

      // Mock chain to be available but still no relayer URL
      const mockWalletClientWithChain = {
        ...mockWalletClient,
        chain: mockWalletClient.chain, // Use existing chain
      };

      const controllerWithChain = new PermissionsController({
        walletClient:
          mockWalletClientWithChain as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        // No relayer callbacks
      });

      // Mock writeContract to return a mock hash
      mockWalletClientWithChain.writeContract = vi
        .fn()
        .mockResolvedValue("0xmockdirecttxhash");

      // This should trigger the submitToRelayer path with missing relayer URL
      // Since we're mocking, we need to test this indirectly through revoke
      const result = await controllerWithChain.revoke(mockRevokeParams);

      // Should return event data from parsed transaction
      expect(result).toMatchObject({
        permissionId: 123n,
        transactionHash: "0xmockdirecttxhash",
        blockNumber: 12345n,
        gasUsed: 100000n,
      });
    });

    it("should handle failed relayer response in submitToRelayer", async () => {
      const failingContext = {
        ...mockContext,
        relayerCallbacks: {
          ...mockContext.relayerCallbacks,
          submitPermissionRevoke: vi
            .fn()
            .mockRejectedValue(new RelayerError("Relayer internal error")),
        },
      };

      const failingController = new PermissionsController(failingContext);

      const mockRevokeParams = {
        permissionId: 1n,
      };

      await expect(
        failingController.revokeWithSignature(mockRevokeParams),
      ).rejects.toThrow(PermissionError);
    });

    it("should handle network errors in submitToRelayer", async () => {
      const failingContext = {
        ...mockContext,
        relayerCallbacks: {
          ...mockContext.relayerCallbacks,
          submitPermissionRevoke: vi
            .fn()
            .mockRejectedValue(new NetworkError("Failed to fetch")),
        },
      };

      const failingController = new PermissionsController(failingContext);

      const mockRevokeParams = {
        permissionId: 1n,
      };

      await expect(
        failingController.revokeWithSignature(mockRevokeParams),
      ).rejects.toThrow(PermissionError);
    });

    // Note: Lines 372-373, 427-428 in permissions.ts are defensive checks in relayTransaction/submitToRelayer
    // These are difficult to test as they would require a context where relayerUrl is undefined
    // after the method decision logic has already chosen to use the relayer path.
    // In practice, these would only be hit if the context object is modified during execution.

    it("should handle submitToRelayer with undefined relayerUrl context", async () => {
      const controller = new PermissionsController({
        walletClient:
          mockWalletClient as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        // No relayer callbacks
      });

      const mockParams = {
        grantee: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
        operation: "read",
        files: [1, 2, 3],
        parameters: { someKey: "someValue" },
      };

      // This should trigger direct transaction path
      await expect(controller.grant(mockParams)).rejects.toThrow(
        "No storage available. Provide a grantUrl, configure relayerCallbacks.storeGrantFile, or storageManager.",
      );
    });

    it("should handle relayTransaction with real relayer URL", async () => {
      const controller = new PermissionsController({
        walletClient:
          mockWalletClient as unknown as ControllerContext["walletClient"],
        publicClient:
          mockPublicClient as unknown as ControllerContext["publicClient"],
        platform: mockPlatformAdapter,
        relayerCallbacks: {
          submitPermissionGrant: vi.fn().mockResolvedValue("0xtxhash"),
          submitPermissionRevoke: vi.fn().mockResolvedValue("0xtxhash"),
          storeGrantFile: vi
            .fn()
            .mockResolvedValue("https://ipfs.io/ipfs/QmGrantFile"),
        },
      });

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      } as unknown as PublicClient);

      const mockParams = {
        grantee: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
        operation: "read",
        files: [1, 2, 3],
        parameters: { someKey: "someValue" },
      };

      const result = await controller.grant(mockParams);
      expect(result).toMatchObject({
        permissionId: 75n,
        user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        grant: "https://mock-grant-url.com",
        fileIds: [],
        transactionHash: "0xtxhash",
        blockNumber: 12345n,
        gasUsed: 100000n,
      });
    });
  });

  describe("revokeWithSignature", () => {
    beforeEach(() => {
      // Mock getUserNonce for typed data creation
      vi.spyOn(
        controller as unknown as {
          getUserNonce: () => Promise<bigint>;
        },
        "getUserNonce",
      ).mockResolvedValue(123n);

      // Mock getPermissionDomain
      vi.spyOn(
        controller as unknown as {
          getPermissionDomain: () => Promise<Record<string, unknown>>;
        },
        "getPermissionDomain",
      ).mockResolvedValue({
        name: "DataPermissions",
        version: "1",
        chainId: 14800,
        verifyingContract: "0x1234567890123456789012345678901234567890",
      });

      // Mock signTypedData
      vi.spyOn(
        controller as unknown as {
          signTypedData: () => Promise<string>;
        },
        "signTypedData",
      ).mockResolvedValue(
        "0xsignature123456789012345678901234567890123456789012345678901234567890",
      );
    });

    it("should successfully revoke permission with signature via relayer", async () => {
      // Remove the spy on relayRevokeTransaction as it doesn't exist
      vi.spyOn(
        controller as unknown as {
          signTypedData: () => Promise<string>;
        },
        "signTypedData",
      ).mockResolvedValue(
        "0xsignature123456789012345678901234567890123456789012345678901234567890",
      );

      const params = {
        permissionId: 42n,
      };

      const result = await controller.revokeWithSignature(params);

      expect(result).toBe("0xtxhash");
    });

    it("should successfully revoke permission with signature via direct transaction", async () => {
      const testContext = {
        ...mockContext,
        relayerCallbacks: undefined, // No relayer
        walletClient: {
          ...mockWalletClient,
          chain: { id: 14800 },
        } as unknown as ControllerContext["walletClient"],
      } as unknown as ControllerContext;

      const controller = new PermissionsController(testContext);

      // Mock submitDirectRevokeTransaction
      vi.spyOn(
        controller as unknown as {
          submitDirectRevokeTransaction: () => Promise<string>;
        },
        "submitDirectRevokeTransaction",
      ).mockResolvedValue(
        "0xhash123456789012345678901234567890123456789012345678901234567890",
      );

      const params = {
        permissionId: 42n,
      };

      const result = await controller.revokeWithSignature(params);

      expect(result).toBe(
        "0xhash123456789012345678901234567890123456789012345678901234567890",
      );
    });

    it("should handle missing chain ID error", async () => {
      const testContext = {
        ...mockContext,
        walletClient: {
          ...mockWalletClient,
          chain: undefined, // No chain
        } as unknown as ControllerContext["walletClient"],
      } as unknown as ControllerContext;

      const controller = new PermissionsController(testContext);

      const params = {
        permissionId: 42n,
      };

      await expect(controller.revokeWithSignature(params)).rejects.toThrow(
        PermissionError,
      );
    });

    it("should handle getUserNonce errors", async () => {
      const testContext = {
        ...mockContext,
        walletClient: {
          ...mockWalletClient,
          chain: { id: 14800 },
        } as unknown as ControllerContext["walletClient"],
      } as unknown as ControllerContext;

      const controller = new PermissionsController(testContext);

      vi.spyOn(
        controller as unknown as {
          getUserNonce: () => Promise<bigint>;
        },
        "getUserNonce",
      ).mockRejectedValue(new Error("Nonce retrieval failed"));

      const params = {
        permissionId: 42n,
      };

      await expect(controller.revokeWithSignature(params)).rejects.toThrow(
        "Failed to revoke permission with signature: Nonce retrieval failed",
      );
    });

    it("should handle signature errors", async () => {
      const testContext = {
        ...mockContext,
        walletClient: {
          ...mockWalletClient,
          chain: { id: 14800 },
        } as unknown as ControllerContext["walletClient"],
      } as unknown as ControllerContext;

      const controller = new PermissionsController(testContext);

      vi.spyOn(
        controller as unknown as {
          signTypedData: () => Promise<string>;
        },
        "signTypedData",
      ).mockRejectedValue(new Error("Signature failed"));

      const params = {
        permissionId: 42n,
      };

      await expect(controller.revokeWithSignature(params)).rejects.toThrow(
        "Failed to revoke permission with signature: Signature failed",
      );
    });
  });

  describe("getUserNonce", () => {
    it("should read nonce from DataPermissions contract, not DataPortabilityServers", async () => {
      const userAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
      const expectedNonce = 5n;

      // Mock getContractAddress to track which contract is being requested
      const { getContractAddress } = await import("../config/addresses");
      const getContractAddressSpy = vi.mocked(getContractAddress);
      const originalImplementation =
        getContractAddressSpy.getMockImplementation();

      // Track contract address calls
      const contractCalls: string[] = [];
      getContractAddressSpy.mockImplementation((chainId, contractName) => {
        contractCalls.push(contractName);
        if (contractName === "DataPermissions") {
          return "0xD54523048AdD05b4d734aFaE7C68324Ebb7373eF";
        } else if (contractName === "DataPortabilityServers") {
          return "0x1483B1F634DBA75AeaE60da7f01A679aabd5ee2c";
        }
        return "0x1234567890123456789012345678901234567890";
      });

      // Mock readContract to return the nonce
      mockPublicClient.readContract.mockResolvedValueOnce(expectedNonce);

      // Call getUserNonce (private method, so we need to use type assertion)
      const getUserNonce = (controller as any).getUserNonce.bind(controller);
      const nonce = await getUserNonce();

      // Verify the correct contract was called
      expect(contractCalls).toContain("DataPermissions");
      expect(contractCalls).not.toContain("DataPortabilityServers");

      // Verify readContract was called with DataPermissions address
      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: "0xD54523048AdD05b4d734aFaE7C68324Ebb7373eF",
        abi: expect.any(Array),
        functionName: "userNonce",
        args: [userAddress],
      });

      expect(nonce).toBe(expectedNonce);

      // Reset the mock to its original implementation
      if (originalImplementation) {
        getContractAddressSpy.mockImplementation(originalImplementation);
      } else {
        getContractAddressSpy.mockRestore();
      }
    });
  });

  describe("New Permission Query Methods", () => {
    beforeEach(() => {
      // Mock the public client for contract reads
      mockPublicClient.readContract = vi.fn();
    });

    describe("getFilePermissionIds", () => {
      it("should successfully get permission IDs for a file", async () => {
        const mockPermissionIds = [1n, 2n, 3n];
        vi.mocked(mockPublicClient.readContract).mockResolvedValue(
          mockPermissionIds,
        );

        const result = await controller.getFilePermissionIds(123n);

        expect(result).toEqual(mockPermissionIds);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: expect.any(Array),
          functionName: "filePermissionIds",
          args: [123n],
        });
      });

      it("should handle contract read errors", async () => {
        vi.mocked(mockPublicClient.readContract).mockRejectedValue(
          new Error("Contract read failed"),
        );

        await expect(controller.getFilePermissionIds(123n)).rejects.toThrow(
          "Failed to get file permission IDs: Contract read failed",
        );
      });
    });

    describe("getPermissionFileIds", () => {
      it("should successfully get file IDs for a permission", async () => {
        const mockFileIds = [10n, 20n, 30n];
        vi.mocked(mockPublicClient.readContract).mockResolvedValue(mockFileIds);

        const result = await controller.getPermissionFileIds(456n);

        expect(result).toEqual(mockFileIds);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: expect.any(Array),
          functionName: "permissionFileIds",
          args: [456n],
        });
      });

      it("should handle contract read errors", async () => {
        vi.mocked(mockPublicClient.readContract).mockRejectedValue(
          new Error("Contract read failed"),
        );

        await expect(controller.getPermissionFileIds(456n)).rejects.toThrow(
          "Failed to get permission file IDs: Contract read failed",
        );
      });
    });

    describe("isActivePermission", () => {
      it("should return true for active permission", async () => {
        vi.mocked(mockPublicClient.readContract).mockResolvedValue(true);

        const result = await controller.isActivePermission(789n);

        expect(result).toBe(true);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: expect.any(Array),
          functionName: "isActivePermission",
          args: [789n],
        });
      });

      it("should return false for inactive permission", async () => {
        vi.mocked(mockPublicClient.readContract).mockResolvedValue(false);

        const result = await controller.isActivePermission(789n);

        expect(result).toBe(false);
      });

      it("should handle contract read errors", async () => {
        vi.mocked(mockPublicClient.readContract).mockRejectedValue(
          new Error("Contract read failed"),
        );

        await expect(controller.isActivePermission(789n)).rejects.toThrow(
          "Failed to check permission status: Contract read failed",
        );
      });
    });

    describe("getPermissionInfo", () => {
      it("should successfully get permission info", async () => {
        const mockPermissionInfo = {
          id: 111n,
          grantor: "0xabcdef1234567890123456789012345678901234" as Address,
          nonce: 55n,
          grant: "ipfs://Qm...",
          signature: "0xsig123" as `0x${string}`,
          isActive: true,
          fileIds: [1n, 2n, 3n],
        };

        vi.mocked(mockPublicClient.readContract).mockResolvedValue(
          mockPermissionInfo,
        );

        const result = await controller.getPermissionInfo(111n);

        expect(result).toEqual(mockPermissionInfo);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: expect.any(Array),
          functionName: "permissions",
          args: [111n],
        });
      });

      it("should handle contract read errors", async () => {
        vi.mocked(mockPublicClient.readContract).mockRejectedValue(
          new Error("Contract read failed"),
        );

        await expect(controller.getPermissionInfo(111n)).rejects.toThrow(
          "Failed to get permission info: Contract read failed",
        );
      });
    });
  });

  describe("Direct Transaction Methods", () => {
    beforeEach(() => {
      // Mock writeContract
      mockWalletClient.writeContract = vi
        .fn()
        .mockResolvedValue(
          "0xhash123456789012345678901234567890123456789012345678901234567890",
        );

      // Mock getUserAddress
      vi.spyOn(
        controller as unknown as {
          getUserAddress: () => Promise<string>;
        },
        "getUserAddress",
      ).mockResolvedValue("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    });

    describe("submitDirectRevokeTransaction", () => {
      it("should successfully submit direct revoke transaction", async () => {
        const typedData = {
          domain: {
            name: "DataPermissions",
            version: "1",
            chainId: 14800,
            verifyingContract:
              "0x1234567890123456789012345678901234567890" as Address,
          },
          types: {
            RevokePermission: [
              { name: "nonce", type: "uint256" },
              { name: "permissionId", type: "uint256" },
            ],
          },
          primaryType: "RevokePermission" as const,
          message: {
            nonce: 123n,
            permissionId: 42n,
          },
        };

        const signature =
          "0xsignature123456789012345678901234567890123456789012345678901234567890";

        const result = await (
          controller as unknown as {
            submitDirectRevokeTransaction: (
              typedData: Record<string, unknown>,
              signature: string,
            ) => Promise<string>;
          }
        ).submitDirectRevokeTransaction(typedData, signature);

        expect(result).toBe(
          "0xhash123456789012345678901234567890123456789012345678901234567890",
        );

        expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: expect.any(Array),
          functionName: "revokePermissionWithSignature",
          args: [typedData.message, signature],
          account: expect.any(Object),
          chain: mockWalletClient.chain,
        });
      });

      it("should handle blockchain errors", async () => {
        (mockWalletClient.writeContract as Mock).mockRejectedValue(
          new Error("Transaction failed"),
        );

        const typedData = {
          domain: {
            name: "DataPermissions",
            version: "1",
            chainId: 14800,
            verifyingContract:
              "0x1234567890123456789012345678901234567890" as Address,
          },
          types: {
            RevokePermission: [
              { name: "nonce", type: "uint256" },
              { name: "permissionId", type: "uint256" },
            ],
          },
          primaryType: "RevokePermission" as const,
          message: {
            nonce: 123n,
            permissionId: 42n,
          },
        };

        const signature =
          "0xsignature123456789012345678901234567890123456789012345678901234567890";

        await expect(
          (
            controller as unknown as {
              submitDirectRevokeTransaction: (
                typedData: Record<string, unknown>,
                signature: string,
              ) => Promise<string>;
            }
          ).submitDirectRevokeTransaction(typedData, signature),
        ).rejects.toThrow("Transaction failed");
      });
    });
  });
});
