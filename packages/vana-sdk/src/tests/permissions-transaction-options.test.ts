import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Hash } from "viem";
import { PermissionsController } from "../controllers/permissions";
import type { ControllerContext } from "../controllers/permissions";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock external dependencies
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    getAddress: vi.fn((address) => address),
    createPublicClient: vi.fn(() => ({
      readContract: vi.fn(),
      getChainId: vi.fn().mockResolvedValue(14800),
    })),
    http: vi.fn(),
    createWalletClient: vi.fn(),
  };
});

vi.mock("../config/addresses", () => ({
  getContractAddress: vi
    .fn()
    .mockReturnValue("0x1234567890123456789012345678901234567890"),
}));

vi.mock("../generated/abi", () => ({
  getAbi: vi.fn().mockReturnValue([]),
}));

vi.mock("../utils/signatureFormatter", () => ({
  formatSignatureForContract: vi.fn().mockReturnValue("0xformattedsignature"),
}));

describe("PermissionsController - TransactionOptions Integration", () => {
  let controller: PermissionsController;
  let mockContext: ControllerContext;
  let mockWalletClient: {
    writeContract: ReturnType<typeof vi.fn>;
    signTypedData: ReturnType<typeof vi.fn>;
    account: { address: string };
    chain: { id: number };
    getChainId: ReturnType<typeof vi.fn>;
  };
  let mockPublicClient: {
    readContract: ReturnType<typeof vi.fn>;
    getChainId: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockWalletClient = {
      writeContract: vi.fn().mockResolvedValue("0xmocktxhash"),
      signTypedData: vi.fn().mockResolvedValue(`0x${"0".repeat(130)}` as Hash),
      account: { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
      chain: { id: 14800 },
      getChainId: vi.fn().mockResolvedValue(14800),
    };

    mockPublicClient = {
      readContract: vi.fn().mockImplementation((args) => {
        // Mock different contract functions based on functionName
        if (args.functionName === "users") {
          return [1n, []]; // [nonce, trustedServerIds] for getServersUserNonce
        }
        if (args.functionName === "userNonce") {
          return 1n; // single nonce for getPermissionsUserNonce
        }
        return 1n; // Default fallback
      }),
      getChainId: vi.fn().mockResolvedValue(14800),
    };

    mockContext = {
      walletClient: mockWalletClient as any,
      publicClient: mockPublicClient as any,
      userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      platform: mockPlatformAdapter,
    };

    controller = new PermissionsController(mockContext);
  });

  describe("Gas parameter handling consistency", () => {
    const testCases = [
      {
        method: "submitPermissionRevoke",
        params: [{ permissionId: 123n }],
        expectedFunction: "revokePermission",
      },
      {
        method: "submitUntrustServer",
        params: [{ serverId: 1 }],
        expectedFunction: "untrustServer",
      },
      {
        method: "submitRegisterGrantee",
        params: [
          {
            owner:
              "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36" as `0x${string}`,
            granteeAddress:
              "0xApp1234567890123456789012345678901234567890" as `0x${string}`,
            publicKey: "0x1234567890abcdef",
          },
        ],
        expectedFunction: "registerGrantee",
      },
      {
        method: "submitUpdateServer",
        params: [123n, "https://new-server.com"],
        expectedFunction: "updateServer",
      },
      {
        method: "submitRevokePermission",
        params: [456n],
        expectedFunction: "revokePermission",
      },
    ];

    testCases.forEach(({ method, params, expectedFunction }) => {
      describe(`${method}`, () => {
        it("should handle EIP-1559 gas parameters correctly", async () => {
          const options = {
            maxFeePerGas: 200n * 10n ** 9n, // 200 gwei
            maxPriorityFeePerGas: 15n * 10n ** 9n, // 15 gwei
            gas: 750000n,
          };

          await (controller as any)[method](...params, options);

          expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({
              functionName: expectedFunction,
              gas: 750000n,
              maxFeePerGas: 200n * 10n ** 9n,
              maxPriorityFeePerGas: 15n * 10n ** 9n,
            }),
          );

          const writeContractCall = (mockWalletClient.writeContract as any).mock
            .calls[0][0];
          expect(writeContractCall).not.toHaveProperty("gasPrice");
        });

        it("should handle legacy gas parameters correctly", async () => {
          const options = {
            gasPrice: 90n * 10n ** 9n, // 90 gwei
            gas: 450000n,
            nonce: 25,
          };

          await (controller as any)[method](...params, options);

          expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({
              functionName: expectedFunction,
              gas: 450000n,
              gasPrice: 90n * 10n ** 9n,
              nonce: 25,
            }),
          );

          const writeContractCall = (mockWalletClient.writeContract as any).mock
            .calls[0][0];
          expect(writeContractCall).not.toHaveProperty("maxFeePerGas");
          expect(writeContractCall).not.toHaveProperty("maxPriorityFeePerGas");
        });

        it("should prioritize EIP-1559 when both gas types provided", async () => {
          const options = {
            gasPrice: 50n * 10n ** 9n, // Should be ignored
            maxFeePerGas: 150n * 10n ** 9n, // Should be used
            maxPriorityFeePerGas: 8n * 10n ** 9n, // Should be used
          };

          await (controller as any)[method](...params, options);

          const writeContractCall = (mockWalletClient.writeContract as any).mock
            .calls[0][0];
          expect(writeContractCall).toHaveProperty(
            "maxFeePerGas",
            150n * 10n ** 9n,
          );
          expect(writeContractCall).toHaveProperty(
            "maxPriorityFeePerGas",
            8n * 10n ** 9n,
          );
          expect(writeContractCall).not.toHaveProperty("gasPrice");
        });

        it("should work without any options", async () => {
          await (controller as any)[method](...params);

          const writeContractCall = (mockWalletClient.writeContract as any).mock
            .calls[0][0];
          expect(writeContractCall).toHaveProperty(
            "functionName",
            expectedFunction,
          );
          expect(writeContractCall).not.toHaveProperty("gas");
          expect(writeContractCall).not.toHaveProperty("gasPrice");
          expect(writeContractCall).not.toHaveProperty("maxFeePerGas");
          expect(writeContractCall).not.toHaveProperty("maxPriorityFeePerGas");
        });
      });
    });
  });

  describe("Edge cases and validation", () => {
    it("should handle only gas without gas price", async () => {
      const options = { gas: 500000n };

      await controller.submitPermissionRevoke({ permissionId: 123n }, options);

      const writeContractCall = (mockWalletClient.writeContract as any).mock
        .calls[0][0];
      expect(writeContractCall).toHaveProperty("gas", 500000n);
      expect(writeContractCall).not.toHaveProperty("gasPrice");
      expect(writeContractCall).not.toHaveProperty("maxFeePerGas");
    });

    it("should handle only maxFeePerGas without maxPriorityFeePerGas", async () => {
      const options = { maxFeePerGas: 100n * 10n ** 9n };

      await controller.submitPermissionRevoke({ permissionId: 123n }, options);

      const writeContractCall = (mockWalletClient.writeContract as any).mock
        .calls[0][0];
      expect(writeContractCall).toHaveProperty(
        "maxFeePerGas",
        100n * 10n ** 9n,
      );
      expect(writeContractCall).not.toHaveProperty("maxPriorityFeePerGas");
      expect(writeContractCall).not.toHaveProperty("gasPrice");
    });

    it("should handle only maxPriorityFeePerGas without maxFeePerGas", async () => {
      const options = { maxPriorityFeePerGas: 5n * 10n ** 9n };

      await controller.submitPermissionRevoke({ permissionId: 123n }, options);

      const writeContractCall = (mockWalletClient.writeContract as any).mock
        .calls[0][0];
      expect(writeContractCall).toHaveProperty(
        "maxPriorityFeePerGas",
        5n * 10n ** 9n,
      );
      expect(writeContractCall).not.toHaveProperty("maxFeePerGas");
      expect(writeContractCall).not.toHaveProperty("gasPrice");
    });

    it("should handle nonce override", async () => {
      const options = { nonce: 999 };

      await controller.submitPermissionRevoke({ permissionId: 123n }, options);

      const writeContractCall = (mockWalletClient.writeContract as any).mock
        .calls[0][0];
      expect(writeContractCall).toHaveProperty("nonce", 999);
    });
  });

  describe("Load testing scenario simulation", () => {
    it("should support high-priority gas configuration for load testing", async () => {
      const premiumGasOptions = {
        maxFeePerGas: 500n * 10n ** 9n, // 500 gwei - very high priority
        maxPriorityFeePerGas: 50n * 10n ** 9n, // 50 gwei tip
        gas: 1000000n, // Conservative gas limit
      };

      const serverFilesParams = {
        granteeId: BigInt(1),
        grant: "ipfs://QmLoadTestGrant",
        fileUrls: ["https://loadtest.example.com/data.json"],
        schemaIds: [123],
        serverAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb" as const,
        serverUrl: "https://loadtest-server.example.com",
        serverPublicKey: "0xloadtestkey",
        filePermissions: [
          [
            {
              account:
                "0x742d35Cc6634C0532925a3b844Bc9e7595f0b0Bb" as `0x${string}`,
              key: "loadtestkey",
            },
          ],
        ],
      };

      await controller.submitAddServerFilesAndPermissions(
        serverFilesParams,
        premiumGasOptions,
      );

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "addServerFilesAndPermissions",
          gas: 1000000n,
          maxFeePerGas: 500n * 10n ** 9n,
          maxPriorityFeePerGas: 50n * 10n ** 9n,
        }),
      );
    });

    it("should support batch operation gas optimization", async () => {
      const batchGasOptions = {
        gasPrice: 20n * 10n ** 9n, // Lower gas price for batch operations
        gas: 300000n,
      };

      // Simulate multiple operations with same gas settings
      await controller.submitPermissionRevoke(
        { permissionId: 1n },
        batchGasOptions,
      );
      await controller.submitPermissionRevoke(
        { permissionId: 2n },
        batchGasOptions,
      );
      await controller.submitPermissionRevoke(
        { permissionId: 3n },
        batchGasOptions,
      );

      expect(mockWalletClient.writeContract).toHaveBeenCalledTimes(3);

      // Verify all calls used the same gas configuration
      (mockWalletClient.writeContract as any).mock.calls.forEach(
        (call: any) => {
          expect(call[0]).toMatchObject({
            gas: 300000n,
            gasPrice: 20n * 10n ** 9n,
          });
        },
      );
    });
  });

  describe("Timeout parameter documentation", () => {
    it("should accept timeout parameter in TransactionOptions", async () => {
      // This test verifies the interface accepts timeout parameter
      // Timeout is used in waitForTransactionReceipt, not in writeContract
      const options = {
        timeout: 180000, // 3 minutes
        maxFeePerGas: 100n * 10n ** 9n,
      };

      await controller.submitPermissionRevoke({ permissionId: 123n }, options);

      // Timeout is not passed to writeContract, only gas parameters are
      const writeContractCall = (mockWalletClient.writeContract as any).mock
        .calls[0][0];
      expect(writeContractCall).toHaveProperty(
        "maxFeePerGas",
        100n * 10n ** 9n,
      );
      expect(writeContractCall).not.toHaveProperty("timeout");
    });
  });
});
