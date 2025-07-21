import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import type { Hash, PublicClient, Address } from "viem";
import {
  PermissionsController,
  ControllerContext,
} from "../controllers/permissions";
import {
  RelayerError,
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
  encodePacked: vi.fn(),
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
}

describe("PermissionsController - Trust/Untrust Server Methods", () => {
  let controller: PermissionsController;
  let mockContext: ControllerContext;
  let mockWalletClient: MockWalletClient;
  let mockPublicClient: MockPublicClient;

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

    // Create a mock publicClient
    mockPublicClient = {
      readContract: vi.fn().mockResolvedValue(BigInt(0)),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
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
        serverId: "0x0000000000000000000000000000000000000001" as Address,
        serverUrl: "https://example.com",
      };

      const result = await controller.trustServer(params);

      expect(result).toBe("0xtxhash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: "0x1234567890123456789012345678901234567890",
        abi: expect.any(Array),
        functionName: "trustServer",
        args: [BigInt("0x0000000000000000000000000000000000000001")],
        account: mockWalletClient.account,
        chain: mockWalletClient.chain,
      });
    });

    it("should handle blockchain errors in trustServer", async () => {
      mockWalletClient.writeContract.mockRejectedValue(
        new Error("Transaction failed"),
      );

      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
        serverUrl: "https://example.com",
      };

      await expect(controller.trustServer(params)).rejects.toThrow(
        BlockchainError,
      );
    });
  });

  describe("trustServerWithSignature", () => {
    it("should successfully trust server with signature via relayer", async () => {
      mockContext.relayerCallbacks = {
        submitTrustServer: vi.fn().mockResolvedValue("0xrelayerhash" as Hash),
      };

      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
        serverUrl: "https://example.com",
      };

      const result = await controller.trustServerWithSignature(params);

      expect(result).toBe("0xrelayerhash");
      expect(mockContext.relayerCallbacks.submitTrustServer).toHaveBeenCalled();
    });

    it("should successfully trust server with signature via direct transaction", async () => {
      // No relayer callbacks, should use direct transaction
      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
        serverUrl: "https://example.com",
      };

      const result = await controller.trustServerWithSignature(params);

      expect(result).toBe("0xtxhash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: "0x1234567890123456789012345678901234567890",
        abi: expect.any(Array),
        functionName: "trustServerWithSignature",
        args: expect.arrayContaining([expect.any(Object), "0xsignature"]),
        account: mockWalletClient.account,
        chain: mockWalletClient.chain,
      });
    });

    it("should handle getUserNonce errors in trustServerWithSignature", async () => {
      mockPublicClient.readContract.mockRejectedValue(
        new Error("Nonce read failed"),
      );

      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
        serverUrl: "https://example.com",
      };

      await expect(controller.trustServerWithSignature(params)).rejects.toThrow(
        NonceError,
      );
    });

    it("should handle signature errors in trustServerWithSignature", async () => {
      mockWalletClient.signTypedData.mockRejectedValue(
        new Error("User rejected"),
      );

      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
        serverUrl: "https://example.com",
      };

      await expect(controller.trustServerWithSignature(params)).rejects.toThrow(
        UserRejectedRequestError,
      );
    });

    it("should handle relayer errors in trustServerWithSignature", async () => {
      mockContext.relayerCallbacks = {
        submitTrustServer: vi
          .fn()
          .mockRejectedValue(new RelayerError("Relayer failed")),
      };

      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
        serverUrl: "https://example.com",
      };

      await expect(controller.trustServerWithSignature(params)).rejects.toThrow(
        RelayerError,
      );
    });

    it("should handle non-Error exceptions in trustServerWithSignature", async () => {
      mockWalletClient.signTypedData.mockRejectedValue("String error");

      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
        serverUrl: "https://example.com",
      };

      await expect(controller.trustServerWithSignature(params)).rejects.toThrow(
        SignatureError,
      );
    });
  });

  describe("untrustServer", () => {
    it("should successfully untrust a server", async () => {
      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
      };

      const result = await controller.untrustServer(params);

      expect(result).toBe("0xtxhash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: "0x1234567890123456789012345678901234567890",
        abi: expect.any(Array),
        functionName: "untrustServer",
        args: [BigInt("0x0000000000000000000000000000000000000001")],
        account: mockWalletClient.account,
        chain: mockWalletClient.chain,
      });
    });

    it("should handle blockchain errors in untrustServer", async () => {
      mockWalletClient.writeContract.mockRejectedValue(
        new Error("Transaction failed"),
      );

      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
      };

      await expect(controller.untrustServer(params)).rejects.toThrow(
        BlockchainError,
      );
    });
  });

  describe("untrustServerWithSignature", () => {
    it("should successfully untrust server with signature via relayer", async () => {
      mockContext.relayerCallbacks = {
        submitUntrustServer: vi.fn().mockResolvedValue("0xrelayerhash" as Hash),
      };

      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
      };

      const result = await controller.untrustServerWithSignature(params);

      expect(result).toBe("0xrelayerhash");
      expect(
        mockContext.relayerCallbacks.submitUntrustServer,
      ).toHaveBeenCalled();
    });

    it("should successfully untrust server with signature via direct transaction", async () => {
      // No relayer callbacks, should use direct transaction
      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
      };

      const result = await controller.untrustServerWithSignature(params);

      expect(result).toBe("0xtxhash");
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: "0x1234567890123456789012345678901234567890",
        abi: expect.any(Array),
        functionName: "untrustServerWithSignature",
        args: expect.arrayContaining([expect.any(Object), "0xsignature"]),
        account: mockWalletClient.account,
        chain: mockWalletClient.chain,
      });
    });

    it("should handle getUserNonce errors in untrustServerWithSignature", async () => {
      mockPublicClient.readContract.mockRejectedValue(
        new Error("Nonce read failed"),
      );

      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
      };

      await expect(
        controller.untrustServerWithSignature(params),
      ).rejects.toThrow(NonceError);
    });

    it("should handle signature errors in untrustServerWithSignature", async () => {
      mockWalletClient.signTypedData.mockRejectedValue(
        new Error("User rejected"),
      );

      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
      };

      await expect(
        controller.untrustServerWithSignature(params),
      ).rejects.toThrow(UserRejectedRequestError);
    });

    it("should handle relayer errors in untrustServerWithSignature", async () => {
      mockContext.relayerCallbacks = {
        submitUntrustServer: vi
          .fn()
          .mockRejectedValue(new RelayerError("Relayer failed")),
      };

      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
      };

      await expect(
        controller.untrustServerWithSignature(params),
      ).rejects.toThrow(RelayerError);
    });

    it("should handle non-Error exceptions in untrustServerWithSignature", async () => {
      mockWalletClient.signTypedData.mockRejectedValue("String error");

      const params = {
        serverId: "0x0000000000000000000000000000000000000001" as Address,
      };

      await expect(
        controller.untrustServerWithSignature(params),
      ).rejects.toThrow(SignatureError);
    });
  });

  describe("getTrustedServers", () => {
    it("should successfully get trusted servers", async () => {
      // Mock the user function to return proper structure with trustedServerIds
      mockPublicClient.readContract.mockImplementation(
        async ({ functionName, args }) => {
          if (functionName === "user") {
            return {
              nonce: BigInt(1),
              trustedServerIds: [BigInt(1), BigInt(2)],
            };
          }
          if (functionName === "server") {
            const serverId = args?.[0];
            if (serverId === BigInt(1)) {
              return {
                id: BigInt(1),
                serverAddress: "0x0000000000000000000000000000000000000001",
                url: "https://server1.example.com",
                active: true,
              };
            }
            if (serverId === BigInt(2)) {
              return {
                id: BigInt(2),
                serverAddress: "0x0000000000000000000000000000000000000002",
                url: "https://server2.example.com",
                active: true,
              };
            }
          }
          return BigInt(0);
        },
      );

      const result = await controller.getTrustedServers();

      expect(result).toEqual([
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
      ]);
    });

    it("should return empty array when no trusted servers", async () => {
      // Mock the user function to return empty trustedServerIds array
      mockPublicClient.readContract.mockImplementation(
        async ({ functionName }) => {
          if (functionName === "user") {
            return {
              nonce: BigInt(0),
              trustedServerIds: [],
            };
          }
          return BigInt(0);
        },
      );

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
      // Mock the user function to return trustedServerIds array with length 5
      mockPublicClient.readContract.mockImplementation(
        async ({ functionName }) => {
          if (functionName === "user") {
            return {
              nonce: BigInt(1),
              trustedServerIds: [
                BigInt(1),
                BigInt(2),
                BigInt(3),
                BigInt(4),
                BigInt(5),
              ],
            };
          }
          return BigInt(0);
        },
      );

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
        .mockResolvedValueOnce("0xserver1") // userServerIdsAt(0)
        .mockResolvedValueOnce("0xserver2"); // userServerIdsAt(1)

      const result = await controller.getTrustedServersPaginated({
        limit: 2,
        offset: 0,
      });

      expect(result).toEqual({
        servers: ["0xserver1", "0xserver2"],
        total: 3,
        offset: 0,
        limit: 2,
        hasMore: true,
      });
    });

    it("should handle pagination edge cases", async () => {
      mockPublicClient.readContract
        .mockResolvedValueOnce(BigInt(1)) // userServerIdsLength
        .mockResolvedValueOnce("0xserver1"); // userServerIdsAt(0)

      const result = await controller.getTrustedServersPaginated({
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual({
        servers: ["0xserver1"],
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
      // Mock getTrustedServersPaginated return
      mockPublicClient.readContract
        .mockResolvedValueOnce(BigInt(1)) // userServerIdsLength
        .mockResolvedValueOnce("0xserver1") // userServerIdsAt(0)
        .mockResolvedValueOnce({ url: "https://server1.com" }); // getServerInfo

      const result = await controller.getTrustedServersWithInfo();

      expect(result).toEqual([
        {
          serverId: "0xserver1",
          url: "https://server1.com",
          isTrusted: true,
          trustIndex: 0,
        },
      ]);
    });

    it("should handle fetch errors when getting server info", async () => {
      mockPublicClient.readContract
        .mockResolvedValueOnce(BigInt(1)) // userServerIdsLength
        .mockResolvedValueOnce("0xserver1") // userServerIdsAt(0)
        .mockRejectedValueOnce(new Error("Server info failed")); // getServerInfo fails

      const result = await controller.getTrustedServersWithInfo();

      expect(result).toEqual([
        {
          serverId: "0xserver1",
          url: "",
          isTrusted: true,
          trustIndex: 0,
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
            "0x1234567890123456789012345678901234567890" as Address,
        },
        types: { TrustServer: [] },
        primaryType: "TrustServer" as const,
        message: {
          nonce: BigInt(1),
          serverId: "0x0000000000000000000000000000000000000001" as Address,
          serverUrl: "https://example.com",
        },
      };

      const result = await controller.submitSignedTrustServer(
        typedData,
        "0xsignature" as Hash,
      );

      expect(result).toBe("0xtxhash");
    });

    it("should successfully submit signed trust server via direct transaction", async () => {
      const typedData = {
        domain: {
          name: "Test",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as Address,
        },
        types: { TrustServer: [] },
        primaryType: "TrustServer" as const,
        message: {
          nonce: BigInt(1),
          serverId: "0x0000000000000000000000000000000000000001" as Address,
          serverUrl: "https://example.com",
        },
      };

      const result = await controller.submitSignedTrustServer(
        typedData,
        "0xsignature" as Hash,
      );

      expect(result).toBe("0xtxhash");
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
            "0x1234567890123456789012345678901234567890" as Address,
        },
        types: { TrustServer: [] },
        primaryType: "TrustServer" as const,
        message: {
          nonce: BigInt(1),
          serverId: "0x0000000000000000000000000000000000000001" as Address,
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
      mockContext.relayerCallbacks = {
        submitUntrustServer: vi.fn().mockResolvedValue("0xrelayerhash" as Hash),
      };

      const typedData = {
        domain: {
          name: "Test",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as Address,
        },
        types: { UntrustServer: [] },
        primaryType: "UntrustServer" as const,
        message: {
          nonce: BigInt(1),
          serverId: "0x0000000000000000000000000000000000000001" as Address,
        },
      };

      const result = await controller.submitSignedUntrustServer(
        typedData,
        "0xsignature" as Hash,
      );

      expect(result).toBe("0xrelayerhash");
    });

    it("should successfully submit signed untrust server via direct transaction", async () => {
      const typedData = {
        domain: {
          name: "Test",
          version: "1",
          chainId: 14800,
          verifyingContract:
            "0x1234567890123456789012345678901234567890" as Address,
        },
        types: { UntrustServer: [] },
        primaryType: "UntrustServer" as const,
        message: {
          nonce: BigInt(1),
          serverId: "0x0000000000000000000000000000000000000001" as Address,
        },
      };

      const result = await controller.submitSignedUntrustServer(
        typedData,
        "0xsignature" as Hash,
      );

      expect(result).toBe("0xtxhash");
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
            "0x1234567890123456789012345678901234567890" as Address,
        },
        types: { UntrustServer: [] },
        primaryType: "UntrustServer" as const,
        message: {
          nonce: BigInt(1),
          serverId: "0x0000000000000000000000000000000000000001" as Address,
        },
      };

      await expect(
        controller.submitSignedUntrustServer(typedData, "0xsignature" as Hash),
      ).rejects.toThrow(BlockchainError);
    });
  });

  // Note: isTrustedServer method not implemented in PermissionsController
});
