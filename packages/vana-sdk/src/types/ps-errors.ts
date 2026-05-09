/**
 * Typed errors returned by Personal Server endpoints.
 *
 * @remarks
 * vana-connect (and other PS clients) need to branch on a small, stable set
 * of lowercase error codes. Personal Server routes currently return protocol
 * errors as `{ error: { code, errorCode, message } }`, while older PoC
 * clients used `{ code, message }`; the parser accepts both shapes.
 *
 * @category Auth
 */

/** Stable error codes returned by Personal Server. */
export type PSErrorCode =
  | "missing_auth"
  | "invalid_signature"
  | "unregistered_builder"
  | "not_owner"
  | "expired_token"
  | "grant_invalid"
  | "grant_required"
  | "grant_expired"
  | "grant_revoked"
  | "scope_mismatch"
  | "fee_required"
  | "ps_unavailable"
  | "server_not_configured"
  | "content_too_large";

/** Typed error wrapping a non-2xx Personal Server response. */
export class PSError extends Error {
  constructor(
    public readonly code: PSErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PSError";
  }
}

const KNOWN_CODES: ReadonlySet<PSErrorCode> = new Set<PSErrorCode>([
  "missing_auth",
  "invalid_signature",
  "unregistered_builder",
  "not_owner",
  "expired_token",
  "grant_invalid",
  "grant_required",
  "grant_expired",
  "grant_revoked",
  "scope_mismatch",
  "fee_required",
  "ps_unavailable",
  "server_not_configured",
  "content_too_large",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeCode(value: unknown): PSErrorCode | null {
  if (typeof value !== "string") {
    return null;
  }
  const code = value.toLowerCase() as PSErrorCode;
  return KNOWN_CODES.has(code) ? code : null;
}

function extractPSErrorBody(
  body: unknown,
): { code: PSErrorCode; message: string } | null {
  if (!isRecord(body)) {
    return null;
  }

  const nested = isRecord(body.error) ? body.error : null;
  const code = normalizeCode(
    nested?.errorCode ?? nested?.code ?? body.errorCode ?? body.code,
  );
  const message = nested?.message ?? body.message;

  if (!code || typeof message !== "string") {
    return null;
  }

  return { code, message };
}

/**
 * Read a Personal Server JSON error body from a non-2xx {@link Response} and
 * return the typed {@link PSError}. The returned code is always lowercase.
 *
 * @returns A {@link PSError} for non-2xx responses with a recognised code,
 *   or `null` for 2xx responses, malformed JSON, or unrecognised codes.
 */
export async function parsePSError(
  response: Response,
): Promise<PSError | null> {
  if (response.ok) {
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  const errorBody = extractPSErrorBody(body);
  return errorBody ? new PSError(errorBody.code, errorBody.message) : null;
}
