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

describe("PermissionsController", () => {
  let controller: PermissionsController;
  let mockContext: ControllerContext;
  let mockWalletClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

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

    mockContext = {
      walletClient: mockWalletClient,
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

      // Mock nonce retrieval using the global mock
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      } as any);

      // Mock transaction relay response
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
      expect(fetch).toHaveBeenCalledTimes(1); // Only transaction relay (storeGrantFile is mocked)
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
      grantId: "0xgrantid123" as Hash,
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
        "No relayerUrl configured and no grantUrl provided",
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
      // Mock the viem createPublicClient to return a client that fails on readContract
      const { createPublicClient } = await import("viem");
      vi.mocked(createPublicClient).mockReturnValueOnce({
        readContract: vi
          .fn()
          .mockRejectedValue(new Error("Contract call failed")),
      } as any);

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

      await expect(controller.grant(mockParams)).rejects.toThrow(
        BlockchainError,
      );
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
        operation: mockParams.operation,
        files: mockParams.files,
        parameters: mockParams.parameters,
        metadata: {
          timestamp: "2023-01-01T00:00:00.000Z",
          version: "1.0",
          userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        },
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

      expect(mockCreateGrantFile).toHaveBeenCalledWith(
        mockParams,
        "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      );
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
      const { getContract } = await import("viem");

      // Mock permission registry contract
      const mockPermissionRegistry = {
        read: {
          userPermissionIdsLength: vi.fn().mockResolvedValue(BigInt(2)),
          userPermissionIdsAt: vi
            .fn()
            .mockResolvedValueOnce(BigInt(1))
            .mockResolvedValueOnce(BigInt(2)),
          permissions: vi
            .fn()
            .mockResolvedValueOnce({
              user: mockWalletClient.account.address,
              nonce: BigInt(1),
              grant: "https://ipfs.io/ipfs/Qm1",
              signature: "0xsig1",
            })
            .mockResolvedValueOnce({
              user: mockWalletClient.account.address,
              nonce: BigInt(2),
              grant: "https://ipfs.io/ipfs/Qm2",
              signature: "0xsig2",
            }),
        },
      };

      vi.mocked(getContract).mockReturnValue(mockPermissionRegistry as any);

      const result = await controller.getUserPermissions();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 2,
        files: [],
        grant: "https://ipfs.io/ipfs/Qm2",
      });
      expect(result[1]).toEqual({
        id: 1,
        files: [],
        grant: "https://ipfs.io/ipfs/Qm1",
      });
    });

    it("should return empty array when user has no permissions", async () => {
      const { getContract } = await import("viem");

      const mockPermissionRegistry = {
        read: {
          userPermissionIdsLength: vi.fn().mockResolvedValue(BigInt(0)),
          userPermissionIds: vi.fn(),
          permissions: vi.fn(),
        },
      };

      vi.mocked(getContract).mockReturnValue(mockPermissionRegistry as any);

      const result = await controller.getUserPermissions();

      expect(result).toEqual([]);
      expect(
        mockPermissionRegistry.read.userPermissionIdsLength,
      ).toHaveBeenCalledWith([mockWalletClient.account.address]);
    });

    it("should handle permissions with limit parameter", async () => {
      const { getContract } = await import("viem");

      const mockPermissionRegistry = {
        read: {
          userPermissionIdsLength: vi.fn().mockResolvedValue(BigInt(5)),
          userPermissionIdsAt: vi
            .fn()
            .mockResolvedValueOnce(BigInt(1))
            .mockResolvedValueOnce(BigInt(2)),
          permissions: vi.fn().mockResolvedValue({
            user: mockWalletClient.account.address,
            nonce: BigInt(1),
            grant: "https://ipfs.io/ipfs/Qm1",
            signature: "0xsig1",
          }),
        },
      };

      vi.mocked(getContract).mockReturnValue(mockPermissionRegistry as any);

      const result = await controller.getUserPermissions({ limit: 2 });

      expect(result).toHaveLength(2);
      expect(
        mockPermissionRegistry.read.userPermissionIdsAt,
      ).toHaveBeenCalledTimes(2);
    });

    it("should handle chain ID not available error", async () => {
      const noChainWallet = {
        ...mockWalletClient,
        chain: null,
      };

      const noChainController = new PermissionsController({
        walletClient: noChainWallet,
        relayerUrl: "https://test-relayer.com",
      });

      await expect(noChainController.getUserPermissions()).rejects.toThrow(
        BlockchainError,
      );
    });

    it("should handle contract read errors gracefully", async () => {
      const { getContract } = await import("viem");

      const mockPermissionRegistry = {
        read: {
          userPermissionIdsLength: vi
            .fn()
            .mockRejectedValue(new Error("Contract read failed")),
          userPermissionIds: vi.fn(),
          permissions: vi.fn(),
        },
      };

      vi.mocked(getContract).mockReturnValue(mockPermissionRegistry as any);

      await expect(controller.getUserPermissions()).rejects.toThrow(
        BlockchainError,
      );
    });

    it("should handle permission reading errors at specific indices", async () => {
      const { getContract } = await import("viem");

      const mockPermissionRegistry = {
        read: {
          userPermissionIdsLength: vi.fn().mockResolvedValue(BigInt(2)),
          userPermissionIdsAt: vi
            .fn()
            .mockResolvedValueOnce(BigInt(1))
            .mockRejectedValueOnce(new Error("Permission read failed")),
          permissions: vi.fn().mockResolvedValueOnce({
            user: mockWalletClient.account.address,
            nonce: BigInt(1),
            grant: "https://ipfs.io/ipfs/Qm1",
            signature: "0xsig1",
          }),
        },
      };

      vi.mocked(getContract).mockReturnValue(mockPermissionRegistry as any);

      const result = await controller.getUserPermissions();

      // Should still return the one successful permission
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 1,
        files: [],
        grant: "https://ipfs.io/ipfs/Qm1",
      });
    });
  });

  describe("IPFS Grant Fetching", () => {
    it("should fetch grant data from IPFS URL", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            operation: "test_operation",
            files: [1, 2, 3],
            parameters: { test: "value" },
          }),
      });

      // Access private method for testing
      const fetchGrant = (controller as any).fetchGrantFromIPFS.bind(
        controller,
      );
      const result = await fetchGrant("ipfs://QmTestHash");

      expect(result).toEqual({
        operation: "test_operation",
        files: [1, 2, 3],
        parameters: { test: "value" },
      });
      expect(mockFetch).toHaveBeenCalledWith("https://ipfs.io/ipfs/QmTestHash");
    });

    it("should handle IPFS URL conversion correctly", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "test" }),
      });

      const fetchGrant = (controller as any).fetchGrantFromIPFS.bind(
        controller,
      );
      const result = await fetchGrant("ipfs://QmTestHash123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://ipfs.io/ipfs/QmTestHash123",
      );
      expect(result).toEqual({ data: "test" });
    });

    it("should handle HTTP URLs without conversion", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "http_test" }),
      });

      const fetchGrant = (controller as any).fetchGrantFromIPFS.bind(
        controller,
      );
      const result = await fetchGrant("https://example.com/grant.json");

      expect(mockFetch).toHaveBeenCalledWith("https://example.com/grant.json");
      expect(result).toEqual({ data: "http_test" });
    });

    it("should handle fetch errors gracefully", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const fetchGrant = (controller as any).fetchGrantFromIPFS.bind(
        controller,
      );
      const result = await fetchGrant("ipfs://QmFailedHash");

      expect(result).toBeNull();
    });

    it("should handle HTTP error responses gracefully", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const fetchGrant = (controller as any).fetchGrantFromIPFS.bind(
        controller,
      );
      const result = await fetchGrant("ipfs://QmNotFound");

      expect(result).toBeNull();
    });

    it("should handle invalid JSON gracefully", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error("Invalid JSON")),
      });

      const fetchGrant = (controller as any).fetchGrantFromIPFS.bind(
        controller,
      );
      const result = await fetchGrant("ipfs://QmInvalidJSON");

      expect(result).toBeNull();
    });

    it("should handle null JSON response gracefully", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(null),
      });

      const fetchGrant = (controller as any).fetchGrantFromIPFS.bind(
        controller,
      );
      const result = await fetchGrant("ipfs://QmNullResponse");

      expect(result).toBeNull();
    });

    it("should handle non-object JSON response gracefully", async () => {
      const mockFetch = fetch as Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve("string response"),
      });

      const fetchGrant = (controller as any).fetchGrantFromIPFS.bind(
        controller,
      );
      const result = await fetchGrant("ipfs://QmStringResponse");

      expect(result).toBeNull();
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
      };

      const directController = new PermissionsController({
        walletClient: noChainWallet,
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
        BlockchainError,
      );
    });

    it("should handle missing wallet account in direct transaction", async () => {
      const noAccountWallet = {
        ...mockWalletClient,
        account: undefined,
      };

      const directController = new PermissionsController({
        walletClient: noAccountWallet,
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
        relayerUrl: "https://test-relayer.com",
      });

      const mockRevokeParams = {
        grantId: "0xgrantid123" as Hash,
      };

      await expect(noChainController.revoke(mockRevokeParams)).rejects.toThrow(
        BlockchainError,
      );
    });

    it("should handle submitToRelayer network errors", async () => {
      const controller = new PermissionsController({
        walletClient: mockWalletClient,
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
        relayerUrl: "https://test-relayer.com",
      });

      // Mock getAddresses to throw non-Error object
      mockWalletClient.getAddresses.mockRejectedValue(null);

      await expect(controller.getUserPermissions()).rejects.toThrow(
        "Failed to fetch user permissions: Unknown error",
      );
    });
  });
});
