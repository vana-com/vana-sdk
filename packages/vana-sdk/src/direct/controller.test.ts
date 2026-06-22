import { describe, it, expect, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createDirectDataController } from "./controller";
import {
  AccessNotApprovedError,
  DirectConfigError,
  PaymentRequiredError,
} from "./errors";
import type {
  AccessRequestClient,
  AccessRequestStatus,
  PaymentChallenge,
} from "./types";
import type { FetchResponseLike } from "./personal-server-read";

const BUILDER_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const BUILDER_ADDRESS = privateKeyToAccount(BUILDER_KEY).address;

const APP = {
  id: "notes-lens",
  name: "Notes Lens",
  homepageUrl: "https://notes-lens.example",
};

function approvedStatus(): AccessRequestStatus {
  return {
    status: "approved",
    personalServerUrl: "https://ps.example.com",
    grantId: "0xgrant",
    scope: "icloud_notes.notes",
  };
}

function jsonResponse(
  body: unknown,
  init: { status?: number; ok?: boolean } = {},
): FetchResponseLike {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    statusText: `HTTP ${status}`,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("createDirectDataController — config validation", () => {
  it("derives appAddress from the builder private key", () => {
    const vana = createDirectDataController({
      builderPrivateKey: BUILDER_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
    });
    expect(vana.appAddress).toBe(BUILDER_ADDRESS);
  });

  it("rejects a non-hex private key", () => {
    expect(() =>
      createDirectDataController({
        builderPrivateKey: "not-a-key",
        app: APP,
        source: "icloud_notes",
        scopes: ["icloud_notes.notes"],
      }),
    ).toThrow(DirectConfigError);
  });

  it("rejects an empty scopes array", () => {
    expect(() =>
      createDirectDataController({
        builderPrivateKey: BUILDER_KEY,
        app: APP,
        source: "icloud_notes",
        scopes: [],
      }),
    ).toThrow(DirectConfigError);
  });

  it("rejects a malformed scope", () => {
    expect(() =>
      createDirectDataController({
        builderPrivateKey: BUILDER_KEY,
        app: APP,
        source: "icloud_notes",
        scopes: ["NOTAVALIDSCOPE"],
      }),
    ).toThrow();
  });
});

describe("createDirectDataController — createAccessRequest", () => {
  it("passes app identity, source, scopes, and appAddress to the client", async () => {
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: vi.fn(async () => ({
        requestId: "dcr_123",
        approvalUrl: "https://app.vana.org/data-connection-requests/dcr_123",
        appAddress: BUILDER_ADDRESS,
      })),
      getAccessRequestStatus: vi.fn(),
    };

    const vana = createDirectDataController({
      builderPrivateKey: BUILDER_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      accessRequestClient,
    });

    const result = await vana.createAccessRequest({
      returnUrl: "https://notes-lens.example/connect/return",
    });

    expect(result.requestId).toBe("dcr_123");
    expect(accessRequestClient.createAccessRequest).toHaveBeenCalledWith({
      appAddress: BUILDER_ADDRESS,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      returnUrl: "https://notes-lens.example/connect/return",
    });
  });
});

describe("createDirectDataController — readApprovedData", () => {
  function makeController(
    status: AccessRequestStatus,
    personalServerFetch: (
      url: string,
      init: { method: string; headers: Record<string, string> },
    ) => Promise<FetchResponseLike>,
  ) {
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: vi.fn(),
      getAccessRequestStatus: vi.fn(async () => status),
    };
    return createDirectDataController({
      builderPrivateKey: BUILDER_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      accessRequestClient,
      personalServerFetch,
    });
  }

  it("throws AccessNotApprovedError when the request is still pending", async () => {
    const vana = makeController({ status: "pending" }, async () =>
      jsonResponse({}),
    );
    await expect(vana.readApprovedData({ requestId: "dcr_1" })).rejects.toThrow(
      AccessNotApprovedError,
    );
  });

  it("reads approved data with a Web3Signed Authorization header", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const vana = makeController(approvedStatus(), async (url, init) => {
      seen.push({ url, headers: init.headers });
      return jsonResponse({ items: [1, 2, 3] });
    });

    const result = await vana.readApprovedData<{ items: number[] }>({
      requestId: "dcr_1",
    });

    expect(result.scope).toBe("icloud_notes.notes");
    expect(result.data).toEqual({ items: [1, 2, 3] });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(
      "https://ps.example.com/v1/data/icloud_notes.notes",
    );
    expect(seen[0].headers.Authorization).toMatch(/^Web3Signed /);
  });

  it("handles 402 by signing the challenge and retrying with X-PAYMENT", async () => {
    let call = 0;
    const headersByCall: Record<string, string>[] = [];
    const vana = makeController(approvedStatus(), async (_url, init) => {
      headersByCall.push(init.headers);
      call += 1;
      if (call === 1) {
        return jsonResponse(
          {
            resource: "https://ps.example.com/v1/data/icloud_notes.notes",
            accepts: [
              {
                scheme: "exact",
                network: "vana",
                maxAmountRequired: "1000",
                payTo: "0xpayto",
                asset: "0xasset",
              },
            ],
          },
          { status: 402, ok: false },
        );
      }
      return jsonResponse({ ok: true });
    });

    const result = await vana.readApprovedData({ requestId: "dcr_1" });

    expect(call).toBe(2);
    expect(result.data).toEqual({ ok: true });
    // First attempt has no X-PAYMENT; retry carries the signed voucher.
    expect(headersByCall[0]["X-PAYMENT"]).toBeUndefined();
    expect(headersByCall[1]["X-PAYMENT"]).toBeTruthy();
  });

  it("throws PaymentRequiredError when no paymentSigner can satisfy 402", async () => {
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: vi.fn(),
      getAccessRequestStatus: vi.fn(async () => approvedStatus()),
    };
    // Inject a payment signer that refuses to satisfy the challenge.
    const refusingSigner = {
      signPaymentChallenge: async (_c: PaymentChallenge): Promise<string> => {
        throw new PaymentRequiredError("cannot pay");
      },
    };
    const vana = createDirectDataController({
      builderPrivateKey: BUILDER_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      accessRequestClient,
      paymentSigner: refusingSigner,
      personalServerFetch: async () =>
        jsonResponse({ accepts: [] }, { status: 402, ok: false }),
    });

    await expect(vana.readApprovedData({ requestId: "dcr_1" })).rejects.toThrow(
      PaymentRequiredError,
    );
  });

  it("throws PaymentRequiredError when the server still demands payment after retry", async () => {
    const vana = makeController(approvedStatus(), async () =>
      jsonResponse(
        {
          accepts: [
            {
              scheme: "exact",
              network: "vana",
              maxAmountRequired: "1000",
              payTo: "0xpayto",
              asset: "0xasset",
            },
          ],
        },
        { status: 402, ok: false },
      ),
    );

    await expect(vana.readApprovedData({ requestId: "dcr_1" })).rejects.toThrow(
      PaymentRequiredError,
    );
  });
});
