import { describe, expect, it } from "vitest";

import {
  InvalidScopeEntryError,
  SCOPE_ACTIONS,
  formatScopeEntry,
  grantPermissions,
  hasAction,
  parseScopeEntry,
  permissionsToScopes,
  tryGrantPermissions,
  type GrantPermission,
} from "./scope-actions";
import { scopeCoveredByGrant, scopeMatchesPattern } from "./scopes";

describe("parseScopeEntry", () => {
  it("treats a bare entry as read", () => {
    expect(parseScopeEntry("notes.entries")).toEqual({
      scope: "notes.entries",
      action: "read",
    });
    expect(parseScopeEntry("chatgpt.*")).toEqual({
      scope: "chatgpt.*",
      action: "read",
    });
    expect(parseScopeEntry("*")).toEqual({ scope: "*", action: "read" });
  });

  it("parses the write prefix", () => {
    expect(parseScopeEntry("write:notes.entries")).toEqual({
      scope: "notes.entries",
      action: "write",
    });
    expect(parseScopeEntry("write:chatgpt.*")).toEqual({
      scope: "chatgpt.*",
      action: "write",
    });
    expect(parseScopeEntry("write:*")).toEqual({ scope: "*", action: "write" });
  });

  it("keeps the historical camelCase scope tail intact", () => {
    expect(parseScopeEntry("write:spotify.savedTracks").scope).toBe(
      "spotify.savedTracks",
    );
  });

  it("rejects unknown operations instead of treating them as read", () => {
    for (const entry of [
      "delete:notes.entries", // reserved, not implemented
      "read:notes.entries", // read is implicit, never written out
      "admin:notes.entries",
      "*:notes.entries", // no wildcard over operations
      ":notes.entries", // empty operation
    ]) {
      expect(() => parseScopeEntry(entry)).toThrow(InvalidScopeEntryError);
    }
  });

  it("is case sensitive on the operation", () => {
    expect(() => parseScopeEntry("WRITE:notes.entries")).toThrow(
      InvalidScopeEntryError,
    );
    expect(() => parseScopeEntry("Write:notes.entries")).toThrow(
      InvalidScopeEntryError,
    );
  });

  it("rejects whitespace around the operation", () => {
    expect(() => parseScopeEntry(" write:notes.entries")).toThrow(
      InvalidScopeEntryError,
    );
    expect(() => parseScopeEntry("write :notes.entries")).toThrow(
      InvalidScopeEntryError,
    );
  });

  it("rejects an empty scope part", () => {
    expect(() => parseScopeEntry("")).toThrow(InvalidScopeEntryError);
    expect(() => parseScopeEntry("write:")).toThrow(InvalidScopeEntryError);
  });

  it("rejects a second separator inside the scope part", () => {
    expect(() => parseScopeEntry("write:a:b")).toThrow(InvalidScopeEntryError);
    expect(() => parseScopeEntry("write:write:notes.entries")).toThrow(
      InvalidScopeEntryError,
    );
  });

  it("reports the offending entry on the error", () => {
    let caught: unknown;
    try {
      parseScopeEntry("delete:notes.entries");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidScopeEntryError);
    expect((caught as InvalidScopeEntryError).entry).toBe(
      "delete:notes.entries",
    );
    expect((caught as InvalidScopeEntryError).message).toContain("delete");
  });
});

describe("formatScopeEntry", () => {
  it("writes read entries without a prefix", () => {
    expect(formatScopeEntry({ scope: "notes.entries", action: "read" })).toBe(
      "notes.entries",
    );
  });

  it("writes write entries with the write prefix", () => {
    expect(formatScopeEntry({ scope: "notes.entries", action: "write" })).toBe(
      "write:notes.entries",
    );
    expect(formatScopeEntry({ scope: "chatgpt.*", action: "write" })).toBe(
      "write:chatgpt.*",
    );
  });

  it("rejects a scope that would be ambiguous on the wire", () => {
    expect(() => formatScopeEntry({ scope: "", action: "read" })).toThrow(
      InvalidScopeEntryError,
    );
    expect(() =>
      formatScopeEntry({ scope: "write:notes.entries", action: "read" }),
    ).toThrow(InvalidScopeEntryError);
  });

  it("fails closed on an action the grammar does not define", () => {
    expect(() =>
      formatScopeEntry({
        scope: "notes.entries",
        // Untyped (JS) callers can pass anything; it must never format as read.
        action: "delete" as unknown as "read",
      }),
    ).toThrow(InvalidScopeEntryError);
  });

  it("is the inverse of parseScopeEntry", () => {
    for (const entry of [
      "notes.entries",
      "write:notes.entries",
      "chatgpt.*",
      "write:chatgpt.*",
      "*",
      "write:*",
      "spotify.savedTracks",
    ]) {
      expect(formatScopeEntry(parseScopeEntry(entry))).toBe(entry);
    }
  });
});

describe("grantPermissions", () => {
  it("groups entries per scope with actions in canonical order", () => {
    expect(
      grantPermissions([
        "write:notes.entries",
        "chatgpt.*",
        "notes.entries",
        "write:chatgpt.*",
      ]),
    ).toEqual([
      { scope: "chatgpt.*", actions: ["read", "write"] },
      { scope: "notes.entries", actions: ["read", "write"] },
    ]);
  });

  it("orders scopes deterministically regardless of input order", () => {
    const a = grantPermissions(["b.x", "a.x", "write:c.x"]);
    const b = grantPermissions(["write:c.x", "a.x", "b.x"]);
    expect(a).toEqual(b);
    expect(a.map((p) => p.scope)).toEqual(["a.x", "b.x", "c.x"]);
  });

  it("drops duplicate entries", () => {
    expect(
      grantPermissions([
        "notes.entries",
        "notes.entries",
        "write:notes.entries",
        "write:notes.entries",
      ]),
    ).toEqual([{ scope: "notes.entries", actions: ["read", "write"] }]);
  });

  it("returns an empty list for an empty grant", () => {
    expect(grantPermissions([])).toEqual([]);
  });

  it("does not treat an exact scope and its wildcard as the same row", () => {
    expect(grantPermissions(["notes.entries", "write:notes.*"])).toEqual([
      { scope: "notes.*", actions: ["write"] },
      { scope: "notes.entries", actions: ["read"] },
    ]);
  });

  it("fails closed on an entry with an unknown operation", () => {
    expect(() =>
      grantPermissions(["notes.entries", "delete:notes.entries"]),
    ).toThrow(InvalidScopeEntryError);
  });
});

describe("tryGrantPermissions", () => {
  it("returns the grouped view for a well-formed grant", () => {
    expect(tryGrantPermissions(["write:notes.entries"])).toEqual([
      { scope: "notes.entries", actions: ["write"] },
    ]);
  });

  it("returns undefined rather than a narrower view when an entry is unknown", () => {
    expect(
      tryGrantPermissions(["notes.entries", "delete:notes.entries"]),
    ).toBeUndefined();
  });
});

describe("permissionsToScopes", () => {
  it("flattens permissions into wire entries, read before write", () => {
    expect(
      permissionsToScopes([
        { scope: "notes.entries", actions: ["write", "read"] },
        { scope: "chatgpt.*", actions: ["write"] },
      ]),
    ).toEqual(["write:chatgpt.*", "notes.entries", "write:notes.entries"]);
  });

  it("merges repeated scopes and drops duplicate actions", () => {
    expect(
      permissionsToScopes([
        { scope: "notes.entries", actions: ["read"] },
        { scope: "notes.entries", actions: ["read", "write"] },
      ]),
    ).toEqual(["notes.entries", "write:notes.entries"]);
  });

  it("emits nothing for a row with no actions", () => {
    expect(
      permissionsToScopes([{ scope: "notes.entries", actions: [] }]),
    ).toEqual([]);
  });

  it("fails closed on an action the grammar does not define", () => {
    expect(() =>
      permissionsToScopes([
        {
          scope: "notes.entries",
          actions: ["delete" as unknown as "read"],
        },
      ]),
    ).toThrow(InvalidScopeEntryError);
  });

  it("round-trips: scopes -> permissions -> scopes is canonical and stable", () => {
    const scopes = [
      "write:notes.entries",
      "notes.entries",
      "chatgpt.*",
      "notes.entries",
      "write:chatgpt.*",
      "*",
    ];
    const once = permissionsToScopes(grantPermissions(scopes));
    expect(once).toEqual([
      "*",
      "chatgpt.*",
      "write:chatgpt.*",
      "notes.entries",
      "write:notes.entries",
    ]);
    expect(permissionsToScopes(grantPermissions(once))).toEqual(once);
    // Same authority as the input, entry for entry.
    expect(new Set(once)).toEqual(new Set(scopes));
  });

  it("round-trips: permissions -> scopes -> permissions is canonical and stable", () => {
    const permissions: GrantPermission[] = [
      { scope: "notes.entries", actions: ["write", "read"] },
      { scope: "chatgpt.*", actions: ["write"] },
      { scope: "notes.entries", actions: ["read"] },
    ];
    const once = grantPermissions(permissionsToScopes(permissions));
    expect(once).toEqual([
      { scope: "chatgpt.*", actions: ["write"] },
      { scope: "notes.entries", actions: ["read", "write"] },
    ]);
    expect(grantPermissions(permissionsToScopes(once))).toEqual(once);
  });
});

describe("hasAction", () => {
  it("matches the action exactly and the scope through the wildcard matcher", () => {
    const scopes = ["notes.entries", "write:chatgpt.*"];
    expect(hasAction(scopes, "notes.entries", "read")).toBe(true);
    expect(hasAction(scopes, "notes.entries", "write")).toBe(false);
    expect(hasAction(scopes, "chatgpt.conversations", "write")).toBe(true);
    expect(hasAction(scopes, "chatgpt.conversations", "read")).toBe(false);
    expect(hasAction(scopes, "notes.other", "read")).toBe(false);
  });

  it("read and write never cross", () => {
    expect(hasAction(["write:notes.entries"], "notes.entries", "read")).toBe(
      false,
    );
    expect(hasAction(["notes.*"], "notes.entries", "write")).toBe(false);
    expect(hasAction(["*"], "notes.entries", "write")).toBe(false);
    expect(hasAction(["write:*"], "notes.entries", "read")).toBe(false);
  });

  it("skips entries it cannot interpret instead of throwing", () => {
    const scopes = ["delete:notes.entries", "WRITE:notes.entries", "write:"];
    expect(hasAction(scopes, "notes.entries", "read")).toBe(false);
    expect(hasAction(scopes, "notes.entries", "write")).toBe(false);
    expect(
      hasAction([...scopes, "write:notes.entries"], "notes.entries", "write"),
    ).toBe(true);
  });

  it("never lets a prefixed request through, even against a full wildcard", () => {
    expect(hasAction(["*"], "write:notes.entries", "read")).toBe(false);
    expect(hasAction(["write:*"], "write:notes.entries", "write")).toBe(false);
    expect(
      hasAction(["write:notes.entries"], "write:notes.entries", "read"),
    ).toBe(false);
  });

  it("returns false for an empty grant", () => {
    for (const action of SCOPE_ACTIONS) {
      expect(hasAction([], "notes.entries", action)).toBe(false);
    }
  });
});

// Verbatim mirror of the Personal Server write-policy matcher
// (personal-server-ts packages/core/src/policy/data-write.ts). The read side
// there is the SDK's own scopeCoveredByGrant, imported as-is. If either
// policy changes shape, update this copy and the fixtures together - the
// point of this block is that the SDK view and the PS decision can never
// disagree on a grant.
const WRITE_SCOPE_PREFIX = "write:";
function psWriteScopePatterns(grantScopes: readonly string[]): string[] {
  return grantScopes
    .filter((entry) => entry.startsWith(WRITE_SCOPE_PREFIX))
    .map((entry) => entry.slice(WRITE_SCOPE_PREFIX.length))
    .filter((pattern) => pattern.length > 0);
}
function psScopeCoveredByWriteGrant(
  requestedScope: string,
  grantScopes: readonly string[],
): boolean {
  return psWriteScopePatterns(grantScopes).some((pattern) =>
    scopeMatchesPattern(requestedScope, pattern),
  );
}
function psScopeCoveredByReadGrant(
  requestedScope: string,
  grantScopes: readonly string[],
): boolean {
  return scopeCoveredByGrant(requestedScope, [...grantScopes]);
}

describe("hasAction (personal-server parity)", () => {
  // Every grant shape the PS policy tests exercise, plus the edge cases the
  // grammar calls out. Requested scopes are concrete scope ids, which is all
  // the PS ever receives (it validates them with ScopeSchema before matching).
  const grants: readonly (readonly string[])[] = [
    [],
    ["notes.entries"],
    ["write:notes.entries"],
    ["notes.entries", "write:notes.entries"],
    ["notes.*"],
    ["write:notes.*"],
    ["*"],
    ["write:*"],
    ["write:notes.entries", "instagram.profile", "write:chatgpt.*"],
    ["notes.entries", "write:other.scope"],
    ["write:"],
    ["write:", "notes.entries"],
    ["delete:notes.entries"],
    ["delete:notes.entries", "notes.entries"],
    ["read:notes.entries"],
    ["WRITE:notes.entries"],
    ["Write:notes.entries"],
    ["write:write:notes.entries"],
    ["write:a:b"],
    ["notes"],
    ["notes."],
    ["spotify.savedTracks", "write:youtube.playlistItems"],
    ["chatgpt.conversations.shared", "write:chatgpt.conversations.*"],
  ];
  const requested = [
    "notes.entries",
    "notes.other",
    "notes",
    "other.scope",
    "instagram.profile",
    "chatgpt.conversations",
    "chatgpt.conversations.shared",
    "spotify.savedTracks",
    "youtube.playlistItems",
    "a",
    "b",
  ];

  it("agrees with the personal-server-ts read and write policy matchers on every fixture", () => {
    let checked = 0;
    for (const grant of grants) {
      for (const scope of requested) {
        expect(
          hasAction(grant, scope, "write"),
          `write ${scope} against ${JSON.stringify(grant)}`,
        ).toBe(psScopeCoveredByWriteGrant(scope, grant));
        expect(
          hasAction(grant, scope, "read"),
          `read ${scope} against ${JSON.stringify(grant)}`,
        ).toBe(psScopeCoveredByReadGrant(scope, grant));
        checked += 2;
      }
    }
    expect(checked).toBe(grants.length * requested.length * 2);
  });

  it("agrees with the personal-server-ts policy tests on their own cases", () => {
    // From data-write.test.ts: writeScopePatterns / scopeCoveredByWriteGrant.
    expect(hasAction(["write:notes.entries"], "notes.entries", "write")).toBe(
      true,
    );
    expect(
      hasAction(["write:chatgpt.*"], "chatgpt.conversations", "write"),
    ).toBe(true);
    expect(hasAction(["notes.entries"], "notes.entries", "write")).toBe(false);
    expect(hasAction(["notes.*"], "notes.entries", "write")).toBe(false);
    expect(hasAction(["write:"], "notes.entries", "write")).toBe(false);
    // "a write-grant never satisfies the READ policy for the same scope"
    expect(hasAction(["write:notes.entries"], "notes.entries", "read")).toBe(
      false,
    );
    // "rejects when the grant only carries READ scopes for the target"
    expect(
      hasAction(
        ["notes.entries", "write:other.scope"],
        "notes.entries",
        "write",
      ),
    ).toBe(false);
  });
});
