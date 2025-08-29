import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRelayerOperation } from "../server/relayerHandler";
import type { VanaInstance } from "../index.node";
import type { UnifiedRelayerRequest } from "../types/relayer";
import type { Address } from "viem";

// Mock the existing handler module
vi.mock("../server/handler", () => ({
  handleRelayerRequest: vi.fn().mockResolvedValue({
    hash: "0xsignedhash",
  }),
}));

function createMockSdk(): VanaInstance {
  const baseMock = {
    data: {
      addFileWithPermissions: vi.fn().mockResolvedValue({
        hash: "0xfilehash" as `0x${string}`,
      }),
      addFileWithPermissionsAndSchema: vi.fn().mockResolvedValue({
        hash: "0xfilehash" as `0x${string}`,
      }),
      upload: vi.fn().mockResolvedValue({
        url: "ipfs://mockhash",
      }),
    },
    waitForTransactionEvents: vi.fn().mockResolvedValue({
      expectedEvents: {
        FileAdded: {
          fileId: 789n,
        },
      },
    }),
  };

  // Return a mock that satisfies the VanaInstance interface
  return baseMock as unknown as VanaInstance;
}

describe("Server Relayer Handler", () => {
  let mockSdk: VanaInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSdk = createMockSdk();
  });

  describe("Signed Operations", () => {
    it("should handle signed operations correctly", async () => {
      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {
          domain: {
            name: "DataPortabilityPermissions",
            version: "1",
            chainId: 14800,
            verifyingContract:
              "0x1234567890123456789012345678901234567890" as `0x${string}`,
          },
          types: {
            Permission: [
              { name: "nonce", type: "uint256" },
              { name: "granteeId", type: "uint256" },
            ],
          },
          primaryType: "Permission",
          message: {},
        },
        signature: "0xsignature" as `0x${string}`,
      };

      const response = await handleRelayerOperation(mockSdk, request);

      expect(response).toEqual({
        type: "signed",
        hash: "0xsignedhash",
      });
    });

    it("should pass expectedUserAddress for signed operations", async () => {
      const { handleRelayerRequest } = await import("../server/handler");

      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitPermissionRevoke",
        typedData: {
          domain: {
            name: "DataPortabilityPermissions",
            version: "1",
            chainId: 14800,
            verifyingContract:
              "0x1234567890123456789012345678901234567890" as `0x${string}`,
          },
          types: {
            Permission: [
              { name: "nonce", type: "uint256" },
              { name: "granteeId", type: "uint256" },
            ],
          },
          primaryType: "Permission",
          message: {},
        },
        signature: "0xsignature" as `0x${string}`,
        expectedUserAddress: "0xuser" as Address,
      };

      await handleRelayerOperation(mockSdk, request);

      expect(handleRelayerRequest).toHaveBeenCalledWith(mockSdk, {
        typedData: request.typedData,
        signature: request.signature,
        expectedUserAddress: request.expectedUserAddress,
      });
    });

    it("should handle all signed operation types", async () => {
      const operationTypes = [
        "submitAddPermission",
        "submitPermissionRevoke",
        "submitTrustServer",
        "submitAddAndTrustServer",
        "submitUntrustServer",
        "submitAddServerFilesAndPermissions",
        "submitRegisterGrantee",
      ] as const;

      for (const operation of operationTypes) {
        const request: UnifiedRelayerRequest = {
          type: "signed",
          operation,
          typedData: {
            domain: {
              name: "DataPortabilityPermissions",
              version: "1",
              chainId: 14800,
              verifyingContract:
                "0x1234567890123456789012345678901234567890" as `0x${string}`,
            },
            types: {
              Permission: [{ name: "nonce", type: "uint256" }],
            },
            primaryType: "Permission",
            message: {},
          },
          signature: "0xsignature" as `0x${string}`,
        };

        const response = await handleRelayerOperation(mockSdk, request);

        expect(response).toEqual({
          type: "signed",
          hash: "0xsignedhash",
        });
      }
    });
  });

  describe("Direct Operations - File Addition", () => {
    it("should handle submitFileAddition", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      const response = await handleRelayerOperation(mockSdk, request);

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
      );

      expect(response).toEqual({
        type: "direct",
        result: {
          fileId: 789,
          transactionHash: "0xfilehash",
        },
      });
    });

    it("should handle submitFileAdditionWithPermissions", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAdditionWithPermissions",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
          permissions: [
            { account: "0xaccount1" as Address, key: "key1" },
            { account: "0xaccount2" as Address, key: "key2" },
          ],
        },
      };

      const response = await handleRelayerOperation(mockSdk, request);

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        request.params.permissions,
      );

      expect(response).toEqual({
        type: "direct",
        result: {
          fileId: 789,
          transactionHash: "0xfilehash",
        },
      });
    });

    it("should handle submitFileAdditionComplete", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAdditionComplete",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
          permissions: [{ account: "0xaccount" as Address, key: "key" }],
          schemaId: 42,
        },
      };

      const response = await handleRelayerOperation(mockSdk, request);

      expect(mockSdk.data.addFileWithPermissionsAndSchema).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [{ account: "0xaccount" as Address, publicKey: "key" }], // Mapped format
        42,
      );

      expect(response).toEqual({
        type: "direct",
        result: {
          fileId: 789,
          transactionHash: "0xfilehash",
        },
      });
    });

    it("should use userAddress when ownerAddress not provided", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAdditionComplete",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
          permissions: [],
          schemaId: 42,
        },
      };

      await handleRelayerOperation(mockSdk, request);

      expect(mockSdk.data.addFileWithPermissionsAndSchema).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser", // Falls back to userAddress
        [],
        42,
      );
    });

    it("should throw error when fileId not returned", async () => {
      mockSdk.waitForTransactionEvents = vi.fn().mockResolvedValue({
        expectedEvents: {}, // No FileAdded event
      });

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      await expect(handleRelayerOperation(mockSdk, request)).rejects.toThrow(
        "Failed to get fileId from transaction events",
      );
    });
  });

  describe("Direct Operations - Grant Storage", () => {
    it("should handle storeGrantFile", async () => {
      // Mock the data.upload method for grant storage
      mockSdk.data.upload = vi.fn().mockResolvedValue({
        url: "ipfs://mockhash",
      });

      const grantFile = {
        grantee: "0xgrantee" as Address,
        operation: "read",
        parameters: { fileId: 123 },
        expires: Math.floor(Date.now() / 1000) + 3600,
      };

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "storeGrantFile",
        params: grantFile,
      };

      const response = await handleRelayerOperation(mockSdk, request);

      // Verify it was called with a Blob containing the grant file
      expect(mockSdk.data.upload).toHaveBeenCalledWith({
        content: expect.any(Blob),
        filename: expect.stringMatching(/^grant-\d+\.json$/),
      });

      // Verify the blob contains the correct data
      const callArgs = (mockSdk.data.upload as any).mock.calls[0][0];
      const blob = callArgs.content as Blob;
      const text = await blob.text();
      expect(JSON.parse(text)).toEqual(grantFile);

      expect(response).toEqual({
        type: "direct",
        result: { url: "ipfs://mockhash" },
      });
    });

    it("should handle storage errors", async () => {
      mockSdk.data.upload = vi
        .fn()
        .mockRejectedValue(new Error("Storage failed"));

      const grantFile = {
        grantee: "0xgrantee" as Address,
        operation: "read",
        parameters: { fileId: 123 },
        expires: Math.floor(Date.now() / 1000) + 3600,
      };

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "storeGrantFile",
        params: grantFile,
      };

      await expect(handleRelayerOperation(mockSdk, request)).rejects.toThrow(
        "Storage failed",
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle errors from signed operations", async () => {
      const { handleRelayerRequest } = await import("../server/handler");
      vi.mocked(handleRelayerRequest).mockRejectedValue(
        new Error("Signature verification failed"),
      );

      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {
          domain: {
            name: "DataPortabilityPermissions",
            version: "1",
            chainId: 14800,
            verifyingContract:
              "0x1234567890123456789012345678901234567890" as `0x${string}`,
          },
          types: {
            Permission: [{ name: "nonce", type: "uint256" }],
          },
          primaryType: "Permission",
          message: {},
        },
        signature: "0xbadsignature" as `0x${string}`,
      };

      await expect(handleRelayerOperation(mockSdk, request)).rejects.toThrow(
        "Signature verification failed",
      );
    });

    it("should handle SDK errors in direct operations", async () => {
      mockSdk.data.addFileWithPermissions = vi
        .fn()
        .mockRejectedValue(new Error("Blockchain error"));

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      await expect(handleRelayerOperation(mockSdk, request)).rejects.toThrow(
        "Blockchain error",
      );
    });

    it("should handle transaction event errors", async () => {
      mockSdk.waitForTransactionEvents = vi
        .fn()
        .mockRejectedValue(new Error("Transaction failed"));

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAdditionWithPermissions",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
          permissions: [],
        },
      };

      await expect(handleRelayerOperation(mockSdk, request)).rejects.toThrow(
        "Transaction failed",
      );
    });
  });

  describe("Type Safety", () => {
    it("should have exhaustive type checking for operations", () => {
      // This test ensures TypeScript's exhaustiveness checking works
      // If a new operation is added, TypeScript will error if not handled

      const checkExhaustive = (request: UnifiedRelayerRequest): string => {
        if (request.type === "signed") {
          // All signed operations go through the same handler
          return "signed";
        } else if (request.type === "direct") {
          // Check all direct operations are handled
          switch (request.operation) {
            case "submitFileAddition":
            case "submitFileAdditionWithPermissions":
            case "submitFileAdditionComplete":
            case "storeGrantFile":
              return request.operation;
            default:
              // TypeScript will error here if a new operation is added
              const exhaustiveCheck: never = request;
              return exhaustiveCheck;
          }
        } else {
          // TypeScript will error here if a new request type is added
          const exhaustiveCheck: never = request;
          return exhaustiveCheck;
        }
      };

      // Test with all request types
      const signedReq: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {
          domain: {
            name: "DataPortabilityPermissions",
            version: "1",
            chainId: 14800,
            verifyingContract:
              "0x1234567890123456789012345678901234567890" as `0x${string}`,
          },
          types: {
            Permission: [{ name: "nonce", type: "uint256" }],
          },
          primaryType: "Permission",
          message: {},
        },
        signature: "0x" as `0x${string}`,
      };
      expect(checkExhaustive(signedReq)).toBe("signed");

      const directReq: UnifiedRelayerRequest = {
        type: "direct",
        operation: "storeGrantFile",
        params: {
          grantee: "0xgrantee" as Address,
          operation: "read",
          parameters: {},
        },
      };
      expect(checkExhaustive(directReq)).toBe("storeGrantFile");
    });
  });

  describe("Re-exports", () => {
    it("should re-export handleRelayerRequest for backwards compatibility", async () => {
      const module = await import("../server/relayerHandler");
      expect(module.handleRelayerRequest).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle all direct operations with complete params", async () => {
      // Test submitFileAddition
      const fileAddRequest: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/basic.txt",
          userAddress: "0xuser123" as Address,
        },
      };

      await handleRelayerOperation(mockSdk, fileAddRequest);
      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/basic.txt",
        "0xuser123",
        [],
      );
    });

    it("should handle submitFileAdditionWithPermissions with multiple permissions", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAdditionWithPermissions",
        params: {
          url: "https://storage.example/secure.txt",
          userAddress: "0xuser456" as Address,
          permissions: [
            { account: "0xaccount1" as Address, key: "key1" },
            { account: "0xaccount2" as Address, key: "key2" },
            { account: "0xaccount3" as Address, key: "key3" },
          ],
        },
      };

      await handleRelayerOperation(mockSdk, request);
      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/secure.txt",
        "0xuser456",
        request.params.permissions,
      );
    });

    it("should handle submitFileAddition with owner address", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAdditionComplete",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
          ownerAddress: "0xowner" as Address,
          permissions: [],
          schemaId: 42,
        },
      };

      const response = await handleRelayerOperation(mockSdk, request);

      expect(mockSdk.data.addFileWithPermissionsAndSchema).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xowner", // Should use ownerAddress when provided
        [],
        42,
      );

      expect(response).toEqual({
        type: "direct",
        result: {
          fileId: 789,
          transactionHash: "0xfilehash",
        },
      });
    });
  });
});
