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
import { verifyWeb3Signed } from "../auth/web3-signed";
import { scopeMatchesPattern } from "../protocol/scopes";

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
    const url = new URL(requestUrl(input));
    const headers = new Headers(init?.headers);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = await bodyBytes(init);
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
    return jsonResponse(404, { error: "NOT_FOUND", message: url.pathname });
  };

  return {
    fetch: fetchImpl as typeof fetch,
    origin: options.origin,
    records,
    requests,
    proofsSeen,
    sessions,
    failNext(n, error) {
      failures = n;
      failure = error;
    },
    respondNextWith(status, body) {
      forced = { status, body };
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
