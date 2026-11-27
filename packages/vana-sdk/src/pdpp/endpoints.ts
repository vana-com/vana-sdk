/**
 * Endpoint checks for URLs taken from AS or RS metadata (review F7).
 *
 * @remarks
 * Metadata is fetched from a server the owner chose, which may be hostile.
 * The `base` of every check is the issuer or resource identifier the app
 * configured itself (its connect target). Before a token is sent to an
 * endpoint, the endpoint must (review NEW-5):
 * - sit on the base's origin (or its `https` upgrade on the same host), or on
 *   an origin the app lists in `allowedOrigins`;
 * - use `https`. Plain `http` is accepted only to a loopback host
 *   (`localhost`, `127.0.0.0/8`, `::1`) or a tailscale CGNAT address
 *   (`100.64.0.0/10`, already encrypted by WireGuard). Any other private or LAN
 *   address (`10/8`, `172.16/12`, `192.168/16`, `.local`, `.lan`, `fd00::/8`, …)
 *   needs `https` unless the app sets `allowInsecureLan`, because tokens would
 *   cross the local network unencrypted;
 * - name a local or private host (loopback, LAN, `.local`, CGNAT/tailscale
 *   `100.64/10`, …) only when it is the base's own host, or when the app sets
 *   `allowLocal`. A Desktop or self-hosted Personal Server on `localhost`,
 *   a LAN address or a tailscale address therefore works when the app names it
 *   as the issuer; a metadata document that points somewhere else on the local
 *   network is refused.
 *
 * Hostnames that resolve to private addresses (DNS rebinding) cannot be
 * detected here without DNS; a server-side app that fetches owner-supplied
 * URLs must also restrict egress at the network layer.
 *
 * Every token-bearing request uses `redirect: "error"`, so a 307/308 cannot
 * replay a token to another host. Metadata fetches carry no token and follow
 * at most 3 redirects on the same host: a path change, or `http` to `https`
 * ({@link fetchPdppMetadata}).
 *
 * @category PDPP
 */

import { PdppProtocolError } from "./errors";

export interface PdppEndpointPolicy {
  /** Extra origins endpoints may use (exact `scheme://host[:port]`). */
  allowedOrigins?: string[];
  /** Also permit local and private hosts other than the base's own host (development). */
  allowLocal?: boolean;
  /**
   * Accept plain `http` to a private or LAN host other than loopback and
   * tailscale. Tokens then cross the local network unencrypted; set it only
   * when the owner chose that setup.
   */
  allowInsecureLan?: boolean;
}

/** Fetch options for every request this module family makes. */
export const PDPP_FETCH_REDIRECT: RequestRedirect = "error";

/** Default timeout for AS requests (token, lifecycle, revocation, metadata). */
export const PDPP_REQUEST_TIMEOUT_MS = 30_000;

/** Parse an IPv6 literal (already normalized by the URL parser) into eight 16-bit groups. */
function ipv6Groups(h: string): number[] | undefined {
  let text = h;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (v4) {
    const parts = v4[1]!.split(".").map(Number);
    text = `${text.slice(0, -v4[1]!.length)}${((parts[0]! << 8) | parts[1]!).toString(16)}:${((parts[2]! << 8) | parts[3]!).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const a = head ? head.split(":") : [];
  const b = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const fill = tail !== undefined ? 8 - a.length - b.length : 0;
  const groups = [
    ...a,
    ...Array<string>(Math.max(0, fill)).fill("0"),
    ...b,
  ].map((g) => parseInt(g, 16));
  return groups.length === 8 &&
    groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)
    ? groups
    : undefined;
}

/** Hostname suffixes reserved for local or private use. */
const LOCAL_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".lan",
];

function isLocalHost(hostname: string): { local: boolean; loopback: boolean } {
  // A trailing dot names the same host (review R2-2).
  const h = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
  if (h === "localhost" || h.endsWith(".localhost"))
    return { local: true, loopback: true };
  if (LOCAL_SUFFIXES.some((suffix) => h.endsWith(suffix)) || h === "internal")
    return { local: true, loopback: false };
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
    const g = ipv6Groups(h);
    if (!g) return { local: true, loopback: false }; // unparseable: fail closed
    const zeros = (from: number, to: number) =>
      g.slice(from, to).every((x) => x === 0);
    const v4 = `${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`;
    // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d), NAT64 (64:ff9b::/96 and 64:ff9b:1::/48).
    if (zeros(0, 5) && (g[5] === 0xffff || g[5] === 0)) {
      if (zeros(0, 7) && (g[7] === 0 || g[7] === 1))
        return { local: true, loopback: g[7] === 1 };
      return isLocalHost(v4);
    }
    if (g[0] === 0x64 && g[1] === 0xff9b) return isLocalHost(v4);
    const v4At = (hi: number, lo: number) =>
      `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    // 6to4 (2002::/16) embeds an IPv4 address in groups 1-2 (review R3-f).
    if (g[0] === 0x2002) {
      const embedded = isLocalHost(v4At(g[1]!, g[2]!));
      if (embedded.local) return { local: true, loopback: false };
    }
    // Teredo (2001:0::/32): server IPv4 in groups 2-3, client IPv4 obfuscated (XOR 0xffff) in groups 6-7.
    if (g[0] === 0x2001 && g[1] === 0) {
      const server = isLocalHost(v4At(g[2]!, g[3]!));
      const client = isLocalHost(v4At(g[6]! ^ 0xffff, g[7]! ^ 0xffff));
      if (server.local || client.local) return { local: true, loopback: false };
    }
    const local =
      (g[0]! & 0xfe00) === 0xfc00 || // unique local
      (g[0]! & 0xffc0) === 0xfe80 || // link-local
      (g[0]! & 0xffc0) === 0xfec0 || // site-local (deprecated)
      (g[0]! & 0xff00) === 0xff00; // multicast
    return { local, loopback: false };
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
  const baseUrl = new URL(base);
  const sameOrigin =
    url.origin === baseUrl.origin ||
    // An http base upgraded to https on the same host (for example after a metadata redirect).
    (baseUrl.protocol === "http:" &&
      url.protocol === "https:" &&
      url.hostname === baseUrl.hostname);
  if (!sameOrigin && !(policy.allowedOrigins ?? []).includes(url.origin)) {
    throw new PdppProtocolError(
      `${what} is not on ${baseUrl.origin} or an allowed origin`,
    );
  }
  const localAllowed = sameOrigin || policy.allowLocal === true;
  if (host.local && !localAllowed) {
    throw new PdppProtocolError(
      `${what} names a local or private host other than the configured one; set allowLocal for development`,
    );
  }
  // Plain http: loopback and tailscale CGNAT only, unless the app allows an insecure LAN.
  const tailnet =
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(
      url.hostname,
    );
  const plainHttpOk =
    host.local &&
    localAllowed &&
    (host.loopback || tailnet || policy.allowInsecureLan === true);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && plainHttpOk)) {
    throw new PdppProtocolError(
      `${what} must use https (plain http only to loopback or a tailscale address, or a LAN host with allowInsecureLan)`,
    );
  }
  if (url.username || url.password) {
    throw new PdppProtocolError(`${what} must not carry credentials`);
  }
  return url.toString();
}

/**
 * Fetch a metadata document. It carries no token, so it may follow up to 3
 * redirects, each on the same host: a path change, or `http` to `https`
 * (review NEW-5). Any other redirect is refused. In a browser, where a manual
 * redirect is opaque, the redirect is followed and the final URL is checked
 * by the same rule.
 */
export async function fetchPdppMetadata(
  url: string,
  fetchImpl: typeof globalThis.fetch | undefined,
  init: RequestInit = {},
): Promise<Response> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  let current = url;
  for (let hop = 0; hop <= 3; hop += 1) {
    const response = await doFetch(current, { ...init, redirect: "manual" });
    if (response.type === "opaqueredirect") {
      const followed = await doFetch(current, { ...init, redirect: "follow" });
      if (followed.url) assertMetadataRedirect(current, followed.url);
      return followed;
    }
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || location === null)
      return response;
    const next = new URL(location, current).toString();
    assertMetadataRedirect(current, next);
    current = next;
  }
  throw new PdppProtocolError("metadata fetch followed too many redirects");
}

function assertMetadataRedirect(from: string, to: string): void {
  const a = new URL(from);
  const b = new URL(to);
  const samePlace = a.protocol === b.protocol && a.host === b.host;
  const upgrade =
    a.protocol === "http:" &&
    b.protocol === "https:" &&
    a.hostname === b.hostname;
  if (!samePlace && !upgrade) {
    throw new PdppProtocolError("metadata redirect leaves the configured host");
  }
}

/**
 * A signal that aborts after `ms`. Uses `AbortSignal.timeout` where present,
 * else a manual `AbortController` and timer (review NEW-7). The timer never
 * keeps a Node process alive.
 */
export function timeoutSignal(ms: number): AbortSignal | undefined {
  if (
    typeof AbortSignal !== "undefined" &&
    typeof (AbortSignal as { timeout?: unknown }).timeout === "function"
  ) {
    return AbortSignal.timeout(ms);
  }
  if (typeof AbortController === "undefined") return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`timed out after ${ms} ms`));
  }, ms);
  (timer as { unref?: () => void }).unref?.();
  return controller.signal;
}

/** Raised when a callee did not settle in time. */
export class PdppTimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly ms: number,
  ) {
    super(`${label} did not finish within ${ms} ms`);
    this.name = "PdppTimeoutError";
  }
}

/**
 * Settle `work` within `ms`, else reject with {@link PdppTimeoutError}. The
 * work itself keeps running; the caller only stops waiting for it.
 */
export async function withTimeout<T>(
  work: T | Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new PdppTimeoutError(label, ms));
        }, ms);
        (timer as { unref?: () => void }).unref?.();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
