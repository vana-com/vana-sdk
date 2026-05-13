/**
 * Cross-package interop tests: vana-sdk <-> @opendatalabs/personal-server-ts-core.
 *
 * vana-sdk's crypto + auth primitives were ported from personal-server-ts core
 * (PR #137). The port comments say the binary format must remain byte-compatible
 * with PS. This test proves it by running both packages live in the same Node
 * process and asserting that:
 *
 *   1. HKDF deriveMasterKey / deriveScopeKey produce byte-identical output.
 *   2. The MASTER_KEY_MESSAGE constant matches across packages.
 *   3. OpenPGP envelopes round-trip across packages in both directions.
 *   4. Web3Signed headers built by one package verify in the other.
 *
 * Symbol mapping (vana-sdk -> @opendatalabs/personal-server-ts-core):
 *   - deriveMasterKey, deriveScopeKey  -> `/keys`
 *   - encryptWithPassword, decryptWithPassword -> `/storage/encryption`
 *   - verifyWeb3Signed, parseWeb3SignedHeader  -> `/auth`
 *   - buildWeb3SignedHeader (no symmetric PS export) -> emulated via
 *     `createRequestSigner` from `/signing`, which produces the same wire
 *     format and is what PS itself uses for outbound requests.
 *
 * PS does not export `MASTER_KEY_MESSAGE` as a named constant; the string is
 * inlined in `deriveServerOwner`. We assert the SDK constant equals the
 * documented literal value and reuse it via `recoverServerOwner` to confirm
 * agreement at runtime.
 */
import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

// vana-sdk (system under test) — imported via package-internal paths so the
// test exercises the exact code that ships from this package.
import {
  deriveMasterKey as sdkDeriveMasterKey,
  deriveScopeKey as sdkDeriveScopeKey,
  recoverServerOwner as sdkRecoverServerOwner,
  MASTER_KEY_MESSAGE as SDK_MASTER_KEY_MESSAGE,
} from "../crypto/keys/derive";
import {
  encryptWithPassword as sdkEncrypt,
  decryptWithPassword as sdkDecrypt,
} from "../crypto/envelope/openpgp";
import { buildWeb3SignedHeader as sdkBuildHeader } from "../auth/web3-signed-builder";
import {
  verifyWeb3Signed as sdkVerifyWeb3Signed,
  parseWeb3SignedHeader as sdkParseWeb3SignedHeader,
} from "../auth/web3-signed";

// personal-server-ts-core (the upstream package the SDK was ported from).
import {
  deriveMasterKey as psDeriveMasterKey,
  deriveScopeKey as psDeriveScopeKey,
  recoverServerOwner as psRecoverServerOwner,
} from "@opendatalabs/personal-server-ts-core/keys";
import {
  encryptWithPassword as psEncrypt,
  decryptWithPassword as psDecrypt,
} from "@opendatalabs/personal-server-ts-core/storage/encryption";
import {
  verifyWeb3Signed as psVerifyWeb3Signed,
  parseWeb3SignedHeader as psParseWeb3SignedHeader,
} from "@opendatalabs/personal-server-ts-core/auth";
import { createRequestSigner as psCreateRequestSigner } from "@opendatalabs/personal-server-ts-core/signing";

// ---------------------------------------------------------------------------
// Test fixtures — deterministic, derived live (no baked ciphertext).
// ---------------------------------------------------------------------------

/** Known private key used by other smoke tests (0x01…01). */
const SMOKE_PRIVATE_KEY = `0x${"01".repeat(32)}` as `0x${string}`;
const SMOKE_ACCOUNT = privateKeyToAccount(SMOKE_PRIVATE_KEY);

/** All-0xaa 65-byte signature — used purely as material for HKDF parity. */
const DETERMINISTIC_SIGNATURE = `0x${"aa".repeat(65)}` as `0x${string}`;

const SCOPE = "smoke.scope";

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return Buffer.from(a).equals(Buffer.from(b));
}

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

// ---------------------------------------------------------------------------
// HKDF: deriveMasterKey / deriveScopeKey + MASTER_KEY_MESSAGE
// ---------------------------------------------------------------------------

describe("interop: HKDF key derivation", () => {
  it("MASTER_KEY_MESSAGE matches the documented wire literal", () => {
    // PS inlines the literal in `recoverServerOwner`; this assertion locks
    // the SDK constant to the same string and a wire-compat round-trip
    // through PS's recoverServerOwner is exercised below.
    expect(SDK_MASTER_KEY_MESSAGE).toBe("vana-master-key-v1");
  });

  it("deriveMasterKey produces byte-identical output across packages", () => {
    const sdkKey = sdkDeriveMasterKey(DETERMINISTIC_SIGNATURE);
    const psKey = psDeriveMasterKey(DETERMINISTIC_SIGNATURE);
    expect(sdkKey.length).toBe(65);
    expect(psKey.length).toBe(65);
    expect(toHex(sdkKey)).toBe(toHex(psKey));
    expect(bytesEqual(sdkKey, psKey)).toBe(true);
  });

  it("deriveScopeKey produces byte-identical output across packages", () => {
    const masterKey = sdkDeriveMasterKey(DETERMINISTIC_SIGNATURE);
    const sdkScopeKey = sdkDeriveScopeKey(masterKey, SCOPE);
    const psScopeKey = psDeriveScopeKey(masterKey, SCOPE);
    expect(sdkScopeKey.length).toBe(32);
    expect(psScopeKey.length).toBe(32);
    expect(toHex(sdkScopeKey)).toBe(toHex(psScopeKey));
    expect(bytesEqual(sdkScopeKey, psScopeKey)).toBe(true);
  });

  it("recoverServerOwner agrees on signer for a real EIP-191 signature", async () => {
    // Use the SDK's MASTER_KEY_MESSAGE constant to sign, then recover with PS.
    // This proves both packages compute the EIP-191 digest the same way.
    const signature = await SMOKE_ACCOUNT.signMessage({
      message: SDK_MASTER_KEY_MESSAGE,
    });
    const sdkOwner = await sdkRecoverServerOwner(signature);
    const psOwner = await psRecoverServerOwner(signature);
    expect(sdkOwner.toLowerCase()).toBe(SMOKE_ACCOUNT.address.toLowerCase());
    expect(psOwner.toLowerCase()).toBe(SMOKE_ACCOUNT.address.toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// OpenPGP envelope: encrypt / decrypt cross-package round-trip
// ---------------------------------------------------------------------------

describe("interop: OpenPGP envelope", () => {
  // Live-derived scope key, hex-encoded as the password — same recipe as
  // production code paths in both packages.
  const masterKey = sdkDeriveMasterKey(DETERMINISTIC_SIGNATURE);
  const scopeKey = sdkDeriveScopeKey(masterKey, SCOPE);
  const PASSWORD = toHex(scopeKey);

  /** Small DataFileEnvelope-shaped JSON payload (~200 bytes). */
  const smallEnvelope = {
    version: "1.0" as const,
    scope: SCOPE,
    collectedAt: "2026-05-13T00:00:00.000Z",
    data: {
      handle: "@volodisai",
      followers: 1234,
      note: "interop smoke",
    },
  };
  const smallPlaintext = new TextEncoder().encode(
    JSON.stringify(smallEnvelope),
  );

  /** Larger plaintext (~10 KB) so we exercise multi-packet OpenPGP framing. */
  const largePlaintext = (() => {
    const bytes = new Uint8Array(10 * 1024);
    // Deterministic pseudo-random fill — avoid Math.random to keep CI stable.
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = (i * 31 + 7) & 0xff;
    }
    return bytes;
  })();

  it("PS encrypt -> SDK decrypt round-trips small envelope", async () => {
    const ciphertext = await psEncrypt(smallPlaintext, PASSWORD);
    const decrypted = await sdkDecrypt(ciphertext, PASSWORD);
    expect(decrypted).toEqual(smallPlaintext);
  });

  it("SDK encrypt -> PS decrypt round-trips small envelope", async () => {
    const ciphertext = await sdkEncrypt(smallPlaintext, PASSWORD);
    const decrypted = await psDecrypt(ciphertext, PASSWORD);
    expect(decrypted).toEqual(smallPlaintext);
  });

  it("PS encrypt -> SDK decrypt round-trips ~10 KB plaintext", async () => {
    const ciphertext = await psEncrypt(largePlaintext, PASSWORD);
    const decrypted = await sdkDecrypt(ciphertext, PASSWORD);
    expect(decrypted).toEqual(largePlaintext);
  });

  it("SDK encrypt -> PS decrypt round-trips ~10 KB plaintext", async () => {
    const ciphertext = await sdkEncrypt(largePlaintext, PASSWORD);
    const decrypted = await psDecrypt(ciphertext, PASSWORD);
    expect(decrypted).toEqual(largePlaintext);
  });

  it("wrong password fails on both SDK decrypt and PS decrypt", async () => {
    const ciphertext = await sdkEncrypt(smallPlaintext, PASSWORD);
    const wrongPassword = "ff".repeat(32);
    await expect(sdkDecrypt(ciphertext, wrongPassword)).rejects.toThrow();
    await expect(psDecrypt(ciphertext, wrongPassword)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Web3Signed: build / verify across packages
// ---------------------------------------------------------------------------

describe("interop: Web3Signed Authorization header", () => {
  const AUD = "https://ps.example.com";
  const METHOD = "GET";
  const URI = "/v1/data/smoke.scope";
  const BODY = new TextEncoder().encode('{"hello":"vana"}');

  // EIP-191 signer wrapping the SMOKE_ACCOUNT — same instance used in both
  // directions so we can assert PS/SDK each recover the same address.
  const signMessage = (message: string) =>
    SMOKE_ACCOUNT.signMessage({ message });

  /**
   * Adapter — PS exposes `createRequestSigner(account)` which expects a
   * `ServerAccount`-shape. We wrap the viem account to satisfy that shape,
   * giving us a header builder backed by PS's exact wire-format code.
   */
  function makePsHeader() {
    const fakeServerAccount = {
      address: SMOKE_ACCOUNT.address,
      // Required by the ServerAccount type but unused by createRequestSigner.
      publicKey: SMOKE_ACCOUNT.publicKey,
      signMessage: signMessage,
      // signTypedData is part of the ServerAccount surface but the request
      // signer only invokes signMessage.
      signTypedData: async () => {
        throw new Error("not used by createRequestSigner");
      },
    } as unknown as Parameters<typeof psCreateRequestSigner>[0];
    return psCreateRequestSigner(fakeServerAccount);
  }

  it("SDK build -> PS verify recovers the signer", async () => {
    const header = await sdkBuildHeader({
      signMessage,
      aud: AUD,
      method: METHOD,
      uri: URI,
      body: BODY,
    });
    const { signer, payload } = await psVerifyWeb3Signed({
      headerValue: header,
      expectedOrigin: AUD,
      expectedMethod: METHOD,
      expectedPath: URI,
    });
    expect(signer.toLowerCase()).toBe(SMOKE_ACCOUNT.address.toLowerCase());
    expect(payload.aud).toBe(AUD);
    expect(payload.method).toBe(METHOD);
    expect(payload.uri).toBe(URI);
  });

  it("PS build -> SDK verify recovers the signer", async () => {
    const psSigner = makePsHeader();
    const header = await psSigner.signRequest({
      aud: AUD,
      method: METHOD,
      uri: URI,
      body: BODY,
    });
    const { signer, payload } = await sdkVerifyWeb3Signed({
      headerValue: header,
      expectedOrigin: AUD,
      expectedMethod: METHOD,
      expectedPath: URI,
      bodyBytes: BODY,
    });
    expect(signer.toLowerCase()).toBe(SMOKE_ACCOUNT.address.toLowerCase());
    expect(payload.aud).toBe(AUD);
    expect(payload.method).toBe(METHOD);
    expect(payload.uri).toBe(URI);
  });

  it("SDK build -> PS parseWeb3SignedHeader exposes identical payload", async () => {
    const header = await sdkBuildHeader({
      signMessage,
      aud: AUD,
      method: METHOD,
      uri: URI,
    });
    const sdkParsed = sdkParseWeb3SignedHeader(header);
    const psParsed = psParseWeb3SignedHeader(header);
    expect(psParsed.payloadBase64).toBe(sdkParsed.payloadBase64);
    expect(psParsed.signature).toBe(sdkParsed.signature);
    expect(psParsed.payload).toEqual(sdkParsed.payload);
  });
});
