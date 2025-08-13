import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NodePlatformAdapter } from "./node";

// Mock openpgp
vi.mock("openpgp", () => ({
  readKey: vi.fn(),
  readPrivateKey: vi.fn(),
  readMessage: vi.fn(),
  createMessage: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  generateKey: vi.fn(),
  enums: {
    compression: {
      zlib: 1,
    },
  },
}));

describe("NodePlatformAdapter - PGP Methods", () => {
  let adapter: NodePlatformAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new NodePlatformAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("pgp.encrypt", () => {
    it("should encrypt data with public key", async () => {
      const openpgp = await import("openpgp");
      const mockPublicKey = { id: "mock-key" };
      const mockMessage = { text: "mock-message" };

      vi.mocked(openpgp.readKey).mockResolvedValue(mockPublicKey as any);
      vi.mocked(openpgp.createMessage).mockResolvedValue(mockMessage as any);
      vi.mocked(openpgp.encrypt).mockResolvedValue("encrypted-data" as any);

      const result = await adapter.pgp.encrypt(
        "test data",
        "public-key-armored",
      );

      expect(openpgp.readKey).toHaveBeenCalledWith({
        armoredKey: "public-key-armored",
      });
      expect(openpgp.createMessage).toHaveBeenCalledWith({ text: "test data" });
      expect(openpgp.encrypt).toHaveBeenCalledWith({
        message: mockMessage,
        encryptionKeys: mockPublicKey,
        config: {
          preferredCompressionAlgorithm: 1, // zlib
        },
      });
      expect(result).toBe("encrypted-data");
    });
  });

  describe("pgp.decrypt", () => {
    it("should decrypt data with private key", async () => {
      const openpgp = await import("openpgp");
      const mockPrivateKey = { id: "mock-private-key" };
      const mockMessage = { text: "encrypted-message" };

      vi.mocked(openpgp.readPrivateKey).mockResolvedValue(
        mockPrivateKey as any,
      );
      vi.mocked(openpgp.readMessage).mockResolvedValue(mockMessage as any);
      vi.mocked(openpgp.decrypt).mockResolvedValue({
        data: "decrypted-data",
      } as any);

      const result = await adapter.pgp.decrypt(
        "encrypted-data",
        "private-key-armored",
      );

      expect(openpgp.readPrivateKey).toHaveBeenCalledWith({
        armoredKey: "private-key-armored",
      });
      expect(openpgp.readMessage).toHaveBeenCalledWith({
        armoredMessage: "encrypted-data",
      });
      expect(openpgp.decrypt).toHaveBeenCalledWith({
        message: mockMessage,
        decryptionKeys: mockPrivateKey,
      });
      expect(result).toBe("decrypted-data");
    });
  });

  describe("pgp.generateKeyPair", () => {
    it("should generate key pair with default options", async () => {
      const openpgp = await import("openpgp");

      vi.mocked(openpgp.generateKey).mockResolvedValue({
        publicKey: "public-key-armored",
        privateKey: "private-key-armored",
      } as any);

      const result = await adapter.pgp.generateKeyPair();

      expect(openpgp.generateKey).toHaveBeenCalledWith({
        type: "rsa",
        rsaBits: 2048,
        userIDs: [{ name: "Vana User", email: "user@vana.org" }],
        passphrase: undefined,
        config: {
          preferredCompressionAlgorithm: 2, // zlib
          preferredSymmetricAlgorithm: 7, // aes256
        },
      });
      expect(result).toEqual({
        publicKey: "public-key-armored",
        privateKey: "private-key-armored",
      });
    });

    it("should generate key pair with custom options", async () => {
      const openpgp = await import("openpgp");

      vi.mocked(openpgp.generateKey).mockResolvedValue({
        publicKey: "public-key-armored",
        privateKey: "private-key-armored",
      } as any);

      const options = {
        name: "Custom User",
        email: "custom@example.com",
        passphrase: "secret123",
      };

      const result = await adapter.pgp.generateKeyPair(options);

      expect(openpgp.generateKey).toHaveBeenCalledWith({
        type: "rsa",
        rsaBits: 2048,
        userIDs: [{ name: "Custom User", email: "custom@example.com" }],
        passphrase: "secret123",
        config: {
          preferredCompressionAlgorithm: 2, // zlib
          preferredSymmetricAlgorithm: 7, // aes256
        },
      });
      expect(result).toEqual({
        publicKey: "public-key-armored",
        privateKey: "private-key-armored",
      });
    });
  });
});
