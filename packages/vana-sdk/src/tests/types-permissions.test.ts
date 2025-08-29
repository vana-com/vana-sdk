import { describe, it, expect } from "vitest";
import type { Hash } from "viem";

// Test-specific interfaces
interface ComplexParameters {
  algorithm: string;
  hyperparameters: {
    learningRate: number;
    batchSize: number;
    epochs: number;
    layers: Array<Record<string, unknown>>;
  };
  metadata: {
    description: string;
    version: string;
    author: string;
  };
}

import type {
  GrantedPermission,
  GrantPermissionParams,
  RevokePermissionParams,
  CheckPermissionParams,
  PermissionCheckResult,
  PermissionGrantDomain,
  PermissionGrantMessage,
  PermissionInputMessage,
  PermissionInput,
  RevokePermissionInput,
  PermissionInfo,
  SimplifiedPermissionMessage,
  GrantFile,
  PermissionGrantTypedData,
  GenericTypedData,
  PermissionOperation,
  PermissionStatus,
  QueryPermissionsParams,
  PermissionQueryResult,
  PermissionAnalytics,
  Server,
  TrustServerParams,
  UntrustServerParams,
  TrustServerInput,
  UntrustServerInput,
  TrustServerTypedData,
  UntrustServerTypedData,
  PermissionEvent,
} from "../types/permissions";

describe("Permission Types", () => {
  describe("GrantedPermission", () => {
    it("should properly structure granted permission data", () => {
      const permission: GrantedPermission = {
        id: 123n,
        files: [1, 2, 3],
        operation: "llm_inference",
        grant: "ipfs://QmGrantFile",
        parameters: {
          model: "gpt-4",
          prompt: "Analyze this data",
          maxTokens: 1000,
        },
        nonce: 42,
        grantedAt: 1640995200,
        grantor: "0x1234567890123456789012345678901234567890",
        grantee: "0x9876543210987654321098765432109876543210",
        active: true,
        expiresAt: 1672531200,
        dataStatus: "complete",
      };

      expect(permission.id).toBe(123n);
      expect(permission.files).toEqual([1, 2, 3]);
      expect(permission.operation).toBe("llm_inference");
      expect(permission.grant).toBe("ipfs://QmGrantFile");
      expect(permission.parameters?.model).toBe("gpt-4");
      expect(permission.grantor).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(permission.grantee).toBe(
        "0x9876543210987654321098765432109876543210",
      );
      expect(permission.active).toBe(true);
    });

    it("should handle minimal granted permission", () => {
      const minimalPermission: GrantedPermission = {
        id: 456n,
        files: [5],
        operation: "[DATA_UNAVAILABLE]",
        parameters: {},
        grant: "ipfs://QmMinimalGrant",
        grantor: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        grantee: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        active: false,
        dataStatus: "minimal",
      };

      expect(minimalPermission.operation).toBe("[DATA_UNAVAILABLE]");
      expect(minimalPermission.parameters).toEqual({});
      expect(minimalPermission.dataStatus).toBe("minimal");
      expect(minimalPermission.nonce).toBeUndefined();
      expect(minimalPermission.grantedAt).toBeUndefined();
      expect(minimalPermission.expiresAt).toBeUndefined();
    });
  });

  describe("GrantPermissionParams", () => {
    it("should structure grant parameters correctly", () => {
      const params: GrantPermissionParams = {
        grantee: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: {
          prompt: "Analyze my data",
          model: "gpt-4",
          maxTokens: 1000,
        },
        grantUrl: "ipfs://QmExistingGrant",
        nonce: 789n,
        expiresAt: 1672531200,
      };

      expect(params.grantee).toBe("0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6");
      expect(params.operation).toBe("llm_inference");
      expect(params.files).toEqual([1, 2, 3]);
      expect(params.parameters.model).toBe("gpt-4");
      expect(params.grantUrl).toBe("ipfs://QmExistingGrant");
      expect(params.nonce).toBe(789n);
      expect(params.expiresAt).toBe(1672531200);
    });

    it("should handle minimal grant parameters", () => {
      const minimalParams: GrantPermissionParams = {
        grantee: "0xcccccccccccccccccccccccccccccccccccccccc",
        operation: "data_analysis",
        files: [10],
        parameters: {
          analysisType: "sentiment",
        },
      };

      expect(minimalParams.grantUrl).toBeUndefined();
      expect(minimalParams.nonce).toBeUndefined();
      expect(minimalParams.expiresAt).toBeUndefined();
    });
  });

  describe("RevokePermissionParams", () => {
    it("should structure revoke parameters correctly", () => {
      const params: RevokePermissionParams = {
        permissionId: 999n,
      };

      expect(params.permissionId).toBe(999n);
    });
  });

  describe("CheckPermissionParams", () => {
    it("should structure check parameters correctly", () => {
      const params: CheckPermissionParams = {
        application: "0xdddddddddddddddddddddddddddddddddddddddd",
        operation: "model_training",
        files: [5, 6, 7],
        parameters: {
          epochs: 10,
          learningRate: 0.001,
        },
        user: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      };

      expect(params.application).toBe(
        "0xdddddddddddddddddddddddddddddddddddddddd",
      );
      expect(params.operation).toBe("model_training");
      expect(params.files).toEqual([5, 6, 7]);
      expect(params.parameters.epochs).toBe(10);
      expect(params.user).toBe("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    });

    it("should handle check parameters without user", () => {
      const params: CheckPermissionParams = {
        application: "0xffffffffffffffffffffffffffffffffffffff",
        operation: "data_sharing",
        files: [8],
        parameters: {
          shareWith: ["external_service"],
        },
      };

      expect(params.user).toBeUndefined();
    });
  });

  describe("PermissionCheckResult", () => {
    it("should structure valid permission check result", () => {
      const validResult: PermissionCheckResult = {
        exists: true,
        permission: {
          id: 111n,
          files: [1, 2],
          grant: "ipfs://QmValidGrant",
          grantor: "0x1111111111111111111111111111111111111111",
          grantee: "0x2222222222222222222222222222222222222222",
          active: true,
          operation: "llm_inference",
          parameters: { model: "gpt-4" },
          dataStatus: "complete",
        },
      };

      expect(validResult.exists).toBe(true);
      expect(validResult.permission?.id).toBe(111n);
      expect(validResult.reason).toBeUndefined();
    });

    it("should structure invalid permission check result", () => {
      const invalidResult: PermissionCheckResult = {
        exists: false,
        reason: "Permission has expired",
      };

      expect(invalidResult.exists).toBe(false);
      expect(invalidResult.permission).toBeUndefined();
      expect(invalidResult.reason).toBe("Permission has expired");
    });
  });

  describe("EIP-712 Domain and Message Types", () => {
    it("should structure permission grant domain correctly", () => {
      const domain: PermissionGrantDomain = {
        name: "DataPermissions",
        version: "1",
        chainId: 14800,
        verifyingContract: "0x3333333333333333333333333333333333333333",
      };

      expect(domain.name).toBe("DataPermissions");
      expect(domain.version).toBe("1");
      expect(domain.chainId).toBe(14800);
      expect(domain.verifyingContract).toBe(
        "0x3333333333333333333333333333333333333333",
      );
    });

    it("should structure permission grant message correctly", () => {
      const message: PermissionGrantMessage = {
        application: "0x4444444444444444444444444444444444444444",
        files: [1, 2, 3],
        operation: "llm_inference",
        grant: "ipfs://QmGrantMessage",
        parameters: JSON.stringify({ model: "gpt-4" }),
        nonce: 555n,
      };

      expect(message.application).toBe(
        "0x4444444444444444444444444444444444444444",
      );
      expect(message.files).toEqual([1, 2, 3]);
      expect(message.operation).toBe("llm_inference");
      expect(message.grant).toBe("ipfs://QmGrantMessage");
      expect(JSON.parse(message.parameters)).toEqual({ model: "gpt-4" });
      expect(message.nonce).toBe(555n);
    });

    it("should structure permission input message correctly", () => {
      const message: PermissionInputMessage = {
        nonce: 666n,
        granteeId: 1n,
        grant: "ipfs://QmInputMessage",
        fileIds: [1n, 2n, 3n],
      };

      expect(message.nonce).toBe(666n);
      expect(message.grant).toBe("ipfs://QmInputMessage");
      expect(message.fileIds).toEqual([1n, 2n, 3n]);
    });

    it("should structure simplified permission message correctly", () => {
      const message: SimplifiedPermissionMessage = {
        application: "0x5555555555555555555555555555555555555555",
        grant: "ipfs://QmSimplified",
        nonce: 777n,
      };

      expect(message.application).toBe(
        "0x5555555555555555555555555555555555555555",
      );
      expect(message.grant).toBe("ipfs://QmSimplified");
      expect(message.nonce).toBe(777n);
    });
  });

  describe("Contract Input Types", () => {
    it("should structure permission input correctly", () => {
      const input: PermissionInput = {
        nonce: 888n,
        granteeId: 1n,
        grant: "ipfs://QmContractInput",
        fileIds: [10n, 20n, 30n],
      };

      expect(input.nonce).toBe(888n);
      expect(input.grant).toBe("ipfs://QmContractInput");
      expect(input.fileIds).toEqual([10n, 20n, 30n]);
    });

    it("should structure revoke permission input correctly", () => {
      const input: RevokePermissionInput = {
        nonce: 999n,
        permissionId: 12345n,
      };

      expect(input.nonce).toBe(999n);
      expect(input.permissionId).toBe(12345n);
    });

    it("should structure permission info correctly", () => {
      const info: PermissionInfo = {
        id: 54321n,
        grantor: "0x6666666666666666666666666666666666666666",
        nonce: 111n,
        granteeId: 1n,
        grant: "ipfs://QmPermissionInfo",
        signature:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
        startBlock: 1000n,
        endBlock: 2000n,
        fileIds: [100n, 200n],
      };

      expect(info.id).toBe(54321n);
      expect(info.grantor).toBe("0x6666666666666666666666666666666666666666");
      expect(info.nonce).toBe(111n);
      expect(info.grant).toBe("ipfs://QmPermissionInfo");
      expect(info.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
      expect(info.startBlock).toBe(1000n);
      expect(info.endBlock).toBe(2000n);
      expect(info.fileIds).toEqual([100n, 200n]);
    });
  });

  describe("GrantFile", () => {
    it("should structure grant file correctly", () => {
      const grantFile: GrantFile = {
        grantee: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        operation: "llm_inference",
        parameters: {
          prompt: "Analyze this data: {{data}}",
          model: "gpt-4",
          maxTokens: 2000,
          temperature: 0.7,
        },
        expires: 1736467579,
      };

      expect(grantFile.grantee).toBe(
        "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      );
      expect(grantFile.operation).toBe("llm_inference");
      expect(grantFile.parameters.model).toBe("gpt-4");
      expect(grantFile.parameters.temperature).toBe(0.7);
      expect(grantFile.expires).toBe(1736467579);
    });

    it("should handle grant file without expiration", () => {
      const permanentGrant: GrantFile = {
        grantee: "0x7777777777777777777777777777777777777777",
        operation: "data_analysis",
        parameters: {
          analysisType: "statistical",
        },
      };

      expect(permanentGrant.expires).toBeUndefined();
    });
  });

  describe("EIP-712 Typed Data Structures", () => {
    it("should structure permission grant typed data correctly", () => {
      const typedData: PermissionGrantTypedData = {
        domain: {
          name: "DataPermissions",
          version: "1",
          chainId: 14800,
          verifyingContract: "0x8888888888888888888888888888888888888888",
        },
        types: {
          Permission: [
            { name: "nonce", type: "uint256" },
            { name: "granteeId", type: "uint256" },
            { name: "grant", type: "string" },
            { name: "fileIds", type: "uint256[]" },
          ],
        },
        primaryType: "Permission",
        message: {
          nonce: 123n,
          granteeId: 1n,
          grant: "ipfs://QmTypedData",
          fileIds: [1n, 2n],
        },
      };

      expect(typedData.domain.name).toBe("DataPermissions");
      expect(typedData.primaryType).toBe("Permission");
      expect(typedData.types.Permission).toHaveLength(4);
      expect(typedData.message.nonce).toBe(123n);
      // Files are now only in message.fileIds, not at the top level
    });

    it("should structure generic typed data correctly", () => {
      const genericTypedData: GenericTypedData = {
        domain: {
          name: "GenericContract",
          version: "2",
          chainId: 1,
          verifyingContract: "0x9999999999999999999999999999999999999999",
        },
        types: {
          CustomType: [
            { name: "field1", type: "string" },
            { name: "field2", type: "uint256" },
          ],
        },
        primaryType: "CustomType",
        message: {
          field1: "test value",
          field2: 456,
        },
      };

      expect(genericTypedData.domain.chainId).toBe(1);
      expect(genericTypedData.primaryType).toBe("CustomType");
      expect(genericTypedData.types.CustomType).toHaveLength(2);
      expect(genericTypedData.message.field1).toBe("test value");
    });
  });

  describe("Permission Operation and Status Types", () => {
    it("should handle predefined permission operations", () => {
      const operations: PermissionOperation[] = [
        "llm_inference",
        "data_analysis",
        "model_training",
        "data_sharing",
        "compute_task",
        "custom_operation",
      ];

      expect(operations).toContain("llm_inference");
      expect(operations).toContain("data_analysis");
      expect(operations).toContain("model_training");
      expect(operations).toContain("data_sharing");
      expect(operations).toContain("compute_task");
      expect(operations).toContain("custom_operation");
    });

    it("should handle permission statuses", () => {
      const statuses: PermissionStatus[] = [
        "active",
        "revoked",
        "expired",
        "pending",
      ];

      expect(statuses).toContain("active");
      expect(statuses).toContain("revoked");
      expect(statuses).toContain("expired");
      expect(statuses).toContain("pending");
    });
  });

  describe("Query Types", () => {
    it("should structure query permissions parameters correctly", () => {
      const params: QueryPermissionsParams = {
        grantor: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        grantee: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        operation: "llm_inference",
        files: [1, 2, 3],
        status: "active",
        fromBlock: 1000n,
        toBlock: 2000n,
        limit: 50,
        offset: 100,
      };

      expect(params.grantor).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      expect(params.grantee).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
      expect(params.operation).toBe("llm_inference");
      expect(params.files).toEqual([1, 2, 3]);
      expect(params.status).toBe("active");
      expect(params.fromBlock).toBe(1000n);
      expect(params.toBlock).toBe(2000n);
      expect(params.limit).toBe(50);
      expect(params.offset).toBe(100);
    });

    it("should structure permission query result correctly", () => {
      const result: PermissionQueryResult = {
        permissions: [
          {
            id: 1n,
            files: [1],
            grant: "ipfs://QmResult1",
            grantor: "0x1111111111111111111111111111111111111111",
            grantee: "0x2222222222222222222222222222222222222222",
            active: true,
            operation: "data_analysis",
            parameters: { analysisType: "statistical" },
            dataStatus: "complete",
          },
          {
            id: 2n,
            files: [2],
            grant: "ipfs://QmResult2",
            grantor: "0x3333333333333333333333333333333333333333",
            grantee: "0x4444444444444444444444444444444444444444",
            active: false,
            operation: "model_training",
            parameters: { epochs: 100 },
            dataStatus: "partial",
          },
        ],
        total: 2,
        hasMore: false,
      };

      expect(result.permissions).toHaveLength(2);
      expect(result.permissions[0].id).toBe(1n);
      expect(result.permissions[1].id).toBe(2n);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });
  });

  describe("Analytics Types", () => {
    it("should structure permission analytics correctly", () => {
      const analytics: PermissionAnalytics = {
        totalPermissions: 100,
        activePermissions: 60,
        revokedPermissions: 30,
        expiredPermissions: 10,
        topOperations: [
          { operation: "llm_inference", count: 40 },
          { operation: "data_analysis", count: 35 },
          { operation: "model_training", count: 25 },
        ],
        topApplications: [
          {
            application: "0x1111111111111111111111111111111111111111",
            count: 50,
          },
          {
            application: "0x2222222222222222222222222222222222222222",
            count: 30,
          },
        ],
      };

      expect(analytics.totalPermissions).toBe(100);
      expect(analytics.activePermissions).toBe(60);
      expect(analytics.revokedPermissions).toBe(30);
      expect(analytics.expiredPermissions).toBe(10);
      expect(analytics.topOperations).toHaveLength(3);
      expect(analytics.topOperations[0].operation).toBe("llm_inference");
      expect(analytics.topApplications).toHaveLength(2);
      expect(analytics.topApplications[0].count).toBe(50);
    });
  });

  describe("Server Trust Types", () => {
    it("should structure server correctly", () => {
      const server: Server = {
        id: 1,
        owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
        url: "https://trusted-server.example.com",
        serverAddress:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`,
        publicKey: "0x04...",
      };

      expect(server.id).toBe(1);
      expect(server.url).toBe("https://trusted-server.example.com");
    });

    it("should structure trust server parameters correctly", () => {
      const params: TrustServerParams = {
        serverId: 2,
      };

      expect(params.serverId).toBe(2);
    });

    it("should structure untrust server parameters correctly", () => {
      const params: UntrustServerParams = {
        serverId: 3,
      };

      expect(params.serverId).toBe(3);
    });

    it("should structure trust server input correctly", () => {
      const input: TrustServerInput = {
        nonce: 123n,
        serverId: 4,
      };

      expect(input.nonce).toBe(123n);
      expect(input.serverId).toBe(4);
    });

    it("should structure untrust server input correctly", () => {
      const input: UntrustServerInput = {
        nonce: 456n,
        serverId: 5,
      };

      expect(input.nonce).toBe(456n);
      expect(input.serverId).toBe(5);
    });

    it("should structure trust server typed data correctly", () => {
      const typedData: TrustServerTypedData = {
        domain: {
          name: "DataPermissions",
          version: "1",
          chainId: 14800,
          verifyingContract: "0x1010101010101010101010101010101010101010",
        },
        types: {
          TrustServer: [
            { name: "nonce", type: "uint256" },
            { name: "serverId", type: "uint256" },
          ],
        },
        primaryType: "TrustServer",
        message: {
          nonce: 789n,
          serverId: 6,
        },
      };

      expect(typedData.primaryType).toBe("TrustServer");
      expect(typedData.types.TrustServer).toHaveLength(2);
      expect(typedData.message.nonce).toBe(789n);
      expect(typedData.message.serverId).toBe(6);
    });

    it("should structure untrust server typed data correctly", () => {
      const typedData: UntrustServerTypedData = {
        domain: {
          name: "DataPermissions",
          version: "1",
          chainId: 14800,
          verifyingContract: "0x3030303030303030303030303030303030303030",
        },
        types: {
          UntrustServer: [
            { name: "nonce", type: "uint256" },
            { name: "serverId", type: "uint256" },
          ],
        },
        primaryType: "UntrustServer",
        message: {
          nonce: 101112n,
          serverId: 7,
        },
      };

      expect(typedData.primaryType).toBe("UntrustServer");
      expect(typedData.types.UntrustServer).toHaveLength(2);
      expect(typedData.message.nonce).toBe(101112n);
      expect(typedData.message.serverId).toBe(7);
    });
  });

  describe("Permission Event Types", () => {
    it("should structure permission event correctly", () => {
      const event: PermissionEvent = {
        type: "granted",
        permission: {
          id: 999n,
          files: [10, 20],
          grant: "ipfs://QmEventGrant",
          grantor: "0x5050505050505050505050505050505050505050",
          grantee: "0x6060606060606060606060606060606060606060",
          active: true,
          operation: "compute_task",
          parameters: { taskType: "training" },
          dataStatus: "complete",
        },
        blockNumber: 12345n,
        transactionHash:
          "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hash,
        timestamp: 1640995200,
      };

      expect(event.type).toBe("granted");
      expect(event.permission.id).toBe(999n);
      expect(event.blockNumber).toBe(12345n);
      expect(event.transactionHash).toBe(
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      );
      expect(event.timestamp).toBe(1640995200);
    });

    it("should handle different event types", () => {
      const grantedEvent: PermissionEvent["type"] = "granted";
      const revokedEvent: PermissionEvent["type"] = "revoked";
      const expiredEvent: PermissionEvent["type"] = "expired";

      expect(grantedEvent).toBe("granted");
      expect(revokedEvent).toBe("revoked");
      expect(expiredEvent).toBe("expired");
    });
  });

  describe("Type Safety and Integration", () => {
    it("should ensure bigint values work correctly", () => {
      const permission: GrantedPermission = {
        id: BigInt("18446744073709551615"), // max uint64
        files: [],
        grant: "test",
        grantor: "0x7070707070707070707070707070707070707070",
        grantee: "0x8080808080808080808080808080808080808080",
        active: true,
        operation: "[DATA_UNAVAILABLE]",
        parameters: {},
        dataStatus: "minimal",
      };

      expect(typeof permission.id).toBe("bigint");
      expect(permission.id > 0n).toBe(true);
    });

    it("should handle complex nested parameter structures", () => {
      const complexParams: GrantPermissionParams = {
        grantee: "0x9090909090909090909090909090909090909090",
        operation: "complex_computation",
        files: [1, 2, 3],
        parameters: {
          algorithm: "neural_network",
          hyperparameters: {
            learningRate: 0.001,
            batchSize: 32,
            epochs: 100,
            layers: [
              { type: "dense", units: 128, activation: "relu" },
              { type: "dropout", rate: 0.2 },
              { type: "dense", units: 64, activation: "relu" },
              { type: "dense", units: 1, activation: "sigmoid" },
            ],
          },
          metadata: {
            description: "Binary classification model",
            version: "1.0.0",
            author: "Data Scientist",
          },
        },
      };

      expect(complexParams.parameters.algorithm).toBe("neural_network");
      expect(
        (complexParams.parameters as unknown as ComplexParameters)
          .hyperparameters.epochs,
      ).toBe(100);
      expect(
        Array.isArray(
          (complexParams.parameters as unknown as ComplexParameters)
            .hyperparameters.layers,
        ),
      ).toBe(true);
      expect(
        (complexParams.parameters as unknown as ComplexParameters).metadata
          .version,
      ).toBe("1.0.0");
    });

    it("should handle optional fields consistently", () => {
      const basePermission: GrantedPermission = {
        id: 1n,
        files: [],
        grant: "test",
        grantor: "0xb0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0",
        grantee: "0xc0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0",
        active: true,
        operation: "[DATA_UNAVAILABLE]",
        parameters: {},
        dataStatus: "minimal",
      };

      // Required fields should have default values when minimal data is available
      expect(basePermission.operation).toBe("[DATA_UNAVAILABLE]");
      expect(basePermission.parameters).toEqual({});
      expect(basePermission.dataStatus).toBe("minimal");

      // Optional fields should be undefined when not set
      expect(basePermission.nonce).toBeUndefined();
      expect(basePermission.grantedAt).toBeUndefined();
      expect(basePermission.expiresAt).toBeUndefined();
    });
  });
});
