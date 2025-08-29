import { describe, it, expect, vi, beforeEach } from "vitest";
import { VanaCore, VanaCoreFactory } from "../core";
import type { VanaPlatformAdapter } from "../platform/interface";
import type { VanaConfig, VanaConfigWithStorage, WalletConfig } from "../types";
import type { VanaChain } from "../types/chains";
import { createMockPlatformAdapter } from "../tests/mocks/platformAdapter";
import { createTypedMockWalletClient } from "../tests/factories/mockFactory";
import { privateKeyToAccount } from "viem/accounts";
import type { WalletClient } from "viem";

// Mock the platform adapter creation
vi.mock("../platform/utils", () => ({
  createPlatformAdapter: vi.fn().mockResolvedValue(createMockPlatformAdapter()),
}));

// Mock the encryption utilities
vi.mock("../utils/encryption", () => ({
  encryptBlobWithSignedKey: vi.fn().mockResolvedValue(new Blob(["encrypted"])),
  decryptBlobWithSignedKey: vi.fn().mockResolvedValue(new Blob(["decrypted"])),
}));

// Mock the platform adapter
const mockPlatformAdapter = createMockPlatformAdapter();

// Create a test account using viem's privateKeyToAccount
// This is a well-known test private key from Hardhat/Anvil
const testAccount = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

// Mock config with proper account
const mockConfig: VanaConfig = {
  chainId: 14800,
  account: testAccount,
};

describe("VanaCore", () => {
  let vanaCore: VanaCore;

  beforeEach(() => {
    vi.clearAllMocks();
    vanaCore = new VanaCore(mockPlatformAdapter, mockConfig);
  });

  describe("setPlatformAdapter", () => {
    it("should set a new platform adapter", () => {
      const newAdapter: VanaPlatformAdapter = {
        ...mockPlatformAdapter,
        platform: "node" as const,
      };

      vanaCore.setPlatformAdapter(newAdapter);

      const adapter = vanaCore.getPlatformAdapter();
      expect(adapter.platform).toBe("node");
    });

    it("should update the adapter used by controllers", () => {
      const newAdapter: VanaPlatformAdapter = {
        ...mockPlatformAdapter,
        platform: "node" as const,
        crypto: {
          ...mockPlatformAdapter.crypto,
          encryptWithPublicKey: vi.fn().mockResolvedValue("new-encrypted"),
        },
      };

      vanaCore.setPlatformAdapter(newAdapter);

      // The new adapter should be accessible
      expect(vanaCore.getPlatformAdapter()).toBe(newAdapter);
    });
  });

  describe("getPlatformAdapter", () => {
    it("should return the current platform adapter", () => {
      const adapter = vanaCore.getPlatformAdapter();

      expect(adapter).toBe(mockPlatformAdapter);
      expect(adapter.platform).toBe("node");
    });

    it("should return the updated adapter after setPlatformAdapter", () => {
      const newAdapter: VanaPlatformAdapter = {
        ...mockPlatformAdapter,
        platform: "node" as const,
      };

      vanaCore.setPlatformAdapter(newAdapter);

      const adapter = vanaCore.getPlatformAdapter();
      expect(adapter).toBe(newAdapter);
      expect(adapter.platform).toBe("node");
    });
  });

  describe("userAddress", () => {
    it("should return user address from the getter", () => {
      // The userAddress is extracted from the wallet client account
      const address = vanaCore.userAddress;

      expect(address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    });
  });

  describe("getConfig", () => {
    it("should return runtime configuration", () => {
      const config = vanaCore.getConfig();

      expect(config).toMatchObject({
        chainId: 14800,
        chainName: "Moksha Testnet",
        storageProviders: [],
      });
    });

    it("should include storage providers when configured", () => {
      // Create a new instance with storage config
      const configWithStorage: VanaConfig = {
        ...mockConfig,
        storage: {
          providers: {
            ipfs: {
              upload: vi.fn(),
              download: vi.fn(),
              list: vi.fn(),
              delete: vi.fn(),
              getConfig: vi
                .fn()
                .mockReturnValue({ gatewayUrl: "https://ipfs.io" }),
            },
          },
        },
      };

      const vanaWithStorage = new VanaCore(
        mockPlatformAdapter,
        configWithStorage,
      );
      const config = vanaWithStorage.getConfig();

      expect(config.storageProviders).toEqual(["ipfs"]);
    });
  });

  describe("encryptBlob", () => {
    it("should encrypt string data using platform adapter", async () => {
      const data = "test data";
      const key = "encryption-key";

      const result = await vanaCore.encryptBlob(data, key);

      expect(result).toBeInstanceOf(Blob);
    });

    it("should encrypt Blob data using platform adapter", async () => {
      const data = new Blob(["test data"], { type: "text/plain" });
      const key = "encryption-key";

      const result = await vanaCore.encryptBlob(data, key);

      expect(result).toBeInstanceOf(Blob);
    });
  });

  describe("decryptBlob", () => {
    it("should decrypt string data using platform adapter", async () => {
      const encryptedData = "encrypted-data";
      const walletSignature = "wallet-signature";

      const result = await vanaCore.decryptBlob(encryptedData, walletSignature);

      expect(result).toBeInstanceOf(Blob);
    });

    it("should decrypt Blob data using platform adapter", async () => {
      const encryptedData = new Blob(["encrypted"], {
        type: "application/octet-stream",
      });
      const walletSignature = "wallet-signature";

      const result = await vanaCore.decryptBlob(encryptedData, walletSignature);

      expect(result).toBeInstanceOf(Blob);
    });
  });

  describe("chainId getter", () => {
    it("should return chain ID from protocol controller", () => {
      expect(vanaCore.chainId).toBe(14800);
    });
  });

  describe("chainName getter", () => {
    it("should return chain name from protocol controller", () => {
      expect(vanaCore.chainName).toBe("Moksha Testnet");
    });
  });
});

describe("VanaCoreFactory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("should create VanaCore instance with config", () => {
      const config: VanaConfig = {
        chainId: 14800,
        account: testAccount,
      };

      const vana = VanaCoreFactory.create(mockPlatformAdapter, config);

      expect(vana).toBeInstanceOf(VanaCore);
      expect(vana.getConfig().chainId).toBe(14800);
    });

    it("should create VanaCore with wallet client config", () => {
      const mockWalletClient = createTypedMockWalletClient({
        chain: {
          id: 14800 as const,
          name: "Moksha Testnet",
          nativeCurrency: {
            name: "VANA",
            symbol: "VANA",
            decimals: 18,
          },
          rpcUrls: {
            default: {
              http: ["https://rpc.moksha.vana.org"],
            },
          },
        } as VanaChain,
      });

      const config: WalletConfig = {
        walletClient: mockWalletClient as WalletConfig["walletClient"],
      };

      const vana = VanaCoreFactory.create(mockPlatformAdapter, config);

      expect(vana).toBeInstanceOf(VanaCore);
      expect(vana.chainId).toBe(14800);
    });
  });

  describe("createWithStorage", () => {
    it("should create VanaCore with storage requirements", () => {
      const mockStorageProvider = {
        upload: vi.fn(),
        download: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        getConfig: vi.fn(),
      };

      const config: VanaConfigWithStorage = {
        chainId: 14800,
        account: testAccount,
        storage: {
          providers: {
            ipfs: mockStorageProvider,
          },
          defaultProvider: "ipfs",
        },
      };

      const vana = VanaCoreFactory.createWithStorage(
        mockPlatformAdapter,
        config,
      );

      expect(vana).toBeInstanceOf(VanaCore);
      expect(vana.hasStorage()).toBe(true);
      expect(vana.isStorageEnabled()).toBe(true);
    });

    it("should create VanaCore with multiple storage providers", () => {
      const mockIpfsProvider = {
        upload: vi.fn(),
        download: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        getConfig: vi.fn(),
      };

      const mockArweaveProvider = {
        upload: vi.fn(),
        download: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
        getConfig: vi.fn(),
      };

      const config: VanaConfigWithStorage = {
        walletClient: createTypedMockWalletClient({
          signTypedData: vi.fn(),
          chain: {
            id: 14800,
            name: "Moksha Testnet",
            nativeCurrency: { name: "VANA", symbol: "VANA", decimals: 18 },
            rpcUrls: {
              default: {
                http: ["https://rpc.moksha.vana.org"],
              },
              public: {
                http: ["https://rpc.moksha.vana.org"],
              },
            },
            blockExplorers: {
              default: {
                name: "Explorer",
                url: "https://explorer.moksha.vana.org",
              },
            },
          },
        }) as WalletClient & { chain: VanaChain }, // VanaChain requires specific chain id type
        storage: {
          providers: {
            ipfs: mockIpfsProvider,
            arweave: mockArweaveProvider,
          },
          defaultProvider: "arweave",
        },
      };

      const vana = VanaCoreFactory.createWithStorage(
        mockPlatformAdapter,
        config,
      );

      expect(vana).toBeInstanceOf(VanaCore);
      expect(vana.getConfig().storageProviders).toEqual(["ipfs", "arweave"]);
      expect(vana.getConfig().defaultStorageProvider).toBe("arweave");
    });
  });
});
