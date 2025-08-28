/**
 * Port interface for PGP operations
 *
 * This interface abstracts away the complexity of the underlying PGP library
 * and provides a clean, testable API for PGP operations.
 */

export interface PgpKeyPairOptions {
  name?: string;
  email?: string;
  passphrase?: string;
}

export interface PgpKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface PgpEncryptInput {
  text: string;
  publicKeyArmored: string;
}

export interface PgpDecryptInput {
  messageArmored: string;
  privateKeyArmored: string;
  passphrase?: string;
}

export interface PgpResult {
  data: string;
}

/**
 * Clean interface for PGP operations
 */
export interface PgpPort {
  encrypt(input: PgpEncryptInput): Promise<PgpResult>;
  decrypt(input: PgpDecryptInput): Promise<PgpResult>;
  generateKeyPair(options?: PgpKeyPairOptions): Promise<PgpKeyPair>;
}
