# Vana App Example

This is a runnable server-side slice of a Vana app. It mirrors the app backend
from the "Build a Vana App" guide: configure an app identity, request
user-approved data, check approval status, and read approved data through the
SDK.

The example runs locally without a registered app, live approval, escrow, or a
Personal Server. It does that by injecting local test clients:

- `accessRequestClient` returns an already approved `dcr_*` request.
- `personalServerFetch` returns sample data as if it came from
  `GET /v1/data/{scope}`.
- The app code still calls `vana.readApprovedData({ requestId })`, matching the
  production backend route in the guide.

For a real app, remove the two injected local clients and configure the default
Vana Account, Personal Server, and escrow path shown in the guide.

## Run it

From the repo root:

```bash
npm install
npm run typecheck --workspace @opendatalabs/vana-app-example
npm run start --workspace @opendatalabs/vana-app-example
```

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
  npm run start --workspace @opendatalabs/vana-app-example
```

To test a fixture branch before it is merged, set `VANA_SAMPLE_DATA_URL` to a raw
GitHub URL from that branch.

Do not paste large payloads into an agent prompt. Put the export in a local file
and give the agent the path plus the scope name. If reusable sample data belongs
in source control, add it to data-connectors and keep it sanitized.
