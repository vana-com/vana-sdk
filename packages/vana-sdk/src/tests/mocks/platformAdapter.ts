import { vi } from "vitest";
import type { VanaPlatformAdapter } from "../../platform/interface";

/**
 * Shared mock platform adapter for test files
 * This provides a consistent mock implementation across all tests
 */
export const createMockPlatformAdapter = (): VanaPlatformAdapter => ({
  crypto: {
    encryptWithPublicKey: vi.fn(),
    decryptWithPrivateKey: vi.fn(),
    generateKeyPair: vi.fn(),
    encryptWithWalletPublicKey: vi.fn(),
    decryptWithWalletPrivateKey: vi.fn(),
    encryptWithPassword: vi.fn(),
    decryptWithPassword: vi.fn(),
  },
  pgp: {
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    generateKeyPair: vi.fn(),
  },
  http: {
    fetch: vi.fn(),
  },
  platform: "node" as const,
});

/**
 * Default mock platform adapter instance for convenience
 */
export const mockPlatformAdapter = createMockPlatformAdapter();
