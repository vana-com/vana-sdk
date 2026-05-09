import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { parseWeb3SignedHeader, verifyWeb3Signed } from "./web3-signed";
import { buildWeb3SignedHeader, computeBodyHash } from "./web3-signed-builder";
import {
  MissingAuthError,
  InvalidSignatureError,
  ExpiredTokenError,
} from "./errors";

const AUD = "http://localhost:8080";
const METHOD = "GET";
const URI = "/v1/data/instagram.profile";

function testWallet(seed = 0) {
  const keyValue = (seed + 1).toString(16).padStart(64, "0");
  const privateKey = `0x${keyValue}` as `0x${string}`;
  return privateKeyToAccount(privateKey);
}

function makeSigner(seed = 0) {
  const wallet = testWallet(seed);
  return {
    address: wallet.address,
    signMessage: (message: string) => wallet.signMessage({ message }),
  };
}

function base64urlEncode(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function buildHeaderWithPayload(
  payload: Record<string, unknown>,
): Promise<string> {
  const signer = makeSigner();
  const payloadBase64 = base64urlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = await signer.signMessage(payloadBase64);
  return `Web3Signed ${payloadBase64}.${signature}`;
}

describe("parseWeb3SignedHeader", () => {
  it("throws MissingAuthError for undefined", () => {
    expect(() => parseWeb3SignedHeader(undefined)).toThrow(MissingAuthError);
  });

  it("throws MissingAuthError for empty string", () => {
    expect(() => parseWeb3SignedHeader("")).toThrow(MissingAuthError);
  });

  it("throws InvalidSignatureError for non-Web3Signed prefix", () => {
    expect(() => parseWeb3SignedHeader("Bearer xyz")).toThrow(
      InvalidSignatureError,
    );
  });

  it("throws InvalidSignatureError for missing dot separator", () => {
    expect(() => parseWeb3SignedHeader("Web3Signed malformed")).toThrow(
      InvalidSignatureError,
    );
  });

  it("parses a valid header correctly", async () => {
    const signer = makeSigner();
    const header = await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: AUD,
      method: METHOD,
      uri: URI,
    });

    const result = parseWeb3SignedHeader(header);
    expect(result.payload.aud).toBe(AUD);
    expect(result.payload.method).toBe(METHOD);
    expect(result.payload.uri).toBe(URI);
    expect(result.signature).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(result.payloadBase64.length).toBeGreaterThan(0);
  });

  it("throws InvalidSignatureError when freshness claims are missing", async () => {
    const header = await buildHeaderWithPayload({
      aud: AUD,
      bodyHash:
        "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      method: METHOD,
      uri: URI,
    });

    expect(() => parseWeb3SignedHeader(header)).toThrow(InvalidSignatureError);
  });

  it("throws InvalidSignatureError when freshness claims are not numbers", async () => {
    const now = Math.floor(Date.now() / 1000);
    const header = await buildHeaderWithPayload({
      aud: AUD,
      bodyHash:
        "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      exp: String(now + 300),
      iat: now,
      method: METHOD,
      uri: URI,
    });

    expect(() => parseWeb3SignedHeader(header)).toThrow(InvalidSignatureError);
  });
});

describe("verifyWeb3Signed", () => {
  it("returns the correct signer for a valid header (round trip)", async () => {
    const signer = makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const header = await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: AUD,
      method: METHOD,
      uri: URI,
      iat: now,
      exp: now + 300,
    });

    const result = await verifyWeb3Signed({
      headerValue: header,
      expectedOrigin: AUD,
      expectedMethod: METHOD,
      expectedPath: URI,
      now,
    });

    expect(result.signer.toLowerCase()).toBe(signer.address.toLowerCase());
    expect(result.payload.aud).toBe(AUD);
  });

  it("throws InvalidSignatureError on audience mismatch", async () => {
    const signer = makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const header = await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: "http://wrong-origin.com",
      method: METHOD,
      uri: URI,
      iat: now,
      exp: now + 300,
    });

    await expect(
      verifyWeb3Signed({
        headerValue: header,
        expectedOrigin: AUD,
        expectedMethod: METHOD,
        expectedPath: URI,
        now,
      }),
    ).rejects.toThrow(InvalidSignatureError);
  });

  it("throws InvalidSignatureError on method mismatch", async () => {
    const signer = makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const header = await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: AUD,
      method: "POST",
      uri: URI,
      iat: now,
      exp: now + 300,
    });

    await expect(
      verifyWeb3Signed({
        headerValue: header,
        expectedOrigin: AUD,
        expectedMethod: METHOD,
        expectedPath: URI,
        now,
      }),
    ).rejects.toThrow(InvalidSignatureError);
  });

  it("throws InvalidSignatureError on URI mismatch", async () => {
    const signer = makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const header = await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: AUD,
      method: METHOD,
      uri: "/v1/data/wrong.scope",
      iat: now,
      exp: now + 300,
    });

    await expect(
      verifyWeb3Signed({
        headerValue: header,
        expectedOrigin: AUD,
        expectedMethod: METHOD,
        expectedPath: URI,
        now,
      }),
    ).rejects.toThrow(InvalidSignatureError);
  });

  it("throws InvalidSignatureError on body hash mismatch when body bytes are provided", async () => {
    const signer = makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const header = await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: AUD,
      method: "PUT",
      uri: URI,
      iat: now,
      exp: now + 300,
      bodyHash:
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    });

    await expect(
      verifyWeb3Signed({
        headerValue: header,
        expectedOrigin: AUD,
        expectedMethod: "PUT",
        expectedPath: URI,
        bodyBytes: new TextEncoder().encode("actual body"),
        now,
      }),
    ).rejects.toThrow(InvalidSignatureError);
  });

  it("verifies body hash when body bytes are provided", async () => {
    const signer = makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const bodyBytes = new TextEncoder().encode("actual body");
    const header = await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: AUD,
      method: "PUT",
      uri: URI,
      iat: now,
      exp: now + 300,
      body: bodyBytes,
    });

    const result = await verifyWeb3Signed({
      headerValue: header,
      expectedOrigin: AUD,
      expectedMethod: "PUT",
      expectedPath: URI,
      bodyBytes,
      now,
    });

    expect(result.signer.toLowerCase()).toBe(signer.address.toLowerCase());
  });

  it("throws ExpiredTokenError for expired token", async () => {
    const signer = makeSigner();
    const pastTime = Math.floor(Date.now() / 1000) - 1000;
    const header = await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: AUD,
      method: METHOD,
      uri: URI,
      iat: pastTime - 300,
      exp: pastTime,
    });

    const now = Math.floor(Date.now() / 1000);
    await expect(
      verifyWeb3Signed({
        headerValue: header,
        expectedOrigin: AUD,
        expectedMethod: METHOD,
        expectedPath: URI,
        now,
      }),
    ).rejects.toThrow(ExpiredTokenError);
  });

  it("throws ExpiredTokenError for future iat beyond skew", async () => {
    const signer = makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const futureIat = now + 600;
    const header = await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: AUD,
      method: METHOD,
      uri: URI,
      iat: futureIat,
      exp: futureIat + 300,
    });

    await expect(
      verifyWeb3Signed({
        headerValue: header,
        expectedOrigin: AUD,
        expectedMethod: METHOD,
        expectedPath: URI,
        now,
      }),
    ).rejects.toThrow(ExpiredTokenError);
  });

  it("preserves grantId in the result payload", async () => {
    const signer = makeSigner();
    const now = Math.floor(Date.now() / 1000);
    const grantId = "test-grant-123";
    const header = await buildWeb3SignedHeader({
      signMessage: signer.signMessage,
      aud: AUD,
      method: METHOD,
      uri: URI,
      iat: now,
      exp: now + 300,
      grantId,
    });

    const result = await verifyWeb3Signed({
      headerValue: header,
      expectedOrigin: AUD,
      expectedMethod: METHOD,
      expectedPath: URI,
      now,
    });

    expect(result.payload.grantId).toBe(grantId);
  });
});

describe("computeBodyHash", () => {
  it("returns the canonical empty-body hash for missing body", () => {
    expect(computeBodyHash(undefined)).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("returns the canonical empty-body hash for empty body", () => {
    expect(computeBodyHash(new Uint8Array())).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashes non-empty bodies", () => {
    const body = new TextEncoder().encode("hello");
    expect(computeBodyHash(body)).toBe(
      "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});
