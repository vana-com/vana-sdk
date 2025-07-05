import { describe, it, expect } from "vitest";
import type {
  VanaConfig,
  UserFile,
  GrantedPermission,
  GrantPermissionParams,
  RevokePermissionParams,
  VanaContract,
  PermissionGrantDomain,
  PermissionGrantMessage,
  PermissionInputMessage,
  SimplifiedPermissionMessage,
  GrantFile,
  PermissionGrantTypedData,
  GenericTypedData,
  RelayerStorageResponse,
  RelayerTransactionResponse,
  ContractInfo,
  UploadEncryptedFileResult,
} from "../types";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "../config/chains";

// Mock private key for testing
const testPrivateKey =
  "0x1234567890123456789012345678901234567890123456789012345678901234";

describe("TypeScript Types", () => {
  describe("VanaConfig", () => {
    it("should have required walletClient property", () => {
      const account = privateKeyToAccount(testPrivateKey);
      const walletClient = createWalletClient({
        account,
        chain: mokshaTestnet,
        transport: http(),
      });

      const config: VanaConfig = {
        walletClient,
      };

      expect(config.walletClient).toBeDefined();
      expect(config.relayerUrl).toBeUndefined();
      expect(config.storage).toBeUndefined();
    });

    it("should accept optional properties", () => {
      const account = privateKeyToAccount(testPrivateKey);
      const walletClient = createWalletClient({
        account,
        chain: mokshaTestnet,
        transport: http(),
      });

      const config: VanaConfig = {
        walletClient,
        relayerUrl: "https://relayer.example.com",
        storage: {
          providers: {},
          defaultProvider: "ipfs",
        },
      };

      expect(config.relayerUrl).toBe("https://relayer.example.com");
      expect(config.storage?.defaultProvider).toBe("ipfs");
    });
  });

  describe("UserFile", () => {
    it("should have all required properties", () => {
      const userFile: UserFile = {
        id: 123,
        url: "ipfs://QmTest123",
        ownerAddress: "0x1234567890123456789012345678901234567890",
        addedAtBlock: BigInt(456789),
      };

      expect(userFile.id).toBe(123);
      expect(userFile.url).toBe("ipfs://QmTest123");
      expect(userFile.ownerAddress).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(userFile.addedAtBlock).toBe(BigInt(456789));
    });
  });

  describe("GrantedPermission", () => {
    it("should have all required properties", () => {
      const permission: GrantedPermission = {
        id: 1,
        files: [10, 20, 30],
        grant: "ipfs://QmGrant123",
      };

      expect(permission.id).toBe(1);
      expect(permission.files).toEqual([10, 20, 30]);
      expect(permission.grant).toBe("ipfs://QmGrant123");
    });

    it("should accept optional properties", () => {
      const permission: GrantedPermission = {
        id: 2,
        files: [40, 50],
        grant: "ipfs://QmGrant456",
        operation: "llm_inference",
        parameters: { prompt: "Test prompt" },
        nonce: 123,
        grantedAt: 456789,
      };

      expect(permission.operation).toBe("llm_inference");
      expect(permission.parameters).toEqual({ prompt: "Test prompt" });
      expect(permission.nonce).toBe(123);
      expect(permission.grantedAt).toBe(456789);
    });
  });

  describe("GrantPermissionParams", () => {
    it("should have all required properties", () => {
      const params: GrantPermissionParams = {
        to: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "Test" },
      };

      expect(params.to).toBe("0x1234567890123456789012345678901234567890");
      expect(params.operation).toBe("llm_inference");
      expect(params.files).toEqual([1, 2, 3]);
      expect(params.parameters).toEqual({ prompt: "Test" });
    });

    it("should accept optional grantUrl", () => {
      const params: GrantPermissionParams = {
        to: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "Test" },
        grantUrl: "ipfs://QmPreStored",
      };

      expect(params.grantUrl).toBe("ipfs://QmPreStored");
    });
  });

  describe("RevokePermissionParams", () => {
    it("should have required grantId property", () => {
      const params: RevokePermissionParams = {
        grantId:
          "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      };

      expect(params.grantId).toBe(
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      );
    });
  });

  describe("VanaContract union type", () => {
    it("should accept all valid contract names", () => {
      const contracts: VanaContract[] = [
        "PermissionRegistry",
        "DataRegistry",
        "TeePool",
        "ComputeEngine",
        "TeePoolPhala",
        "DataRefinerRegistry",
        "QueryEngine",
        "ComputeInstructionRegistry",
        "TeePoolEphemeralStandard",
        "TeePoolPersistentStandard",
        "TeePoolPersistentGpu",
        "TeePoolDedicatedStandard",
        "TeePoolDedicatedGpu",
        "VanaEpoch",
        "DLPRegistry",
        "DLPRegistryTreasury",
        "DLPPerformance",
        "DLPRewardDeployer",
        "DLPRewardDeployerTreasury",
        "DLPRewardSwap",
        "SwapHelper",
        "VanaPoolStaking",
        "VanaPoolEntity",
        "VanaPoolTreasury",
        "DAT",
        "DATFactory",
        "DATPausable",
        "DATVotes",
      ];

      expect(contracts).toHaveLength(28);
      expect(contracts.includes("PermissionRegistry")).toBe(true);
      expect(contracts.includes("DataRegistry")).toBe(true);
    });
  });

  describe("PermissionGrantDomain", () => {
    it("should have all required EIP-712 domain properties", () => {
      const domain: PermissionGrantDomain = {
        name: "VanaDataWallet",
        version: "1",
        chainId: 14800,
        verifyingContract: "0x1234567890123456789012345678901234567890",
      };

      expect(domain.name).toBe("VanaDataWallet");
      expect(domain.version).toBe("1");
      expect(domain.chainId).toBe(14800);
      expect(domain.verifyingContract).toBe(
        "0x1234567890123456789012345678901234567890",
      );
    });
  });

  describe("Message structures", () => {
    it("should support PermissionGrantMessage structure", () => {
      const message: PermissionGrantMessage = {
        application: "0x1234567890123456789012345678901234567890",
        files: [1, 2, 3],
        operation: "llm_inference",
        grant: "ipfs://QmGrant",
        parameters: "encoded-params",
        nonce: BigInt(123),
      };

      expect(message.application).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(message.files).toEqual([1, 2, 3]);
      expect(message.operation).toBe("llm_inference");
      expect(message.grant).toBe("ipfs://QmGrant");
      expect(message.parameters).toBe("encoded-params");
      expect(message.nonce).toBe(BigInt(123));
    });

    it("should support PermissionInputMessage structure", () => {
      const message: PermissionInputMessage = {
        nonce: BigInt(123),
        grant: "ipfs://QmGrant",
      };

      expect(message.nonce).toBe(BigInt(123));
      expect(message.grant).toBe("ipfs://QmGrant");
    });

    it("should support SimplifiedPermissionMessage structure", () => {
      const message: SimplifiedPermissionMessage = {
        application: "0x1234567890123456789012345678901234567890",
        grant: "ipfs://QmGrant",
        nonce: BigInt(123),
      };

      expect(message.application).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(message.grant).toBe("ipfs://QmGrant");
      expect(message.nonce).toBe(BigInt(123));
    });
  });

  describe("GrantFile", () => {
    it("should have all required properties", () => {
      const grantFile: GrantFile = {
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "Test prompt" },
        metadata: {
          timestamp: "2024-01-01T00:00:00Z",
          version: "1.0.0",
          userAddress: "0x1234567890123456789012345678901234567890",
        },
      };

      expect(grantFile.operation).toBe("llm_inference");
      expect(grantFile.files).toEqual([1, 2, 3]);
      expect(grantFile.parameters).toEqual({ prompt: "Test prompt" });
      expect(grantFile.metadata.timestamp).toBe("2024-01-01T00:00:00Z");
      expect(grantFile.metadata.version).toBe("1.0.0");
      expect(grantFile.metadata.userAddress).toBe(
        "0x1234567890123456789012345678901234567890",
      );
    });
  });

  describe("EIP-712 TypedData structures", () => {
    it("should support PermissionGrantTypedData structure", () => {
      const typedData: PermissionGrantTypedData = {
        domain: {
          name: "VanaDataWallet",
          version: "1",
          chainId: 14800,
          verifyingContract: "0x1234567890123456789012345678901234567890",
        },
        types: {
          Permission: [
            { name: "nonce", type: "uint256" },
            { name: "grant", type: "string" },
          ],
        },
        primaryType: "Permission",
        message: {
          nonce: BigInt(123),
          grant: "ipfs://QmGrant",
        },
        files: [1, 2, 3],
      };

      expect(typedData.domain.name).toBe("VanaDataWallet");
      expect(typedData.types.Permission).toHaveLength(2);
      expect(typedData.primaryType).toBe("Permission");
      expect(typedData.message.nonce).toBe(BigInt(123));
      expect(typedData.files).toEqual([1, 2, 3]);
    });

    it("should support GenericTypedData structure", () => {
      const typedData: GenericTypedData = {
        domain: {
          name: "VanaDataWallet",
          version: "1",
          chainId: 14800,
          verifyingContract: "0x1234567890123456789012345678901234567890",
        },
        types: {
          CustomType: [
            { name: "field1", type: "string" },
            { name: "field2", type: "uint256" },
          ],
        },
        primaryType: "CustomType",
        message: {
          field1: "test",
          field2: 123,
        },
      };

      expect(typedData.domain.name).toBe("VanaDataWallet");
      expect(typedData.types.CustomType).toHaveLength(2);
      expect(typedData.primaryType).toBe("CustomType");
      expect(typedData.message.field1).toBe("test");
      expect(typedData.message.field2).toBe(123);
    });
  });

  describe("Relayer response structures", () => {
    it("should support RelayerStorageResponse structure", () => {
      const response: RelayerStorageResponse = {
        grantUrl: "ipfs://QmStored",
        success: true,
      };

      expect(response.grantUrl).toBe("ipfs://QmStored");
      expect(response.success).toBe(true);
      expect(response.error).toBeUndefined();
    });

    it("should support RelayerStorageResponse with error", () => {
      const response: RelayerStorageResponse = {
        grantUrl: "",
        success: false,
        error: "Storage failed",
      };

      expect(response.grantUrl).toBe("");
      expect(response.success).toBe(false);
      expect(response.error).toBe("Storage failed");
    });

    it("should support RelayerTransactionResponse structure", () => {
      const response: RelayerTransactionResponse = {
        transactionHash:
          "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        success: true,
      };

      expect(response.transactionHash).toBe(
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      );
      expect(response.success).toBe(true);
      expect(response.error).toBeUndefined();
    });

    it("should support RelayerTransactionResponse with error", () => {
      const response: RelayerTransactionResponse = {
        transactionHash: "0x0",
        success: false,
        error: "Transaction failed",
      };

      expect(response.transactionHash).toBe("0x0");
      expect(response.success).toBe(false);
      expect(response.error).toBe("Transaction failed");
    });
  });

  describe("ContractInfo", () => {
    it("should have address and abi properties", () => {
      const contractInfo: ContractInfo = {
        address: "0x1234567890123456789012345678901234567890",
        abi: [
          {
            type: "function",
            name: "test",
            inputs: [],
            outputs: [],
            stateMutability: "view",
          },
        ],
      };

      expect(contractInfo.address).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(contractInfo.abi).toHaveLength(1);
      expect(contractInfo.abi[0].name).toBe("test");
    });
  });

  describe("UploadEncryptedFileResult", () => {
    it("should have all required properties", () => {
      const result: UploadEncryptedFileResult = {
        fileId: 123,
        url: "ipfs://QmEncrypted",
        size: 1024,
      };

      expect(result.fileId).toBe(123);
      expect(result.url).toBe("ipfs://QmEncrypted");
      expect(result.size).toBe(1024);
      expect(result.transactionHash).toBeUndefined();
    });

    it("should accept optional transactionHash", () => {
      const result: UploadEncryptedFileResult = {
        fileId: 456,
        url: "ipfs://QmEncrypted2",
        size: 2048,
        transactionHash:
          "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      };

      expect(result.fileId).toBe(456);
      expect(result.url).toBe("ipfs://QmEncrypted2");
      expect(result.size).toBe(2048);
      expect(result.transactionHash).toBe(
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      );
    });
  });
});
