import { describe, it, expect } from "vitest";
import type { VanaConfig, WalletConfig, ChainConfig } from "../types/config";
import type { UserFile, UploadEncryptedFileResult } from "../types/data";
import type {
  GrantedPermission,
  GrantPermissionParams,
  RevokePermissionParams,
  PermissionGrantDomain,
  PermissionGrantMessage,
  PermissionInputMessage,
  SimplifiedPermissionMessage,
  GrantFile,
  PermissionGrantTypedData,
  GenericTypedData,
} from "../types/permissions";
import type {
  RelayerStorageResponse,
  RelayerTransactionResponse,
} from "../types/relayer";
import type { ContractInfo } from "../types/contracts";
import type {
  GenericRequest,
  GenericResponse,
  DeepPartial,
  RequireKeys,
  OptionalKeys,
  Brand,
  Nominal,
} from "../types/generics";
import type { VanaContract } from "../abi";
import {
  Vana,
  getContractInfo,
  ContractFactory,
  RetryUtility,
  RateLimiter,
  MemoryCache,
  EventEmitter,
  ApiClient,
} from "../index";
import { isVanaChainId, isVanaChain } from "../types/chains";
import { isWalletConfig, isChainConfig } from "../types/config";
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
        id: 1n,
        files: [10, 20, 30],
        grant: "ipfs://QmGrant123",
        operation: "test_operation",
        parameters: {},
        grantor: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        grantee: "0x0987654321098765432109876543210987654321" as `0x${string}`,
        active: true,
      };

      expect(permission.id).toBe(1n);
      expect(permission.files).toEqual([10, 20, 30]);
      expect(permission.grant).toBe("ipfs://QmGrant123");
    });

    it("should accept optional properties", () => {
      const permission: GrantedPermission = {
        id: 2n,
        files: [40, 50],
        grant: "ipfs://QmGrant456",
        operation: "llm_inference",
        parameters: { prompt: "Test prompt" },
        grantor: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        grantee: "0x0987654321098765432109876543210987654321" as `0x${string}`,
        active: true,
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
        grantee: "0x1234567890123456789012345678901234567890",
        operation: "llm_inference",
        files: [1, 2, 3],
        parameters: { prompt: "Test prompt" },
        expires: Math.floor(Date.now() / 1000) + 3600,
      };

      expect(grantFile.operation).toBe("llm_inference");
      expect(grantFile.files).toEqual([1, 2, 3]);
      expect(grantFile.parameters).toEqual({ prompt: "Test prompt" });
      expect(grantFile.expires).toBeGreaterThan(Math.floor(Date.now() / 1000));
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
      expect((contractInfo.abi[0] as any).name).toBe("test");
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

  describe("Enhanced Configuration Types", () => {
    describe("WalletConfig", () => {
      it("should have required walletClient property", () => {
        const account = privateKeyToAccount(testPrivateKey);
        const walletClient = createWalletClient({
          account,
          chain: mokshaTestnet,
          transport: http(),
        });

        const config: WalletConfig = {
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

        const config: WalletConfig = {
          walletClient,
          relayerUrl: "https://relayer.test.com",
          storage: {
            providers: {
              ipfs: {
                upload: async () => ({
                  url: "https://ipfs.test.com/file",
                  size: 100,
                  contentType: "text/plain",
                }),
                download: async () => new Blob(),
                list: async () => [],
                delete: async () => true,
                getConfig: () => ({ name: "ipfs" }),
              } as any,
            },
            defaultProvider: "ipfs",
          },
        };

        expect(config.walletClient).toBeDefined();
        expect(config.relayerUrl).toBe("https://relayer.test.com");
        expect(config.storage?.defaultProvider).toBe("ipfs");
      });
    });

    describe("ChainConfig", () => {
      it("should have required chainId property", () => {
        const config: ChainConfig = {
          chainId: 14800,
        };

        expect(config.chainId).toBe(14800);
        expect(config.relayerUrl).toBeUndefined();
        expect(config.storage).toBeUndefined();
      });

      it("should accept optional properties", () => {
        const config: ChainConfig = {
          chainId: 1480,
          relayerUrl: "https://relayer.mainnet.com",
          storage: {
            providers: {
              ipfs: {
                upload: async () => ({
                  url: "https://ipfs.mainnet.com/file",
                  size: 100,
                  contentType: "text/plain",
                }),
                download: async () => new Blob(),
                list: async () => [],
                delete: async () => true,
                getConfig: () => ({ name: "ipfs" }),
              } as any,
            },
            defaultProvider: "ipfs",
          },
        };

        expect(config.chainId).toBe(1480);
        expect(config.relayerUrl).toBe("https://relayer.mainnet.com");
        expect(config.storage?.defaultProvider).toBe("ipfs");
      });
    });

    describe("Type Guards", () => {
      it("should correctly identify WalletConfig", () => {
        const account = privateKeyToAccount(testPrivateKey);
        const walletClient = createWalletClient({
          account,
          chain: mokshaTestnet,
          transport: http(),
        });

        const walletConfig: WalletConfig = { walletClient };
        const chainConfig: ChainConfig = { chainId: 14800 };

        expect(isWalletConfig(walletConfig)).toBe(true);
        expect(isWalletConfig(chainConfig)).toBe(false);
      });

      it("should correctly identify ChainConfig", () => {
        const account = privateKeyToAccount(testPrivateKey);
        const walletClient = createWalletClient({
          account,
          chain: mokshaTestnet,
          transport: http(),
        });

        const walletConfig: WalletConfig = { walletClient };
        const chainConfig: ChainConfig = { chainId: 14800 };

        expect(isChainConfig(chainConfig)).toBe(true);
        expect(isChainConfig(walletConfig)).toBe(false);
      });

      it("should correctly identify VanaChainId", () => {
        expect(isVanaChainId(14800)).toBe(true); // Moksha testnet
        expect(isVanaChainId(1480)).toBe(true); // Vana mainnet
        expect(isVanaChainId(1)).toBe(false); // Ethereum mainnet
        expect(isVanaChainId(1337)).toBe(false); // Local chain
      });

      it("should correctly identify VanaChain", () => {
        expect(isVanaChain(mokshaTestnet)).toBe(true);
        expect(
          isVanaChain({
            id: 1,
            name: "Ethereum",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: { default: { http: ["https://eth.llamarpc.com"] } },
          }),
        ).toBe(false);
      });
    });
  });

  describe("Generic Type System", () => {
    describe("GenericRequest", () => {
      it("should support typed parameters", () => {
        const request: GenericRequest<
          { id: number; name: string },
          { timeout: number }
        > = {
          params: { id: 123, name: "test" },
          options: { timeout: 5000 },
        };

        expect(request.params.id).toBe(123);
        expect(request.params.name).toBe("test");
        expect(request.options?.timeout).toBe(5000);
      });
    });

    describe("GenericResponse", () => {
      it("should support typed data and metadata", () => {
        const response: GenericResponse<
          { result: string },
          { timestamp: number }
        > = {
          data: { result: "success" },
          meta: { timestamp: 1234567890 },
          success: true,
        };

        expect(response.data.result).toBe("success");
        expect(response.meta?.timestamp).toBe(1234567890);
        expect(response.success).toBe(true);
      });

      it("should support error structure", () => {
        const response: GenericResponse<never> = {
          data: undefined as never,
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: { field: "email" },
          },
        };

        expect(response.success).toBe(false);
        expect(response.error?.code).toBe("VALIDATION_ERROR");
        expect(response.error?.message).toBe("Invalid input");
        expect(response.error?.details).toEqual({ field: "email" });
      });
    });
  });

  describe("Generic Utilities", () => {
    describe("RetryUtility", () => {
      it("should successfully retry failed operations", async () => {
        let attempts = 0;
        const operation = async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error("Temporary failure");
          }
          return "success";
        };

        const result = await RetryUtility.withRetry(operation, {
          maxAttempts: 3,
          baseDelay: 10,
          backoffMultiplier: 1,
        });

        expect(result).toBe("success");
        expect(attempts).toBe(3);
      });

      it("should respect shouldRetry condition", async () => {
        let attempts = 0;
        const operation = async () => {
          attempts++;
          throw new Error("Permanent failure");
        };

        await expect(
          RetryUtility.withRetry(operation, {
            maxAttempts: 3,
            baseDelay: 10,
            shouldRetry: (error) => error.message.includes("temporary"),
          }),
        ).rejects.toThrow("Permanent failure");

        expect(attempts).toBe(1);
      });
    });

    describe("RateLimiter", () => {
      it("should allow requests within limit", async () => {
        const rateLimiter = new RateLimiter({
          requestsPerWindow: 5,
          windowMs: 1000,
        });

        const allowed = await rateLimiter.checkLimit();
        expect(allowed).toBe(true);
        expect(rateLimiter.getRemainingRequests()).toBe(4);
      });

      it("should block requests exceeding limit", async () => {
        const rateLimiter = new RateLimiter({
          requestsPerWindow: 2,
          windowMs: 1000,
        });

        await rateLimiter.checkLimit();
        await rateLimiter.checkLimit();

        const blocked = await rateLimiter.checkLimit();
        expect(blocked).toBe(false);
        expect(rateLimiter.getRemainingRequests()).toBe(0);
      });
    });

    describe("MemoryCache", () => {
      it("should store and retrieve values", async () => {
        const cache = new MemoryCache<string, number>();

        await cache.set("key1", 123);
        const value = await cache.get("key1");

        expect(value).toBe(123);
        expect(await cache.has("key1")).toBe(true);
      });

      it("should respect TTL", async () => {
        const cache = new MemoryCache<string, number>();

        await cache.set("key1", 123, 50);
        expect(await cache.get("key1")).toBe(123);

        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(await cache.get("key1")).toBeUndefined();
      });
    });

    describe("EventEmitter", () => {
      it("should emit events to subscribers", () => {
        const emitter = new EventEmitter<{ type: string; data: unknown }>();
        const events: { type: string; data: unknown }[] = [];

        const unsubscribe = emitter.subscribe({
          notify: (event) => {
            events.push(event);
          },
        });

        emitter.emit({ type: "test", data: "value" });
        emitter.emit({ type: "test2", data: 123 });

        expect(events).toHaveLength(2);
        expect(events[0]).toEqual({ type: "test", data: "value" });
        expect(events[1]).toEqual({ type: "test2", data: 123 });

        unsubscribe();
        emitter.emit({ type: "test3", data: "ignored" });
        expect(events).toHaveLength(2);
      });
    });

    describe("ApiClient", () => {
      it("should handle basic requests", async () => {
        const client = new ApiClient({
          baseUrl: "https://api.example.com",
          timeout: 5000,
        });

        const stats = client.getStats();
        expect(stats.rateLimiter).toBeDefined();
        expect(stats.circuitBreaker).toBeDefined();
        expect(stats.middleware.count).toBe(0);
      });

      it("should build URLs correctly", () => {
        const client = new ApiClient({
          baseUrl: "https://api.example.com",
        });

        const fullUrl = (client as any).buildUrl("/users");
        expect(fullUrl).toBe("https://api.example.com/users");

        const fullUrlWithSlash = (client as any).buildUrl("users");
        expect(fullUrlWithSlash).toBe("https://api.example.com/users");
      });
    });
  });

  describe("Utility Types", () => {
    describe("DeepPartial", () => {
      it("should make all properties optional recursively", () => {
        type Original = {
          a: string;
          b: {
            c: number;
            d: {
              e: boolean;
            };
          };
        };

        const partial: DeepPartial<Original> = {
          b: {
            d: {}, // e is optional
          },
        };

        expect(partial.a).toBeUndefined();
        expect(partial.b?.c).toBeUndefined();
        expect(partial.b?.d?.e).toBeUndefined();
      });
    });

    describe("RequireKeys", () => {
      it("should make specific keys required", () => {
        type Original = {
          a?: string;
          b?: number;
          c?: boolean;
        };

        const required: RequireKeys<Original, "a" | "b"> = {
          a: "required",
          b: 123,
          // c is still optional
        };

        expect(required.a).toBe("required");
        expect(required.b).toBe(123);
        expect(required.c).toBeUndefined();
      });
    });

    describe("OptionalKeys", () => {
      it("should make specific keys optional", () => {
        type Original = {
          a: string;
          b: number;
          c: boolean;
        };

        const optional: OptionalKeys<Original, "a" | "b"> = {
          c: true,
          // a and b are now optional
        };

        expect(optional.a).toBeUndefined();
        expect(optional.b).toBeUndefined();
        expect(optional.c).toBe(true);
      });
    });

    describe("Brand and Nominal types", () => {
      it("should create distinct types", () => {
        type UserId = Brand<number, "UserId">;
        type ProductId = Brand<number, "ProductId">;

        const userId = 123 as UserId;
        const productId = 456 as ProductId;

        expect(typeof userId).toBe("number");
        expect(typeof productId).toBe("number");
        expect(userId).toBe(123);
        expect(productId).toBe(456);
      });

      it("should support nominal types", () => {
        type Email = Nominal<string, "Email">;
        type Username = Nominal<string, "Username">;

        const email = "test@example.com" as Email;
        const username = "testuser" as Username;

        expect(typeof email).toBe("string");
        expect(typeof username).toBe("string");
        expect(email).toBe("test@example.com");
        expect(username).toBe("testuser");
      });
    });
  });

  describe("Enhanced Vana Class", () => {
    describe("Factory Methods", () => {
      it("should create Vana from ChainConfig", () => {
        const account = privateKeyToAccount(testPrivateKey);
        const vana = Vana.fromChain({
          chainId: 14800,
          rpcUrl: "https://rpc.moksha.vana.org",
          account,
        });
        expect(vana).toBeInstanceOf(Vana);
      });

      it("should create Vana from WalletConfig", () => {
        const account = privateKeyToAccount(testPrivateKey);
        const walletClient = createWalletClient({
          account,
          chain: mokshaTestnet,
          transport: http(),
        });

        const vana = Vana.fromWallet({ walletClient });
        expect(vana).toBeInstanceOf(Vana);
      });
    });

    describe("Dual Configuration Support", () => {
      it("should work with both WalletConfig and ChainConfig", () => {
        const account = privateKeyToAccount(testPrivateKey);
        const walletClient = createWalletClient({
          account,
          chain: mokshaTestnet,
          transport: http(),
        });

        const vanaWithWallet = new Vana({ walletClient });
        const account2 = privateKeyToAccount(testPrivateKey);
        const vanaWithChain = new Vana({
          chainId: 14800,
          rpcUrl: "https://rpc.moksha.vana.org",
          account: account2,
        });

        expect(vanaWithWallet).toBeInstanceOf(Vana);
        expect(vanaWithChain).toBeInstanceOf(Vana);
      });
    });
  });

  describe("Contract Type Inference", () => {
    it("should provide proper type inference for contract methods", () => {
      const contractInfo = getContractInfo("PermissionRegistry");
      expect(contractInfo.address).toBeDefined();
      expect(contractInfo.abi).toBeDefined();
    });

    it("should support contract controller with typed methods", () => {
      const info = getContractInfo("DataRegistry");
      expect(info.address).toBeDefined();
      expect(Array.isArray(info.abi)).toBe(true);
    });
  });

  describe("Contract Factory", () => {
    it("should create contracts with proper typing", () => {
      const account = privateKeyToAccount(testPrivateKey);
      const walletClient = createWalletClient({
        account,
        chain: mokshaTestnet,
        transport: http(),
      });

      const factory = new ContractFactory(walletClient);
      const contract = factory.create("PermissionRegistry");
      expect(contract).toBeDefined();
    });

    it("should get contract info without creating instances", () => {
      const account = privateKeyToAccount(testPrivateKey);
      const walletClient = createWalletClient({
        account,
        chain: mokshaTestnet,
        transport: http(),
      });

      const factory = new ContractFactory(walletClient);
      const info = factory.getInfo("DataRegistry");
      expect(info.address).toBeDefined();
      expect(info.abi).toBeDefined();
    });

    it("should list available contracts", () => {
      const account = privateKeyToAccount(testPrivateKey);
      const walletClient = createWalletClient({
        account,
        chain: mokshaTestnet,
        transport: http(),
      });

      const factory = new ContractFactory(walletClient);
      const contracts = factory.getAvailableContracts();
      expect(Array.isArray(contracts)).toBe(true);
      expect(contracts.length).toBeGreaterThan(0);
    });
  });
});
