/**
 * Builder for Web3Signed Authorization headers.
 *
 * @remarks
 * Ported from `personal-server-ts`
 * (`packages/core/src/signing/request-signer.ts`). The original was wired
 * to a Node-only `ServerAccount` and `node:crypto`. This isomorphic version
 * accepts any `signMessage` callback (viem accounts, wallet clients, etc.)
 * and uses `@noble/hashes` for SHA-256 so it runs in browsers and Workers.
 *
 * Wire format is identical to PS — payload is JSON with sorted keys,
 * base64url-encoded, signed via EIP-191.
 *
 * @category Auth
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "viem";
import { toBase64 } from "../utils/encoding";

/**
 * Sign-message callback compatible with viem `LocalAccount`/`WalletClient`-style
 * signers. Must produce an EIP-191 (`personal_sign`) signature.
 */
export type Web3SignedSignFn = (message: string) => Promise<`0x${string}`>;

/** SHA-256 of the empty string — bodyHash for empty bodies. */
const EMPTY_BODY_HASH =
  "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** Default token lifetime (seconds). */
const DEFAULT_TTL_SECONDS = 300;

/** Base64url encode bytes (no padding). */
function base64urlEncode(input: Uint8Array): string {
  return toBase64(input)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Compute the `sha256:<hex>` bodyHash claim for a request body. */
export function computeBodyHash(body: Uint8Array | undefined): string {
  if (!body || body.length === 0) {
    return EMPTY_BODY_HASH;
  }
  const digest = sha256(body);
  return `sha256:${bytesToHex(digest).slice(2)}`;
}

/**
 * Build a Web3Signed Authorization header value.
 *
 * @returns The full header value (`"Web3Signed <base64url>.<sig>"`).
 */
export async function buildWeb3SignedHeader(params: {
  /** EIP-191 signer (e.g. viem `account.signMessage`). */
  signMessage: Web3SignedSignFn;
  /** Expected origin (e.g. `"https://ps.example.com"`). */
  aud: string;
  /** HTTP method (e.g. `"GET"`). */
  method: string;
  /** Request URI/path (e.g. `"/v1/data/instagram.profile"`). */
  uri: string;
  /** Optional request body — when present, used to compute `bodyHash`. */
  body?: Uint8Array;
  /** Issued-at (unix seconds). Defaults to now. */
  iat?: number;
  /** Expiry (unix seconds). Defaults to `iat + 300`. */
  exp?: number;
  /** Optional grant id, attached as the `grantId` claim. */
  grantId?: string;
  /** Pre-computed `bodyHash` claim — overrides `body`. */
  bodyHash?: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const iat = params.iat ?? now;
  const exp = params.exp ?? iat + DEFAULT_TTL_SECONDS;

  const payload: Record<string, unknown> = {
    aud: params.aud,
    bodyHash: params.bodyHash ?? computeBodyHash(params.body),
    exp,
    iat,
    method: params.method,
    uri: params.uri,
  };

  if (params.grantId !== undefined) {
    payload["grantId"] = params.grantId;
  }

  // Sort keys for deterministic serialization.
  const sortedPayload = Object.keys(payload)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = payload[key];
      return acc;
    }, {});

  const payloadJson = JSON.stringify(sortedPayload);
  const payloadBytes = new TextEncoder().encode(payloadJson);
  const payloadBase64 = base64urlEncode(payloadBytes);

  const signature = await params.signMessage(payloadBase64);

  return `Web3Signed ${payloadBase64}.${signature}`;
}
