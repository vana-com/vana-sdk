/**
 * In-memory Personal Server + gateway that enforce the Write API contract the
 * way `personal-server-ts` does (routes/write-session.ts, api-auth.ts,
 * write/attribution.ts, contracts/binary.ts), so the SDK client is tested
 * against the real rules rather than a permissive stub:
 *
 *   - handshake: Web3Signed proof, grantId claim required, grant must carry
 *     `write:` entries, signer must be the grantee, proof single-use
 *   - write: bearer must resolve to a live session, scope must be covered by
 *     the session's write patterns, X-Vana-Write-Signature must recover to
 *     the session builder over the STORED representation (body for JSON,
 *     the `$binary` record for anything else), carry the session grantId as
 *     a signed claim, JSON bodies must be compact, reserved keys rejected,
 *     proof single-use; `lineage` is the body's top-level field (JSON) or
 *     the metadata object's field (binary), validated per
 *     docs/derivative-data-api.md and mirrored to `$lineage`
 *   - derivative questions (`/v1/derivatives/questions`): the same builder
 *     credential as a write (bearer + X-Vana-Write-Signature over the whole
 *     request TARGET, query string INCLUDED and compared in canonical form),
 *     the optional `nonce` claim as the replay key when present, authorized
 *     against `write:<derivedScope>`, compact JSON bodies, the consent rule
 *     (every source scope read-granted to the builder), the cycle guard, the
 *     404 for a question this builder did not register AND for an unknown id
 *     presented with a live write session, and the 400
 *     `DERIVATIVE_DERIVED_SCOPE_REQUIRED` for a builder list with no
 *     `?derivedScope=`
 *   - lineage reads on both the Personal Server and the gateway: Web3Signed
 *     over the bare path (`/lineage[/:version]`, the version is a path
 *     segment, any query is 400), grant view from the signed `grantId` claim
 *     only, 401 for a missing / invalid gateway signature, a uniform 404 for
 *     an unknown id and for a signer the gateway will not serve; answering
 *     the `{ data, proof }` envelope with redaction for nodes the caller's
 *     grant does not cover
 *
 * The binary representation is a verbatim port of the Personal Server's
 * `buildBinaryEnvelopeData` / `parseMetadataHeader` (Web Crypto + btoa), so
 * it is an independent oracle for the SDK's `binaryWriteSignedBytes`.
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, type Address, type Hex } from "viem";
import { parseWeb3SignedHeader, verifyWeb3Signed } from "../auth/web3-signed";
import { scopeMatchesPattern } from "../protocol/scopes";
import { fromBase64 } from "../utils/encoding";

export interface MockGrant {
  id: string;
  grantorAddress: Address;
  granteeId: Address;
  scopes: string[];
  revokedAt?: string | null;
}

export interface MockStoredRecord {
  scope: string;
  collectedAt: string;
  data: Record<string, unknown>;
}

export interface MockLineageSource {
  dataPointId: Hex;
  scope: string;
  version: string;
  deletedAt: string | null;
}

export interface MockPersonalServerOptions {
  origin: string;
  owner: Address;
  grants: MockGrant[];
  /** Data points a lineage source may reference (id -> node). */
  knownDataPoints?: MockLineageSource[];
  /** Fixed ingest status. */
  status?: "stored" | "syncing";
  sessionTtlSeconds?: number;
  now?: () => number;
  /** Answer every `/v1/derivatives` route 503, as a server with no compute. */
  computeUnavailable?: boolean;
}

/** A question registration the mock server holds. */
export interface MockQuestion {
  questionId: string;
  derivedScope: string;
  sourceScopes: string[];
  question: string;
  model: string | null;
  registeredBy:
    | { kind: "owner" }
    | { kind: "builder"; builder: Address; grantId: string };
  status: "pending" | "ready" | "failed" | "stale";
  error: string | null;
  /** The coarse failure class the status route serves; null unless failed. */
  errorCode:
    | "inference_unavailable"
    | "source_missing"
    | "grant_invalid"
    | "internal"
    | null;
  /**
   * What the status route reports as the next automatic retry. The mock has
   * no scheduler, so a test sets it through `settleQuestion`.
   */
  retryAfterSeconds: number | null;
  createdAt: string;
  updatedAt: string;
  lastComputedAt: string | null;
  derivedVersion: number | null;
  derivedCollectedAt: string | null;
}

export interface MockRequestLog {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface MockPersonalServer {
  fetch: typeof fetch;
  origin: string;
  records: MockStoredRecord[];
  requests: MockRequestLog[];
  /** Handshake and write proofs consumed so far (sha-256 hex of the header). */
  proofsSeen: Set<string>;
  /** Make the next `n` fetches throw (transport failure) before answering. */
  failNext(n: number, error?: Error): void;
  /** Force the next response (any route). */
  respondNextWith(status: number, body: unknown): void;
  /** Sessions minted (token -> record). */
  sessions: Map<string, MockSession>;
  /** Question registrations (id -> row), in registration order. */
  questions: Map<string, MockQuestion>;
  /**
   * Forget every minted session, the way a restarted Personal Server does:
   * the next call with an old bearer answers 401.
   */
  dropSessions(): void;
  /**
   * Settle a question the way a compute would: set its status and, for a
   * `ready` one, store the derived record the builder then reads.
   */
  settleQuestion(
    questionId: string,
    outcome:
      | { status: "ready"; data?: Record<string, unknown> }
      | {
          status: "failed";
          error: string;
          errorCode?: MockQuestion["errorCode"];
          retryAfterSeconds?: number | null;
        }
      | { status: "stale" | "pending" },
  ): void;
}

export interface MockSession {
  token: string;
  builderAddress: Address;
  grantId: string;
  writeScopes: string[];
  expiresAtMs: number;
}

// ---- verbatim port of personal-server-ts contracts/binary.ts ---------------

function normalizeBinaryMimeType(contentType: string | null): string {
  if (!contentType) return "application/octet-stream";
  return contentType.split(";")[0].trim() || "application/octet-stream";
}

function parseMetadataHeader(value: string | null): unknown {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

const BASE64_CHUNK = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    const chunk = bytes.subarray(i, i + BASE64_CHUNK);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function sha256Hex(bytes: Uint8Array): Promise<`0x${string}`> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as BufferSource,
  );
  let out = "";
  for (const b of new Uint8Array(digest))
    out += b.toString(16).padStart(2, "0");
  return `0x${out}`;
}

function buildBinaryEnvelopeData(params: {
  bytes: Uint8Array;
  mimeType: string;
  filename?: string;
  contentHash: `0x${string}`;
  metadata?: unknown;
}): Record<string, unknown> {
  return {
    $binary: true,
    mimeType: params.mimeType,
    ...(params.filename ? { filename: params.filename } : {}),
    sizeBytes: params.bytes.length,
    contentHash: params.contentHash,
    encoding: "base64",
    content: bytesToBase64(params.bytes),
    ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
  };
}

/** The Personal Server's `binaryWriteSignedBytes`, ported for the oracle. */
export async function personalServerBinaryWriteSignedBytes(input: {
  bytes: Uint8Array;
  contentType: string;
  filename?: string;
  metadataHeader?: string;
}): Promise<Uint8Array> {
  const data = buildBinaryEnvelopeData({
    bytes: input.bytes,
    mimeType: normalizeBinaryMimeType(input.contentType),
    filename: input.filename,
    contentHash: await sha256Hex(input.bytes),
    metadata: parseMetadataHeader(input.metadataHeader ?? null),
  });
  return new TextEncoder().encode(JSON.stringify(data));
}

// ---- helpers ---------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function protocolError(
  status: number,
  errorCode: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(status, {
    error: {
      code: status,
      errorCode,
      message,
      ...(details ? { details } : {}),
    },
  });
}

function proofId(header: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(header)));
}

/**
 * Canonical query string: parameters sorted by name and then value, exactly
 * as `personal-server-ts` `write/attribution.ts` does it. Sorting makes the
 * signed-uri rule insensitive to the order a client serializes its
 * parameters in, while still requiring the parameters themselves to match.
 */
function canonicalQuery(search: string): string {
  const entries = [...new URLSearchParams(search).entries()].sort((a, b) =>
    a[0] === b[0]
      ? a[1] < b[1]
        ? -1
        : a[1] > b[1]
          ? 1
          : 0
      : a[0] < b[0]
        ? -1
        : 1,
  );
  const canonical = new URLSearchParams();
  for (const [name, value] of entries) canonical.append(name, value);
  return canonical.toString();
}

/** The uri a proof must commit to: the path, plus the canonical query. */
function canonicalSignedUri(pathname: string, search: string): string {
  const query = canonicalQuery(search);
  return query ? `${pathname}?${query}` : pathname;
}

/** The same canonical form applied to a signed `uri` claim. */
function canonicalizeSignedUri(uri: string): string {
  const mark = uri.indexOf("?");
  if (mark === -1) return uri;
  return canonicalSignedUri(uri.slice(0, mark), uri.slice(mark + 1));
}

/** The Personal Server's bound on the optional `nonce` claim. */
const MAX_PROOF_NONCE_LENGTH = 128;

/**
 * The proof's optional `nonce` claim, read from the RAW signed payload: the
 * SDK's parser keeps only the claims it knows, and the nonce is covered by
 * the signature all the same (the signature is over the base64url payload
 * string). `null` means the claim is present but malformed, which the
 * Personal Server answers 401 `WRITE_ATTRIBUTION_INVALID` for.
 */
function signedNonce(headerValue: string): string | undefined | null {
  let payloadBase64: string;
  try {
    payloadBase64 = parseWeb3SignedHeader(headerValue).payloadBase64;
  } catch {
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(base64UrlDecodeToString(payloadBase64));
  } catch {
    return undefined;
  }
  if (raw === null || typeof raw !== "object") return undefined;
  const nonce = (raw as Record<string, unknown>).nonce;
  if (nonce === undefined || nonce === null) return undefined;
  if (
    typeof nonce !== "string" ||
    nonce.length === 0 ||
    nonce.length > MAX_PROOF_NONCE_LENGTH
  ) {
    return null;
  }
  return nonce;
}

function base64UrlDecodeToString(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  return new TextDecoder().decode(fromBase64(padded));
}

function isJsonContentType(headers: Headers): boolean {
  const ct = headers.get("content-type");
  if (!ct) return true;
  return ct.toLowerCase().includes("application/json");
}

function binaryFilename(headers: Headers): string | undefined {
  const explicit = headers.get("x-filename");
  if (explicit) return explicit;
  const disposition = headers.get("content-disposition");
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function writeScopePatterns(scopes: readonly string[]): string[] {
  return scopes
    .filter((s) => s.startsWith("write:"))
    .map((s) => s.slice("write:".length))
    .filter((s) => s.length > 0);
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

async function bodyBytes(init: RequestInit | undefined): Promise<Uint8Array> {
  const body = init?.body;
  if (body === undefined || body === null) return new Uint8Array(0);
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

let tokenCounter = 0;

/** A Personal Server that enforces the Write API contract, as a `fetch`. */
export function createMockPersonalServer(
  options: MockPersonalServerOptions,
): MockPersonalServer {
  const now = options.now ?? (() => Date.now());
  const sessions = new Map<string, MockSession>();
  const proofsSeen = new Set<string>();
  const records: MockStoredRecord[] = [];
  const requests: MockRequestLog[] = [];
  const known = new Map<string, MockLineageSource>(
    (options.knownDataPoints ?? []).map((n) => [
      n.dataPointId.toLowerCase(),
      n,
    ]),
  );
  const grantsById = new Map(options.grants.map((g) => [g.id, g]));
  const questions = new Map<string, MockQuestion>();
  let failures = 0;
  let failure: Error | undefined;
  let forced: { status: number; body: unknown } | undefined;

  async function handleSession(
    headers: Headers,
    path: string,
    body: Uint8Array,
  ): Promise<Response> {
    const authorization = headers.get("authorization") ?? undefined;
    if (!authorization?.startsWith("Web3Signed ")) {
      return protocolError(
        401,
        "WRITE_SESSION_PROOF_REQUIRED",
        "POST /v1/write/session requires a Web3Signed proof signed by the builder key",
      );
    }
    let verified;
    try {
      verified = await verifyWeb3Signed({
        headerValue: authorization,
        expectedOrigin: options.origin,
        expectedMethod: "POST",
        expectedPath: path,
        bodyBytes: body,
        now: Math.floor(now() / 1000),
      });
    } catch (err) {
      return protocolError(
        401,
        "WRITE_SESSION_AUTH_FAILED",
        err instanceof Error ? err.message : String(err),
      );
    }
    const grantId = verified.payload.grantId;
    if (!grantId) {
      return protocolError(
        400,
        "GRANT_ID_REQUIRED",
        "The Web3Signed proof must carry a grantId",
      );
    }
    const grant = grantsById.get(grantId);
    if (!grant) {
      return protocolError(403, "GRANT_REQUIRED", "Grant required", {
        reason: "Grant not found",
        grantId,
      });
    }
    if (grant.revokedAt) {
      return protocolError(403, "GRANT_REVOKED", "Grant has been revoked");
    }
    const patterns = writeScopePatterns(grant.scopes);
    if (patterns.length === 0) {
      return protocolError(403, "SCOPE_MISMATCH", "Scope not granted", {
        reason: "Grant has no write scopes",
      });
    }
    if (verified.signer.toLowerCase() !== grant.granteeId.toLowerCase()) {
      return protocolError(401, "INVALID_SIGNATURE", "Invalid signature", {
        reason: "Handshake signer is not the grant builder",
      });
    }
    if (grant.grantorAddress.toLowerCase() !== options.owner.toLowerCase()) {
      return protocolError(
        403,
        "GRANT_OWNER_MISMATCH",
        "Grant was not issued by this server's owner",
      );
    }
    const id = proofId(authorization);
    if (proofsSeen.has(id)) {
      return protocolError(
        401,
        "WRITE_SESSION_PROOF_REPLAY",
        "Handshake proof already used; sign a fresh proof",
      );
    }
    proofsSeen.add(id);
    const ttl = options.sessionTtlSeconds ?? 3600;
    const token = `vana_write_${(++tokenCounter).toString(16).padStart(8, "0")}`;
    sessions.set(token, {
      token,
      builderAddress: verified.signer,
      grantId: grant.id,
      writeScopes: patterns,
      expiresAtMs: now() + ttl * 1000,
    });
    return jsonResponse(200, {
      access_token: token,
      token_type: "Bearer",
      expires_in: ttl,
      scope: patterns.join(" "),
    });
  }

  function liveSession(headers: Headers): MockSession | null {
    const header = headers.get("authorization");
    if (!header?.startsWith("Bearer ")) return null;
    const session = sessions.get(header.slice(7));
    if (!session) return null;
    if (session.expiresAtMs <= now()) {
      sessions.delete(session.token);
      return null;
    }
    return session;
  }

  async function handleWrite(
    headers: Headers,
    path: string,
    scope: string,
    body: Uint8Array,
  ): Promise<Response> {
    const session = liveSession(headers);
    if (!session) {
      // The real server falls through to the owner path, where a bearer that
      // is not a session fails Web3Signed parsing.
      return protocolError(401, "INVALID_SIGNATURE", "Invalid signature", {
        reason: "Invalid Web3Signed header format",
      });
    }
    const grant = grantsById.get(session.grantId);
    if (!grant) {
      return protocolError(403, "GRANT_REQUIRED", "Grant required");
    }
    if (grant.revokedAt) {
      return protocolError(403, "GRANT_REVOKED", "Grant has been revoked");
    }
    if (
      !writeScopePatterns(grant.scopes).some((p) =>
        scopeMatchesPattern(scope, p),
      )
    ) {
      return protocolError(403, "SCOPE_MISMATCH", "Scope not granted", {
        requestedScope: scope,
        reason: "Grant does not authorize writing to this scope",
      });
    }
    const proofHeader = headers.get("x-vana-write-signature");
    if (!proofHeader) {
      return protocolError(
        401,
        "WRITE_ATTRIBUTION_REQUIRED",
        "Session writes must carry a builder-signed payload proof",
      );
    }
    const json = isJsonContentType(headers);
    const signedBytes = json
      ? body
      : await personalServerBinaryWriteSignedBytes({
          bytes: body,
          contentType: normalizeBinaryMimeType(headers.get("content-type")),
          filename: binaryFilename(headers),
          metadataHeader: headers.get("x-vana-metadata") ?? undefined,
        });
    let verified;
    try {
      verified = await verifyWeb3Signed({
        headerValue: proofHeader,
        expectedOrigin: options.origin,
        expectedMethod: "POST",
        expectedPath: path,
        bodyBytes: signedBytes,
        now: Math.floor(now() / 1000),
      });
    } catch (err) {
      return protocolError(
        401,
        "WRITE_ATTRIBUTION_INVALID",
        err instanceof Error ? err.message : String(err),
      );
    }
    if (
      verified.signer.toLowerCase() !== session.builderAddress.toLowerCase()
    ) {
      return protocolError(
        401,
        "WRITE_ATTRIBUTION_SIGNER_MISMATCH",
        "Payload proof is not signed by the session builder",
      );
    }
    if (verified.payload.grantId !== session.grantId) {
      return protocolError(
        401,
        "WRITE_ATTRIBUTION_GRANT_MISMATCH",
        "Payload proof must carry the write session's grantId as a signed claim",
        { expected: session.grantId, actual: verified.payload.grantId ?? null },
      );
    }

    let data: Record<string, unknown>;
    if (json) {
      const text = new TextDecoder().decode(body);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return jsonResponse(400, {
          error: "INVALID_BODY",
          message: "Request body must be valid JSON",
        });
      }
      if (JSON.stringify(parsed) !== text) {
        return protocolError(
          400,
          "WRITE_BODY_NOT_CANONICAL",
          "Session writes must send compact JSON",
        );
      }
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return jsonResponse(400, {
          error: "INVALID_BODY",
          message: "Request body must be a JSON object",
        });
      }
      data = parsed as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(data, "$writtenBy")) {
        return jsonResponse(400, {
          error: "INVALID_BODY",
          message: "Request body must not contain the reserved $writtenBy key",
        });
      }
      if (Object.prototype.hasOwnProperty.call(data, "$lineage")) {
        return jsonResponse(400, {
          error: "INVALID_BODY",
          message: "Request body must not contain the reserved $lineage key",
        });
      }
    } else {
      data = JSON.parse(new TextDecoder().decode(signedBytes)) as Record<
        string,
        unknown
      >;
    }

    // Lineage: the body's top-level `lineage` (JSON) or the metadata
    // object's `lineage` (binary), validated as the Personal Server does.
    const container = json
      ? data
      : parseMetadataHeader(headers.get("x-vana-metadata"));
    const raw =
      container !== null && typeof container === "object"
        ? (container as Record<string, unknown>).lineage
        : undefined;
    let lineage: Hex[] | undefined;
    if (raw !== undefined && raw !== null) {
      if (!Array.isArray(raw) || raw.length > 256) {
        return protocolError(
          400,
          "LINEAGE_INVALID",
          "lineage must be an array of at most 256 data point ids",
        );
      }
      const seen = new Set<string>();
      const sources: Hex[] = [];
      for (const entry of raw) {
        if (typeof entry !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(entry)) {
          return protocolError(
            400,
            "LINEAGE_INVALID",
            "lineage entries must be 0x-prefixed 32-byte hex data point ids",
          );
        }
        const id = entry.toLowerCase() as Hex;
        if (seen.has(id)) {
          return protocolError(
            400,
            "LINEAGE_INVALID",
            "lineage lists the same source twice",
            { duplicate: id },
          );
        }
        seen.add(id);
        sources.push(id);
      }
      {
        const unknown = sources.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          return protocolError(
            422,
            "LINEAGE_SOURCE_UNKNOWN",
            "Lineage source is not a data point of this owner",
            { unknown },
          );
        }
        const namespace = scope.split(".")[0];
        for (const id of sources) {
          const node = known.get(id);
          if (node && node.scope.split(".")[0] === namespace) {
            return protocolError(
              400,
              "LINEAGE_SCOPE_UNDER_SOURCE_PREFIX",
              "A derived scope must not share its first segment with a source scope",
              { scope, sourceScope: node.scope },
            );
          }
        }
        lineage = sources;
      }
    }

    // Replay guard last: only a proof that passed every check is consumed.
    const id = proofId(proofHeader);
    if (proofsSeen.has(id)) {
      return protocolError(
        401,
        "WRITE_ATTRIBUTION_REPLAY",
        "Payload proof already used; sign a fresh proof for each write",
      );
    }
    proofsSeen.add(id);

    const collectedAt = new Date(now()).toISOString();
    const stored: Record<string, unknown> = {
      ...data,
      ...(lineage !== undefined
        ? { $lineage: { sources: lineage, writtenAt: collectedAt } }
        : {}),
      $writtenBy: {
        builder: session.builderAddress,
        grantId: session.grantId,
        signature: proofHeader.slice("Web3Signed ".length),
        bodyHash: verified.payload.bodyHash,
        writtenAt: collectedAt,
      },
    };
    records.push({ scope, collectedAt, data: stored });
    return jsonResponse(201, {
      scope,
      collectedAt,
      status: options.status ?? "stored",
      ...(lineage !== undefined ? { lineage: { sources: lineage } } : {}),
    });
  }

  /**
   * Verify a builder's `X-Vana-Write-Signature` proof against the request,
   * WITHOUT consuming it and without evaluating any scope policy: the
   * identity half of the credential, which is what a route needs when it has
   * no scope to authorize against yet (an unknown question id, a list call
   * missing its `?derivedScope=`).
   *
   * The proof commits to the whole request TARGET, query included: the query
   * decides the authorization on the list route, so a proof that covered
   * only the path could be captured on one derived scope and replayed on
   * another. Parameter order is the client's business (both sides are
   * compared in canonical form), the parameter set is not.
   */
  async function verifyQuestionProof(
    headers: Headers,
    method: string,
    target: URL,
    body: Uint8Array,
  ): Promise<
    { session: MockSession; grant: MockGrant; proofHeader: string } | Response
  > {
    const session = liveSession(headers);
    if (!session) {
      return protocolError(401, "INVALID_SIGNATURE", "Invalid signature", {
        reason: "Invalid Web3Signed header format",
      });
    }
    const grant = grantsById.get(session.grantId);
    if (!grant) return protocolError(403, "GRANT_REQUIRED", "Grant required");
    if (grant.revokedAt) {
      return protocolError(403, "GRANT_REVOKED", "Grant has been revoked");
    }
    const proofHeader = headers.get("x-vana-write-signature");
    if (!proofHeader) {
      return protocolError(
        401,
        "WRITE_ATTRIBUTION_REQUIRED",
        "Session writes must carry a builder-signed payload proof",
      );
    }
    // Any signed uri whose canonical form equals the request's is accepted;
    // anything else goes to verifyWeb3Signed as a URI mismatch.
    const expectedUri = canonicalSignedUri(target.pathname, target.search);
    let expectedPath = expectedUri;
    try {
      const claimed = parseWeb3SignedHeader(proofHeader).payload.uri;
      if (canonicalizeSignedUri(claimed) === expectedUri)
        expectedPath = claimed;
    } catch {
      // Unparseable: verifyWeb3Signed reports it with its own error.
    }
    let verified;
    try {
      verified = await verifyWeb3Signed({
        headerValue: proofHeader,
        expectedOrigin: options.origin,
        expectedMethod: method,
        expectedPath,
        bodyBytes: body,
        now: Math.floor(now() / 1000),
      });
    } catch (err) {
      return protocolError(
        401,
        "WRITE_ATTRIBUTION_INVALID",
        err instanceof Error ? err.message : String(err),
      );
    }
    if (
      verified.signer.toLowerCase() !== session.builderAddress.toLowerCase()
    ) {
      return protocolError(
        401,
        "WRITE_ATTRIBUTION_SIGNER_MISMATCH",
        "Payload proof is not signed by the session builder",
      );
    }
    if (verified.payload.grantId !== session.grantId) {
      return protocolError(
        401,
        "WRITE_ATTRIBUTION_GRANT_MISMATCH",
        "Payload proof must carry the write session's grantId as a signed claim",
      );
    }
    if (signedNonce(proofHeader) === null) {
      return protocolError(
        401,
        "WRITE_ATTRIBUTION_INVALID",
        `Payload proof nonce must be a string of 1 to ${MAX_PROOF_NONCE_LENGTH} characters`,
      );
    }
    return { session, grant, proofHeader };
  }

  /**
   * Consume a verified proof. The replay key is `(builder, nonce)` when the
   * proof carries a `nonce` claim, and the whole proof when it does not: two
   * identical polls signed inside the same second are byte-identical, so
   * without a nonce the second is refused.
   */
  function consumeQuestionProof(
    session: MockSession,
    proofHeader: string,
  ): Response | undefined {
    const nonce = signedNonce(proofHeader);
    const id = proofId(
      nonce === undefined
        ? proofHeader
        : `nonce:${session.builderAddress.toLowerCase()}:${nonce}`,
    );
    if (proofsSeen.has(id)) {
      return protocolError(
        401,
        "WRITE_ATTRIBUTION_REPLAY",
        nonce === undefined
          ? "Payload proof already used; sign a fresh proof for each request (or add a unique nonce claim so repeated reads stay distinct)"
          : "Payload proof nonce already used; each nonce is single use",
      );
    }
    proofsSeen.add(id);
    return undefined;
  }

  /**
   * The builder credential the derivative question routes share with a
   * write: a live session bearer, the write policy on `scope`, and a
   * single-use X-Vana-Write-Signature proof over the request target.
   */
  async function authorizeQuestionCall(
    headers: Headers,
    method: string,
    target: URL,
    body: Uint8Array,
    scope: string,
  ): Promise<{ session: MockSession; grant: MockGrant } | Response> {
    const verified = await verifyQuestionProof(headers, method, target, body);
    if (verified instanceof Response) return verified;
    const { session, grant, proofHeader } = verified;
    if (
      !writeScopePatterns(grant.scopes).some((p) =>
        scopeMatchesPattern(scope, p),
      )
    ) {
      return protocolError(403, "SCOPE_MISMATCH", "Scope not granted", {
        requestedScope: scope,
        reason: "Grant does not authorize writing to this scope",
      });
    }
    if (body.length > 0 && isJsonContentType(headers)) {
      const text = new TextDecoder().decode(body);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return jsonResponse(400, {
          error: "INVALID_BODY",
          message: "Request body must be valid JSON",
        });
      }
      if (JSON.stringify(parsed) !== text) {
        return protocolError(
          400,
          "WRITE_BODY_NOT_CANONICAL",
          "Session writes must send compact JSON",
        );
      }
    }
    // Replay guard last: only a proof that passed every check is consumed.
    const replayed = consumeQuestionProof(session, proofHeader);
    if (replayed) return replayed;
    return { session, grant };
  }

  /** Bare (non-`write:`) entries of a grant: what a read is checked against. */
  function readPatterns(grant: MockGrant): string[] {
    return grant.scopes.filter((entry) => !entry.includes(":"));
  }

  function questionView(row: MockQuestion): Record<string, unknown> {
    // `retryAfterSeconds` is the status route's own field, computed from the
    // scheduler; the registration view the question routes answer carries the
    // stored row only, `errorCode` included.
    const stored: Record<string, unknown> = {
      ...row,
      sourceScopes: [...row.sourceScopes],
    };
    delete stored.retryAfterSeconds;
    return stored;
  }

  /**
   * `GET /v1/derivatives/status?derivedScope=`: the reader's lifecycle view.
   * Authorized like a data read (a live grant covering the derived scope, or
   * the owner), NOT through the write-session path, and signed over the bare
   * path — the query carries the scope.
   */
  async function handleDerivativeStatus(
    headers: Headers,
    method: string,
    url: URL,
  ): Promise<Response> {
    if (method !== "GET") {
      return protocolError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }
    const derivedScope = url.searchParams.get("derivedScope");
    if (!derivedScope) {
      return protocolError(
        400,
        "DERIVATIVE_DERIVED_SCOPE_REQUIRED",
        "Listing questions as a builder needs a derived scope: add ?derivedScope=<scope>. The unfiltered list is the owner's",
      );
    }
    let verified;
    try {
      verified = await verifyWeb3Signed({
        headerValue: headers.get("authorization") ?? undefined,
        expectedOrigin: options.origin,
        expectedMethod: "GET",
        expectedPath: url.pathname,
        now: Math.floor(now() / 1000),
      });
    } catch (err) {
      return protocolError(
        401,
        "INVALID_SIGNATURE",
        err instanceof Error ? err.message : String(err),
      );
    }
    const isOwner =
      verified.signer.toLowerCase() === options.owner.toLowerCase();
    if (!isOwner) {
      const grantId =
        verified.payload.grantId ??
        url.searchParams.get("grantId") ??
        undefined;
      const grant = grantId ? grantsById.get(grantId) : undefined;
      if (
        !grant ||
        grant.granteeId.toLowerCase() !== verified.signer.toLowerCase()
      ) {
        return protocolError(403, "GRANT_REQUIRED", "Grant required");
      }
      if (
        !readPatterns(grant).some((pattern) =>
          scopeMatchesPattern(derivedScope, pattern),
        )
      ) {
        // Before any lookup: an uncovered caller must not learn which scopes
        // have questions behind them.
        return protocolError(403, "SCOPE_MISMATCH", "Scope not granted");
      }
    }
    const rows = [...questions.values()].filter(
      (row) => row.derivedScope === derivedScope,
    );
    if (rows.length === 0) {
      return protocolError(
        404,
        "DERIVATIVE_QUESTION_NOT_FOUND",
        "Question not found",
        { derivedScope },
      );
    }
    // The most optimistic true state answers, most recently updated within a
    // class: serving data is registration-agnostic, so a duplicate that never
    // wrote anything must not report an answer away.
    const precedence = { ready: 0, stale: 1, pending: 2, failed: 3 };
    const row = rows.reduce((best, candidate) => {
      const byStatus = precedence[candidate.status] - precedence[best.status];
      if (byStatus !== 0) return byStatus < 0 ? candidate : best;
      return candidate.updatedAt >= best.updatedAt ? candidate : best;
    });
    return jsonResponse(200, {
      derivedScope: row.derivedScope,
      status: row.status,
      lastComputedAt: row.lastComputedAt,
      derivedVersion: row.derivedVersion,
      derivedCollectedAt: row.derivedCollectedAt,
      errorCode: row.status === "failed" ? row.errorCode : null,
      retryAfterSeconds: row.status === "failed" ? row.retryAfterSeconds : null,
    });
  }

  /** `parseQuestionInput` + `findDerivationCycle`, as the server runs them. */
  function validateQuestionBody(body: Record<string, unknown>):
    | {
        derivedScope: string;
        sourceScopes: string[];
        question: string;
        model: string | null;
      }
    | Response {
    const derivedScope = body.derivedScope;
    if (typeof derivedScope !== "string" || derivedScope.length === 0) {
      return protocolError(
        400,
        "DERIVATIVE_QUESTION_INVALID",
        "derivedScope must be a scope string",
        { field: "derivedScope" },
      );
    }
    if (!Array.isArray(body.sourceScopes) || body.sourceScopes.length === 0) {
      return protocolError(
        400,
        "DERIVATIVE_QUESTION_INVALID",
        "sourceScopes must be a non-empty array of scopes",
        { field: "sourceScopes" },
      );
    }
    const sourceScopes: string[] = [];
    for (const entry of body.sourceScopes) {
      if (typeof entry !== "string" || entry.length === 0) {
        return protocolError(
          400,
          "DERIVATIVE_QUESTION_INVALID",
          "sourceScopes[] must be a scope string",
          { field: "sourceScopes[]" },
        );
      }
      sourceScopes.push(entry);
    }
    if (typeof body.question !== "string" || body.question.trim() === "") {
      return protocolError(
        400,
        "DERIVATIVE_QUESTION_INVALID",
        "question must be a non-empty string",
        { field: "question" },
      );
    }
    for (const source of sourceScopes) {
      if (source.split(".")[0] === derivedScope.split(".")[0]) {
        return protocolError(
          400,
          "LINEAGE_SCOPE_UNDER_SOURCE_PREFIX",
          "A derived scope must not share its first segment with a source scope",
          { scope: derivedScope, sourceScope: source },
        );
      }
    }
    return {
      derivedScope,
      sourceScopes,
      question: body.question,
      model: typeof body.model === "string" ? body.model : null,
    };
  }

  /** Reaching the derived scope again through existing registrations. */
  function hasDerivationCycle(
    derivedScope: string,
    sourceScopes: readonly string[],
  ): boolean {
    const sourcesOf = new Map<string, Set<string>>();
    const add = (derived: string, sources: readonly string[]) => {
      const set = sourcesOf.get(derived) ?? new Set<string>();
      for (const source of sources) set.add(source);
      sourcesOf.set(derived, set);
    };
    for (const row of questions.values())
      add(row.derivedScope, row.sourceScopes);
    add(derivedScope, sourceScopes);
    const visited = new Set<string>();
    const stack = [derivedScope];
    while (stack.length > 0) {
      const scope = stack.pop()!;
      for (const source of sourcesOf.get(scope) ?? []) {
        if (source === derivedScope) return true;
        if (visited.has(source)) continue;
        visited.add(source);
        stack.push(source);
      }
    }
    return false;
  }

  async function handleQuestions(
    headers: Headers,
    method: string,
    url: URL,
    body: Uint8Array,
  ): Promise<Response> {
    if (options.computeUnavailable) {
      return protocolError(
        503,
        "DERIVATIVE_COMPUTE_UNAVAILABLE",
        "This server has no derivative compute configured",
      );
    }
    const path = url.pathname;
    const parts = path.split("/").filter(Boolean).slice(2);
    // ["questions"] | ["questions", id] | ["questions", id, "recompute"]
    const questionId = parts[1] ? decodeURIComponent(parts[1]) : undefined;

    if (questionId === undefined) {
      if (method === "POST") {
        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(new TextDecoder().decode(body));
        } catch {
          return jsonResponse(400, {
            error: "INVALID_BODY",
            message: "Request body must be valid JSON",
          });
        }
        const record =
          parsedBody !== null &&
          typeof parsedBody === "object" &&
          !Array.isArray(parsedBody)
            ? (parsedBody as Record<string, unknown>)
            : {};
        const scopeForAuth =
          typeof record.derivedScope === "string" ? record.derivedScope : "";
        const auth = await authorizeQuestionCall(
          headers,
          method,
          url,
          body,
          scopeForAuth,
        );
        if (auth instanceof Response) return auth;
        const parsed = validateQuestionBody(record);
        if (parsed instanceof Response) return parsed;
        const uncovered = parsed.sourceScopes.filter(
          (scope) =>
            !readPatterns(auth.grant).some((p) =>
              scopeMatchesPattern(scope, p),
            ),
        );
        if (uncovered.length > 0) {
          return protocolError(
            403,
            "DERIVATIVE_SOURCE_NOT_GRANTED",
            "The builder's grant does not cover reading every source scope of this question",
            { scopes: uncovered },
          );
        }
        if (hasDerivationCycle(parsed.derivedScope, parsed.sourceScopes)) {
          return protocolError(
            409,
            "DERIVATIVE_CYCLE",
            `Registering this question would make "${parsed.derivedScope}" a transitive source of itself; recompute would never settle`,
            {
              derivedScope: parsed.derivedScope,
              path: [parsed.derivedScope, parsed.derivedScope],
            },
          );
        }
        const at = new Date(now()).toISOString();
        const row: MockQuestion = {
          questionId: `q-${questions.size + 1}`,
          derivedScope: parsed.derivedScope,
          sourceScopes: parsed.sourceScopes,
          question: parsed.question,
          model: parsed.model,
          registeredBy: {
            kind: "builder",
            builder: auth.session.builderAddress,
            grantId: auth.session.grantId,
          },
          status: "pending",
          errorCode: null,
          retryAfterSeconds: null,
          error: null,
          createdAt: at,
          updatedAt: at,
          lastComputedAt: null,
          derivedVersion: null,
          derivedCollectedAt: null,
        };
        questions.set(row.questionId, row);
        return jsonResponse(201, questionView(row));
      }
      if (method === "GET") {
        const derivedScope = url.searchParams.get("derivedScope");
        if (!derivedScope) {
          // The unfiltered list is the owner's. A builder that reached it
          // simply forgot the parameter, so say that instead of 401, which
          // would send a re-handshake-on-401 client through a pointless
          // handshake. Identity only, and the proof is NOT consumed: the
          // request ends in an error.
          const recognized = await verifyQuestionProof(
            headers,
            method,
            url,
            body,
          );
          if (recognized instanceof Response) {
            return protocolError(401, "INVALID_SIGNATURE", "Invalid signature");
          }
          return protocolError(
            400,
            "DERIVATIVE_DERIVED_SCOPE_REQUIRED",
            "Listing questions as a builder needs a derived scope: add ?derivedScope=<scope>. The unfiltered list is the owner's",
          );
        }
        const auth = await authorizeQuestionCall(
          headers,
          method,
          url,
          body,
          derivedScope,
        );
        if (auth instanceof Response) return auth;
        const mine = [...questions.values()].filter(
          (row) =>
            row.derivedScope === derivedScope &&
            row.registeredBy.kind === "builder" &&
            row.registeredBy.builder.toLowerCase() ===
              auth.session.builderAddress.toLowerCase(),
        );
        return jsonResponse(200, { questions: mine.map(questionView) });
      }
      return protocolError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }

    const row = questions.get(questionId);
    if (!row) {
      // No registration means no derived scope to authorize against, so the
      // answer falls back to identity: a caller holding a live write session
      // is told 404 (another builder's question already answers 404, so it
      // learns nothing new), and everyone else 401. The proof is verified
      // but NOT consumed: the request ends in an error.
      const recognized = await verifyQuestionProof(headers, method, url, body);
      if (recognized instanceof Response) {
        return protocolError(401, "INVALID_SIGNATURE", "Invalid signature", {
          reason: "Invalid Web3Signed header format",
        });
      }
      return protocolError(
        404,
        "DERIVATIVE_QUESTION_NOT_FOUND",
        "Question not found",
        { questionId },
      );
    }
    const auth = await authorizeQuestionCall(
      headers,
      method,
      url,
      body,
      row.derivedScope,
    );
    if (auth instanceof Response) return auth;
    if (
      row.registeredBy.kind !== "builder" ||
      row.registeredBy.builder.toLowerCase() !==
        auth.session.builderAddress.toLowerCase()
    ) {
      return protocolError(
        404,
        "DERIVATIVE_QUESTION_NOT_FOUND",
        "Question not found",
        { questionId },
      );
    }
    if (parts[2] === "recompute") {
      if (method !== "POST") {
        return protocolError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }
      row.status = row.status === "pending" ? "pending" : "stale";
      // The full registration view, like every other route, so a client
      // needs one schema.
      return jsonResponse(202, questionView(row));
    }
    if (parts.length > 2) {
      return jsonResponse(404, { error: "NOT_FOUND", message: path });
    }
    if (method === "GET") return jsonResponse(200, questionView(row));
    if (method === "DELETE") {
      questions.delete(questionId);
      return jsonResponse(200, { questionId, deleted: true });
    }
    return protocolError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  /** `GET /v1/data/:scope`: the Web3Signed read a builder does at the end. */
  async function handleDataRead(
    headers: Headers,
    path: string,
    scope: string,
  ): Promise<Response> {
    let verified;
    try {
      verified = await verifyWeb3Signed({
        headerValue: headers.get("authorization") ?? undefined,
        expectedOrigin: options.origin,
        expectedMethod: "GET",
        expectedPath: path,
        now: Math.floor(now() / 1000),
      });
    } catch (err) {
      return protocolError(
        401,
        "INVALID_SIGNATURE",
        err instanceof Error ? err.message : String(err),
      );
    }
    const grant = verified.payload.grantId
      ? grantsById.get(verified.payload.grantId)
      : undefined;
    if (
      !grant ||
      grant.granteeId.toLowerCase() !== verified.signer.toLowerCase()
    ) {
      return protocolError(403, "GRANT_REQUIRED", "Grant required");
    }
    if (!readPatterns(grant).some((p) => scopeMatchesPattern(scope, p))) {
      return protocolError(403, "SCOPE_MISMATCH", "Scope not granted");
    }
    const history = records.filter((r) => r.scope === scope);
    const latest = history[history.length - 1];
    if (!latest) {
      return protocolError(404, "NOT_FOUND", `Scope "${scope}" has no data`);
    }
    return jsonResponse(200, {
      version: "1.0",
      scope,
      collectedAt: latest.collectedAt,
      data: latest.data,
    });
  }

  async function handleLineage(
    headers: Headers,
    path: string,
    scope: string,
    version: string | undefined,
  ): Promise<Response> {
    let verified;
    try {
      verified = await verifyWeb3Signed({
        headerValue: headers.get("authorization") ?? undefined,
        expectedOrigin: options.origin,
        expectedMethod: "GET",
        expectedPath: path,
        now: Math.floor(now() / 1000),
      });
    } catch (err) {
      return protocolError(
        401,
        "INVALID_SIGNATURE",
        err instanceof Error ? err.message : String(err),
      );
    }
    const grant = verified.payload.grantId
      ? grantsById.get(verified.payload.grantId)
      : undefined;
    if (
      !grant ||
      grant.granteeId.toLowerCase() !== verified.signer.toLowerCase()
    ) {
      return protocolError(403, "GRANT_REQUIRED", "Grant required");
    }
    const readPatterns = grant.scopes.filter((s) => !s.includes(":"));
    const covered = (s: string) =>
      readPatterns.some((p) => scopeMatchesPattern(s, p));
    if (!covered(scope)) {
      return protocolError(403, "SCOPE_MISMATCH", "Scope not granted");
    }
    const history = records.filter((r) => r.scope === scope);
    const latest =
      version === undefined
        ? history[history.length - 1]
        : history[Number(version) - 1];
    if (!latest) {
      return protocolError(
        404,
        "NOT_FOUND",
        version
          ? `Scope "${scope}" has no registered version ${version}`
          : `Scope "${scope}" is not registered at the gateway`,
      );
    }
    const { keccak256, encodeAbiParameters } = await import("viem");
    const idFor = (s: string): Hex =>
      keccak256(
        encodeAbiParameters(
          [
            { name: "ownerAddress", type: "address" },
            { name: "scope", type: "string" },
          ],
          [options.owner, s],
        ),
      );
    const stampedLineage = latest.data.$lineage as
      | { sources: Hex[] }
      | undefined;
    const sources = (stampedLineage?.sources ?? []).map((dataPointId) => {
      const node = known.get(dataPointId.toLowerCase());
      if (!node || !covered(node.scope)) {
        // Exactly `{ redacted: true }`: the id would leak the scope.
        return { redacted: true as const };
      }
      return {
        dataPointId: node.dataPointId,
        scope: node.scope,
        version: node.version,
        deletedAt: node.deletedAt,
      };
    });
    return jsonResponse(200, {
      data: {
        dataPointId: idFor(scope),
        ownerAddress: options.owner,
        scope,
        version: version ?? String(history.length),
        deletedAt: null,
        sources,
        derivatives: [],
      },
      proof: {
        userSignature: "0x",
        gatewaySignature: "0x",
        status: "confirmed",
      },
    });
  }

  const fetchImpl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if (failures > 0) {
      failures -= 1;
      throw failure ?? new TypeError("fetch failed");
    }
    // A caller may pass a built `Request` (the data-read helper does) or a
    // url plus init; both carry the headers the routes authenticate on.
    const request = input instanceof Request ? input : undefined;
    const url = new URL(requestUrl(input));
    const headers = new Headers(request?.headers ?? init?.headers);
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const body = request
      ? new Uint8Array(await request.clone().arrayBuffer())
      : await bodyBytes(init);
    requests.push({
      method,
      path: url.pathname + url.search,
      headers: headersToRecord(headers),
      body,
    });
    if (forced) {
      const { status, body: forcedBody } = forced;
      forced = undefined;
      return jsonResponse(status, forcedBody);
    }
    if (url.origin !== options.origin) {
      return jsonResponse(502, { error: "WRONG_ORIGIN", message: url.origin });
    }
    if (method === "POST" && url.pathname === "/v1/write/session") {
      return handleSession(headers, url.pathname, body);
    }
    if (url.pathname === "/v1/derivatives/status") {
      if (options.computeUnavailable) {
        return protocolError(
          503,
          "DERIVATIVE_COMPUTE_UNAVAILABLE",
          "This server has no derivative compute configured",
        );
      }
      return handleDerivativeStatus(headers, method, url);
    }
    if (url.pathname.startsWith("/v1/derivatives/")) {
      return handleQuestions(headers, method, url, body);
    }
    const lineageMatch = url.pathname.match(
      /^\/v1\/data\/([^/]+)\/lineage(?:\/([^/]+))?$/,
    );
    if (method === "GET" && lineageMatch) {
      if (url.search !== "") {
        return protocolError(
          400,
          "INVALID_VERSION",
          "the version is a path segment; query strings are not accepted",
        );
      }
      const version = lineageMatch[2];
      if (version !== undefined && !/^[1-9]\d*$/.test(version)) {
        return protocolError(
          400,
          "INVALID_VERSION",
          "version must be a positive decimal integer",
        );
      }
      return handleLineage(
        headers,
        url.pathname,
        decodeURIComponent(lineageMatch[1]),
        version,
      );
    }
    const dataMatch = url.pathname.match(/^\/v1\/data\/([^/]+)$/);
    if (method === "POST" && dataMatch) {
      return handleWrite(
        headers,
        url.pathname,
        decodeURIComponent(dataMatch[1]),
        body,
      );
    }
    if (method === "GET" && dataMatch) {
      return handleDataRead(
        headers,
        url.pathname,
        decodeURIComponent(dataMatch[1]),
      );
    }
    return jsonResponse(404, { error: "NOT_FOUND", message: url.pathname });
  };

  return {
    fetch: fetchImpl as typeof fetch,
    origin: options.origin,
    records,
    requests,
    proofsSeen,
    sessions,
    questions,
    failNext(n, error) {
      failures = n;
      failure = error;
    },
    respondNextWith(status, body) {
      forced = { status, body };
    },
    dropSessions() {
      sessions.clear();
    },
    settleQuestion(questionId, outcome) {
      const row = questions.get(questionId);
      if (!row) throw new Error(`unknown question ${questionId}`);
      const at = new Date(now()).toISOString();
      row.status = outcome.status;
      row.updatedAt = at;
      if (outcome.status === "failed") {
        row.error = outcome.error;
        row.errorCode = outcome.errorCode ?? "internal";
        row.retryAfterSeconds = outcome.retryAfterSeconds ?? null;
        row.lastComputedAt = at;
        return;
      }
      row.errorCode = null;
      row.retryAfterSeconds = null;
      if (outcome.status !== "ready") return;
      row.error = null;
      row.lastComputedAt = at;
      row.derivedVersion = (row.derivedVersion ?? 0) + 1;
      row.derivedCollectedAt = at;
      records.push({
        scope: row.derivedScope,
        collectedAt: at,
        data: {
          questionId: row.questionId,
          question: row.question,
          answer: "the answer",
          computedAt: at,
          ...outcome.data,
        },
      });
    },
  };
}

export interface MockGatewayOptions {
  origin: string;
  /** Lineage views by data point id (lowercase). */
  graphs: Record<string, MockGatewayView>;
  /** Builder address -> grant ids it holds (lowercase), for the 404 rule. */
  grants?: Record<string, string[]>;
  /** Wrap answers in the gateway `{ data, proof }` envelope (default true). */
  envelope?: boolean;
  now?: () => number;
}

export interface MockGatewayView {
  dataPointId: Hex;
  ownerAddress?: Address;
  scope: string;
  version: string;
  deletedAt: string | null;
  sources: unknown[];
  derivatives: unknown[];
  derivativesTruncated?: boolean;
}

export interface MockGateway {
  fetch: typeof fetch;
  requests: MockRequestLog[];
}

function gatewayError(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse(status, {
    success: false,
    error: message,
    code,
    ...extra,
  });
}

/**
 * A gateway answering `GET /v1/data/:id/lineage[/:version]`: the version is
 * a path segment and any query string is 400; the request must carry a
 * Web3Signed header whose `uri` is that bare path (401
 * LINEAGE_SIGNATURE_REQUIRED / LINEAGE_SIGNATURE_INVALID otherwise); the
 * grant view is the signed `grantId` claim; an unknown id and a signer that
 * holds no such grant both answer a uniform 404.
 */
export function createMockGateway(options: MockGatewayOptions): MockGateway {
  const requests: MockRequestLog[] = [];
  const now = options.now ?? (() => Date.now());
  const fetchImpl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(requestUrl(input));
    const headers = new Headers(init?.headers);
    requests.push({
      method: (init?.method ?? "GET").toUpperCase(),
      path: url.pathname + url.search,
      headers: headersToRecord(headers),
      body: new Uint8Array(0),
    });
    const match = url.pathname.match(
      /^\/v1\/data\/(0x[0-9a-fA-F]{64})\/lineage(?:\/([^/]+))?$/,
    );
    if (!match) {
      return gatewayError(404, "NOT_FOUND", url.pathname);
    }
    if (url.search !== "") {
      return gatewayError(
        400,
        "INVALID_REQUEST",
        "query strings are not accepted",
      );
    }
    if (match[1] !== match[1].toLowerCase()) {
      return gatewayError(400, "INVALID_DATA_POINT_ID", "id must be lowercase");
    }
    const version = match[2];
    if (version !== undefined && !/^[1-9]\d*$/.test(version)) {
      return gatewayError(
        400,
        "INVALID_VERSION",
        "version must be a positive decimal integer",
      );
    }
    const authorization = headers.get("authorization");
    if (!authorization) {
      return gatewayError(
        401,
        "LINEAGE_SIGNATURE_REQUIRED",
        "request signature required",
      );
    }
    let verified;
    try {
      verified = await verifyWeb3Signed({
        headerValue: authorization,
        expectedOrigin: options.origin,
        expectedMethod: "GET",
        expectedPath: url.pathname,
        bodyBytes: new Uint8Array(0),
        now: Math.floor(now() / 1000),
      });
    } catch (err) {
      return gatewayError(
        401,
        "LINEAGE_SIGNATURE_INVALID",
        err instanceof Error ? err.message : String(err),
      );
    }
    if (
      verified.payload.exp < verified.payload.iat ||
      verified.payload.exp - verified.payload.iat > 3600
    ) {
      return gatewayError(
        401,
        "LINEAGE_SIGNATURE_INVALID",
        "iat <= exp, at most one hour apart",
      );
    }
    const grantId = verified.payload.grantId;
    const held = options.grants?.[verified.signer.toLowerCase()] ?? [];
    const graph = options.graphs[match[1]];
    if (
      graph === undefined ||
      grantId === undefined ||
      !held.includes(grantId)
    ) {
      return gatewayError(404, "NOT_FOUND", "Unknown data point");
    }
    return jsonResponse(
      200,
      options.envelope === false
        ? graph
        : {
            data: graph,
            proof: {
              userSignature: "0x",
              gatewaySignature: "0x",
              status: "confirmed",
            },
          },
    );
  };
  return { fetch: fetchImpl as typeof fetch, requests };
}
