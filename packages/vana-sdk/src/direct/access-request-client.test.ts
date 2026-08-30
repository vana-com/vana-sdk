import { describe, it, expect, vi } from "vitest";
import {
  buildApprovalUrl,
  buildDirectAccessRequestAuthMessage,
  createDefaultAccessRequestClient,
  type FetchLike,
} from "./access-request-client";
import { DirectConfigError } from "./errors";
import type { AccessRequestQuestion } from "./types";

describe("buildApprovalUrl", () => {
  it("matches the documented format", () => {
    expect(buildApprovalUrl("https://app.vana.org", "dcr_123")).toBe(
      "https://app.vana.org/data-connection-requests/dcr_123?mode=page",
    );
  });

  it("strips a trailing slash from the base", () => {
    expect(buildApprovalUrl("https://app.vana.org/", "dcr_123")).toContain(
      "https://app.vana.org/data-connection-requests/dcr_123",
    );
  });
});

function fakeFetch(
  handler: (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => { status: number; body: unknown },
): FetchLike {
  return async (url, init) => {
    const { status, body } = handler(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: `HTTP ${status}`,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
}

describe("createDefaultAccessRequestClient", () => {
  it("creates a request and derives an approvalUrl when missing", async () => {
    let createBody: Record<string, unknown> | undefined;
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch((_url, init) => {
        createBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return {
          status: 200,
          body: { requestId: "dcr_9", appAddress: "0xabc" },
        };
      }),
    });

    const result = await client.createAccessRequest({
      appAddress: "0xabc",
      app: { id: "a", name: "A", homepageUrl: "https://a.example" },
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      returnUrl: "https://a.example/return",
      network: "mainnet",
      foregroundDelivery: {
        url: "https://a.example/api/vana/delivery",
        token: "a".repeat(43),
      },
    });

    expect(result.requestId).toBe("dcr_9");
    expect(result.approvalUrl).toBe(
      "https://app.vana.org/data-connection-requests/dcr_9?mode=page",
    );
    expect(result.appAddress).toBe("0xabc");
    expect(createBody?.foregroundDelivery).toEqual({
      url: "https://a.example/api/vana/delivery",
      token: "a".repeat(43),
    });
  });

  it("parses additive network and expiry metadata from a create response", async () => {
    const expiresAt = "2026-08-17T18:00:00.000Z";
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch(() => ({
        status: 200,
        body: {
          requestId: "dcr_9",
          appAddress: "0xabc",
          network: "moksha",
          expiresAt,
        },
      })),
    });

    const result = await client.createAccessRequest({
      appAddress: "0xabc",
      app: { id: "a", name: "A", homepageUrl: "https://a.example" },
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      returnUrl: "https://a.example/return",
      network: "moksha",
    });

    expect(result).toMatchObject({ network: "moksha", expiresAt });
  });

  it("parses the mobile continuation URL from create and status", async () => {
    const mobileContinuationUrl = "https://open-dev.vana.org/continue#ticket_9";
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      createIdempotencyKey: () => "idem-9",
      fetchFn: fakeFetch((url) => ({
        status: 200,
        body: url.endsWith("/dcr_9")
          ? { status: "pending", mobileContinuationUrl }
          : { requestId: "dcr_9", mobileContinuationUrl },
      })),
    });

    const request = await client.createAccessRequest({
      appAddress: "0xabc",
      app: { id: "a", name: "A", homepageUrl: "https://a.example" },
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      returnUrl: "https://a.example/return",
      network: "moksha",
    });
    const status = await client.getAccessRequestStatus("dcr_9");

    expect(request.mobileContinuationUrl).toBe(mobileContinuationUrl);
    expect(status.mobileContinuationUrl).toBe(mobileContinuationUrl);
  });

  it("accepts the production continuation host too when env is unset", async () => {
    const mobileContinuationUrl = "https://open.vana.org/continue#ticket_prod";
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch(() => ({
        status: 200,
        body: { requestId: "dcr_9", mobileContinuationUrl },
      })),
    });

    const request = await client.createAccessRequest({
      appAddress: "0xabc",
      app: { id: "a", name: "A", homepageUrl: "https://a.example" },
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      returnUrl: "https://a.example/return",
      network: "mainnet",
    });

    expect(request.mobileContinuationUrl).toBe(mobileContinuationUrl);
  });

  it("pins the allowed continuation host to the configured env", async () => {
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      env: "dev",
      fetchFn: fakeFetch(() => ({
        status: 200,
        body: {
          requestId: "dcr_9",
          // A production host must be rejected under the dev environment.
          mobileContinuationUrl: "https://open.vana.org/continue#ticket_prod",
        },
      })),
    });

    const request = await client.createAccessRequest({
      appAddress: "0xabc",
      app: { id: "a", name: "A", homepageUrl: "https://a.example" },
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      returnUrl: "https://a.example/return",
      network: "moksha",
    });

    expect(request.mobileContinuationUrl).toBeUndefined();
  });

  it.each([
    "http://open.vana.org/continue#ticket_9",
    "https://open.vana.org/continue",
    "https://open.vana.org/continue#",
    "https://open.vana.org/other#ticket_9",
    "https://app.vana.org/continue#ticket_9",
    "https://open.vana.org:8443/continue#ticket_9",
    "https://user@open.vana.org/continue#ticket_9",
    "https://open.vana.org/continue?x=1#ticket_9",
    "https://open.vana.org/continue#ticket_9&evil=1",
    "javascript:alert(document.domain)",
    "vana-dev://continue?id=1",
  ])(
    "omits an invalid mobile continuation URL %s from create and status",
    async (mobileContinuationUrl) => {
      const client = createDefaultAccessRequestClient({
        baseUrl: "https://app.vana.org",
        approvalBaseUrl: "https://app.vana.org",
        createIdempotencyKey: () => "idem-invalid-continuation",
        fetchFn: fakeFetch((url) => ({
          status: 200,
          body: url.endsWith("/dcr_9")
            ? { status: "pending", mobileContinuationUrl }
            : { requestId: "dcr_9", mobileContinuationUrl },
        })),
      });

      const request = await client.createAccessRequest({
        appAddress: "0xabc",
        app: { id: "a", name: "A", homepageUrl: "https://a.example" },
        source: "icloud_notes",
        scopes: ["icloud_notes.notes"],
        returnUrl: "https://a.example/return",
        network: "moksha",
      });
      const status = await client.getAccessRequestStatus("dcr_9");

      expect(request.mobileContinuationUrl).toBeUndefined();
      expect(status.mobileContinuationUrl).toBeUndefined();
    },
  );

  it("omits invalid additive create-response metadata", async () => {
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch(() => ({
        status: 200,
        body: {
          requestId: "dcr_9",
          network: "testnet",
          expiresAt: "not-a-date",
          mobileContinuationUrl: "not a url",
        },
      })),
    });

    const result = await client.createAccessRequest({
      appAddress: "0xabc",
      app: { id: "a", name: "A", homepageUrl: "https://a.example" },
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      returnUrl: "https://a.example/return",
      network: "mainnet",
    });

    expect(result.network).toBeUndefined();
    expect(result.expiresAt).toBeUndefined();
    expect(result.mobileContinuationUrl).toBeUndefined();
  });

  it("normalizes an unknown status to pending", async () => {
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch(() => ({
        status: 200,
        body: { status: "weird-unknown-status" },
      })),
    });

    const status = await client.getAccessRequestStatus("dcr_9");
    expect(status.status).toBe("pending");
  });

  it("passes through approved status fields", async () => {
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch(() => ({
        status: 200,
        body: {
          status: "approved",
          personalServerUrl: "https://ps.example.com",
          grantId: "0xgrant",
          scope: "icloud_notes.notes",
        },
      })),
    });

    const status = await client.getAccessRequestStatus("dcr_9");
    expect(status).toEqual({
      status: "approved",
      personalServerUrl: "https://ps.example.com",
      grantId: "0xgrant",
      scope: "icloud_notes.notes",
      scopes: ["icloud_notes.notes"],
    });
  });

  it("passes through ready_for_read status fields", async () => {
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch(() => ({
        status: 200,
        body: {
          status: "ready_for_read",
          personalServerUrl: "https://ps.example.com",
          grantId: "0xgrant",
          scope: "icloud_notes.notes",
        },
      })),
    });

    const status = await client.getAccessRequestStatus("dcr_9");
    expect(status).toEqual({
      status: "ready_for_read",
      personalServerUrl: "https://ps.example.com",
      grantId: "0xgrant",
      scope: "icloud_notes.notes",
      scopes: ["icloud_notes.notes"],
    });
  });

  it("passes through the terminal completed status without downgrading it", async () => {
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch(() => ({
        status: 200,
        body: {
          status: "completed",
          personalServerUrl: "https://ps.example.com",
          grantId: "0xgrant",
          scope: "icloud_notes.notes",
        },
      })),
    });

    const status = await client.getAccessRequestStatus("dcr_10");
    expect(status.status).toBe("completed");
  });

  it("exposes every approved scope, not just the first", async () => {
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch(() => ({
        status: 200,
        body: {
          status: "approved",
          personalServerUrl: "https://ps.example.com",
          grantId: "0xgrant",
          scope: "linkedin.profile",
          scopes: ["linkedin.profile", "linkedin.skills", "linkedin.education"],
        },
      })),
    });

    const status = await client.getAccessRequestStatus("dcr_9");
    expect(status.scopes).toEqual([
      "linkedin.profile",
      "linkedin.skills",
      "linkedin.education",
    ]);
  });

  it("falls back to the single scope when the service omits scopes", async () => {
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch(() => ({
        status: 200,
        body: {
          status: "approved",
          personalServerUrl: "https://ps.example.com",
          grantId: "0xgrant",
          scope: "linkedin.profile",
        },
      })),
    });

    const status = await client.getAccessRequestStatus("dcr_9");
    expect(status.scopes).toEqual(["linkedin.profile"]);
  });

  it("signs create, status, and acknowledge requests when app auth is configured", async () => {
    const requests: Array<{
      init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      };
      url: string;
    }> = [];
    const signedMessages: string[] = [];
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      appAddress: "0xabc",
      now: () => 123,
      signMessage: async (message) => {
        signedMessages.push(message);
        return `0xsig${signedMessages.length}` as `0x${string}`;
      },
      fetchFn: fakeFetch((url, init) => {
        requests.push({ url, init });
        return {
          status: 200,
          body: url.endsWith("/dcr_9")
            ? { status: "pending" }
            : { requestId: "dcr_9" },
        };
      }),
    });

    await client.createAccessRequest({
      appAddress: "0xabc",
      app: { id: "a", name: "A", homepageUrl: "https://a.example" },
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      returnUrl: "https://a.example/return",
      network: "mainnet",
    });
    await client.getAccessRequestStatus("dcr_9");
    await client.acknowledgeRead?.("dcr_9");

    const createBody = requests[0]?.init?.body ?? "";
    expect(requests[0]).toMatchObject({
      url: "https://app.vana.org/api/data-connection-requests",
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Vana-App-Address": "0xabc",
          "X-Vana-App-Signature": "0xsig1",
          "X-Vana-App-Timestamp": "123",
        },
      },
    });
    expect(JSON.parse(createBody)).toMatchObject({ network: "mainnet" });
    expect(signedMessages[0]).toBe(
      buildDirectAccessRequestAuthMessage({
        body: createBody,
        method: "POST",
        path: "/api/data-connection-requests",
        timestamp: "123",
      }),
    );

    expect(requests[1]).toMatchObject({
      url: "https://app.vana.org/api/data-connection-requests/dcr_9",
      init: {
        method: "GET",
        headers: {
          "X-Vana-App-Address": "0xabc",
          "X-Vana-App-Signature": "0xsig2",
          "X-Vana-App-Timestamp": "123",
        },
      },
    });
    expect(signedMessages[1]).toBe(
      buildDirectAccessRequestAuthMessage({
        body: "",
        method: "GET",
        path: "/api/data-connection-requests/dcr_9",
        timestamp: "123",
      }),
    );

    expect(requests[2]).toMatchObject({
      url: "https://app.vana.org/api/data-connection-requests/dcr_9/consumer-ack",
      init: {
        method: "POST",
        headers: {
          "X-Vana-App-Address": "0xabc",
          "X-Vana-App-Signature": "0xsig3",
          "X-Vana-App-Timestamp": "123",
        },
      },
    });
    expect(signedMessages[2]).toBe(
      buildDirectAccessRequestAuthMessage({
        body: "",
        method: "POST",
        path: "/api/data-connection-requests/dcr_9/consumer-ack",
        timestamp: "123",
      }),
    );
  });

  it("throws on a non-ok create response", async () => {
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch(() => ({ status: 500, body: {} })),
    });

    await expect(
      client.createAccessRequest({
        appAddress: "0xabc",
        app: { id: "a", name: "A", homepageUrl: "https://a.example" },
        source: "icloud_notes",
        scopes: ["icloud_notes.notes"],
        returnUrl: "https://a.example/return",
        network: "mainnet",
      }),
    ).rejects.toThrow(/Access request service error/);
  });

  it("gives each create its own generated idempotency key", async () => {
    const bodies: string[] = [];
    let issued = 0;
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      appAddress: "0xabc",
      signMessage: async () => "0xsig",
      createIdempotencyKey: () => `generated-key-${++issued}`,
      fetchFn: async (_url, init) => {
        bodies.push(init?.body ?? "");
        return {
          ok: true,
          status: 201,
          statusText: "HTTP 201",
          json: async () => ({ requestId: "dcr_9" }),
          text: async () => "",
        };
      },
    });
    const input = {
      appAddress: "0xabc",
      app: { id: "a", name: "A", homepageUrl: "https://a.example" },
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      returnUrl: "https://a.example/return",
      network: "mainnet" as const,
    };

    // Two users behind one shared controller send byte-identical creates; they
    // must not collapse onto a single DCR at the service.
    await Promise.all([
      client.createAccessRequest(input),
      client.createAccessRequest(input),
    ]);
    await client.createAccessRequest(input);

    const keys = bodies.map((body) => JSON.parse(body).idempotencyKey);
    expect(new Set(keys).size).toBe(3);
  });

  it("does not reuse a generated key after an uncertain create failure", async () => {
    const bodies: string[] = [];
    let issued = 0;
    let attempt = 0;
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      createIdempotencyKey: () => `generated-key-${++issued}`,
      fetchFn: async (_url, init) => {
        bodies.push(init?.body ?? "");
        attempt++;
        if (attempt === 1) throw new Error("response lost");
        return {
          ok: true,
          status: 201,
          statusText: "HTTP 201",
          json: async () => ({ requestId: "dcr_9" }),
          text: async () => "",
        };
      },
    });
    const input = {
      appAddress: "0xabc",
      app: { id: "a", name: "A", homepageUrl: "https://a.example" },
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      returnUrl: "https://a.example/return",
      network: "mainnet" as const,
    };

    await expect(client.createAccessRequest(input)).rejects.toThrow(
      /response lost/,
    );
    await client.createAccessRequest(input);

    expect(JSON.parse(bodies[0] ?? "{}").idempotencyKey).toBe(
      "generated-key-1",
    );
    expect(JSON.parse(bodies[1] ?? "{}").idempotencyKey).toBe(
      "generated-key-2",
    );
  });

  it("sends a caller-supplied idempotency key verbatim on retry", async () => {
    const bodies: string[] = [];
    const createIdempotencyKey = vi.fn(() => "generated-key");
    let attempt = 0;
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      appAddress: "0xabc",
      signMessage: async () => "0xsig",
      createIdempotencyKey,
      fetchFn: async (_url, init) => {
        bodies.push(init?.body ?? "");
        attempt++;
        if (attempt === 1) throw new Error("response lost");
        return {
          ok: true,
          status: 201,
          statusText: "HTTP 201",
          json: async () => ({ requestId: "dcr_9" }),
          text: async () => "",
        };
      },
    });
    const input = {
      appAddress: "0xabc",
      app: { id: "a", name: "A", homepageUrl: "https://a.example" },
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      returnUrl: "https://a.example/return",
      network: "mainnet" as const,
      idempotencyKey: "caller-key",
    };

    await expect(client.createAccessRequest(input)).rejects.toThrow(
      /response lost/,
    );
    await client.createAccessRequest(input);

    expect(createIdempotencyKey).not.toHaveBeenCalled();
    expect(JSON.parse(bodies[0] ?? "{}").idempotencyKey).toBe("caller-key");
    expect(bodies[1]).toBe(bodies[0]);
  });

  it("throws on a non-ok acknowledge response", async () => {
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch(() => ({ status: 409, body: {} })),
    });

    await expect(client.acknowledgeRead?.("dcr_9")).rejects.toThrow(
      /Access request ack service error/,
    );
  });
});

describe("createDefaultAccessRequestClient - questions", () => {
  const QUESTIONS: AccessRequestQuestion[] = [
    {
      derivedScope: "coach.weekly",
      sourceScopes: ["oura.sleep", "linkedin.profile"],
      question: "How consistent was my sleep this week?",
      recompute: "snapshot",
    },
    {
      derivedScope: "insights.summary",
      sourceScopes: ["chatgpt.conversations"],
      question: "Summarize my week in one paragraph.",
    },
  ];

  const CREATE_INPUT = {
    appAddress: "0xabc",
    app: { id: "a", name: "A", homepageUrl: "https://a.example" },
    source: "oura",
    scopes: ["oura.sleep", "coach.weekly", "insights.summary"],
    returnUrl: "https://a.example/return",
    network: "moksha" as const,
  };

  it("serializes questions verbatim into the create body and the signed message", async () => {
    const bodies: string[] = [];
    const signedMessages: string[] = [];
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      appAddress: "0xabc",
      now: () => 123,
      signMessage: async (message) => {
        signedMessages.push(message);
        return "0xsig" as `0x${string}`;
      },
      createIdempotencyKey: () => "idem-questions",
      fetchFn: fakeFetch((_url, init) => {
        bodies.push(init?.body ?? "");
        return { status: 200, body: { requestId: "dcr_q" } };
      }),
    });

    await client.createAccessRequest({ ...CREATE_INPUT, questions: QUESTIONS });

    const createBody = bodies[0] ?? "";
    expect(JSON.parse(createBody).questions).toEqual(QUESTIONS);
    // The EIP-191 message embeds the exact body string, so the signature
    // covers the questions field with no signature-scheme change.
    expect(createBody).toContain('"questions"');
    expect(signedMessages[0]).toBe(
      buildDirectAccessRequestAuthMessage({
        body: createBody,
        method: "POST",
        path: "/api/data-connection-requests",
        timestamp: "123",
      }),
    );
  });

  it("leaves the create body byte-identical to the pre-questions shape when questions are omitted", async () => {
    const bodies: string[] = [];
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      createIdempotencyKey: () => "idem-fixed",
      fetchFn: fakeFetch((_url, init) => {
        bodies.push(init?.body ?? "");
        return { status: 200, body: { requestId: "dcr_q" } };
      }),
    });

    await client.createAccessRequest(CREATE_INPUT);

    expect(bodies[0]).toBe(
      JSON.stringify({
        appAddress: "0xabc",
        app: { id: "a", name: "A", homepageUrl: "https://a.example" },
        source: "oura",
        scopes: ["oura.sleep", "coach.weekly", "insights.summary"],
        returnUrl: "https://a.example/return",
        network: "moksha",
        idempotencyKey: "idem-fixed",
      }),
    );
  });

  it("rejects invalid questions before any request is sent", async () => {
    let fetchCalls = 0;
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch(() => {
        fetchCalls++;
        return { status: 200, body: { requestId: "dcr_q" } };
      }),
    });

    await expect(
      client.createAccessRequest({ ...CREATE_INPUT, questions: [] }),
    ).rejects.toThrow(DirectConfigError);
    expect(fetchCalls).toBe(0);
  });

  const VALID_QUESTION: AccessRequestQuestion = {
    derivedScope: "coach.weekly",
    sourceScopes: ["oura.sleep"],
    question: "How did I sleep this week?",
  };

  it.each([
    {
      name: "an empty questions array",
      questions: [] as AccessRequestQuestion[],
      message: /1 to 4 entries/,
    },
    {
      name: "more than four questions",
      questions: Array.from({ length: 5 }, () => VALID_QUESTION),
      message: /1 to 4 entries/,
    },
    {
      name: "a wildcard derived scope",
      questions: [{ ...VALID_QUESTION, derivedScope: "coach.*" }],
      scopes: ["coach.*"],
      message: /not a concrete scope/,
    },
    {
      name: "a wildcard source scope",
      questions: [{ ...VALID_QUESTION, sourceScopes: ["oura.*"] }],
      message: /not a concrete scope/,
    },
    {
      name: "an empty sourceScopes array",
      questions: [{ ...VALID_QUESTION, sourceScopes: [] }],
      message: /1 to 16 entries/,
    },
    {
      name: "more than sixteen source scopes",
      questions: [
        {
          ...VALID_QUESTION,
          sourceScopes: Array.from({ length: 17 }, (_, i) => `src${i}.data`),
        },
      ],
      message: /1 to 16 entries/,
    },
    {
      name: "a duplicated source scope",
      questions: [
        { ...VALID_QUESTION, sourceScopes: ["oura.sleep", "oura.sleep"] },
      ],
      message: /more than once/,
    },
    {
      name: "a source scope equal to the derived scope",
      questions: [
        {
          ...VALID_QUESTION,
          sourceScopes: ["oura.sleep", "coach.weekly"],
        },
      ],
      message: /must not contain the derived scope/,
    },
    {
      name: "a derived scope sharing its first dot-segment with a source",
      questions: [{ ...VALID_QUESTION, sourceScopes: ["coach.daily"] }],
      scopes: ["coach.weekly", "coach.daily"],
      message: /first dot-segment/,
    },
    {
      name: "a derived scope missing from scopes as a bare read entry",
      questions: [VALID_QUESTION],
      scopes: ["write:coach.weekly", "oura.sleep"],
      message: /bare read entry/,
    },
    {
      name: "two questions sharing a derived scope",
      questions: [VALID_QUESTION, { ...VALID_QUESTION, question: "Again?" }],
      message: /already used by an earlier question/,
    },
    {
      name: "a question that is empty after trimming",
      questions: [{ ...VALID_QUESTION, question: "   " }],
      message: /1 to 4000 characters/,
    },
    {
      name: "a question longer than 4000 characters after trimming",
      questions: [{ ...VALID_QUESTION, question: "q".repeat(4001) }],
      message: /1 to 4000 characters/,
    },
    {
      name: "an unknown recompute value",
      questions: [{ ...VALID_QUESTION, recompute: "weekly" as "snapshot" }],
      message: /recompute must be "snapshot" or "on-change"/,
    },
  ])(
    "rejects $name with a DirectConfigError",
    async ({ questions, scopes, message }) => {
      let fetchCalls = 0;
      const client = createDefaultAccessRequestClient({
        baseUrl: "https://app.vana.org",
        approvalBaseUrl: "https://app.vana.org",
        fetchFn: fakeFetch(() => {
          fetchCalls++;
          return { status: 200, body: { requestId: "dcr_q" } };
        }),
      });

      const create = client.createAccessRequest({
        ...CREATE_INPUT,
        scopes: scopes ?? ["coach.weekly", "oura.sleep"],
        questions,
      });
      await expect(create).rejects.toThrow(DirectConfigError);
      await expect(create).rejects.toThrow(message);
      expect(fetchCalls).toBe(0);
    },
  );
});
