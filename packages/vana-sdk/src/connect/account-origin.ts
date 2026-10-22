/**
 * Which Vana Account origin serves the connect sheet.
 *
 * @remarks
 * The sheet origin decides who the person signs in to and who receives the
 * partner's request capability, so it must never come from a pattern the
 * page URL can satisfy. {@link resolveVanaAccountOrigin} returns the
 * environment's Vana Account origin and accepts an override only when the
 * caller switched overrides on and the override is an exact origin from an
 * explicit allowlist. There is deliberately no pattern or wildcard option.
 *
 * Zero-dependency and browser-safe, like the protocol it builds on.
 *
 * @category Connect
 * @module connect/account-origin
 */

import { VANA_ACCOUNT_ORIGINS, type VanaConnectEnv } from "./protocol";

/** Input for {@link resolveVanaAccountOrigin}. */
export interface ResolveVanaAccountOriginInput {
  /** The deployment environment the app talks to. Required: there is no default. */
  env: VanaConnectEnv;
  /**
   * A requested Account origin, typically read from a query parameter on a
   * preview deploy. Untrusted. Ignored unless {@link allowOverride} is true.
   */
  override?: string | null;
  /**
   * Exact `https` origins (`https://host[:port]`, no path, no trailing slash)
   * an override may name. Build it with {@link parseOriginAllowlist}. Entries
   * that are not exact https origins never match.
   */
  previewOrigins?: readonly string[];
  /**
   * Whether this build honours an override at all. Decide it from build-time
   * configuration (a non-production deploy), never from the request. Keep it
   * `false` in production.
   */
  allowOverride: boolean;
  /**
   * Also accept an exact `http` loopback origin (`localhost`, `127.0.0.1`,
   * `[::1]`, any port) without listing it, for a locally run Vana Account.
   * Only applies when {@link allowOverride} is true. Defaults to `false`.
   */
  allowLocal?: boolean;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** DNS labels (punycode included) or a bracketed IPv6 literal; no wildcards. */
const HOSTNAME = /^(?:\[[0-9a-f:.]+\]|[a-z0-9-]+(?:\.[a-z0-9-]+)*)$/;

/** `value` itself when it is a bare origin with `protocol`, else `null`. */
function exactOrigin(
  value: string,
  protocol: "https:" | "http:",
): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  // `url.origin === value` rejects paths, queries, fragments, credentials,
  // trailing slashes and any spelling the URL parser would rewrite.
  return url.protocol === protocol &&
    url.origin === value &&
    HOSTNAME.test(url.hostname)
    ? value
    : null;
}

/**
 * Parse a comma-separated allowlist of exact `https` origins.
 *
 * @remarks
 * Whitespace around entries is trimmed. An entry that is not an exact
 * `https://host[:port]` origin (a path, a trailing slash, `http:`, a
 * wildcard such as `https://*.vercel.app`) is dropped, so a typo narrows
 * the list instead of widening it.
 *
 * @example
 * ```typescript
 * parseOriginAllowlist(process.env.VANA_ACCOUNT_PREVIEW_ORIGINS);
 * // ["https://account-git-my-branch.vercel.app"]
 * ```
 *
 * @param csv - The raw list, for example an environment variable.
 * @returns The exact https origins, deduplicated, in order.
 */
export function parseOriginAllowlist(csv: string | null | undefined): string[] {
  if (!csv) return [];
  const origins: string[] = [];
  for (const entry of csv.split(",")) {
    const origin = exactOrigin(entry.trim(), "https:");
    if (origin && !origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

/**
 * Resolve the Vana Account origin that serves the connect sheet.
 *
 * @remarks
 * Returns `VANA_ACCOUNT_ORIGINS[env]` unless `allowOverride` is true and
 * `override` is exactly one of `previewOrigins` (an `https` origin), or,
 * with `allowLocal`, exactly an `http` loopback origin. Anything else (a
 * path, a different scheme, a near-miss host, a lookalike) falls back to the
 * environment's origin. Matching is exact string equality: no patterns, no
 * suffixes, no normalization that could widen a match.
 *
 * @example
 * ```typescript
 * const accountOrigin = resolveVanaAccountOrigin({
 *   env: "dev",
 *   override: new URLSearchParams(location.search).get("vana_account"),
 *   previewOrigins: parseOriginAllowlist(
 *     process.env.NEXT_PUBLIC_VANA_ACCOUNT_PREVIEW_ORIGINS,
 *   ),
 *   allowOverride: process.env.NEXT_PUBLIC_DEPLOY_ENV === "preview",
 * });
 * ```
 *
 * @param input - Environment, untrusted override, allowlist and switches.
 * @returns A bare Vana Account origin.
 * @throws TypeError when `env` is not `"production"` or `"dev"`.
 */
export function resolveVanaAccountOrigin(
  input: ResolveVanaAccountOriginInput,
): string {
  if (input.env !== "production" && input.env !== "dev") {
    throw new TypeError('env must be "production" or "dev"');
  }
  const fallback: string = VANA_ACCOUNT_ORIGINS[input.env];
  const { override } = input;
  if (input.allowOverride !== true || typeof override !== "string") {
    return fallback;
  }
  const https = exactOrigin(override, "https:");
  if (https && (input.previewOrigins ?? []).includes(https)) {
    return https;
  }
  if (input.allowLocal === true) {
    const local = exactOrigin(override, "http:");
    if (local && LOOPBACK_HOSTS.has(new URL(local).hostname)) {
      return local;
    }
  }
  return fallback;
}
