/**
 * Canonical Vana Protocol Encryption Functions
 *
 * These functions define the standard way user data is encrypted/decrypted in Vana.
 * All applications should use these canonical functions to ensure compatibility
 * with existing encrypted data on the Vana network.
 */

import * as openpgp from "openpgp";
import * as eccrypto from "eccrypto";
import { type WalletClient } from "viem";

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
 * Encrypt user data using the canonical Vana protocol
 *
 * This is the standard way to encrypt files in Vana. Uses OpenPGP symmetric
 * encryption with the user's signature as the password. All encrypted data
 * on Vana follows this pattern.
 *
 * @param data The data to encrypt (as a Blob)
 * @param encryptionKey The encryption key (signature from generateEncryptionKey)
 * @returns The encrypted data as a Blob
 */
export async function encryptUserData(
  data: Blob,
  encryptionKey: string,
): Promise<Blob> {
  try {
    // Convert Blob to binary for OpenPGP
    const dataBuffer = await data.arrayBuffer();
    const message = await openpgp.createMessage({
      binary: new Uint8Array(dataBuffer),
    });

    // Encrypt using signature as password (Vana standard)
    const encrypted = await openpgp.encrypt({
      message,
      passwords: [encryptionKey],
      format: "binary",
    });

    // Convert encrypted stream to Blob
    const response = new Response(encrypted as ReadableStream<Uint8Array>);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    return new Blob([uint8Array], {
      type: "application/octet-stream",
    });
  } catch (error) {
    throw new Error(
      `Failed to encrypt user data: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Decrypt user data using the canonical Vana protocol
 *
 * This is the standard way to decrypt files in Vana. Uses OpenPGP symmetric
 * decryption with the user's signature as the password.
 *
 * @param encryptedData The encrypted data (as a Blob)
 * @param encryptionKey The encryption key (signature from generateEncryptionKey)
 * @returns The decrypted data as a Blob
 */
export async function decryptUserData(
  encryptedData: Blob,
  encryptionKey: string,
): Promise<Blob> {
  try {
    // Convert Blob to binary for OpenPGP
    const dataBuffer = await encryptedData.arrayBuffer();
    const uint8Array = new Uint8Array(dataBuffer);

    // Read the encrypted message
    const message = await openpgp.readMessage({
      binaryMessage: uint8Array,
    });

    // Decrypt using signature as password (Vana standard)
    const { data: decrypted } = await openpgp.decrypt({
      message,
      passwords: [encryptionKey],
      format: "binary",
    });

    // Convert decrypted data back to Blob
    return new Blob([decrypted as Uint8Array]);
  } catch (error) {
    throw new Error(
      `Failed to decrypt user data: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Encrypt data with a wallet public key using ECIES
 *
 * This function encrypts data using a wallet's public key, allowing only the holder
 * of the corresponding private key to decrypt it. Used for granting file permissions
 * by encrypting the user's encryption key with a server's public key.
 *
 * @param data The data to encrypt (string)
 * @param publicKey The wallet public key (hex string, with or without 0x prefix)
 * @returns The encrypted data as a hex string
 */
export async function encryptWithWalletPublicKey(
  data: string,
  publicKey: string,
): Promise<string> {
  try {
    // Remove 0x prefix if present
    const cleanPublicKey = publicKey.startsWith("0x")
      ? publicKey.slice(2)
      : publicKey;

    // Convert hex string to bytes
    const publicKeyBytes = Buffer.from(cleanPublicKey, "hex");

    // Handle compressed vs uncompressed keys
    const uncompressedKey =
      publicKeyBytes.length === 64
        ? Buffer.concat([Buffer.from([4]), publicKeyBytes])
        : publicKeyBytes;

    // Encrypt with ECIES
    const encryptedBuffer = await eccrypto.encrypt(
      uncompressedKey,
      Buffer.from(data),
    );

    // Combine all parts into a single buffer
    const combined = Buffer.concat([
      encryptedBuffer.iv,
      encryptedBuffer.ephemPublicKey,
      encryptedBuffer.ciphertext,
      encryptedBuffer.mac,
    ]);

    return combined.toString("hex");
  } catch (error) {
    throw new Error(
      `Failed to encrypt with wallet public key: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Example usage for demo app integration:
 *
 * // 1. User encrypts their data with their own key
 * const encryptionKey = await generateEncryptionKey(wallet);
 * const encryptedData = await encryptUserData(data, encryptionKey);
 *
 * // 2. To grant server permission, encrypt user's key with server's public key
 * const serverPublicKey = getTrustedServerPublicKey(serverAddress); // TODO: Implement
 * const encryptedKey = await encryptWithWalletPublicKey(encryptionKey, serverPublicKey);
 *
 * // 3. Store permission via data registry
 * await addFileWithPermissions(fileId, [{
 *   address: serverAddress,
 *   encryptedKey: encryptedKey
 * }]);
 */

/**
 * Decrypt data with a wallet private key using ECIES
 *
 * This function decrypts data that was encrypted with the corresponding public key.
 * Used by servers or other permitted parties to decrypt the user's encryption key
 * so they can then decrypt the user's data.
 *
 * @param encryptedData The encrypted data (hex string)
 * @param privateKey The wallet private key (hex string, with or without 0x prefix)
 * @returns The decrypted data as a string
 */
export async function decryptWithWalletPrivateKey(
  encryptedData: string,
  privateKey: string,
): Promise<string> {
  try {
    // Remove 0x prefix if present
    const cleanPrivateKey = privateKey.startsWith("0x")
      ? privateKey.slice(2)
      : privateKey;
    const cleanEncryptedData = encryptedData.startsWith("0x")
      ? encryptedData.slice(2)
      : encryptedData;

    // Convert hex strings to bytes
    const privateKeyBytes = Buffer.from(cleanPrivateKey, "hex");
    const encryptedDataBytes = Buffer.from(cleanEncryptedData, "hex");

    // Parse the encrypted data (iv + ephemPublicKey + ciphertext + mac)
    const iv = encryptedDataBytes.subarray(0, 16);
    const ephemPublicKey = encryptedDataBytes.subarray(16, 81); // 65 bytes for uncompressed public key
    const ciphertext = encryptedDataBytes.subarray(81, -32);
    const mac = encryptedDataBytes.subarray(-32);

    // Reconstruct the encrypted object
    const encryptedObject = {
      iv,
      ephemPublicKey,
      ciphertext,
      mac,
    };

    // Decrypt with ECIES
    const decryptedBuffer = await eccrypto.decrypt(
      privateKeyBytes,
      encryptedObject,
    );

    return decryptedBuffer.toString("utf8");
  } catch (error) {
    throw new Error(
      `Failed to decrypt with wallet private key: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Stub function for demo app - gets server public key from trusted server registry
 *
 * TODO: Replace with actual trusted server registry implementation
 *
 * @param serverAddress The server's wallet address
 * @returns The server's public key (hex string)
 */
export function getTrustedServerPublicKey(_serverAddress: string): string {
  console.warn(
    "STUB: Using mock server public key. Implement trusted server registry!",
  );

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Production requires real trusted server registry with public keys",
    );
  }

  // Mock public key for development - this would be the server's actual public key
  return "0x04a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}

// Note: Key sharing functions for DLP access (ECIES/eccrypto) will be added later
// as a separate feature for proxy re-encryption workflow.
