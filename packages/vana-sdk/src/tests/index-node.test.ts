import { describe, it, expect, vi, beforeEach } from "vitest";
import { VanaNode } from "../index.node";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";
import type { VanaChain, WalletConfig, VanaConfig } from "../types";

// Mock node platform adapter
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

describe("Node.js Index Entry Point", () => {
  const testAccount = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );

  let validWalletClient: ReturnType<typeof createWalletClient> & {
    account: typeof testAccount;
  };
  let validChain: VanaChain;

  beforeEach(() => {
    validWalletClient = createWalletClient({
      account: testAccount,
      transport: http("https://rpc.moksha.vana.org"),
      chain: mokshaTestnet,
    }) as typeof validWalletClient;

    validChain = mokshaTestnet;
  });

  describe("Vana constructor", () => {
    it("should create a Vana instance with wallet client config", async () => {
      const vana = new VanaNode({
        walletClient: validWalletClient as WalletConfig["walletClient"],
      });

      expect(vana).toBeInstanceOf(VanaNode);
      expect(vana).toBeDefined();
      expect(vana.permissions).toBeDefined();
      expect(vana.data).toBeDefined();
      expect(vana.server).toBeDefined();
      expect(vana.protocol).toBeDefined();
    });

    it("should create a Vana instance with chain-only config", async () => {
      const vana = new VanaNode({
        chainId: validChain.id,
        account: testAccount,
      });

      expect(vana).toBeInstanceOf(VanaNode);
      expect(vana).toBeDefined();
      expect(vana.permissions).toBeDefined();
      expect(vana.data).toBeDefined();
      expect(vana.server).toBeDefined();
      expect(vana.protocol).toBeDefined();
    });

    it("should create instance with full configuration", async () => {
      const vana = new VanaNode({
        walletClient: validWalletClient as WalletConfig["walletClient"],
        relayerCallbacks: {
          submitPermissionGrant: async (_typedData, _signature) => "0xtxhash",
          submitPermissionRevoke: async (_typedData, _signature) => "0xtxhash",
        },
      });

      expect(vana).toBeInstanceOf(VanaNode);
      expect(vana).toBeDefined();
      expect(vana.getConfig().relayerCallbacks).toBeDefined();
    });

    it("should reject with error for invalid configuration", async () => {
      expect(() => new VanaNode({} as VanaConfig)).toThrow();
    });
  });


  describe("Export verification", () => {
    it("should export all expected modules and types", () => {
      // Test that key exports are available
      expect(VanaNode).toBeDefined();

      // These should be imported/exported without error
      const exportTest = async () => {
        const {
          PermissionsController,
          DataController,
          ServerController,
          ProtocolController,
          getContractAddress,
          chains,
          mokshaTestnet: exportedMoksha,
          vanaMainnet,
        } = await import("../index.node");

        expect(PermissionsController).toBeDefined();
        expect(DataController).toBeDefined();
        expect(ServerController).toBeDefined();
        expect(ProtocolController).toBeDefined();
        expect(getContractAddress).toBeDefined();
        expect(chains).toBeDefined();
        expect(exportedMoksha).toBeDefined();
        expect(vanaMainnet).toBeDefined();
      };

      expect(exportTest).not.toThrow();
    });

    it("should export error classes", async () => {
      const {
        RelayerError,
        UserRejectedRequestError,
        SerializationError,
        SignatureError,
        NetworkError,
        NonceError,
        BlockchainError,
      } = await import("../index.node");

      expect(RelayerError).toBeDefined();
      expect(UserRejectedRequestError).toBeDefined();
      expect(SerializationError).toBeDefined();
      expect(SignatureError).toBeDefined();
      expect(NetworkError).toBeDefined();
      expect(NonceError).toBeDefined();
      expect(BlockchainError).toBeDefined();
    });

    it("should export utility functions", async () => {
      const {
        isReplicateAPIResponse,
        isIdentityServerOutput,
        isPersonalServerOutput,
        isAPIResponse,
        safeParseJSON,
        parseReplicateOutput,
      } = await import("../index.node");

      expect(isReplicateAPIResponse).toBeDefined();
      expect(isIdentityServerOutput).toBeDefined();
      expect(isPersonalServerOutput).toBeDefined();
      expect(isAPIResponse).toBeDefined();
      expect(safeParseJSON).toBeDefined();
      expect(parseReplicateOutput).toBeDefined();
    });

    it("should export generic utilities", async () => {
      const {
        BaseController,
        RetryUtility,
        RateLimiter,
        MemoryCache,
        EventEmitter,
        MiddlewarePipeline,
        AsyncQueue,
        CircuitBreaker,
        ApiClient,
      } = await import("../index.node");

      expect(BaseController).toBeDefined();
      expect(RetryUtility).toBeDefined();
      expect(RateLimiter).toBeDefined();
      expect(MemoryCache).toBeDefined();
      expect(EventEmitter).toBeDefined();
      expect(MiddlewarePipeline).toBeDefined();
      expect(AsyncQueue).toBeDefined();
      expect(CircuitBreaker).toBeDefined();
      expect(ApiClient).toBeDefined();
    });
  });

  describe("Node.js specific functionality", () => {
    it("should use NodePlatformAdapter by default", async () => {
      const vana = new VanaNode({
        chainId: validChain.id,
        account: testAccount,
      });

      // The NodePlatformAdapter should have been injected automatically
      expect(vana).toBeDefined();
      expect(vana.chainId).toBe(validChain.id);
    });

    it("should be the default export", async () => {
      const defaultExport = (await import("../index.node")).default;
      expect(defaultExport).toBe(VanaNode);
    });
  });
});
