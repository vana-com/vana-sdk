/**
 * Builder-side client for the Personal Server Write API.
 *
 * @remarks
 * A builder holding a write-grant (a grant whose scope entries carry the
 * `write:` prefix, see {@link formatScopeEntry}) writes into a user's Personal
 * Server in two steps:
 *
 * 1. {@link openWriteSession}: `POST /v1/write/session` with a Web3Signed
 *    handshake that carries the grant id as a signed claim. The Personal
 *    Server verifies the builder key against the grant and mints a
 *    short-lived bearer token bound to `{ builder, grantId }`.
 * 2. {@link writeData}: `POST /v1/data/:scope` with that bearer plus an
 *    `X-Vana-Write-Signature` proof, a second Web3Signed signature over the
 *    representation the Personal Server will store, again carrying the grant
 *    id as a signed claim. The Personal Server stores the proof with the
 *    record under the reserved `$writtenBy` key so anyone holding the record
 *    can verify who wrote it.
 *
 * What the proof covers: a JSON write signs the request body, which must be
 * the compact `JSON.stringify` form (the server rejects anything else with
 * `WRITE_BODY_NOT_CANONICAL`); a binary write signs the `$binary` record the
 * server stores for the bytes and their representation headers
 * ({@link binaryWriteSignedBytes}), not the raw bytes. Every proof is
 * single-use: a retry after a lost response signs a fresh proof.
 *
 * Derivatives name their sources through `lineage` (see
 * {@link deriveDataPointId}); the ids travel as the `lineage` field of the
 * write's `X-Vana-Metadata` header and the server stores them under the
 * reserved `$lineage` key. Callers never send `$writtenBy` or `$lineage`.
 *
 * @category Protocol
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, type Hex } from "viem";
import { z } from "zod";
import { buildWeb3SignedHeader } from "../auth/web3-signed-builder";
import {
  type PersonalServerWriteError,
  WriteConflictError,
  WriteForbiddenError,
  WriteLineageError,
  WriteRejectedError,
  WriteRequestError,
  WriteSessionError,
  WriteSessionExpiredError,
  WriteTransportError,
  WriteUnauthorizedError,
} from "../errors";
import { toBase64 } from "../utils/encoding";
import { IngestResponseSchema, type IngestResponse } from "./data-file";
import { isDataPointId } from "./lineage";
import {
  isRecord,
  readPersonalServerErrorBody,
} from "./personal-server-error-body";
import { scopeMatchesPattern } from "./scopes";
import {
  resolveWriteSigner,
  type ResolveWriteSignerOptions,
  type WriteSigner,
  type WriteSignerSource,
} from "./write-signer";

/** Path of the write-session handshake. */
export const WRITE_SESSION_PATH = "/v1/write/session";
/** Header carrying the builder's per-write payload proof. */
export const WRITE_SIGNATURE_HEADER = "X-Vana-Write-Signature";
/** Header carrying caller metadata (and `lineage`) for a write. */
export const WRITE_METADATA_HEADER = "X-Vana-Metadata";
/** Header carrying the filename of a binary write (printable ASCII names). */
export const WRITE_FILENAME_HEADER = "X-Filename";
/**
 * Header carrying a filename the `X-Filename` header cannot: the Personal
 * Server percent-decodes `filename*=UTF-8''...` (RFC 5987).
 */
export const WRITE_CONTENT_DISPOSITION_HEADER = "Content-Disposition";
/** Reserved record key the Personal Server stamps builder attribution into. */
export const WRITER_ATTRIBUTION_KEY = "$writtenBy";
/** Reserved record key the Personal Server stamps lineage sources into. */
export const LINEAGE_KEY = "$lineage";
/** Record keys a builder must never send. */
export const RESERVED_WRITE_KEYS: readonly string[] = [
  WRITER_ATTRIBUTION_KEY,
  LINEAGE_KEY,
];

/** Metadata field the lineage source ids travel in. */
const LINEAGE_METADATA_FIELD = "lineage";

/**
 * Transport-level retry knobs shared by {@link openWriteSession} and
 * {@link writeData}.
 *
 * @remarks
 * Applies only when `fetch` **throws** (connection reset, DNS, a relay drop).
 * Every attempt signs a fresh proof, because the Personal Server consumes a
 * proof the moment it accepts it. A received HTTP response is never retried:
 * a 4xx/5xx is surfaced as a typed error.
 */
export interface WriteTransportRetryOptions {
  /** Total attempts including the first (default 3). `1` disables retries. */
  attempts?: number;
  /** Delay before the first retry (ms); doubles per retry (default 1_000). */
  initialDelayMs?: number;
}

/** An open write session: the bearer token plus what it was minted for. */
export interface WriteSession {
  /** Personal Server origin, without a trailing slash. */
  personalServerUrl: string;
  /** Web3Signed audience every proof under this session is addressed to. */
  audience: string;
  /** The write-grant the session is bound to. */
  grantId: string;
  /** The bearer token (`vana_write_...`). */
  accessToken: string;
  /** Unix milliseconds after which the token is no longer accepted. */
  expiresAt: number;
  /** Write patterns (prefix stripped) the session may write into. */
  writeScopes: readonly string[];
  /** The builder key the session was opened with; signs every write proof. */
  signer: WriteSigner;
}

export interface OpenWriteSessionParams extends ResolveWriteSignerOptions {
  /** Personal Server origin, e.g. `https://ps.example.com`. */
  personalServerUrl: string;
  /** Builder key: a viem `LocalAccount`, `WalletClient`, or `{ signMessage }`. */
  signer: WriteSignerSource;
  /** The write-grant issued to the builder. */
  grantId: string;
  /** Web3Signed audience; defaults to `personalServerUrl`. */
  audience?: string;
  /** `fetch` to use; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Extra request headers. */
  headers?: HeadersInit;
  retry?: WriteTransportRetryOptions;
}

/** Bytes to store as an unstructured (binary) record. */
export interface WriteBinaryPayload {
  bytes: Uint8Array;
  /** Media type, e.g. `application/pdf`. Parameters are dropped when stored. */
  contentType: string;
  /**
   * Stored with the record. Sent as `X-Filename` when it is printable ASCII,
   * otherwise as `Content-Disposition: attachment; filename*=UTF-8''...`,
   * which the Personal Server decodes back to the same string. Must not have
   * leading or trailing whitespace (HTTP would strip it and the signed
   * representation would no longer match).
   */
  filename?: string;
}

interface WriteDataBaseParams {
  session: WriteSession;
  /** The scope to write into; must match one of the session's write patterns. */
  scope: string;
  /**
   * Data point ids this record was derived from ({@link deriveDataPointId}).
   * Every source must belong to the same owner as the target scope.
   */
  lineage?: readonly Hex[];
  /**
   * Caller metadata stored with the record. Must not contain `lineage` (use
   * the option) or a reserved key. It travels in the `X-Vana-Metadata`
   * header: for a binary write it is part of the signed `$binary` record;
   * for a JSON write the proof covers the body only.
   */
  metadata?: Record<string, unknown>;
  /** `fetch` to use; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Extra request headers. */
  headers?: HeadersInit;
  retry?: WriteTransportRetryOptions;
}

/** A JSON write: `data` is stored as the record. */
export interface WriteJsonDataParams extends WriteDataBaseParams {
  data: Record<string, unknown>;
  binary?: never;
}

/** A binary write: the bytes are stored as a `$binary` record. */
export interface WriteBinaryDataParams extends WriteDataBaseParams {
  binary: WriteBinaryPayload;
  data?: never;
}

export type WriteDataParams = WriteJsonDataParams | WriteBinaryDataParams;

/** The Personal Server's ingest answer. */
export type WriteDataResult = IngestResponse;

const WriteSessionResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().nonnegative(),
  scope: z.string(),
});

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function resolveFetch(fetchFn: typeof fetch | undefined): typeof fetch {
  const resolved = fetchFn ?? globalThis.fetch;
  if (resolved === undefined) {
    throw new WriteRequestError("No fetch implementation available");
  }
  return resolved;
}

function dataPath(scope: string): string {
  return `/v1/data/${encodeURIComponent(scope)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The Personal Server consumes every proof it accepts, and a Web3Signed
 * payload is fully determined by `{ aud, method, uri, bodyHash, grantId, iat,
 * exp }`, so two proofs for the same request signed within one second would
 * be byte-identical and the second rejected as a replay. Remember the last
 * `iat` issued per request identity in this process and bump it when a
 * second proof for the same identity falls inside the same second.
 *
 * An entry only matters while its `iat` is still at or ahead of the clock
 * (an older one no longer influences the next value), so the map is pruned
 * of everything behind the clock, once per second, which keeps it bounded by
 * the distinct requests signed in the last {@link PROOF_IAT_MAX_AHEAD_SECONDS}
 * seconds and the work per proof amortised constant.
 */
const issuedProofIats = new Map<string, number>();
let issuedProofIatsPrunedAtSec = 0;
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
  if (nowSec < issuedProofIatsPrunedAtSec) {
    // The wall clock stepped backwards: every reservation is now further
    // ahead than it was issued, and waiting for the clock to catch up could
    // take arbitrarily long. Start over instead.
    issuedProofIats.clear();
  }
  issuedProofIatsPrunedAtSec = nowSec;
  for (const [key, iat] of issuedProofIats) {
    if (iat < nowSec) issuedProofIats.delete(key);
  }
}

/**
 * Reserve the next `iat` for a request identity. The reservation is made
 * synchronously so concurrent callers never share a value; the returned
 * promise only waits when the reserved `iat` is further ahead of the clock
 * than {@link PROOF_IAT_MAX_AHEAD_SECONDS}.
 */
function nextProofIat(proofKey: string): Promise<number> {
  const nowSec = Math.floor(Date.now() / 1000);
  pruneIssuedProofIats(nowSec);
  const last = issuedProofIats.get(proofKey);
  const iat = last === undefined ? nowSec : Math.max(nowSec, last + 1);
  issuedProofIats.set(proofKey, iat);
  const waitSec = iat - nowSec - PROOF_IAT_MAX_AHEAD_SECONDS;
  if (waitSec <= 0) return Promise.resolve(iat);
  return sleep(waitSec * 1000).then(() => iat);
}

function proofKeyFor(parts: {
  aud: string;
  method: string;
  uri: string;
  grantId: string;
  signedBytes?: Uint8Array;
}): string {
  return JSON.stringify([
    parts.aud,
    parts.method,
    parts.uri,
    parts.grantId,
    parts.signedBytes ? bytesToHex(sha256(parts.signedBytes)) : "",
  ]);
}

/**
 * Send a request, re-signing it on every attempt. Only a thrown `fetch` is
 * retried; the proof builder and any received response are never retried.
 */
async function sendWithFreshProof(
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

/**
 * Open a write session against a Personal Server.
 *
 * @remarks
 * Sends `POST /v1/write/session` with a Web3Signed `Authorization` header
 * whose signed claims carry `grantId`. The handshake proof is single-use on
 * the server; a transport retry signs a new one.
 *
 * @returns The session to pass to {@link writeData}.
 * @throws {WriteSessionError} When the Personal Server refuses the handshake
 *   (`errorCode` names why: `UNREGISTERED_BUILDER`, `GRANT_REQUIRED`,
 *   `GRANT_REVOKED`, `SCOPE_MISMATCH` for a grant without write entries,
 *   `INVALID_SIGNATURE` when the key is not the grantee,
 *   `GRANT_OWNER_MISMATCH`, ...).
 * @throws {WriteTransportError} When `fetch` threw on every attempt.
 * @throws {WriteRequestError} When the signer is unusable.
 */
export async function openWriteSession(
  params: OpenWriteSessionParams,
): Promise<WriteSession> {
  const fetchFn = resolveFetch(params.fetch);
  const personalServerUrl = normalizeBaseUrl(params.personalServerUrl);
  const audience = params.audience ?? personalServerUrl;
  const signer = resolveWriteSigner(params.signer, { account: params.account });

  const response = await sendWithFreshProof(
    "Write session handshake",
    fetchFn,
    params.retry,
    proofKeyFor({
      aud: audience,
      method: "POST",
      uri: WRITE_SESSION_PATH,
      grantId: params.grantId,
    }),
    async (iat) => {
      const headers = new Headers(params.headers);
      headers.set(
        "Authorization",
        await buildWeb3SignedHeader({
          signMessage: signer.signMessage,
          aud: audience,
          method: "POST",
          uri: WRITE_SESSION_PATH,
          grantId: params.grantId,
          iat,
        }),
      );
      return {
        url: `${personalServerUrl}${WRITE_SESSION_PATH}`,
        init: { method: "POST", headers },
      };
    },
  );
  // Read the clock before parsing so `expiresAt` never overstates the
  // remaining lifetime.
  const mintedAt = Date.now();

  if (!response.ok) {
    const { errorCode, message, details } =
      await readPersonalServerErrorBody(response);
    throw new WriteSessionError(
      message ??
        `Write session handshake failed: ${response.status} ${response.statusText}`,
      response.status,
      errorCode,
      details,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new WriteSessionError(
      "Write session response is not JSON",
      response.status,
      null,
      { cause: errorMessage(err) },
    );
  }
  const parsed = WriteSessionResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new WriteSessionError(
      "Write session response is not a session",
      response.status,
      null,
      { issues: parsed.error.issues },
    );
  }
  if (parsed.data.token_type.toLowerCase() !== "bearer") {
    throw new WriteSessionError(
      `Write session token type is not Bearer: ${parsed.data.token_type}`,
      response.status,
    );
  }

  return {
    personalServerUrl,
    audience,
    grantId: params.grantId,
    accessToken: parsed.data.access_token,
    expiresAt: mintedAt + parsed.data.expires_in * 1000,
    writeScopes: parsed.data.scope.split(" ").filter((s) => s.length > 0),
    signer,
  };
}

/** `true` when one of the session's write patterns covers `scope`. */
export function sessionCoversScope(
  session: Pick<WriteSession, "writeScopes">,
  scope: string,
): boolean {
  return session.writeScopes.some((pattern) =>
    scopeMatchesPattern(scope, pattern),
  );
}

/**
 * The media type the Personal Server stores for a binary write: the
 * `Content-Type` minus its parameters, `application/octet-stream` when blank.
 */
export function normalizeBinaryMimeType(contentType: string | null): string {
  if (!contentType) return "application/octet-stream";
  return contentType.split(";")[0].trim() || "application/octet-stream";
}

/**
 * How the Personal Server reads an `X-Vana-Metadata` header: JSON when it
 * parses, the raw string otherwise, `undefined` when absent or blank.
 */
export function parseWriteMetadataHeader(value: string | null): unknown {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/**
 * Encode a metadata object for the `X-Vana-Metadata` header. Non-ASCII
 * characters are `\uXXXX`-escaped so the value is header-safe everywhere;
 * it parses back to the same object.
 */
export function encodeWriteMetadataHeader(
  metadata: Record<string, unknown>,
): string {
  let json: string;
  try {
    json = JSON.stringify(metadata);
  } catch (err) {
    throw new WriteRequestError(
      `metadata is not JSON-serialisable: ${errorMessage(err)}`,
    );
  }
  if (typeof json !== "string") {
    throw new WriteRequestError("metadata must serialise to JSON");
  }
  return json.replace(
    /[\u007f-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export interface BinaryWriteSignedBytesInput {
  /** The raw body bytes the write sends. */
  bytes: Uint8Array;
  /** The `Content-Type` header the write sends (parameters are ignored). */
  contentType: string;
  /** The `X-Filename` header value the write sends, if any. */
  filename?: string;
  /** The exact `X-Vana-Metadata` header value the write sends, if any. */
  metadataHeader?: string;
}

/**
 * The bytes a builder signs for a binary write: the compact JSON of the
 * `$binary` record the Personal Server stores for these headers and bytes
 * (`personal-server-ts` `binaryWriteSignedBytes`, mirrored field for field).
 *
 * @returns UTF-8 bytes of the stored record's compact JSON.
 */
export function binaryWriteSignedBytes(
  input: BinaryWriteSignedBytesInput,
): Uint8Array {
  const metadata = parseWriteMetadataHeader(input.metadataHeader ?? null);
  const record: Record<string, unknown> = {
    $binary: true,
    mimeType: normalizeBinaryMimeType(input.contentType),
    ...(input.filename ? { filename: input.filename } : {}),
    sizeBytes: input.bytes.length,
    contentHash: bytesToHex(sha256(input.bytes)),
    encoding: "base64",
    content: toBase64(input.bytes),
    ...(metadata !== undefined ? { metadata } : {}),
  };
  return new TextEncoder().encode(JSON.stringify(record));
}

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

/**
 * Carry a filename the way the Personal Server reads it back verbatim:
 * `X-Filename` for printable ASCII, RFC 5987 `filename*` otherwise (a raw
 * non-ASCII header value is rejected by `fetch` or mangled in transit).
 */
function setFilenameHeader(headers: Headers, filename: string): void {
  if (PRINTABLE_ASCII.test(filename)) {
    headers.set(WRITE_FILENAME_HEADER, filename);
    return;
  }
  headers.set(
    WRITE_CONTENT_DISPOSITION_HEADER,
    `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
}

function assertNoReservedKeys(
  value: Record<string, unknown>,
  where: string,
): void {
  for (const key of RESERVED_WRITE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      throw new WriteRequestError(
        `${where} must not contain the reserved ${key} key; the Personal Server stamps it`,
        { key },
      );
    }
  }
}

function assertLineage(lineage: readonly Hex[]): void {
  if (!Array.isArray(lineage)) {
    throw new WriteRequestError("lineage must be an array of data point ids");
  }
  const seen = new Set<string>();
  for (const id of lineage) {
    if (!isDataPointId(id)) {
      throw new WriteRequestError(
        "lineage entries must be 32-byte hex data point ids (see deriveDataPointId)",
        { dataPointId: id },
      );
    }
    const key = id.toLowerCase();
    if (seen.has(key)) {
      throw new WriteRequestError("lineage must not repeat a data point id", {
        dataPointId: id,
      });
    }
    seen.add(key);
  }
}

/** The metadata header for a write, or `undefined` when there is nothing to send. */
function buildMetadataHeader(
  metadata: Record<string, unknown> | undefined,
  lineage: readonly Hex[] | undefined,
): string | undefined {
  if (metadata !== undefined) {
    if (!isRecord(metadata)) {
      throw new WriteRequestError("metadata must be a plain object");
    }
    assertNoReservedKeys(metadata, "metadata");
    if (
      Object.prototype.hasOwnProperty.call(metadata, LINEAGE_METADATA_FIELD)
    ) {
      throw new WriteRequestError(
        "metadata.lineage is reserved; pass sources through the lineage option",
      );
    }
  }
  if (lineage !== undefined) assertLineage(lineage);
  const hasLineage = lineage !== undefined && lineage.length > 0;
  if (metadata === undefined && !hasLineage) return undefined;
  return encodeWriteMetadataHeader({
    ...(metadata ?? {}),
    ...(hasLineage ? { [LINEAGE_METADATA_FIELD]: [...lineage] } : {}),
  });
}

interface PreparedWrite {
  body: Uint8Array;
  /** What the proof's `bodyHash` commits to. */
  signedBytes: Uint8Array;
  contentType: string;
  filename?: string;
  metadataHeader?: string;
}

function prepareWrite(params: WriteDataParams): PreparedWrite {
  const metadataHeader = buildMetadataHeader(params.metadata, params.lineage);

  if (params.binary !== undefined && params.data !== undefined) {
    throw new WriteRequestError("Pass either data or binary, not both");
  }

  if (params.binary !== undefined) {
    const { bytes, contentType, filename } = params.binary;
    if (!(bytes instanceof Uint8Array)) {
      throw new WriteRequestError("binary.bytes must be a Uint8Array");
    }
    if (typeof contentType !== "string" || contentType.trim() === "") {
      throw new WriteRequestError("binary.contentType is required");
    }
    if (filename !== undefined) {
      if (typeof filename !== "string") {
        throw new WriteRequestError("binary.filename must be a string");
      }
      if (filename !== filename.trim()) {
        throw new WriteRequestError(
          "binary.filename must not have leading or trailing whitespace",
        );
      }
    }
    return {
      body: bytes,
      signedBytes: binaryWriteSignedBytes({
        bytes,
        contentType,
        filename,
        metadataHeader,
      }),
      contentType,
      filename,
      metadataHeader,
    };
  }

  if (params.data === undefined) {
    throw new WriteRequestError("Pass data (a JSON object) or binary");
  }
  if (!isRecord(params.data)) {
    throw new WriteRequestError("data must be a plain JSON object");
  }
  assertNoReservedKeys(params.data, "data");
  let text: string;
  try {
    // Compact JSON is the contract: the server re-serialises the parsed
    // record and requires it to match the signed bytes.
    text = JSON.stringify(params.data);
  } catch (err) {
    throw new WriteRequestError(
      `data is not JSON-serialisable: ${errorMessage(err)}`,
    );
  }
  if (typeof text !== "string" || !text.startsWith("{")) {
    throw new WriteRequestError("data must serialise to a JSON object");
  }
  const body = new TextEncoder().encode(text);
  return {
    body,
    signedBytes: body,
    contentType: "application/json",
    metadataHeader,
  };
}

async function writeErrorFromResponse(
  response: Response,
): Promise<PersonalServerWriteError> {
  const { errorCode, message, details } =
    await readPersonalServerErrorBody(response);
  const text =
    message ??
    `Personal Server write failed: ${response.status} ${response.statusText}`;
  switch (response.status) {
    case 401:
      return new WriteUnauthorizedError(text, errorCode, details);
    case 403:
      return new WriteForbiddenError(text, errorCode, details);
    case 409:
      return new WriteConflictError(text, errorCode, details);
    case 422:
      return new WriteLineageError(text, errorCode, details);
    default:
      return new WriteRejectedError(text, response.status, errorCode, details);
  }
}

/**
 * Write one record into a scope under an open write session.
 *
 * @remarks
 * Sends `POST /v1/data/:scope` with `Authorization: Bearer <session token>`
 * and `X-Vana-Write-Signature`, a Web3Signed proof over the stored
 * representation carrying the session's `grantId` as a signed claim. JSON
 * writes send `data` as compact JSON with `Content-Type: application/json`;
 * binary writes send the bytes with their `Content-Type`, `X-Filename`, and
 * sign {@link binaryWriteSignedBytes}. `metadata` and `lineage` travel in
 * `X-Vana-Metadata`.
 *
 * @returns The ingest answer (`scope`, `collectedAt`, `status`).
 * @throws {WriteRequestError} Before sending: no payload, a reserved key, a
 *   malformed lineage id, or non-object data.
 * @throws {WriteSessionExpiredError} Before sending: the session token has
 *   passed its lifetime.
 * @throws {WriteUnauthorizedError} 401 (proof or session rejected).
 * @throws {WriteForbiddenError} 403 (grant no longer authorises the write).
 * @throws {WriteConflictError} 409.
 * @throws {WriteLineageError} 422 (`LINEAGE_SOURCE_UNKNOWN`, ...).
 * @throws {WriteRejectedError} Any other non-2xx.
 * @throws {WriteTransportError} `fetch` threw on every attempt.
 */
export async function writeData(
  params: WriteDataParams,
): Promise<WriteDataResult> {
  const { session } = params;
  const fetchFn = resolveFetch(params.fetch);
  if (typeof params.scope !== "string" || params.scope.length === 0) {
    throw new WriteRequestError("scope is required");
  }
  const prepared = prepareWrite(params);
  if (Date.now() >= session.expiresAt) {
    throw new WriteSessionExpiredError(
      "Write session has expired; open a new session",
      { grantId: session.grantId, expiresAt: session.expiresAt },
    );
  }

  const path = dataPath(params.scope);
  const response = await sendWithFreshProof(
    `Write to ${params.scope}`,
    fetchFn,
    params.retry,
    proofKeyFor({
      aud: session.audience,
      method: "POST",
      uri: path,
      grantId: session.grantId,
      signedBytes: prepared.signedBytes,
    }),
    async (iat) => {
      const headers = new Headers(params.headers);
      headers.set("Content-Type", prepared.contentType);
      headers.set("Authorization", `Bearer ${session.accessToken}`);
      if (prepared.filename) {
        setFilenameHeader(headers, prepared.filename);
      }
      if (prepared.metadataHeader !== undefined) {
        headers.set(WRITE_METADATA_HEADER, prepared.metadataHeader);
      }
      headers.set(
        WRITE_SIGNATURE_HEADER,
        await buildWeb3SignedHeader({
          signMessage: session.signer.signMessage,
          aud: session.audience,
          method: "POST",
          uri: path,
          body: prepared.signedBytes,
          grantId: session.grantId,
          iat,
        }),
      );
      return {
        url: `${session.personalServerUrl}${path}`,
        init: {
          method: "POST",
          headers,
          body: prepared.body as unknown as BodyInit,
        },
      };
    },
  );

  if (!response.ok) {
    throw await writeErrorFromResponse(response);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new WriteRejectedError(
      "Personal Server write response is not JSON",
      response.status,
      null,
      { cause: errorMessage(err) },
    );
  }
  const parsed = IngestResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new WriteRejectedError(
      "Personal Server write response is not an ingest result",
      response.status,
      null,
      { issues: parsed.error.issues },
    );
  }
  return parsed.data;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type WritePersonalServerDataParams = Omit<
  OpenWriteSessionParams,
  "fetch" | "headers" | "retry"
> &
  DistributiveOmit<WriteDataParams, "session">;

/** {@link writePersonalServerData}'s answer: the ingest result plus the session it opened. */
export interface WritePersonalServerDataResult extends WriteDataResult {
  /** Reuse for further writes until `expiresAt`. */
  session: WriteSession;
}

/**
 * Open a write session and write one record in a single call.
 *
 * @remarks
 * Equivalent to {@link openWriteSession} followed by {@link writeData}. The
 * session is returned so further writes can reuse it; opening one per write
 * is correct but costs an extra signature and round-trip each time.
 *
 * @throws Everything {@link openWriteSession} and {@link writeData} throw.
 */
export async function writePersonalServerData(
  params: WritePersonalServerDataParams,
): Promise<WritePersonalServerDataResult> {
  const session = await openWriteSession({
    personalServerUrl: params.personalServerUrl,
    signer: params.signer,
    grantId: params.grantId,
    account: params.account,
    audience: params.audience,
    fetch: params.fetch,
    headers: params.headers,
    retry: params.retry,
  });
  const writeParams = { ...params, session } as WriteDataParams;
  const result = await writeData(writeParams);
  return { ...result, session };
}
