import { describe, expect, it } from "vitest";
import {
  parseOriginAllowlist,
  resolveVanaAccountOrigin,
} from "./account-origin";
import { VANA_ACCOUNT_ORIGINS } from "./protocol";

const PREVIEW = "https://account-git-feature.vercel.app";

describe("parseOriginAllowlist", () => {
  it("keeps exact https origins, trimmed and deduplicated, in order", () => {
    expect(
      parseOriginAllowlist(
        ` ${PREVIEW} ,https://account-pr-2.example:8443,${PREVIEW}`,
      ),
    ).toEqual([PREVIEW, "https://account-pr-2.example:8443"]);
  });

  it("drops anything that is not an exact https origin, so a typo narrows the list", () => {
    expect(
      parseOriginAllowlist(
        [
          `${PREVIEW}/`,
          `${PREVIEW}/embed`,
          "http://account-git-feature.vercel.app",
          "https://*.vercel.app",
          "*.vercel.app",
          "https://user@account.example",
          "https://ACCOUNT.example",
          "not a url",
          "",
        ].join(","),
      ),
    ).toEqual([]);
  });

  it("is empty for a missing list", () => {
    expect(parseOriginAllowlist(undefined)).toEqual([]);
    expect(parseOriginAllowlist(null)).toEqual([]);
    expect(parseOriginAllowlist("")).toEqual([]);
  });
});

describe("resolveVanaAccountOrigin", () => {
  const preview = { previewOrigins: [PREVIEW] } as const;

  it("returns the environment's Account origin when no override is given", () => {
    expect(
      resolveVanaAccountOrigin({ env: "production", allowOverride: true }),
    ).toBe(VANA_ACCOUNT_ORIGINS.production);
    expect(
      resolveVanaAccountOrigin({
        env: "dev",
        override: null,
        allowOverride: true,
        ...preview,
      }),
    ).toBe(VANA_ACCOUNT_ORIGINS.dev);
  });

  it("ignores even an allowlisted override unless overrides are switched on", () => {
    expect(
      resolveVanaAccountOrigin({
        env: "production",
        override: PREVIEW,
        allowOverride: false,
        ...preview,
      }),
    ).toBe(VANA_ACCOUNT_ORIGINS.production);
    expect(
      resolveVanaAccountOrigin({
        env: "production",
        override: PREVIEW,
        allowOverride: "true" as unknown as boolean,
        ...preview,
      }),
    ).toBe(VANA_ACCOUNT_ORIGINS.production);
  });

  it("honours an override that is exactly an allowlisted https origin", () => {
    expect(
      resolveVanaAccountOrigin({
        env: "dev",
        override: PREVIEW,
        allowOverride: true,
        ...preview,
      }),
    ).toBe(PREVIEW);
  });

  it.each([
    ["an origin not on the list", "https://account-git-other.vercel.app"],
    ["a lookalike suffix", `${PREVIEW}.evil.example`],
    ["a lookalike prefix", "https://evil-account-git-feature.vercel.app"],
    ["a path", `${PREVIEW}/embed/connect`],
    ["a trailing slash", `${PREVIEW}/`],
    ["credentials", "https://evil.example@account-git-feature.vercel.app"],
    ["http on an https entry", "http://account-git-feature.vercel.app"],
    ["a different port", "https://account-git-feature.vercel.app:444"],
    ["uppercase", "https://Account-Git-Feature.vercel.app"],
    ["a script URL", "javascript:alert(1)"],
    ["garbage", "not a url"],
  ])("falls back for %s", (_label, override) => {
    expect(
      resolveVanaAccountOrigin({
        env: "dev",
        override,
        allowOverride: true,
        ...preview,
      }),
    ).toBe(VANA_ACCOUNT_ORIGINS.dev);
  });

  it("never matches an allowlist entry that is not an exact https origin", () => {
    expect(
      resolveVanaAccountOrigin({
        env: "dev",
        override: "http://account.example",
        allowOverride: true,
        previewOrigins: ["http://account.example"],
      }),
    ).toBe(VANA_ACCOUNT_ORIGINS.dev);
    expect(
      resolveVanaAccountOrigin({
        env: "dev",
        override: "https://*.vercel.app",
        allowOverride: true,
        previewOrigins: ["https://*.vercel.app"],
      }),
    ).toBe(VANA_ACCOUNT_ORIGINS.dev);
  });

  it("accepts an http loopback origin only with allowLocal", () => {
    const local = {
      env: "dev" as const,
      override: "http://localhost:3084",
      allowOverride: true,
    };
    expect(resolveVanaAccountOrigin(local)).toBe(VANA_ACCOUNT_ORIGINS.dev);
    expect(resolveVanaAccountOrigin({ ...local, allowLocal: true })).toBe(
      "http://localhost:3084",
    );
    expect(
      resolveVanaAccountOrigin({
        ...local,
        override: "http://127.0.0.1:3084",
        allowLocal: true,
      }),
    ).toBe("http://127.0.0.1:3084");
    expect(
      resolveVanaAccountOrigin({
        ...local,
        override: "http://[::1]:3084",
        allowLocal: true,
      }),
    ).toBe("http://[::1]:3084");
  });

  it.each([
    ["a non-loopback http host", "http://account.example"],
    ["a loopback-looking subdomain", "http://localhost.evil.example"],
    ["a loopback path", "http://localhost:3084/embed"],
  ])("refuses %s even with allowLocal", (_label, override) => {
    expect(
      resolveVanaAccountOrigin({
        env: "dev",
        override,
        allowOverride: true,
        allowLocal: true,
      }),
    ).toBe(VANA_ACCOUNT_ORIGINS.dev);
  });

  it("does not let allowLocal work without allowOverride", () => {
    expect(
      resolveVanaAccountOrigin({
        env: "production",
        override: "http://localhost:3084",
        allowOverride: false,
        allowLocal: true,
      }),
    ).toBe(VANA_ACCOUNT_ORIGINS.production);
  });

  it("refuses an unknown environment instead of guessing one", () => {
    expect(() =>
      resolveVanaAccountOrigin({
        env: "staging" as never,
        allowOverride: false,
      }),
    ).toThrow(TypeError);
    expect(() =>
      resolveVanaAccountOrigin({
        env: "toString" as never,
        allowOverride: false,
      }),
    ).toThrow(TypeError);
  });
});
