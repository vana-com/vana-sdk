import { describe, it, expect } from "vitest";
import {
  generatePkceVerifier,
  computePkceChallenge,
  verifyPkceChallenge,
  assertValidPkceVerifier,
  PKCE_VERIFIER_PATTERN,
  PKCE_CHALLENGE_PATTERN,
} from "./pkce";

const RFC_VERIFIER_ALPHABET_RE = /^[A-Za-z0-9\-._~]+$/;

describe("generatePkceVerifier", () => {
  it("returns a 64-character string by default", () => {
    const v = generatePkceVerifier();
    expect(v).toHaveLength(64);
  });

  it("produces only RFC 7636 unreserved characters", () => {
    for (let i = 0; i < 50; i++) {
      const v = generatePkceVerifier();
      expect(v).toMatch(RFC_VERIFIER_ALPHABET_RE);
    }
  });

  it("produces different output on consecutive calls", () => {
    const a = generatePkceVerifier();
    const b = generatePkceVerifier();
    expect(a).not.toBe(b);
  });

  it("honours custom lengths within the RFC range", () => {
    expect(generatePkceVerifier(43)).toHaveLength(43);
    expect(generatePkceVerifier(128)).toHaveLength(128);
  });

  it("rejects lengths outside the RFC range", () => {
    expect(() => generatePkceVerifier(42)).toThrow(RangeError);
    expect(() => generatePkceVerifier(129)).toThrow(RangeError);
    expect(() => generatePkceVerifier(64.5)).toThrow(RangeError);
  });
});

describe("computePkceChallenge", () => {
  // RFC 7636 §4.2 test vector
  const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("matches the RFC 7636 §4.2 test vector", async () => {
    const challenge = await computePkceChallenge(RFC_VERIFIER);
    expect(challenge).toBe(RFC_CHALLENGE);
  });

  it("produces base64url output without padding", async () => {
    const challenge = await computePkceChallenge(RFC_VERIFIER);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toContain("=");
  });

  it("rejects verifiers shorter than 43 chars", async () => {
    await expect(computePkceChallenge("a".repeat(42))).rejects.toThrow(
      RangeError,
    );
  });

  it("rejects verifiers longer than 128 chars", async () => {
    await expect(computePkceChallenge("a".repeat(129))).rejects.toThrow(
      RangeError,
    );
  });

  it("rejects verifiers with non-RFC characters", async () => {
    await expect(
      computePkceChallenge(`bad chars and space ${"a".repeat(40)}`),
    ).rejects.toThrow(RangeError);
    await expect(
      computePkceChallenge(`unicode-é-${"a".repeat(40)}`),
    ).rejects.toThrow(RangeError);
    await expect(
      computePkceChallenge(`plus+sign+${"a".repeat(40)}`),
    ).rejects.toThrow(RangeError);
  });
});

describe("verifyPkceChallenge", () => {
  const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("returns true for a matching verifier/challenge pair", async () => {
    await expect(
      verifyPkceChallenge(RFC_VERIFIER, RFC_CHALLENGE),
    ).resolves.toBe(true);
  });

  it("returns false on mismatch", async () => {
    await expect(
      verifyPkceChallenge(RFC_VERIFIER, "wrong-challenge"),
    ).resolves.toBe(false);
    await expect(
      verifyPkceChallenge(
        "not-the-verifier-but-long-enough-padding-padding",
        RFC_CHALLENGE,
      ),
    ).resolves.toBe(false);
  });

  it("round-trips a freshly generated verifier", async () => {
    const verifier = generatePkceVerifier();
    const challenge = await computePkceChallenge(verifier);
    await expect(verifyPkceChallenge(verifier, challenge)).resolves.toBe(true);
  });

  it("returns false (does not throw) for malformed verifiers", async () => {
    await expect(verifyPkceChallenge("short", RFC_CHALLENGE)).resolves.toBe(
      false,
    );
    await expect(
      verifyPkceChallenge(`unicode-é-${"a".repeat(40)}`, RFC_CHALLENGE),
    ).resolves.toBe(false);
    await expect(
      verifyPkceChallenge("a".repeat(129), RFC_CHALLENGE),
    ).resolves.toBe(false);
  });

  it("returns false (does not throw) for malformed challenges", async () => {
    await expect(verifyPkceChallenge(RFC_VERIFIER, "")).resolves.toBe(false);
    await expect(
      verifyPkceChallenge(RFC_VERIFIER, "a".repeat(42)),
    ).resolves.toBe(false);
    await expect(
      verifyPkceChallenge(RFC_VERIFIER, "a".repeat(44)),
    ).resolves.toBe(false);
    await expect(
      verifyPkceChallenge(RFC_VERIFIER, `unicode-é-${"a".repeat(34)}`),
    ).resolves.toBe(false);
    await expect(
      verifyPkceChallenge(RFC_VERIFIER, `padded-with-eq=${"a".repeat(28)}`),
    ).resolves.toBe(false);
  });
});

describe("validation primitives", () => {
  it("PKCE_VERIFIER_PATTERN matches RFC 7636 §4.1 shape", () => {
    expect(PKCE_VERIFIER_PATTERN.test("a".repeat(43))).toBe(true);
    expect(PKCE_VERIFIER_PATTERN.test("a".repeat(128))).toBe(true);
    expect(PKCE_VERIFIER_PATTERN.test("a".repeat(42))).toBe(false);
    expect(PKCE_VERIFIER_PATTERN.test("a".repeat(129))).toBe(false);
    expect(PKCE_VERIFIER_PATTERN.test(`a${"a".repeat(40)}é${"a"}`)).toBe(false);
  });

  it("PKCE_CHALLENGE_PATTERN matches S256 base64url shape (43 chars)", () => {
    expect(PKCE_CHALLENGE_PATTERN.test("a".repeat(43))).toBe(true);
    expect(
      PKCE_CHALLENGE_PATTERN.test(
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      ),
    ).toBe(true);
    expect(PKCE_CHALLENGE_PATTERN.test("a".repeat(42))).toBe(false);
    expect(PKCE_CHALLENGE_PATTERN.test("a".repeat(44))).toBe(false);
    expect(PKCE_CHALLENGE_PATTERN.test(`${"a".repeat(42)}=`)).toBe(false);
  });

  it("assertValidPkceVerifier accepts valid verifiers and throws on invalid", () => {
    expect(() => {
      assertValidPkceVerifier("a".repeat(43));
    }).not.toThrow();
    expect(() => {
      assertValidPkceVerifier("a".repeat(42));
    }).toThrow(RangeError);
    expect(() => {
      assertValidPkceVerifier(`unicode-é-${"a".repeat(40)}`);
    }).toThrow(RangeError);
  });
});
