/**
 * Utility functions for encryption related operations in the Vana SDK
 *
 * This module uses the platform adapter pattern to provide consistent
 * encryption functionality across Node.js and browser environments.
 */

import { getPlatformAdapter } from "../platform";

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
 * @param data The data to encrypt
 * @param publicKey The PGP public key
 * @returns The encrypted data
 */
export async function encryptUserData(
  data: string,
  publicKey: string,
): Promise<string> {
  try {
    const platformAdapter = getPlatformAdapter();
    return await platformAdapter.pgp.encrypt(data, publicKey);
  } catch (error) {
    throw new Error(`Failed to encrypt user data: ${error}`);
  }
}

/**
 * Decrypt user data using PGP with platform-appropriate configuration
 * @param encryptedData The encrypted data
 * @param privateKey The PGP private key
 * @returns The decrypted data
 */
export async function decryptUserData(
  encryptedData: string,
  privateKey: string,
): Promise<string> {
  try {
    const platformAdapter = getPlatformAdapter();
    return await platformAdapter.pgp.decrypt(encryptedData, privateKey);
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
