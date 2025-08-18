/**
 * Wallet Key Processor - Business Logic Layer
 *
 * @remarks
 * Handles wallet-specific encryption/decryption operations using raw crypto primitives.
 * This separates business logic (how to process wallet keys) from crypto implementation
 * (the actual ECIES operations).
 *
 * Design principle: Adapters provide crypto primitives, this class orchestrates them.
 */

import type { ECIESProvider, ECIESEncrypted } from "../crypto/ecies/interface";
import {
  processWalletPublicKey,
  processWalletPrivateKey,
  parseEncryptedDataBuffer,
  concatBytes,
  hexToBytes,
  bytesToHex,
} from "../utils/crypto-utils";
import { stringToBytes, bytesToString } from "../utils/encoding";

export interface WalletKeyProcessorConfig {
  /** ECIES provider for encryption/decryption */
  eciesProvider: ECIESProvider;
}

/**
 * Processes wallet keys for encryption and decryption operations
 *
 * @remarks
 * This class encapsulates the business logic for wallet key operations,
 * delegating actual cryptographic operations to the provided ECIES provider.
 * It handles key normalization, data conversion, and format transformation.
 */
export class WalletKeyProcessor {
  private readonly eciesProvider: ECIESProvider;

  constructor(config: WalletKeyProcessorConfig) {
    this.eciesProvider = config.eciesProvider;
  }

  /**
   * Encrypts data with a wallet public key
   *
   * @param data - String data to encrypt
   * @param publicKey - Public key as hex string or Uint8Array
   * @returns Encrypted data as hex string
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

    // Return as hex string for API compatibility
    return bytesToHex(result);
  }

  /**
   * Decrypts data with a wallet private key
   *
   * @param encryptedData - Encrypted data as hex string
   * @param privateKey - Private key as hex string or Uint8Array
   * @returns Decrypted string data
   */
  async decryptWithWalletPrivateKey(
    encryptedData: string,
    privateKey: string | Uint8Array,
  ): Promise<string> {
    // Process the private key to ensure correct format
    const privateKeyBytes = processWalletPrivateKey(privateKey);

    // Convert hex string to bytes and parse encrypted components
    const encryptedBytes = hexToBytes(encryptedData);
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
