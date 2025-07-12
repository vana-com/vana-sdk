import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWalletClient, http, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";
import { VanaCore } from "../core";
import { InvalidConfigurationError } from "../errors";
import { type VanaChain, type VanaConfig, type WalletConfig } from "../types";
import { mockPlatformAdapter } from "./mocks/platformAdapter";

// Mock the controllers
vi.mock("../controllers/permissions", () => ({
  PermissionsController: vi.fn().mockImplementation(() => ({
    grant: vi.fn(),
    revoke: vi.fn(),
  })),
}));

vi.mock("../controllers/data", () => ({
  DataController: vi.fn().mockImplementation(() => ({
    getUserFiles: vi.fn(),
  })),
}));

vi.mock("../controllers/protocol", () => ({
  ProtocolController: vi.fn().mockImplementation(() => ({
    getContract: vi.fn(),
    getAvailableContracts: vi.fn(),
    getChainId: vi.fn().mockReturnValue(14800),
    getChainName: vi.fn().mockReturnValue("VANA - Moksha"),
  })),
}));

// Mock StorageManager
vi.mock("../storage", () => ({
  StorageManager: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    setDefaultProvider: vi.fn(),
    getProvider: vi.fn(),
    getAllProviders: vi.fn().mockReturnValue([]),
  })),
}));

// Test account
const testAccount = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

describe("VanaCore", () => {
  let validWalletClient: WalletClient & { chain: VanaChain };

  beforeEach(() => {
    vi.clearAllMocks();

    validWalletClient = createWalletClient({
      account: testAccount,
      chain: mokshaTestnet,
      transport: http("https://rpc.moksha.vana.org"),
    }) as WalletClient & { chain: VanaChain };
  });

  describe("Constructor", () => {
    it("should initialize successfully with valid config", () => {
      const vana = new VanaCore({
        walletClient: validWalletClient,
        relayerCallbacks: {
          submitPermissionGrant: async (_typedData, _signature) => "0xtxhash",
          submitPermissionRevoke: async (_typedData, _signature) => "0xtxhash",
        },
      }, mockPlatformAdapter);

      expect(vana).toBeDefined();
      expect(vana.permissions).toBeDefined();
      expect(vana.data).toBeDefined();
      expect(vana.protocol).toBeDefined();
    });

    it("should work without relayer callbacks (direct transaction mode)", () => {
      const vana = new VanaCore({
        walletClient: validWalletClient,
      }, mockPlatformAdapter);

      expect(vana.getConfig().relayerCallbacks).toBeUndefined();
    });

    it("should throw InvalidConfigurationError when config is missing", () => {
      expect(() => {
        new VanaCore(null as unknown as VanaConfig, mockPlatformAdapter);
      }).toThrow(InvalidConfigurationError);
    });

    it("should throw InvalidConfigurationError when walletClient is missing", () => {
      expect(() => {
        new VanaCore({} as unknown as VanaConfig, mockPlatformAdapter);
      }).toThrow(InvalidConfigurationError);
    });

    it("should throw InvalidConfigurationError when walletClient is invalid", () => {
      expect(() => {
        new VanaCore({
          walletClient: {} as unknown as typeof validWalletClient,
        }, mockPlatformAdapter);
      }).toThrow(InvalidConfigurationError);
    });

    it("should throw InvalidConfigurationError when relayerCallbacks is invalid", () => {
      expect(() => {
        new VanaCore({
          walletClient: validWalletClient,
          relayerCallbacks: "not-an-object" as unknown as Record<
            string,
            unknown
          >,
        }, mockPlatformAdapter);
      }).toThrow(InvalidConfigurationError);
    });

    it("should work with partial relayerCallbacks", () => {
      expect(() => {
        new VanaCore({
          walletClient: validWalletClient,
          relayerCallbacks: {
            submitPermissionGrant: async (_typedData, _signature) => "0xtxhash",
            // Only one callback provided - should still work
          },
        }, mockPlatformAdapter);
      }).not.toThrow();
    });

    it("should work with empty relayerCallbacks object", () => {
      expect(() => {
        new VanaCore({
          walletClient: validWalletClient,
          relayerCallbacks: {},
        }, mockPlatformAdapter);
      }).not.toThrow();
    });

    it("should throw InvalidConfigurationError when chain is not supported", () => {
      const invalidChainClient = createWalletClient({
        account: testAccount,
        chain: {
          id: 99999 as unknown as number, // Invalid chain ID for testing
          name: "Unsupported Chain",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: ["http://localhost:8545"] } },
        },
        transport: http("http://localhost:8545"),
      });

      expect(() => {
        new VanaCore({
          walletClient:
            invalidChainClient as unknown as WalletConfig["walletClient"],
        } as WalletConfig, mockPlatformAdapter);
      }).toThrow(InvalidConfigurationError);
    });

    it("should throw InvalidConfigurationError when wallet client has no chain", () => {
      const noChainClient = {
        ...validWalletClient,
        chain: undefined,
      };

      expect(() => {
        new VanaCore({
          walletClient:
            noChainClient as unknown as WalletConfig["walletClient"],
        } as WalletConfig, mockPlatformAdapter);
      }).toThrow(InvalidConfigurationError);
    });
  });

  describe("Properties", () => {
    let vana: VanaCore;

    beforeEach(() => {
      vana = new VanaCore({
        walletClient: validWalletClient,
        relayerCallbacks: {
          submitPermissionGrant: async (_typedData, _signature) => "0xtxhash",
          submitPermissionRevoke: async (_typedData, _signature) => "0xtxhash",
        },
      }, mockPlatformAdapter);
    });

    it("should expose all controller properties", () => {
      expect(vana.permissions).toBeDefined();
      expect(vana.data).toBeDefined();
      expect(vana.protocol).toBeDefined();
    });

    it("should expose chainId getter", () => {
      expect(vana.chainId).toBe(14800);
    });

    it("should expose chainName getter", () => {
      expect(vana.chainName).toBe("VANA - Moksha");
    });
  });

  describe("Methods", () => {
    let vana: VanaCore;

    beforeEach(() => {
      vana = new VanaCore({
        walletClient: validWalletClient,
        relayerCallbacks: {
          submitPermissionGrant: async (_typedData, _signature) => "0xtxhash",
          submitPermissionRevoke: async (_typedData, _signature) => "0xtxhash",
        },
      }, mockPlatformAdapter);
    });

    it("should return configuration summary", () => {
      const config = vana.getConfig();

      expect(config).toEqual({
        chainId: 14800,
        chainName: "VANA - Moksha",
        relayerCallbacks: {
          submitPermissionGrant: expect.any(Function),
          submitPermissionRevoke: expect.any(Function),
        },
        defaultStorageProvider: undefined,
        storageProviders: [],
      });
    });

    it("should get user address", async () => {
      // Mock the private method call
      const mockGetUserAddress = vi.fn().mockResolvedValue(testAccount.address);
      (vana.permissions as unknown as Record<string, unknown>).getUserAddress =
        mockGetUserAddress;

      const address = await vana.getUserAddress();
      expect(address).toBe(testAccount.address);
    });
  });

  describe("Integration", () => {
    it("should pass shared context to all controllers", () => {
      const vana = new VanaCore({
        walletClient: validWalletClient,
        relayerCallbacks: {
          submitPermissionGrant: async (_typedData, _signature) => "0xtxhash",
          submitPermissionRevoke: async (_typedData, _signature) => "0xtxhash",
        },
      }, mockPlatformAdapter);

      // Verify that controllers are initialized with the correct context
      expect(vana.permissions).toBeDefined();
      expect(vana.data).toBeDefined();
      expect(vana.protocol).toBeDefined();

      // Test that the controllers have access to the shared context
      // by verifying they can access the configuration
      const config = vana.getConfig();
      expect(config.relayerCallbacks).toBeDefined();
      expect(config.relayerCallbacks?.submitPermissionGrant).toBeDefined();
      expect(config.relayerCallbacks?.submitPermissionRevoke).toBeDefined();
      expect(config.chainId).toBe(14800);
      expect(config.chainName).toBe("VANA - Moksha");
    });
  });

  describe("Storage Configuration", () => {
    it("should initialize with storage providers when provided", async () => {
      const mockProvider = {
        upload: vi.fn(),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        getConfig: vi.fn().mockReturnValue({ name: "Mock Provider" }),
      };

      const vana = new VanaCore({
        walletClient: validWalletClient,
        storage: {
          providers: {
            mock: mockProvider,
          },
          defaultProvider: "mock",
        },
      }, mockPlatformAdapter);

      expect(vana).toBeDefined();
      // StorageManager should be created and configured
      const { StorageManager } = await import("../storage");
      expect(StorageManager).toHaveBeenCalled();
    });

    it("should set first provider as default when no default specified", async () => {
      const mockProvider1 = {
        upload: vi.fn(),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        getConfig: vi.fn().mockReturnValue({ name: "Mock Provider 1" }),
      };

      const mockProvider2 = {
        upload: vi.fn(),
        download: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
        getConfig: vi.fn().mockReturnValue({ name: "Mock Provider 2" }),
      };

      const vana = new VanaCore({
        walletClient: validWalletClient,
        storage: {
          providers: {
            first: mockProvider1,
            second: mockProvider2,
          },
          // No defaultProvider specified
        },
      }, mockPlatformAdapter);

      expect(vana).toBeDefined();
      const { StorageManager } = await import("../storage");
      const MockedStorageManager = vi.mocked(StorageManager);
      const storageManagerInstance =
        MockedStorageManager.mock.results[
          MockedStorageManager.mock.results.length - 1
        ].value;
      expect(storageManagerInstance.setDefaultProvider).toHaveBeenCalledWith(
        "first",
      );
    });

    it("should work without storage configuration", async () => {
      const vana = new VanaCore({
        walletClient: validWalletClient,
      }, mockPlatformAdapter);

      expect(vana).toBeDefined();
      // StorageManager should not be called when no storage config
      const { StorageManager } = await import("../storage");
      const MockedStorageManager = vi.mocked(StorageManager);
      const callCount = MockedStorageManager.mock.calls.length;

      // Create another instance to verify StorageManager isn't called again
      new VanaCore({
        walletClient: validWalletClient,
      }, mockPlatformAdapter);

      expect(MockedStorageManager.mock.calls.length).toBe(callCount); // Should be same, no new calls
    });
  });
});
