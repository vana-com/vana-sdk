/**
 * PDPP grant requests and the one scope key they map to.
 *
 * @remarks
 * A builder asks for PDPP data as grants: a registry `source_id` and the
 * streams it wants from that source,
 * `{ source_id: "https://registry.pdpp.dev/sources/chatgpt", streams: ["messages"] }`.
 * Everything downstream (the access request, the signed grant, the gateway,
 * the Personal Server) carries flat scope strings, and a raw URI cannot be
 * one: its `:` collides with the `write:` operation prefix, and `/` and `#`
 * break Personal Server routes and storage paths. So each (source, stream)
 * pair maps to exactly one scope key, `pdpp.<source>.<stream>`, where
 * `<source>` is the last path segment of the `source_id`.
 *
 * The key is an ordinary scope: it passes `ScopeSchema` and the
 * `[operation:]scope` grant-entry grammar unchanged (`write:pdpp.chatgpt.messages`
 * is a write entry), and `pdpp.<source>.*` covers every stream of one source
 * through the usual prefix wildcard. The `pdpp.` namespace keeps these keys
 * apart from legacy `{platform}.{scope}` strings: PDPP's ChatGPT
 * `conversations` stream is not the legacy `chatgpt.conversations` scope, and
 * the gateway keys data by the scope string.
 *
 * The mapping is strict and never slugifies. A `source_id` or stream outside
 * the grammar below throws {@link InvalidPdppGrantError}. This module owns the
 * mapping; other implementations should import it, or test against the
 * vectors in `protocol/fixtures/pdpp-scope-keys.json`.
 *
 * - `source_id`: `^https://registry\.pdpp\.dev/sources/([a-z0-9][a-z0-9_]*)$`
 * - `stream`: `^[a-z0-9][a-z0-9_]*$`
 *
 * Both are matched against the whole string, with no trimming.
 *
 * @category Protocol
 * @module protocol/pdpp-scopes
 */

/** First segment of every PDPP scope key. */
export const PDPP_SCOPE_NAMESPACE = "pdpp";

/** The only `source_id` prefix a PDPP grant may name. */
export const PDPP_SOURCE_ID_PREFIX = "https://registry.pdpp.dev/sources/";

// A segment must start with a letter or digit: ScopeSchema rejects a scope
// segment that starts with `_`, so the key would not be a valid scope.
const SEGMENT = "[a-z0-9][a-z0-9_]*";
const SOURCE_ID_RE = new RegExp(
  `^${PDPP_SOURCE_ID_PREFIX.replace(/[.]/g, "\\.")}(${SEGMENT})$`,
);
const STREAM_RE = new RegExp(`^${SEGMENT}$`);
const KEY_RE = new RegExp(
  `^${PDPP_SCOPE_NAMESPACE}\\.(${SEGMENT})\\.(${SEGMENT})$`,
);

/**
 * What a builder asks for from one PDPP source.
 *
 * @remarks
 * Field names follow PDPP's own wire form (`source_id`), not camelCase, so a
 * grant can be copied from a PDPP manifest as is.
 */
export interface PdppGrant {
  /** Registry URI of the source, e.g. `https://registry.pdpp.dev/sources/chatgpt`. */
  source_id: string;
  /** Streams to request from that source, e.g. `["conversations", "messages"]`. At least one. */
  streams: string[];
}

/** One (source, stream) pair, as recovered from a scope key. */
export interface PdppScopeKeyParts {
  source_id: string;
  stream: string;
}

/** Thrown when a PDPP grant, `source_id` or stream does not fit the grammar. */
export class InvalidPdppGrantError extends Error {
  /** Which part was rejected. */
  readonly field: "grants" | "grant" | "source_id" | "streams" | "stream";
  /** The rejected value, verbatim. */
  readonly value: unknown;

  constructor(
    field: InvalidPdppGrantError["field"],
    value: unknown,
    reason: string,
  ) {
    super(
      `Invalid PDPP ${field}${typeof value === "string" ? ` ${JSON.stringify(value)}` : ""}: ${reason}`,
    );
    this.name = "InvalidPdppGrantError";
    this.field = field;
    this.value = value;
  }
}

function sourceSegment(sourceId: string): string {
  const raw: unknown = sourceId;
  const match = typeof raw === "string" ? SOURCE_ID_RE.exec(raw) : null;
  if (!match) {
    throw new InvalidPdppGrantError(
      "source_id",
      raw,
      `must be ${PDPP_SOURCE_ID_PREFIX}<source> where <source> is lowercase letters, digits and underscores, not starting with an underscore`,
    );
  }
  return match[1];
}

function assertStream(stream: string): void {
  const raw: unknown = stream;
  if (typeof raw !== "string" || !STREAM_RE.test(raw)) {
    throw new InvalidPdppGrantError(
      "stream",
      raw,
      "must be lowercase letters, digits and underscores, not starting with an underscore",
    );
  }
}

/**
 * The scope key for one stream of one PDPP source.
 *
 * @example
 * ```ts
 * pdppScopeKey("https://registry.pdpp.dev/sources/chatgpt", "messages");
 * // "pdpp.chatgpt.messages"
 * ```
 *
 * @param source_id - Registry URI of the source.
 * @param stream - Stream name.
 * @returns `pdpp.<source>.<stream>`.
 * @throws InvalidPdppGrantError when either input does not fit the grammar.
 */
export function pdppScopeKey(source_id: string, stream: string): string {
  const source = sourceSegment(source_id);
  assertStream(stream);
  return `${PDPP_SCOPE_NAMESPACE}.${source}.${stream}`;
}

/**
 * Inverse of {@link pdppScopeKey}.
 *
 * @param key - A scope string. Wildcards (`pdpp.chatgpt.*`) and grant entries
 * with an operation prefix (`write:pdpp.chatgpt.messages`) are not keys.
 * @returns The `source_id` and stream, or `null` when `key` is not a PDPP key.
 */
export function parsePdppScopeKey(key: string): PdppScopeKeyParts | null {
  const raw: unknown = key;
  const match = typeof raw === "string" ? KEY_RE.exec(raw) : null;
  if (!match) return null;
  return { source_id: `${PDPP_SOURCE_ID_PREFIX}${match[1]}`, stream: match[2] };
}

/**
 * Is `key` a PDPP scope key?
 *
 * @param key - A scope string.
 * @returns `true` when {@link parsePdppScopeKey} would parse it.
 */
export function isPdppScopeKey(key: string): boolean {
  return parsePdppScopeKey(key) !== null;
}

/**
 * The scope keys for a list of PDPP grants: one per stream, in grant order,
 * without duplicates.
 *
 * @param grants - The grants a builder requests.
 * @returns The derived scope keys (empty for no grants).
 * @throws InvalidPdppGrantError when a grant is malformed, names no streams,
 * or has a `source_id` or stream outside the grammar.
 */
export function pdppGrantsToScopes(grants: readonly PdppGrant[]): string[] {
  const raw: unknown = grants;
  if (!Array.isArray(raw)) {
    throw new InvalidPdppGrantError("grants", raw, "must be an array");
  }
  const keys = new Set<string>();
  for (const grant of raw as unknown[]) {
    if (grant === null || typeof grant !== "object") {
      throw new InvalidPdppGrantError("grant", grant, "must be an object");
    }
    const { source_id: sourceId, streams } = grant as Partial<PdppGrant>;
    if (!Array.isArray(streams) || streams.length === 0) {
      throw new InvalidPdppGrantError(
        "streams",
        streams,
        `must name at least one stream${typeof sourceId === "string" ? ` for ${sourceId}` : ""}`,
      );
    }
    for (const stream of streams) {
      keys.add(pdppScopeKey(sourceId as string, stream));
    }
  }
  return [...keys];
}

/**
 * The scope entries one request asks for: legacy `scopes` and the keys
 * derived from `grants`.
 *
 * @remarks
 * Legacy scopes come first and pass through verbatim (order and duplicates
 * included, so a request without grants is byte-for-byte what it was before
 * grants existed). Derived keys follow, minus any already present.
 *
 * @param input - `grants` (structured) and/or legacy `scopes`
 * (`[operation:]scope` entries).
 * @returns The scope entries to request.
 * @throws InvalidPdppGrantError when a grant does not fit the grammar.
 */
export function grantRequestScopes(input: {
  grants?: readonly PdppGrant[];
  scopes?: readonly string[];
}): string[] {
  const legacy = [...(input.scopes ?? [])];
  const present = new Set(legacy);
  const derived = pdppGrantsToScopes(input.grants ?? []).filter(
    (key) => !present.has(key),
  );
  return [...legacy, ...derived];
}
