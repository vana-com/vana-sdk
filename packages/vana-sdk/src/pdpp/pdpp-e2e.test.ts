/**
 * PDPP client role against a real Vana Personal Server. Skipped unless
 * `PDPP_E2E_PS_URL` is set.
 *
 * Run (from packages/vana-sdk, against a PS built from the PDPP v0.1.0 branch):
 *
 *   PDPP_E2E_PS_URL=http://127.0.0.1:8080 \
 *   PDPP_E2E_OWNER_TOKEN=<PDPP owner token for the source> \
 *   PDPP_E2E_CLIENT_ID=<a client in the PS config pdpp.clients> \
 *   PDPP_E2E_REDIRECT_URI=<one of that client's redirectUris> \
 *   ../../node_modules/.bin/vitest run src/pdpp/pdpp-e2e.test.ts
 *
 * Instead of PDPP_E2E_OWNER_TOKEN, PDPP_E2E_DEV_TOKEN (the PS dev token, with
 * `devUi` enabled) mints one through `POST /pdpp/v1/owner/token`, as the PS
 * tests' `registerTestConnection` does. Optional: PDPP_E2E_SOURCE_ID (default
 * the Spotify connector), PDPP_E2E_STREAM (default `top_artists`),
 * PDPP_E2E_FIELDS (comma-separated, default `*`), PDPP_E2E_ISSUER (default the
 * PS URL), PDPP_E2E_AS_METADATA_URL (default
 * `<PS>/.well-known/oauth-authorization-server/pdpp/v1`, where the PS serves
 * it), PDPP_E2E_RESOURCE (default the PS URL). The source needs at least one
 * connected instance; with more than one, set PDPP_E2E_INSTANCE_ID.
 *
 * Steps: discover the AS and RS, authorize (the owner side is driven through
 * the PS owner API: POST /authorize, GET review, POST approve), exchange the
 * code, read one page, paginate with limit=1, run a changes_since sync twice,
 * and make a lifecycle query that must answer `permitted`.
 */

import { describe, it, expect } from "vitest";
import {
  InMemoryPdppLifecycleCredentials,
  InMemoryPdppSyncCopy,
  PdppHeldDataManager,
  PdppLifecycleAgent,
  PdppResourceClient,
  buildAuthorizationRequest,
  buildDataAccessDetail,
  createPkcePair,
  discoverPdppAuthorizationServer,
  discoverPdppResourceServer,
  exchangeAuthorizationCode,
  grantLifecycleEndpointOf,
  grantRefOf,
} from "./index";

const env = process.env;
const PS = env.PDPP_E2E_PS_URL?.replace(/\/$/, "");

describe.skipIf(!PS)("PDPP client e2e against a Personal Server (PDPP_E2E_PS_URL)", () => {
  it("discovers, authorizes, exchanges, reads, paginates, syncs and queries lifecycle", async () => {
    const issuer = env.PDPP_E2E_ISSUER ?? PS!;
    const sourceId = env.PDPP_E2E_SOURCE_ID ?? "https://registry.pdpp.dev/connectors/spotify";
    const stream = env.PDPP_E2E_STREAM ?? "top_artists";
    const fields = (env.PDPP_E2E_FIELDS ?? "*").split(",").map((f) => f.trim());
    const clientId = env.PDPP_E2E_CLIENT_ID ?? "music_recommendations";
    const redirectUri = env.PDPP_E2E_REDIRECT_URI ?? "https://app.example.com/callback";

    // 1. Discovery (Client items 12, 21).
    const as = await discoverPdppAuthorizationServer(issuer, {
      metadataUrl: env.PDPP_E2E_AS_METADATA_URL ?? `${PS}/.well-known/oauth-authorization-server/pdpp/v1`,
    });
    const lifecycleEndpoint = grantLifecycleEndpointOf(as);
    const rs = await discoverPdppResourceServer(env.PDPP_E2E_RESOURCE ?? PS!, {
      metadataUrl: `${PS}/.well-known/oauth-protected-resource`,
    });

    // 2. Authorization request (Client items 1, 27).
    const owner = await ownerToken(sourceId);
    const pkce = await createPkcePair();
    const detail = buildDataAccessDetail({
      source: { id: sourceId },
      purpose_code: "https://pdpp.dev/purpose/personalization",
      access_mode: "continuous",
      streams: [{ name: stream, fields, ...(env.PDPP_E2E_INSTANCE_ID && { instance_ids: [env.PDPP_E2E_INSTANCE_ID] }) }],
    });
    const request = buildAuthorizationRequest({ clientId, redirectUri, codeChallenge: pkce.codeChallenge, details: [detail] });
    const ownerHeaders = { authorization: `Bearer ${owner}`, "content-type": "application/json" };
    const authorized = await fetch(as.authorization_endpoint!, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ ...request.json, client_display: { name: "vana-sdk PDPP e2e" } }),
    });
    expect(authorized.status, await peek(authorized)).toBe(201);
    const { session_id: sessionId } = (await authorized.json()) as { session_id: string };
    const reviewed = await fetch(`${as.authorization_endpoint}/${sessionId}/review`, { headers: ownerHeaders });
    expect(reviewed.status, await peek(reviewed)).toBe(200);
    const { review } = (await reviewed.json()) as { review: { review_digest: string } };
    const approved = await fetch(`${as.authorization_endpoint}/${sessionId}/approve`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ review_digest: review.review_digest }),
    });
    expect(approved.status, await peek(approved)).toBe(200);
    const { redirect_uri: approvedRedirect } = (await approved.json()) as { redirect_uri: string };
    const code = new URL(approvedRedirect).searchParams.get("code")!;

    // 3. Exchange (Client items 13, 28, 33) and the positive assessment it carries (item 20).
    const tokens = await exchangeAuthorizationCode({ metadata: as, code, codeVerifier: pkce.codeVerifier, clientId, redirectUri });
    const issued = tokens.grants[0]!;
    expect(issued.issuer).toBe(issuer);
    const manager = new PdppHeldDataManager();
    const copy = new InMemoryPdppSyncCopy();
    manager.addStore(copy);
    const agent = new PdppLifecycleAgent({
      manager,
      lifecycleEndpoint,
      ...(as.revocation_endpoint && { revocationEndpoint: as.revocation_endpoint }),
      clientId,
      credentials: new InMemoryPdppLifecycleCredentials(),
    });
    agent.recordTokenResponse(tokens);
    const ref = grantRefOf(issued);
    expect(manager.checkUse(ref)).toEqual({ allowed: true });

    // 4. Read, paginate, sync (Client items 2-5, 10, 32).
    const client = new PdppResourceClient({
      coreQueryBase: rs.coreQueryBaseUrl,
      accessToken: tokens.accessToken,
      issuedGrant: issued,
      heldData: manager,
    });
    const first = await client.listRecords(stream, { limit: 1 });
    if (first.has_more) {
      const second = await client.listRecords(stream, { limit: 1, cursor: first.next_cursor! });
      expect(second.object).toBe("list");
    }
    const synced = await client.sync(stream, copy, { limit: 2 });
    expect(synced.restarted).toBe(false);
    const context = { grantId: issued.grant.grant_id, stream };
    expect(copy.syncToken(context)).toBeTypeOf("string");
    await client.sync(stream, copy, { limit: 2 }); // incremental pass from the stored token
    expect(client.requiredFieldGaps).toEqual([]);

    // 5. Lifecycle query (Client item 21): an active grant answers permitted.
    expect(await agent.query(ref)).toBe("answered");
    expect(manager.assessments(ref).at(-1)).toMatchObject({ source: "lifecycle", held_data: "permitted" });
  }, 60_000);
});

async function ownerToken(sourceId: string): Promise<string> {
  if (env.PDPP_E2E_OWNER_TOKEN) return env.PDPP_E2E_OWNER_TOKEN;
  if (!env.PDPP_E2E_DEV_TOKEN) throw new Error("set PDPP_E2E_OWNER_TOKEN or PDPP_E2E_DEV_TOKEN");
  const response = await fetch(`${PS}/pdpp/v1/owner/token`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.PDPP_E2E_DEV_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ source_id: sourceId }),
  });
  if (!response.ok) throw new Error(`owner token: HTTP ${response.status} ${await response.text()}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

async function peek(response: Response): Promise<string> {
  return response.ok ? "" : `HTTP ${response.status}: ${await response.clone().text()}`;
}
