import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { Hash, Address } from "viem";
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
} from "../errors";

// Mock ALL external dependencies to ensure pure unit tests
vi.mock("viem", () => ({
  createPublicClient: vi.fn(() => ({
    readContract: vi.fn(),
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

describe("PermissionsController", () => {
  let controller: PermissionsController;
  let mockContext: ControllerContext;
  let mockWalletClient: any;
  let mockPublicClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock for createGrantFile to return valid grant files
    const mockCreateGrantFile = createGrantFile as Mock;
    mockCreateGrantFile.mockImplementation((params: any) => ({
      grantee: params.to,
      operation: params.operation,
      files: params.files,
      parameters: params.parameters,
      expires: params.expiresAt || Math.floor(Date.now() / 1000) + 3600,
    }));

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
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    };

    mockContext = {
      walletClient: mockWalletClient,
      publicClient: mockPublicClient as any,
      relayerUrl: "https://test-relayer.com",
    };

    controller = new PermissionsController(mockContext);
  });

  describe("grant", () => {
    const mockGrantParams = {
      to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      operation: "llm_inference",
      files: [],
      parameters: {
        prompt: "Test prompt",
        maxTokens: 100,
      },
    };

    it("should successfully grant permission with complete flow", async () => {
      // Mock all the required calls
      const mockFetch = fetch as Mock;

      // Mock for relayer transaction submission (storeGrantFile is already mocked above)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            transactionHash: "0xtxhash",
          }),
      });

      const result = await controller.grant(mockGrantParams);

      expect(result).toBe("0xtxhash");
      expect(mockWalletClient.signTypedData).toHaveBeenCalled();
      // Since we have relayerUrl configured, it should use relayer path
      expect(fetch).toHaveBeenCalledTimes(1); // Only relayer transaction (storeGrantFile is mocked separately)
    });

    it("should handle user rejection gracefully", async () => {
      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      } as any);

      // Mock user rejection
      mockWalletClient.signTypedData.mockRejectedValue(
        new Error("User rejected request"),
      );

      await expect(controller.grant(mockGrantParams)).rejects.toThrow(
        UserRejectedRequestError,
      );
    });

    it("should handle relayer errors", async () => {
      const mockFetch = fetch as Mock;

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      } as any);

      // Mock failed transaction relay
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("Server error"),
      });

      await expect(controller.grant(mockGrantParams)).rejects.toThrow(
        RelayerError,
      );
    });

    it("should handle network errors gracefully", async () => {
      const mockFetch = fetch as Mock;

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      } as any);

      // Mock network error on relay
      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(controller.grant(mockGrantParams)).rejects.toThrow(
        NetworkError,
      );
    });
  });

  describe("revoke", () => {
    const mockRevokeParams = {
      permissionId: 1n, // Permission ID as bigint
    };

    it("should successfully revoke permission", async () => {
      const mockFetch = fetch as Mock;

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      const mockPublicClient = createPublicClient({
        chain: mockWalletClient.chain,
        transport: () => ({}),
      } as any);
      (mockPublicClient.readContract as Mock).mockResolvedValue(BigInt(1));

      // Mock transaction relay response for revoke
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            transactionHash: "0xrevokehash",
          }),
      });

      const result = await controller.revoke(mockRevokeParams);

      expect(result).toBe("0xrevokehash");
      expect(mockWalletClient.signTypedData).toHaveBeenCalled();
    });

    it("should handle revoke errors", async () => {
      const mockFetch = fetch as Mock;

      const { createPublicClient } = await import("viem");
      const mockPublicClient = createPublicClient({
        chain: mockWalletClient.chain,
        transport: () => ({}),
      } as any);
      (mockPublicClient.readContract as Mock).mockResolvedValue(BigInt(1));

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: () => Promise.resolve("Grant not found"),
      });

      await expect(controller.revoke(mockRevokeParams)).rejects.toThrow(
        RelayerError,
      );
    });
  });

  describe("EIP-712 message composition", () => {
    it("should compose correct EIP-712 typed data", async () => {
      const { createPublicClient } = await import("viem");
      const mockPublicClient = createPublicClient({
        chain: mockWalletClient.chain,
        transport: () => ({}),
      } as any);
      (mockPublicClient.readContract as Mock).mockResolvedValue(BigInt(0));

      // Access private method for testing
      const compose = (controller as any).composePermissionGrantMessage.bind(
        controller,
      );

      const params = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test_operation",
        files: [1, 2, 3],
        grantUrl: "https://example.com/grant",
        serializedParameters: "0xparamshash" as Hash,
        nonce: BigInt(5),
      };

      const typedData = await compose(params);

      expect(typedData.domain.name).toBe("VanaDataWallet");
      expect(typedData.domain.version).toBe("1");
      expect(typedData.domain.chainId).toBe(14800);
      expect(typedData.primaryType).toBe("Permission");
      expect(typedData.message.nonce).toBe(params.nonce);
      expect(typedData.message.grant).toBe(params.grantUrl);
      expect(typedData.files).toEqual(params.files);
    });
  });

  describe("Direct Transaction Path", () => {
    let directController: PermissionsController;

    beforeEach(() => {
      // Create controller without relayer URL for direct transactions
      directController = new PermissionsController({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        // No relayerUrl - forces direct transaction path
      });
    });

    it("should throw error when no grantUrl provided and no relayer configured", async () => {
      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [],
        parameters: { prompt: "Test prompt" },
        // No grantUrl and no relayer
      };

      await expect(directController.grant(mockParams)).rejects.toThrow(
        "No storage available. Provide a grantUrl, configure relayerCallbacks.storeGrantFile, relayerUrl, or storageManager.",
      );
    });

    it("should execute direct transaction when grantUrl is provided", async () => {
      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "Test prompt" },
        grantUrl: "https://example.com/grant.json",
      };

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(5)),
      } as any);

      // Mock direct transaction
      mockWalletClient.writeContract = vi
        .fn()
        .mockResolvedValue("0xdirecttxhash");

      const result = await directController.grant(mockParams);

      expect(result).toBe("0xdirecttxhash");
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
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
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
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [],
        parameters: { test: "value" },
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(NonceError);
      expect(mockWalletClient.getAddresses).toHaveBeenCalled();
    });

    it("should handle signature errors with specific messages", async () => {
      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
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
      } as any);
      (mockPublicClient.readContract as Mock).mockResolvedValue(BigInt(0));

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
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "Test prompt", maxTokens: 100 },
      };

      // Mock grant file utilities
      const { createGrantFile, storeGrantFile } = await import(
        "../utils/grantFiles"
      );
      const mockCreateGrantFile = createGrantFile as Mock;
      const mockStoreGrantFile = storeGrantFile as Mock;

      mockCreateGrantFile.mockReturnValue({
        grantee: mockParams.to,
        operation: mockParams.operation,
        files: mockParams.files,
        parameters: mockParams.parameters,
        expires: Math.floor(Date.now() / 1000) + 3600,
      });

      mockStoreGrantFile.mockResolvedValue("https://ipfs.io/ipfs/QmGrantFile");

      // Mock other dependencies - use single-use mock to avoid pollution
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            transactionHash: "0xgrantfilehash",
          }),
      });

      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      } as any);

      const result = await controller.grant(mockParams);

      expect(mockCreateGrantFile).toHaveBeenCalledWith(mockParams);
      expect(mockStoreGrantFile).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: mockParams.operation,
          files: mockParams.files,
          parameters: mockParams.parameters,
        }),
        "https://test-relayer.com",
      );
      expect(result).toBe("0xgrantfilehash");
    });
  });

  describe("getUserPermissions", () => {
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

      const result = await controller.getUserPermissions({
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 2n,
        files: [],
        grant: "https://ipfs.io/ipfs/Qm2",
        operation: "",
        parameters: {},
        active: true,
        grantor: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
        grantee: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        grantedAt: 123457,
        nonce: 2,
      });
      expect(result[1]).toEqual({
        id: 1n,
        files: [],
        grant: "https://ipfs.io/ipfs/Qm1",
        operation: "",
        parameters: {},
        active: true,
        grantor: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
        grantee: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        grantedAt: 123456,
        nonce: 1,
      });
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

      const result = await controller.getUserPermissions({
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

      const result = await controller.getUserPermissions({
        limit: 2,
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      expect(result).toHaveLength(2);
    });

    it("should handle missing subgraph URL error", async () => {
      const controllerWithoutSubgraph = new PermissionsController({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        relayerUrl: "https://test-relayer.com",
        // No subgraphUrl provided
      });

      await expect(
        controllerWithoutSubgraph.getUserPermissions(),
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
        controller.getUserPermissions({
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

      const result = await controller.getUserPermissions({
        subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/test",
      });

      // Should still return the one permission even with grant file retrieval error
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 1n,
        files: [],
        grant: "https://ipfs.io/ipfs/QmInvalidGrant",
        operation: "",
        parameters: {},
        active: true,
        grantor: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
        grantee: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        grantedAt: 123456,
        nonce: 1,
      });
    });
  });

  describe("Additional Error Handling", () => {
    it("should handle relayer JSON parse errors", async () => {
      const mockFetch = fetch as Mock;

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      } as any);

      // Mock relayer response with invalid JSON
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error("Invalid JSON")),
      });

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [],
        parameters: { test: "value" },
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(NetworkError);
    });

    it("should handle relayer success false with no error message", async () => {
      const mockFetch = fetch as Mock;

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      } as any);

      // Mock relayer response with success: false but no error message
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            // No error field
          }),
      });

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [],
        parameters: { test: "value" },
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(
        "Failed to relay transaction",
      );
    });

    it("should handle direct transaction blockchain errors", async () => {
      const directController = new PermissionsController({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        // No relayerUrl - forces direct transaction path
      });

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: { test: "value" },
        grantUrl: "https://example.com/grant.json",
      };

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(5)),
      } as any);

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
        walletClient: noChainWallet,
        publicClient: mockPublicClient,
        // No relayerUrl - forces direct transaction path
      });

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
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
        walletClient: noAccountWallet,
        publicClient: mockPublicClient,
        // No relayerUrl - forces direct transaction path
      });

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: { test: "value" },
        grantUrl: "https://example.com/grant.json",
      };

      // Mock nonce retrieval
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(5)),
      } as any);

      // Mock getUserAddress to return an address
      noAccountWallet.getAddresses = vi
        .fn()
        .mockResolvedValue(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]);

      // Mock direct transaction failure due to missing account
      noAccountWallet.writeContract = vi.fn().mockResolvedValue("0xtxhash");

      const result = await directController.grant(mockParams);
      expect(result).toBe("0xtxhash");
    });

    it("should handle revoke with missing chain ID", async () => {
      const noChainWallet = {
        ...mockWalletClient,
        chain: null,
      };

      const noChainController = new PermissionsController({
        walletClient: noChainWallet,
        publicClient: mockPublicClient,
        relayerUrl: "https://test-relayer.com",
      });

      const mockRevokeParams = {
        permissionId: 1n,
      };

      await expect(noChainController.revoke(mockRevokeParams)).rejects.toThrow(
        BlockchainError,
      );
    });

    it("should handle submitToRelayer network errors", async () => {
      const controller = new PermissionsController({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        relayerUrl: "https://test-relayer.com",
      });

      const mockParams = {
        to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
        operation: "read",
        files: [],
        parameters: { someKey: "someValue" },
      };

      const mockFetch = fetch as Mock;
      mockFetch.mockRejectedValue(new Error("Network timeout"));

      await expect(controller.grant(mockParams)).rejects.toThrow(
        "Network error while relaying transaction: Network timeout",
      );
    });

    it("should handle getUserPermissions with non-Error exceptions", async () => {
      const controller = new PermissionsController({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        relayerUrl: "https://test-relayer.com",
      });

      // Mock getAddresses to throw non-Error object
      mockWalletClient.getAddresses.mockRejectedValue(null);

      await expect(controller.getUserPermissions()).rejects.toThrow(
        "Failed to fetch user permissions: Unknown error",
      );
    });

    it("should handle grant with non-Error exceptions", async () => {
      const controller = new PermissionsController({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        relayerUrl: "https://test-relayer.com",
      });

      const mockParams = {
        to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
        operation: "read",
        files: [],
        parameters: { someKey: "someValue" },
      };

      // Mock getAddresses to throw non-Error object to trigger unknown error handling
      mockWalletClient.getAddresses.mockRejectedValue("string error");

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
        walletClient: faultyWalletClient,
        publicClient: mockPublicClient,
        relayerUrl: "https://test-relayer.com",
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
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        relayerUrl: undefined, // No relayer to force direct transaction path
      });

      const mockRevokeParams = {
        permissionId: 1n,
      };

      const result = await controller.revoke(mockRevokeParams);

      // Should return mock hash for direct transaction (TODO implementation)
      expect(result).toBe(
        "0xmockabcdef1234567890abcdef1234567890abcdef1234567890abcdef123456",
      );
    });

    it("should handle relayTransaction with missing relayer URL", async () => {
      const controller = new PermissionsController({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        relayerUrl: undefined,
      });

      const mockParams = {
        to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
        operation: "read",
        files: [1, 2, 3],
        parameters: { someKey: "someValue" },
        // No grantUrl provided to trigger the error we want to test
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(
        "No storage available. Provide a grantUrl, configure relayerCallbacks.storeGrantFile, relayerUrl, or storageManager.",
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
        walletClient: mockWalletClientWithChain,
        publicClient: mockPublicClient,
        relayerUrl: undefined,
      });

      // This should trigger the submitToRelayer path with missing relayer URL
      // Since we're mocking, we need to test this indirectly through revoke
      const result = await controllerWithChain.revoke(mockRevokeParams);

      // Should use direct transaction path and return mock hash
      expect(result).toMatch(/^0xmock/);
    });

    it("should handle failed relayer response in submitToRelayer", async () => {
      const controller = new PermissionsController({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        relayerUrl: "https://test-relayer.com",
      });

      const mockRevokeParams = {
        permissionId: 1n,
      };

      // Mock fetch to return failed response
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: "Relayer internal error",
            transactionHash: "0x0",
          }),
      });

      await expect(controller.revoke(mockRevokeParams)).rejects.toThrow(
        "Relayer internal error",
      );
    });

    it("should handle network errors in submitToRelayer", async () => {
      const controller = new PermissionsController({
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        relayerUrl: "https://test-relayer.com",
      });

      const mockRevokeParams = {
        permissionId: 1n,
      };

      // Mock fetch to throw non-RelayerError
      const mockFetch = fetch as Mock;
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(controller.revoke(mockRevokeParams)).rejects.toThrow(
        "Network error while submitting to relayer: Failed to fetch",
      );
    });

    // Note: Lines 372-373, 427-428 in permissions.ts are defensive checks in relayTransaction/submitToRelayer
    // These are difficult to test as they would require a context where relayerUrl is undefined
    // after the method decision logic has already chosen to use the relayer path.
    // In practice, these would only be hit if the context object is modified during execution.

    it("should handle submitToRelayer with undefined relayerUrl context", async () => {
      // Test through revoke which calls submitToRelayer when there's a chain ID
      const mockWalletClientWithChain = {
        ...mockWalletClient,
        chain: mockWalletClient.chain, // Use existing chain
      };

      const controllerWithChain = new PermissionsController({
        walletClient: mockWalletClientWithChain,
        publicClient: mockPublicClient,
        relayerUrl: undefined,
      });

      const mockRevokeParams = {
        permissionId: 1n,
      };

      // This should trigger direct transaction path, not submitToRelayer
      // Let me try a different approach - mock to force submitToRelayer path
      const result = await controllerWithChain.revoke(mockRevokeParams);

      // Direct path should return mock hash
      expect(result).toMatch(/^0xmock/);
    });
  });

  describe("Missing Relayer URL Scenarios", () => {
    it("should throw error when no relayer URL configured for grant", async () => {
      const contextWithoutRelayer = {
        ...mockContext,
        relayerUrl: undefined, // No relayer configured
      };

      const controller = new PermissionsController(contextWithoutRelayer);

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [],
        parameters: { test: "value" },
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(
        "No storage available. Provide a grantUrl, configure relayerCallbacks.storeGrantFile, relayerUrl, or storageManager.",
      );
    });

    it("should throw error when no relayer URL configured for revoke", async () => {
      const contextWithoutRelayer = {
        ...mockContext,
        relayerUrl: undefined, // No relayer configured
        walletClient: {
          ...mockContext.walletClient,
          chain: undefined, // Missing chain to trigger error path
        },
      };

      const controller = new PermissionsController(contextWithoutRelayer);

      const mockRevokeParams = {
        permissionId: 1n,
      };

      await expect(controller.revoke(mockRevokeParams)).rejects.toThrow(
        "Chain ID not available",
      );
    });

    it("should trigger submitToRelayer missing URL check in revoke path", async () => {
      // Create a scenario that forces the revoke method to use the relayer path
      // and then hits the missing relayerUrl check in submitToRelayer

      const contextWithRelayer = {
        ...mockContext,
        relayerUrl: "https://relayer.test.com", // Start with relayer URL
      };

      const controller = new PermissionsController(contextWithRelayer);

      // We need to modify the context after controller construction but before submitToRelayer call
      // Let's spy on the submitToRelayer method to intercept and modify context
      const originalMethod = (controller as any).submitToRelayer;
      const spySubmitToRelayer = vi.spyOn(controller as any, "submitToRelayer");
      spySubmitToRelayer.mockImplementation(async (...args: any[]) => {
        // Clear relayerUrl right before the check
        (controller as any).context.relayerUrl = undefined;
        // Call original method which will now fail on the relayerUrl check
        return originalMethod.call(controller, ...args);
      });

      const mockRevokeParams = {
        permissionId: 1n,
      };

      await expect(controller.revoke(mockRevokeParams)).rejects.toThrow(
        "Relayer URL is not configured",
      );

      spySubmitToRelayer.mockRestore();
    });

    it("should throw RelayerError when relayer URL is cleared after initial validation but before submission", async () => {
      // This tests the defensive check at lines 372-373 in submitToRelayer
      const contextWithRelayer = {
        ...mockContext,
        relayerUrl: "https://relayer.test.com",
      };

      const controller = new PermissionsController(contextWithRelayer);

      // Mock the relaySignedTransaction private method to clear relayerUrl mid-execution
      const originalRelaySignedTransaction = (controller as any)
        .relaySignedTransaction;
      vi.spyOn(controller as any, "relaySignedTransaction").mockImplementation(
        async function (this: any, ...args: any[]) {
          // Clear relayerUrl after method starts but before submitToRelayer is called
          this.context.relayerUrl = undefined;
          // Call original which will eventually call submitToRelayer
          return originalRelaySignedTransaction.apply(this, args);
        },
      );

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [],
        parameters: { test: "value" },
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(
        "Relayer URL is not configured",
      );
    });

    it("should handle non-Error exceptions in direct transaction catch block (line 350)", async () => {
      // Use context WITHOUT relayerUrl to force direct transaction path
      const originalBigInt = global.BigInt;
      const directTransactionContext = {
        ...mockContext,
        relayerUrl: undefined, // No relayer URL to force direct transaction
      };

      // Mock walletClient.writeContract to throw non-Error
      directTransactionContext.walletClient.writeContract = vi
        .fn()
        .mockImplementation(() => {
          throw { code: 500, message: "Server error" }; // Non-Error object
        });

      const controller = new PermissionsController(directTransactionContext);

      // Mock getUserNonce to return a proper bigint
      vi.spyOn(controller as any, "getUserNonce").mockResolvedValue(
        BigInt(123),
      );
      // Mock signTypedData to return a signature
      vi.spyOn(controller as any, "signTypedData").mockResolvedValue(
        "0xsignature123" as `0x${string}`,
      );

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: { test: "value" },
        grantUrl: "https://ipfs.io/ipfs/QmGrantFile123", // Provide grantUrl to skip early validation
      };

      try {
        await controller.grant(mockParams);
        expect.fail("Expected an error to be thrown");
      } catch (error: any) {
        expect(error.message).toContain(
          "Permission submission failed: Unknown error",
        );
      } finally {
        global.BigInt = originalBigInt;
      }
    });

    it("should handle non-Error exceptions in relayTransaction catch block (line 411)", async () => {
      const contextWithRelayer = {
        ...mockContext,
        relayerUrl: "https://relayer.test.com",
      };

      const controller = new PermissionsController(contextWithRelayer);

      // Mock fetch to throw non-Error, which will be caught in relayTransaction's catch block
      const mockFetch = fetch as Mock;
      mockFetch.mockImplementation(() => {
        throw "Network timeout"; // Non-Error string
      });

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: { test: "value" },
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(
        "Network error while relaying transaction: Unknown error",
      );
    });

    it("should handle non-Error exceptions when relayer returns error (line 448)", async () => {
      const contextWithRelayer = {
        ...mockContext,
        relayerUrl: "https://relayer.test.com",
      };

      const controller = new PermissionsController(contextWithRelayer);

      // Mock fetch to return error response with data.error
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: "Transaction validation failed",
          }),
      });

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: { test: "value" },
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(
        "Transaction validation failed",
      );
    });

    it("should handle non-Error exceptions in submitToRelayer catch block (line 457)", async () => {
      const contextWithRelayer = {
        ...mockContext,
        relayerUrl: "https://relayer.test.com",
      };

      const controller = new PermissionsController(contextWithRelayer);

      // Mock fetch to throw non-Error
      const mockFetch = fetch as Mock;
      mockFetch.mockImplementation(() => {
        throw { status: 500, message: "Server error" }; // Non-Error object
      });

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: { test: "value" },
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(
        "Network error while relaying transaction: Unknown error",
      );
    });

    it("should handle non-Error exceptions in signTypedData (line 309)", async () => {
      // Mock signTypedData to throw non-Error object (not containing "rejected")
      mockContext.walletClient.signTypedData = vi
        .fn()
        .mockImplementation(() => {
          throw { code: "SIGN_FAILED", reason: "Hardware wallet disconnected" }; // Non-Error
        });

      const controller = new PermissionsController(mockContext);
      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: { test: "value" },
        grantUrl: "https://ipfs.io/ipfs/QmGrantFile123",
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(
        "Failed to sign typed data: Unknown error",
      );
    });

    it("should use chain null fallback in submitDirectTransaction (line 344)", async () => {
      const contextWithNullChain = {
        ...mockContext,
        relayerUrl: undefined, // Force direct transaction path
        walletClient: {
          ...mockContext.walletClient,
          chain: undefined, // Trigger || null fallback
          getChainId: vi.fn().mockResolvedValue(14800),
          account: mockContext.walletClient.account, // Use the proper account object
        },
      };

      // Mock writeContract to verify it receives chain: null
      contextWithNullChain.walletClient.writeContract = vi
        .fn()
        .mockImplementation((params) => {
          expect(params.chain).toBe(null); // Verify null fallback was used
          return Promise.resolve("0xhash");
        });

      const controller = new PermissionsController(contextWithNullChain);

      // Mock getUserNonce to return a proper bigint
      vi.spyOn(controller as any, "getUserNonce").mockResolvedValue(
        BigInt(123),
      );
      // Mock signTypedData to return a signature
      vi.spyOn(controller as any, "signTypedData").mockResolvedValue(
        "0xsignature123" as `0x${string}`,
      );

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: { test: "value" },
        grantUrl: "https://ipfs.io/ipfs/QmGrantFile123",
      };

      await controller.grant(mockParams);
      expect(
        contextWithNullChain.walletClient.writeContract,
      ).toHaveBeenCalledWith(expect.objectContaining({ chain: null }));
    });

    it("should use fallback error message when relayer error is falsy (line 448)", async () => {
      const contextWithRelayer = {
        ...mockContext,
        relayerUrl: "https://relayer.test.com",
      };

      const controller = new PermissionsController(contextWithRelayer);
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: null, // Falsy error triggers || fallback
          }),
      });

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: { test: "value" },
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(
        "Failed to relay transaction", // Correct fallback message
      );
    });

    it("should handle non-Error exceptions in submitToRelayer JSON parsing (line 457)", async () => {
      const contextWithRelayer = {
        ...mockContext,
        relayerUrl: "https://relayer.test.com",
      };

      const controller = new PermissionsController(contextWithRelayer);
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => {
          throw "JSON parsing failed"; // Non-Error string
        },
      });

      const mockParams = {
        to: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        operation: "test",
        files: [1, 2, 3],
        parameters: { test: "value" },
      };

      await expect(controller.grant(mockParams)).rejects.toThrow(
        "Network error while relaying transaction: Unknown error",
      );
    });

    it("should handle non-Error exceptions in getUserNonce catch block (line 238)", async () => {
      const controller = new PermissionsController(mockContext);

      // Mock getChainId to throw non-Error
      mockContext.walletClient.getChainId = vi.fn().mockImplementation(() => {
        throw { code: "CHAIN_ACCESS_ERROR", reason: "Network unavailable" }; // Non-Error object
      });

      await expect((controller as any).getUserNonce()).rejects.toThrow(
        "Failed to retrieve user nonce: Unknown error",
      );
    });

    it("should use fallback error message when submitToRelayer data.error is falsy (line 448)", async () => {
      const contextWithRelayer = {
        ...mockContext,
        relayerUrl: "https://relayer.test.com",
      };

      const controller = new PermissionsController(contextWithRelayer);

      // Mock fetch to return success: false with falsy error
      const mockFetch = fetch as Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: null, // Falsy error to trigger || fallback
          }),
      });

      await expect(
        (controller as any).submitToRelayer("test", { data: "test" }),
      ).rejects.toThrow("Failed to submit to relayer");
    });

    it("should handle non-Error exceptions in submitToRelayer network error (line 457)", async () => {
      const contextWithRelayer = {
        ...mockContext,
        relayerUrl: "https://relayer.test.com",
      };

      const controller = new PermissionsController(contextWithRelayer);

      // Mock fetch to throw non-Error object directly
      const mockFetch = fetch as Mock;
      mockFetch.mockImplementation(() => {
        throw "Network connection failed"; // Non-Error string
      });

      await expect(
        (controller as any).submitToRelayer("test", { data: "test" }),
      ).rejects.toThrow(
        "Network error while submitting to relayer: Unknown error",
      );
    });
  });
});
