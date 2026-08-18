import { describe, it, expect, vi } from "vitest";
import {
  buildApprovalUrl,
  buildDirectAccessRequestAuthMessage,
  createDefaultAccessRequestClient,
  type FetchLike,
} from "./access-request-client";

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
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      fetchFn: fakeFetch(() => ({
        status: 200,
        body: { requestId: "dcr_9", appAddress: "0xabc" },
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

    expect(result.requestId).toBe("dcr_9");
    expect(result.approvalUrl).toBe(
      "https://app.vana.org/data-connection-requests/dcr_9?mode=page",
    );
    expect(result.appAddress).toBe("0xabc");
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

  it("parses optional installed-app routing metadata from create and status", async () => {
    const installedAppUrl = "vana-dev://continue?id=dcrcont_9";
    const installedAppExpiresAt = "2026-08-17T18:05:00.000Z";
    const installedAppFallbackUrl = "https://app.vana.org/mobile/install";
    const installedAppReopenUrl = "vana-dev://open";
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      createIdempotencyKey: () => "idem-9",
      fetchFn: fakeFetch((url) => ({
        status: 200,
        body: url.endsWith("/dcr_9")
          ? {
              status: "pending",
              installedAppUrl,
              installedAppExpiresAt,
              installedAppFallbackUrl,
              installedAppReopenUrl,
            }
          : {
              requestId: "dcr_9",
              installedAppUrl,
              installedAppExpiresAt,
              installedAppFallbackUrl,
              installedAppReopenUrl,
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
    const status = await client.getAccessRequestStatus("dcr_9");

    expect(request).toMatchObject({
      installedAppUrl,
      installedAppExpiresAt,
      installedAppFallbackUrl,
      installedAppReopenUrl,
    });
    expect(status).toMatchObject({
      installedAppUrl,
      installedAppExpiresAt,
      installedAppFallbackUrl,
      installedAppReopenUrl,
    });
  });

  it("omits unsafe installed-app continuations from create and status", async () => {
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      createIdempotencyKey: () => "idem-invalid-continuation",
      fetchFn: fakeFetch((url) => ({
        status: 200,
        body: url.endsWith("/dcr_invalid")
          ? { status: "pending", installedAppUrl: "tel://continue?id=1" }
          : {
              requestId: "dcr_invalid",
              installedAppUrl: "javascript:alert(document.domain)",
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
    const status = await client.getAccessRequestStatus("dcr_invalid");

    expect(request.installedAppUrl).toBeUndefined();
    expect(status.installedAppUrl).toBeUndefined();
  });

  it.each([
    "vana://open?request=dcr_9",
    "vana://open#resume",
    "vana://user@open",
    "vana://open:443",
    "vana://other",
    "vana://open/path",
    "vana-beta://open",
    "https://open",
  ])(
    "omits non-canonical installed-app reopen URL %s",
    async (installedAppReopenUrl) => {
      const client = createDefaultAccessRequestClient({
        baseUrl: "https://app.vana.org",
        approvalBaseUrl: "https://app.vana.org",
        createIdempotencyKey: () => "idem-invalid-reopen",
        fetchFn: fakeFetch((url) => ({
          status: 200,
          body: url.endsWith("/dcr_9")
            ? { status: "pending", installedAppReopenUrl }
            : { requestId: "dcr_9", installedAppReopenUrl },
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
      const status = await client.getAccessRequestStatus("dcr_9");

      expect(request.installedAppReopenUrl).toBeUndefined();
      expect(status.installedAppReopenUrl).toBeUndefined();
    },
  );

  it.each([
    "/mobile/install",
    "https:app.vana.org/mobile/install",
    "http://app.vana.org/mobile/install",
    "vana://install",
  ])(
    "omits non-HTTPS installed-app fallback %s",
    async (installedAppFallbackUrl) => {
      const client = createDefaultAccessRequestClient({
        baseUrl: "https://app.vana.org",
        approvalBaseUrl: "https://app.vana.org",
        createIdempotencyKey: () => "idem-invalid-fallback",
        fetchFn: fakeFetch((url) => ({
          status: 200,
          body: url.endsWith("/dcr_9")
            ? { status: "pending", installedAppFallbackUrl }
            : { requestId: "dcr_9", installedAppFallbackUrl },
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
      const status = await client.getAccessRequestStatus("dcr_9");

      expect(request.installedAppFallbackUrl).toBeUndefined();
      expect(status.installedAppFallbackUrl).toBeUndefined();
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
          installedAppUrl: "not a url",
          installedAppExpiresAt: "also-not-a-date",
          installedAppFallbackUrl: "javascript:alert(1)",
          installedAppReopenUrl: "vana://open?request=dcr_9",
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
    expect(result.installedAppUrl).toBeUndefined();
    expect(result.installedAppExpiresAt).toBeUndefined();
    expect(result.installedAppFallbackUrl).toBeUndefined();
    expect(result.installedAppReopenUrl).toBeUndefined();
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

  it("reuses a generated signed idempotency key after an uncertain create failure", async () => {
    const bodies: string[] = [];
    let attempt = 0;
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      appAddress: "0xabc",
      signMessage: async () => "0xsig",
      createIdempotencyKey: () => "generated-key",
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

    expect(JSON.parse(bodies[0] ?? "{}").idempotencyKey).toBe("generated-key");
    expect(bodies[1]).toBe(bodies[0]);
  });

  it("retains a shared key when one concurrent create has an uncertain failure", async () => {
    const bodies: string[] = [];
    const createIdempotencyKey = vi.fn(() => "concurrent-key");
    let resolveFirst!: (response: Awaited<ReturnType<FetchLike>>) => void;
    let rejectSecond!: (error: Error) => void;
    let attempt = 0;
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      createIdempotencyKey,
      fetchFn: async (_url, init) => {
        bodies.push(init?.body ?? "");
        attempt++;
        if (attempt === 1) {
          return new Promise((resolve) => {
            resolveFirst = resolve;
          });
        }
        if (attempt === 2) {
          return new Promise((_resolve, reject) => {
            rejectSecond = reject;
          });
        }
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

    const first = client.createAccessRequest(input);
    const second = client.createAccessRequest(input);
    await vi.waitFor(() => {
      expect(bodies).toHaveLength(2);
    });
    resolveFirst({
      ok: true,
      status: 201,
      statusText: "HTTP 201",
      json: async () => ({ requestId: "dcr_9" }),
      text: async () => "",
    });
    await first;
    rejectSecond(new Error("response lost"));
    await expect(second).rejects.toThrow("response lost");
    await client.createAccessRequest(input);

    expect(createIdempotencyKey).toHaveBeenCalledOnce();
    expect(bodies).toHaveLength(3);
    expect(bodies[1]).toBe(bodies[0]);
    expect(bodies[2]).toBe(bodies[0]);
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
