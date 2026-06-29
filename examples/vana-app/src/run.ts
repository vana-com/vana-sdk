import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createDirectDataController,
  type AccessRequestClient,
  type AccessRequestStatus,
  type FetchResponseLike,
  type PersonalServerFetch,
} from "@opendatalabs/vana-sdk/server";

const APP_PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const REQUEST_ID = "dcr_spotify_taste_demo";
const GRANT_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const SOURCE = "spotify";
const SCOPE = "spotify.savedTracks";
const DEFAULT_SAMPLE_DATA_URL =
  "https://raw.githubusercontent.com/vana-com/data-connectors/main/connectors/spotify/fixtures/spotify.savedTracks.large.json";

async function loadSampleData(): Promise<unknown> {
  const localPath = process.env.VANA_SAMPLE_DATA_PATH;
  if (localPath) {
    return JSON.parse(await readFile(resolve(localPath), "utf8")) as unknown;
  }

  const sampleDataUrl =
    process.env.VANA_SAMPLE_DATA_URL ?? DEFAULT_SAMPLE_DATA_URL;
  const response = await fetch(sampleDataUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to load sample data: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as unknown;
}

function jsonResponse(body: unknown, status = 200): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function createLocalAccessClient(): AccessRequestClient {
  const approvedStatus: AccessRequestStatus = {
    status: "approved",
    personalServerUrl: "https://personal-server.local.test",
    grantId: GRANT_ID,
    scope: SCOPE,
  };

  return {
    async createAccessRequest({ appAddress }) {
      return {
        requestId: REQUEST_ID,
        approvalUrl: "https://app.vana.org/approval/demo",
        appAddress,
      };
    },
    async getAccessRequestStatus() {
      return approvedStatus;
    },
    async acknowledgeRead() {
      // No-op for local sample-data reads.
    },
  };
}

function createLocalPersonalServerFetch(): PersonalServerFetch {
  return async (input, init) => {
    if (!input.endsWith(`/v1/data/${encodeURIComponent(SCOPE)}`)) {
      return jsonResponse({ error: "Unknown sample data route" }, 404);
    }
    if (!init.headers.Authorization) {
      return jsonResponse({ error: "Missing Web3Signed auth" }, 401);
    }

    return jsonResponse(await loadSampleData());
  };
}

const vana = createDirectDataController({
  network: "moksha",
  appPrivateKey: process.env.VANA_APP_PRIVATE_KEY ?? APP_PRIVATE_KEY,
  app: {
    id: "spotify-taste",
    name: "Spotify Taste",
    homepageUrl: "http://localhost:3000",
  },
  source: SOURCE,
  scopes: [SCOPE],
  accessRequestClient: createLocalAccessClient(),
  personalServerFetch: createLocalPersonalServerFetch(),
});

const result = await vana.readApprovedData({ requestId: REQUEST_ID });

console.log(JSON.stringify(result, null, 2));
