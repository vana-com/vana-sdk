import { describe, expect, it } from "vitest";

import vectors from "./fixtures/pdpp-scope-keys.json";
import {
  InvalidPdppGrantError,
  PDPP_SCOPE_NAMESPACE,
  PDPP_SOURCE_ID_PREFIX,
  grantRequestScopes,
  isPdppScopeKey,
  parsePdppScopeKey,
  pdppGrantsToScopes,
  pdppScopeKey,
} from "./pdpp-scopes";
import { ScopeSchema, parseScope, scopeMatchesPattern } from "./scopes";
import {
  formatScopeEntry,
  grantPermissions,
  hasAction,
  parseScopeEntry,
} from "./scope-actions";

const CHATGPT = "https://registry.pdpp.dev/sources/chatgpt";

describe("pdppScopeKey conformance vectors", () => {
  it("exposes the namespace and source prefix the vectors are written in", () => {
    expect(PDPP_SCOPE_NAMESPACE).toBe("pdpp");
    expect(PDPP_SOURCE_ID_PREFIX).toBe("https://registry.pdpp.dev/sources/");
  });

  it.each(vectors.keys)(
    "maps $source_id + $stream to $key",
    ({ source_id, stream, key }) => {
      expect(pdppScopeKey(source_id, stream)).toBe(key);
      expect(parsePdppScopeKey(key)).toEqual({ source_id, stream });
      expect(isPdppScopeKey(key)).toBe(true);
    },
  );

  it.each(vectors.rejectedSourceIds)(
    "rejects source_id $source_id ($why)",
    ({ source_id }) => {
      expect(() => pdppScopeKey(source_id, "messages")).toThrow(
        InvalidPdppGrantError,
      );
    },
  );

  it.each(vectors.rejectedStreams)(
    "rejects stream $stream ($why)",
    ({ stream }) => {
      expect(() => pdppScopeKey(CHATGPT, stream)).toThrow(
        InvalidPdppGrantError,
      );
    },
  );

  it.each(vectors.notPdppKeys)("does not parse %j as a PDPP key", (key) => {
    expect(parsePdppScopeKey(key)).toBeNull();
    expect(isPdppScopeKey(key)).toBe(false);
  });

  it("names the field and the value in the error", () => {
    expect(() =>
      pdppScopeKey("https://registry.pdpp.dev/sources/spotify-browser", "x"),
    ).toThrow(
      /source_id "https:\/\/registry\.pdpp\.dev\/sources\/spotify-browser"/,
    );
    expect(() => pdppScopeKey(CHATGPT, "Messages")).toThrow(
      /stream "Messages"/,
    );
    try {
      pdppScopeKey(CHATGPT, "a-b");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPdppGrantError);
      expect((error as InvalidPdppGrantError).field).toBe("stream");
      expect((error as InvalidPdppGrantError).value).toBe("a-b");
    }
  });

  it("rejects non-string input from untyped callers", () => {
    expect(() => pdppScopeKey(42 as unknown as string, "x")).toThrow(
      InvalidPdppGrantError,
    );
    expect(() => pdppScopeKey(CHATGPT, null as unknown as string)).toThrow(
      InvalidPdppGrantError,
    );
    expect(parsePdppScopeKey(42 as unknown as string)).toBeNull();
  });
});

describe("PDPP keys against the existing scope grammar", () => {
  it.each(vectors.keys)("$key passes ScopeSchema unchanged", ({ key }) => {
    expect(ScopeSchema.safeParse(key).success).toBe(true);
    expect(parseScope(key)).toMatchObject({ source: "pdpp", raw: key });
  });

  it.each(vectors.keys)(
    "$key round-trips the grant-entry grammar for read and write",
    ({ key }) => {
      expect(parseScopeEntry(key)).toEqual({ scope: key, action: "read" });
      const write = formatScopeEntry({ scope: key, action: "write" });
      expect(write).toBe(`write:${key}`);
      expect(parseScopeEntry(write)).toEqual({ scope: key, action: "write" });
      expect(grantPermissions([key, write])).toEqual([
        { scope: key, actions: ["read", "write"] },
      ]);
    },
  );

  it("matches pdpp.<source>.* through the existing prefix wildcard", () => {
    const pattern = "pdpp.chatgpt.*";
    expect(scopeMatchesPattern("pdpp.chatgpt.conversations", pattern)).toBe(
      true,
    );
    expect(scopeMatchesPattern("pdpp.chatgpt.messages", pattern)).toBe(true);
    expect(scopeMatchesPattern("pdpp.claude.conversations", pattern)).toBe(
      false,
    );
    // The legacy scope of the same name is a different scope.
    expect(scopeMatchesPattern("chatgpt.conversations", pattern)).toBe(false);
    expect(scopeMatchesPattern("pdpp.chatgpt.conversations", "chatgpt.*")).toBe(
      false,
    );
    // A source whose name extends another's is not covered by it.
    expect(scopeMatchesPattern("pdpp.chatgpt_plus.messages", pattern)).toBe(
      false,
    );
    expect(hasAction([pattern], "pdpp.chatgpt.messages", "read")).toBe(true);
    expect(hasAction([pattern], "pdpp.chatgpt.messages", "write")).toBe(false);
  });
});

describe("pdppGrantsToScopes", () => {
  it("derives one key per stream, in grant order, without duplicates", () => {
    expect(
      pdppGrantsToScopes([
        { source_id: CHATGPT, streams: ["conversations", "messages"] },
        {
          source_id: "https://registry.pdpp.dev/sources/claude",
          streams: ["projects"],
        },
        { source_id: CHATGPT, streams: ["messages"] },
      ]),
    ).toEqual([
      "pdpp.chatgpt.conversations",
      "pdpp.chatgpt.messages",
      "pdpp.claude.projects",
    ]);
  });

  it("returns nothing for no grants", () => {
    expect(pdppGrantsToScopes([])).toEqual([]);
  });

  it("rejects a grant with no streams", () => {
    expect(() =>
      pdppGrantsToScopes([{ source_id: CHATGPT, streams: [] }]),
    ).toThrow(InvalidPdppGrantError);
  });

  it("rejects malformed grants from untyped callers", () => {
    for (const grants of [
      null,
      "pdpp.chatgpt.messages",
      [null],
      [{ source_id: CHATGPT }],
      [{ source_id: CHATGPT, streams: "messages" }],
      [{ sourceId: CHATGPT, streams: ["messages"] }],
    ]) {
      expect(
        () => pdppGrantsToScopes(grants as never),
        JSON.stringify(grants),
      ).toThrow(InvalidPdppGrantError);
    }
  });

  it("rejects an invalid stream instead of slugifying it", () => {
    expect(() =>
      pdppGrantsToScopes([{ source_id: CHATGPT, streams: ["Saved-Items"] }]),
    ).toThrow(/stream "Saved-Items"/);
  });
});

describe("grantRequestScopes", () => {
  it("passes legacy scopes through verbatim when there are no grants", () => {
    const scopes = ["oura.sleep", "oura.sleep", "write:coach.weekly"];
    expect(grantRequestScopes({ scopes })).toEqual(scopes);
    expect(grantRequestScopes({ scopes, grants: [] })).toEqual(scopes);
  });

  it("derives the keys when only grants are given", () => {
    expect(
      grantRequestScopes({
        grants: [{ source_id: CHATGPT, streams: ["conversations"] }],
      }),
    ).toEqual(["pdpp.chatgpt.conversations"]);
  });

  it("is the union of legacy scopes and derived keys when both are given", () => {
    expect(
      grantRequestScopes({
        scopes: ["chatgpt.conversations", "pdpp.chatgpt.messages"],
        grants: [
          { source_id: CHATGPT, streams: ["conversations", "messages"] },
        ],
      }),
    ).toEqual([
      "chatgpt.conversations",
      "pdpp.chatgpt.messages",
      "pdpp.chatgpt.conversations",
    ]);
  });

  it("returns nothing when neither is given", () => {
    expect(grantRequestScopes({})).toEqual([]);
  });
});
