# Vana App Example

This is a Next.js App Router example for a Vana app. It mirrors the app flow
from the "Build a Vana App" guide:

- `app/api/vana/request/route.ts` creates a user approval request.
- `app/api/vana/status/route.ts` polls the request status.
- `app/api/vana/data/route.ts` reads approved data through the SDK.
- `app/components/ConnectSpotifyButton.tsx` drives the browser approval flow
  with `useDirectVanaConnect`.

The example defaults to sample-data mode so it runs locally without a registered
app, live approval, escrow funding, or a Personal Server. Sample-data mode
injects an `accessRequestClient` and `personalServerFetch`, but the app still
calls the same `createAccessRequest`, `getAccessRequestStatus`, and
`readApprovedData` controller methods used in live mode.

## Run it

From the repo root:

```bash
npm install
npm run typecheck --workspace @opendatalabs/vana-app-example
npm run dev --workspace @opendatalabs/vana-app-example
```

Open <http://localhost:3000>. The local approval URL points at
`/connect/return`, then the original app tab polls status and reads the sample
payload.

The default sample data comes from the Spotify `spotify.savedTracks.large`
fixture in
[`vana-com/data-connectors`](https://github.com/vana-com/data-connectors). The
fixture stays in data-connectors; this SDK repo only demonstrates how an app can
consume sample data through the same read path it uses in production.

To pin the sample data locally, download it from the data-connectors index and
point the app at the file:

```bash
mkdir -p fixtures
curl -fsSL \
  https://raw.githubusercontent.com/vana-com/data-connectors/main/connectors/spotify/fixtures/spotify.savedTracks.large.json \
  -o fixtures/spotify.savedTracks.large.json
VANA_SAMPLE_DATA_PATH=fixtures/spotify.savedTracks.large.json \
  npm run dev --workspace @opendatalabs/vana-app-example
```

To test a sample-data branch before it is merged, set `VANA_SAMPLE_DATA_URL` to a
raw GitHub URL from that branch.

## Live mode

Set `VANA_MODE=live` and provide a server-side app key:

```bash
cp examples/vana-app/.env.example examples/vana-app/.env.local
# edit VANA_MODE=live and VANA_APP_PRIVATE_KEY=0x...
npm run dev --workspace @opendatalabs/vana-app-example
```

The live controller uses Vana Account access requests, Personal Server reads,
and the SDK's default DPv2 escrow settlement path. Optional endpoint overrides
are documented in `.env.example`.

## Before you ship

The API routes are deliberately unauthenticated so the example runs with zero
setup. Before deploying a real app on this template:

- **Bind the routes to a user session.** Anyone who can reach
  `/api/vana/request` can create access requests, and anyone holding a
  `requestId` can call `/api/vana/data`.
- **Keep the read cache.** `/api/vana/data` caches the result per request ID so
  repeat calls do not trigger repeat Personal Server reads (which can each
  settle a fee from escrow in live mode). If you remove or replace it, make
  sure repeat calls still cannot drain your escrow.
- **Rate-limit `/api/vana/request`.**
- **Set env vars in your host's project settings.** On Vercel, add `VANA_MODE`
  (and the rest of `.env.local`) under Project Settings → Environment Variables
  for all environments, then redeploy — `.env.local` is not uploaded, so a
  deploy without them silently falls back to sample-mode defaults or fails.
- **Polling is bounded by the SDK.** `useDirectVanaConnect` accepts
  `pollIntervalMs` and `timeoutMs` (default 5 minutes). Use those instead of
  hand-rolling a polling loop that never expires.

Do not paste large payloads into an agent prompt. Put the export in a local file
and give the agent the path plus the scope name. If reusable sample data belongs
in source control, add it to data-connectors and keep it sanitized.
