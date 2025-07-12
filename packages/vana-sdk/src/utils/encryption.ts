/**
 * Canonical Vana Protocol Encryption Functions
 *
 * These functions define the standard way user data is encrypted/decrypted in Vana.
 * All applications should use these canonical functions to ensure compatibility
 * with existing encrypted data on the Vana network.
 *
 * This module uses the platform adapter pattern to provide consistent
 * encryption functionality across Node.js and browser environments.
 */

import { getPlatformAdapter } from "../platform";
import type { WalletClient } from "viem";

/**
 * Default encryption seed message used throughout Vana protocol
 */
export const DEFAULT_ENCRYPTION_SEED =
  "Please sign to retrieve your encryption key";

/**
 * Generate an encryption key by signing the canonical Vana encryption seed
 *
 * This is the standard protocol function for creating encryption keys in Vana.
 * The signature serves as a symmetric encryption key for user data.
 *
 * @param wallet The user's wallet client for signing
 * @param seed Optional custom encryption seed (defaults to Vana standard)
 * @returns The signature that serves as the encryption key
 */
export async function generateEncryptionKey(
  wallet: WalletClient,
  seed: string = DEFAULT_ENCRYPTION_SEED,
): Promise<string> {
  if (!wallet.account) {
    throw new Error("Wallet account is required for encryption key generation");
  }

  // Sign the encryption seed to generate a deterministic encryption key
  const signature = await wallet.signMessage({
    account: wallet.account,
    message: seed,
  });

  return signature;
}

/**
 * Encrypt data with a wallet's public key using platform-appropriate cryptography
 * @param data The data to encrypt (as string or Blob)
 * @param publicKey The public key for encryption
 * @returns The encrypted data
 */
export async function encryptWithWalletPublicKey(
  data: string | Blob,
  publicKey: string,
): Promise<string> {
  try {
    const platformAdapter = getPlatformAdapter();
    const dataString = data instanceof Blob ? await data.text() : data;
    return await platformAdapter.crypto.encryptWithPublicKey(
      dataString,
      publicKey,
    );
  } catch (error) {
    throw new Error(`Failed to encrypt with wallet public key: ${error}`);
  }
}

/**
 * Decrypt data with a wallet's private key using platform-appropriate cryptography
 * @param encryptedData The encrypted data
 * @param privateKey The private key for decryption
 * @returns The decrypted data as string
 */
export async function decryptWithWalletPrivateKey(
  encryptedData: string,
  privateKey: string,
): Promise<string> {
  try {
    const platformAdapter = getPlatformAdapter();
    return await platformAdapter.crypto.decryptWithPrivateKey(
      encryptedData,
      privateKey,
    );
  } catch (error) {
    throw new Error(`Failed to decrypt with wallet private key: ${error}`);
  }
}

/**
 * Encrypt a file key with a DLP's public key using platform-appropriate cryptography
 * @param fileKey The symmetric key used to encrypt the file
 * @param publicKey The DLP's public key
 * @returns The encrypted key that can be stored on-chain
 */
export async function encryptFileKey(
  fileKey: string,
  publicKey: string,
): Promise<string> {
  try {
    const platformAdapter = getPlatformAdapter();
    return await platformAdapter.crypto.encryptWithPublicKey(
      fileKey,
      publicKey,
    );
  } catch (error) {
    throw new Error(`Failed to encrypt file key: ${error}`);
  }
}

/**
 * Generate encryption parameters for secure file storage
 * @returns An object containing the initialization vector and encryption key
 */
export async function getEncryptionParameters(): Promise<{
  iv: string;
  key: string;
}> {
  try {
    const platformAdapter = getPlatformAdapter();

    // Generate a new key pair for encryption parameters
    const keyPair = await platformAdapter.crypto.generateKeyPair();

    // Use parts of the generated keys as IV and key
    // In production, this would use proper key derivation
    return {
      iv: keyPair.publicKey.substring(0, 16),
      key: keyPair.privateKey.substring(0, 32),
    };
  } catch (error) {
    throw new Error(`Failed to generate encryption parameters: ${error}`);
  }
}

/**
 * Decrypt data that was encrypted with the DLP's public key using platform-appropriate cryptography
 * @param encryptedData The encrypted data
 * @param privateKey The private key corresponding to the public key used for encryption
 * @returns The decrypted data
 */
export async function decryptWithPrivateKey(
  encryptedData: string,
  privateKey: string,
): Promise<string> {
  try {
    const platformAdapter = getPlatformAdapter();
    return await platformAdapter.crypto.decryptWithPrivateKey(
      encryptedData,
      privateKey,
    );
  } catch (error) {
    throw new Error(`Failed to decrypt with private key: ${error}`);
  }
}

/**
 * Encrypt user data using PGP with platform-appropriate configuration
 * @param data The data to encrypt (string or Blob)
 * @param publicKey The PGP public key
 * @returns The encrypted data as Blob
 */
export async function encryptUserData(
  data: string | Blob,
  publicKey: string,
): Promise<Blob> {
  try {
    const platformAdapter = getPlatformAdapter();
    const dataString = data instanceof Blob ? await data.text() : data;
    const encryptedString = await platformAdapter.pgp.encrypt(
      dataString,
      publicKey,
    );
    return new Blob([encryptedString], { type: "text/plain" });
  } catch (error) {
    throw new Error(`Failed to encrypt user data: ${error}`);
  }
}

/**
 * Decrypt user data using PGP with platform-appropriate configuration
 * @param encryptedData The encrypted data (string or Blob)
 * @param privateKey The PGP private key
 * @returns The decrypted data as Blob
 */
export async function decryptUserData(
  encryptedData: string | Blob,
  privateKey: string,
): Promise<Blob> {
  try {
    const platformAdapter = getPlatformAdapter();
    const dataString =
      encryptedData instanceof Blob
        ? await encryptedData.text()
        : encryptedData;
    const decryptedString = await platformAdapter.pgp.decrypt(
      dataString,
      privateKey,
    );
    return new Blob([decryptedString], { type: "text/plain" });
  } catch (error) {
    throw new Error(`Failed to decrypt user data: ${error}`);
  }
}

/**
 * Generate a new key pair for asymmetric encryption
 * @returns Promise resolving to public and private key pair
 */
export async function generateEncryptionKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  try {
    const platformAdapter = getPlatformAdapter();
    return await platformAdapter.crypto.generateKeyPair();
  } catch (error) {
    throw new Error(`Failed to generate encryption key pair: ${error}`);
  }
}

/**
 * Generate a new PGP key pair with platform-appropriate configuration
 * @param options Key generation options
 * @returns Promise resolving to public and private key pair
 */
export async function generatePGPKeyPair(options?: {
  name?: string;
  email?: string;
  passphrase?: string;
}): Promise<{ publicKey: string; privateKey: string }> {
  try {
    const platformAdapter = getPlatformAdapter();
    return await platformAdapter.pgp.generateKeyPair(options);
  } catch (error) {
    throw new Error(`Failed to generate PGP key pair: ${error}`);
  }
}
