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
  const groups = [...a, ...Array<string>(Math.max(0, fill)).fill("0"), ...b].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : undefined;
}

/** Hostname suffixes reserved for local or private use. */
const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan"];

function isLocalHost(hostname: string): { local: boolean; loopback: boolean } {
  // A trailing dot names the same host (review R2-2).
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return { local: true, loopback: true };
  if (LOCAL_SUFFIXES.some((suffix) => h.endsWith(suffix)) || h === "internal") return { local: true, loopback: false };
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
    const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
    const v4 = `${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`;
    // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d), NAT64 (64:ff9b::/96 and 64:ff9b:1::/48).
    if (zeros(0, 5) && (g[5] === 0xffff || g[5] === 0)) {
      if (zeros(0, 7) && (g[7] === 0 || g[7] === 1)) return { local: true, loopback: g[7] === 1 };
      return isLocalHost(v4);
    }
    if (g[0] === 0x64 && g[1] === 0xff9b) return isLocalHost(v4);
    const v4At = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
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
