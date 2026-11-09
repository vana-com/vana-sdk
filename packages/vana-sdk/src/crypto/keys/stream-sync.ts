/**
 * Stream-sync key derivation: the one implementation every app uses, so
 * Web, Desktop, phone and the Personal Server agree on stream names.
 *
 *   streamMaster = streamMasterKeyFromSignature(ownerSignature)
 *   K_ns         = deriveScopeKey(streamMaster, NAMESPACE_KEY_LABEL)
 *   ns           = hex(first 8 bytes of HMAC-SHA256(K_ns, utf8(canonicalJson([connector, accountId]))))
 *   keyCheck     = hex(first 8 bytes of HMAC-SHA256(K_ns, utf8("key-check")))
 *
 * The owner signature has more than one encoding (v = 0/1 or 27/28; s or
 * its high twin n - s). Each encoding verifies, but the raw bytes give a
 * different master key. The stream master key takes one normal form (low s,
 * v = 27/28), so every encoding of one signature gives the same stream key.
 * The legacy master key (`deriveMasterKey`) keeps the raw signature.
 *
 * @category Cryptography
 */

import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import { keccak_256 } from "@noble/hashes/sha3";
import { VanaError } from "../../errors";
import { deriveScopeKey } from "./derive";

/** The `deriveScopeKey` label that derives `K_ns` from the stream master key. */
export const NAMESPACE_KEY_LABEL = "pdpp-stream-sync/namespace/v1";

/** HMAC message for the key-check value. */
export const KEY_CHECK_MESSAGE = "key-check";

export const ACTIVE_DATA_PREFIX = "pdpp.stream-sync.connection.active.v1:";
export const ACTIVE_METADATA_LABEL =
  "pdpp.stream-sync.connection.active.metadata.v1";
/** Same labels as the Personal Server tombstone constants. */
export const TOMBSTONE_DATA_LABEL = "vana.data-point.tombstone.v1";
export const TOMBSTONE_METADATA_LABEL = "vana.data-point.tombstone.metadata.v1";

/** Order of the secp256k1 group. */
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_N = N >> 1n;

const encoder = new TextEncoder();

function toBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function toBytes32(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i -= 1) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function signatureBytes(signature: Uint8Array | `0x${string}`): Uint8Array {
  if (typeof signature !== "string") {
    if (signature.length !== 65) {
      throw new VanaError(
        `owner signature must be 65 bytes, got ${signature.length}`,
        "INVALID_SIGNATURE",
      );
    }
    return signature;
  }
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new VanaError(
      "owner signature must be 0x followed by 130 hex characters (65 bytes)",
      "INVALID_SIGNATURE",
    );
  }
  const out = new Uint8Array(65);
  for (let i = 0; i < 65; i += 1) {
    out[i] = parseInt(signature.slice(2 + i * 2, 4 + i * 2), 16);
  }
  return out;
}

/**
 * The stream master key: the 65-byte owner signature as r, low s and
 * v = 27/28. Every encoding of one signature gives the same result.
 *
 * @param signature - 65 bytes, or 0x-prefixed hex of 65 bytes.
 * @throws {@link VanaError} with code `INVALID_SIGNATURE` when the input is
 * not 65 bytes, v is not 0, 1, 27 or 28, or r or s is outside [1, n - 1].
 */
export function streamMasterKeyFromSignature(
  signature: Uint8Array | `0x${string}`,
): Uint8Array {
  const bytes = signatureBytes(signature);
  const r = toBigInt(bytes.subarray(0, 32));
  let s = toBigInt(bytes.subarray(32, 64));
  const rawV = bytes[64]!;
  if (rawV !== 0 && rawV !== 1 && rawV !== 27 && rawV !== 28) {
    throw new VanaError(
      `owner signature v must be 0, 1, 27 or 28, got ${rawV}`,
      "INVALID_SIGNATURE",
    );
  }
  if (r === 0n || r >= N || s === 0n || s >= N) {
    throw new VanaError(
      "owner signature r or s is out of range",
      "INVALID_SIGNATURE",
    );
  }
  let parity = rawV >= 27 ? rawV - 27 : rawV;
  if (s > HALF_N) {
    s = N - s;
    parity ^= 1;
  }
  const out = new Uint8Array(65);
  out.set(bytes.subarray(0, 32), 0);
  out.set(toBytes32(s), 32);
  out[64] = 27 + parity;
  return out;
}

/** `K_ns = deriveScopeKey(streamMaster, NAMESPACE_KEY_LABEL)`. */
export function deriveNamespaceKey(streamMasterKey: Uint8Array): Uint8Array {
  return deriveScopeKey(streamMasterKey, NAMESPACE_KEY_LABEL);
}

function first8Hex(kNs: Uint8Array, message: Uint8Array): string {
  return toHex(hmac(sha256, kNs, message).subarray(0, 8));
}

/**
 * The connection namespace (`ns`): 16 lowercase hex characters derived from
 * the connector id and the account id. Connectors with no account identity
 * are not covered here; `accountId` must be a non-empty string.
 */
export function deriveNs(
  kNs: Uint8Array,
  connector: string,
  accountId: string,
): string {
  if (typeof connector !== "string") {
    throw new VanaError("connector must be a string", "INVALID_ARGUMENT");
  }
  if (typeof accountId !== "string" || accountId === "") {
    throw new VanaError(
      "accountId must be a non-empty string",
      "INVALID_ARGUMENT",
    );
  }
  // Same bytes as canonicalJson([connector, accountId]) for two strings.
  const json = `[${JSON.stringify(connector)},${JSON.stringify(accountId)}]`;
  return first8Hex(kNs, encoder.encode(json));
}

/** The key check: 16 lowercase hex characters, the same for one `K_ns`. */
export function deriveKeyCheck(kNs: Uint8Array): string {
  return first8Hex(kNs, encoder.encode(KEY_CHECK_MESSAGE));
}

export interface ControlHashes {
  /** keccak256("pdpp.stream-sync.connection.active.v1:" + keyCheck) */
  readonly activeData: `0x${string}`;
  readonly activeMetadata: `0x${string}`;
  readonly tombstoneData: `0x${string}`;
  readonly tombstoneMetadata: `0x${string}`;
}

function keccakHex(text: string): `0x${string}` {
  return `0x${toHex(keccak_256(encoder.encode(text)))}`;
}

/**
 * The registry hashes a device writes and recognises for its own key.
 *
 * @param keyCheck - 16 lowercase hex characters from {@link deriveKeyCheck}.
 */
export function controlHashes(keyCheck: string): ControlHashes {
  if (!/^[0-9a-f]{16}$/.test(keyCheck)) {
    throw new VanaError(
      "keyCheck must be 16 lowercase hex characters",
      "INVALID_ARGUMENT",
    );
  }
  return {
    activeData: keccakHex(ACTIVE_DATA_PREFIX + keyCheck),
    activeMetadata: keccakHex(ACTIVE_METADATA_LABEL),
    tombstoneData: keccakHex(TOMBSTONE_DATA_LABEL),
    tombstoneMetadata: keccakHex(TOMBSTONE_METADATA_LABEL),
  };
}
