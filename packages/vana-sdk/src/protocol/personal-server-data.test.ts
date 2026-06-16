import { describe, expect, it, vi } from "vitest";

import { parseWeb3SignedHeader } from "../auth/web3-signed";
import {
  buildPersonalServerDataReadRequest,
  personalServerDataReadPath,
  readPersonalServerData,
} from "./personal-server-data";

const SIGNATURE =
  "0x11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111";

const signMessage = vi.fn(async () => SIGNATURE as `0x${string}`);

describe("personalServerDataReadPath", () => {
  it("builds the Personal Server data read path", () => {
    expect(personalServerDataReadPath("instagram.profile")).toBe(
      "/v1/data/instagram.profile",
    );
  });
});

describe("buildPersonalServerDataReadRequest", () => {
  it("builds a signed GET request with grantId in the Web3Signed claims", async () => {
    const request = await buildPersonalServerDataReadRequest({
      grantId: "0xgrant",
      headers: { "X-Trace-Id": "trace-1" },
      personalServerUrl: "https://ps.example.com/",
      scope: "instagram.profile",
      signMessage,
    });

    expect(request.method).toBe("GET");
    expect(request.url).toBe(
      "https://ps.example.com/v1/data/instagram.profile",
    );
    expect(request.headers.get("X-Trace-Id")).toBe("trace-1");

    const authorization = request.headers.get("Authorization");
    expect(authorization).toMatch(/^Web3Signed /);
    expect(authorization).toBeDefined();

    const parsed = parseWeb3SignedHeader(authorization ?? undefined);
    expect(parsed.payload).toMatchObject({
      aud: "https://ps.example.com",
      bodyHash:
        "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      grantId: "0xgrant",
      method: "GET",
      uri: "/v1/data/instagram.profile",
    });
    expect(signMessage).toHaveBeenCalledWith(parsed.payloadBase64);
  });

  it("uses an explicit audience when provided", async () => {
    const request = await buildPersonalServerDataReadRequest({
      audience: "https://aud.example.com",
      grantId: "grant-1",
      personalServerUrl: "https://ps.example.com",
      scope: "x.y",
      signMessage,
    });

    const parsed = parseWeb3SignedHeader(
      request.headers.get("Authorization") ?? undefined,
    );
    expect(parsed.payload.aud).toBe("https://aud.example.com");
  });
});

describe("readPersonalServerData", () => {
  it("fetches and parses a DataFileEnvelope", async () => {
    const envelope = {
      collectedAt: "2026-06-15T12:00:00.000Z",
      data: { username: "vana" },
      scope: "instagram.profile",
      version: "1.0",
    };
    let fetchedRequest: Request | undefined;
    const fetchMock: typeof fetch = vi.fn(async (request) => {
      fetchedRequest = request as Request;
      return Response.json(envelope);
    });

    await expect(
      readPersonalServerData({
        fetch: fetchMock,
        grantId: "grant-1",
        personalServerUrl: "https://ps.example.com",
        scope: "instagram.profile",
        signMessage,
      }),
    ).resolves.toEqual(envelope);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchedRequest).toBeInstanceOf(Request);
  });

  it("throws on non-ok Personal Server responses", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("payment required", {
          status: 402,
          statusText: "Payment Required",
        }),
    );

    await expect(
      readPersonalServerData({
        fetch: fetchMock,
        grantId: "grant-1",
        personalServerUrl: "https://ps.example.com",
        scope: "instagram.profile",
        signMessage,
      }),
    ).rejects.toThrow("Personal Server data read failed: 402 Payment Required");
  });
});
