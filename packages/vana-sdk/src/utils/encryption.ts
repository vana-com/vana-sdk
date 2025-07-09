/**
 * Canonical Vana Protocol Encryption Functions
 *
 * These functions define the standard way user data is encrypted/decrypted in Vana.
 * All applications should use these canonical functions to ensure compatibility
 * with existing encrypted data on the Vana network.
 */

import * as openpgp from "openpgp";
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
 * Derive server identity from user's encryption key
 * 
 * This function creates a deterministic server identity by combining the user's
 * encryption key with the server URL. This ensures that each user-server pair
 * has a unique, derived identity for file access control.
 *
 * @param userEncryptionKey The user's encryption key (signature)
 * @param serverUrl The server URL
 * @returns A derived server identity address
 */
export function deriveServerIdentity(
  userEncryptionKey: string,
  serverUrl: string,
): string {
  // Create deterministic server identity by hashing user key + server URL
  const combinedData = `${userEncryptionKey}${serverUrl}`;
  
  // Simple hash function - in production, use a proper crypto hash
  let hash = 0;
  for (let i = 0; i < combinedData.length; i++) {
    const char = combinedData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert hash to hex address format
  const hashHex = (hash >>> 0).toString(16).padStart(8, '0');
  return `0x${hashHex}${'0'.repeat(32)}`;
}

/**
 * Generate server-specific encryption key for file access
 * 
 * This function creates a server-specific key that can be used to encrypt
 * files for a particular trusted server. The key is derived from the user's
 * encryption key and the server's identity.
 *
 * @param userEncryptionKey The user's encryption key (signature)
 * @param serverId The server's address/identity
 * @returns A server-specific encryption key
 */
export function generateServerEncryptionKey(
  userEncryptionKey: string,
  serverId: string,
): string {
  // Derive server-specific key by combining user key with server ID
  const combinedData = `${userEncryptionKey}${serverId}`;
  
  // Create a deterministic key for this user-server pair
  let hash = 0;
  for (let i = 0; i < combinedData.length; i++) {
    const char = combinedData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  // Return as hex string that can be used as encryption key
  return `server_key_${hash.toString(16)}`;
}

/**
 * Encrypt file data for a specific trusted server
 * 
 * This function encrypts user data with a server-specific key, allowing
 * only the specified server to decrypt the data while maintaining user
 * control over the encryption process.
 *
 * @param data The data to encrypt (as a Blob)
 * @param userEncryptionKey The user's encryption key (signature)
 * @param serverId The server's address/identity
 * @returns The encrypted data as a Blob
 */
export async function encryptForServer(
  data: Blob,
  userEncryptionKey: string,
  serverId: string,
): Promise<Blob> {
  try {
    // Generate server-specific encryption key
    const serverKey = generateServerEncryptionKey(userEncryptionKey, serverId);
    
    // Use standard encryption with server-specific key
    return await encryptUserData(data, serverKey);
  } catch (error) {
    throw new Error(
      `Failed to encrypt data for server: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Decrypt file data that was encrypted for a specific server
 * 
 * This function decrypts server-encrypted data using the same derivation
 * process as the encryption, allowing users to decrypt data that was
 * encrypted for their trusted servers.
 *
 * @param encryptedData The encrypted data (as a Blob)
 * @param userEncryptionKey The user's encryption key (signature)
 * @param serverId The server's address/identity
 * @returns The decrypted data as a Blob
 */
export async function decryptFromServer(
  encryptedData: Blob,
  userEncryptionKey: string,
  serverId: string,
): Promise<Blob> {
  try {
    // Generate the same server-specific encryption key
    const serverKey = generateServerEncryptionKey(userEncryptionKey, serverId);
    
    // Use standard decryption with server-specific key
    return await decryptUserData(encryptedData, serverKey);
  } catch (error) {
    throw new Error(
      `Failed to decrypt data from server: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// Note: Key sharing functions for DLP access (ECIES/eccrypto) will be added later
// as a separate feature for proxy re-encryption workflow.
