import { describe, it, expect, vi, beforeEach } from "vitest";
import { VanaCore } from "../core";
import { InvalidConfigurationError } from "../errors";
import { createWalletClient, http, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";
import { mockPlatformAdapter } from "./mocks/platformAdapter";
import type { VanaChain, VanaChainId } from "../types";
import type { StorageProvider } from "../storage";

// Mock controllers
vi.mock("../controllers/permissions", () => ({
  PermissionsController: vi.fn().mockImplementation(() => ({
    getUserAddress: vi
      .fn()
      .mockResolvedValue("0x1234567890123456789012345678901234567890"),
  })),
}));

vi.mock("../controllers/data", () => ({
  DataController: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("../controllers/server", () => ({
  ServerController: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("../controllers/protocol", () => ({
  ProtocolController: vi.fn().mockImplementation(() => ({
    getChainId: vi.fn().mockReturnValue(14800),
    getChainName: vi.fn().mockReturnValue("VANA - Moksha"),
  })),
}));

vi.mock("../storage", () => ({
  StorageManager: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    setDefaultProvider: vi.fn(),
    getProvider: vi.fn(),
    getStorageProviders: vi.fn().mockReturnValue(["test-provider"]),
    getDefaultStorageProvider: vi.fn().mockReturnValue("test-provider"),
  })),
}));

// Mock the parseTransactionPojo module
vi.mock("../utils/parseTransactionPojo", () => ({
  parseTransaction: vi.fn((txResult, _receipt) => ({
    hash: txResult.hash,
    from: txResult.from,
    contract: txResult.contract,
    fn: txResult.fn,
    expectedEvents: {},
    allEvents: [],
    hasExpectedEvents: false,
  })),
}));

describe("VanaCore Extended Tests", () => {
  const testAccount = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );

  let validWalletClient: ReturnType<typeof createWalletClient> & {
    chain: VanaChain;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    validWalletClient = createWalletClient({
      account: testAccount,
      chain: mokshaTestnet,
      transport: http("https://rpc.moksha.vana.org"),
    }) as typeof validWalletClient;
  });

  describe("Configuration Validation", () => {
    it("should validate RPC URL format for ChainConfig", () => {
      expect(() => {
        new VanaCore(mockPlatformAdapter, {
          chainId: 14800,
          account: testAccount,
          rpcUrl: "not-a-valid-url",
        });
      }).toThrow(InvalidConfigurationError);
    });

    it("should work with empty RPC URL (uses default)", () => {
      expect(() => {
        new VanaCore(mockPlatformAdapter, {
          chainId: 14800,
          account: testAccount,
          rpcUrl: "",
        });
      }).not.toThrow();
    });

    it("should validate whitespace-only RPC URL", () => {
      expect(() => {
        new VanaCore(mockPlatformAdapter, {
          chainId: 14800,
          account: testAccount,
          rpcUrl: "   ",
        });
      }).toThrow(InvalidConfigurationError);
    });

    it("should accept valid HTTPS RPC URL", () => {
      expect(() => {
        new VanaCore(mockPlatformAdapter, {
          chainId: 14800,
          account: testAccount,
          rpcUrl: "https://rpc.moksha.vana.org",
        });
      }).not.toThrow();
    });

    it("should accept valid HTTP RPC URL", () => {
      expect(() => {
        new VanaCore(mockPlatformAdapter, {
          chainId: 14800,
          account: testAccount,
          rpcUrl: "http://localhost:8545",
        });
      }).not.toThrow();
    });

    it("should validate account object format", () => {
      expect(() => {
        new VanaCore(mockPlatformAdapter, {
          chainId: 14800,
          account: { invalid: "account" } as unknown as Account,
        });
      }).toThrow(InvalidConfigurationError);
    });

    it("should require account for ChainConfig", () => {
      expect(() => {
        new VanaCore(mockPlatformAdapter, {
          chainId: 14800,
          rpcUrl: "https://rpc.moksha.vana.org",
        });
      }).toThrow("Account is required when using ChainConfig");
    });
  });

  describe("Storage Configuration", () => {
    it("should validate storage providers object", () => {
      expect(() => {
        new VanaCore(mockPlatformAdapter, {
          walletClient: validWalletClient,
          storage: {
            providers: "not-an-object" as unknown as Record<
              string,
              StorageProvider
            >,
          },
        });
      }).toThrow(InvalidConfigurationError);
    });

    it("should validate individual storage providers", () => {
      expect(() => {
        new VanaCore(mockPlatformAdapter, {
          walletClient: validWalletClient,
          storage: {
            providers: {
              invalid: null as unknown as StorageProvider,
            },
          },
        });
      }).toThrow(InvalidConfigurationError);
    });

    it("should validate default provider exists", () => {
      expect(() => {
        new VanaCore(mockPlatformAdapter, {
          walletClient: validWalletClient,
          storage: {
            providers: {
              ipfs: {
                upload: vi.fn(),
                download: vi.fn(),
                list: vi.fn(),
                delete: vi.fn(),
                getConfig: vi.fn(),
              } as unknown as StorageProvider,
            },
            defaultProvider: "nonexistent",
          },
        });
      }).toThrow(InvalidConfigurationError);
    });

    it("should set first provider as default when none specified", () => {
      const mockProvider = {
        upload: vi.fn(),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        getConfig: vi.fn(),
      };

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        storage: {
          providers: {
            first: mockProvider as StorageProvider,
            second: mockProvider as StorageProvider,
          },
        },
      });

      expect(vana).toBeDefined();
    });

    it("should work with explicit default provider", () => {
      const mockProvider = {
        upload: vi.fn(),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        getConfig: vi.fn(),
      };

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        storage: {
          providers: {
            ipfs: mockProvider as StorageProvider,
            pinata: mockProvider as StorageProvider,
          },
          defaultProvider: "pinata",
        },
      });

      expect(vana).toBeDefined();
    });
  });

  describe("Direct Instantiation", () => {
    it("should create instance from ChainConfig via constructor", () => {
      const vana = new VanaCore(mockPlatformAdapter, {
        chainId: 14800,
        account: testAccount,
      });

      expect(vana).toBeInstanceOf(VanaCore);
      expect(vana.chainId).toBe(14800);
    });

    it("should create instance from WalletConfig via constructor", () => {
      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
      });

      expect(vana).toBeInstanceOf(VanaCore);
      expect(vana.chainId).toBe(14800);
    });
  });

  describe("Runtime Configuration", () => {
    it("should return runtime config with storage info", () => {
      const mockProvider = {
        upload: vi.fn(),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        getConfig: vi.fn(),
      };

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        storage: {
          providers: {
            test: mockProvider as StorageProvider,
          },
          defaultProvider: "test",
        },
        relayerCallbacks: {
          submitPermissionGrant: vi.fn(),
        },
      });

      const config = vana.getConfig();
      expect(config.chainId).toBe(14800);
      expect(config.chainName).toBe("VANA - Moksha");
      expect(config.relayerCallbacks).toBeDefined();
      expect(config.storageProviders).toEqual(["test-provider"]);
      expect(config.defaultStorageProvider).toBe("test-provider");
    });

    it("should return config without storage when not configured", () => {
      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
      });

      const config = vana.getConfig();
      expect(config.storageProviders).toEqual([]);
      expect(config.defaultStorageProvider).toBeUndefined();
    });
  });

  describe("Address Retrieval", () => {
    it("should get user address from permissions controller", async () => {
      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
      });

      const address = await vana.getUserAddress();
      expect(address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    });
  });

  describe("Chain Support", () => {
    it("should support Vana mainnet", () => {
      const mainnetAccount = privateKeyToAccount(
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      );

      expect(() => {
        new VanaCore(mockPlatformAdapter, {
          chainId: 1480, // Vana mainnet
          account: mainnetAccount,
        });
      }).not.toThrow();
    });

    it("should reject unsupported chain IDs", () => {
      expect(() => {
        new VanaCore(mockPlatformAdapter, {
          chainId: 1 as VanaChainId, // Ethereum mainnet - not supported
          account: testAccount,
        });
      }).toThrow(InvalidConfigurationError);
    });
  });

  describe("Legacy API Removal", () => {
    it("should not expose legacy fromChain method", () => {
      expect(
        (VanaCore as unknown as { fromChain?: unknown }).fromChain,
      ).toBeUndefined();
    });

    it("should not expose legacy fromWallet method", () => {
      expect(
        (VanaCore as unknown as { fromWallet?: unknown }).fromWallet,
      ).toBeUndefined();
    });
  });

  describe("POJO-based Transaction and Operation Helpers", () => {
    let vanaCore: VanaCore;
    let mockPublicClient: {
      waitForTransactionReceipt: ReturnType<typeof vi.fn>;
    };
    let mockServerController: { waitForOperation: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockPublicClient = {
        waitForTransactionReceipt: vi.fn(),
      };

      mockServerController = {
        waitForOperation: vi.fn(),
      };

      // Create VanaCore instance
      vanaCore = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
      });

      // Mock the internal publicClient and server controller
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vanaCore as any).publicClient = mockPublicClient;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vanaCore as any).server = mockServerController;
    });

    describe("waitForTransactionReceipt", () => {
      const mockReceipt = {
        transactionHash: "0xabc123" as `0x${string}`,
        blockNumber: 12345n,
        status: "success" as const,
        logs: [],
      };

      it("should accept a TransactionResult object", async () => {
        mockPublicClient.waitForTransactionReceipt.mockResolvedValue(
          mockReceipt,
        );

        const transactionResult = {
          hash: "0xabc123" as `0x${string}`,
          from: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        };

        const receipt =
          await vanaCore.waitForTransactionReceipt(transactionResult);

        expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
          {
            hash: "0xabc123",
            confirmations: undefined,
            pollingInterval: undefined,
            timeout: undefined,
          },
        );
        expect(receipt).toEqual(mockReceipt);
      });

      it("should accept a plain hash string", async () => {
        mockPublicClient.waitForTransactionReceipt.mockResolvedValue(
          mockReceipt,
        );

        const hash = "0xabc123" as `0x${string}`;
        const receipt = await vanaCore.waitForTransactionReceipt(hash);

        expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
          {
            hash: "0xabc123",
            confirmations: undefined,
            pollingInterval: undefined,
            timeout: undefined,
          },
        );
        expect(receipt).toEqual(mockReceipt);
      });

      it("should accept an object with hash property", async () => {
        mockPublicClient.waitForTransactionReceipt.mockResolvedValue(
          mockReceipt,
        );

        const objectWithHash = { hash: "0xabc123" as `0x${string}` };
        const receipt =
          await vanaCore.waitForTransactionReceipt(objectWithHash);

        expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
          {
            hash: "0xabc123",
            confirmations: undefined,
            pollingInterval: undefined,
            timeout: undefined,
          },
        );
        expect(receipt).toEqual(mockReceipt);
      });

      it("should pass through wait options", async () => {
        mockPublicClient.waitForTransactionReceipt.mockResolvedValue(
          mockReceipt,
        );

        const hash = "0xabc123" as `0x${string}`;
        const options = {
          confirmations: 3,
          pollingInterval: 1000,
          timeout: 60000,
        };

        await vanaCore.waitForTransactionReceipt(hash, options);

        expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
          {
            hash: "0xabc123",
            confirmations: 3,
            pollingInterval: 1000,
            timeout: 60000,
          },
        );
      });
    });

    describe("waitForTransactionEvents", () => {
      const mockReceipt = {
        transactionHash: "0xabc123" as `0x${string}`,
        blockNumber: 12345n,
        status: "success" as const,
        logs: [],
      };

      it("should accept a TransactionResult and return typed events", async () => {
        mockPublicClient.waitForTransactionReceipt.mockResolvedValue(
          mockReceipt,
        );

        const transactionResult = {
          hash: "0xabc123" as `0x${string}`,
          from: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        };

        const txResult = {
          ...transactionResult,
          contract: "DataPortabilityPermissions" as const,
          fn: "addPermission" as const,
        };

        const events = await vanaCore.waitForTransactionEvents(txResult);

        expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
          {
            hash: "0xabc123",
            confirmations: undefined,
            pollingInterval: undefined,
            timeout: undefined,
          },
        );
        // The implementation now returns parsed events
        expect(events).toEqual({
          hash: "0xabc123",
          from: "0x1234567890123456789012345678901234567890",
          contract: "DataPortabilityPermissions",
          fn: "addPermission",
          expectedEvents: {},
          allEvents: [],
          hasExpectedEvents: false,
        });
      });

      it("should accept a plain hash string", async () => {
        mockPublicClient.waitForTransactionReceipt.mockResolvedValue(
          mockReceipt,
        );

        const hash = "0xabc123" as `0x${string}`;
        const txResult = {
          hash,
          from: "0xuser" as `0x${string}`,
          contract: "DataPortabilityPermissions" as const,
          fn: "addPermission" as const,
        };
        const events = await vanaCore.waitForTransactionEvents(txResult);

        expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
          {
            hash: "0xabc123",
            confirmations: undefined,
            pollingInterval: undefined,
            timeout: undefined,
          },
        );
        expect(events).toEqual({
          hash: "0xabc123",
          from: "0xuser",
          contract: "DataPortabilityPermissions",
          fn: "addPermission",
          expectedEvents: {},
          allEvents: [],
          hasExpectedEvents: false,
        });
      });

      it("should work with type parameter for better type safety", async () => {
        mockPublicClient.waitForTransactionReceipt.mockResolvedValue(
          mockReceipt,
        );

        const transactionResult = {
          hash: "0xdef456" as `0x${string}`,
          from: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        };

        const txResult = {
          ...transactionResult,
          contract: "DataRegistry" as const,
          fn: "addFile" as const,
        };
        const events = await vanaCore.waitForTransactionEvents(txResult);

        expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalled();
        // Type assertion for testing - in real usage, the parsing would extract actual event data
        expect(events).toBeDefined();
      });
    });

    describe("waitForOperation", () => {
      const mockOperation = {
        id: "op_123",
        status: "succeeded" as const,
        result: { data: "test" },
      };

      it("should accept an Operation object", async () => {
        mockServerController.waitForOperation.mockResolvedValue(mockOperation);

        const operation = {
          id: "op_123",
          status: "starting" as const,
          createdAt: Date.now(),
        };

        const result = await vanaCore.waitForOperation(operation);

        expect(mockServerController.waitForOperation).toHaveBeenCalledWith(
          operation,
          undefined,
        );
        expect(result).toEqual(mockOperation);
      });

      it("should accept a plain operation ID string", async () => {
        mockServerController.waitForOperation.mockResolvedValue(mockOperation);

        const operationId = "op_123";
        const result = await vanaCore.waitForOperation(operationId);

        expect(mockServerController.waitForOperation).toHaveBeenCalledWith(
          operationId,
          undefined,
        );
        expect(result).toEqual(mockOperation);
      });

      it("should pass through polling options", async () => {
        mockServerController.waitForOperation.mockResolvedValue(mockOperation);

        const operationId = "op_123";
        const options = {
          timeout: 60000,
          pollingInterval: 1000,
        };

        await vanaCore.waitForOperation(operationId, options);

        expect(mockServerController.waitForOperation).toHaveBeenCalledWith(
          operationId,
          options,
        );
      });

      it("should preserve type parameter for operation result", async () => {
        interface CustomResult {
          processedData: string;
          metadata: { count: number };
        }

        const typedOperation = {
          id: "op_456",
          status: "succeeded" as const,
          result: {
            processedData: "test data",
            metadata: { count: 5 },
          },
        };

        mockServerController.waitForOperation.mockResolvedValue(typedOperation);

        const operation = {
          id: "op_456",
          status: "starting" as const,
          createdAt: Date.now(),
        };

        const result = await vanaCore.waitForOperation<CustomResult>(operation);

        expect(result).toEqual(typedOperation);
      });
    });

    describe("Integration with POJO results", () => {
      it("should work seamlessly with permission grant results", async () => {
        const mockReceipt = {
          transactionHash: "0xabc123" as `0x${string}`,
          blockNumber: 12345n,
          status: "success" as const,
          logs: [],
        };

        mockPublicClient.waitForTransactionReceipt.mockResolvedValue(
          mockReceipt,
        );

        // Simulate a permission grant that returns a POJO
        const grantResult = {
          hash: "0xabc123" as `0x${string}`,
          from: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        };

        // User can directly pass the result to waitForTransactionEvents
        const txResult = {
          hash: grantResult.hash,
          from: grantResult.from || ("0xuser" as `0x${string}`),
          contract: "DataPortabilityPermissions" as const,
          fn: "addPermission" as const,
        };
        await vanaCore.waitForTransactionEvents(txResult);

        expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
          {
            hash: grantResult.hash,
            confirmations: undefined,
            pollingInterval: undefined,
            timeout: undefined,
          },
        );
      });

      it("should work with server operation results", async () => {
        const mockCompletedOp = {
          id: "op_789",
          status: "succeeded" as const,
          result: { fileContent: "encrypted data" },
        };

        mockServerController.waitForOperation.mockResolvedValue(
          mockCompletedOp,
        );

        // Simulate a server operation that returns a POJO
        const operationResult = {
          id: "op_789",
          status: "starting" as const,
          createdAt: Date.now(),
        };

        // User can directly pass the result to waitForOperation
        const completed = await vanaCore.waitForOperation(operationResult);

        expect(mockServerController.waitForOperation).toHaveBeenCalledWith(
          operationResult,
          undefined,
        );
        expect(completed.status).toBe("succeeded");
      });
    });
  });
});
