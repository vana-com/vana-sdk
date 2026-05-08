/**
 * PKCE (Proof Key for Code Exchange) primitives per RFC 7636.
 *
 * @remarks
 * Implements the S256 challenge method only. All functions are pure and
 * isomorphic — they rely on the `crypto.getRandomValues` and
 * `crypto.subtle` Web Crypto APIs available as globals in browsers and
 * Node.js (>= 20).
 *
 * @category Auth
 * @module auth/pkce
 */

// RFC 7636 §4.1 unreserved characters: ALPHA / DIGIT / "-" / "." / "_" / "~"
const PKCE_VERIFIER_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

const PKCE_VERIFIER_MIN_LENGTH = 43;
const PKCE_VERIFIER_MAX_LENGTH = 128;
const PKCE_VERIFIER_DEFAULT_LENGTH = 64;

/**
 * Generates a cryptographically random PKCE code verifier.
 *
 * @param length - Verifier length in characters. Must be between 43 and 128
 *   (RFC 7636 §4.1). Defaults to 64.
 * @returns A string of the requested length using only the RFC-allowed
 *   unreserved alphabet.
 */
export function generatePkceVerifier(
  length: number = PKCE_VERIFIER_DEFAULT_LENGTH,
): string {
  if (
    !Number.isInteger(length) ||
    length < PKCE_VERIFIER_MIN_LENGTH ||
    length > PKCE_VERIFIER_MAX_LENGTH
  ) {
    throw new RangeError(
      `PKCE verifier length must be an integer between ${PKCE_VERIFIER_MIN_LENGTH} and ${PKCE_VERIFIER_MAX_LENGTH}`,
    );
  }

  const alphabetLen = PKCE_VERIFIER_ALPHABET.length;
  // Reject-sample to avoid modulo bias from a non-power-of-two alphabet (66).
  const acceptCutoff = Math.floor(256 / alphabetLen) * alphabetLen;

  const out = new Array<string>(length);
  let filled = 0;
  const buffer = new Uint8Array(length * 2);

  while (filled < length) {
    crypto.getRandomValues(buffer);
    for (let i = 0; i < buffer.length && filled < length; i++) {
      const byte = buffer[i] as number;
      if (byte < acceptCutoff) {
        out[filled++] = PKCE_VERIFIER_ALPHABET[byte % alphabetLen] as string;
      }
    }
  }

  return out.join("");
}

/**
 * Computes the S256 PKCE code challenge for a verifier.
 *
 * @param verifier - The PKCE code verifier.
 * @returns The base64url-encoded SHA-256 hash of the verifier (no padding).
 */
export async function computePkceChallenge(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Verifies that a verifier hashes to the given S256 challenge.
 *
 * @param verifier - The PKCE code verifier presented by the client.
 * @param challenge - The previously stored S256 challenge.
 * @returns `true` when the verifier matches; `false` otherwise.
 */
export async function verifyPkceChallenge(
  verifier: string,
  challenge: string,
): Promise<boolean> {
  const computed = await computePkceChallenge(verifier);
  return constantTimeEqualString(computed, challenge);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  // btoa is available in Node 16+ and all browsers.
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function constantTimeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
