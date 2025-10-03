import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRelayerOperation } from "../server/relayerHandler";
import type { VanaInstance } from "../index.node";
import type { UnifiedRelayerRequest } from "../types/relayer";
import type { TransactionOptions } from "../types";
import type { Address, Hash } from "viem";

// Mock viem for signature recovery (not testing actual crypto here)
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    recoverTypedDataAddress: vi.fn().mockResolvedValue("0xRecoveredAddress"),
    getAddress: (addr: string) => addr, // Simple passthrough for tests
  };
});

function createMockSdk(): VanaInstance {
  const baseMock = {
    data: {
      addFileWithPermissions: vi.fn().mockResolvedValue({
        hash: "0xfilehash" as `0x${string}`,
        contract: "DataRegistry",
        fn: "addFileWithPermissions",
        from: "0xrelayer",
      }),
      addFileWithPermissionsAndSchema: vi.fn().mockResolvedValue({
        hash: "0xfilehash" as `0x${string}`,
      }),
      addFileWithEncryptedPermissionsAndSchema: vi.fn().mockResolvedValue({
        hash: "0xfilehash" as `0x${string}`,
      }),
      upload: vi.fn().mockResolvedValue({
        url: "ipfs://mockhash",
      }),
    },
    permissions: {
      submitSignedGrant: vi.fn().mockResolvedValue({
        hash: "0xsignedhash" as `0x${string}`,
        from: "0xuser" as `0x${string}`,
        contract: "DataPortabilityPermissions",
        fn: "addPermission",
      }),
      submitSignedRevoke: vi.fn().mockResolvedValue({
        hash: "0xsignedhash" as `0x${string}`,
        from: "0xuser" as `0x${string}`,
        contract: "DataPortabilityPermissions",
        fn: "revokePermission",
      }),
      submitSignedTrustServer: vi.fn().mockResolvedValue({
        hash: "0xsignedhash" as `0x${string}`,
        from: "0xuser" as `0x${string}`,
        contract: "DataPortabilityServers",
        fn: "trustServerWithSignature",
      }),
      submitSignedAddAndTrustServer: vi.fn().mockResolvedValue({
        hash: "0xsignedhash" as `0x${string}`,
        from: "0xuser" as `0x${string}`,
        contract: "DataPortabilityServers",
        fn: "addAndTrustServerWithSignature",
      }),
      submitSignedUntrustServer: vi.fn().mockResolvedValue({
        hash: "0xsignedhash" as `0x${string}`,
        from: "0xuser" as `0x${string}`,
        contract: "DataPortabilityServers",
        fn: "untrustServerWithSignature",
      }),
      submitSignedAddServerFilesAndPermissions: vi.fn().mockResolvedValue({
        hash: "0xsignedhash" as `0x${string}`,
        from: "0xuser" as `0x${string}`,
        contract: "DataPortabilityServers",
        fn: "addServerFilesAndPermissions",
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
        type: "submitted",
        hash: "0xsignedhash",
      });
    });

    it("should verify expectedUserAddress for signed operations", async () => {
      const { recoverTypedDataAddress } = await import("viem");
      // Mock recovery to return a different address than expected
      vi.mocked(recoverTypedDataAddress).mockResolvedValueOnce(
        "0xDifferentAddress" as Address,
      );

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
            RevokePermission: [
              { name: "nonce", type: "uint256" },
              { name: "granteeId", type: "uint256" },
            ],
          },
          primaryType: "RevokePermission",
          message: {},
        },
        signature: "0xsignature" as `0x${string}`,
        expectedUserAddress: "0xExpectedAddress" as Address,
      };

      const response = await handleRelayerOperation(mockSdk, request);
      expect(response).toEqual({
        type: "error",
        error: expect.stringContaining("Security verification failed"),
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
        //"submitRegisterGrantee", // TODO: Add when contract supports registerGranteeWithSignature
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
          type: "submitted",
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
        undefined, // options parameter
      );

      expect(response).toEqual({
        type: "submitted",
        hash: "0xfilehash",
        context: {
          contract: "DataRegistry",
          fn: "addFileWithPermissions",
          from: "0xrelayer",
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
        undefined, // options parameter
      );

      expect(response).toEqual({
        type: "submitted",
        hash: "0xfilehash",
        context: {
          contract: "DataRegistry",
          fn: "addFileWithPermissions",
          from: "0xrelayer",
        },
      });
    });

    it("should handle submitFileAdditionComplete with encrypted permissions", async () => {
      // Use realistic encrypted permission data
      const encryptedKey =
        "1f976421c75e53528844bbad6972f6cd046b883c3503f9633cc80424350da1faf9433d4152d7b400de852a2f7f34b1af75c49f6becf4a11c9d667926f3cbe746158eb2c947b453e7ebed85830c6d6c7a994302e967fd7f3d9d71533d2aa28356ad60eafabfa4765f8e09954a1eec0440e3376807daa30f8a9e06cfe26f2c02e004dd5831ee123adfed6c2c4b1c746c0541c929b62ad93e5d361423e0b4fcf884accad9cbb88210eb30f6e3dfd956053163a093d8222cbc19e55bb3efceb755ce1d91fbf3268e622a0293ee87e7317ba609807115b4d7ab5e8c2ee676f652d52dae26c4afebc91ecb6f9805ea8737a93d50b58b17b7af176f96d78eaaf5af129103";

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAdditionComplete",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
          permissions: [
            {
              account: "0xaccount" as Address,
              key: encryptedKey, // Already encrypted
            },
          ],
          schemaId: 42,
        },
      };

      const response = await handleRelayerOperation(mockSdk, request);

      // Should call the encrypted permissions method, not the public key one
      expect(
        mockSdk.data.addFileWithEncryptedPermissionsAndSchema,
      ).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [{ account: "0xaccount" as Address, key: encryptedKey }], // No mapping, passes through as-is
        42,
        undefined, // options parameter
      );

      // Should NOT call the public key method
      expect(
        mockSdk.data.addFileWithPermissionsAndSchema,
      ).not.toHaveBeenCalled();

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

      const response = await handleRelayerOperation(mockSdk, request);

      // Should use the encrypted permissions method
      expect(
        mockSdk.data.addFileWithEncryptedPermissionsAndSchema,
      ).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser", // Falls back to userAddress
        [],
        42,
        undefined, // options parameter
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

  describe("Direct Operations - Grant Storage", () => {
    it("should handle storeGrantFile", async () => {
      // Mock the context with storageManager
      (mockSdk.data as any).context = {
        storageManager: {
          upload: vi.fn().mockResolvedValue({
            url: "ipfs://mockhash",
          }),
        },
      };

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

      // Should use context.storageManager.upload
      expect(
        (mockSdk.data as any).context.storageManager.upload,
      ).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringMatching(/^grant-\d+\.json$/),
      );

      expect(response).toEqual({
        type: "direct",
        result: { url: "ipfs://mockhash" },
      });
    });

    it("should handle storage errors", async () => {
      // Don't mock data.upload since it's not used anymore

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
      // Without storage configuration, the handler should return an error
      expect(response).toEqual({
        type: "error",
        error: "Storage configuration is required for storing grant files",
      });
    });
  });

  describe("Direct Operations - Grantee Registration", () => {
    it("should handle submitRegisterGrantee", async () => {
      // Mock the permissions.submitRegisterGrantee method
      mockSdk.permissions.submitRegisterGrantee = vi.fn().mockResolvedValue({
        hash: "0xgranteehash" as Hash,
        contract: undefined,
        fn: undefined,
        from: undefined,
      });

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitRegisterGrantee",
        params: {
          owner: "0xowner" as Address,
          granteeAddress: "0xgrantee" as Address,
          publicKey: "0x1234567890abcdef",
        },
      };

      const response = await handleRelayerOperation(mockSdk, request);

      expect(mockSdk.permissions.submitRegisterGrantee).toHaveBeenCalledWith({
        owner: "0xowner",
        granteeAddress: "0xgrantee",
        publicKey: "0x1234567890abcdef",
      });

      expect(response).toEqual({
        type: "submitted",
        hash: "0xgranteehash",
        context: {
          contract: undefined,
          fn: undefined,
          from: undefined,
        },
      });
    });

    it("should handle registerGrantee errors", async () => {
      mockSdk.permissions.submitRegisterGrantee = vi
        .fn()
        .mockRejectedValue(new Error("Grantee registration failed"));

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitRegisterGrantee",
        params: {
          owner: "0xowner" as Address,
          granteeAddress: "0xgrantee" as Address,
          publicKey: "0x1234567890abcdef",
        },
      };

      const response = await handleRelayerOperation(mockSdk, request);
      expect(response).toEqual({
        type: "error",
        error: "Grantee registration failed",
      });
    });
  });

  describe("Status Check Operations", () => {
    it("should return error for status_check in stateless mode", async () => {
      const request: UnifiedRelayerRequest = {
        type: "status_check",
        operationId: "op123",
      };

      const result = await handleRelayerOperation(mockSdk, request);

      expect(result).toEqual({
        type: "error",
        error: "Stateless relayer does not support operation status checks.",
      });
    });
  });

  describe("Response Type Conversion", () => {
    it("should convert direct results with transaction hash to submitted", async () => {
      // Mock a direct operation that returns a TransactionResult
      mockSdk.permissions.submitRegisterGrantee = vi.fn().mockResolvedValue({
        hash: "0xregisterhash" as Hash,
        contract: "DataPortabilityGrantees" as const,
        fn: undefined,
        from: undefined,
      });

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitRegisterGrantee",
        params: {
          owner: "0xowner" as Address,
          granteeAddress: "0xgrantee" as Address,
          publicKey: "publickey",
        },
      };

      const result = await handleRelayerOperation(mockSdk, request);

      expect(result).toEqual({
        type: "submitted",
        hash: "0xregisterhash",
        context: {
          contract: "DataPortabilityGrantees",
          fn: undefined,
          from: undefined,
        },
      });
    });

    it("should return direct results without hash as-is", async () => {
      const mockStorageManager = {
        upload: vi.fn().mockResolvedValue({ url: "ipfs://grant123" }),
      };
      const mockSdkWithStorage = {
        ...mockSdk,
        data: {
          ...mockSdk.data,
          context: { storageManager: mockStorageManager },
        },
      } as any;

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "storeGrantFile",
        params: {
          grantee: "0xgrantee" as Address,
          operation: "read",
          parameters: {
            fileId: 123,
            encryptedKey: "enckey",
          },
          expires: Math.floor(Date.now() / 1000) + 86400,
        },
      };

      const result = await handleRelayerOperation(mockSdkWithStorage, request);

      expect(result).toEqual({
        type: "direct",
        result: { url: "ipfs://grant123" },
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle errors during direct operations", async () => {
      mockSdk.data.addFileWithPermissions = vi
        .fn()
        .mockRejectedValue(new Error("Network error"));

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      const result = await handleRelayerOperation(mockSdk, request);

      expect(result).toEqual({
        type: "error",
        error: "Network error",
      });
    });

    it("should handle non-Error exceptions", async () => {
      mockSdk.data.addFileWithPermissions = vi
        .fn()
        .mockRejectedValue("String error");

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      const result = await handleRelayerOperation(mockSdk, request);

      expect(result).toEqual({
        type: "error",
        error: "Unknown error during operation submission",
      });
    });
    it("should handle errors from signed operations", async () => {
      // Mock recoverTypedDataAddress to throw an error for this test
      const { recoverTypedDataAddress } = await import("viem");
      vi.mocked(recoverTypedDataAddress).mockRejectedValueOnce(
        new Error("Invalid signature"),
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

      const response = await handleRelayerOperation(mockSdk, request);
      expect(response).toEqual({
        type: "error",
        error: expect.stringContaining("Signature verification failed"),
      });
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

      const response = await handleRelayerOperation(mockSdk, request);
      expect(response).toEqual({
        type: "error",
        error: "Blockchain error",
      });
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
            case "submitRegisterGrantee":
              return request.operation;
            default:
              // TypeScript will error here if a new operation is added
              const exhaustiveCheck: never = request;
              return exhaustiveCheck;
          }
        } else if (request.type === "status_check") {
          // Handle the new status check type
          return "status_check";
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

  describe("TransactionOptions Edge Cases", () => {
    it("should handle empty transaction options object correctly", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      // Empty object - no valid transaction options
      const emptyOptions = {};

      await handleRelayerOperation(mockSdk, request, emptyOptions);

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        undefined, // Should be undefined since no valid options
      );
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
        undefined, // options parameter
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
        undefined, // options parameter
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

      expect(
        mockSdk.data.addFileWithEncryptedPermissionsAndSchema,
      ).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xowner", // Should use ownerAddress when provided
        [],
        42,
        undefined, // options parameter
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

  describe("Transaction Options Support", () => {
    it("should pass transaction options for direct file operations", async () => {
      const options: TransactionOptions = {
        nonce: 42,
        gas: 100000n,
        maxFeePerGas: 20000000000n,
      };

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      await handleRelayerOperation(mockSdk, request, options);

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        options,
      );
    });

    it("should pass transaction options for file addition with permissions", async () => {
      const options: TransactionOptions = {
        nonce: 43,
        gasPrice: 10000000000n,
      };

      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAdditionWithPermissions",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
          permissions: [{ account: "0xaccount1" as Address, key: "key1" }],
        },
      };

      await handleRelayerOperation(mockSdk, request, options);

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        request.params.permissions,
        options,
      );
    });

    it("should pass transaction options for encrypted file operations", async () => {
      const options: TransactionOptions = {
        nonce: 44,
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 2000000000n,
      };

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

      await handleRelayerOperation(mockSdk, request, options);

      expect(
        mockSdk.data.addFileWithEncryptedPermissionsAndSchema,
      ).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        42,
        options,
      );
    });

    it("should pass transaction options for signed AddServer operation", async () => {
      const options: TransactionOptions = {
        nonce: 45,
        gas: 200000n,
      };

      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {
          domain: {
            name: "DataPortabilityServers",
            version: "1",
            chainId: 14800,
            verifyingContract: "0xservers" as Address,
          },
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            AddServer: [
              { name: "nonce", type: "uint256" },
              { name: "serverAddress", type: "address" },
              { name: "serverUrl", type: "string" },
              { name: "publicKey", type: "string" },
            ],
          },
          primaryType: "AddServer",
          message: {
            nonce: 1n,
            serverAddress: "0xserver" as Address,
            serverUrl: "https://server.example",
            publicKey: "0xpublickey",
          },
        },
        signature: "0xsignature" as Hash,
      };

      await handleRelayerOperation(mockSdk, request, options);

      expect(
        mockSdk.permissions.submitSignedAddAndTrustServer,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryType: "AddServer",
        }),
        "0xsignature",
        options,
      );
    });

    it("should pass transaction options for signed TrustServer operation", async () => {
      const options: TransactionOptions = {
        nonce: 46,
        value: 1000000000000000n, // 0.001 ETH
      };

      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {
          domain: {
            name: "DataPortabilityServers",
            version: "1",
            chainId: 14800,
            verifyingContract: "0xservers" as Address,
          },
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            TrustServer: [
              { name: "nonce", type: "uint256" },
              { name: "serverId", type: "uint256" },
            ],
          },
          primaryType: "TrustServer",
          message: {
            nonce: 1n,
            serverId: 123n,
          },
        },
        signature: "0xsignature" as Hash,
      };

      await handleRelayerOperation(mockSdk, request, options);

      expect(mockSdk.permissions.submitSignedTrustServer).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryType: "TrustServer",
        }),
        "0xsignature",
        options,
      );
    });

    it("should pass transaction options for signed UntrustServer operation", async () => {
      const options: TransactionOptions = {
        nonce: 47,
        gasPrice: 15000000000n,
      };

      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {
          domain: {
            name: "DataPortabilityServers",
            version: "1",
            chainId: 14800,
            verifyingContract: "0xservers" as Address,
          },
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            UntrustServer: [
              { name: "nonce", type: "uint256" },
              { name: "serverId", type: "uint256" },
            ],
          },
          primaryType: "UntrustServer",
          message: {
            nonce: 1n,
            serverId: 123n,
          },
        },
        signature: "0xsignature" as Hash,
      };

      await handleRelayerOperation(mockSdk, request, options);

      expect(
        mockSdk.permissions.submitSignedUntrustServer,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryType: "UntrustServer",
        }),
        "0xsignature",
        options,
      );
    });

    it("should handle undefined options gracefully", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      // Call without options
      await handleRelayerOperation(mockSdk, request);

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        undefined,
      );
    });

    it("should pass undefined when only relayer-specific options are provided", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      // Only relayer-specific options, no transaction options
      const relayerOptions = {
        execution: "sync" as const,
        syncTimeout: 5000,
      };

      await handleRelayerOperation(mockSdk, request, relayerOptions);

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        undefined, // Should be undefined since no transaction options
      );
    });

    it("should extract only transaction options from mixed options", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      // Mix of relayer and transaction options
      const mixedOptions = {
        execution: "sync" as const,
        syncTimeout: 10000,
        nonce: 42,
        gas: 100000n,
        maxFeePerGas: 20000000000n,
      };

      await handleRelayerOperation(mockSdk, request, mixedOptions);

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        {
          nonce: 42,
          gas: 100000n,
          maxFeePerGas: 20000000000n,
        }, // Only transaction options extracted
      );
    });

    it("should handle nonce: 0 correctly", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      const optionsWithZeroNonce = {
        nonce: 0, // Zero nonce should be included
        gasPrice: 10000000000n,
      };

      await handleRelayerOperation(mockSdk, request, optionsWithZeroNonce);

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        {
          nonce: 0,
          gasPrice: 10000000000n,
        },
      );
    });

    it("should handle all gas-related options", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      const gasOptions = {
        maxPriorityFeePerGas: 3000000000n,
        // No other options - should still create object
      };

      await handleRelayerOperation(mockSdk, request, gasOptions);

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        {
          maxPriorityFeePerGas: 3000000000n,
        },
      );
    });

    it("should handle only gas option", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      await handleRelayerOperation(mockSdk, request, { gas: 500000n });

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        { gas: 500000n },
      );
    });

    it("should handle only value option", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      await handleRelayerOperation(mockSdk, request, { value: 123456789n });

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        { value: 123456789n },
      );
    });

    it("should handle only gasPrice option", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      await handleRelayerOperation(mockSdk, request, { gasPrice: 5000000000n });

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        { gasPrice: 5000000000n },
      );
    });

    it("should handle only maxFeePerGas option", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      await handleRelayerOperation(mockSdk, request, {
        maxFeePerGas: 30000000000n,
      });

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        { maxFeePerGas: 30000000000n },
      );
    });

    it("should pass signal and onStatusUpdate options", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      const controller = new AbortController();
      const onStatusUpdate = vi.fn();

      const optionsWithCallbacks = {
        signal: controller.signal,
        onStatusUpdate,
        value: 1000000000000000n,
      };

      await handleRelayerOperation(mockSdk, request, optionsWithCallbacks);

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        {
          signal: controller.signal,
          onStatusUpdate,
          value: 1000000000000000n,
        },
      );
    });

    it("should handle only onStatusUpdate callback", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      const onStatusUpdate = vi.fn();
      const optionsWithCallback = { onStatusUpdate };

      await handleRelayerOperation(mockSdk, request, optionsWithCallback);

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        { onStatusUpdate },
      );
    });

    it("should handle only signal option", async () => {
      const request: UnifiedRelayerRequest = {
        type: "direct",
        operation: "submitFileAddition",
        params: {
          url: "https://storage.example/file",
          userAddress: "0xuser" as Address,
        },
      };

      const controller = new AbortController();
      const optionsWithSignal = { signal: controller.signal };

      await handleRelayerOperation(mockSdk, request, optionsWithSignal);

      expect(mockSdk.data.addFileWithPermissions).toHaveBeenCalledWith(
        "https://storage.example/file",
        "0xuser",
        [],
        { signal: controller.signal },
      );
    });

    it("should pass complex transaction options correctly", async () => {
      const options: TransactionOptions = {
        nonce: 100,
        gas: 500000n,
        maxFeePerGas: 50000000000n,
        maxPriorityFeePerGas: 3000000000n,
        value: 2000000000000000n,
      };

      const request: UnifiedRelayerRequest = {
        type: "signed",
        operation: "submitAddPermission",
        typedData: {
          domain: {
            name: "DataPortabilityPermissions",
            version: "1",
            chainId: 14800,
            verifyingContract: "0xpermissions" as Address,
          },
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            Permission: [
              { name: "nonce", type: "uint256" },
              { name: "granteeId", type: "uint256" },
              { name: "grant", type: "string" },
              { name: "fileIds", type: "uint256[]" },
            ],
          },
          primaryType: "Permission",
          message: {
            nonce: 1n,
            granteeId: 456n,
            grant: "encryptedGrant",
            fileIds: [789n, 790n],
          },
        },
        signature: "0xsignature" as Hash,
      };

      await handleRelayerOperation(mockSdk, request, options);

      expect(mockSdk.permissions.submitSignedGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryType: "Permission",
        }),
        "0xsignature",
        options,
      );
    });
  });
});
