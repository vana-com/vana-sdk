import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import type { Hash, Address } from "viem";
import {
  PermissionsController,
  ControllerContext,
} from "../controllers/permissions";
import { BlockchainError } from "../errors";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock ALL external dependencies
vi.mock("viem", () => ({
  createPublicClient: vi.fn(() => ({
    readContract: vi.fn(),
  })),
  getContract: vi.fn(() => ({
    read: {
      userNonce: vi.fn(),
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

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

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
}

describe("PermissionsController - Helper Methods", () => {
  let controller: PermissionsController;
  let mockContext: ControllerContext;
  let mockWalletClient: MockWalletClient;
  let mockPublicClient: MockPublicClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset fetch mock to a working state (if mocked)
    if (typeof fetch === "function" && "mockReset" in fetch) {
      (fetch as Mock).mockReset?.();
    }

    // Create a fully mocked wallet client
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
      readContract: vi.fn(),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
      getTransactionReceipt: vi.fn().mockResolvedValue({
        transactionHash: "0xTransactionHash",
        blockNumber: 12345n,
        gasUsed: 100000n,
        status: "success" as const,
        logs: [],
      }),
      getChainId: vi.fn().mockResolvedValue(14800),
    };

    // Set up the context with all required mocks
    mockContext = {
      walletClient:
        mockWalletClient as unknown as ControllerContext["walletClient"],
      publicClient:
        mockPublicClient as unknown as ControllerContext["publicClient"],
      platform: mockPlatformAdapter,
    };

    controller = new PermissionsController(mockContext);
  });

  describe("DataPortabilityServers Helper Methods", () => {
    describe("getUserServerIds", () => {
      it("should successfully get user server IDs", async () => {
        const mockServerIds = [BigInt(1), BigInt(2), BigInt(3)];
        mockPublicClient.readContract.mockResolvedValue(mockServerIds);

        const result = await controller.getUserServerIds();

        expect(result).toEqual([BigInt(1), BigInt(2), BigInt(3)]);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "userServerIdsValues",
          args: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"],
        });
      });

      it("should handle contract read errors", async () => {
        mockPublicClient.readContract.mockRejectedValue(
          new Error("Contract read failed"),
        );

        await expect(controller.getUserServerIds()).rejects.toThrow(
          "Failed to get user server IDs: Contract read failed",
        );
      });
    });

    describe("getUserServerIdAt", () => {
      it("should successfully get server ID at specific index", async () => {
        mockPublicClient.readContract.mockResolvedValue(BigInt(123));

        const result = await controller.getUserServerIdAt(
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
          BigInt(0),
        );

        expect(result).toBe(BigInt(123));
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "userServerIdsAt",
          args: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", BigInt(0)],
        });
      });
    });

    describe("getUserServerCount", () => {
      it("should successfully get user server count", async () => {
        mockPublicClient.readContract.mockResolvedValue(BigInt(5));

        const result = await controller.getUserServerCount();

        expect(result).toBe(BigInt(5));
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "userServerIdsLength",
          args: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"],
        });
      });
    });

    describe("getUserTrustedServers", () => {
      it("should successfully get user trusted servers", async () => {
        const mockServers = [
          {
            id: BigInt(1),
            owner: "0xowner1" as Address,
            serverAddress: "0xserver1" as Address,
            publicKey: "0xpubkey1",
            url: "https://server1.com",
            startBlock: BigInt(100),
            endBlock: BigInt(0),
          },
        ];
        mockPublicClient.readContract.mockResolvedValue(mockServers);

        const result = await controller.getUserTrustedServers();

        expect(result).toEqual(mockServers);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "userServerValues",
          args: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"],
        });
      });
    });

    describe("getUserTrustedServer", () => {
      it("should successfully get specific trusted server", async () => {
        const mockServer = {
          id: BigInt(1),
          owner: "0xowner1" as Address,
          serverAddress: "0xserver1" as Address,
          publicKey: "0xpubkey1",
          url: "https://server1.com",
          startBlock: BigInt(100),
          endBlock: BigInt(0),
        };
        mockPublicClient.readContract.mockResolvedValue(mockServer);

        const result = await controller.getUserTrustedServer(
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
          BigInt(1),
        );

        expect(result).toEqual(mockServer);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "userServers",
          args: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", BigInt(1)],
        });
      });
    });

    describe("getServerInfo", () => {
      it("should successfully get server info", async () => {
        const mockServerInfo = {
          id: BigInt(1),
          owner: "0xowner1" as Address,
          serverAddress: "0xserver1" as Address,
          publicKey: "0xpubkey1",
          url: "https://server1.com",
        };
        mockPublicClient.readContract.mockResolvedValue(mockServerInfo);

        const result = await controller.getServerInfo(BigInt(1));

        expect(result).toEqual(mockServerInfo);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "servers",
          args: [BigInt(1)],
        });
      });
    });

    describe("getServerInfoByAddress", () => {
      it("should successfully get server info by address", async () => {
        const mockServerInfo = {
          id: BigInt(1),
          owner: "0xowner1" as Address,
          serverAddress: "0xserver1" as Address,
          publicKey: "0xpubkey1",
          url: "https://server1.com",
        };
        mockPublicClient.readContract.mockResolvedValue(mockServerInfo);

        const result = await controller.getServerInfoByAddress(
          "0xserver1" as Address,
        );

        expect(result).toEqual(mockServerInfo);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "serverByAddress",
          args: ["0xserver1"],
        });
      });
    });
  });

  describe("DataPortabilityPermissions Helper Methods", () => {
    describe("getUserPermissionIds", () => {
      it("should successfully get user permission IDs", async () => {
        const mockPermissionIds = [BigInt(1), BigInt(2), BigInt(3)];
        mockPublicClient.readContract.mockResolvedValue(mockPermissionIds);

        const result = await controller.getUserPermissionIds();

        expect(result).toEqual([BigInt(1), BigInt(2), BigInt(3)]);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "userPermissionIdsValues",
          args: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"],
        });
      });
    });

    describe("getUserPermissionIdAt", () => {
      it("should successfully get permission ID at specific index", async () => {
        mockPublicClient.readContract.mockResolvedValue(BigInt(456));

        const result = await controller.getUserPermissionIdAt(
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
          BigInt(1),
        );

        expect(result).toBe(BigInt(456));
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "userPermissionIdsAt",
          args: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", BigInt(1)],
        });
      });
    });

    describe("getUserPermissionCount", () => {
      it("should successfully get user permission count", async () => {
        mockPublicClient.readContract.mockResolvedValue(BigInt(10));

        const result = await controller.getUserPermissionCount();

        expect(result).toBe(BigInt(10));
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "userPermissionIdsLength",
          args: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"],
        });
      });
    });

    describe("getPermissionInfo", () => {
      it("should successfully get permission info", async () => {
        const mockPermissionInfo = {
          id: BigInt(123),
          grantor: "0xgrantor" as Address,
          nonce: BigInt(1),
          granteeId: BigInt(456),
          grant: "https://ipfs.example/grant",
          signature: "0xsignature" as `0x${string}`,
          startBlock: BigInt(100),
          endBlock: BigInt(0),
          fileIds: [BigInt(1), BigInt(2)],
        };
        mockPublicClient.readContract.mockResolvedValue(mockPermissionInfo);

        const result = await controller.getPermissionInfo(BigInt(123));

        expect(result).toEqual(mockPermissionInfo);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "permissions",
          args: [BigInt(123)],
        });
      });
    });

    describe("getFilePermissionIds", () => {
      it("should successfully get file permission IDs", async () => {
        const mockPermissionIds = [BigInt(10), BigInt(20), BigInt(30)];
        mockPublicClient.readContract.mockResolvedValue(mockPermissionIds);

        const result = await controller.getFilePermissionIds(BigInt(456));

        expect(result).toEqual([BigInt(10), BigInt(20), BigInt(30)]);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "filePermissionIds",
          args: [BigInt(456)],
        });
      });
    });

    describe("getPermissionFileIds", () => {
      it("should successfully get permission file IDs", async () => {
        const mockFileIds = [BigInt(100), BigInt(200)];
        mockPublicClient.readContract.mockResolvedValue(mockFileIds);

        const result = await controller.getPermissionFileIds(BigInt(789));

        expect(result).toEqual([BigInt(100), BigInt(200)]);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "permissionFileIds",
          args: [BigInt(789)],
        });
      });
    });

    describe("getFilePermissions", () => {
      it("should successfully get file permissions", async () => {
        const mockPermissions = [BigInt(111), BigInt(222)];
        mockPublicClient.readContract.mockResolvedValue(mockPermissions);

        const result = await controller.getFilePermissions(BigInt(333));

        expect(result).toEqual([BigInt(111), BigInt(222)]);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "filePermissions",
          args: [BigInt(333)],
        });
      });
    });
  });

  describe("DataPortabilityGrantees Helper Methods", () => {
    describe("getGranteeInfo", () => {
      it("should successfully get grantee info", async () => {
        const mockGranteeInfo = {
          owner: "0xowner" as Address,
          granteeAddress: "0xgrantee" as Address,
          publicKey: "0xpubkey",
          permissionIds: [BigInt(1), BigInt(2)],
        };
        mockPublicClient.readContract.mockResolvedValue(mockGranteeInfo);

        const result = await controller.getGranteeInfo(BigInt(1));

        expect(result).toEqual(mockGranteeInfo);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "granteeInfo",
          args: [BigInt(1)],
        });
      });
    });

    describe("getGranteeInfoByAddress", () => {
      it("should successfully get grantee info by address", async () => {
        const mockGranteeInfo = {
          owner: "0xowner" as Address,
          granteeAddress: "0xgrantee" as Address,
          publicKey: "0xpubkey",
          permissionIds: [BigInt(1), BigInt(2)],
        };
        mockPublicClient.readContract.mockResolvedValue(mockGranteeInfo);

        const result = await controller.getGranteeInfoByAddress(
          "0xgrantee" as Address,
        );

        expect(result).toEqual(mockGranteeInfo);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "granteeByAddress",
          args: ["0xgrantee"],
        });
      });
    });

    describe("getGranteePermissionIds", () => {
      it("should successfully get grantee permission IDs", async () => {
        const mockPermissionIds = [BigInt(100), BigInt(200), BigInt(300)];
        mockPublicClient.readContract.mockResolvedValue(mockPermissionIds);

        const result = await controller.getGranteePermissionIds(BigInt(5));

        expect(result).toEqual([BigInt(100), BigInt(200), BigInt(300)]);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "granteePermissionIds",
          args: [BigInt(5)],
        });
      });
    });

    describe("getGranteePermissions", () => {
      it("should successfully get grantee permissions", async () => {
        const mockPermissions = [BigInt(111), BigInt(222), BigInt(333)];
        mockPublicClient.readContract.mockResolvedValue(mockPermissions);

        const result = await controller.getGranteePermissions(BigInt(7));

        expect(result).toEqual([BigInt(111), BigInt(222), BigInt(333)]);
        expect(mockPublicClient.readContract).toHaveBeenCalledWith({
          address: "0x1234567890123456789012345678901234567890",
          abi: [],
          functionName: "granteePermissions",
          args: [BigInt(7)],
        });
      });
    });
  });

  describe("Error Handling", () => {
    it("should throw BlockchainError for server methods", async () => {
      mockPublicClient.readContract.mockRejectedValue(
        new Error("Contract error"),
      );

      await expect(controller.getUserServerIds()).rejects.toThrow(
        BlockchainError,
      );
      await expect(controller.getUserServerCount()).rejects.toThrow(
        BlockchainError,
      );
      await expect(controller.getUserTrustedServers()).rejects.toThrow(
        BlockchainError,
      );
    });

    it("should throw BlockchainError for permission methods", async () => {
      mockPublicClient.readContract.mockRejectedValue(
        new Error("Contract error"),
      );

      await expect(controller.getUserPermissionIds()).rejects.toThrow(
        BlockchainError,
      );
      await expect(controller.getUserPermissionCount()).rejects.toThrow(
        BlockchainError,
      );
      await expect(controller.getFilePermissionIds(BigInt(1))).rejects.toThrow(
        BlockchainError,
      );
    });

    it("should throw BlockchainError for grantee methods", async () => {
      mockPublicClient.readContract.mockRejectedValue(
        new Error("Contract error"),
      );

      await expect(controller.getGranteeInfo(BigInt(1))).rejects.toThrow(
        BlockchainError,
      );
      await expect(
        controller.getGranteePermissionIds(BigInt(1)),
      ).rejects.toThrow(BlockchainError);
      await expect(controller.getGranteePermissions(BigInt(1))).rejects.toThrow(
        BlockchainError,
      );
    });
  });
});
