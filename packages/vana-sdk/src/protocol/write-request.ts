/**
 * Transport shared by every builder call that authenticates with the
 * Personal Server Write API: the data writes of
 * {@link ../protocol/personal-server-write} and the derivative question
 * routes of {@link ../protocol/derivative-questions}.
 *
 * @remarks
 * Both sign a single-use Web3Signed proof per request, so both need the same
 * two things: a `fetch` wrapper that re-signs on every transport attempt, and
 * one process-wide record of the `iat` seconds already issued, so two proofs
 * for the same request identity can never come out byte-identical (the server
 * would reject the second as a replay). The record must be shared, not
 * per-module: a builder that polls one question every few milliseconds signs
 * the same `{ aud, method, uri, bodyHash, grantId }` many times a second.
 *
 * @internal
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "viem";
import { WriteRequestError, WriteTransportError } from "../errors";

/**
 * Transport-level retry knobs shared by every Write API call.
 *
 * @remarks
 * Applies only when `fetch` **throws** (connection reset, DNS, a relay drop).
 * Every attempt signs a fresh proof, because the Personal Server consumes a
 * proof the moment it accepts it. A received HTTP response is never retried:
 * a 4xx/5xx is surfaced as a typed error.
 * @category Protocol
 */
export interface WriteTransportRetryOptions {
  /** Total attempts including the first (default 3). `1` disables retries. */
  attempts?: number;
  /** Delay before the first retry (ms); doubles per retry (default 1_000). */
  initialDelayMs?: number;
}

/** Strip trailing slashes so a base URL concatenates with a path. */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/** The caller's `fetch`, else the global one. */
export function resolveFetch(fetchFn: typeof fetch | undefined): typeof fetch {
  const resolved = fetchFn ?? globalThis.fetch;
  if (resolved === undefined) {
    throw new WriteRequestError("No fetch implementation available");
  }
  return resolved;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The Personal Server consumes every proof it accepts, and a Web3Signed
 * payload is fully determined by `{ aud, method, uri, bodyHash, grantId, iat,
 * exp }`, so two proofs for the same request signed within one second would
 * be byte-identical and the second rejected as a replay. Remember the
 * highest `iat` issued per request identity in this process and bump past
 * it when a second proof for the same identity falls inside the same second.
 *
 * A mark is kept for as long as the server can still remember the proof it
 * guards (its lifetime plus the verifier's clock skew), so a proof is never
 * re-issued while it could still be rejected as a replay: not by a burst,
 * and not by a wall clock stepping backwards (an identical request after a
 * step back waits for the clock instead of reusing the mark). Marks are
 * bucketed by their `iat` second, so pruning (once per second) only touches
 * the buckets that fell out of the retention window: the work per proof is
 * amortised constant and the map is bounded by the distinct requests signed
 * in the window.
 */
const issuedProofIats = new Map<string, number>();
/** `iat` second -> identities whose current mark is that second. */
const issuedProofBuckets = new Map<number, Set<string>>();
let issuedProofIatsPrunedAtSec = 0;
/** `buildWeb3SignedHeader`'s default `exp - iat`. */
const WEB3_SIGNED_PROOF_LIFETIME_SECONDS = 300;
/** The verifier's tolerated clock skew (`verifyWeb3Signed`). */
const WEB3_SIGNED_CLOCK_SKEW_SECONDS = 60;
const PROOF_IAT_RETENTION_SECONDS =
  WEB3_SIGNED_PROOF_LIFETIME_SECONDS + WEB3_SIGNED_CLOCK_SKEW_SECONDS;
/**
 * How far ahead of the clock a bumped `iat` may run when the proof is sent.
 * The verifier tolerates 60 s of skew. A burst of identical requests that
 * would need to run further ahead waits for the clock instead, so a proof is
 * never repeated; sustained identical requests are throttled to one per
 * second after a burst of this many.
 */
const PROOF_IAT_MAX_AHEAD_SECONDS = 30;

function pruneIssuedProofIats(nowSec: number): void {
  if (issuedProofIatsPrunedAtSec === nowSec) return;
  issuedProofIatsPrunedAtSec = nowSec;
  const cutoff = nowSec - PROOF_IAT_RETENTION_SECONDS;
  // There is at most one bucket per second in the window, so this walk is
  // bounded by the window length, not by the number of marks.
  for (const [sec, keys] of issuedProofBuckets) {
    if (sec >= cutoff) continue;
    for (const key of keys) issuedProofIats.delete(key);
    issuedProofBuckets.delete(sec);
  }
}

function setIssuedProofIat(key: string, iat: number, previous?: number): void {
  if (previous !== undefined) {
    const bucket = issuedProofBuckets.get(previous);
    bucket?.delete(key);
    if (bucket?.size === 0) issuedProofBuckets.delete(previous);
  }
  issuedProofIats.set(key, iat);
  let bucket = issuedProofBuckets.get(iat);
  if (bucket === undefined) {
    bucket = new Set();
    issuedProofBuckets.set(iat, bucket);
  }
  bucket.add(key);
}

/**
 * Reserve the next `iat` for a request identity. The reservation is made
 * synchronously so concurrent callers never share a value; the returned
 * promise only waits when the reserved `iat` is further ahead of the clock
 * than {@link PROOF_IAT_MAX_AHEAD_SECONDS}.
 */
export function nextProofIat(proofKey: string): Promise<number> {
  const nowSec = Math.floor(Date.now() / 1000);
  pruneIssuedProofIats(nowSec);
  const last = issuedProofIats.get(proofKey);
  const iat = last === undefined ? nowSec : Math.max(nowSec, last + 1);
  setIssuedProofIat(proofKey, iat, last);
  const waitSec = iat - nowSec - PROOF_IAT_MAX_AHEAD_SECONDS;
  if (waitSec <= 0) return Promise.resolve(iat);
  return sleep(waitSec * 1000).then(() => iat);
}

/**
 * A fresh `nonce` claim for one proof.
 *
 * @remarks
 * The Personal Server keys its replay guard on `(builder, nonce)` when a
 * proof carries a nonce, and on the whole proof when it does not. A nonce is
 * therefore what makes two identical requests signed inside the same second
 * distinct instead of the second being refused as a replay, which is the
 * difference between a poll loop that works and one that dies on its second
 * pass. Every question call sends one.
 */
export function freshProofNonce(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  // Older runtimes expose getRandomValues without randomUUID; 16 random bytes
  // are the same uniqueness with a different spelling.
  if (typeof webCrypto?.getRandomValues === "function") {
    return bytesToHex(webCrypto.getRandomValues(new Uint8Array(16)));
  }
  throw new WriteRequestError(
    "No secure random source available to build a proof nonce; provide a crypto global",
  );
}

/** The identity a proof is deduplicated by. */
export function proofKeyFor(parts: {
  aud: string;
  method: string;
  uri: string;
  grantId: string;
  signedBytes?: Uint8Array;
}): string {
  // A digest, so a retained mark costs a fixed amount of memory whatever the
  // request looked like.
  return bytesToHex(
    sha256(
      new TextEncoder().encode(
        JSON.stringify([
          parts.aud,
          parts.method,
          parts.uri,
          parts.grantId,
          parts.signedBytes ? bytesToHex(sha256(parts.signedBytes)) : "",
        ]),
      ),
    ),
  );
}

/**
 * Send a request, re-signing it on every attempt. Only a thrown `fetch` is
 * retried; the proof builder and any received response are never retried.
 */
export async function sendWithFreshProof(
  label: string,
  fetchFn: typeof fetch,
  options: WriteTransportRetryOptions | undefined,
  proofKey: string,
  build: (iat: number) => Promise<{ url: string; init: RequestInit }>,
): Promise<Response> {
  const attempts = Math.max(1, Math.floor(finiteOr(options?.attempts, 3)));
  let delayMs = Math.max(0, finiteOr(options?.initialDelayMs, 1_000));
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { url, init } = await build(await nextProofIat(proofKey));
    try {
      return await fetchFn(url, init);
    } catch (err) {
      lastError = err;
    }
    if (attempt < attempts - 1) {
      await sleep(delayMs);
      delayMs *= 2;
    }
  }
  throw new WriteTransportError(
    `${label} failed after ${attempts} attempt(s): ${errorMessage(lastError)}`,
    attempts,
    lastError,
  );
}
