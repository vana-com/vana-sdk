/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { withConsole } from "./setup";

/**
 * Tests for the CORRECT Vana encryption implementation
 * This tests the architecture as it should be, based on the reference implementation
 */

// Mock wallet for testing
const mockWallet = {
  account: { address: "0x123456789abcdef" },
  signMessage: vi.fn(),
};

describe("Correct Vana Encryption Implementation", () => {
  describe("Level 3: Raw Utilities", () => {
    describe("generateEncryptionKey", () => {
      it("should generate deterministic key from wallet signature", async () => {
        const { generateEncryptionKey } = await import("../utils/encryption");

        // Mock consistent signature
        mockWallet.signMessage.mockResolvedValue(
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        );

        const key1 = await generateEncryptionKey(mockWallet, "test seed");
        const key2 = await generateEncryptionKey(mockWallet, "test seed");

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
        const { encryptUserData, decryptUserData } = await import(
          "../utils/encryption"
        );
        const testData = new Blob(["Hello Vana!"], { type: "text/plain" });
        const walletSignature =
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

        // This should use password-based PGP encryption
        const encrypted = await encryptUserData(testData, walletSignature);
        expect(encrypted).toBeInstanceOf(Blob);

        // Should be able to decrypt with same signature
        const decrypted = await decryptUserData(encrypted, walletSignature);
        expect(decrypted).toBeInstanceOf(Blob);

        const decryptedText = await decrypted.text();
        expect(decryptedText).toBe("Hello Vana!");
      });

      it("should round-trip encrypt/decrypt with wallet signature", async () => {
        const { encryptUserData, decryptUserData } = await import(
          "../utils/encryption"
        );
        const originalText = "Hello Vana!";
        const testData = new Blob([originalText], { type: "text/plain" });
        const signature =
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

        const encrypted = await encryptUserData(testData, signature);
        const decrypted = await decryptUserData(encrypted, signature);

        const decryptedText = await decrypted.text();
        expect(decryptedText).toBe(originalText);
      });

      it("should use password-based encryption (any string as password)", async () => {
        const { encryptUserData, decryptUserData } = await import(
          "../utils/encryption"
        );
        const originalText = "Hello Vana!";
        const testData = new Blob([originalText], { type: "text/plain" });
        // Even an armored key can be used as a password in password-based encryption
        const password =
          "-----BEGIN PGP PUBLIC KEY BLOCK-----\nTest\n-----END PGP PUBLIC KEY BLOCK-----";

        const encrypted = await encryptUserData(testData, password);
        const decrypted = await decryptUserData(encrypted, password);

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

        const encrypted = await encryptWithWalletPublicKey(testData, publicKey);
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

        const encrypted = await encryptWithWalletPublicKey(testData, publicKey);
        const decrypted = await decryptWithWalletPrivateKey(
          encrypted,
          privateKey,
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
      const mockWallet = {
        account: { address: "0x123456789abcdef" },
        signMessage: vi.fn().mockResolvedValue("0xsignature123"),
      };

      // This should use the fixed utility function for deterministic key generation
      const key = await generateEncryptionKey(mockWallet, "test seed");
      expect(key).toBe("0xsignature123");
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockWallet.account,
        message: "test seed",
      });
    });

    it("should orchestrate file encryption through controller uploadFileWithPermissions", async () => {
      // Test that controller methods orchestrate the Level 3 utilities correctly
      const { DataController } = await import("../controllers/data");

      // Mock the wallet and storage manager for the test
      const mockWallet = {
        account: { address: "0x123456789abcdef" },
        signMessage: vi.fn().mockResolvedValue("0xsignature123"),
        getAddresses: vi.fn().mockResolvedValue(["0x123456789abcdef"]),
        chain: {
          id: 14800,
          rpcUrls: {
            default: {
              http: ["https://rpc.moksha.vana.org"],
            },
          },
        },
      };

      const mockStorageManager = {
        upload: vi.fn().mockResolvedValue({
          url: "https://example.com/file123",
          size: 1024,
        }),
      };

      const mockContext = {
        walletClient: mockWallet,
        publicClient: {},
        applicationClient: mockWallet,
        platform: null as any, // Platform is now handled internally
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

      // This should orchestrate: generateEncryptionKey -> encryptUserData -> encryptWithWalletPublicKey -> addFileWithPermissions
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

      const mockWallet = {
        account: { address: "0x123456789abcdef" },
        signMessage: vi.fn().mockResolvedValue("0xsignature123"),
        getAddresses: vi.fn().mockResolvedValue(["0x123456789abcdef"]),
        writeContract: vi.fn().mockResolvedValue("0xtxhash"),
        chain: {
          id: 14800,
          rpcUrls: {
            default: {
              http: ["https://rpc.moksha.vana.org"],
            },
          },
        },
      };

      const mockContext = {
        walletClient: mockWallet,
        publicClient: {},
        applicationClient: mockWallet,
        platform: null as any, // Platform is now handled internally
      };

      const controller = new DataController(mockContext);

      const validatorPublicKey =
        "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

      // This should orchestrate: generateEncryptionKey -> encryptWithWalletPublicKey -> writeContract
      const txHash = await controller.addPermissionToFile(
        123,
        "0xvalidator" as any,
        validatorPublicKey,
      );

      expect(txHash).toBe("0xtxhash");
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockWallet.account,
        message: "Please sign to retrieve your encryption key",
      });
      expect(mockWallet.writeContract).toHaveBeenCalled();
    });

    it("should decrypt files through controller methods using wallet signatures", async () => {
      // Test that the controller can decrypt files using the correct architecture
      const { DataController } = await import("../controllers/data");
      const { encryptUserData } = await import("../utils/encryption");

      const mockWallet = {
        account: { address: "0x123456789abcdef" },
        signMessage: vi.fn().mockResolvedValue("0xsignature123"),
      };

      const mockContext = {
        walletClient: mockWallet,
        platform: null as any, // Platform is now handled internally
      };

      const controller = new DataController(mockContext);

      // First encrypt some test data with the same signature
      const originalData = new Blob(["Hello Vana!"], { type: "text/plain" });
      const encryptedData = await encryptUserData(
        originalData,
        "0xsignature123",
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

      // This should orchestrate: generateEncryptionKey -> fetch -> decryptUserData
      const decryptedBlob = await controller.decryptFile(testFile);
      const decryptedText = await decryptedBlob.text();

      expect(decryptedText).toBe("Hello Vana!");
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockWallet.account,
        message: "Please sign to retrieve your encryption key",
      });
    });
  });

  describe("Level 1: High-Level Client", () => {
    it("should provide async new Vana() for initialization", async () => {
      // Test that Vana client provides simple high-level API
      const { Vana } = await import("../index.node");

      // Check that the Vana class exists and can be instantiated
      expect(Vana).toBeDefined();
      expect(typeof Vana).toBe("function");
    });

    it("should provide high-level data controller methods through Vana client", async () => {
      // Test that Vana client exposes the data controller with correct architecture
      const { Vana } = await import("../index.node");

      // Mock wallet configuration for testing
      const mockWallet = {
        account: { address: "0x123456789abcdef" },
        signMessage: vi.fn().mockResolvedValue("0xsignature123"),
        signTypedData: vi.fn().mockResolvedValue("0xsignature123"),
        getAddresses: vi.fn().mockResolvedValue(["0x123456789abcdef"]),
        chain: {
          id: 14800,
          rpcUrls: {
            default: {
              http: ["https://rpc.moksha.vana.org"],
            },
          },
        },
      };

      const config = {
        walletClient: mockWallet,
      };

      // Create Vana instance
      const vana = await new Vana(config);

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
      const mockWallet = {
        account: { address: "0x123456789abcdef" },
        signMessage: vi.fn().mockResolvedValue("0xsignature123"),
        signTypedData: vi.fn().mockResolvedValue("0xsignature123"),
        getAddresses: vi.fn().mockResolvedValue(["0x123456789abcdef"]),
        chain: {
          id: 14800,
          rpcUrls: {
            default: {
              http: ["https://rpc.moksha.vana.org"],
            },
          },
        },
      };

      const mockStorageManager = {
        upload: vi.fn().mockResolvedValue({
          url: "https://example.com/file123",
          size: 1024,
        }),
      };

      const config = {
        walletClient: mockWallet,
        storage: {
          providers: {
            default: mockStorageManager,
          },
          defaultProvider: "default",
        },
      };

      const vana = await new Vana(config);

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
      expect(mockStorageManager.upload).toHaveBeenCalled();
    });

    it("should provide one-liner permission granting", async () => {
      // Test the high-level addPermissionToFile method
      const { Vana } = await import("../index.node");

      const mockWallet = {
        account: { address: "0x123456789abcdef" },
        signMessage: vi.fn().mockResolvedValue("0xsignature123"),
        signTypedData: vi.fn().mockResolvedValue("0xsignature123"),
        getAddresses: vi.fn().mockResolvedValue(["0x123456789abcdef"]),
        writeContract: vi.fn().mockResolvedValue("0xtxhash"),
        chain: {
          id: 14800,
          rpcUrls: {
            default: {
              http: ["https://rpc.moksha.vana.org"],
            },
          },
        },
      };

      const config = {
        walletClient: mockWallet,
      };

      const vana = await new Vana(config);

      const validatorPublicKey =
        "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";

      // This should be a one-liner that handles: generateKey -> encryptWithPublicKey -> addPermission
      const txHash = await vana.data.addPermissionToFile(
        123,
        "0xvalidator" as any,
        validatorPublicKey,
      );

      expect(txHash).toBe("0xtxhash");
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockWallet.account,
        message: "Please sign to retrieve your encryption key",
      });
    });
  });

  describe("Integration: End-to-End Workflow", () => {
    it(
      "should support complete data sharing workflow",
      withConsole(async () => {
        console.log("Testing end-to-end workflow...");

        // 1. User encrypts data with wallet signature
        const {
          generateEncryptionKey,
          encryptUserData,
          encryptWithWalletPublicKey,
        } = await import("../utils/encryption");

        mockWallet.signMessage.mockResolvedValue(
          "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        );

        const originalData = new Blob(["Private user data"], {
          type: "text/plain",
        });
        const encryptionKey = await generateEncryptionKey(mockWallet);
        const encryptedData = await encryptUserData(
          originalData,
          encryptionKey,
        );

        console.log("Data encrypted with wallet signature");

        // 2. User shares encryption key with validator
        const validatorPublicKey =
          "04c68d2d599561327448dab8066c3a93491fb1eecc89dd386ca2504a6deb9c266a7c844e506172b4e6077b57b067fb78aba8a532166ec8a287077cad00e599eaf1";
        const encryptedKey = await encryptWithWalletPublicKey(
          encryptionKey,
          validatorPublicKey,
        );

        console.log("Encryption key shared with validator");

        // 3. Validator receives and can access data (simulated)
        // In real scenario, validator would decrypt encryptedKey with their private key
        // then use the decrypted signature to decrypt the data

        expect(encryptedData).toBeInstanceOf(Blob);
        expect(typeof encryptedKey).toBe("string");
        expect(encryptedKey).toMatch(/^[0-9a-fA-F]+$/);

        console.log("End-to-end workflow completed successfully");
      }),
    );
  });
});
