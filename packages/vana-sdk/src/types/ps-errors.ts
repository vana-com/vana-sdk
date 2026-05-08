/**
 * Typed errors returned by Personal Server endpoints.
 *
 * @remarks
 * Ported from the e2e POC sequence diagram — vana-connect (and other PS
 * clients) need to branch on a small, stable set of error codes. The PS
 * itself returns `{ code, message }` JSON on non-2xx responses.
 *
 * @category Auth
 */

/** Stable error codes returned by Personal Server. */
export type PSErrorCode =
  | "grant_invalid"
  | "grant_revoked"
  | "fee_required"
  | "ps_unavailable";

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
  "grant_invalid",
  "grant_revoked",
  "fee_required",
  "ps_unavailable",
]);

/**
 * Read a `{code, message}` JSON body from a non-2xx {@link Response} and
 * return the typed {@link PSError}.
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

  if (typeof body !== "object" || body === null) {
    return null;
  }

  const { code, message } = body as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || typeof message !== "string") {
    return null;
  }

  if (!KNOWN_CODES.has(code as PSErrorCode)) {
    return null;
  }

  return new PSError(code as PSErrorCode, message);
}
