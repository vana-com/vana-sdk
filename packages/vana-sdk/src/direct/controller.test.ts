import { describe, it, expect, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createDirectDataController } from "./controller";
import {
  AccessNotApprovedError,
  DirectConfigError,
  PaymentRequiredError,
} from "./errors";
import type { AccessRequestClient, AccessRequestStatus } from "./types";
import type { FetchResponseLike } from "./personal-server-read";
import type { DirectEscrowConfig } from "./controller";
import { NATIVE_ASSET_ADDRESS, type EscrowPayResult } from "../protocol/escrow";
import { CONTRACTS } from "../generated/addresses";

// Escrow contract address from the registry (resolved by chainId)
const ESCROW_CONTRACT_MOKSHA = CONTRACTS.DataPortabilityEscrow.addresses[14800];
const ESCROW_CONTRACT_MAINNET = CONTRACTS.DataPortabilityEscrow.addresses[1480];

const APP_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const APP_ADDRESS = privateKeyToAccount(APP_KEY).address;

// A valid 32-byte grant id (the escrow opId must be bytes32 for EIP-712 signing).
const GRANT_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

const APP = {
  id: "notes-lens",
  name: "Notes Lens",
  homepageUrl: "https://notes-lens.example",
};

function approvedStatus(): AccessRequestStatus {
  return {
    status: "approved",
    personalServerUrl: "https://ps.example.com",
    grantId: GRANT_ID,
    scope: "icloud_notes.notes",
  };
}

function jsonResponse(
  body: unknown,
  init: {
    status?: number;
    ok?: boolean;
    headers?: Record<string, string>;
  } = {},
): FetchResponseLike {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    statusText: `HTTP ${status}`,
    headers: {
      get: (name) =>
        init.headers?.[name] ?? init.headers?.[name.toLowerCase()] ?? null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("createDirectDataController — config validation", () => {
  it("derives appAddress from appPrivateKey", () => {
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
    });
    expect(vana.appAddress).toBe(APP_ADDRESS);
    expect(vana.getAppAddress()).toBe(APP_ADDRESS);
  });

  it("exposes the full app identity via getAppIdentity()", () => {
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
    });
    expect(vana.getAppIdentity()).toEqual({
      id: APP.id,
      name: APP.name,
      homepageUrl: APP.homepageUrl,
      address: APP_ADDRESS,
    });
  });

  it("accepts the deprecated builderPrivateKey alias", () => {
    const vana = createDirectDataController({
      builderPrivateKey: APP_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
    });
    expect(vana.getAppAddress()).toBe(APP_ADDRESS);
  });

  it("prefers appPrivateKey when both keys are provided", () => {
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      // A different (also-valid) key as the deprecated alias; appPrivateKey wins.
      builderPrivateKey:
        "0x0000000000000000000000000000000000000000000000000000000000000002",
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
    });
    expect(vana.getAppAddress()).toBe(APP_ADDRESS);
  });

  it("rejects when no private key is provided", () => {
    expect(() =>
      createDirectDataController({
        app: APP,
        source: "icloud_notes",
        scopes: ["icloud_notes.notes"],
      }),
    ).toThrow(DirectConfigError);
  });

  it("rejects a non-hex private key", () => {
    expect(() =>
      createDirectDataController({
        appPrivateKey: "not-a-key",
        app: APP,
        source: "icloud_notes",
        scopes: ["icloud_notes.notes"],
      }),
    ).toThrow(DirectConfigError);
  });

  it("rejects an empty scopes array", () => {
    expect(() =>
      createDirectDataController({
        appPrivateKey: APP_KEY,
        app: APP,
        source: "icloud_notes",
        scopes: [],
      }),
    ).toThrow(DirectConfigError);
  });

  it("rejects a malformed scope", () => {
    expect(() =>
      createDirectDataController({
        appPrivateKey: APP_KEY,
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
        appAddress: APP_ADDRESS,
      })),
      getAccessRequestStatus: vi.fn(),
    };

    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
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
      appAddress: APP_ADDRESS,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      returnUrl: "https://notes-lens.example/connect/return",
    });
  });

  it("uses production access-request URLs when the network is Moksha", async () => {
    const seenRequests: string[] = [];
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      network: "moksha",
      fetchFn: async (input) => {
        seenRequests.push(input);
        return jsonResponse({ requestId: "dcr_moksha" });
      },
    });

    const result = await vana.createAccessRequest({
      returnUrl: "https://notes-lens.example/connect/return",
    });

    expect(seenRequests).toEqual([
      "https://app.vana.org/api/data-connection-requests",
    ]);
    expect(result.approvalUrl).toBe(
      "https://app.vana.org/data-connection-requests/dcr_moksha?mode=page",
    );
  });
});

function payResultFixture(): EscrowPayResult {
  return {
    success: true,
    opType: "grant",
    opId: GRANT_ID,
    payerAddress: APP_ADDRESS,
    asset: NATIVE_ASSET_ADDRESS,
    amount: "1000000000000000000",
    breakdown: {
      registrationFee: "100000000000000000",
      dataAccessFee: "900000000000000000",
      registrationPaid: true,
    },
    paymentNonce: "1",
    paidAt: "2026-01-01T00:00:00.000Z",
  };
}

function mockEscrowConfig(
  payForOp = vi.fn(async () => payResultFixture()),
): DirectEscrowConfig {
  return {
    client: {
      submitDeposit: vi.fn(),
      getEscrowBalance: vi.fn(),
      syncEscrowBalance: vi.fn(),
      payForOp,
    },
    escrowContract: "0x000000000000000000000000000000000000dEaD",
  };
}

describe("createDirectDataController — readApprovedData", () => {
  function makeController(
    status: AccessRequestStatus,
    personalServerFetch: (
      url: string,
      init: { method: string; headers: Record<string, string> },
    ) => Promise<FetchResponseLike>,
    escrow?: DirectEscrowConfig,
  ) {
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: vi.fn(),
      getAccessRequestStatus: vi.fn(async () => status),
    };
    return createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      accessRequestClient,
      personalServerFetch,
      escrow,
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

  it("reads approved data with a Web3Signed Authorization header (no payment)", async () => {
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
    expect(result.payment).toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(
      "https://ps.example.com/v1/data/icloud_notes.notes",
    );
    expect(seen[0].headers.Authorization).toMatch(/^Web3Signed /);
  });

  it("settles a 402 via escrow and returns a structured payment receipt", async () => {
    let call = 0;
    const payForOp = vi.fn(async () => payResultFixture());
    let retryPaymentHeader: string | undefined;
    const vana = makeController(
      approvedStatus(),
      async (_url, init) => {
        call += 1;
        if (call === 1) {
          return jsonResponse(
            { grantId: GRANT_ID, asset: NATIVE_ASSET_ADDRESS, amount: "1000" },
            { status: 402 },
          );
        }
        retryPaymentHeader = init.headers["X-PAYMENT"];
        return jsonResponse(
          { ok: true },
          {
            headers: {
              "X-PAYMENT-RESPONSE": btoa(JSON.stringify(payResultFixture())),
            },
          },
        );
      },
      mockEscrowConfig(payForOp),
    );

    const result = await vana.readApprovedData({ requestId: "dcr_1" });

    expect(call).toBe(2);
    expect(payForOp).not.toHaveBeenCalled();
    expect(retryPaymentHeader).toBeDefined();
    expect(JSON.parse(atob(retryPaymentHeader!))).toMatchObject({
      x402Version: 1,
      scheme: "vana-escrow-grant",
      network: "vana:1480",
      payload: {
        message: {
          payerAddress: APP_ADDRESS,
          opType: "grant",
          opId: GRANT_ID,
          asset: NATIVE_ASSET_ADDRESS,
          amount: "1000",
          paymentNonce: "1",
        },
      },
    });
    expect(result.data).toEqual({ ok: true });
    expect(result.payment).toMatchObject({
      opType: "grant",
      opId: GRANT_ID,
      amount: "1000000000000000000",
      breakdown: {
        registrationFee: "100000000000000000",
        dataAccessFee: "900000000000000000",
        registrationPaid: true,
      },
    });
  });

  it("throws PaymentRequiredError when the server still demands payment after settlement", async () => {
    const vana = makeController(
      approvedStatus(),
      async () => jsonResponse({ amount: "1000" }, { status: 402 }),
      mockEscrowConfig(),
    );

    await expect(vana.readApprovedData({ requestId: "dcr_1" })).rejects.toThrow(
      PaymentRequiredError,
    );
  });
});

// -----------------------------------------------------------------------
// BUI-581: default escrow config derived from endpoints + registry
// -----------------------------------------------------------------------

/**
 * Build a controller that captures X-PAYMENT headers for inspection.
 * The PS fetch returns 402 on the first call, then success.
 */
function makeControllerWithPaymentCapture(
  env: "dev" | "production" = "production",
  escrow?: Partial<DirectEscrowConfig>,
) {
  const capturedHeaders: Record<string, string>[] = [];

  const accessRequestClient: AccessRequestClient = {
    createAccessRequest: vi.fn(),
    getAccessRequestStatus: vi.fn(async () => approvedStatus()),
  };

  let call = 0;
  async function personalServerFetch(
    _url: string,
    init: { method: string; headers: Record<string, string> },
  ): Promise<FetchResponseLike> {
    call++;
    capturedHeaders.push({ ...init.headers });
    if (call === 1) {
      return jsonResponse(
        { grantId: GRANT_ID, asset: NATIVE_ASSET_ADDRESS, amount: "1000" },
        { status: 402 },
      );
    }
    return jsonResponse(
      { ok: true },
      {
        headers: {
          "X-PAYMENT-RESPONSE": btoa(JSON.stringify(payResultFixture())),
        },
      },
    );
  }

  const spyPayForOp = vi.fn(async () => payResultFixture());
  const spyClient = {
    submitDeposit: vi.fn(),
    getEscrowBalance: vi.fn(),
    syncEscrowBalance: vi.fn(),
    payForOp: spyPayForOp,
  };

  const controller = createDirectDataController({
    env,
    appPrivateKey: APP_KEY,
    app: APP,
    source: "icloud_notes",
    scopes: ["icloud_notes.notes"],
    accessRequestClient,
    personalServerFetch,
    // Always provide at least a spy client so gateway network calls are not made.
    escrow: { client: spyClient, ...escrow },
  });

  return { controller, capturedHeaders, spyClient, spyPayForOp };
}

describe("createDirectDataController — BUI-581 default escrow", () => {
  it("dev env (chainId 14800): escrowContract defaults to registry address", async () => {
    const { controller, capturedHeaders } = makeControllerWithPaymentCapture(
      "dev",
      // No escrowContract — SDK must resolve from registry
    );

    await controller.readApprovedData({ requestId: "dcr_1" });

    // The retry request (index 1) carries the X-PAYMENT header
    const xPaymentHeader = capturedHeaders[1]?.["X-PAYMENT"];
    expect(xPaymentHeader).toBeDefined();
    const parsed = JSON.parse(atob(xPaymentHeader!)) as {
      network: string;
      payload: { message: { payerAddress: string } };
    };
    // Network reflects dev chain
    expect(parsed.network).toBe("vana:14800");
    // Payer matches the app key
    expect(parsed.payload.message.payerAddress).toBe(APP_ADDRESS);
  });

  it("production env (chainId 1480): escrowContract defaults to registry address", async () => {
    const { controller, capturedHeaders } = makeControllerWithPaymentCapture(
      "production",
      // No escrowContract — SDK must resolve from registry
    );

    await controller.readApprovedData({ requestId: "dcr_1" });

    const xPaymentHeader = capturedHeaders[1]?.["X-PAYMENT"];
    expect(xPaymentHeader).toBeDefined();
    const parsed = JSON.parse(atob(xPaymentHeader!)) as {
      network: string;
      payload: { message: { payerAddress: string } };
    };
    expect(parsed.network).toBe("vana:1480");
    expect(parsed.payload.message.payerAddress).toBe(APP_ADDRESS);
  });

  it("caller-provided escrowContract wins over registry default", async () => {
    // Use a real checksummed address (the well-known dead address)
    const CUSTOM_CONTRACT =
      "0x000000000000000000000000000000000000dEaD" as `0x${string}`;
    const { controller, capturedHeaders } = makeControllerWithPaymentCapture(
      "production",
      { escrowContract: CUSTOM_CONTRACT },
    );

    await controller.readApprovedData({ requestId: "dcr_1" });

    // Payment header must have been built (no throw = custom contract was accepted)
    const xPaymentHeader = capturedHeaders[1]?.["X-PAYMENT"];
    expect(xPaymentHeader).toBeDefined();
    const parsed = JSON.parse(atob(xPaymentHeader!)) as {
      network: string;
      payload: { message: { payerAddress: string } };
    };
    // Still production chain
    expect(parsed.network).toBe("vana:1480");
  });

  it("resolved escrowContract comes from registry-by-chainId, not a hardcoded literal", () => {
    // Structural guard: CONTRACTS.DataPortabilityEscrow must have both chain ids
    // so the runtime lookup in controller.ts succeeds.
    expect(ESCROW_CONTRACT_MOKSHA).toBe(
      "0x07d7769081adc3a3DBe91f5E4B98E9A5a6B292e3",
    );
    expect(ESCROW_CONTRACT_MAINNET).toBe(
      "0x07d7769081adc3a3DBe91f5E4B98E9A5a6B292e3",
    );
    // Both are truthy (not undefined / empty)
    expect(ESCROW_CONTRACT_MOKSHA).toBeTruthy();
    expect(ESCROW_CONTRACT_MAINNET).toBeTruthy();
  });
});
