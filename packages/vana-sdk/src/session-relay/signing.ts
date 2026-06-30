import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "viem";
import {
  buildWeb3SignedHeader,
  type Web3SignedSignFn,
} from "../auth/web3-signed-builder";

const textEncoder = new TextEncoder();

function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalizeJson);

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (key === "signature") continue;
    sorted[key] = canonicalizeJson((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Compute the legacy bodyHash shape currently accepted by Session Relay.
 *
 * @remarks
 * Personal Server Web3Signed requests use `sha256:<hex>`, including a canonical
 * empty-body hash. Session Relay's current signed init endpoint verifies a
 * legacy body hash: bare SHA-256 hex for non-empty JSON bodies and `""` for
 * empty bodies. Keep this compatibility local to the Relay integration.
 */
export function computeSessionRelayBodyHash(body: string | undefined): string {
  if (!body || body.length === 0) return "";

  const parsed = JSON.parse(body);
  const canonical = canonicalizeJson(parsed);
  const digest = sha256(textEncoder.encode(JSON.stringify(canonical)));
  return bytesToHex(digest).slice(2);
}

/** Build a Web3Signed header compatible with Session Relay's signed endpoints. */
export function buildSessionRelayWeb3SignedHeader(params: {
  signMessage: Web3SignedSignFn;
  aud: string;
  method: string;
  uri: string;
  body?: string;
  iat?: number;
  exp?: number;
}): Promise<string> {
  return buildWeb3SignedHeader({
    signMessage: params.signMessage,
    aud: params.aud,
    method: params.method,
    uri: params.uri,
    bodyHash: computeSessionRelayBodyHash(params.body),
    iat: params.iat,
    exp: params.exp,
  });
}
