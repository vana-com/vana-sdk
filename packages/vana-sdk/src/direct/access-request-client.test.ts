import { describe, it, expect } from "vitest";
import {
  buildApprovalUrl,
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
    init?: { method?: string; body?: string },
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
    });

    expect(result.requestId).toBe("dcr_9");
    expect(result.approvalUrl).toBe(
      "https://app.vana.org/data-connection-requests/dcr_9?mode=page",
    );
    expect(result.appAddress).toBe("0xabc");
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
      }),
    ).rejects.toThrow(/Access request service error/);
  });
});
