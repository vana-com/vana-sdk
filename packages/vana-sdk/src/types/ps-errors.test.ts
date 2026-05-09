import { describe, it, expect } from "vitest";
import { PSError, parsePSError, type PSErrorCode } from "./ps-errors";

function makeResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("parsePSError", () => {
  it("returns null for 2xx responses", async () => {
    const r = makeResponse(200, { code: "grant_invalid", message: "ok" });
    expect(await parsePSError(r)).toBeNull();
  });

  it("returns null for malformed JSON", async () => {
    const r = new Response("not json{{", { status: 400 });
    expect(await parsePSError(r)).toBeNull();
  });

  it("returns null when code is missing", async () => {
    const r = makeResponse(400, { message: "no code" });
    expect(await parsePSError(r)).toBeNull();
  });

  it("returns null when code is unrecognised", async () => {
    const r = makeResponse(400, { code: "some_other_code", message: "x" });
    expect(await parsePSError(r)).toBeNull();
  });

  const codes: PSErrorCode[] = [
    "missing_auth",
    "invalid_signature",
    "unregistered_builder",
    "not_owner",
    "expired_token",
    "grant_invalid",
    "grant_required",
    "grant_expired",
    "grant_revoked",
    "scope_mismatch",
    "fee_required",
    "ps_unavailable",
    "server_not_configured",
    "content_too_large",
  ];

  for (const code of codes) {
    it(`returns PSError with code "${code}"`, async () => {
      const r = makeResponse(403, { code, message: `msg-${code}` });
      const err = await parsePSError(r);
      expect(err).toBeInstanceOf(PSError);
      expect(err?.code).toBe(code);
      expect(err?.message).toBe(`msg-${code}`);
    });
  }

  it("parses the nested Personal Server protocol error envelope", async () => {
    const r = makeResponse(403, {
      error: {
        code: 403,
        errorCode: "SCOPE_MISMATCH",
        message: "Scope not granted",
      },
    });

    const err = await parsePSError(r);

    expect(err).toBeInstanceOf(PSError);
    expect(err?.code).toBe("scope_mismatch");
    expect(err?.message).toBe("Scope not granted");
  });
});
