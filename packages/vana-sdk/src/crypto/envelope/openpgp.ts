/**
 * Password-based file encryption using OpenPGP, the locked DPv1 envelope.
 *
 * @remarks
 * Ported from `personal-server-ts`
 * (`packages/core/src/storage/encryption/{encrypt,decrypt}.ts`).
 * The binary format must remain byte-compatible with PS — a vana-sdk encrypt +
 * a personal-server-ts decrypt (and vice versa) must round-trip cleanly.
 *
 * @category Cryptography
 */

import * as openpgp from "openpgp";

/**
 * Encrypt plaintext using OpenPGP password-based encryption.
 *
 * @param plaintext - Bytes to encrypt (e.g. `JSON.stringify` of an envelope).
 * @param password - Hex-encoded scope key (typically from `deriveScopeKey`).
 * @returns OpenPGP-encrypted binary data.
 */
export async function encryptWithPassword(
  plaintext: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  const message = await openpgp.createMessage({ binary: plaintext });
  const encrypted = await openpgp.encrypt({
    message,
    passwords: [password],
    format: "binary",
  });
  return encrypted as Uint8Array;
}

/**
 * Decrypt an OpenPGP password-encrypted binary.
 *
 * @param encrypted - OpenPGP-encrypted binary data.
 * @param password - Hex-encoded scope key.
 * @returns Decrypted plaintext bytes.
 * @throws If the password is wrong or the data is corrupted.
 */
export async function decryptWithPassword(
  encrypted: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  const message = await openpgp.readMessage({ binaryMessage: encrypted });
  const { data } = await openpgp.decrypt({
    message,
    passwords: [password],
    format: "binary",
  });
  return data as Uint8Array;
}
