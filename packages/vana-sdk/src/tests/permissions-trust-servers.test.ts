import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Hash, PublicClient } from "viem";
import { PermissionsController } from "../controllers/permissions";
import type { ControllerContext } from "../controllers/permissions";
import {
  BlockchainError,
  NonceError,
  UserRejectedRequestError,
  SignatureError,
} from "../errors";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock ALL external dependencies to ensure pure unit tests
vi.mock("viem", () => ({
  createPublicClient: vi.fn(() => ({
    readContract: vi.fn(),
  })),
  getContract: vi.fn(() => ({
    read: {
      userNonce: vi.fn(),
      trustedServersLength: vi.fn(),
      trustedServersAt: vi.fn(),
      isTrustedServer: vi.fn(),
    },
  })),
  http: vi.fn(),
  getAddress: vi.fn((addr) => addr),
  keccak256: vi.fn(),
  toHex: vi.fn(),
  fromHex: vi.fn((hex) => {
    // Simple mock to convert hex string to bytes
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
    }
    return bytes;
  }),
  encodePacked: vi.fn(),
  encodeFunctionData: vi.fn(() => "0x"),
  size: vi.fn(() => 100),
}));

vi.mock("../config/addresses", () => ({
  getContractAddress: vi
    .fn()
    .mockReturnValue("0x1234567890123456789012345678901234567890"),
  getUtilityAddress: vi
    .fn()
    .mockReturnValue("0xcA11bde05977b3631167028862bE2a173976CA11"),
}));

// Track gasAwareMulticall calls to return appropriate data
let mockServerInfoFailure = false;

vi.mock("../utils/multicall", () => ({
  gasAwareMulticall: vi.fn().mockImplementation(async (_client, params) => {
    // Check if allowFailure is true (for server info calls)
    if (params.allowFailure) {
      // This is a getServerInfoBatch call - return server info with status wrapper
      if (mockServerInfoFailure) {
        // Return failure status for server info
        return params.contracts.map((_: any) => ({
          status: "failure",
          error: new Error("Server info failed"),
        }));
      }

      return params.contracts.map((_contract: any, i: number) => ({
        status: "success",
        result: {
          id: BigInt(i + 1),
          owner: "0x1234567890123456789012345678901234567890" as `0x${string}`,
          serverAddress:
            "0xabcdef1234567890123456789012345678901234" as `0x${string}`,
          publicKey: "0xpublickey",
          url: "https://server1.com",
        },
      }));
    }

    // For getTrustedServersPaginated, it calls gasAwareMulticall to get server IDs
    // Return array of results based on the contracts passed
    return params.contracts.map((_: any, i: number) => BigInt(i + 1));
  }),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([
    {
      name: "userNonce",
      type: "function",
      inputs: [{ name: "user", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
    },
    {
      name: "trustServer",
      type: "function",
      inputs: [
        { name: "serverId", type: "uint256" },
        { name: "serverUrl", type: "string" },
      ],
      outputs: [],
    },
    {
      name: "trustServerWithSignature",
      type: "function",
      inputs: [
        { name: "trustServer", type: "tuple" },
        { name: "signature", type: "bytes" },
      ],
      outputs: [],
    },
    {
      name: "untrustServer",
      type: "function",
      inputs: [{ name: "serverId", type: "uint256" }],
      outputs: [],
    },
    {
      name: "untrustServerWithSignature",
      type: "function",
      inputs: [
        { name: "untrustServer", type: "tuple" },
        { name: "signature", type: "bytes" },
      ],
      outputs: [],
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
  signTypedData: ReturnType<typeof vi.fn>;
  writeContract: ReturnType<typeof vi.fn>;
}

interface MockPublicClient {
  readContract: ReturnType<typeof vi.fn>;
  waitForTransactionReceipt: ReturnType<typeof vi.fn>;
  getTransactionReceipt: ReturnType<typeof vi.fn>;
  getChainId: ReturnType<typeof vi.fn>;
  multicall: ReturnType<typeof vi.fn>;
}

describe("PermissionsController - Trust/Untrust Server Methods", () => {
  let controller: PermissionsController;
  let mockContext: ControllerContext;
  let mockWalletClient: MockWalletClient;
  let mockPublicClient: MockPublicClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServerInfoFailure = false; // Reset server info failure flag

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
      readContract: vi.fn().mockImplementation((args) => {
        // Mock the users function from DataPortabilityServers contract
        if (args.functionName === "users") {
          return [BigInt(0), []]; // [nonce, trustedServerIds]
        }
        // Mock the userNonce function from DataPermissions contract
        if (args.functionName === "userNonce") {
          return BigInt(0);
        }
        // Mock the servers function for getServerInfo
        if (args.functionName === "servers") {
          return {
            id: args.args[0], // Use the serverId that was passed in
            owner:
              "0x1234567890123456789012345678901234567890" as `0x${string}`,
            serverAddress:
              "0xabcdef1234567890123456789012345678901234" as `0x${string}`,
            publicKey: "0xpublickey",
            url: "https://server1.com",
          };
        }
        return BigInt(0);
      }),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
      getTransactionReceipt: vi.fn().mockResolvedValue({
        transactionHash: "0xTransactionHash",
        blockNumber: 12345n,
        gasUsed: 100000n,
        status: "success" as const,
        logs: [],
      }),
      getChainId: vi.fn().mockResolvedValue(14800),
      multicall: vi.fn().mockResolvedValue([]),
    };

    // Set up the context with all required mocks
    mockContext = {
      walletClient:
        mockWalletClient as unknown as ControllerContext["walletClient"],
      publicClient: mockPublicClient as unknown as PublicClient,
      platform: mockPlatformAdapter,
    } as ControllerContext;

    controller = new PermissionsController(mockContext);
  });

  describe("trustServer", () => {
    it("should successfully trust a server", async () => {
      const params = {
        serverId: 1,
        serverUrl: "https://example.com",
      };

      const result = await controller.submitTrustServer(params);

      expect(result.hash).toBe("0xtxhash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: "0x1234567890123456789012345678901234567890",
        abi: expect.any(Array),
        functionName: "trustServer",
        args: [BigInt(1)],
        account: mockWalletClient.account,
        chain: mockWalletClient.chain,
      });
    });

    it("should handle blockchain errors in trustServer", async () => {
      mockWalletClient.writeContract.mockRejectedValue(
        new Error("Transaction failed"),
      );

      const params = {
        serverId: 1,
        serverUrl: "https://example.com",
      };

      await expect(controller.submitTrustServer(params)).rejects.toThrow(
        BlockchainError,
      );
    });
  });

  describe("submitTrustServerWithSignature", () => {
    it("should successfully trust server with signature via relayer", async () => {
      mockContext.relayer = vi.fn().mockResolvedValue({
        type: "signed",
        hash: "0xrelayerhash" as Hash,
      });

      const params = {
        serverId: 1,
        serverUrl: "https://example.com",
      };

      const result = await controller.submitTrustServerWithSignature(params);

      expect(result.hash).toBe("0xrelayerhash");
      expect(mockContext.relayer).toHaveBeenCalledWith({
        type: "signed",
        operation: "submitTrustServer",
        typedData: expect.any(Object),
        signature: "0xsignature",
        expectedUserAddress: undefined,
      });
    });

    it("should successfully trust server with signature via direct transaction", async () => {
      // No relayer callbacks, should use direct transaction
      const params = {
        serverId: 1,
        serverUrl: "https://example.com",
      };

      const result = await controller.submitTrustServerWithSignature(params);

      expect(result.hash).toBe("0xtxhash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: "0x1234567890123456789012345678901234567890",
        abi: expect.any(Array),
        functionName: "trustServerWithSignature",
        args: expect.arrayContaining([expect.any(Object), "0xsignature"]),
        account: mockWalletClient.account,
        chain: mockWalletClient.chain,
      });
    });

    it("should handle getUserNonce errors in submitTrustServerWithSignature", async () => {
      mockPublicClient.readContract.mockRejectedValue(
        new Error("Nonce read failed"),
      );

      const params = {
        serverId: 1,
        serverUrl: "https://example.com",
      };

      await expect(
        controller.submitTrustServerWithSignature(params),
      ).rejects.toThrow(NonceError);
    });

    it("should handle signature errors in submitTrustServerWithSignature", async () => {
      mockWalletClient.signTypedData.mockRejectedValue(
        new Error("User rejected"),
      );

      const params = {
        serverId: 1,
        serverUrl: "https://example.com",
      };

      await expect(
        controller.submitTrustServerWithSignature(params),
      ).rejects.toThrow(UserRejectedRequestError);
    });

    it("should handle relayer errors in submitTrustServerWithSignature", async () => {
      mockContext.relayer = vi.fn().mockResolvedValue({
        type: "error",
        error: "Relayer failed",
      });

      const params = {
        serverId: 1,
        serverUrl: "https://example.com",
      };

      await expect(
        controller.submitTrustServerWithSignature(params),
      ).rejects.toThrow("Relayer failed");
    });

    it("should handle non-Error exceptions in submitTrustServerWithSignature", async () => {
      mockWalletClient.signTypedData.mockRejectedValue("String error");

      const params = {
        serverId: 1,
        serverUrl: "https://example.com",
      };

      await expect(
        controller.submitTrustServerWithSignature(params),
      ).rejects.toThrow(SignatureError);
    });
  });

  describe("untrustServer", () => {
    it("should successfully untrust a server", async () => {
      const params = {
        serverId: 1,
      };

      const result = await controller.submitUntrustServer(params);

      expect(result.hash).toBe("0xtxhash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: "0x1234567890123456789012345678901234567890",
        abi: expect.any(Array),
        functionName: "untrustServer",
        args: [BigInt(1)],
        account: mockWalletClient.account,
        chain: mockWalletClient.chain,
      });
    });

    it("should handle blockchain errors in untrustServer", async () => {
      mockWalletClient.writeContract.mockRejectedValue(
        new Error("Transaction failed"),
      );

      const params = {
        serverId: 1,
      };

      await expect(controller.submitUntrustServer(params)).rejects.toThrow(
        BlockchainError,
      );
    });
  });

  describe("submitUntrustServerWithSignature", () => {
    it("should successfully untrust server with signature via relayer", async () => {
      mockContext.relayer = vi.fn().mockResolvedValue({
        type: "signed",
        hash: "0xrelayerhash" as Hash,
      });

      const params = {
        serverId: 1,
      };

      const result = await controller.submitUntrustServerWithSignature(params);

      expect(result.hash).toBe("0xrelayerhash");
      expect(mockContext.relayer).toHaveBeenCalledWith({
        type: "signed",
        operation: "submitUntrustServer",
        typedData: expect.any(Object),
        signature: "0xsignature",
        expectedUserAddress: undefined,
      });
    });

    it("should successfully untrust server with signature via direct transaction", async () => {
      // No relayer callbacks, should use direct transaction
      const params = {
        serverId: 1,
      };

      const result = await controller.submitUntrustServerWithSignature(params);

      expect(result.hash).toBe("0xtxhash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: "0x1234567890123456789012345678901234567890",
        abi: expect.any(Array),
        functionName: "untrustServerWithSignature",
        args: expect.arrayContaining([expect.any(Object), "0xsignature"]),
        account: mockWalletClient.account,
        chain: mockWalletClient.chain,
      });
    });

    it("should handle getUserNonce errors in submitUntrustServerWithSignature", async () => {
      mockPublicClient.readContract.mockRejectedValue(
        new Error("Nonce read failed"),
      );

      const params = {
        serverId: 1,
      };

      await expect(
        controller.submitUntrustServerWithSignature(params),
      ).rejects.toThrow(NonceError);
    });

    it("should handle signature errors in submitUntrustServerWithSignature", async () => {
      mockWalletClient.signTypedData.mockRejectedValue(
        new Error("User rejected"),
      );

      const params = {
        serverId: 1,
      };

      await expect(
        controller.submitUntrustServerWithSignature(params),
      ).rejects.toThrow(UserRejectedRequestError);
    });

    it("should handle relayer errors in submitUntrustServerWithSignature", async () => {
      mockContext.relayer = vi.fn().mockResolvedValue({
        type: "error",
        error: "Relayer failed",
      });

      const params = {
        serverId: 1,
      };

      await expect(
        controller.submitUntrustServerWithSignature(params),
      ).rejects.toThrow("Relayer failed");
    });

    it("should handle non-Error exceptions in submitUntrustServerWithSignature", async () => {
      mockWalletClient.signTypedData.mockRejectedValue("String error");

      const params = {
        serverId: 1,
      };

      await expect(
        controller.submitUntrustServerWithSignature(params),
      ).rejects.toThrow(SignatureError);
    });
  });

  describe("getTrustedServers", () => {
    it("should successfully get trusted servers", async () => {
      mockPublicClient.readContract.mockResolvedValue([BigInt(1), BigInt(2)]);

      const result = await controller.getTrustedServers();

      expect(result).toEqual([1, 2]);
    });

    it("should return empty array when no trusted servers", async () => {
      mockPublicClient.readContract.mockResolvedValue([]);

      const result = await controller.getTrustedServers();

      expect(result).toEqual([]);
    });

    it("should handle contract read errors in getTrustedServers", async () => {
      mockPublicClient.readContract.mockRejectedValue(
        new Error("Contract read failed"),
      );

      await expect(controller.getTrustedServers()).rejects.toThrow(
        BlockchainError,
      );
    });
  });

  describe("getTrustedServersCount", () => {
    it("should successfully get trusted servers count", async () => {
      mockPublicClient.readContract.mockResolvedValue(BigInt(5));

      const result = await controller.getTrustedServersCount();

      expect(result).toBe(5);
    });

    it("should handle contract read errors in getTrustedServersCount", async () => {
      mockPublicClient.readContract.mockRejectedValue(
        new Error("Contract read failed"),
      );

      await expect(controller.getTrustedServersCount()).rejects.toThrow(
        BlockchainError,
      );
    });
  });

  describe("getTrustedServersPaginated", () => {
    it("should successfully get paginated trusted servers", async () => {
      mockPublicClient.readContract
        .mockResolvedValueOnce(BigInt(3)) // userServerIdsLength
        .mockResolvedValueOnce(BigInt(1)) // userServerIdsAt(0)
        .mockResolvedValueOnce(BigInt(2)); // userServerIdsAt(1)

      const result = await controller.getTrustedServersPaginated({
        limit: 2,
        offset: 0,
      });

      expect(result).toEqual({
        servers: [1, 2],
        total: 3,
        offset: 0,
        limit: 2,
        hasMore: true,
      });
    });

    it("should handle pagination edge cases", async () => {
      mockPublicClient.readContract
        .mockResolvedValueOnce(BigInt(1)) // userServerIdsLength
        .mockResolvedValueOnce(BigInt(1)); // userServerIdsAt(0)

      const result = await controller.getTrustedServersPaginated({
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual({
        servers: [1],
        total: 1,
        offset: 0,
        limit: 10,
        hasMore: false,
      });
    });

    it("should handle contract read errors in getTrustedServersPaginated", async () => {
      mockPublicClient.readContract.mockRejectedValue(
        new Error("Contract read failed"),
      );

      await expect(controller.getTrustedServersPaginated()).rejects.toThrow(
        BlockchainError,
      );
    });
  });

  describe("getTrustedServersWithInfo", () => {
    it("should successfully get trusted servers with info", async () => {
      // Reset the mock to use the function name-based implementation only
      mockPublicClient.readContract.mockImplementation((args) => {
        // Mock the users function from DataPortabilityServers contract
        if (args.functionName === "users") {
          return [BigInt(0), []]; // [nonce, trustedServerIds]
        }
        // Mock for getTrustedServersPaginated
        if (args.functionName === "userServerIdsLength") {
          return BigInt(1);
        }
        if (args.functionName === "userServerIdsAt") {
          return BigInt(1);
        }
        // Mock the servers function for getServerInfo
        if (args.functionName === "servers") {
          return {
            id: args.args[0], // Use the serverId that was passed in
            owner:
              "0x1234567890123456789012345678901234567890" as `0x${string}`,
            serverAddress:
              "0xabcdef1234567890123456789012345678901234" as `0x${string}`,
            publicKey: "0xpublickey",
            url: "https://server1.com",
          };
        }
        // Mock the userNonce function from DataPermissions contract
        if (args.functionName === "userNonce") {
          return BigInt(0);
        }
        return BigInt(0);
      });

      const result = await controller.getTrustedServersWithInfo();

      expect(result).toEqual([
        {
          id: 1n,
          owner: "0x1234567890123456789012345678901234567890" as `0x${string}`,
          serverAddress:
            "0xabcdef1234567890123456789012345678901234" as `0x${string}`,
          publicKey: "0xpublickey",
          url: "https://server1.com",
          startBlock: 0n,
          endBlock: 0n,
        },
      ]);
    });

    it("should handle fetch errors when getting server info", async () => {
      // Set up to simulate server info failure
      mockServerInfoFailure = true;

      // Mock with server info failure
      mockPublicClient.readContract.mockImplementation((args) => {
        // Mock the users function from DataPortabilityServers contract
        if (args.functionName === "users") {
          return [BigInt(0), []]; // [nonce, trustedServerIds]
        }
        // Mock for getTrustedServersPaginated
        if (args.functionName === "userServerIdsLength") {
          return BigInt(1);
        }
        if (args.functionName === "userServerIdsAt") {
          return BigInt(1);
        }
        // Simulate failure for servers function
        if (args.functionName === "servers") {
          throw new Error("Server info failed");
        }
        // Mock the userNonce function from DataPermissions contract
        if (args.functionName === "userNonce") {
          return BigInt(0);
        }
        return BigInt(0);
      });

      const result = await controller.getTrustedServersWithInfo();

      expect(result).toEqual([
        {
          id: 1n,
          owner: "0x0000000000000000000000000000000000000000" as `0x${string}`,
          serverAddress:
            "0x0000000000000000000000000000000000000000" as `0x${string}`,
          publicKey: "",
          url: "",
          startBlock: 0n,
          endBlock: 0n,
        },
      ]);
    });

    it("should handle contract read errors in getTrustedServersWithInfo", async () => {
      mockPublicClient.readContract.mockRejectedValue(
        new Error("Contract read failed"),
      );

      await expect(controller.getTrustedServersWithInfo()).rejects.toThrow(
        BlockchainError,
      );
    });
  });

  describe("submitSignedTrustServer", () => {
    it("should successfully submit signed trust server via direct transaction", async () => {
      const typedData = {
        domain: {
          name: "Test",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as `0x${string}`,
        },
        types: { TrustServer: [] },
        primaryType: "TrustServer" as const,
        message: {
          nonce: BigInt(1),
          serverId: 1,
          serverUrl: "https://example.com",
        },
      };

      const result = await controller.submitSignedTrustServer(
        typedData,
        "0xsignature" as Hash,
      );

      expect(result.hash).toBe("0xtxhash");
    });

    it("should successfully submit signed trust server via direct transaction", async () => {
      const typedData = {
        domain: {
          name: "Test",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as `0x${string}`,
        },
        types: { TrustServer: [] },
        primaryType: "TrustServer" as const,
        message: {
          nonce: BigInt(1),
          serverId: 1,
          serverUrl: "https://example.com",
        },
      };

      const result = await controller.submitSignedTrustServer(
        typedData,
        "0xsignature" as Hash,
      );

      expect(result.hash).toBe("0xtxhash");
    });

    it("should handle submission errors in submitSignedTrustServer", async () => {
      mockWalletClient.writeContract.mockRejectedValue(
        new Error("Submission failed"),
      );

      const typedData = {
        domain: {
          name: "Test",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as `0x${string}`,
        },
        types: { TrustServer: [] },
        primaryType: "TrustServer" as const,
        message: {
          nonce: BigInt(1),
          serverId: 1,
          serverUrl: "https://example.com",
        },
      };

      await expect(
        controller.submitSignedTrustServer(typedData, "0xsignature" as Hash),
      ).rejects.toThrow(BlockchainError);
    });
  });

  describe("submitSignedUntrustServer", () => {
    it("should successfully submit signed untrust server via relayer", async () => {
      mockContext.relayer = vi.fn().mockResolvedValue({
        type: "signed",
        hash: "0xrelayerhash" as Hash,
      });

      const typedData = {
        domain: {
          name: "Test",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as `0x${string}`,
        },
        types: { UntrustServer: [] },
        primaryType: "UntrustServer" as const,
        message: {
          nonce: BigInt(1),
          serverId: 1,
        },
      };

      const result = await controller.submitSignedUntrustServer(
        typedData,
        "0xsignature" as Hash,
      );

      expect(result.hash).toBe("0xrelayerhash");
    });

    it("should successfully submit signed untrust server via direct transaction", async () => {
      const typedData = {
        domain: {
          name: "Test",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as `0x${string}`,
        },
        types: { UntrustServer: [] },
        primaryType: "UntrustServer" as const,
        message: {
          nonce: BigInt(1),
          serverId: 1,
        },
      };

      const result = await controller.submitSignedUntrustServer(
        typedData,
        "0xsignature" as Hash,
      );

      expect(result.hash).toBe("0xtxhash");
    });

    it("should handle submission errors in submitSignedUntrustServer", async () => {
      mockWalletClient.writeContract.mockRejectedValue(
        new Error("Submission failed"),
      );

      const typedData = {
        domain: {
          name: "Test",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as `0x${string}`,
        },
        types: { UntrustServer: [] },
        primaryType: "UntrustServer" as const,
        message: {
          nonce: BigInt(1),
          serverId: 1,
        },
      };

      await expect(
        controller.submitSignedUntrustServer(typedData, "0xsignature" as Hash),
      ).rejects.toThrow(BlockchainError);
    });
  });

  // Note: isTrustedServer method not implemented in PermissionsController

  describe("TransactionOptions support for server operations", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Mock different contract functions based on functionName
      mockPublicClient.readContract.mockImplementation((args) => {
        if (args.functionName === "users") {
          return [1n, []]; // [nonce, trustedServerIds] for getServersUserNonce
        }
        return 1n; // Default fallback
      });
    });

    describe("submitUntrustServer with TransactionOptions", () => {
      it("should pass EIP-1559 gas parameters to writeContract", async () => {
        const params = { serverId: 1 };
        const options = {
          maxFeePerGas: 80n * 10n ** 9n, // 80 gwei
          maxPriorityFeePerGas: 3n * 10n ** 9n, // 3 gwei
          gas: 400000n,
        };

        await controller.submitUntrustServer(params, options);

        expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
          expect.objectContaining({
            address: "0x1234567890123456789012345678901234567890",
            abi: expect.any(Array),
            functionName: "untrustServer",
            args: [BigInt(1)],
            gas: 400000n,
            maxFeePerGas: 80n * 10n ** 9n,
            maxPriorityFeePerGas: 3n * 10n ** 9n,
          }),
        );
      });

      it("should pass legacy gas parameters to writeContract", async () => {
        const params = { serverId: 1 };
        const options = {
          gasPrice: 60n * 10n ** 9n, // 60 gwei
          gas: 200000n,
          nonce: 5,
        };

        await controller.submitUntrustServer(params, options);

        expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
          expect.objectContaining({
            functionName: "untrustServer",
            gas: 200000n,
            gasPrice: 60n * 10n ** 9n,
            nonce: 5,
          }),
        );
      });

      it("should work without options", async () => {
        const params = { serverId: 1 };

        await controller.submitUntrustServer(params);

        const writeContractCall =
          mockWalletClient.writeContract.mock.calls[0][0];
        expect(writeContractCall).not.toHaveProperty("gas");
        expect(writeContractCall).not.toHaveProperty("gasPrice");
        expect(writeContractCall).not.toHaveProperty("maxFeePerGas");
      });
    });
  });
});
