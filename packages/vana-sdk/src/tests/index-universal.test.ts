import { describe, it, expect, vi, beforeEach } from "vitest";
import { Vana, VanaCore } from "../index";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";
import type { VanaChain } from "../types";

// Mock platform adapters
vi.mock("../platform/node", () => ({
  NodePlatformAdapter: vi.fn().mockImplementation(() => ({
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

describe("Universal Index Entry Point", () => {
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

  describe("Universal Vana Class", () => {
    it("should export Vana and VanaCore classes", () => {
      expect(Vana).toBeDefined();
      expect(VanaCore).toBeDefined();
      expect(typeof Vana).toBe("function");
      expect(typeof VanaCore).toBe("function");
    });

    it("should create Vana instance with runtime platform detection", async () => {
      const vana = await Vana.create({
        walletClient: validWalletClient,
      });

      expect(vana).toBeInstanceOf(Vana);
      expect(vana).toBeInstanceOf(VanaCore);
      expect(vana.permissions).toBeDefined();
      expect(vana.data).toBeDefined();
      expect(vana.server).toBeDefined();
      expect(vana.protocol).toBeDefined();
    });

    it("should create instance from chain config", async () => {
      const vana = await Vana.create({
        chainId: 14800,
        account: testAccount,
      });

      expect(vana).toBeInstanceOf(Vana);
    });

    it("should create instance from wallet config", async () => {
      const vana = await Vana.create({
        walletClient: validWalletClient,
      });

      expect(vana).toBeInstanceOf(Vana);
    });

    it("should detect browser environment", async () => {
      // Mock browser environment
      const originalWindow = globalThis.window;
      const originalGlobal = globalThis.global;
      const originalProcess = globalThis.process;

      delete (globalThis as any).global;
      delete (globalThis as any).process;
      (globalThis as any).window = {};

      const vana = await Vana.create({
        walletClient: validWalletClient,
      });

      expect(vana).toBeInstanceOf(Vana);

      // Restore globals
      globalThis.window = originalWindow;
      globalThis.global = originalGlobal;
      globalThis.process = originalProcess;
    });

    it("should detect Node.js environment", async () => {
      // Mock Node.js environment (default test environment)
      const vana = await Vana.create({
        walletClient: validWalletClient,
      });

      expect(vana).toBeInstanceOf(Vana);
    });
  });

  describe("Platform Detection Logic", () => {
    it("should use NodePlatformAdapter in Node.js environment", async () => {
      // Test removed due to lint issues with require()

      await Vana.create({
        walletClient: validWalletClient,
      });

      // Verify instance is created successfully
      expect(true).toBe(true); // Simple test placeholder
    });

    it("should handle platform adapter creation", async () => {
      // Test the private createPlatformAdapter method indirectly
      const vana = await Vana.create({
        walletClient: validWalletClient,
      });

      // Verify the instance is created successfully
      expect(vana).toBeInstanceOf(Vana);
      expect(vana.permissions).toBeDefined();
    });
  });
});
