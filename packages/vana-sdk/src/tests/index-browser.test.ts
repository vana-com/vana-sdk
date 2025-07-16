import { describe, it, expect, vi, beforeEach } from "vitest";
import { VanaBrowser } from "../index.browser";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";
import type { VanaChain, VanaConfig } from "../types";

// Mock browser platform adapter
vi.mock("../platform/browser", () => ({
  BrowserPlatformAdapter: vi.fn().mockImplementation(() => ({
    generateRandomBytes: vi.fn().mockReturnValue(new Uint8Array(32)),
    generateKeyPair: vi.fn().mockResolvedValue({
      publicKey: "mock-public-key",
      privateKey: "mock-private-key",
    }),
    encryptWithPublicKey: vi.fn().mockResolvedValue("encrypted-data"),
    decryptWithPrivateKey: vi.fn().mockResolvedValue("decrypted-data"),
    hashData: vi.fn().mockReturnValue("hashed-data"),
    signData: vi.fn().mockResolvedValue("signature"),
    verifySignature: vi.fn().mockResolvedValue(true),
    isAvailable: vi.fn().mockReturnValue(true),
  })),
}));

// Mock controllers
vi.mock("../controllers/permissions", () => ({
  PermissionsController: vi.fn().mockImplementation(() => ({})),
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

describe("Browser Index Entry Point", () => {
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

  it("should export Vana class", () => {
    expect(VanaBrowser).toBeDefined();
    expect(typeof VanaBrowser).toBe("function");
  });

  describe("Async new VanaBrowser() factory method", () => {
    it("should create Vana instance with wallet client config", async () => {
      const vana = new VanaBrowser({
        walletClient: validWalletClient,
      });

      expect(vana).toBeInstanceOf(VanaBrowser);
      expect(vana.permissions).toBeDefined();
      expect(vana.data).toBeDefined();
      expect(vana.server).toBeDefined();
      expect(vana.protocol).toBeDefined();
    });

    it("should create instance from chain config", async () => {
      const vana = new VanaBrowser({
        chainId: 14800,
        account: testAccount,
      });

      expect(vana).toBeInstanceOf(VanaBrowser);
      expect(vana.permissions).toBeDefined();
      expect(vana.data).toBeDefined();
      expect(vana.server).toBeDefined();
      expect(vana.protocol).toBeDefined();
    });

    it("should create instance with full configuration", async () => {
      const vana = new VanaBrowser({
        walletClient: validWalletClient,
        relayerCallbacks: {
          submitPermissionGrant: async (_typedData, _signature) => "0xtxhash",
          submitPermissionRevoke: async (_typedData, _signature) => "0xtxhash",
        },
      });

      expect(vana).toBeInstanceOf(VanaBrowser);
      expect(vana.getConfig().relayerCallbacks).toBeDefined();
    });

    it("should throw error for invalid configuration", () => {
      expect(() => new VanaBrowser({} as VanaConfig)).toThrow();
    });
  });


  it("should have default export", async () => {
    const module = await import("../index.browser");
    expect(module.default).toBe(VanaBrowser);
  });

  it("should re-export all main utilities", async () => {
    const module = await import("../index.browser");

    // Check for key exports
    expect(module.PermissionsController).toBeDefined();
    expect(module.DataController).toBeDefined();
    expect(module.ServerController).toBeDefined();
    expect(module.ProtocolController).toBeDefined();
    expect(module.generateEncryptionKey).toBeDefined();
    expect(module.encryptUserData).toBeDefined();
    expect(module.decryptUserData).toBeDefined();
    expect(module.mokshaTestnet).toBeDefined();
    expect(module.vanaMainnet).toBeDefined();
  });
});
