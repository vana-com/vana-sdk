import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildPersonalServerDataReadRequest,
  dataPathForScope,
  parsePaymentChallenge,
} from "./personal-server-read";
import type { FetchResponseLike } from "./personal-server-read";

const KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const account = privateKeyToAccount(KEY);
const signMessage = (message: string) => account.signMessage({ message });

describe("dataPathForScope", () => {
  it("builds the /v1/data/{scope} path", () => {
    expect(dataPathForScope("icloud_notes.notes")).toBe(
      "/v1/data/icloud_notes.notes",
    );
  });
});

describe("buildPersonalServerDataReadRequest", () => {
  it("produces a signed GET with grantId-bearing Web3Signed header", async () => {
    const req = await buildPersonalServerDataReadRequest({
      personalServerUrl: "https://ps.example.com/",
      scope: "icloud_notes.notes",
      grantId: "0xgrant",
      signMessage,
    });

    expect(req.method).toBe("GET");
    expect(req.url).toBe("https://ps.example.com/v1/data/icloud_notes.notes");
    expect(req.path).toBe("/v1/data/icloud_notes.notes");
    expect(req.headers.Authorization).toMatch(/^Web3Signed /);
    expect(req.headers["X-PAYMENT"]).toBeUndefined();
  });

  it("attaches X-PAYMENT when a payment header is supplied", async () => {
    const req = await buildPersonalServerDataReadRequest({
      personalServerUrl: "https://ps.example.com",
      scope: "icloud_notes.notes",
      grantId: "0xgrant",
      signMessage,
      paymentHeader: "voucher123",
    });
    expect(req.headers["X-PAYMENT"]).toBe("voucher123");
  });
});

describe("parsePaymentChallenge", () => {
  function res(body: unknown): FetchResponseLike {
    return {
      ok: false,
      status: 402,
      statusText: "Payment Required",
      headers: { get: () => null },
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }

  it("parses an x402-style accepts array", async () => {
    const challenge = await parsePaymentChallenge(
      res({
        resource: "https://ps.example.com/v1/data/x",
        accepts: [
          {
            scheme: "exact",
            network: "vana",
            maxAmountRequired: "1000",
            payTo: "0xpayto",
            asset: "0xasset",
          },
        ],
      }),
      "fallback-resource",
    );
    expect(challenge.resource).toBe("https://ps.example.com/v1/data/x");
    expect(challenge.accepts).toHaveLength(1);
    expect(challenge.accepts[0].scheme).toBe("exact");
  });

  it("falls back to the provided resource and empty accepts on a bad body", async () => {
    const challenge = await parsePaymentChallenge(
      res(null),
      "fallback-resource",
    );
    expect(challenge.resource).toBe("fallback-resource");
    expect(challenge.accepts).toEqual([]);
  });
});
