/**
 * Web3Signed Authorization header parsing and verification.
 *
 * @remarks
 * Header format: `"Web3Signed {base64url(payload)}.{signature}"`.
 * Payload is JSON with fields `aud`, `method`, `uri`, `bodyHash`, `iat`, `exp`,
 * and optional `grantId`. The signature is EIP-191 over the base64url-encoded
 * payload string.
 *
 * Ported from `personal-server-ts` (`packages/core/src/auth/web3-signed.ts`).
 * Adjusted to be isomorphic (no `Buffer`) and to use SDK-local error types.
 *
 * @category Auth
 */

import { recoverMessageAddress } from "viem";
import { fromBase64 } from "../utils/encoding";
import {
  MissingAuthError,
  InvalidSignatureError,
  ExpiredTokenError,
} from "./errors";

export interface Web3SignedPayload {
  aud: string;
  method: string;
  uri: string;
  bodyHash: string;
  iat: number;
  exp: number;
  grantId?: string;
}

export interface VerifiedAuth {
  signer: `0x${string}`;
  payload: Web3SignedPayload;
}

const WEB3_SIGNED_PREFIX = "Web3Signed ";
const CLOCK_SKEW_SECONDS = 60;

/** Decode a base64url string (no padding) to UTF-8. */
function base64urlDecode(input: string): string {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (base64.length % 4)) % 4;
  base64 += "=".repeat(padLength);
  return new TextDecoder().decode(fromBase64(base64));
}

/**
 * Parse a `"Web3Signed <base64url>.<signature>"` header value.
 *
 * @throws {MissingAuthError} If the header is missing or empty.
 * @throws {InvalidSignatureError} If the format is invalid.
 */
export function parseWeb3SignedHeader(headerValue: string | undefined): {
  payloadBase64: string;
  payload: Web3SignedPayload;
  signature: `0x${string}`;
} {
  if (!headerValue) {
    throw new MissingAuthError();
  }

  if (!headerValue.startsWith(WEB3_SIGNED_PREFIX)) {
    throw new InvalidSignatureError({ reason: "Missing Web3Signed prefix" });
  }

  const value = headerValue.slice(WEB3_SIGNED_PREFIX.length);
  const dotIndex = value.indexOf(".");
  if (dotIndex === -1 || dotIndex === 0 || dotIndex === value.length - 1) {
    throw new InvalidSignatureError({ reason: "Invalid header format" });
  }

  const payloadBase64 = value.slice(0, dotIndex);
  const signatureStr = value.slice(dotIndex + 1);

  if (!signatureStr.startsWith("0x")) {
    throw new InvalidSignatureError({ reason: "Invalid signature format" });
  }

  let payload: Web3SignedPayload;
  try {
    const decoded = base64urlDecode(payloadBase64);
    payload = JSON.parse(decoded) as Web3SignedPayload;
  } catch {
    throw new InvalidSignatureError({ reason: "Invalid payload encoding" });
  }

  return {
    payloadBase64,
    payload,
    signature: signatureStr as `0x${string}`,
  };
}

/**
 * Full verification: parse header, recover signer via EIP-191, check claims.
 *
 * @remarks
 * Steps:
 * 1. Parse header to base64url + signature.
 * 2. Recover signer via {@link recoverMessageAddress} (EIP-191) over the base64url payload string.
 * 3. Check `aud === expectedOrigin`, `method === expectedMethod`, `uri === expectedPath`.
 * 4. Check `iat`/`exp` within a 60s clock skew.
 *
 * @returns The recovered signer address and parsed payload.
 */
export async function verifyWeb3Signed(params: {
  headerValue: string | undefined;
  expectedOrigin: string;
  expectedMethod: string;
  expectedPath: string;
  now?: number;
}): Promise<VerifiedAuth> {
  const { payloadBase64, payload, signature } = parseWeb3SignedHeader(
    params.headerValue,
  );

  let signer: `0x${string}`;
  try {
    signer = await recoverMessageAddress({
      message: payloadBase64,
      signature,
    });
  } catch {
    throw new InvalidSignatureError({ reason: "Signature recovery failed" });
  }

  if (payload.aud !== params.expectedOrigin) {
    throw new InvalidSignatureError({
      reason: "Audience mismatch",
      expected: params.expectedOrigin,
      actual: payload.aud,
    });
  }

  if (payload.method !== params.expectedMethod) {
    throw new InvalidSignatureError({
      reason: "Method mismatch",
      expected: params.expectedMethod,
      actual: payload.method,
    });
  }

  if (payload.uri !== params.expectedPath) {
    throw new InvalidSignatureError({
      reason: "URI mismatch",
      expected: params.expectedPath,
      actual: payload.uri,
    });
  }

  const now = params.now ?? Math.floor(Date.now() / 1000);

  if (payload.exp < now - CLOCK_SKEW_SECONDS) {
    throw new ExpiredTokenError({ reason: "Token expired" });
  }

  if (payload.iat > now + CLOCK_SKEW_SECONDS) {
    throw new ExpiredTokenError({ reason: "Token issued in the future" });
  }

  return { signer, payload };
}
