/**
 * Fake PGP implementation for testing
 *
 * This provides predictable, fast PGP operations for tests
 * without needing to mock complex OpenPGP internals.
 */

import type {
  PgpPort,
  PgpEncryptInput,
  PgpDecryptInput,
  PgpResult,
  PgpKeyPair,
  PgpKeyPairOptions,
} from "../../platform/ports/pgp-port";

export class FakePgpPort implements PgpPort {
  async encrypt(input: PgpEncryptInput): Promise<PgpResult> {
    // Simple deterministic "encryption" for testing
    const encoded = Buffer.from(input.text).toString("base64");
    return {
      data: `-----BEGIN PGP MESSAGE-----\nenc:${encoded}\n-----END PGP MESSAGE-----`,
    };
  }

  async decrypt(input: PgpDecryptInput): Promise<PgpResult> {
    // Extract the "encrypted" content and decode it
    const match = input.messageArmored.match(/enc:([A-Za-z0-9+/=]+)/);
    if (!match) {
      throw new Error("Invalid message format");
    }

    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    return { data: decoded };
  }

  async generateKeyPair(options: PgpKeyPairOptions = {}): Promise<PgpKeyPair> {
    const { name = "Test User", email = "test@example.com" } = options;

    return {
      publicKey: `-----BEGIN PGP PUBLIC KEY BLOCK-----\nfake-public-key-for-${name}-${email}\n-----END PGP PUBLIC KEY BLOCK-----`,
      privateKey: `-----BEGIN PGP PRIVATE KEY BLOCK-----\nfake-private-key-for-${name}-${email}\n-----END PGP PRIVATE KEY BLOCK-----`,
    };
  }
}

// Default fake instance for tests
export const fakePgpPort = new FakePgpPort();
