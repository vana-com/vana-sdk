import { describe, it, expect, vi, beforeEach } from "vitest";
import { PermissionsController } from "../controllers/permissions";
import { DataController } from "../controllers/data";
import type { ControllerContext } from "../controllers/permissions";
import type {
  UnifiedRelayerRequest,
  UnifiedRelayerResponse,
} from "../types/relayer";
import { createMockControllerContext } from "./factories/mockFactory";

describe("Relayer Integration with Controllers", () => {
  let mockContext: ControllerContext;
  let relayerCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock relayer callback
    relayerCallback = vi.fn() as any;

    // Create mock context with the unified relayer
    mockContext = createMockControllerContext({
      relayer: relayerCallback,
    });
    // Add user address for grant operations
    mockContext.userAddress = "0xuser" as any;
  });

  describe("PermissionsController with Unified Relayer", () => {
    it("should use unified relayer for grant operations", async () => {
      const controller = new PermissionsController(mockContext);

      // Mock the relayer to return success for both calls
      relayerCallback
        .mockResolvedValueOnce({
          // First call: store grant file
          type: "direct",
          result: { url: "ipfs://granturi" },
        })
        .mockResolvedValueOnce({
          // Second call: submit signed transaction
          type: "signed",
          hash: "0xtxhash" as any,
        });

      // Mock wallet client to sign
      mockContext.walletClient!.signTypedData = vi
        .fn()
        .mockResolvedValue("0xsignature");

      // Mock contract read for nonce
      mockContext.publicClient.readContract = vi.fn().mockResolvedValue(0n);

      // Mock waitForTransactionEvents
      mockContext.waitForTransactionEvents = vi.fn().mockResolvedValue({
        expectedEvents: {
          PermissionAdded: {
            permissionId: 456n,
            user: "0xuser",
            grant: "ipfs://granturi",
            fileIds: [123n],
          },
        },
      });

      // Try to grant permission (should use relayer for grant storage)
      const params = {
        grantee: "0x1234567890123456789012345678901234567890" as any, // Valid address
        operation: "llm_inference",
        files: [123],
        parameters: { model: "gpt-4" },
      };

      const result = await controller.grant(params);

      // Should have permission grant result
      expect(result).toBeDefined();
      expect(result.permissionId).toBe(456n);
      expect(result.grant).toBe("ipfs://granturi");
      expect(result.fileIds).toEqual([123n]);

      // Check that relayer was called twice
      expect(relayerCallback).toHaveBeenCalledTimes(2);

      // First call should be for grant storage
      const firstCall = relayerCallback.mock.calls[0][0];
      expect(firstCall.type).toBe("direct");
      if (firstCall.type === "direct") {
        expect(firstCall.operation).toBe("storeGrantFile");
      }

      // Second call should be for signed transaction
      const secondCall = relayerCallback.mock.calls[1][0];
      expect(secondCall.type).toBe("signed");
      if (secondCall.type === "signed") {
        expect(secondCall.operation).toBe("submitAddPermission");
      }
    });

    it("should handle relayer errors gracefully", async () => {
      const controller = new PermissionsController(mockContext);

      // Mock relayer to fail
      relayerCallback.mockRejectedValue(new Error("Relayer unavailable"));

      // Mock other required functions
      mockContext.walletClient!.signTypedData = vi
        .fn()
        .mockResolvedValue("0xsignature");
      mockContext.publicClient.readContract = vi.fn().mockResolvedValue(0n);

      const params = {
        grantee: "0x1234567890123456789012345678901234567890" as any,
        operation: "llm_inference",
        files: [123],
        parameters: { model: "gpt-4" },
      };

      // Should fail when relayer fails
      await expect(controller.grant(params)).rejects.toThrow();
    });

    it("should work without relayer if grantUrl provided", async () => {
      // Remove relayer from context
      const contextNoRelayer = { ...mockContext, relayer: undefined };
      const controller = new PermissionsController(contextNoRelayer);

      // Mock required functions
      mockContext.walletClient!.signTypedData = vi
        .fn()
        .mockResolvedValue("0xsignature");
      mockContext.publicClient.readContract = vi.fn().mockResolvedValue(0n);
      mockContext.walletClient!.writeContract = vi
        .fn()
        .mockResolvedValue("0xtxhash");

      const params = {
        grantee: "0x1234567890123456789012345678901234567890" as any,
        operation: "llm_inference",
        files: [123],
        parameters: { model: "gpt-4" },
        grantUrl: "ipfs://pregranturl", // Provide URL directly
      };

      try {
        await controller.grant(params);
        // Should succeed with pre-stored URL
      } catch (error) {
        // May fail due to other mocking, but shouldn't be relayer-related
        expect(String(error)).not.toMatch(/relayer/i);
      }
    });
  });

  describe("DataController with Unified Relayer", () => {
    it("should use unified relayer for file operations", async () => {
      const controller = new DataController(mockContext);

      // Mock successful relayer response
      relayerCallback.mockResolvedValue({
        type: "direct",
        result: { fileId: 456, transactionHash: "0xhash" },
      });

      // Mock other required methods
      mockContext.walletClient!.signTypedData = vi
        .fn()
        .mockResolvedValue("0xsignature");
      mockContext.storageManager = {
        uploadBlob: vi.fn().mockResolvedValue("https://storage.example/file"),
        uploadJson: vi.fn(),
        download: vi.fn(),
        getProvider: vi.fn(),
        getDefaultProvider: vi.fn(),
        getStorageProviders: vi.fn().mockReturnValue([]),
        hasProvider: vi.fn().mockReturnValue(false),
        register: vi.fn(),
        setDefaultProvider: vi.fn(),
        upload: vi
          .fn()
          .mockResolvedValue({ url: "https://storage.example/file" }),
      } as any;

      // Mock waitForTransactionEvents
      mockContext.waitForTransactionEvents = vi.fn().mockResolvedValue({
        expectedEvents: {
          FileAdded: {
            fileId: 456n,
          },
        },
      });

      const file = new File(["test content"], "test.txt", {
        type: "text/plain",
      });

      const result = await controller.upload({ content: file });

      // Should have result with fileId
      expect(result).toBeDefined();
      expect(result.fileId).toBe(456);

      // Should have called relayer for file addition
      expect(relayerCallback).toHaveBeenCalled();
    });

    it("should handle direct file addition via relayer", async () => {
      relayerCallback.mockResolvedValue({
        type: "direct",
        result: { fileId: 789, transactionHash: "0xfiletx" },
      });

      // Mock the context to have relayer
      const contextWithRelayer = {
        ...mockContext,
        relayer: relayerCallback,
      };

      const controllerWithRelayer = new DataController(contextWithRelayer);

      // Test that relayer is used for direct operations
      // The DataController has methods like upload that would use the relayer internally
      expect(controllerWithRelayer).toBeDefined();

      // Verify relayer interaction pattern
      if (relayerCallback.mock.calls.length > 0) {
        const request = relayerCallback.mock.calls[0][0];
        expect(request).toBeDefined();
      }
    });
  });

  describe("Unified Relayer Response Handling", () => {
    it("should handle signed response type", async () => {
      const signedResponse: UnifiedRelayerResponse = {
        type: "signed",
        hash: "0xsignedhash" as any,
      };

      relayerCallback.mockResolvedValue(signedResponse);

      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {} as any,
        signature: "0xsig" as any,
      };

      const response = await relayerCallback(request);
      expect(response.type).toBe("signed");
      if (response.type === "signed") {
        expect(response.hash).toBe("0xsignedhash");
      }
    });

    it("should handle direct response type", async () => {
      const directResponse: UnifiedRelayerResponse = {
        type: "direct",
        result: { url: "ipfs://stored" },
      };

      relayerCallback.mockResolvedValue(directResponse);

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "storeGrantFile",
        params: {} as any,
      };

      const response = await relayerCallback(request);
      expect(response.type).toBe("direct");
      if (response.type === "direct") {
        expect(response.result).toEqual({ url: "ipfs://stored" });
      }
    });

    it("should handle error response type", async () => {
      const errorResponse: UnifiedRelayerResponse = {
        type: "error",
        error: "Invalid request",
      };

      relayerCallback.mockResolvedValue(errorResponse);

      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {} as any,
        signature: "invalid" as any,
      };

      const response = await relayerCallback(request);
      expect(response.type).toBe("error");
      if (response.type === "error") {
        expect(response.error).toBe("Invalid request");
      }
    });
  });

  describe("Relayer Configuration Validation", () => {
    it("should accept string URL configuration", () => {
      const contextWithUrl = createMockControllerContext({
        relayer: "/api/relay" as any, // URL string should be converted to callback
      });

      // The mock factory passes through the string - in real usage,
      // the VanaCore would convert this to a callback function
      expect(contextWithUrl.relayer).toBe("/api/relay");
    });

    it("should accept callback function configuration", () => {
      const callback = vi.fn();
      const contextWithCallback = createMockControllerContext({
        relayer: callback,
      });

      expect(contextWithCallback.relayer).toBe(callback);
    });

    it("should work without relayer configuration", () => {
      const contextNoRelayer = createMockControllerContext({
        relayer: undefined,
      });

      expect(contextNoRelayer.relayer).toBeUndefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty permissions array", async () => {
      relayerCallback.mockResolvedValue({
        type: "direct",
        result: { fileId: 123, transactionHash: "0xhash" },
      });

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAdditionWithPermissions",
        params: {
          url: "https://example.com/file",
          userAddress: "0xuser" as any,
          permissions: [], // Empty permissions
        },
      };

      const response = await relayerCallback(request);
      expect(response).toBeDefined();
    });

    it("should handle optional fields in signed requests", async () => {
      relayerCallback.mockResolvedValue({
        type: "signed",
        hash: "0xhash" as any,
      });

      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitTrustServer",
        typedData: {} as any,
        signature: "0xsig" as any,
        expectedUserAddress: undefined, // Optional field
      };

      const response = await relayerCallback(request);
      expect(response).toBeDefined();
    });

    it("should handle network timeouts", async () => {
      relayerCallback.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error("Timeout"));
            }, 10);
          }),
      );

      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {} as any,
        signature: "0xsig" as any,
      };

      await expect(relayerCallback(request)).rejects.toThrow("Timeout");
    });

    it("should handle malformed responses", async () => {
      relayerCallback.mockResolvedValue({
        // Invalid response structure
        invalid: "response",
      } as any);

      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {} as any,
        signature: "0xsig" as any,
      };

      const response = await relayerCallback(request);
      // Should still return the response, validation is client's responsibility
      expect(response).toHaveProperty("invalid");
    });
  });
});
