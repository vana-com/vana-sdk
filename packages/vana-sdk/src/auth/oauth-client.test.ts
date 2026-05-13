import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { OAuthClient } from "./oauth-client";
import { InMemoryTokenStore } from "./token-store";
import { computePkceChallenge, PKCE_CHALLENGE_PATTERN } from "./pkce";

const AUTH_ENDPOINT = "https://example.test/oauth/authorize";
const TOKEN_ENDPOINT = "https://example.test/oauth/token";
const CLIENT_ID = "test-client";
const REDIRECT_URI = "https://app.test/callback";
const SCOPE = "read profile";

const FIXED_STATE = "deterministic-state-1234567890ab";

function makeFetchOk(body: Record<string, unknown>): Mock {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function makeFetchErr(status: number, body: Record<string, unknown>): Mock {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function makeClient(
  overrides: {
    store?: InMemoryTokenStore;
    fetchImpl?: Mock;
    generateState?: () => string;
    scope?: string;
  } = {},
) {
  const store = overrides.store ?? new InMemoryTokenStore();
  const fetchImpl = overrides.fetchImpl ?? vi.fn();
  const client = new OAuthClient({
    authorizationEndpoint: AUTH_ENDPOINT,
    tokenEndpoint: TOKEN_ENDPOINT,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    scope: overrides.scope ?? SCOPE,
    tokenStore: store,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    generateState: overrides.generateState ?? (() => FIXED_STATE),
  });
  return { client, store, fetchImpl };
}

describe("OAuthClient.buildAuthorizationUrl", () => {
  it("includes all required params with an S256 challenge", async () => {
    const { client, store } = makeClient();
    const { url, state } = await client.buildAuthorizationUrl();

    expect(state).toBe(FIXED_STATE);

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(AUTH_ENDPOINT);
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(parsed.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(parsed.searchParams.get("scope")).toBe(SCOPE);
    expect(parsed.searchParams.get("state")).toBe(FIXED_STATE);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");

    const challenge = parsed.searchParams.get("code_challenge");
    expect(challenge).toMatch(PKCE_CHALLENGE_PATTERN);

    const stored = await store.get(`oauth:verifier:${FIXED_STATE}`);
    expect(stored).not.toBeNull();
    expect(stored?.token.length).toBeGreaterThanOrEqual(43);

    // Persisted verifier must derive the challenge sent in the URL.
    const recomputed = await computePkceChallenge(stored?.token ?? "");
    expect(recomputed).toBe(challenge);

    const nowSeconds = Math.floor(Date.now() / 1000);
    expect((stored?.expiresAt ?? 0) - nowSeconds).toBeGreaterThan(60);
  });

  it("URL-encodes the scope when it contains spaces", async () => {
    const { client } = makeClient({ scope: "read write profile:email" });
    const { url } = await client.buildAuthorizationUrl();
    // URLSearchParams encodes space as "+" — verify the raw URL.
    expect(url).toContain("scope=read+write+profile%3Aemail");
  });

  it("accepts extraParams and serializes them on the URL", async () => {
    const { client } = makeClient();
    const { url } = await client.buildAuthorizationUrl({
      extraParams: { audience: "https://api.test", prompt: "login" },
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("audience")).toBe("https://api.test");
    expect(parsed.searchParams.get("prompt")).toBe("login");
  });

  it("rejects extraParams that would override reserved OAuth/PKCE keys", async () => {
    const { client } = makeClient();
    const reserved = [
      "state",
      "code_challenge",
      "code_challenge_method",
      "client_id",
      "redirect_uri",
      "response_type",
      "scope",
    ];
    for (const key of reserved) {
      await expect(
        client.buildAuthorizationUrl({ extraParams: { [key]: "x" } }),
      ).rejects.toThrow(/reserved OAuth\/PKCE parameter/);
    }
  });

  it("accepts a caller-supplied state", async () => {
    const { client, store } = makeClient();
    const { state } = await client.buildAuthorizationUrl({
      state: "caller-state",
    });
    expect(state).toBe("caller-state");
    expect(await store.get("oauth:verifier:caller-state")).not.toBeNull();
  });

  it("preserves an existing query string on the authorize endpoint", async () => {
    const { client } = makeClient();
    const c2 = new OAuthClient({
      authorizationEndpoint: `${AUTH_ENDPOINT}?audience=svc`,
      tokenEndpoint: TOKEN_ENDPOINT,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      generateState: () => FIXED_STATE,
    });
    const { url } = await c2.buildAuthorizationUrl();
    expect(url).toContain("?audience=svc&");
    // Original client still works without `?` collision.
    const { url: u2 } = await client.buildAuthorizationUrl();
    expect(u2.split("?")[1]).toBeDefined();
  });

  it("omits scope when neither the config nor the call supplies one", async () => {
    const client = new OAuthClient({
      authorizationEndpoint: AUTH_ENDPOINT,
      tokenEndpoint: TOKEN_ENDPOINT,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      generateState: () => FIXED_STATE,
    });
    const { url } = await client.buildAuthorizationUrl();
    expect(new URL(url).searchParams.has("scope")).toBe(false);
  });
});

describe("OAuthClient.handleCallback", () => {
  it("exchanges code+verifier for tokens and persists them", async () => {
    const fetchImpl = makeFetchOk({
      access_token: "access-1",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: "refresh-1",
      scope: SCOPE,
    });
    const { client, store } = makeClient({ fetchImpl });

    const { state } = await client.buildAuthorizationUrl();
    const verifier = (await store.get(`oauth:verifier:${state}`))?.token;
    expect(verifier).toBeDefined();

    const record = await client.handleCallback(
      `${REDIRECT_URI}?code=the-code&state=${state}`,
    );

    expect(record.token).toBe("access-1");
    expect(record.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(TOKEN_ENDPOINT);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );

    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(body.get("client_id")).toBe(CLIENT_ID);
    expect(body.get("code_verifier")).toBe(verifier);

    // Verifier consumed after exchange.
    expect(await store.get(`oauth:verifier:${state}`)).toBeNull();
    // Tokens persisted.
    expect((await store.get(`oauth:tokens:${CLIENT_ID}`))?.token).toBe(
      "access-1",
    );
    expect((await store.get(`oauth:refresh:${CLIENT_ID}`))?.token).toBe(
      "refresh-1",
    );
  });

  it("throws on state mismatch (CSRF guard)", async () => {
    const fetchImpl = makeFetchOk({ access_token: "x" });
    const { client } = makeClient({ fetchImpl });
    await client.buildAuthorizationUrl();
    await expect(
      client.handleCallback(`${REDIRECT_URI}?code=the-code&state=wrong-state`),
    ).rejects.toThrow(/CSRF|in-flight verifier|state/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws when the state is unknown (expired or never started)", async () => {
    const fetchImpl = makeFetchOk({ access_token: "x" });
    const { client } = makeClient({ fetchImpl });
    // No buildAuthorizationUrl call — store is empty.
    await expect(
      client.handleCallback(
        `${REDIRECT_URI}?code=the-code&state=${FIXED_STATE}`,
      ),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws when code or state is missing", async () => {
    const { client } = makeClient();
    await expect(
      client.handleCallback(`${REDIRECT_URI}?code=foo`),
    ).rejects.toThrow(/missing/i);
    await expect(
      client.handleCallback(`${REDIRECT_URI}?state=bar`),
    ).rejects.toThrow(/missing/i);
  });

  it("surfaces OAuth `error`/`error_description` query params from the IdP", async () => {
    const fetchImpl = vi.fn();
    const { client } = makeClient({ fetchImpl });
    await expect(
      client.handleCallback(
        `${REDIRECT_URI}?error=access_denied&error_description=User%20said%20no`,
      ),
    ).rejects.toThrow(/access_denied.*User said no/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("propagates an OAuth error response from the token endpoint", async () => {
    const fetchImpl = makeFetchErr(400, {
      error: "invalid_grant",
      error_description: "The code is expired",
    });
    const { client, store } = makeClient({ fetchImpl });
    const { state } = await client.buildAuthorizationUrl();
    await expect(
      client.handleCallback(`${REDIRECT_URI}?code=bad&state=${state}`),
    ).rejects.toThrow(/invalid_grant.*expired/);
    // Verifier cleared even on a failed exchange.
    expect(await store.get(`oauth:verifier:${state}`)).toBeNull();
  });

  it("throws when the token response has no access_token", async () => {
    const fetchImpl = makeFetchOk({ token_type: "Bearer" });
    const { client } = makeClient({ fetchImpl });
    const { state } = await client.buildAuthorizationUrl();
    await expect(
      client.handleCallback(`${REDIRECT_URI}?code=c&state=${state}`),
    ).rejects.toThrow(/access_token/);
  });
});

describe("OAuthClient.refresh", () => {
  it("posts the refresh body and updates the access record", async () => {
    const fetchImpl = makeFetchOk({
      access_token: "access-2",
      expires_in: 60,
      refresh_token: "refresh-2",
    });
    const { client, store } = makeClient({ fetchImpl });

    await store.set(`oauth:refresh:${CLIENT_ID}`, { token: "old-refresh" });
    const record = await client.refresh();

    expect(record.token).toBe("access-2");
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("old-refresh");
    expect(body.get("client_id")).toBe(CLIENT_ID);

    // Rotated refresh token is stored.
    expect((await store.get(`oauth:refresh:${CLIENT_ID}`))?.token).toBe(
      "refresh-2",
    );
  });

  it("retains the previous refresh token when the server doesn't rotate", async () => {
    const fetchImpl = makeFetchOk({
      access_token: "access-3",
      expires_in: 60,
    });
    const { client, store } = makeClient({ fetchImpl });
    await store.set(`oauth:refresh:${CLIENT_ID}`, { token: "keep-me" });

    await client.refresh();
    expect((await store.get(`oauth:refresh:${CLIENT_ID}`))?.token).toBe(
      "keep-me",
    );
  });

  it("throws when no refresh token is stored", async () => {
    const fetchImpl = vi.fn();
    const { client } = makeClient({ fetchImpl });
    await expect(client.refresh()).rejects.toThrow(/no refresh token/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces an OAuth error response on refresh failure", async () => {
    const fetchImpl = makeFetchErr(400, {
      error: "invalid_grant",
      error_description: "refresh token revoked",
    });
    const { client, store } = makeClient({ fetchImpl });
    await store.set(`oauth:refresh:${CLIENT_ID}`, { token: "x" });
    await expect(client.refresh()).rejects.toThrow(/invalid_grant.*revoked/);
  });
});

describe("OAuthClient.getAccessToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the stored token when it is not expired", async () => {
    const fetchImpl = vi.fn();
    const { client, store } = makeClient({ fetchImpl });
    const nowSec = Math.floor(Date.now() / 1000);
    await store.set(`oauth:tokens:${CLIENT_ID}`, {
      token: "fresh",
      expiresAt: nowSec + 600,
    });
    await expect(client.getAccessToken()).resolves.toBe("fresh");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("auto-refreshes when expired and a refresh token is available", async () => {
    const fetchImpl = makeFetchOk({
      access_token: "renewed",
      expires_in: 3600,
    });
    const { client, store } = makeClient({ fetchImpl });
    const nowSec = Math.floor(Date.now() / 1000);
    await store.set(`oauth:tokens:${CLIENT_ID}`, {
      token: "stale",
      expiresAt: nowSec - 1,
    });
    await store.set(`oauth:refresh:${CLIENT_ID}`, { token: "r" });

    await expect(client.getAccessToken()).resolves.toBe("renewed");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null when no tokens are stored", async () => {
    const fetchImpl = vi.fn();
    const { client } = makeClient({ fetchImpl });
    await expect(client.getAccessToken()).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null when only the refresh exists and the refresh call fails", async () => {
    const fetchImpl = makeFetchErr(400, { error: "invalid_grant" });
    const { client, store } = makeClient({ fetchImpl });
    await store.set(`oauth:refresh:${CLIENT_ID}`, { token: "dead" });
    await expect(client.getAccessToken()).resolves.toBeNull();
  });
});

describe("OAuthClient.signOut", () => {
  it("clears both the access and refresh keys", async () => {
    const { client, store } = makeClient();
    await store.set(`oauth:tokens:${CLIENT_ID}`, { token: "a" });
    await store.set(`oauth:refresh:${CLIENT_ID}`, { token: "r" });

    await client.signOut();

    expect(await store.get(`oauth:tokens:${CLIENT_ID}`)).toBeNull();
    expect(await store.get(`oauth:refresh:${CLIENT_ID}`)).toBeNull();
  });
});

describe("OAuthClient construction", () => {
  it("throws when there is no global fetch and none is supplied", () => {
    const original = globalThis.fetch;
    // @ts-expect-error - intentional override for the test
    globalThis.fetch = undefined;
    try {
      expect(
        () =>
          new OAuthClient({
            authorizationEndpoint: AUTH_ENDPOINT,
            tokenEndpoint: TOKEN_ENDPOINT,
            clientId: CLIENT_ID,
            redirectUri: REDIRECT_URI,
          }),
      ).toThrow(/fetch/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("uses an InMemoryTokenStore by default and a default state generator", async () => {
    const fetchImpl = makeFetchOk({ access_token: "a" });
    const client = new OAuthClient({
      authorizationEndpoint: AUTH_ENDPOINT,
      tokenEndpoint: TOKEN_ENDPOINT,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const a = await client.buildAuthorizationUrl();
    const b = await client.buildAuthorizationUrl();
    expect(a.state).not.toBe(b.state);
    expect(a.state.length).toBeGreaterThanOrEqual(16);
    // base64url shape
    expect(a.state).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
