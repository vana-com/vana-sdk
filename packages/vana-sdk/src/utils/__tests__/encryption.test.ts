/**
 * Tests for encryption utilities
 *
 * @remarks
 * Tests canonical Vana protocol encryption functions including key generation,
 * asymmetric encryption/decryption, symmetric blob encryption, and PGP operations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WalletClient, Account } from "viem";
import type { VanaPlatformAdapter } from "../../platform/interface";
import {
  DEFAULT_ENCRYPTION_SEED,
  generateEncryptionKey,
  encryptWithWalletPublicKey,
  decryptWithWalletPrivateKey,
  encryptFileKey,
  getEncryptionParameters,
  decryptWithPrivateKey,
  encryptBlobWithSignedKey,
  decryptBlobWithSignedKey,
  generateEncryptionKeyPair,
  generatePGPKeyPair,
} from "../encryption";

// Mock signature cache
vi.mock("../signatureCache", () => ({
  withSignatureCache: vi.fn(async (_cache, _address, _message, fn) => {
    return await fn();
  }),
}));

describe("encryption", () => {
  let mockWallet: WalletClient;
  let mockPlatformAdapter: VanaPlatformAdapter;
  let mockAccount: Account;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock account
    mockAccount = {
      address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      type: "json-rpc" as const,
    };

    // Mock wallet client
    mockWallet = {
      account: mockAccount,
      signMessage: vi.fn(async ({ message }) => {
        return `signature_of_${message}` as `0x${string}`;
      }),
    } as unknown as WalletClient;

    // Mock platform adapter
    mockPlatformAdapter = {
      cache: {
        get: vi.fn(),
        set: vi.fn(),
      },
      crypto: {
        encryptWithWalletPublicKey: vi.fn(async (data) => `encrypted_${data}`),
        decryptWithWalletPrivateKey: vi.fn(async (data) =>
          data.replace("encrypted_", ""),
        ),
        encryptWithPublicKey: vi.fn(async (data) => `enc_${data}`),
        decryptWithPrivateKey: vi.fn(async (data) => data.replace("enc_", "")),
        generateKeyPair: vi.fn(async () => ({
          publicKey: "0xpublic1234567890abcdefghijklmnop",
          privateKey: "0xprivate1234567890abcdefghijklmnopqrstuvwxyz",
        })),
        encryptWithPassword: vi.fn(async (data) => {
          const encrypted = new Uint8Array(data.length + 10);
          encrypted.set(data);
          return encrypted;
        }),
        decryptWithPassword: vi.fn(async (data) => {
          return new Uint8Array(data.slice(0, -10));
        }),
      },
      pgp: {
        generateKeyPair: vi.fn(async () => ({
          publicKey: "-----BEGIN PGP PUBLIC KEY BLOCK-----",
          privateKey: "-----BEGIN PGP PRIVATE KEY BLOCK-----",
        })),
      },
    } as unknown as VanaPlatformAdapter;
  });

  describe("DEFAULT_ENCRYPTION_SEED", () => {
    it("should have the correct default seed message", () => {
      expect(DEFAULT_ENCRYPTION_SEED).toBe(
        "Please sign to retrieve your encryption key",
      );
    });
  });

  describe("generateEncryptionKey", () => {
    it("should generate encryption key from default seed", async () => {
      const key = await generateEncryptionKey(mockWallet, mockPlatformAdapter);

      expect(key).toBe(`signature_of_${DEFAULT_ENCRYPTION_SEED}`);
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockAccount,
        message: DEFAULT_ENCRYPTION_SEED,
      });
    });

    it("should generate encryption key from custom seed", async () => {
      const customSeed = "my-custom-seed";
      const key = await generateEncryptionKey(
        mockWallet,
        mockPlatformAdapter,
        customSeed,
      );

      expect(key).toBe(`signature_of_${customSeed}`);
      expect(mockWallet.signMessage).toHaveBeenCalledWith({
        account: mockAccount,
        message: customSeed,
      });
    });

    it("should throw error when wallet has no account", async () => {
      const walletWithoutAccount = {
        ...mockWallet,
        account: undefined,
      } as unknown as WalletClient;

      await expect(
        generateEncryptionKey(walletWithoutAccount, mockPlatformAdapter),
      ).rejects.toThrow(
        "Wallet account is required for encryption key generation",
      );
    });

    it("should use signature cache", async () => {
      const { withSignatureCache } = await import("../signatureCache");

      await generateEncryptionKey(mockWallet, mockPlatformAdapter);

      expect(withSignatureCache).toHaveBeenCalledWith(
        mockPlatformAdapter.cache,
        mockAccount.address,
        { message: DEFAULT_ENCRYPTION_SEED },
        expect.any(Function),
      );
    });
  });

  describe("encryptWithWalletPublicKey", () => {
    it("should encrypt string data", async () => {
      const data = "sensitive information";
      const publicKey = "0xpublic123";

      const result = await encryptWithWalletPublicKey(
        data,
        publicKey,
        mockPlatformAdapter,
      );

      expect(result).toBe("encrypted_sensitive information");
      expect(
        mockPlatformAdapter.crypto.encryptWithWalletPublicKey,
      ).toHaveBeenCalledWith(data, publicKey);
    });

    it("should encrypt Blob data", async () => {
      const blob = new Blob(["blob content"], { type: "text/plain" });
      const publicKey = "0xpublic456";

      const result = await encryptWithWalletPublicKey(
        blob,
        publicKey,
        mockPlatformAdapter,
      );

      expect(result).toBe("encrypted_blob content");
      expect(
        mockPlatformAdapter.crypto.encryptWithWalletPublicKey,
      ).toHaveBeenCalledWith("blob content", publicKey);
    });

    it("should handle encryption errors", async () => {
      vi.mocked(
        mockPlatformAdapter.crypto.encryptWithWalletPublicKey,
      ).mockRejectedValueOnce(new Error("Encryption failed"));

      await expect(
        encryptWithWalletPublicKey("data", "0xkey", mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to encrypt with wallet public key: Error: Encryption failed",
      );
    });

    it("should handle empty string", async () => {
      const result = await encryptWithWalletPublicKey(
        "",
        "0xkey",
        mockPlatformAdapter,
      );

      expect(result).toBe("encrypted_");
    });
  });

  describe("decryptWithWalletPrivateKey", () => {
    it("should decrypt encrypted data", async () => {
      const encryptedData = "encrypted_my secret";
      const privateKey = "0xprivate123";

      const result = await decryptWithWalletPrivateKey(
        encryptedData,
        privateKey,
        mockPlatformAdapter,
      );

      expect(result).toBe("my secret");
      expect(
        mockPlatformAdapter.crypto.decryptWithWalletPrivateKey,
      ).toHaveBeenCalledWith(encryptedData, privateKey);
    });

    it("should handle decryption errors", async () => {
      vi.mocked(
        mockPlatformAdapter.crypto.decryptWithWalletPrivateKey,
      ).mockRejectedValueOnce(new Error("Decryption failed"));

      await expect(
        decryptWithWalletPrivateKey("data", "0xkey", mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to decrypt with wallet private key: Error: Decryption failed",
      );
    });

    it("should handle empty encrypted data", async () => {
      const result = await decryptWithWalletPrivateKey(
        "encrypted_",
        "0xkey",
        mockPlatformAdapter,
      );

      expect(result).toBe("");
    });
  });

  describe("encryptFileKey", () => {
    it("should encrypt file key with public key", async () => {
      const fileKey = "file_encryption_key_123";
      const publicKey = "0xdlp_public_key";

      const result = await encryptFileKey(
        fileKey,
        publicKey,
        mockPlatformAdapter,
      );

      expect(result).toBe("enc_file_encryption_key_123");
      expect(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).toHaveBeenCalledWith(fileKey, publicKey);
    });

    it("should handle encryption errors", async () => {
      vi.mocked(
        mockPlatformAdapter.crypto.encryptWithPublicKey,
      ).mockRejectedValueOnce(new Error("Invalid public key"));

      await expect(
        encryptFileKey("key", "0xinvalid", mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to encrypt file key: Error: Invalid public key",
      );
    });

    it("should handle empty file key", async () => {
      const result = await encryptFileKey("", "0xkey", mockPlatformAdapter);

      expect(result).toBe("enc_");
    });
  });

  describe("getEncryptionParameters", () => {
    it("should generate encryption parameters", async () => {
      const result = await getEncryptionParameters(mockPlatformAdapter);

      expect(result).toHaveProperty("iv");
      expect(result).toHaveProperty("key");
      expect(result.iv).toBe("0xpublic12345678"); // First 16 chars
      expect(result.key).toBe("0xprivate1234567890abcdefghijklm"); // First 32 chars
      expect(mockPlatformAdapter.crypto.generateKeyPair).toHaveBeenCalled();
    });

    it("should extract correct substring lengths", async () => {
      const result = await getEncryptionParameters(mockPlatformAdapter);

      expect(result.iv.length).toBe(16);
      expect(result.key.length).toBe(32);
    });

    it("should handle key generation errors", async () => {
      vi.mocked(
        mockPlatformAdapter.crypto.generateKeyPair,
      ).mockRejectedValueOnce(new Error("Key generation failed"));

      await expect(
        getEncryptionParameters(mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to generate encryption parameters: Error: Key generation failed",
      );
    });
  });

  describe("decryptWithPrivateKey", () => {
    it("should decrypt data with private key", async () => {
      const encryptedData = "enc_decrypted_content";
      const privateKey = "0xprivate456";

      const result = await decryptWithPrivateKey(
        encryptedData,
        privateKey,
        mockPlatformAdapter,
      );

      expect(result).toBe("decrypted_content");
      expect(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).toHaveBeenCalledWith(encryptedData, privateKey);
    });

    it("should handle decryption errors", async () => {
      vi.mocked(
        mockPlatformAdapter.crypto.decryptWithPrivateKey,
      ).mockRejectedValueOnce(new Error("Wrong key"));

      await expect(
        decryptWithPrivateKey("data", "0xkey", mockPlatformAdapter),
      ).rejects.toThrow("Failed to decrypt with private key: Error: Wrong key");
    });

    it("should handle empty encrypted data", async () => {
      const result = await decryptWithPrivateKey(
        "enc_",
        "0xkey",
        mockPlatformAdapter,
      );

      expect(result).toBe("");
    });
  });

  describe("encryptBlobWithSignedKey", () => {
    it("should encrypt string data to Blob", async () => {
      const data = "my data";
      const key = "signature_key";

      const result = await encryptBlobWithSignedKey(
        data,
        key,
        mockPlatformAdapter,
      );

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe("application/octet-stream");
      expect(
        mockPlatformAdapter.crypto.encryptWithPassword,
      ).toHaveBeenCalledWith(expect.any(Uint8Array), key);
    });

    it("should encrypt Blob data to Blob", async () => {
      const blob = new Blob(["blob data"], { type: "text/plain" });
      const key = "signature_key";

      const result = await encryptBlobWithSignedKey(
        blob,
        key,
        mockPlatformAdapter,
      );

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe("application/octet-stream");
    });

    it("should handle encryption errors", async () => {
      vi.mocked(
        mockPlatformAdapter.crypto.encryptWithPassword,
      ).mockRejectedValueOnce(new Error("Encryption failed"));

      await expect(
        encryptBlobWithSignedKey("data", "key", mockPlatformAdapter),
      ).rejects.toThrow("Failed to encrypt data: Error: Encryption failed");
    });

    it("should handle empty string", async () => {
      const result = await encryptBlobWithSignedKey(
        "",
        "key",
        mockPlatformAdapter,
      );

      expect(result).toBeInstanceOf(Blob);
      expect(result.size).toBeGreaterThan(0); // Has overhead from encryption
    });

    it("should handle empty Blob", async () => {
      const emptyBlob = new Blob([]);

      const result = await encryptBlobWithSignedKey(
        emptyBlob,
        "key",
        mockPlatformAdapter,
      );

      expect(result).toBeInstanceOf(Blob);
    });

    it("should convert data to Uint8Array for encryption", async () => {
      await encryptBlobWithSignedKey("test", "key", mockPlatformAdapter);

      expect(
        mockPlatformAdapter.crypto.encryptWithPassword,
      ).toHaveBeenCalledWith(expect.any(Uint8Array), "key");

      const callArgs = vi.mocked(mockPlatformAdapter.crypto.encryptWithPassword)
        .mock.calls[0];
      expect(callArgs[0]).toBeInstanceOf(Uint8Array);
    });
  });

  describe("decryptBlobWithSignedKey", () => {
    it("should decrypt Blob data", async () => {
      const encryptedBlob = new Blob([new Uint8Array([1, 2, 3, 4, 5])]);
      const key = "signature_key";

      const result = await decryptBlobWithSignedKey(
        encryptedBlob,
        key,
        mockPlatformAdapter,
      );

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe("text/plain");
      expect(
        mockPlatformAdapter.crypto.decryptWithPassword,
      ).toHaveBeenCalledWith(expect.any(Uint8Array), key);
    });

    it("should decrypt string data", async () => {
      const encryptedString = "encrypted_data";
      const key = "signature_key";

      const result = await decryptBlobWithSignedKey(
        encryptedString,
        key,
        mockPlatformAdapter,
      );

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe("text/plain");
    });

    it("should handle decryption errors", async () => {
      vi.mocked(
        mockPlatformAdapter.crypto.decryptWithPassword,
      ).mockRejectedValueOnce(new Error("Wrong key"));

      await expect(
        decryptBlobWithSignedKey("data", "key", mockPlatformAdapter),
      ).rejects.toThrow("Failed to decrypt data: Error: Wrong key");
    });

    it("should handle empty Blob", async () => {
      const emptyBlob = new Blob([]);

      const result = await decryptBlobWithSignedKey(
        emptyBlob,
        "key",
        mockPlatformAdapter,
      );

      expect(result).toBeInstanceOf(Blob);
    });

    it("should roundtrip encrypt/decrypt string", async () => {
      const originalData = "test data";
      const key = "test_key";

      // Setup realistic mocks for roundtrip
      vi.mocked(
        mockPlatformAdapter.crypto.encryptWithPassword,
      ).mockImplementation(async (data) => {
        const encrypted = new Uint8Array(data.length + 4);
        encrypted.set(data);
        encrypted.set([0xff, 0xfe, 0xfd, 0xfc], data.length);
        return encrypted;
      });

      vi.mocked(
        mockPlatformAdapter.crypto.decryptWithPassword,
      ).mockImplementation(async (data) => {
        return new Uint8Array(data.slice(0, -4));
      });

      const encrypted = await encryptBlobWithSignedKey(
        originalData,
        key,
        mockPlatformAdapter,
      );
      const decrypted = await decryptBlobWithSignedKey(
        encrypted,
        key,
        mockPlatformAdapter,
      );

      const decryptedText = await decrypted.text();
      expect(decryptedText).toBe(originalData);
    });
  });

  describe("generateEncryptionKeyPair", () => {
    it("should generate key pair", async () => {
      const result = await generateEncryptionKeyPair(mockPlatformAdapter);

      expect(result).toHaveProperty("publicKey");
      expect(result).toHaveProperty("privateKey");
      expect(result.publicKey).toBe("0xpublic1234567890abcdefghijklmnop");
      expect(result.privateKey).toBe(
        "0xprivate1234567890abcdefghijklmnopqrstuvwxyz",
      );
      expect(mockPlatformAdapter.crypto.generateKeyPair).toHaveBeenCalled();
    });

    it("should handle key generation errors", async () => {
      vi.mocked(
        mockPlatformAdapter.crypto.generateKeyPair,
      ).mockRejectedValueOnce(new Error("Generation failed"));

      await expect(
        generateEncryptionKeyPair(mockPlatformAdapter),
      ).rejects.toThrow(
        "Failed to generate encryption key pair: Error: Generation failed",
      );
    });
  });

  describe("generatePGPKeyPair", () => {
    it("should generate PGP key pair without options", async () => {
      const result = await generatePGPKeyPair(mockPlatformAdapter);

      expect(result).toHaveProperty("publicKey");
      expect(result).toHaveProperty("privateKey");
      expect(result.publicKey).toContain("BEGIN PGP PUBLIC KEY");
      expect(result.privateKey).toContain("BEGIN PGP PRIVATE KEY");
      expect(mockPlatformAdapter.pgp.generateKeyPair).toHaveBeenCalledWith(
        undefined,
      );
    });

    it("should generate PGP key pair with options", async () => {
      const options = {
        name: "John Doe",
        email: "john@example.com",
        passphrase: "secret",
      };

      const result = await generatePGPKeyPair(mockPlatformAdapter, options);

      expect(result).toHaveProperty("publicKey");
      expect(result).toHaveProperty("privateKey");
      expect(mockPlatformAdapter.pgp.generateKeyPair).toHaveBeenCalledWith(
        options,
      );
    });

    it("should handle partial options", async () => {
      const result = await generatePGPKeyPair(mockPlatformAdapter, {
        name: "Jane Smith",
      });

      expect(result).toHaveProperty("publicKey");
      expect(mockPlatformAdapter.pgp.generateKeyPair).toHaveBeenCalledWith({
        name: "Jane Smith",
      });
    });

    it("should handle PGP generation errors", async () => {
      vi.mocked(mockPlatformAdapter.pgp.generateKeyPair).mockRejectedValueOnce(
        new Error("PGP generation failed"),
      );

      await expect(generatePGPKeyPair(mockPlatformAdapter)).rejects.toThrow(
        "Failed to generate PGP key pair: Error: PGP generation failed",
      );
    });
  });

  describe("Integration scenarios", () => {
    it("should support full encryption/decryption workflow with wallet", async () => {
      // Generate encryption key from wallet
      const encryptionKey = await generateEncryptionKey(
        mockWallet,
        mockPlatformAdapter,
      );

      // Encrypt data
      const data = "sensitive user data";
      const encrypted = await encryptBlobWithSignedKey(
        data,
        encryptionKey,
        mockPlatformAdapter,
      );

      // Decrypt data
      const decrypted = await decryptBlobWithSignedKey(
        encrypted,
        encryptionKey,
        mockPlatformAdapter,
      );

      expect(decrypted).toBeInstanceOf(Blob);
    });

    it("should support asymmetric encryption workflow", async () => {
      // Generate key pair
      const keyPair = await generateEncryptionKeyPair(mockPlatformAdapter);

      // Encrypt with public key
      const data = "shared secret";
      const encrypted = await encryptWithWalletPublicKey(
        data,
        keyPair.publicKey,
        mockPlatformAdapter,
      );

      // Decrypt with private key
      const decrypted = await decryptWithWalletPrivateKey(
        encrypted,
        keyPair.privateKey,
        mockPlatformAdapter,
      );

      expect(decrypted).toBe(data);
    });

    it("should support file key encryption workflow", async () => {
      // Generate encryption parameters
      const params = await getEncryptionParameters(mockPlatformAdapter);

      // Encrypt file key for DLP
      const fileKey = params.key;
      const dlpPublicKey = "0xdlp_public";

      const encryptedKey = await encryptFileKey(
        fileKey,
        dlpPublicKey,
        mockPlatformAdapter,
      );

      // DLP decrypts the file key
      const dlpPrivateKey = "0xdlp_private";
      const decryptedKey = await decryptWithPrivateKey(
        encryptedKey,
        dlpPrivateKey,
        mockPlatformAdapter,
      );

      expect(decryptedKey).toBe(fileKey);
    });
  });
});
