/**
 * PDPP client role: requesting and consuming authorization.
 *
 * @remarks
 * Implements the PDPP Core v0.1.0 Client items that concern authorization:
 * - Item 1: selection requests use the RFC 9396 `authorization_details` envelope.
 * - Item 12: the AS must advertise `https://pdpp.dev/data-access` before the client requests it.
 * - Item 13: every token response, including refresh responses, is inspected; no
 *   disclosure is requested when the result cannot be obtained or interpreted, and
 *   authorization is never inferred from the original request.
 * - Item 27: a purpose code outside Appendix A carries a non-empty `purpose_description`.
 * - Item 28: the authenticated AS issuer is retained with every grant.
 * - Item 18: requests no processing permission (this client supports none).
 * - Item 33: `required_fields` is read from the result, never from a declaration,
 *   and must be a subset of the stream's `fields`.
 *
 * @category PDPP
 */

import { PdppHttpError, PdppProtocolError, pdppHttpErrorFrom } from "./errors";
import {
  PDPP_FETCH_REDIRECT,
  PDPP_REQUEST_TIMEOUT_MS,
  assertPdppEndpoint,
  timeoutSignal,
  type PdppEndpointPolicy,
} from "./endpoints";
import type { PdppGrantRef, PdppHeldDataManager } from "./held-data";
import {
  PDPP_APPENDIX_A_PURPOSES,
  PDPP_CLIENT_SUPPORTED_PROCESSING_PERMISSIONS,
  PDPP_DATA_ACCESS_TYPE,
  type PdppDataAccessDetail,
  type PdppGrant,
} from "./types";

type Fetch = typeof globalThis.fetch;

/** RFC 8414 metadata members this client reads. */
export interface PdppAuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint?: string;
  token_endpoint: string;
  authorization_details_types_supported?: string[];
  /** RFC 7009 client revocation (spec-core #revocation). Optional. */
  revocation_endpoint?: string;
  /** The grant lifecycle operation; every AS MUST provide it (spec-core #grant-lifecycle). */
  pdpp_grant_lifecycle_endpoint?: string;
  /** Absent or empty means the AS supports none (spec-core #processing-permissions). */
  pdpp_processing_permissions_supported?: string[];
  [member: string]: unknown;
}

/** A grant as delivered by a token response, with the issuer that delivered it. */
export interface PdppIssuedGrant {
  /** The authenticated AS issuer (Client item 28). Never inferred from `grant_id` or `source.id`. */
  issuer: string;
  grant: PdppGrant;
}

/** The interpreted result of a token response. */
export interface PdppTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  grants: PdppIssuedGrant[];
}

/**
 * The RFC 8414 metadata URL for an issuer: `/.well-known/oauth-authorization-server`
 * inserted between the host and any issuer path (RFC 8414 §3.1).
 */
export function authorizationServerMetadataUrl(issuer: string): string {
  const url = new URL(issuer);
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return `${url.origin}/.well-known/oauth-authorization-server${path}`;
}

/**
 * Fetch AS metadata and check that it is the issuer asked for and that it
 * advertises the Core data-access type (Client item 12). Every endpoint it
 * names is checked against the issuer origin and `policy` (review F7):
 * https only, no local or private hosts, no other origin unless allowed.
 */
export async function discoverPdppAuthorizationServer(
  issuer: string,
  options: { fetch?: Fetch; metadataUrl?: string; policy?: PdppEndpointPolicy } = {},
): Promise<PdppAuthorizationServerMetadata> {
  const policy = options.policy ?? {};
  assertPdppEndpoint(issuer, issuer, "issuer", policy);
  const metadataUrl = assertPdppEndpoint(
    options.metadataUrl ?? authorizationServerMetadataUrl(issuer),
    issuer,
    "metadata URL",
    policy,
  );
  const doFetch = options.fetch ?? globalThis.fetch;
  const response = await doFetch(metadataUrl, {
    headers: { Accept: "application/json" },
    redirect: PDPP_FETCH_REDIRECT,
    ...withSignal(PDPP_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw await pdppHttpErrorFrom(response);
  const metadata = (await response.json()) as PdppAuthorizationServerMetadata;
  if (metadata.issuer !== issuer) {
    throw new PdppProtocolError("authorization server metadata names a different issuer");
  }
  assertPdppEndpoint(metadata.token_endpoint, issuer, "token_endpoint", policy);
  for (const member of ["authorization_endpoint", "revocation_endpoint", "pdpp_grant_lifecycle_endpoint"] as const) {
    if (metadata[member] !== undefined) assertPdppEndpoint(metadata[member], issuer, member, policy);
  }
  assertSupportsDataAccess(metadata);
  return metadata;
}

function withSignal(ms: number): { signal?: AbortSignal } {
  const signal = timeoutSignal(ms);
  return signal ? { signal } : {};
}

/** Client item 12: refuse to request a type the AS does not advertise. */
export function assertSupportsDataAccess(
  metadata: Pick<PdppAuthorizationServerMetadata, "authorization_details_types_supported">,
): void {
  if (!metadata.authorization_details_types_supported?.includes(PDPP_DATA_ACCESS_TYPE)) {
    throw new PdppProtocolError(
      `authorization server does not advertise ${PDPP_DATA_ACCESS_TYPE}`,
    );
  }
}

/**
 * Build and check one Core data-access detail before it is sent.
 *
 * Throws when the detail breaks a rule the client owns: each stream carries
 * `fields` or `view` (spec-core §6 "Defaults"); exactly one of `streams` and
 * `selection_preset`; a purpose code outside Appendix A carries a non-empty
 * `purpose_description` (Client item 27).
 */
export function buildDataAccessDetail(
  detail: Omit<PdppDataAccessDetail, "type">,
): PdppDataAccessDetail {
  const hasStreams = detail.streams !== undefined;
  const hasPreset = detail.selection_preset !== undefined;
  if (hasStreams === hasPreset) {
    throw new TypeError("a data-access detail carries exactly one of streams or selection_preset");
  }
  for (const stream of detail.streams ?? []) {
    if (stream.fields === undefined && stream.view === undefined) {
      throw new TypeError(
        `stream ${stream.name} must carry fields or view (use fields: ["*"] for every permitted field)`,
      );
    }
  }
  // Client item 18 / O7: a permission is requested only when supported end to
  // end. This client implements no defining profile, so it requests none.
  for (const permission of detail.processing_permissions ?? []) {
    if (!PDPP_CLIENT_SUPPORTED_PROCESSING_PERMISSIONS.includes(permission)) {
      throw new TypeError(
        `processing permission ${permission} is not supported by this client; no v0.1 permission is registered`,
      );
    }
  }
  if (
    !PDPP_APPENDIX_A_PURPOSES.includes(detail.purpose_code) &&
    !(typeof detail.purpose_description === "string" && detail.purpose_description.trim() !== "")
  ) {
    throw new TypeError(
      `purpose_code ${detail.purpose_code} is not in Appendix A and needs a purpose_description the owner can understand`,
    );
  }
  return { type: PDPP_DATA_ACCESS_TYPE, ...detail };
}

/**
 * An RFC 9396 authorization request (Client item 1).
 *
 * `query` is the front-channel form: `authorization_details` is a JSON string
 * parameter. `json` is the same request as a JSON body, the form a consent
 * broker posts to an AS that takes JSON (for example the Vana Personal Server).
 */
export function buildAuthorizationRequest(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  details: PdppDataAccessDetail[];
  state?: string;
}): { query: URLSearchParams; json: Record<string, unknown> } {
  if (input.details.length === 0) {
    throw new TypeError("an authorization request carries at least one detail");
  }
  for (const detail of input.details) {
    if (detail.type !== PDPP_DATA_ACCESS_TYPE) {
      throw new TypeError("every detail must have type https://pdpp.dev/data-access");
    }
  }
  const json = {
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    authorization_details: input.details,
    ...(input.state !== undefined && { state: input.state }),
  };
  const query = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    authorization_details: JSON.stringify(input.details),
    ...(input.state !== undefined && { state: input.state }),
  });
  return { query, json };
}

/** RFC 7636 S256 PKCE pair. */
export async function createPkcePair(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
}> {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const codeVerifier = base64Url(bytes);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  return {
    codeVerifier,
    codeChallenge: base64Url(new Uint8Array(digest)),
    codeChallengeMethod: "S256",
  };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Interpret a token response (Client item 13).
 *
 * Returns one entry per covered grant, each with the issuer that delivered it.
 * Throws {@link PdppProtocolError} when the result is missing or cannot be
 * interpreted, so the caller cannot proceed to request disclosure.
 */
export function interpretTokenResponse(
  body: unknown,
  issuer: string,
): PdppTokenResult {
  if (!body || typeof body !== "object") {
    throw new PdppProtocolError("token response is not a JSON object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.access_token !== "string" || b.access_token === "") {
    throw new PdppProtocolError("token response has no access_token");
  }
  if (!Array.isArray(b.authorization_details) || b.authorization_details.length === 0) {
    throw new PdppProtocolError(
      "token response carries no authorization result; disclosure must not be requested",
    );
  }
  const grants: PdppIssuedGrant[] = b.authorization_details.map((element, index) => {
    if (!element || typeof element !== "object") {
      throw new PdppProtocolError(`authorization result element ${index} is not an object`);
    }
    const e = element as { type?: unknown; grant?: unknown };
    if (e.type !== PDPP_DATA_ACCESS_TYPE) {
      throw new PdppProtocolError(
        `authorization result element ${index} has type ${String(e.type)}, not ${PDPP_DATA_ACCESS_TYPE}`,
      );
    }
    return { issuer, grant: checkGrant(e.grant, index) };
  });
  return {
    accessToken: b.access_token,
    ...(typeof b.refresh_token === "string" && { refreshToken: b.refresh_token }),
    ...(typeof b.expires_in === "number" && { expiresIn: b.expires_in }),
    grants,
  };
}

function checkGrant(grant: unknown, index: number): PdppGrant {
  const fail = (what: string): never => {
    throw new PdppProtocolError(`authorization result element ${index}: ${what}`);
  };
  if (!grant || typeof grant !== "object") return fail("grant is missing");
  const g = grant as Record<string, unknown>;
  if (typeof g.grant_id !== "string") fail("grant_id is missing");
  if (typeof g.access_mode !== "string") fail("access_mode is missing");
  const source = g.source as Record<string, unknown> | undefined;
  if (!source || typeof source.id !== "string" || typeof source.kind !== "string") {
    fail("source {kind, id} is missing");
  }
  if (!Array.isArray(g.streams) || g.streams.length === 0) fail("streams are missing");
  for (const s of g.streams as unknown[]) {
    const stream = s as Record<string, unknown>;
    const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
    if (
      typeof stream?.name !== "string" ||
      !strings(stream.instance_ids) ||
      !strings(stream.fields) ||
      // Client item 33: the frozen consent floor comes from the result.
      !strings(stream.required_fields)
    ) {
      fail(`stream ${String(stream?.name)} lacks name, instance_ids, fields or required_fields`);
    }
    const fields = stream.fields as string[];
    const required = stream.required_fields as string[];
    if (new Set(required).size !== required.length || !required.every((f) => fields.includes(f))) {
      fail(`stream ${String(stream.name)} has required_fields that are repeated or not in fields`);
    }
  }
  return grant as PdppGrant;
}

/**
 * Exchange an authorization code at the token endpoint (RFC 6749 §4.1.3 +
 * PKCE). The result is recorded in `heldData` as the positive assessment it
 * carries (Client item 20); the app need not wire it by hand.
 */
export async function exchangeAuthorizationCode(input: {
  metadata: PdppAuthorizationServerMetadata;
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
  heldData: PdppHeldDataManager;
  fetch?: Fetch;
}): Promise<PdppTokenResult> {
  const result = await tokenRequest(input.metadata, input.fetch, {
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.codeVerifier,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
  });
  for (const issued of result.grants) input.heldData.recordTokenResponse(issued);
  return result;
}

/**
 * Refresh; the refresh response is inspected like any other (Client item 13)
 * and recorded in `heldData`. A failure that shows the grant may have ended
 * (`invalid_grant` and the others in spec-core #reconciliation) makes a
 * lifecycle query due before further use of every grant in `grants`.
 */
export async function refreshPdppToken(input: {
  metadata: PdppAuthorizationServerMetadata;
  refreshToken: string;
  clientId: string;
  heldData: PdppHeldDataManager;
  /** The grants the refresh-token family covers. */
  grants: PdppGrantRef[];
  fetch?: Fetch;
}): Promise<PdppTokenResult> {
  let result: PdppTokenResult;
  try {
    result = await tokenRequest(input.metadata, input.fetch, {
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
      client_id: input.clientId,
    });
  } catch (error) {
    if (error instanceof PdppHttpError) {
      for (const ref of input.grants) input.heldData.recordGrantSignal(ref, error);
    }
    throw error;
  }
  for (const issued of result.grants) input.heldData.recordTokenResponse(issued);
  return result;
}

async function tokenRequest(
  metadata: PdppAuthorizationServerMetadata,
  fetchImpl: Fetch | undefined,
  form: Record<string, string>,
): Promise<PdppTokenResult> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const response = await doFetch(metadata.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(form).toString(),
    redirect: PDPP_FETCH_REDIRECT,
    ...withSignal(PDPP_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw await pdppHttpErrorFrom(response);
  return interpretTokenResponse(await response.json(), metadata.issuer);
}
