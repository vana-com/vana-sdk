import { describe, expect, it, vi } from "vitest";
import {
  createVanaConnectTransports,
  VanaConnectHttpError,
} from "./http-transports";

const AUTH = (n: number) => ({
  appAddress: `0x${"a".repeat(40)}`,
  signature: `0x${String(n).repeat(130)}`,
  timestamp: String(1767225600000 + n),
});

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("createVanaConnectTransports", () => {
  it("speaks the handler's wire contract under the endpoint", async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/request") && init?.body === "{}") {
        return respond({
          request: { requestId: "dcr_1" },
          embed: { id: "dcr_1", authorization: AUTH(1) },
        });
      }
      if (url.includes("/status?")) return respond({ status: "pending" });
      if (url.includes("/data?")) return respond({ scope: "s.a", data: 1 });
      return respond({}, 404);
    });
    const t = createVanaConnectTransports({
      endpoint: "/api/vana/",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(t.createRequest()).resolves.toEqual({ requestId: "dcr_1" });
    await expect(t.getStatus("dcr 1")).resolves.toEqual({ status: "pending" });
    await expect(t.readResult("dcr_1")).resolves.toEqual({
      scope: "s.a",
      data: 1,
    });

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/vana/request",
      "/api/vana/status?requestId=dcr%201",
      "/api/vana/data?requestId=dcr_1",
    ]);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("uses the signature that came with a fresh request once, then re-signs", async () => {
    let signed = 1;
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { requestId?: string };
      signed += 1;
      return respond({
        request: { requestId: "dcr_1" },
        embed: {
          id: "dcr_1",
          authorization: AUTH(body.requestId ? signed : 1),
        },
      });
    });
    const t = createVanaConnectTransports({
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await t.createRequest();
    await expect(t.authorizeRequest("dcr_1")).resolves.toEqual(AUTH(1));
    const second = await t.authorizeRequest("dcr_1");

    expect(second).toEqual(AUTH(3));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({
      requestId: "dcr_1",
    });
  });

  it("re-signs when the signature from creation is stale", async () => {
    let clock = 0;
    const fetch = vi.fn(async () =>
      respond({
        request: { requestId: "dcr_1" },
        embed: { id: "dcr_1", authorization: AUTH(1) },
      }),
    );
    const t = createVanaConnectTransports({
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => clock,
    });

    await t.createRequest();
    clock = 61_000;
    await t.authorizeRequest("dcr_1");

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("raises the route's error code and message", async () => {
    const t = createVanaConnectTransports({
      fetch: (async () =>
        respond(
          { error: { code: "request_not_bound", message: "Not yours" } },
          403,
        )) as unknown as typeof globalThis.fetch,
    });

    const error = await t.getStatus("dcr_1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(VanaConnectHttpError);
    expect(error).toMatchObject({
      status: 403,
      code: "request_not_bound",
      message: "Not yours",
    });
  });

  it("loads config once, and again after a failure", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({}, 500))
      .mockResolvedValue(respond({ clientId: "lorebook" }));
    const t = createVanaConnectTransports({ fetch });

    await expect(t.getConfig()).rejects.toBeInstanceOf(VanaConnectHttpError);
    await t.getConfig();
    await t.getConfig();

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
