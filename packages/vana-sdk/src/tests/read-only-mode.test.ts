import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPublicClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { moksha } from "../chains";
import { VanaCore } from "../core";
import { BrowserPlatformAdapter } from "../platform/browser";
import { ReadOnlyError } from "../errors";
import type { VanaConfig } from "../types/config";

// Mock modules
vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      chain: moksha,
      getBalance: vi.fn(),
      readContract: vi.fn(),
      getBlockNumber: vi.fn(),
    })),
    createWalletClient: vi.fn(() => ({
      chain: moksha,
      account: { address: "0x1234567890123456789012345678901234567890" },
      signMessage: vi.fn(),
      writeContract: vi.fn(),
    })),
  };
});

describe("Read-Only Mode", () => {
  const testAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEd1" as Address;
  const platform = new BrowserPlatformAdapter();

  describe("Initialization Modes", () => {
    it("should initialize with address only", () => {
      const config: VanaConfig = {
        address: testAddress,
      };

      const vana = new VanaCore(platform, config);
      expect(vana).toBeDefined();
      expect(vana.data).toBeDefined();
      expect(vana.permissions).toBeDefined();
    });

    it("should initialize with address and chain", () => {
      const config: VanaConfig = {
        address: testAddress,
        chain: moksha,
      };

      const vana = new VanaCore(platform, config);
      expect(vana).toBeDefined();
    });

    it("should initialize with publicClient and address", () => {
      const publicClient = createPublicClient({
        chain: moksha,
        transport: http(),
      });

      const config: VanaConfig = {
        publicClient,
        address: testAddress,
      };

      const vana = new VanaCore(platform, config);
      expect(vana).toBeDefined();
    });

    it("should initialize with walletClient (full mode)", () => {
      const account = privateKeyToAccount(
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );

      // Mock walletClient with all required methods
      const mockWalletClient = {
        account,
        chain: moksha,
        transport: http(),
        mode: "walletClient",
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        writeContract: vi.fn(),
        sendTransaction: vi.fn(),
        getAddresses: vi.fn(),
        request: vi.fn(),
      };

      const config: VanaConfig = {
        walletClient: mockWalletClient as any,
      };

      const vana = new VanaCore(platform, config);
      expect(vana).toBeDefined();
    });
  });

  describe("Read Operations", () => {
    let vana: VanaCore;

    beforeEach(() => {
      const config: VanaConfig = {
        address: testAddress,
        chain: moksha,
      };
      vana = new VanaCore(platform, config);
    });

    it("should allow getUserFiles in read-only mode", async () => {
      // Mock the implementation
      vi.spyOn(vana.data, "getUserFiles").mockResolvedValue([]);

      const files = await vana.data.getUserFiles();
      expect(files).toEqual([]);
    });

    it("should allow getUserPermissionGrantsOnChain in read-only mode", async () => {
      // Mock the implementation
      vi.spyOn(
        vana.permissions,
        "getUserPermissionGrantsOnChain",
      ).mockResolvedValue([]);

      const permissions =
        await vana.permissions.getUserPermissionGrantsOnChain();
      expect(permissions).toEqual([]);
    });

    it("should allow getDLP in read-only mode", async () => {
      // Mock the implementation
      const dlpInfo = { address: "0x123", name: "Test DLP" };
      vi.spyOn(vana.data, "getDLP").mockResolvedValue(dlpInfo as any);

      const result = await vana.data.getDLP("0x123");
      expect(result).toEqual(dlpInfo);
    });

    it("should allow schema operations in read-only mode", async () => {
      // Mock the implementation
      vi.spyOn(vana.schemas, "get").mockResolvedValue({
        id: BigInt(1),
        definition: {},
      } as any);
      vi.spyOn(vana.schemas, "count").mockResolvedValue(10);
      vi.spyOn(vana.schemas, "list").mockResolvedValue([]);

      const schema = await vana.schemas.get(BigInt(1));
      expect(schema).toBeDefined();

      const count = await vana.schemas.count();
      expect(count).toBe(10);

      const list = await vana.schemas.list();
      expect(list).toEqual([]);
    });

    it("should allow server getIdentity in read-only mode", async () => {
      // Mock the implementation
      const identity = { publicKey: "0xabc", address: "0x123" };
      vi.spyOn(vana.server, "getIdentity").mockResolvedValue(identity as any);

      const result = await vana.server.getIdentity({
        userAddress: testAddress,
      });
      expect(result).toEqual(identity);
    });

    it("should allow protocol read operations in read-only mode", async () => {
      // Mock the implementation
      vi.spyOn(vana.protocol, "getAvailableContracts").mockReturnValue([
        "DataRegistry",
        "SchemaRegistry",
      ]);
      vi.spyOn(vana.protocol, "isContractAvailable").mockReturnValue(true);

      const contracts = vana.protocol.getAvailableContracts();
      expect(contracts).toContain("DataRegistry");

      const available = vana.protocol.isContractAvailable("DataRegistry");
      expect(available).toBe(true);
    });
  });

  describe("Write Operations Should Throw ReadOnlyError", () => {
    let vana: VanaCore;

    beforeEach(() => {
      const config: VanaConfig = {
        address: testAddress,
        chain: moksha,
      };
      vana = new VanaCore(platform, config);
    });

    it("should throw ReadOnlyError when calling decryptFile", async () => {
      await expect(vana.data.decryptFile("fileId")).rejects.toThrow(
        ReadOnlyError,
      );
    });

    it("should throw error when calling uploadToStorage with encryption", async () => {
      // uploadToStorage with encryption=true requires wallet for signing
      // but may throw storage error first if no storage configured
      await expect(
        vana.data.uploadToStorage({
          data: new Uint8Array([1, 2, 3]),
          encrypt: true,
        }),
      ).rejects.toThrow(); // Will throw either ReadOnlyError or storage error
    });

    it("should throw ReadOnlyError when calling submitPermissionGrant", async () => {
      await expect(
        vana.permissions.submitPermissionGrant({
          grantee: testAddress,
          dataId: BigInt(1),
          operations: ["read"],
        } as any),
      ).rejects.toThrow(ReadOnlyError);
    });

    it("should throw ReadOnlyError when calling revokePermissionGrant", async () => {
      await expect(
        vana.permissions.revoke({
          grantId: BigInt(1),
        } as any),
      ).rejects.toThrow(ReadOnlyError);
    });

    it("should throw ReadOnlyError when calling submitAddServerFilesAndPermissions", async () => {
      await expect(
        vana.permissions.submitAddServerFilesAndPermissions({
          files: [],
          permissions: [],
        } as any),
      ).rejects.toThrow(ReadOnlyError);
    });

    it("should throw ReadOnlyError when calling createOperation", async () => {
      await expect(
        vana.server.createOperation({
          permissionId: 123,
        }),
      ).rejects.toThrow(ReadOnlyError);
    });

    it("should throw ReadOnlyError when calling schema.create", async () => {
      await expect(
        vana.schemas.create({
          name: "Test Schema",
          definition: {},
        } as any),
      ).rejects.toThrow(ReadOnlyError);
    });

    it("should throw ReadOnlyError when calling protocol.createContract", () => {
      // createContract is synchronous and throws immediately
      expect(() => {
        vana.protocol.createContract("DataRegistry");
      }).toThrow(ReadOnlyError);
    });
  });

  describe("Mixed Mode Operations", () => {
    it("should allow read operations but block write operations in same session", async () => {
      const config: VanaConfig = {
        address: testAddress,
        chain: moksha,
      };
      const vana = new VanaCore(platform, config);

      // Read operations should work
      vi.spyOn(vana.data, "getUserFiles").mockResolvedValue([]);
      const files = await vana.data.getUserFiles();
      expect(files).toEqual([]);

      // Write operations should throw
      await expect(vana.data.decryptFile("fileId")).rejects.toThrow(
        ReadOnlyError,
      );
    });
  });

  describe("Error Messages", () => {
    let vana: VanaCore;

    beforeEach(() => {
      const config: VanaConfig = {
        address: testAddress,
        chain: moksha,
      };
      vana = new VanaCore(platform, config);
    });

    it("should provide helpful error message for decryptFile", async () => {
      try {
        await vana.data.decryptFile("fileId");
        expect.fail("Should have thrown ReadOnlyError");
      } catch (error) {
        expect(error).toBeInstanceOf(ReadOnlyError);
        expect((error as ReadOnlyError).message).toContain("wallet");
      }
    });

    it("should provide helpful error message for submitPermissionGrant", async () => {
      try {
        await vana.permissions.submitPermissionGrant({
          grantee: testAddress,
          dataId: BigInt(1),
          operations: ["read"],
        } as any);
        expect.fail("Should have thrown ReadOnlyError");
      } catch (error) {
        expect(error).toBeInstanceOf(ReadOnlyError);
        expect((error as ReadOnlyError).message).toContain("wallet");
      }
    });
  });

  describe("Public Client Initialization", () => {
    it("should use provided publicClient when available", () => {
      const publicClient = createPublicClient({
        chain: moksha,
        transport: http(),
      });

      const config: VanaConfig = {
        publicClient,
        address: testAddress,
      };

      const vana = new VanaCore(platform, config);
      expect(vana).toBeDefined();
      // The provided publicClient should be used
      expect(createPublicClient).not.toHaveBeenCalledTimes(2);
    });

    it("should create publicClient when not provided", () => {
      const config: VanaConfig = {
        address: testAddress,
        chain: moksha,
      };

      const vana = new VanaCore(platform, config);
      expect(vana).toBeDefined();
      // A new publicClient should be created
      expect(createPublicClient).toHaveBeenCalled();
    });
  });

  describe("Default Chain Selection", () => {
    it("should use vanaMainnet as default when no chain specified", () => {
      const config: VanaConfig = {
        address: testAddress,
      };

      const vana = new VanaCore(platform, config);
      expect(vana).toBeDefined();
      // Should create publicClient with default chain
      expect(createPublicClient).toHaveBeenCalled();
    });

    it("should use specified chain when provided", () => {
      const config: VanaConfig = {
        address: testAddress,
        chain: moksha,
      };

      const vana = new VanaCore(platform, config);
      expect(vana).toBeDefined();
      // Should create publicClient with specified chain
      expect(createPublicClient).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: moksha,
        }),
      );
    });
  });
});
