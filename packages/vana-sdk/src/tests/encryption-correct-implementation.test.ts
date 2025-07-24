/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as viem from "viem";
import type { WalletClient, PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { mockPlatformAdapter } from "./mocks/platformAdapter";
import { mokshaTestnet } from "../config/chains";
import type { VanaChain } from "../types";
import type { StorageManager } from "../storage/manager";
import type { StorageProvider } from "../types/storage";

// Mock viem's parseEventLogs function
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal() as typeof import('viem');
  return {
    ...actual,
    parseEventLogs: vi.fn(() => [{
      eventName: 'PermissionGranted',
      args: {
        fileId: 123n,
        account: '0xvalidator',
        encryptedKey: 'encrypted-key-data',
      }
    }]),
    createPublicClient: vi.fn(() => {
      // Return a mock client
      return {
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
          blockNumber: 12345n,
          gasUsed: 100000n,
          logs: [],
        }),
        readContract: vi.fn(),
        // Add other methods as needed
      };
    }),
    http: vi.fn(() => ({
      // Mock transport
    })),
    createWalletClient: vi.fn((config) => {
      // Return a mock wallet client
      const mockClient = {
        account: config?.account || testAccount,
        chain: config?.chain || mokshaTestnet,
        signMessage: vi.fn(),
        signTypedData: vi.fn(),
        writeContract: vi.fn(),
        getAddresses: vi.fn().mockResolvedValue([testAccount.address]),
        getChainId: vi.fn().mockResolvedValue(14800),
      };
      return mockClient;
    }),
  };
});

/**
 * Tests for the CORRECT Vana encryption implementation
 * This tests the architecture as it should be, based on the reference implementation
 */

// Create a test account
const testAccount = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

// Create proper wallet client for testing
const createMockWalletClient = (): WalletClient & { chain: VanaChain } => {
  // Use the mocked createWalletClient from viem
  const baseClient = viem.createWalletClient({
    account: testAccount,
    chain: mokshaTestnet,
    transport: viem.http("https://rpc.moksha.vana.org"),
  }) as WalletClient & { chain: VanaChain };

  // The mock already includes these methods, but we can override if needed
  return baseClient;
};

// Create proper public client for testing
const createMockPublicClient = (): PublicClient => {
  const client = viem.createPublicClient({
    chain: mokshaTestnet,
    transport: viem.http("https://rpc.moksha.vana.org"),
  });
  
  // Add mock for waitForTransactionReceipt
  (client as any).waitForTransactionReceipt = vi.fn().mockResolvedValue({
    blockNumber: 12345n,
    gasUsed: 100000n,
    logs: [],
  });
  
  return client;
};

// Create proper StorageProvider mock
const createMockStorageProvider = (): StorageProvider => {
  return {
    upload: vi.fn().mockResolvedValue({
      url: "https://example.com/file123",
      size: 1024,
      contentType: "application/octet-stream",
    }),
    download: vi.fn().mockResolvedValue(new Blob()),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
    getConfig: vi.fn().mockReturnValue({}),
  };
};

// Create proper StorageManager mock
const createMockStorageManager = (): StorageManager => {
  return {
    upload: vi.fn().mockResolvedValue({
      url: "https://example.com/file123",
      size: 1024,
      contentType: "application/octet-stream",
    }),
    download: vi.fn().mockResolvedValue(new Blob()),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
    register: vi.fn(),
    getProvider: vi.fn(),
    getAllProviders: vi.fn().mockReturnValue([]),
    setDefaultProvider: vi.fn(),
    getDefaultProvider: vi.fn(),
    providers: new Map(),
    defaultProvider: null,
  } as any;
};

// Mock wallet for testing
const mockWallet = createMockWalletClient();

describe("Correct Vana Encryption Implementation", () => {
  describe("Level 3: Raw Utilities", () => {
    describe("generateEncryptionKey", () => {
      it("should generate deterministic key from wallet signature", async () => {
        const { generateEncryptionKey } = await import("../utils/encryption");

        // Mock consistent signature
        (mockWallet.signMessage as any).mockResolvedValue(
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        );

        const key1 = await generateEncryptionKey(mockWallet, mockPlatformAdapter, "test seed");
        const key2 = await generateEncryptionKey(mockWallet, mockPlatformAdapter, "test seed");

        // Should be deterministic - same wallet + seed = same key
        expect(key1).toBe(key2);
        expect(key1).toBe(
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        );
        expect(mockWallet.signMessage).toHaveBeenCalledWith({
          account: mockWallet.account,
          message: "test seed",
        });
      });
    });

    describe("Password-based PGP encryption", () => {
      it("should encrypt data using wallet signature as password", async () => {
        const { encryptBlobWithSignedKey, decryptBlobWithSignedKey } =
          await import("../utils/encryption");
        const testData = new Blob(["Hello Vana!"], { type: "text/plain" });
        const walletSignature =
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

        // This should use password-based PGP encryption
        const encrypted = await encryptBlobWithSignedKey(
          testData,
          walletSignature,
          mockPlatformAdapter,
        );
        expect(encrypted).toBeInstanceOf(Blob);

        // Should be able to decrypt with same signature
        const decrypted = await decryptBlobWithSignedKey(
          encrypted,
          walletSignature,
          mockPlatformAdapter,
        );
        expect(decrypted).toBeInstanceOf(Blob);

        const decryptedText = await decrypted.text();
        expect(decryptedText).toBe("Hello Vana!");
      });

      it("should round-trip encrypt/decrypt with wallet signature", async () => {
        const { encryptBlobWithSignedKey, decryptBlobWithSignedKey } =
          await import("../utils/encryption");
        const originalText = "Hello Vana!";
        const testData = new Blob([originalText], { type: "text/plain" });
        const signature =
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

        const encrypted = await encryptBlobWithSignedKey(
          testData,
          signature,
          mockPlatformAdapter,
        );
        const decrypted = await decryptBlobWithSignedKey(
          encrypted,
          signature,
          mockPlatformAdapter,
        );

        const decryptedText = await decrypted.text();
        expect(decryptedText).toBe(originalText);
      });

      it("should use password-based encryption (any string as password)", async () => {
        const { encryptBlobWithSignedKey, decryptBlobWithSignedKey } =
          await import("../utils/encryption");
        const originalText = "Hello Vana!";
        const testData = new Blob([originalText], { type: "text/plain" });
        // Even an armored key can be used as a password in password-based encryption
        const password =
          "-----BEGIN PGP PUBLIC KEY BLOCK-----\nTest\n-----END PGP PUBLIC KEY BLOCK-----";

        const encrypted = await encryptBlobWithSignedKey(
          testData,
          password,
          mockPlatformAdapter,
        );
        const decrypted = await decryptBlobWithSignedKey(
          encrypted,
          password,
          mockPlatformAdapter,
        );

        const decryptedText = await decrypted.text();
        expect(decryptedText).toBe(originalText);
      });
    });

    describe("ECDH wallet key encryption", () => {
      it("should encrypt data with wallet public key using ECDH", async () => {
        const { encryptWithWalletPublicKey } = await import(
          "../utils/encryption"
        );

        // Use a valid secp256k1 public key format (65 bytes with 0x04 prefix)
        const testData = "secret signature";
        const publicKey =
          "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

        const encrypted = await encryptWithWalletPublicKey(
          testData,
          publicKey,
          mockPlatformAdapter,
        );
        expect(typeof encrypted).toBe("string");
        expect(encrypted).toMatch(/^[0-9a-fA-F]+$/); // Should be hex string
      });

      it("should round-trip encrypt/decrypt with wallet keys", async () => {
        const { encryptWithWalletPublicKey, decryptWithWalletPrivateKey } =
          await import("../utils/encryption");

        // Use a valid test key pair from eccrypto-js generation
        const testData = "0x1234567890abcdef"; // simulating a signature
        const privateKey =
          "85271071a553feafb93839045545c233d0518e0b0fc583f88038f8b0e32e9f18";
        const publicKey =
          "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

        const encrypted = await encryptWithWalletPublicKey(
          testData,
          publicKey,
          mockPlatformAdapter,
        );
        const decrypted = await decryptWithWalletPrivateKey(
          encrypted,
          privateKey,
          mockPlatformAdapter,
        );

        expect(decrypted).toBe(testData);
      });
    });
  });

  describe("Level 2: Controller Methods", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should generate encryption keys through controller methods", async () => {
      // Test that data controller's internal encryption key generation works
      const { generateEncryptionKey } = await import("../utils/encryption");
      const mockWalletClient = createMockWalletClient();
      (mockWalletClient.signMessage as any).mockResolvedValue("0xsignature123");

      // This should use the fixed utility function for deterministic key generation
      const key = await generateEncryptionKey(mockWalletClient, mockPlatformAdapter, "test seed");
      expect(key).toBe("0xsignature123");
      expect(mockWalletClient.signMessage).toHaveBeenCalledWith({
        account: mockWalletClient.account,
        message: "test seed",
      });
    });

    it("should orchestrate file encryption through controller uploadFileWithPermissions", async () => {
      // Test that controller methods orchestrate the Level 3 utilities correctly
      const { DataController } = await import("../controllers/data");

      // Mock the wallet and storage manager for the test
      const mockWalletClient = createMockWalletClient();
      (mockWalletClient.signMessage as any).mockResolvedValue("0xsignature123");
      (mockWalletClient.getAddresses as any).mockResolvedValue([
        testAccount.address,
      ]);

      const mockPublicClient = createMockPublicClient();

      const mockStorageManager = createMockStorageManager();

      const mockContext = {
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        applicationClient: mockWalletClient,
        platform: mockPlatformAdapter,
        storageManager: mockStorageManager,
      };

      const controller = new DataController(mockContext);

      // Mock the addFileWithPermissions method since we don't want to hit the blockchain
      controller.addFileWithPermissions = vi.fn().mockResolvedValue({
        fileId: 123,
        transactionHash: "0xtxhash",
      });

      const testData = new Blob(["test file content"], { type: "text/plain" });
      const permissions = [
        {
          account: "0xvalidatoraddress" as any,
          publicKey:
            "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1",
        },
      ];

      // This should orchestrate: generateEncryptionKey -> encryptBlobWithSignedKey -> encryptWithWalletPublicKey -> addFileWithPermissions
      const result = await controller.uploadFileWithPermissions(
        testData,
        permissions,
        "test.txt",
      );

      expect(result.fileId).toBe(123);
      expect(result.url).toBe("https://example.com/file123");
      expect(mockStorageManager.upload).toHaveBeenCalled();
      expect(controller.addFileWithPermissions).toHaveBeenCalled();
    });

    it("should orchestrate permission granting through controller addPermissionToFile", async () => {
      // Test that the controller can grant permissions using the correct encryption architecture
      const { DataController } = await import("../controllers/data");

      const mockWalletClient = createMockWalletClient();
      (mockWalletClient.signMessage as any).mockResolvedValue("0xsignature123");
      (mockWalletClient.getAddresses as any).mockResolvedValue([
        testAccount.address,
      ]);
      (mockWalletClient.writeContract as any).mockResolvedValue("0xtxhash");

      const mockPublicClient = createMockPublicClient();

      const mockContext = {
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        applicationClient: mockWalletClient,
        platform: mockPlatformAdapter,
      };

      const controller = new DataController(mockContext);

      const validatorPublicKey =
        "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

      // This should orchestrate: generateEncryptionKey -> encryptWithWalletPublicKey -> writeContract
      const result = await controller.addPermissionToFile(
        123,
        "0xvalidator" as any,
        validatorPublicKey,
      );

      expect(result.transactionHash).toBe("0xtxhash");
      expect(mockWalletClient.signMessage).toHaveBeenCalledWith({
        account: mockWalletClient.account,
        message: "Please sign to retrieve your encryption key",
      });
      expect(mockWalletClient.writeContract).toHaveBeenCalled();
    });

    it("should decrypt files through controller methods using wallet signatures", async () => {
      // Test that the controller can decrypt files using the correct architecture
      const { DataController } = await import("../controllers/data");
      const { encryptBlobWithSignedKey } = await import("../utils/encryption");

      const mockWalletClient = createMockWalletClient();
      (mockWalletClient.signMessage as any).mockResolvedValue("0xsignature123");

      const mockPublicClient = createMockPublicClient();

      const mockContext = {
        walletClient: mockWalletClient,
        publicClient: mockPublicClient,
        platform: mockPlatformAdapter,
      };

      const controller = new DataController(mockContext);

      // First encrypt some test data with the same signature
      const originalData = new Blob(["Hello Vana!"], { type: "text/plain" });
      const encryptedData = await encryptBlobWithSignedKey(
        originalData,
        "0xsignature123",
        mockPlatformAdapter,
      );

      // Mock fetch to return our encrypted data
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(encryptedData),
      });

      const testFile = {
        id: 123,
        url: "https://example.com/encrypted-file",
        ownerAddress: "0x123456789abcdef" as any,
        addedAtBlock: BigInt(100),
      };

      // This should orchestrate: generateEncryptionKey -> fetch -> decryptBlobWithSignedKey
      const decryptedBlob = await controller.decryptFile(testFile);
      const decryptedText = await decryptedBlob.text();

      expect(decryptedText).toBe("Hello Vana!");
      expect(mockWalletClient.signMessage).toHaveBeenCalledWith({
        account: mockWalletClient.account,
        message: "Please sign to retrieve your encryption key",
      });
    });
  });

  describe("Level 1: High-Level Client", () => {
    it("should provide Vana() factory for initialization", async () => {
      // Test that Vana client provides simple high-level API
      const { Vana, VanaNodeImpl } = await import("../index.node");

      // Check that the Vana factory function exists and can be instantiated
      expect(Vana).toBeDefined();
      expect(typeof Vana).toBe("function");

      const vana = Vana({ walletClient: mockWallet });
      expect(vana).toBeInstanceOf(VanaNodeImpl);
    });

    it("should provide high-level data controller methods through Vana client", async () => {
      // Test that Vana client exposes the data controller with correct architecture
      const { Vana } = await import("../index.node");

      // Mock wallet configuration for testing
      const mockWalletClient = createMockWalletClient();
      (mockWalletClient.signMessage as any).mockResolvedValue("0xsignature123");
      (mockWalletClient.signTypedData as any).mockResolvedValue(
        "0xsignature123",
      );
      (mockWalletClient.getAddresses as any).mockResolvedValue([
        testAccount.address,
      ]);

      const config = {
        walletClient: mockWalletClient,
      };

      // Create Vana instance
      const vana = Vana(config);

      // Verify that the data controller methods are accessible
      expect(vana.data).toBeDefined();
      expect(typeof vana.data.uploadFileWithPermissions).toBe("function");
      expect(typeof vana.data.addPermissionToFile).toBe("function");
      expect(typeof vana.data.decryptFile).toBe("function");
      expect(typeof vana.data.decryptFileWithPermission).toBe("function");
    });

    it("should provide one-liner file upload with permissions", async () => {
      // Test the high-level uploadFileWithPermissions method that combines all steps
      const { Vana } = await import("../index.node");

      // Mock wallet configuration
      const mockWalletClient = createMockWalletClient();
      (mockWalletClient.signMessage as any).mockResolvedValue("0xsignature123");
      (mockWalletClient.signTypedData as any).mockResolvedValue(
        "0xsignature123",
      );
      (mockWalletClient.getAddresses as any).mockResolvedValue([
        testAccount.address,
      ]);

      const mockStorageProvider = createMockStorageProvider();

      const config = {
        walletClient: mockWalletClient,
        storage: {
          providers: {
            default: mockStorageProvider,
          },
          defaultProvider: "default",
        },
      };

      const vana = Vana(config);

      // Mock the blockchain interaction
      vana.data.addFileWithPermissions = vi.fn().mockResolvedValue({
        fileId: 123,
        transactionHash: "0xtxhash",
      });

      const testData = new Blob(["test content"], { type: "text/plain" });
      const permissions = [
        {
          account: "0xvalidator" as any,
          publicKey:
            "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1",
        },
      ];

      // This should be a one-liner that handles: generateKey -> encrypt -> upload -> grantPermissions
      const result = await vana.data.uploadFileWithPermissions(
        testData,
        permissions,
        "test.txt",
      );

      expect(result.fileId).toBe(123);
      expect(result.url).toBe("https://example.com/file123");
      expect(mockStorageProvider.upload).toHaveBeenCalled();
    });

    it("should provide one-liner permission granting", { timeout: 10000 }, async () => {
      // Test the high-level addPermissionToFile method
      const { Vana } = await import("../index.node");

      const mockWalletClient = createMockWalletClient();
      (mockWalletClient.signMessage as any).mockResolvedValue("0xsignature123");
      (mockWalletClient.signTypedData as any).mockResolvedValue(
        "0xsignature123",
      );
      (mockWalletClient.getAddresses as any).mockResolvedValue([
        testAccount.address,
      ]);
      (mockWalletClient.writeContract as any).mockResolvedValue("0xtxhash");

      const config = {
        walletClient: mockWalletClient,
      };

      const vana = Vana(config);

      const validatorPublicKey =
        "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

      // This should be a one-liner that handles: generateKey -> encryptWithPublicKey -> addPermission
      const result = await vana.data.addPermissionToFile(
        123,
        "0xvalidator" as any,
        validatorPublicKey,
      );

      expect(result.transactionHash).toBe("0xtxhash");
      expect(mockWalletClient.signMessage).toHaveBeenCalledWith({
        account: mockWalletClient.account,
        message: "Please sign to retrieve your encryption key",
      });
    });
  });

  describe("Integration: End-to-End Workflow", () => {
    it("should support complete data sharing workflow", async () => {
      // 1. User encrypts data with wallet signature
      const {
        generateEncryptionKey,
        encryptBlobWithSignedKey,
        encryptWithWalletPublicKey,
      } = await import("../utils/encryption");

      (mockWallet.signMessage as any).mockResolvedValue(
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      );

      const originalData = new Blob(["Private user data"], {
        type: "text/plain",
      });
      const encryptionKey = await generateEncryptionKey(mockWallet, mockPlatformAdapter);
      const encryptedData = await encryptBlobWithSignedKey(
        originalData,
        encryptionKey,
        mockPlatformAdapter,
      );

      // Verify encryption step
      expect(encryptionKey).toBeDefined();
      expect(typeof encryptionKey).toBe("string");
      expect(encryptedData).toBeInstanceOf(Blob);
      expect(encryptedData.size).toBeGreaterThan(0);

      // 2. User shares encryption key with validator
      const validatorPublicKey =
        "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";
      const encryptedKey = await encryptWithWalletPublicKey(
        encryptionKey,
        validatorPublicKey,
        mockPlatformAdapter,
      );

      // Verify key sharing step
      expect(typeof encryptedKey).toBe("string");
      expect(encryptedKey).toMatch(/^[0-9a-fA-F]+$/);
      expect(encryptedKey.length).toBeGreaterThan(0);

      // 3. Validator receives and can access data (simulated)
      // In real scenario, validator would decrypt encryptedKey with their private key
      // then use the decrypted signature to decrypt the data

      // Verify final workflow state
      expect(encryptedData).toBeInstanceOf(Blob);
      expect(typeof encryptedKey).toBe("string");
      expect(encryptedKey).toMatch(/^[0-9a-fA-F]+$/);

      // Verify wallet was called for encryption key generation
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockWallet.account,
        message: expect.stringContaining("encryption"),
      });
    });
  });
});
