import { describe, expect, it, vi } from "vitest";
import { recoverMessageAddress } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { createDirectDataController } from "./controller";
import {
  connectBindingCookieName,
  createVanaConnectHandler,
  toNodeHandler,
  type VanaConnectHandlerOptions,
} from "./connect-handler";
import { buildRequestReadAuthorizationMessage } from "./request-authorization";
import type { AccessRequestClient, AccessRequestStatus } from "./types";

const APP = "https://app.example";
const BASE = `${APP}/api/vana`;
const KEY = generatePrivateKey();

function setup(
  overrides: Partial<VanaConnectHandlerOptions> = {},
  status: AccessRequestStatus = { status: "pending" },
) {
  let created = 0;
  const accessRequestClient: AccessRequestClient = {
    createAccessRequest: vi.fn(async ({ appAddress }) => {
      created += 1;
      return {
        requestId: `dcr_${created}`,
        approvalUrl: `https://app.vana.org/data-connection-requests/dcr_${created}?mode=page`,
        appAddress,
        expiresAt: "2099-01-01T00:00:00.000Z",
      };
    }),
    getAccessRequestStatus: vi.fn(async () => status),
  };
  const controller = createDirectDataController({
    env: "dev",
    appPrivateKey: KEY,
    app: { id: "lorebook", name: "Lorebook", homepageUrl: APP },
    source: "spotify",
    scopes: ["spotify.savedTracks"],
    accessRequestClient,
  });
  const handler = createVanaConnectHandler({
    controller,
    returnUrl: `${APP}/connect/return`,
    clientId: "lorebook",
    ...overrides,
  });
  return { accessRequestClient, controller, handler };
}

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: APP, ...headers },
    body: JSON.stringify(body),
  });
}

function get(path: string, headers: Record<string, string> = {}) {
  return new Request(`${BASE}/${path}`, { headers });
}

/** `name=value` from a Set-Cookie header. */
function cookieOf(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  return header.split(";")[0];
}

async function create(handler: ReturnType<typeof setup>["handler"]) {
  const response = await handler(post("request", {}));
  return {
    response,
    body: (await response.json()) as {
      request: { requestId: string };
      embed: {
        id: string;
        authorization: {
          appAddress: string;
          signature: `0x${string}`;
          timestamp: string;
        };
      };
    },
    cookie: cookieOf(response),
  };
}

describe("createVanaConnectHandler", () => {
  it("reports the sheet config for the controller's environment", async () => {
    const { handler } = setup();
    const response = await handler(get("config"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      protocolVersion: 1,
      env: "dev",
      clientId: "lorebook",
      appName: "Lorebook",
      accountOrigin: "https://account-dev.vana.org",
    });
  });

  it("creates a request bound to this browser and signs the sheet's read of it", async () => {
    const { controller, handler } = setup();
    const { response, body } = await create(handler);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^vana_dcr_dcr_1=/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Secure");

    expect(body.request.requestId).toBe("dcr_1");
    expect(body.embed.id).toBe("dcr_1");
    const signer = await recoverMessageAddress({
      message: buildRequestReadAuthorizationMessage(
        "dcr_1",
        body.embed.authorization.timestamp,
      ),
      signature: body.embed.authorization.signature,
    });
    expect(signer).toBe(controller.appAddress);
  });

  it("re-signs only a request this browser holds, and never creates another", async () => {
    const { accessRequestClient, handler } = setup();
    const { cookie } = await create(handler);

    const resigned = await handler(
      post("request", { requestId: "dcr_1" }, { Cookie: cookie }),
    );
    expect(resigned.status).toBe(200);
    expect(await resigned.json()).toMatchObject({
      request: { requestId: "dcr_1" },
      embed: { id: "dcr_1" },
    });

    const stranger = await handler(post("request", { requestId: "dcr_1" }));
    expect(stranger.status).toBe(403);
    expect(await stranger.json()).toMatchObject({
      error: { code: "request_not_bound" },
    });
    expect(accessRequestClient.createAccessRequest).toHaveBeenCalledTimes(1);
  });

  it("answers status only for a bound request, without the grant or server URL", async () => {
    const { handler } = setup(
      {},
      {
        status: "approved",
        grantId: "0xgrant",
        personalServerUrl: "https://ps.example",
        scope: "spotify.savedTracks",
      },
    );
    const { cookie } = await create(handler);

    expect((await handler(get("status?requestId=dcr_1"))).status).toBe(403);
    const response = await handler(
      get("status?requestId=dcr_1", { Cookie: cookie }),
    );
    expect(await response.json()).toEqual({ status: "approved" });
  });

  it("refuses a forged, swapped or expired binding", async () => {
    let clock = Date.parse("2026-10-21T00:00:00Z");
    const { handler } = setup({ now: () => clock });
    const first = await create(handler);
    const second = await create(handler);
    const [, value] = first.cookie.split("=");
    const [payload, tag] = value.split(".");

    const tampered = `${connectBindingCookieName("dcr_1")}=${payload}.${tag.slice(0, -2)}xx`;
    // dcr_2's valid cookie value presented under dcr_1's name.
    const swapped = `${connectBindingCookieName("dcr_1")}=${second.cookie.split("=")[1]}`;
    for (const cookie of [tampered, swapped]) {
      const response = await handler(
        get("status?requestId=dcr_1", { Cookie: cookie }),
      );
      expect(response.status).toBe(403);
    }

    clock = Date.parse("2099-02-01T00:00:00Z");
    expect(
      (await handler(get("status?requestId=dcr_1", { Cookie: first.cookie })))
        .status,
    ).toBe(403);
  });

  it("never reads data for a request this browser does not hold", async () => {
    const read = vi.fn(async () => ({ scope: "s.a", data: 1 }));
    const { handler } = setup({ read });
    const { cookie } = await create(handler);
    const forged = `${cookie.slice(0, -4)}AAAA`;

    for (const headers of [{}, { Cookie: forged }] as Record<
      string,
      string
    >[]) {
      const response = await handler(get("data?requestId=dcr_1", headers));
      expect(response.status).toBe(403);
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses a cross-site re-sign even with the binding cookie", async () => {
    const { handler } = setup();
    const { cookie } = await create(handler);

    const response = await handler(
      post(
        "request",
        { requestId: "dcr_1" },
        { Cookie: cookie, Origin: "https://evil.example" },
      ),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "forbidden_origin" },
    });
  });

  it("refuses a cross-site create", async () => {
    const { accessRequestClient, handler } = setup();

    const foreign = await handler(
      post("request", {}, { Origin: "https://evil.example" }),
    );
    const crossSite = await handler(
      post("request", {}, { "Sec-Fetch-Site": "cross-site" }),
    );

    expect(foreign.status).toBe(403);
    expect(crossSite.status).toBe(403);
    expect(accessRequestClient.createAccessRequest).not.toHaveBeenCalled();
  });

  it("binds to the app's session when asked, refusing another user's browser", async () => {
    let user: string | null = "alice";
    const { handler } = setup({ session: () => user });
    const { cookie } = await create(handler);

    user = "bob";
    expect(
      (await handler(get("status?requestId=dcr_1", { Cookie: cookie }))).status,
    ).toBe(403);
    user = null;
    expect(
      (await handler(get("status?requestId=dcr_1", { Cookie: cookie }))).status,
    ).toBe(401);
    user = "alice";
    expect(
      (await handler(get("status?requestId=dcr_1", { Cookie: cookie }))).status,
    ).toBe(200);
  });

  it("reads data through a custom read, and maps a not-yet-approved read to 409", async () => {
    const read = vi.fn(async ({ requestId }: { requestId: string }) => ({
      scope: "spotify.savedTracks",
      data: { requestId },
    }));
    const custom = setup({ read });
    const bound = await create(custom.handler);
    const response = await custom.handler(
      get("data?requestId=dcr_1", { Cookie: bound.cookie }),
    );
    expect(await response.json()).toEqual({
      scope: "spotify.savedTracks",
      data: { requestId: "dcr_1" },
    });

    const plain = setup();
    const pending = await create(plain.handler);
    const notReady = await plain.handler(
      get("data?requestId=dcr_1", { Cookie: pending.cookie }),
    );
    expect(notReady.status).toBe(409);
    expect(await notReady.json()).toMatchObject({
      error: { code: "not_approved" },
    });
  });

  it("rejects unknown routes, wrong methods and malformed input", async () => {
    const { handler } = setup();

    expect((await handler(get("nope"))).status).toBe(404);
    expect((await handler(get("request"))).status).toBe(405);
    expect((await handler(get("status?requestId=../x"))).status).toBe(400);
    const notJson = new Request(`${BASE}/request`, {
      method: "POST",
      headers: { Origin: APP },
      body: "[1]",
    });
    expect((await handler(notJson)).status).toBe(400);
  });

  it("hides unexpected failures behind a generic 500", async () => {
    const { accessRequestClient, handler } = setup();
    vi.mocked(accessRequestClient.createAccessRequest).mockRejectedValueOnce(
      new Error("secret upstream detail"),
    );

    const response = await handler(post("request", {}));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});

describe("toNodeHandler", () => {
  it("serves the handler on Node's req/res, keeping the binding cookie", async () => {
    const { handler } = setup();
    const node = toNodeHandler(handler);
    const headers: Record<string, string | string[]> = {};
    let body = "";
    const res = {
      statusCode: 0,
      setHeader: (name: string, value: string | string[]) => {
        headers[name] = value;
      },
      end: (chunk?: Uint8Array | string) => {
        body =
          typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      },
    };
    const req = {
      method: "POST",
      url: "/request",
      originalUrl: "/api/vana/request",
      headers: {
        host: "app.example",
        "x-forwarded-proto": "https",
        origin: APP,
        "content-type": "application/json",
      },
      async *[Symbol.asyncIterator]() {
        yield new TextEncoder().encode("{}");
      },
    };

    await node(req, res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ request: { requestId: "dcr_1" } });
    expect(headers["set-cookie"]).toEqual([
      expect.stringMatching(/^vana_dcr_dcr_1=.*HttpOnly/),
    ]);
  });
});
