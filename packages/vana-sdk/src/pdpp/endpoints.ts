/**
 * Endpoint checks for URLs taken from AS or RS metadata (review F7).
 *
 * @remarks
 * Metadata is fetched from a server the owner chose, which may be hostile.
 * Before a token is sent to an endpoint it names, the endpoint must:
 * - use `https` (plain `http` only to a loopback host, and only with `allowLocal`);
 * - sit on the issuer's (or resource's) origin, or on an origin the app lists
 *   in `allowedOrigins`;
 * - not name a loopback, private, link-local, CGNAT or unspecified IP
 *   literal, or `localhost`, unless `allowLocal` is set.
 *
 * Hostnames that resolve to private addresses (DNS rebinding) cannot be
 * detected here without DNS; a server-side app that fetches owner-supplied
 * URLs must also restrict egress at the network layer.
 *
 * Every token-bearing request uses `redirect: "error"`, so a 307/308 cannot
 * replay a token to another host.
 *
 * @category PDPP
 */

import { PdppProtocolError } from "./errors";

export interface PdppEndpointPolicy {
  /** Extra origins endpoints may use (exact `scheme://host[:port]`). */
  allowedOrigins?: string[];
  /** Permit loopback and private hosts, and `http` to loopback (local development). */
  allowLocal?: boolean;
}

/** Fetch options for every request this module family makes. */
export const PDPP_FETCH_REDIRECT: RequestRedirect = "error";

/** Default timeout for AS requests (token, lifecycle, revocation, metadata). */
export const PDPP_REQUEST_TIMEOUT_MS = 30_000;

function isLocalHost(hostname: string): { local: boolean; loopback: boolean } {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return { local: true, loopback: true };
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    const loopback = a === 127;
    const local =
      loopback ||
      a === 0 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127);
    return { local, loopback };
  }
  if (h.includes(":")) {
    const loopback = h === "::1";
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
    if (mapped) return isLocalHost(mapped[1]!);
    const local = loopback || h === "::" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
    return { local, loopback };
  }
  return { local: false, loopback: false };
}

/**
 * Check one endpoint URL against `base` (the issuer or resource identifier)
 * and the policy. Returns the normalized URL; throws {@link PdppProtocolError}.
 */
export function assertPdppEndpoint(
  value: unknown,
  base: string,
  what: string,
  policy: PdppEndpointPolicy = {},
): string {
  if (typeof value !== "string" || value === "") {
    throw new PdppProtocolError(`${what} is missing`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PdppProtocolError(`${what} is not an absolute URL`);
  }
  const host = isLocalHost(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && host.loopback && policy.allowLocal)) {
    throw new PdppProtocolError(`${what} must use https`);
  }
  if (host.local && !policy.allowLocal) {
    throw new PdppProtocolError(`${what} names a local or private host; set allowLocal for development`);
  }
  if (url.username || url.password) {
    throw new PdppProtocolError(`${what} must not carry credentials`);
  }
  const baseOrigin = new URL(base).origin;
  if (url.origin !== baseOrigin && !(policy.allowedOrigins ?? []).includes(url.origin)) {
    throw new PdppProtocolError(`${what} is not on ${baseOrigin} or an allowed origin`);
  }
  return url.toString();
}

/** A timeout signal, when the platform supports one. */
export function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(ms) : undefined;
}
