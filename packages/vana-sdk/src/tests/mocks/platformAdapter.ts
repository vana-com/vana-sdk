import { vi } from "vitest";
import type { VanaPlatformAdapter } from "../../platform/interface";

/**
 * Shared mock platform adapter for test files
 * This provides a consistent mock implementation across all tests
 *
 * @returns A mock VanaPlatformAdapter instance with mocked methods
 */
export const createMockPlatformAdapter = (): VanaPlatformAdapter => ({
  crypto: {
    encryptWithPublicKey: vi.fn().mockResolvedValue("mock-encrypted-data"),
    decryptWithPrivateKey: vi.fn().mockResolvedValue("mock-decrypted-data"),
    generateKeyPair: vi.fn().mockImplementation(async () => ({
      publicKey: `${Math.random().toString(36).substr(2, 20)}-mock-public-key`,
      privateKey: `${Math.random().toString(36).substr(2, 40)}-mock-private-key`,
    })),
    encryptWithWalletPublicKey: vi
      .fn()
      .mockImplementation(async (data: string | Blob) => {
        // For round-trip testing, just return the data as a hex string
        const text = data instanceof Blob ? await data.text() : data;
        return Buffer.from(text).toString("hex");
      }),
    decryptWithWalletPrivateKey: vi
      .fn()
      .mockImplementation(async (encryptedData: string) => {
        // For round-trip testing, convert hex string back to original data
        return Buffer.from(encryptedData, "hex").toString();
      }),
    encryptWithPassword: vi
      .fn()
      .mockImplementation(async (data: Uint8Array) => {
        // Return a Uint8Array with the data for round-trip testing
        // Add some simple transformation to simulate encryption
        const result = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
          result[i] = data[i] ^ 0x42; // Simple XOR for testing
        }
        return result;
      }),
    decryptWithPassword: vi
      .fn()
      .mockImplementation(async (encryptedData: Uint8Array) => {
        // Reverse the XOR transformation from encryptWithPassword
        const result = new Uint8Array(encryptedData.length);
        for (let i = 0; i < encryptedData.length; i++) {
          result[i] = encryptedData[i] ^ 0x42; // Same XOR reverses the encryption
        }
        return result;
      }),
  },
  pgp: {
    encrypt: vi.fn().mockImplementation(async (data: string | Blob) => {
      // Return a blob that contains the original data for round-trip testing
      if (data instanceof Blob) {
        const text = await data.text();
        return new Blob([text], { type: "application/octet-stream" });
      }
      return new Blob([data], { type: "application/octet-stream" });
    }),
    decrypt: vi.fn().mockImplementation(async (encryptedData: Blob) => {
      // Return the original data for round-trip testing
      const text = await encryptedData.text();
      return new Blob([text], { type: "text/plain" });
    }),
    generateKeyPair: vi.fn().mockImplementation(async () => ({
      publicKey: `-----BEGIN PGP PUBLIC KEY BLOCK-----\nmock-pgp-public-key-${Math.random()}\n-----END PGP PUBLIC KEY BLOCK-----`,
      privateKey: `-----BEGIN PGP PRIVATE KEY BLOCK-----\nmock-pgp-private-key-${Math.random()}\n-----END PGP PRIVATE KEY BLOCK-----`,
    })),
  },
  http: {
    fetch: vi.fn(),
  },
  cache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  },
  platform: "node" as const,
});

/**
 * Default mock platform adapter instance for convenience
 */
export const mockPlatformAdapter = createMockPlatformAdapter();
