/**
 * Message protocol for the Vana connect sheet, shared by the partner-side
 * launcher and the Vana-hosted sheet.
 *
 * @remarks
 * Zero-dependency and browser-safe: it imports nothing, so a non-SDK
 * consumer (Vana Account's sheet, a backend validating a request) can take
 * it alone from `@opendatalabs/vana-sdk/connect/protocol`.
 *
 * ```
 *   partner page                                   Vana sheet (iframe)
 *   ────────────                                   ───────────────────
 *   iframe src = sheetUrl(...)          ───────▶   renders, bound to partner origin
 *                                       ◀───────   vana:ready
 *                                       ◀───────   vana:resize { height }
 *                                       ◀───────   vana:signed-in
 *                                       ◀───────   vana:request-needed
 *   vana:request { request }            ───────▶   loads the request via Vana's server
 *                                       ◀───────   vana:connected { status, completion }
 *                                                  (approved; data follows in the sheet)
 *                                       ◀───────   vana:progress { phase }
 *                                                  (remote_collect only; coarse, no source detail)
 *   vana:request-status { status }      ───────▶   shows the partner-observed outcome
 *   vana:write { id, scope, data }      ───────▶   saves to an approved scope
 *                                       ◀───────   vana:write-result { id, ok }
 *                                       ◀───────   vana:close | vana:error { code }
 * ```
 *
 * Every message carries `v`. Both sides post with an exact `targetOrigin` and
 * check `event.origin` and `event.source` before parsing. Tokens never cross
 * this boundary: the sheet only reports outcomes.
 *
 * Versioning: the sheet URL carries the highest version the launcher speaks
 * (`v`). Parsers accept any version from {@link MIN_PROTOCOL_VERSION} to
 * {@link PROTOCOL_VERSION} and drop fields they do not know, so a sheet may
 * add fields without a version bump. A `vana:ready` or `vana:error` at a
 * version outside that range is reported as `incompatible_version` (see
 * {@link readIncompatibleVersion}).
 *
 * @category Connect
 * @module connect/protocol
 */

/** The protocol version this SDK posts and puts in the sheet URL. */
export const PROTOCOL_VERSION = 1;

/** The oldest protocol version this SDK still accepts from the other side. */
export const MIN_PROTOCOL_VERSION = 1;

/** A protocol version this SDK accepts. */
export type ProtocolVersion = typeof PROTOCOL_VERSION;

/** Path of the sheet page on the Vana Account origin. */
export const SHEET_PATH = "/embed/connect";

/** Query parameters the sheet reads. The origin is re-checked server side. */
export const SHEET_QUERY = {
  clientId: "client_id",
  origin: "origin",
  version: "v",
} as const;

/** Vana Account origin per deployment environment. */
export const VANA_ACCOUNT_ORIGINS = {
  production: "https://account.vana.org",
  dev: "https://account-dev.vana.org",
} as const;

/** Environment names {@link VANA_ACCOUNT_ORIGINS} is keyed by. */
export type VanaConnectEnv = keyof typeof VANA_ACCOUNT_ORIGINS;

/** The production Vana Account origin, which serves the sheet. */
export const DEFAULT_VANA_ORIGIN = VANA_ACCOUNT_ORIGINS.production;

/**
 * How an approved request gets its data, always inside this sheet.
 *
 * @remarks
 * `in_browser`: the person's Personal Server already holds every scope and
 * serves them from the sheet until the partner reads.
 * `remote_collect`: some scopes are missing, so the sheet collects them (a
 * remote browser, driven with the person) and then serves.
 */
export type ConnectCompletion = "in_browser" | "remote_collect";

const CONNECT_COMPLETIONS: readonly ConnectCompletion[] = [
  "in_browser",
  "remote_collect",
];

/**
 * Where a `remote_collect` request stands once approved. Deliberately coarse:
 * it says nothing of which source, what was asked of the person, or how it is
 * going. The partner shows "Vana is collecting your data", nothing more.
 */
export type ConnectProgressPhase = "collecting" | "writing";

const PROGRESS_PHASES: readonly ConnectProgressPhase[] = [
  "collecting",
  "writing",
];

/** Height reports below this are a hidden or throttled frame, never content. */
export const MIN_SHEET_HEIGHT_PX = 80;

/** Direct Data Controller status vocabulary, as the partner backend sees it. */
export type RequestStatus =
  | "pending"
  | "approved"
  | "completed"
  | "denied"
  | "expired";

/**
 * A partner-signed, short-lived read capability for one request.
 *
 * @remarks
 * The sheet asks for it (`vana:request-needed`) once the person has signed
 * in, so the partner signs it fresh; it expires within minutes. It is the
 * Direct SDK request signature for `GET /api/data-connection-requests/<id>`,
 * minted by the partner's backend with its app key. Vana's server replays it
 * to the request authority, so the sheet shows the request's real scopes and
 * the partner cannot claim someone else's app.
 */
export interface RequestAuthorization {
  appAddress: `0x${string}`;
  signature: `0x${string}`;
  timestamp: string;
}

/** What the partner hands the sheet: a request id and its read capability. */
export interface ConnectRequest {
  authorization: RequestAuthorization;
  id: string;
}

/** Error codes the sheet reports. */
export type SheetErrorCode =
  | "frame_blocked"
  | "incompatible_version"
  | "origin_not_registered"
  | "personal_server_unsupported"
  | "request_unavailable"
  | "sheet_failed";

/** Sheet to partner. */
export type SheetMessage =
  | { type: "vana:ready"; v: ProtocolVersion }
  | { height: number; type: "vana:resize"; v: ProtocolVersion }
  | { type: "vana:signed-in"; v: ProtocolVersion }
  | { type: "vana:request-needed"; v: ProtocolVersion }
  | {
      completion: ConnectCompletion;
      status: "approved";
      type: "vana:connected";
      v: ProtocolVersion;
    }
  | {
      phase: ConnectProgressPhase;
      type: "vana:progress";
      v: ProtocolVersion;
    }
  | {
      id: string;
      ok: boolean;
      type: "vana:write-result";
      v: ProtocolVersion;
    }
  | { type: "vana:close"; v: ProtocolVersion }
  | { code: SheetErrorCode; type: "vana:error"; v: ProtocolVersion };

/** Partner to sheet. */
export type PartnerMessage =
  | {
      request: ConnectRequest;
      type: "vana:request";
      v: ProtocolVersion;
    }
  | {
      status: RequestStatus;
      type: "vana:request-status";
      v: ProtocolVersion;
    }
  | {
      /** Saved as-is; the sheet refuses scopes this person did not approve. */
      data: unknown;
      id: string;
      scope: string;
      type: "vana:write";
      v: ProtocolVersion;
    };

const REQUEST_STATUSES: readonly RequestStatus[] = [
  "pending",
  "approved",
  "completed",
  "denied",
  "expired",
];

const SHEET_ERROR_CODES: readonly SheetErrorCode[] = [
  "frame_blocked",
  "incompatible_version",
  "origin_not_registered",
  "personal_server_unsupported",
  "request_unavailable",
  "sheet_failed",
];

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;
const WRITE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SCOPE = /^[a-z0-9_]+(\.[A-Za-z0-9_]+)+$/;
const TIMESTAMP = /^[0-9]{10,16}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isSupportedVersion(value: unknown): value is ProtocolVersion {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_PROTOCOL_VERSION &&
    value <= PROTOCOL_VERSION
  );
}

/**
 * Whether a request id has the shape the sheet accepts.
 *
 * @remarks
 * The id is signed into a request path, so anything outside this shape could
 * name a different resource. Signers refuse it.
 *
 * @param value - The candidate request id.
 * @returns `true` for 1 to 128 characters of `[A-Za-z0-9_-]`.
 */
export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID.test(value);
}

function readAuthorization(value: unknown): RequestAuthorization | null {
  const auth = record(value);
  if (!auth) {
    return null;
  }
  const { appAddress, signature, timestamp } = auth;
  if (
    typeof appAddress !== "string" ||
    !HEX_ADDRESS.test(appAddress) ||
    typeof signature !== "string" ||
    !HEX_SIGNATURE.test(signature) ||
    typeof timestamp !== "string" ||
    !TIMESTAMP.test(timestamp)
  ) {
    return null;
  }
  return {
    appAddress: appAddress as `0x${string}`,
    signature: signature as `0x${string}`,
    timestamp,
  };
}

/**
 * Parse a {@link ConnectRequest}. Extra fields are dropped.
 *
 * @param value - Untrusted input.
 * @returns The request, or `null` when malformed.
 */
export function readConnectRequest(value: unknown): ConnectRequest | null {
  const request = record(value);
  if (!request || !isRequestId(request.id)) {
    return null;
  }
  const authorization = readAuthorization(request.authorization);
  return authorization ? { authorization, id: request.id } : null;
}

/**
 * Detect a sheet that speaks a protocol version this SDK does not.
 *
 * @remarks
 * Only `vana:ready` and `vana:error` are read at any version: they are the
 * handshake, so the launcher can tell "the sheet is up but incompatible" from
 * "the sheet never started". Everything else at an unknown version is ignored.
 *
 * @param data - A message posted by the sheet.
 * @returns The sheet's version when it is outside the supported range,
 * otherwise `null`.
 */
export function readIncompatibleVersion(data: unknown): number | null {
  const message = record(data);
  if (
    !message ||
    (message.type !== "vana:ready" && message.type !== "vana:error")
  ) {
    return null;
  }
  const { v } = message;
  if (typeof v !== "number" || !Number.isInteger(v) || isSupportedVersion(v)) {
    return null;
  }
  return v;
}

/**
 * Parse a message the sheet posted.
 *
 * @remarks
 * Unknown fields are dropped. Unknown message types are ignored. An error
 * code this SDK does not know is read as `sheet_failed`, so a newer sheet's
 * failure is never silently lost.
 *
 * @param data - Untrusted `MessageEvent.data`.
 * @returns The message, or `null` for unknown or malformed data.
 */
export function parseSheetMessage(data: unknown): SheetMessage | null {
  const message = record(data);
  if (!(message && isSupportedVersion(message.v))) {
    return null;
  }
  const v = message.v;
  switch (message.type) {
    case "vana:ready":
    case "vana:signed-in":
    case "vana:request-needed":
    case "vana:close":
      return { type: message.type, v };
    case "vana:resize": {
      const { height } = message;
      if (typeof height !== "number" || !Number.isFinite(height)) {
        return null;
      }
      return { height, type: "vana:resize", v };
    }
    case "vana:connected": {
      const completion = CONNECT_COMPLETIONS.find(
        (known) => known === message.completion,
      );
      return message.status === "approved" && completion
        ? { completion, status: "approved", type: "vana:connected", v }
        : null;
    }
    case "vana:progress": {
      const phase = PROGRESS_PHASES.find((known) => known === message.phase);
      return phase ? { phase, type: "vana:progress", v } : null;
    }
    case "vana:write-result":
      return typeof message.id === "string" &&
        WRITE_ID.test(message.id) &&
        typeof message.ok === "boolean"
        ? { id: message.id, ok: message.ok, type: "vana:write-result", v }
        : null;
    case "vana:error": {
      if (typeof message.code !== "string") {
        return null;
      }
      const code =
        SHEET_ERROR_CODES.find((known) => known === message.code) ??
        "sheet_failed";
      return { code, type: "vana:error", v };
    }
    default:
      return null;
  }
}

/**
 * Parse a message the partner posted.
 *
 * @param data - Untrusted `MessageEvent.data`.
 * @returns The message, or `null` for unknown or malformed data.
 */
export function parsePartnerMessage(data: unknown): PartnerMessage | null {
  const message = record(data);
  if (!(message && isSupportedVersion(message.v))) {
    return null;
  }
  const v = message.v;
  switch (message.type) {
    case "vana:request": {
      const request = readConnectRequest(message.request);
      return request ? { request, type: "vana:request", v } : null;
    }
    case "vana:request-status": {
      const status = REQUEST_STATUSES.find((known) => known === message.status);
      return status ? { status, type: "vana:request-status", v } : null;
    }
    case "vana:write":
      return typeof message.id === "string" &&
        WRITE_ID.test(message.id) &&
        typeof message.scope === "string" &&
        SCOPE.test(message.scope)
        ? {
            data: message.data,
            id: message.id,
            scope: message.scope,
            type: "vana:write",
            v,
          }
        : null;
    default:
      return null;
  }
}

/**
 * Normalize to a bare origin.
 *
 * @param value - A URL or origin.
 * @returns `scheme://host[:port]` for http(s), or `null` for anything else.
 */
export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Build the sheet's iframe URL.
 *
 * @param input - The registered client id, the partner page origin, and the
 * Vana Account origin.
 * @returns `<vanaOrigin>/embed/connect?client_id&origin&v`.
 */
export function sheetUrl(input: {
  clientId: string;
  partnerOrigin: string;
  vanaOrigin: string;
}): string {
  const url = new URL(SHEET_PATH, input.vanaOrigin);
  url.searchParams.set(SHEET_QUERY.clientId, input.clientId);
  url.searchParams.set(SHEET_QUERY.origin, input.partnerOrigin);
  url.searchParams.set(SHEET_QUERY.version, String(PROTOCOL_VERSION));
  return url.toString();
}

/**
 * Content-Security-Policy sources a partner page needs for the sheet.
 *
 * @remarks
 * The launcher is bundled into the partner's own code, so only the frame
 * needs allowing. Merge the result into your existing policy; if the page
 * sets `child-src` but not `frame-src`, add the origin there instead.
 *
 * @example
 * ```typescript
 * const csp = vanaConnectCsp("production");
 * // { "frame-src": ["https://account.vana.org"] }
 * const header = Object.entries(csp)
 *   .map(([directive, sources]) => `${directive} 'self' ${sources.join(" ")}`)
 *   .join("; ");
 * ```
 *
 * @param target - `"production"`, `"dev"`, or `{ accountOrigin }` for a
 * custom Vana Account deployment.
 * @returns The directives to add, each with the sources it needs.
 */
export function vanaConnectCsp(
  target: VanaConnectEnv | { accountOrigin: string } = "production",
): { "frame-src": string[] } {
  const origin =
    typeof target === "string"
      ? VANA_ACCOUNT_ORIGINS[target]
      : normalizeOrigin(target.accountOrigin);
  if (!origin) {
    throw new TypeError("accountOrigin must be an http(s) origin");
  }
  return { "frame-src": [origin] };
}
