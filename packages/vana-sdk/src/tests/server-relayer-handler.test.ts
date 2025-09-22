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
      }),
      submitSignedRevoke: vi.fn().mockResolvedValue({
        hash: "0xsignedhash" as `0x${string}`,
      }),
      submitSignedTrustServer: vi.fn().mockResolvedValue({
        hash: "0xsignedhash" as `0x${string}`,
      }),
      submitSignedAddAndTrustServer: vi.fn().mockResolvedValue({
        hash: "0xsignedhash" as `0x${string}`,
      }),
      submitSignedUntrustServer: vi.fn().mockResolvedValue({
        hash: "0xsignedhash" as `0x${string}`,
      }),
      submitSignedAddServerFilesAndPermissions: vi.fn().mockResolvedValue({
        hash: "0xsignedhash" as `0x${string}`,
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

      await expect(handleRelayerOperation(mockSdk, request)).rejects.toThrow(
        "Security verification failed",
      );
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
        type: "direct",
        result: {
          fileId: 789,
          transactionHash: "0xfilehash",
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

      await handleRelayerOperation(mockSdk, request);

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
        gasLimit: 100000n,
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
        gasLimit: 200000n,
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
        timeout: 60000,
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

    it("should pass complex transaction options correctly", async () => {
      const options: TransactionOptions = {
        nonce: 100,
        gasLimit: 500000n,
        maxFeePerGas: 50000000000n,
        maxPriorityFeePerGas: 3000000000n,
        value: 2000000000000000n,
        timeout: 120000,
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
