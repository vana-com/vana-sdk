import { describe, it, expect, vi, beforeEach } from "vitest";
import { VanaCore } from "../core";
import type {
  UnifiedRelayerRequest,
  UnifiedRelayerResponse,
} from "../types/relayer";
import { createMockPlatformAdapter } from "./mocks/platformAdapter";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";

describe("Unified Relayer Pattern", () => {
  const testAccount = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );

  let validWalletClient: ReturnType<typeof createWalletClient>;
  let mockPlatformAdapter: ReturnType<typeof createMockPlatformAdapter>;

  beforeEach(() => {
    vi.clearAllMocks();

    validWalletClient = createWalletClient({
      account: testAccount,
      chain: mokshaTestnet,
      transport: http("https://rpc.moksha.vana.org"),
    });

    mockPlatformAdapter = createMockPlatformAdapter();
  });

  describe("RelayerConfig", () => {
    it("should accept URL string for relayer configuration", () => {
      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        relayer: "/api/relay",
      });

      const config = vana.getConfig();
      expect(config.relayerConfig).toBe("/api/relay");
    });

    it("should accept callback function for relayer configuration", () => {
      const relayerCallback = vi.fn() as any;

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        relayer: relayerCallback,
      });

      const config = vana.getConfig();
      expect(config.relayerConfig).toBe(relayerCallback);
    });

    it("should work without relayer configuration", () => {
      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
      });

      const config = vana.getConfig();
      expect(config.relayerConfig).toBeUndefined();
    });
  });

  describe("URL String Relayer", () => {
    it("should create HTTP transport when URL string is provided", async () => {
      // Mock fetch
      const mockResponse = {
        type: "signed",
        hash: "0xmockhash",
      } as UnifiedRelayerResponse;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        relayer: "/api/relay",
      });

      // Access internal relayer callback through permissions controller context
      const context = (vana.permissions as any).context;
      expect(context.relayer).toBeDefined();

      // Test the callback
      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {} as any,
        signature: "0xsignature" as any,
      };

      const response = await context.relayer(request);

      expect(global.fetch).toHaveBeenCalledWith("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      expect(response).toEqual(mockResponse);
    });

    it("should handle HTTP errors when using URL string", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Internal Server Error",
      });

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        relayer: "/api/relay",
      });

      const context = (vana.permissions as any).context;
      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {} as any,
        signature: "0xsignature" as any,
      };

      await expect(context.relayer(request)).rejects.toThrow(
        "Relayer request failed: Internal Server Error",
      );
    });
  });

  describe("Callback Function Relayer", () => {
    it("should use provided callback directly", async () => {
      const mockResponse: UnifiedRelayerResponse = {
        type: "signed",
        hash: "0xcallbackhash" as any,
      };

      const relayerCallback = vi.fn().mockResolvedValue(mockResponse);

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        relayer: relayerCallback,
      });

      const context = (vana.permissions as any).context;
      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {} as any,
        signature: "0xsignature" as any,
      };

      const response = await context.relayer(request);

      expect(relayerCallback).toHaveBeenCalledWith(request);
      expect(response).toEqual(mockResponse);
    });

    it("should handle callback errors", async () => {
      const relayerCallback = vi
        .fn()
        .mockRejectedValue(new Error("Custom relayer error"));

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        relayer: relayerCallback,
      });

      const context = (vana.permissions as any).context;
      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {} as any,
        signature: "0xsignature" as any,
      };

      await expect(context.relayer(request)).rejects.toThrow(
        "Custom relayer error",
      );
    });
  });

  describe("Direct Relayer Requests", () => {
    it("should handle storeGrantFile requests", async () => {
      const mockResponse: UnifiedRelayerResponse = {
        type: "direct",
        result: { url: "ipfs://mockhash" },
      };

      const relayerCallback = vi.fn().mockResolvedValue(mockResponse);

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        relayer: relayerCallback,
      });

      const context = (vana.permissions as any).context;
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "storeGrantFile",
        params: {
          grantee: "0xgrantee" as any,
          operation: "read",
          parameters: { fileId: 123 },
        },
      };

      const response = await context.relayer(request);

      expect(relayerCallback).toHaveBeenCalledWith(request);
      expect(response).toEqual(mockResponse);
    });

    it("should handle file addition requests", async () => {
      const mockResponse: UnifiedRelayerResponse = {
        type: "direct",
        result: { fileId: 456, transactionHash: "0xtxhash" as any },
      };

      const relayerCallback = vi.fn().mockResolvedValue(mockResponse);

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        relayer: relayerCallback,
      });

      const context = (vana.permissions as any).context;
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as any,
        },
      };

      const response = await context.relayer(request);

      expect(relayerCallback).toHaveBeenCalledWith(request);
      expect(response).toEqual(mockResponse);
    });
  });

  describe("Error Handling", () => {
    it("should handle error responses", async () => {
      const errorResponse: UnifiedRelayerResponse = {
        type: "error",
        error: "Invalid signature",
      };

      const relayerCallback = vi.fn().mockResolvedValue(errorResponse);

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        relayer: relayerCallback,
      });

      const context = (vana.permissions as any).context;
      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {} as any,
        signature: "0xbadsignature" as any,
      };

      const response = await context.relayer(request);

      expect(response).toEqual(errorResponse);
    });

    it("should handle network timeouts", async () => {
      const relayerCallback = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error("Network timeout"));
            }, 100);
          }),
      );

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        relayer: relayerCallback,
      });

      const context = (vana.permissions as any).context;
      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {} as any,
        signature: "0xsignature" as any,
      };

      await expect(context.relayer(request)).rejects.toThrow("Network timeout");
    });
  });

  describe("Type Safety", () => {
    it("should enforce correct request types for signed operations", () => {
      const signedRequest: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {} as any,
        signature: "0xsignature" as any,
        expectedUserAddress: "0xuser" as any, // Optional field
      };

      expect(signedRequest.type).toBe("signed");
      expect(signedRequest.operation).toBe("submitAddPermission");
    });

    it("should enforce correct request types for direct operations", () => {
      const directRequest: UnifiedRelayerRequest = {
        type: "direct",
        operation: "storeGrantFile",
        params: {
          grantee: "0xgrantee" as any,
          operation: "read",
          parameters: { fileId: 123 },
        },
      };

      expect(directRequest.type).toBe("direct");
      expect(directRequest.operation).toBe("storeGrantFile");
    });

    it("should enforce correct response types", () => {
      const signedResponse: UnifiedRelayerResponse = {
        type: "signed",
        hash: "0xhash" as any,
      };

      const directResponse: UnifiedRelayerResponse = {
        type: "direct",
        result: { url: "ipfs://hash" },
      };

      const errorResponse: UnifiedRelayerResponse = {
        type: "error",
        error: "Something went wrong",
      };

      expect(signedResponse.type).toBe("signed");
      expect(directResponse.type).toBe("direct");
      expect(errorResponse.type).toBe("error");
    });
  });

  describe("Integration with Controllers", () => {
    it("should make relayer available to all controllers", () => {
      const relayerCallback = vi.fn();

      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        relayer: relayerCallback,
      });

      // Check that relayer is available in controller contexts
      const permissionsContext = (vana.permissions as any).context;
      const dataContext = (vana.data as any).context;
      const schemasContext = (vana.schemas as any).context;
      const serverContext = (vana.server as any).context;

      expect(permissionsContext.relayer).toBeDefined();
      expect(dataContext.relayer).toBeDefined();
      expect(schemasContext.relayer).toBeDefined();
      expect(serverContext.relayer).toBeDefined();

      // They should all be the same function
      expect(permissionsContext.relayer).toBe(dataContext.relayer);
      expect(dataContext.relayer).toBe(schemasContext.relayer);
      expect(schemasContext.relayer).toBe(serverContext.relayer);
    });

    it("should work without relayer in controllers", () => {
      const vana = new VanaCore(mockPlatformAdapter, {
        walletClient: validWalletClient,
        // No relayer configured
      });

      const context = (vana.permissions as any).context;
      expect(context.relayer).toBeUndefined();
    });
  });
});
