/**
 * Derivative lineage: which data points a record was derived from, and which
 * records were derived from it.
 *
 * @remarks
 * A data point is addressed by `keccak256(abi.encode(address owner, string
 * scope))` ({@link deriveDataPointId}). A builder writing a derivative names
 * its sources through the `lineage` option of {@link writeData}; the Personal
 * Server stores them under the reserved `$lineage` key and both the Personal
 * Server (`GET /v1/data/:scope/lineage`) and the gateway
 * (`GET /v1/data/:dataPointId/lineage`) answer the resulting graph. Nodes the
 * caller holds no grant for come back as `{ dataPointId, redacted: true }`.
 *
 * @category Protocol
 */

import {
  encodeAbiParameters,
  isAddress,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";
import { buildWeb3SignedHeader } from "../auth/web3-signed-builder";
import { LineageReadError } from "../errors";
import {
  isRecord,
  readPersonalServerErrorBody,
} from "./personal-server-error-body";
import {
  resolveWriteSigner,
  type ResolveWriteSignerOptions,
  type WriteSignerSource,
} from "./write-signer";

const DATA_POINT_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/** `true` when `value` is a 32-byte hex data point id. */
export function isDataPointId(value: unknown): value is Hex {
  return typeof value === "string" && DATA_POINT_ID_PATTERN.test(value);
}

/**
 * Derive the DataRegistryV2 data point id for an owner and scope:
 * `keccak256(abi.encode(address ownerAddress, string scope))`.
 *
 * @param ownerAddress - The data owner (the Personal Server owner).
 * @param scope - The scope the data point is stored under.
 * @returns The 32-byte id, lowercase hex.
 * @throws Error when `ownerAddress` is not an EVM address.
 */
export function deriveDataPointId(ownerAddress: Address, scope: string): Hex {
  if (!isAddress(ownerAddress, { strict: false })) {
    throw new Error(
      `ownerAddress is not an EVM address: ${String(ownerAddress)}`,
    );
  }
  return keccak256(
    encodeAbiParameters(
      [
        { name: "ownerAddress", type: "address" },
        { name: "scope", type: "string" },
      ],
      [ownerAddress, scope],
    ),
  );
}

const DataPointIdSchema = z
  .string()
  .regex(DATA_POINT_ID_PATTERN)
  .transform((value) => value.toLowerCase() as Hex);

const VERSION_PATTERN = /^[1-9]\d*$/;

// Versions are positive decimal integers, strings on the wire; a numeric
// value is normalised to the same representation.
const VersionSchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine((value) => VERSION_PATTERN.test(value), {
    message: "version must be a positive decimal integer",
  });

export const LineageNodeSchema = z.object({
  dataPointId: DataPointIdSchema,
  scope: z.string(),
  /** The node's current version, decimal string. */
  version: VersionSchema,
  /** The node's tombstone time, or `null` when live. */
  deletedAt: z.string().nullable(),
});

export const RedactedLineageNodeSchema = z.object({
  dataPointId: DataPointIdSchema,
  redacted: z.literal(true),
});

export const LineageEntrySchema = z.union([
  RedactedLineageNodeSchema,
  LineageNodeSchema,
]);

export const LineageGraphSchema = z.object({
  dataPointId: DataPointIdSchema,
  /** The data point owner; every node in the view belongs to it. */
  ownerAddress: z.string().optional(),
  scope: z.string(),
  /**
   * The derived record's version whose lineage is shown: the requested one,
   * else the current one, else (current is a tombstone) the last version
   * that carried lineage.
   */
  version: VersionSchema,
  deletedAt: z.string().nullable(),
  sources: z.array(LineageEntrySchema),
  derivatives: z.array(LineageEntrySchema),
});

/** A lineage node the caller is allowed to see. */
export type LineageNode = z.infer<typeof LineageNodeSchema>;

/** A lineage node the caller holds no grant for: only its id is disclosed. */
export type RedactedLineageNode = z.infer<typeof RedactedLineageNodeSchema>;

/** One entry of a lineage graph. Narrow with {@link isRedactedLineageNode}. */
export type LineageEntry = z.infer<typeof LineageEntrySchema>;

/** The lineage view of one data point (the `data` of the response). */
export type LineageGraph = z.infer<typeof LineageGraphSchema>;

/** A lineage read: the view plus the gateway's attestation over it. */
export interface LineageReadResult extends LineageGraph {
  /**
   * The gateway `proof` (`GatewayAttestation` over the served view, so a
   * redacted view verifies on its own). Passed through as received; absent
   * when the server sent none.
   */
  proof?: Record<string, unknown>;
}

/** `true` when the entry was redacted (the caller holds no grant for it). */
export function isRedactedLineageNode(
  entry: LineageEntry,
): entry is RedactedLineageNode {
  return "redacted" in entry && entry.redacted === true;
}

/** Path of the Personal Server lineage read for a scope. */
export function personalServerLineagePath(scope: string): string {
  return `/v1/data/${encodeURIComponent(scope)}/lineage`;
}

/**
 * The gateway lineage uri the request is signed over and sent to: the path
 * with the id lowercased, then the canonical query (`version`, then
 * `grantId` lowercased, in that order, only when given), so a captured
 * signature cannot be replayed for another version or grant view.
 */
export function gatewayLineagePath(
  dataPointId: Hex,
  options: { version?: string | number; grantId?: string } = {},
): string {
  const params = new URLSearchParams();
  if (options.version !== undefined) {
    params.set("version", String(options.version));
  }
  if (options.grantId !== undefined) {
    params.set("grantId", options.grantId.toLowerCase());
  }
  const query = params.toString();
  return `/v1/data/${dataPointId.toLowerCase()}/lineage${query ? `?${query}` : ""}`;
}

interface LineageRequestOptions {
  /**
   * Read the lineage as of this version (a positive decimal integer);
   * omitted = the current version, or the last version that carried lineage
   * when the current one is a tombstone.
   */
  version?: string | number;
  /** `fetch` to use; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Extra request headers. */
  headers?: HeadersInit;
}

/** Lineage read against the Personal Server holding the record. */
export interface PersonalServerLineageParams extends LineageRequestOptions {
  /** Personal Server origin, e.g. `https://ps.example.com`. */
  personalServerUrl: string;
  /** The scope whose lineage to read. */
  scope: string;
  /** A grant covering the scope, sent as the signed `grantId` claim. */
  grantId: string;
  /** Builder key: a viem `LocalAccount`, `WalletClient`, or `{ signMessage }`. */
  signer: WriteSignerSource;
  /** Account for a viem wallet client without a hoisted account. */
  account?: ResolveWriteSignerOptions["account"];
  /** Web3Signed audience; defaults to `personalServerUrl`. */
  audience?: string;
}

/** Lineage read against the gateway, by data point id. */
export interface GatewayLineageParams extends LineageRequestOptions {
  /** Gateway origin, e.g. `https://dp-rpc.vana.org`. */
  gatewayUrl: string;
  /** The data point whose lineage to read (see {@link deriveDataPointId}). */
  dataPointId: Hex;
  /**
   * The key the request is signed with (Web3Signed, audience = the gateway
   * origin). The signer decides the view: the owner or one of its servers
   * gets the full view; a registered builder holding a live grant covering
   * the data point's scope gets that grant's view; anyone else is refused.
   */
  signer: WriteSignerSource;
  /** Account for a viem wallet client without a hoisted account. */
  account?: ResolveWriteSignerOptions["account"];
  /**
   * The grant whose view to read. Sent as the canonical `grantId` query and
   * as the signed `grantId` claim. An owner or server uses it to fetch the
   * view a builder's grant sees.
   */
  grantId?: string;
}

export type GetLineageParams =
  | PersonalServerLineageParams
  | GatewayLineageParams;

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function resolveFetch(fetchFn: typeof fetch | undefined): typeof fetch {
  const resolved = fetchFn ?? globalThis.fetch;
  if (resolved === undefined) {
    throw new LineageReadError("No fetch implementation available");
  }
  return resolved;
}

function normalizeVersion(
  version: string | number | undefined,
): string | undefined {
  if (version === undefined) return undefined;
  const text = String(version);
  if (!VERSION_PATTERN.test(text)) {
    throw new LineageReadError(
      "version must be a positive decimal integer",
      undefined,
      "INVALID_VERSION",
      { version },
    );
  }
  return text;
}

async function lineageReadFailure(
  source: string,
  response: Response,
): Promise<LineageReadError> {
  const { errorCode, message, details } =
    await readPersonalServerErrorBody(response);
  return new LineageReadError(
    message ??
      `${source} lineage read failed: ${response.status} ${response.statusText}`,
    response.status,
    errorCode,
    details,
  );
}

async function parseLineageGraph(
  source: string,
  response: Response,
): Promise<LineageReadResult> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new LineageReadError(
      `${source} lineage response is not JSON`,
      response.status,
      null,
      { cause: err instanceof Error ? err.message : String(err) },
    );
  }
  // Both servers answer the gateway envelope `{ data, proof }`; a bare view
  // is accepted too.
  const envelope = isRecord(body) && isRecord(body.data) ? body : undefined;
  const parsed = LineageGraphSchema.safeParse(envelope?.data ?? body);
  if (!parsed.success) {
    throw new LineageReadError(
      `${source} lineage response is not a lineage view`,
      response.status,
      null,
      { issues: parsed.error.issues },
    );
  }
  const proof = isRecord(envelope?.proof) ? envelope.proof : undefined;
  return proof === undefined ? parsed.data : { ...parsed.data, proof };
}

async function sendLineageRead(
  source: string,
  fetchFn: typeof fetch,
  url: string,
  headers: Headers,
): Promise<LineageReadResult> {
  let response: Response;
  try {
    response = await fetchFn(url, { method: "GET", headers });
  } catch (err) {
    throw new LineageReadError(
      `${source} lineage read failed: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      null,
      { cause: err instanceof Error ? err.message : String(err) },
    );
  }
  if (!response.ok) {
    throw await lineageReadFailure(source, response);
  }
  return parseLineageGraph(source, response);
}

/**
 * Read a scope's lineage from the Personal Server that stores it.
 *
 * @remarks
 * Sends `GET /v1/data/:scope/lineage[?version=N]` with a Web3Signed
 * `Authorization` header carrying `grantId`, the same authentication a data
 * read uses (the signed `uri` is the path; the server checks the request
 * path). The server resolves the data point id, fetches the view the grant
 * sees from the gateway and returns the gateway's `data` + `proof`.
 *
 * @returns The lineage view, with redacted entries for nodes the grant does
 *   not cover, plus the gateway attestation.
 * @throws {LineageReadError} On a non-2xx answer (`errorCode`: read errors,
 *   `NOT_FOUND` when the scope or version is not registered at the gateway,
 *   `LINEAGE_FORBIDDEN`, `LINEAGE_GATEWAY_ERROR`, `LINEAGE_UNAVAILABLE`), an
 *   unreadable body, a bad `version`, or a transport failure.
 */
export async function getPersonalServerLineage(
  params: PersonalServerLineageParams,
): Promise<LineageReadResult> {
  const fetchFn = resolveFetch(params.fetch);
  const baseUrl = normalizeBaseUrl(params.personalServerUrl);
  const audience = params.audience ?? baseUrl;
  const signer = resolveWriteSigner(params.signer, { account: params.account });
  const version = normalizeVersion(params.version);
  const path = personalServerLineagePath(params.scope);
  const url = `${baseUrl}${path}${version === undefined ? "" : `?version=${version}`}`;
  const headers = new Headers(params.headers);
  headers.set(
    "Authorization",
    await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: audience,
      method: "GET",
      uri: path,
      grantId: params.grantId,
    }),
  );
  return sendLineageRead("Personal Server", fetchFn, url, headers);
}

/**
 * Read a data point's lineage from the gateway.
 *
 * @remarks
 * Sends `GET /v1/data/:dataPointId/lineage[?version=N][&grantId=0x...]`
 * with a Web3Signed `Authorization` header: `aud` = the gateway origin,
 * `uri` = {@link gatewayLineagePath} (path plus the canonical query),
 * `grantId` claim = the lowercased `grantId` when given.
 *
 * @returns The lineage view, with redacted entries for nodes the caller's
 *   grant does not cover, plus the gateway attestation.
 * @throws {LineageReadError} On a malformed `dataPointId` or `version`, a
 *   non-2xx answer (400 malformed request, 401 bad signature, 403 no
 *   covering grant, 404 unknown data point or version), an unreadable body,
 *   or a transport failure.
 */
export async function getGatewayLineage(
  params: GatewayLineageParams,
): Promise<LineageReadResult> {
  if (!isDataPointId(params.dataPointId)) {
    throw new LineageReadError(
      "dataPointId must be a 32-byte hex string (see deriveDataPointId)",
      undefined,
      "INVALID_DATA_POINT_ID",
      { dataPointId: params.dataPointId },
    );
  }
  const fetchFn = resolveFetch(params.fetch);
  const baseUrl = normalizeBaseUrl(params.gatewayUrl);
  const signer = resolveWriteSigner(params.signer, { account: params.account });
  const grantId = params.grantId?.toLowerCase();
  const uri = gatewayLineagePath(params.dataPointId, {
    version: normalizeVersion(params.version),
    grantId,
  });
  const headers = new Headers(params.headers);
  headers.set(
    "Authorization",
    await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: baseUrl,
      method: "GET",
      uri,
      grantId,
    }),
  );
  return sendLineageRead("Gateway", fetchFn, `${baseUrl}${uri}`, headers);
}

/**
 * Read a lineage view from either the Personal Server (by scope) or the
 * gateway (by data point id), chosen by the params shape.
 *
 * @example
 * ```typescript
 * const fromPs = await getLineage({ personalServerUrl, scope, grantId, signer });
 * const fromGateway = await getLineage({ gatewayUrl, dataPointId, grantId, signer });
 * ```
 */
export function getLineage(
  params: GetLineageParams,
): Promise<LineageReadResult> {
  return "personalServerUrl" in params
    ? getPersonalServerLineage(params)
    : getGatewayLineage(params);
}
