/**
 * Service for wallet key encryption and decryption operations.
 *
 * @remarks
 * This service separates business logic (wallet key processing) from crypto primitives
 * (ECIES operations). It handles key normalization, data conversion, and format transformation
 * while delegating actual cryptographic operations to the provided ECIES provider.
 *
 * @category Cryptography
 * @internal
 */

import type { ECIESProvider, ECIESEncrypted } from "../ecies/interface";
import {
  processWalletPublicKey,
  processWalletPrivateKey,
  parseEncryptedDataBuffer,
  concatBytes,
} from "../../utils/crypto-utils";
import { stringToBytes, bytesToString, toHex, fromHex } from "viem";

export interface WalletKeyEncryptionServiceConfig {
  /** ECIES provider for encryption/decryption */
  eciesProvider: ECIESProvider;
}

/**
 * Service for wallet key encryption and decryption operations
 *
 * @remarks
 * This service encapsulates the business logic for wallet key operations,
 * delegating actual cryptographic operations to the provided ECIES provider.
 * It handles key normalization, data conversion, and format transformation.
 *
 * @internal
 */
export class WalletKeyEncryptionService {
  private readonly eciesProvider: ECIESProvider;

  constructor(config: WalletKeyEncryptionServiceConfig) {
    this.eciesProvider = config.eciesProvider;
  }

  /**
   * Encrypts data using a wallet's public key.
   *
   * @param data - The plaintext message to encrypt for the wallet owner.
   * @param publicKey - The recipient wallet's public key for encryption.
   * @returns A promise that resolves to the encrypted data as a hex string.
   * @throws {Error} When encryption fails due to invalid key format.
   *
   * @example
   * ```typescript
   * const encrypted = await processor.encryptWithWalletPublicKey(
   *   "Secret message",
   *   "0x04..." // 65-byte uncompressed public key
   * );
   * console.log(`Encrypted: ${encrypted}`);
   * ```
   */
  async encryptWithWalletPublicKey(
    data: string,
    publicKey: string | Uint8Array,
  ): Promise<string> {
    // Process the public key to ensure correct format
    const publicKeyBytes = processWalletPublicKey(publicKey);

    // Convert string data to bytes
    const dataBytes = stringToBytes(data);

    // Perform ECIES encryption
    const encrypted = await this.eciesProvider.encrypt(
      publicKeyBytes,
      dataBytes,
    );

    // Concatenate all components for legacy format compatibility
    const result = concatBytes(
      encrypted.iv,
      encrypted.ephemPublicKey,
      encrypted.ciphertext,
      encrypted.mac,
    );

    // Return as hex string without 0x prefix for API compatibility
    return toHex(result).slice(2);
  }

  /**
   * Decrypts data using a wallet's private key.
   *
   * @param encryptedData - The hex-encoded encrypted data to decrypt.
   * @param privateKey - The wallet's private key for decryption.
   * @returns A promise that resolves to the decrypted plaintext message.
   * @throws {Error} When decryption fails due to invalid data or key format.
   *
   * @example
   * ```typescript
   * const decrypted = await processor.decryptWithWalletPrivateKey(
   *   encryptedHexString,
   *   "0x..." // 32-byte private key
   * );
   * console.log(`Decrypted: ${decrypted}`);
   * ```
   */
  async decryptWithWalletPrivateKey(
    encryptedData: string,
    privateKey: string | Uint8Array,
  ): Promise<string> {
    // Process the private key to ensure correct format
    const privateKeyBytes = processWalletPrivateKey(privateKey);

    // Convert hex string to bytes and parse encrypted components
    const prefixedHex = encryptedData.startsWith("0x")
      ? encryptedData
      : `0x${encryptedData}`;
    const encryptedBytes = fromHex(prefixedHex as `0x${string}`, "bytes");
    const encrypted = parseEncryptedDataBuffer(encryptedBytes);

    // Perform ECIES decryption
    const decrypted = await this.eciesProvider.decrypt(
      privateKeyBytes,
      encrypted,
    );

    // Convert bytes back to string
    return bytesToString(decrypted);
  }

  /**
   * Encrypts a Uint8Array with a wallet public key
   *
   * @param data - Binary data to encrypt
   * @param publicKey - Public key as hex string or Uint8Array
   * @returns Encrypted data structure
   */
  async encryptBinary(
    data: Uint8Array,
    publicKey: string | Uint8Array,
  ): Promise<ECIESEncrypted> {
    const publicKeyBytes = processWalletPublicKey(publicKey);
    return this.eciesProvider.encrypt(publicKeyBytes, data);
  }

  /**
   * Decrypts to a Uint8Array with a wallet private key
   *
   * @param encrypted - Encrypted data structure
   * @param privateKey - Private key as hex string or Uint8Array
   * @returns Decrypted binary data
   */
  async decryptBinary(
    encrypted: ECIESEncrypted,
    privateKey: string | Uint8Array,
  ): Promise<Uint8Array> {
    const privateKeyBytes = processWalletPrivateKey(privateKey);
    return this.eciesProvider.decrypt(privateKeyBytes, encrypted);
  }

  /**
   * Gets the underlying ECIES provider
   *
   * @returns The ECIES provider instance
   */
  getECIESProvider(): ECIESProvider {
    return this.eciesProvider;
  }
}
