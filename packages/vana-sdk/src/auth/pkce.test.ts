import { describe, it, expect } from "vitest";
import {
  generatePkceVerifier,
  computePkceChallenge,
  verifyPkceChallenge,
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
});
