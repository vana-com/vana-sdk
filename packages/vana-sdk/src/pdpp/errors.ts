/**
 * Errors the PDPP client raises.
 *
 * @remarks
 * spec-core §8 "Errors", Client item 7: the HTTP status and headers are the
 * authoritative outcome. An unknown `code` or `type` never causes a parse
 * failure; a recognized `type` only refines presentation, and only when it
 * fits the status.
 *
 * @category PDPP
 */

/** Statuses each recognized Core error `type` is compatible with. */
const TYPE_STATUS: Record<string, (status: number) => boolean> = {
  invalid_request_error: (s) => s === 400,
  authentication_error: (s) => s === 401,
  permission_error: (s) => s === 403,
  not_found_error: (s) => s === 404,
  gone_error: (s) => s === 410,
  rate_limit_error: (s) => s === 429,
  api_error: (s) => s >= 500,
};

/** Raised for any non-success response from a PDPP AS or RS. */
export class PdppHttpError extends Error {
  /** Authoritative outcome (Client item 7). */
  readonly status: number;
  /** Opaque error code as sent; may be unknown to this client. */
  readonly code: string | undefined;
  /** The sent `type` when recognized and compatible with `status`, else undefined. */
  readonly type: string | undefined;
  readonly requestId: string | undefined;
  readonly retryAfter: string | undefined;
  readonly wwwAuthenticate: string | undefined;

  constructor(init: {
    status: number;
    code?: string;
    type?: string;
    message: string;
    requestId?: string;
    retryAfter?: string;
    wwwAuthenticate?: string;
  }) {
    super(init.message);
    this.name = "PdppHttpError";
    this.status = init.status;
    this.code = init.code;
    this.type =
      init.type && TYPE_STATUS[init.type]?.(init.status) ? init.type : undefined;
    this.requestId = init.requestId;
    this.retryAfter = init.retryAfter;
    this.wwwAuthenticate = init.wwwAuthenticate;
  }

  /** The access token is inactive: stop using it (Client item 9). */
  get tokenInactive(): boolean {
    return (
      this.status === 401 &&
      /\berror="invalid_token"/.test(this.wwwAuthenticate ?? "")
    );
  }

  /** The RS established that the grant was revoked: stop requests against it (Client item 9). */
  get grantRevoked(): boolean {
    return this.code === "grant_revoked";
  }

  /**
   * The failure shows the grant may have ended (spec-core #reconciliation):
   * 401 `invalid_token`, `grant_revoked`, `grant_expired`,
   * `package_child_inactive`, or `invalid_grant` from the token endpoint.
   * It is never proof of revocation (Client item 9); it only obliges a
   * lifecycle query before further use of held data.
   */
  get grantMayHaveEnded(): boolean {
    return (
      this.tokenInactive ||
      this.code === "grant_revoked" ||
      this.code === "grant_expired" ||
      this.code === "package_child_inactive" ||
      this.code === "invalid_grant"
    );
  }

  /** `Retry-After` in milliseconds (delta-seconds or HTTP-date), if usable. */
  retryAfterMs(now: number = Date.now()): number | undefined {
    if (this.retryAfter === undefined) return undefined;
    const trimmed = this.retryAfter.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
    const at = Date.parse(trimmed);
    return Number.isNaN(at) ? undefined : Math.max(0, at - now);
  }
}

/** Raised when a response breaks the protocol (e.g. a wrong PDPP-Version); its data must not be used. */
export class PdppProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdppProtocolError";
  }
}

/** Build a {@link PdppHttpError} from a non-success response without trusting its body. */
export async function pdppHttpErrorFrom(
  response: Response,
): Promise<PdppHttpError> {
  let code: string | undefined;
  let type: string | undefined;
  let message = `HTTP ${response.status}`;
  try {
    const body: unknown = await response.json();
    const error =
      body && typeof body === "object"
        ? (body as { error?: unknown }).error
        : undefined;
    if (error && typeof error === "object") {
      const e = error as Record<string, unknown>;
      if (typeof e.code === "string") code = e.code;
      if (typeof e.type === "string") type = e.type;
      if (typeof e.message === "string") message = e.message;
    } else if (typeof error === "string") {
      // OAuth error responses (RFC 6749 §5.2) use a string `error`.
      code = error;
      const description = (body as { error_description?: unknown })
        .error_description;
      if (typeof description === "string") message = description;
    }
  } catch {
    // A non-JSON or empty body is still an error with an authoritative status.
  }
  return new PdppHttpError({
    status: response.status,
    code,
    type,
    message,
    requestId: response.headers.get("Request-Id") ?? undefined,
    retryAfter: response.headers.get("Retry-After") ?? undefined,
    wwwAuthenticate: response.headers.get("WWW-Authenticate") ?? undefined,
  });
}
