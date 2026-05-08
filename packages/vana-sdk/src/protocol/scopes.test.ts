import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  parseScope,
  scopeCoveredByGrant,
  scopeMatchesPattern,
  scopeToPathSegments,
} from "./scopes";

describe("parseScope", () => {
  it("parses two-segment scopes", () => {
    expect(parseScope("instagram.profile")).toEqual({
      source: "instagram",
      category: "profile",
      raw: "instagram.profile",
    });
  });

  it("parses three-segment scopes", () => {
    expect(parseScope("chatgpt.conversations.shared")).toEqual({
      source: "chatgpt",
      category: "conversations",
      subcategory: "shared",
      raw: "chatgpt.conversations.shared",
    });
  });

  it("allows underscores and digits", () => {
    expect(parseScope("youtube.watch_history").category).toBe("watch_history");
    expect(parseScope("test.dpv1.260130").subcategory).toBe("260130");
  });

  it("rejects invalid scope shapes", () => {
    expect(() => parseScope("a")).toThrow(ZodError);
    expect(() => parseScope("a.b.c.d")).toThrow(ZodError);
    expect(() => parseScope("Instagram.Profile")).toThrow(ZodError);
  });
});

describe("scopeToPathSegments", () => {
  it("converts a scope to path segments", () => {
    expect(scopeToPathSegments("chatgpt.conversations.shared")).toEqual([
      "chatgpt",
      "conversations",
      "shared",
    ]);
  });
});

describe("scope matching", () => {
  it("matches exact, wildcard, and source prefix grants", () => {
    expect(scopeMatchesPattern("instagram.profile", "instagram.profile")).toBe(
      true,
    );
    expect(scopeMatchesPattern("instagram.profile", "instagram.*")).toBe(true);
    expect(scopeMatchesPattern("instagram.profile", "*")).toBe(true);
  });

  it("does not match unrelated or over-specific grants", () => {
    expect(scopeMatchesPattern("instagram.profile", "twitter.*")).toBe(false);
    expect(scopeMatchesPattern("instagram.profile", "instagram.likes")).toBe(
      false,
    );
    expect(
      scopeMatchesPattern("instagram.profile", "instagram.profile.detail"),
    ).toBe(false);
  });

  it("checks a granted scope list", () => {
    expect(
      scopeCoveredByGrant("instagram.profile", ["twitter.*", "instagram.*"]),
    ).toBe(true);
    expect(
      scopeCoveredByGrant("instagram.profile", ["twitter.*", "facebook.*"]),
    ).toBe(false);
    expect(scopeCoveredByGrant("instagram.profile", [])).toBe(false);
  });
});
