/**
 * HKDF-based key derivation for the Vana Data Portability Protocol.
 *
 * @remarks
 * Ported verbatim from `personal-server-ts` (`packages/core/src/keys/derive.ts`)
 * to keep wire compatibility with the locked DPv1 encryption scheme. The wallet
 * signature over `"vana-master-key-v1"` IS the master key material (spec §2.3),
 * and per-scope keys are derived via HKDF-SHA256 with `salt="vana"` and
 * `info="scope:{scope}"`.
 *
 * @category Cryptography
 */

import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { recoverMessageAddress } from "viem";

/**
 * Canonical message signed by the user's wallet to derive the master key.
 *
 * @remarks
 * NOTE: kept in sync with personal-server-ts. The Vana team's encryption design
 * doc references `"vana-master-encryption-v1"`; this implementation uses the
 * shipping value to preserve wire compatibility.
 */
export const MASTER_KEY_MESSAGE = "vana-master-key-v1";

/**
 * Extracts master key material from an EIP-191 signature over the master key
 * message. The raw 65 signature bytes ARE the master key material.
 *
 * @param signature - 0x-prefixed hex string (65 bytes = 130 hex chars + 0x).
 * @returns 65-byte Uint8Array containing the raw signature bytes.
 */
export function deriveMasterKey(signature: `0x${string}`): Uint8Array {
  const hex = signature.slice(2);

  if (hex.length !== 130) {
    throw new Error(
      `Invalid signature length: expected 130 hex chars (65 bytes), got ${hex.length}`,
    );
  }

  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("Invalid signature: contains non-hex characters");
  }

  const bytes = new Uint8Array(65);
  for (let i = 0; i < 65; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Recovers the server owner address from a master key signature using EIP-191
 * recovery over {@link MASTER_KEY_MESSAGE}.
 */
export async function recoverServerOwner(
  masterKeySignature: `0x${string}`,
): Promise<`0x${string}`> {
  return recoverMessageAddress({
    message: MASTER_KEY_MESSAGE,
    signature: masterKeySignature,
  });
}

/**
 * Derives a scope-specific 32-byte key via HKDF-SHA256.
 *
 * @remarks
 * Uses `salt="vana"` and `info="scope:{scope}"` per spec §2.3.
 *
 * @param masterKey - 65-byte master key material from {@link deriveMasterKey}.
 * @param scope - Scope identifier (e.g. `"instagram.profile"`).
 * @returns 32-byte derived key suitable for symmetric encryption.
 */
export function deriveScopeKey(
  masterKey: Uint8Array,
  scope: string,
): Uint8Array {
  const salt = new TextEncoder().encode("vana");
  const info = new TextEncoder().encode(`scope:${scope}`);
  return hkdf(sha256, masterKey, salt, info, 32);
}
