import { describe, expect, it, vi } from "vitest";
import { parseWeb3SignedHeader } from "../auth/web3-signed";
import {
  createSessionRelayBuilderClient,
  createSessionRelayClient,
} from "./client";
import { SessionRelayError } from "./errors";
import type { SessionRelayFetch } from "./types";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("createSessionRelayClient", () => {
  it("claims sessions against the configured Relay URL", async () => {
    const fetchFn = vi.fn<SessionRelayFetch>(async () =>
      jsonResponse({
        sessionId: "sess_1",
        granteeAddress: "0xabc",
        scopes: ["chatgpt.conversations"],
        expiresAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const relay = createSessionRelayClient({
      baseUrl: "https://relay.example/",
      fetchFn,
    });

    await expect(
      relay.claimSession({ sessionId: "sess_1", secret: "sec_1" }),
    ).resolves.toMatchObject({
      sessionId: "sess_1",
      scopes: ["chatgpt.conversations"],
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "https://relay.example/v1/session/claim",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "sess_1", secret: "sec_1" }),
      },
    );
  });

  it("approves and denies sessions with encoded session ids", async () => {
    const fetchFn = vi.fn<SessionRelayFetch>(async () => jsonResponse({}));
    const relay = createSessionRelayClient({
      baseUrl: "https://relay.example",
      fetchFn,
    });

    await relay.approveSession("sess/special", {
      secret: "sec_1",
      grantId: "grant_1",
      userAddress: "0xuser",
      serverAddress: "0xserver",
      scopes: ["scope.one"],
    });
    await relay.denySession("sess/special", {
      secret: "sec_1",
      reason: "User declined",
    });

    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://relay.example/v1/session/sess%2Fspecial/approve",
    );
    expect(fetchFn.mock.calls[1][0]).toBe(
      "https://relay.example/v1/session/sess%2Fspecial/deny",
    );
  });

  it("accepts empty success responses for approve and deny", async () => {
    const fetchFn = vi.fn<SessionRelayFetch>(async () => ({
      ok: true,
      status: 204,
      statusText: "No Content",
      json: async () => {
        throw new Error("empty");
      },
      text: async () => "",
    }));
    const relay = createSessionRelayClient({
      baseUrl: "https://relay.example",
      fetchFn,
    });

    await expect(
      relay.approveSession("sess_1", {
        secret: "sec_1",
        grantId: "grant_1",
        userAddress: "0xuser",
        scopes: ["scope.one"],
      }),
    ).resolves.toBeUndefined();
    await expect(
      relay.denySession("sess_1", { secret: "sec_1" }),
    ).resolves.toBeUndefined();
  });

  it("surfaces structured Relay errors", async () => {
    const fetchFn = vi.fn<SessionRelayFetch>(async () =>
      jsonResponse(
        {
          error: {
            code: 401,
            errorCode: "INVALID_CLAIM_SECRET",
            message: "Invalid secret",
          },
        },
        401,
      ),
    );
    const relay = createSessionRelayClient({ fetchFn });

    await expect(
      relay.claimSession({ sessionId: "sess_1", secret: "bad" }),
    ).rejects.toMatchObject({
      name: "SessionRelayError",
      code: "INVALID_CLAIM_SECRET",
      message: "Invalid secret",
      details: {
        status: 401,
        relayCode: 401,
        relayErrorCode: "INVALID_CLAIM_SECRET",
      },
    });
  });
});

describe("createSessionRelayBuilderClient", () => {
  it("initializes signed sessions with Relay-compatible Web3Signed payloads", async () => {
    let authorization = "";
    let body = "";
    const fetchFn = vi.fn<SessionRelayFetch>(async (_url, init) => {
      authorization = init?.headers?.Authorization ?? "";
      body = init?.body ?? "";
      return jsonResponse({
        sessionId: "sess_1",
        deepLinkUrl: "vana://connect?sessionId=sess_1&secret=sec_1",
        expiresAt: "2026-01-01T00:00:00.000Z",
      });
    });
    const relay = createSessionRelayBuilderClient({
      baseUrl: "https://relay.example",
      granteeAddress: "0x0000000000000000000000000000000000000001",
      signMessage: async () => "0x01" as `0x${string}`,
      now: () => 100,
      fetchFn,
    });

    await expect(
      relay.initSession({
        scopes: ["chatgpt.conversations"],
        webhookUrl: "https://app.example/webhook",
        appUserId: "user_1",
      }),
    ).resolves.toMatchObject({
      sessionId: "sess_1",
      deepLinkUrl: "vana://connect?sessionId=sess_1&secret=sec_1",
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "https://relay.example/v1/session/init",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(body)).toEqual({
      granteeAddress: "0x0000000000000000000000000000000000000001",
      scopes: ["chatgpt.conversations"],
      webhookUrl: "https://app.example/webhook",
      appUserId: "user_1",
    });

    const parsed = parseWeb3SignedHeader(authorization);
    expect(parsed.payload).toMatchObject({
      aud: "https://relay.example",
      exp: 400,
      iat: 100,
      method: "POST",
      uri: "/v1/session/init",
    });
    expect(parsed.payload.bodyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("polls until terminal session state", async () => {
    const fetchFn = vi
      .fn<SessionRelayFetch>()
      .mockResolvedValueOnce(jsonResponse({ status: "pending" }))
      .mockResolvedValueOnce(jsonResponse({ status: "approved", grant: {} }));
    const relay = createSessionRelayBuilderClient({
      baseUrl: "https://relay.example",
      granteeAddress: "0x0000000000000000000000000000000000000001",
      signMessage: async () => "0x01" as `0x${string}`,
      fetchFn,
    });

    await expect(
      relay.pollUntilComplete("sess_1", { intervalMs: 1, timeoutMs: 100 }),
    ).resolves.toMatchObject({ status: "approved" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("throws a typed timeout error when polling does not complete", async () => {
    const fetchFn = vi.fn<SessionRelayFetch>(async () =>
      jsonResponse({ status: "pending" }),
    );
    const relay = createSessionRelayBuilderClient({
      baseUrl: "https://relay.example",
      granteeAddress: "0x0000000000000000000000000000000000000001",
      signMessage: async () => "0x01" as `0x${string}`,
      fetchFn,
    });

    await expect(
      relay.pollUntilComplete("sess_1", { intervalMs: 1, timeoutMs: 5 }),
    ).rejects.toBeInstanceOf(SessionRelayError);
  });

  it("surfaces expired sessions when Relay returns SESSION_EXPIRED", async () => {
    const fetchFn = vi.fn<SessionRelayFetch>(async () =>
      jsonResponse(
        {
          error: {
            code: 410,
            errorCode: "SESSION_EXPIRED",
            message: "Session expired",
          },
        },
        410,
      ),
    );
    const relay = createSessionRelayBuilderClient({
      baseUrl: "https://relay.example",
      granteeAddress: "0x0000000000000000000000000000000000000001",
      signMessage: async () => "0x01" as `0x${string}`,
      fetchFn,
    });

    await expect(relay.pollSession("sess_1")).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
      details: { status: 410, relayErrorCode: "SESSION_EXPIRED" },
    });
  });
});
