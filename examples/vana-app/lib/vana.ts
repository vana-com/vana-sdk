import "server-only";

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  createDirectDataController,
  dataPathForScope,
  type AccessRequestClient,
  type AccessRequestStatus,
  type DirectDataController,
  type DirectEnv,
  type DirectNetwork,
  type DirectServiceEndpoints,
  type FetchResponseLike,
  type PersonalServerFetch,
} from "@opendatalabs/vana-sdk/server";

const SAMPLE_APP_PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const SAMPLE_REQUEST_ID = "dcr_spotify_taste_demo";
const SAMPLE_GRANT_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const SOURCE = "spotify";
const DEFAULT_SCOPE = "spotify.savedTracks";
const DEFAULT_SAMPLE_DATA_URL =
  "https://raw.githubusercontent.com/vana-com/data-connectors/main/connectors/spotify/fixtures/spotify.savedTracks.large.json";

type VanaMode = "sample" | "live";

export interface ExampleAppInfo {
  appAddress: string;
  appId: string;
  appName: string;
  appUrl: string;
  mode: VanaMode;
  network: DirectNetwork;
  sampleDataUrl: string;
  scopes: string[];
  source: string;
}

function appUrl(): string {
  return process.env.VANA_APP_URL ?? "http://localhost:3000";
}

function appConfig() {
  return {
    id: "spotify-taste",
    name: "Spotify Taste",
    homepageUrl: appUrl(),
  };
}

function vanaMode(): VanaMode {
  return process.env.VANA_MODE === "live" ? "live" : "sample";
}

function directEnv(): DirectEnv {
  return process.env.VANA_ENV === "dev" ? "dev" : "production";
}

function directNetwork(): DirectNetwork {
  return process.env.VANA_NETWORK === "mainnet" ? "mainnet" : "moksha";
}

function scopes(): string[] {
  return (process.env.VANA_SCOPES ?? DEFAULT_SCOPE)
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function sampleDataUrl(): string {
  return process.env.VANA_SAMPLE_DATA_URL ?? DEFAULT_SAMPLE_DATA_URL;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEndpoints(): Partial<DirectServiceEndpoints> | undefined {
  const endpoints: Partial<DirectServiceEndpoints> = {};
  if (process.env.VANA_ACCESS_REQUEST_BASE_URL) {
    endpoints.accessRequestBaseUrl = process.env.VANA_ACCESS_REQUEST_BASE_URL;
  }
  if (process.env.VANA_APPROVAL_APP_BASE_URL) {
    endpoints.approvalAppBaseUrl = process.env.VANA_APPROVAL_APP_BASE_URL;
  }
  if (process.env.VANA_DP_RPC_URL) {
    endpoints.escrowGatewayUrl = process.env.VANA_DP_RPC_URL;
  }
  return Object.keys(endpoints).length > 0 ? endpoints : undefined;
}

async function loadSampleData(): Promise<unknown> {
  const localPath = process.env.VANA_SAMPLE_DATA_PATH;
  if (localPath) {
    const samplePath = isAbsolute(localPath)
      ? localPath
      : resolve(process.env.INIT_CWD ?? process.cwd(), localPath);
    return JSON.parse(await readFile(samplePath, "utf8")) as unknown;
  }

  const response = await fetch(sampleDataUrl());
  if (!response.ok) {
    throw new Error(
      `Failed to load sample data: ${response.status} ${response.statusText} (${sampleDataUrl()}). ` +
        `Sample fixtures currently exist only for the "spotify" source in vana-com/data-connectors. ` +
        `For other sources, point VANA_SAMPLE_DATA_PATH at a local fixture file ` +
        `or VANA_SAMPLE_DATA_URL at your own fixture JSON.`,
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

function createSampleAccessClient(): AccessRequestClient {
  const primaryScope = scopes()[0] ?? DEFAULT_SCOPE;
  const approvedStatus: AccessRequestStatus = {
    status: "approved",
    personalServerUrl: "https://personal-server.local.test",
    grantId: SAMPLE_GRANT_ID,
    scope: primaryScope,
  };

  return {
    async createAccessRequest({ appAddress, returnUrl }) {
      return {
        requestId: SAMPLE_REQUEST_ID,
        approvalUrl: returnUrl,
        appAddress,
      };
    },
    async getAccessRequestStatus() {
      return approvedStatus;
    },
    async acknowledgeRead() {
      // Local sample-data mode has no Vana Account request to complete.
    },
  };
}

function createSamplePersonalServerFetch(): PersonalServerFetch {
  return async (input, init) => {
    const primaryScope = scopes()[0] ?? DEFAULT_SCOPE;
    if (!input.endsWith(dataPathForScope(primaryScope))) {
      return jsonResponse({ error: "Unknown sample data route" }, 404);
    }
    if (!init.headers.Authorization) {
      return jsonResponse({ error: "Missing Web3Signed auth" }, 401);
    }

    return jsonResponse(await loadSampleData());
  };
}

function createConfiguredController(): DirectDataController {
  const mode = vanaMode();
  const shared = {
    app: appConfig(),
    source: SOURCE,
    scopes: scopes(),
  };

  if (mode === "sample") {
    return createDirectDataController({
      ...shared,
      network: "moksha",
      appPrivateKey: SAMPLE_APP_PRIVATE_KEY,
      accessRequestClient: createSampleAccessClient(),
      personalServerFetch: createSamplePersonalServerFetch(),
    });
  }

  return createDirectDataController({
    ...shared,
    env: directEnv(),
    network: directNetwork(),
    appPrivateKey: requireEnv("VANA_APP_PRIVATE_KEY"),
    endpoints: optionalEndpoints(),
  });
}

let controller: DirectDataController | undefined;

export function getVanaController(): DirectDataController {
  controller ??= createConfiguredController();
  return controller;
}

export function getExampleAppInfo(): ExampleAppInfo {
  const mode = vanaMode();
  const app = appConfig();
  let appAddress = "Set VANA_APP_PRIVATE_KEY";

  if (mode === "sample") {
    appAddress = getVanaController().getAppAddress();
  } else if (process.env.VANA_APP_PRIVATE_KEY) {
    appAddress = getVanaController().getAppAddress();
  }

  return {
    appAddress,
    appId: app.id,
    appName: app.name,
    appUrl: app.homepageUrl,
    mode,
    network: directNetwork(),
    sampleDataUrl: sampleDataUrl(),
    scopes: scopes(),
    source: SOURCE,
  };
}

export function returnUrlFromRequest(requestUrl: string): string {
  return new URL(
    "/connect/return",
    process.env.VANA_APP_URL ?? requestUrl,
  ).toString();
}
