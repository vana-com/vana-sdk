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
        new VanaCore(
          mockPlatformAdapter,
          {
            chainId: 14800,
            account: testAccount,
            rpcUrl: "not-a-valid-url",
          },
        );
      }).toThrow(InvalidConfigurationError);
    });

    it("should work with empty RPC URL (uses default)", () => {
      expect(() => {
        new VanaCore(
          mockPlatformAdapter,
          {
            chainId: 14800,
            account: testAccount,
            rpcUrl: "",
          },
        );
      }).not.toThrow();
    });

    it("should validate whitespace-only RPC URL", () => {
      expect(() => {
        new VanaCore(
          mockPlatformAdapter,
          {
            chainId: 14800,
            account: testAccount,
            rpcUrl: "   ",
          },
        );
      }).toThrow(InvalidConfigurationError);
    });

    it("should accept valid HTTPS RPC URL", () => {
      expect(() => {
        new VanaCore(
          mockPlatformAdapter,
          {
            chainId: 14800,
            account: testAccount,
            rpcUrl: "https://rpc.moksha.vana.org",
          },
        );
      }).not.toThrow();
    });

    it("should accept valid HTTP RPC URL", () => {
      expect(() => {
        new VanaCore(
          mockPlatformAdapter,
          {
            chainId: 14800,
            account: testAccount,
            rpcUrl: "http://localhost:8545",
          },
        );
      }).not.toThrow();
    });

    it("should validate account object format", () => {
      expect(() => {
        new VanaCore(
          mockPlatformAdapter,
          {
            chainId: 14800,
            account: { invalid: "account" } as unknown as Account,
          },
        );
      }).toThrow(InvalidConfigurationError);
    });

    it("should require account for ChainConfig", () => {
      expect(() => {
        new VanaCore(
          mockPlatformAdapter,
          {
            chainId: 14800,
            rpcUrl: "https://rpc.moksha.vana.org",
          },
        );
      }).toThrow("Account is required when using ChainConfig");
    });
  });

  describe("Storage Configuration", () => {
    it("should validate storage providers object", () => {
      expect(() => {
        new VanaCore(
          mockPlatformAdapter,
          {
            walletClient: validWalletClient,
            storage: {
              providers: "not-an-object" as unknown as Record<
                string,
                StorageProvider
              >,
            },
          },
        );
      }).toThrow(InvalidConfigurationError);
    });

    it("should validate individual storage providers", () => {
      expect(() => {
        new VanaCore(
          mockPlatformAdapter,
          {
            walletClient: validWalletClient,
            storage: {
              providers: {
                invalid: null as unknown as StorageProvider,
              },
            },
          },
        );
      }).toThrow(InvalidConfigurationError);
    });

    it("should validate default provider exists", () => {
      expect(() => {
        new VanaCore(
          mockPlatformAdapter,
          {
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
          },
        );
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

      const vana = new VanaCore(
        mockPlatformAdapter,
        {
          walletClient: validWalletClient,
          storage: {
            providers: {
              first: mockProvider as StorageProvider,
              second: mockProvider as StorageProvider,
            },
          },
        },
      );

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

      const vana = new VanaCore(
        mockPlatformAdapter,
        {
          walletClient: validWalletClient,
          storage: {
            providers: {
              ipfs: mockProvider as StorageProvider,
              pinata: mockProvider as StorageProvider,
            },
            defaultProvider: "pinata",
          },
        },
      );

      expect(vana).toBeDefined();
    });
  });

  describe("Direct Instantiation", () => {
    it("should create instance from ChainConfig via constructor", () => {
      const vana = new VanaCore(
        mockPlatformAdapter,
        {
          chainId: 14800,
          account: testAccount,
        },
      );

      expect(vana).toBeInstanceOf(VanaCore);
      expect(vana.chainId).toBe(14800);
    });

    it("should create instance from WalletConfig via constructor", () => {
      const vana = new VanaCore(
        mockPlatformAdapter,
        {
          walletClient: validWalletClient,
        },
      );

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

      const vana = new VanaCore(
        mockPlatformAdapter,
        {
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
        },
      );

      const config = vana.getConfig();
      expect(config.chainId).toBe(14800);
      expect(config.chainName).toBe("VANA - Moksha");
      expect(config.relayerCallbacks).toBeDefined();
      expect(config.storageProviders).toEqual(["test-provider"]);
      expect(config.defaultStorageProvider).toBe("test-provider");
    });

    it("should return config without storage when not configured", () => {
      const vana = new VanaCore(
        mockPlatformAdapter,
        {
          walletClient: validWalletClient,
        },
      );

      const config = vana.getConfig();
      expect(config.storageProviders).toEqual([]);
      expect(config.defaultStorageProvider).toBeUndefined();
    });
  });

  describe("Address Retrieval", () => {
    it("should get user address from permissions controller", async () => {
      const vana = new VanaCore(
        mockPlatformAdapter,
        {
          walletClient: validWalletClient,
        },
      );

      const address = await vana.getUserAddress();
      expect(address).toBe("0x1234567890123456789012345678901234567890");
    });
  });

  describe("Chain Support", () => {
    it("should support Vana mainnet", () => {
      const mainnetAccount = privateKeyToAccount(
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      );

      expect(() => {
        new VanaCore(
          mockPlatformAdapter,
          {
            chainId: 1480, // Vana mainnet
            account: mainnetAccount,
          },
        );
      }).not.toThrow();
    });

    it("should reject unsupported chain IDs", () => {
      expect(() => {
        new VanaCore(
          mockPlatformAdapter,
          {
            chainId: 1 as VanaChainId, // Ethereum mainnet - not supported
            account: testAccount,
          },
        );
      }).toThrow(InvalidConfigurationError);
    });
  });

  describe("Legacy API Removal", () => {
    it("should not expose legacy fromChain method", () => {
      expect((VanaCore as unknown as { fromChain?: unknown }).fromChain).toBeUndefined();
    });

    it("should not expose legacy fromWallet method", () => {
      expect((VanaCore as unknown as { fromWallet?: unknown }).fromWallet).toBeUndefined();
    });
  });
});
