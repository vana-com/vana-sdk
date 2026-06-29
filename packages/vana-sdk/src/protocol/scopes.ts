import { z } from "zod";

// The source_id (first segment) must stay lowercase. Tail segments may keep
// the historical camelCase form the contract-freeze spec explicitly preserves
// (e.g. spotify.savedTracks, youtube.playlistItems) — the chain never validates
// scope strings, so the SDK must not be stricter than the protocol.
const SOURCE_RE = /^[a-z0-9][a-z0-9_]*$/;
const TAIL_SEGMENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9_]*$/;

export const ScopeSchema = z.string().refine(
  (scope) => {
    const parts = scope.split(".");
    if (parts.length < 2 || parts.length > 3) return false;
    const [source, ...tail] = parts;
    return (
      SOURCE_RE.test(source) && tail.every((part) => TAIL_SEGMENT_RE.test(part))
    );
  },
  {
    message:
      "Scope must be {source}.{category}[.{subcategory}]; source lowercase, tail may keep the historical camelCase form (e.g. spotify.savedTracks)",
  },
);

export type Scope = z.infer<typeof ScopeSchema>;

export interface ParsedScope {
  source: string;
  category: string;
  subcategory?: string;
  raw: string;
}

export function parseScope(scope: string): ParsedScope {
  const validated = ScopeSchema.parse(scope);
  const parts = validated.split(".");
  return {
    source: parts[0],
    category: parts[1],
    subcategory: parts[2],
    raw: validated,
  };
}

export function scopeToPathSegments(scope: string): string[] {
  const parsed = parseScope(scope);
  const segments = [parsed.source, parsed.category];
  if (parsed.subcategory) {
    segments.push(parsed.subcategory);
  }
  return segments;
}

export function scopeMatchesPattern(
  requestedScope: string,
  grantPattern: string,
): boolean {
  if (grantPattern === "*") return true;

  if (grantPattern.endsWith(".*")) {
    const prefix = grantPattern.slice(0, -1);
    return requestedScope.startsWith(prefix);
  }

  return requestedScope === grantPattern;
}

export function scopeCoveredByGrant(
  requestedScope: string,
  grantedScopes: string[],
): boolean {
  return grantedScopes.some((pattern) =>
    scopeMatchesPattern(requestedScope, pattern),
  );
}
