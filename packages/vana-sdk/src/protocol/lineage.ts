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
  .transform((value) => value as Hex);

export const LineageNodeSchema = z.object({
  dataPointId: DataPointIdSchema,
  scope: z.string(),
  // The gateway reports versions as decimal strings; normalise a numeric
  // Personal Server value to the same representation.
  version: z.union([z.string(), z.number()]).transform(String),
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
  sources: z.array(LineageEntrySchema),
  derivatives: z.array(LineageEntrySchema),
});

/** A lineage node the caller is allowed to see. */
export type LineageNode = z.infer<typeof LineageNodeSchema>;

/** A lineage node the caller holds no grant for: only its id is disclosed. */
export type RedactedLineageNode = z.infer<typeof RedactedLineageNodeSchema>;

/** One entry of a lineage graph. Narrow with {@link isRedactedLineageNode}. */
export type LineageEntry = z.infer<typeof LineageEntrySchema>;

/** The lineage graph of one data point. */
export type LineageGraph = z.infer<typeof LineageGraphSchema>;

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

/** Path of the gateway lineage read for a data point id. */
export function gatewayLineagePath(dataPointId: Hex): string {
  return `/v1/data/${dataPointId}/lineage`;
}

interface LineageRequestOptions {
  /** Read the lineage as of this data point version (latest when omitted). */
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
   * Optional builder key. When given, the request carries a Web3Signed
   * `Authorization` header (audience = `gatewayUrl`) with `grantId` so the
   * gateway can disclose the nodes the caller holds grants for.
   */
  signer?: WriteSignerSource;
  /** Account for a viem wallet client without a hoisted account. */
  account?: ResolveWriteSignerOptions["account"];
  /** Grant to present alongside `signer`. */
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

function withVersion(
  path: string,
  version: string | number | undefined,
): string {
  if (version === undefined) return path;
  return `${path}?version=${encodeURIComponent(String(version))}`;
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
): Promise<LineageGraph> {
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
  // The gateway wraps answers in its `{ data, proof }` envelope; the Personal
  // Server answers the graph directly. Accept both.
  const candidate =
    isRecord(body) && isRecord(body.data) && !("dataPointId" in body)
      ? body.data
      : body;
  const parsed = LineageGraphSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new LineageReadError(
      `${source} lineage response is not a lineage graph`,
      response.status,
      null,
      { issues: parsed.error.issues },
    );
  }
  return parsed.data;
}

async function sendLineageRead(
  source: string,
  fetchFn: typeof fetch,
  url: string,
  headers: Headers,
): Promise<LineageGraph> {
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
 * Sends `GET /v1/data/:scope/lineage` with a Web3Signed `Authorization`
 * header carrying `grantId`, the same authentication a data read uses.
 *
 * @returns The lineage graph, with redacted entries for nodes the grant does
 *   not cover.
 * @throws {LineageReadError} On a non-2xx answer, an unreadable body, or a
 *   transport failure.
 */
export async function getPersonalServerLineage(
  params: PersonalServerLineageParams,
): Promise<LineageGraph> {
  const fetchFn = resolveFetch(params.fetch);
  const baseUrl = normalizeBaseUrl(params.personalServerUrl);
  const audience = params.audience ?? baseUrl;
  const signer = resolveWriteSigner(params.signer, { account: params.account });
  const path = withVersion(
    personalServerLineagePath(params.scope),
    params.version,
  );
  const headers = new Headers(params.headers);
  headers.set(
    "Authorization",
    await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: audience,
      method: "GET",
      // The signed uri claim is the path without the query string, matching
      // the Personal Server's `url.pathname` check.
      uri: personalServerLineagePath(params.scope),
      grantId: params.grantId,
    }),
  );
  return sendLineageRead(
    "Personal Server",
    fetchFn,
    `${baseUrl}${path}`,
    headers,
  );
}

/**
 * Read a data point's lineage from the gateway.
 *
 * @remarks
 * Sends `GET /v1/data/:dataPointId/lineage`, optionally authenticated with a
 * Web3Signed header when `signer` is given.
 *
 * @returns The lineage graph, with redacted entries for nodes the caller
 *   holds no grant for.
 * @throws {LineageReadError} On a malformed `dataPointId`, a non-2xx answer,
 *   an unreadable body, or a transport failure.
 */
export async function getGatewayLineage(
  params: GatewayLineageParams,
): Promise<LineageGraph> {
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
  const path = gatewayLineagePath(params.dataPointId);
  const headers = new Headers(params.headers);
  if (params.signer !== undefined) {
    const signer = resolveWriteSigner(params.signer, {
      account: params.account,
    });
    headers.set(
      "Authorization",
      await buildWeb3SignedHeader({
        signMessage: signer.signMessage,
        aud: baseUrl,
        method: "GET",
        uri: path,
        grantId: params.grantId,
      }),
    );
  }
  return sendLineageRead(
    "Gateway",
    fetchFn,
    `${baseUrl}${withVersion(path, params.version)}`,
    headers,
  );
}

/**
 * Read a lineage graph from either the Personal Server (by scope) or the
 * gateway (by data point id), chosen by the params shape.
 *
 * @example
 * ```typescript
 * const fromPs = await getLineage({ personalServerUrl, scope, grantId, signer });
 * const fromGateway = await getLineage({ gatewayUrl, dataPointId });
 * ```
 */
export function getLineage(params: GetLineageParams): Promise<LineageGraph> {
  return "personalServerUrl" in params
    ? getPersonalServerLineage(params)
    : getGatewayLineage(params);
}
