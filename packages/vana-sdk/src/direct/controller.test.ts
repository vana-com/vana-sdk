import { describe, it, expect, vi } from "vitest";
import { verifyTypedData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createDirectDataController } from "./controller";
import {
  AccessNotApprovedError,
  DirectConfigError,
  PaymentRequiredError,
  ScopeNotApprovedError,
} from "./errors";
import type { AccessRequestClient, AccessRequestStatus } from "./types";
import type { FetchResponseLike } from "./personal-server-read";
import type { DirectEscrowConfig } from "./controller";
import {
  GENERIC_PAYMENT_TYPES,
  NATIVE_ASSET_ADDRESS,
  genericPaymentDomain,
  type EscrowPayResult,
} from "../protocol/escrow";
import { CONTRACTS } from "../generated/addresses";
import { InvalidScopeEntryError } from "../protocol/scope-actions";

// Escrow contract address from the registry (resolved by chainId)
const ESCROW_CONTRACT_MOKSHA = CONTRACTS.DataPortabilityEscrow.addresses[14800];
const ESCROW_CONTRACT_MAINNET = CONTRACTS.DataPortabilityEscrow.addresses[1480];

const APP_KEY = generatePrivateKey();
const APP_ADDRESS = privateKeyToAccount(APP_KEY).address;

// A valid 32-byte grant id (the escrow opId must be bytes32 for EIP-712 signing).
const GRANT_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

const APP = {
  id: "notes-lens",
  name: "Notes Lens",
  homepageUrl: "https://notes-lens.example",
};

type DecodedPaymentHeader = {
  network: string;
  payload: {
    message: {
      amount: string;
      asset: `0x${string}`;
      opId: `0x${string}`;
      opType: string;
      payerAddress: `0x${string}`;
      paymentNonce: string;
    };
    signature: `0x${string}`;
  };
};

function approvedStatus(): AccessRequestStatus {
  return {
    status: "approved",
    personalServerUrl: "https://ps.example.com",
    grantId: GRANT_ID,
    scope: "icloud_notes.notes",
  };
}

function readyForReadStatus(): AccessRequestStatus {
  return {
    ...approvedStatus(),
    status: "ready_for_read",
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
      builderPrivateKey: generatePrivateKey(),
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

  it("accepts a write-grant scope entry", () => {
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: ["write:coach.weekly"],
    });
    expect(vana.getAppAddress()).toBe(APP_ADDRESS);
  });

  it("accepts a mixed read and write scope list", () => {
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: [
        "oura.sleep",
        "icloud_notes.notes",
        "coach.weekly",
        "write:coach.weekly",
      ],
    });
    expect(vana.getAppAddress()).toBe(APP_ADDRESS);
  });

  it("validates the scope part behind the operation prefix", () => {
    expect(() =>
      createDirectDataController({
        appPrivateKey: APP_KEY,
        app: APP,
        source: "icloud_notes",
        scopes: ["write:NOTAVALIDSCOPE"],
      }),
    ).toThrow();
  });

  it("rejects an unknown operation instead of taking it as read", () => {
    for (const entry of [
      "delete:coach.weekly",
      "read:coach.weekly",
      "WRITE:coach.weekly",
      "write:",
      "write:a:b",
    ]) {
      expect(
        () =>
          createDirectDataController({
            appPrivateKey: APP_KEY,
            app: APP,
            source: "icloud_notes",
            scopes: [entry],
          }),
        entry,
      ).toThrow(InvalidScopeEntryError);
    }
  });

  it("rejects a wildcard pattern for either operation", () => {
    // This flow reads approved scopes back one by one, so the scope part must
    // be a concrete scope even though the grant grammar allows wildcards.
    for (const entry of ["chatgpt.*", "write:chatgpt.*", "*", "write:*"]) {
      expect(
        () =>
          createDirectDataController({
            appPrivateKey: APP_KEY,
            app: APP,
            source: "icloud_notes",
            scopes: [entry],
          }),
        entry,
      ).toThrow();
    }
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
      foregroundDelivery: {
        url: "https://notes-lens.example/api/vana/delivery",
        token: "a".repeat(43),
      },
    });

    expect(result.requestId).toBe("dcr_123");
    expect(accessRequestClient.createAccessRequest).toHaveBeenCalledWith({
      appAddress: APP_ADDRESS,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      returnUrl: "https://notes-lens.example/connect/return",
      network: "mainnet",
      foregroundDelivery: {
        url: "https://notes-lens.example/api/vana/delivery",
        token: "a".repeat(43),
      },
    });
  });

  it("sends write-grant entries to the client with the prefix intact", async () => {
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: vi.fn(async () => ({
        requestId: "dcr_write",
        approvalUrl: "https://app.vana.org/data-connection-requests/dcr_write",
        appAddress: APP_ADDRESS,
      })),
      getAccessRequestStatus: vi.fn(),
    };
    // The entries the grantor signs, verbatim: the SDK must not normalize,
    // reorder, or drop the `write:` prefix on the way to the access request.
    const scopes = ["oura.sleep", "coach.weekly", "write:coach.weekly"];

    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "oura",
      scopes,
      accessRequestClient,
    });

    await vana.createAccessRequest({
      returnUrl: "https://notes-lens.example/connect/return",
    });

    expect(accessRequestClient.createAccessRequest).toHaveBeenCalledWith({
      appAddress: APP_ADDRESS,
      app: APP,
      source: "oura",
      scopes,
      returnUrl: "https://notes-lens.example/connect/return",
      network: "mainnet",
    });
  });

  function makeNetworkFixture(
    overrides: Partial<Parameters<typeof createDirectDataController>[0]> = {},
  ) {
    const spy = vi.fn(async () => ({
      requestId: "dcr_x",
      approvalUrl: "https://app.vana.org/data-connection-requests/dcr_x",
      appAddress: APP_ADDRESS,
    }));
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: spy,
      getAccessRequestStatus: vi.fn(),
    };
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      accessRequestClient,
      ...overrides,
    });
    return { vana, spy };
  }

  it("sends network=mainnet when env=production (default)", async () => {
    const { vana, spy } = makeNetworkFixture({ env: "production" });
    await vana.createAccessRequest({
      returnUrl: "https://notes-lens.example/return",
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ network: "mainnet" }),
    );
  });

  it("sends network=moksha when env=production and network=moksha", async () => {
    const { vana, spy } = makeNetworkFixture({
      env: "production",
      network: "moksha",
    });
    await vana.createAccessRequest({
      returnUrl: "https://notes-lens.example/return",
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ network: "moksha" }),
    );
  });

  it("sends network=moksha when env=dev (default)", async () => {
    const { vana, spy } = makeNetworkFixture({ env: "dev" });
    await vana.createAccessRequest({
      returnUrl: "https://notes-lens.example/return",
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ network: "moksha" }),
    );
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

async function expectPaymentHeaderDomain(
  xPaymentHeader: string | undefined,
  input: { chainId: number; escrowContract: `0x${string}`; network: string },
) {
  expect(xPaymentHeader).toBeDefined();
  const parsed = JSON.parse(atob(xPaymentHeader!)) as DecodedPaymentHeader;
  expect(parsed.network).toBe(input.network);
  expect(parsed.payload.message.payerAddress).toBe(APP_ADDRESS);

  await expect(
    verifyTypedData({
      address: APP_ADDRESS,
      domain: genericPaymentDomain(input.chainId, input.escrowContract),
      types: GENERIC_PAYMENT_TYPES,
      primaryType: "GenericPayment",
      message: {
        ...parsed.payload.message,
        amount: BigInt(parsed.payload.message.amount),
        paymentNonce: BigInt(parsed.payload.message.paymentNonce),
      },
      signature: parsed.payload.signature,
    }),
  ).resolves.toBe(true);
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

  it("acknowledges the access request after a successful read", async () => {
    const acknowledgeRead = vi.fn(async () => undefined);
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: vi.fn(),
      getAccessRequestStatus: vi.fn(async () => approvedStatus()),
      acknowledgeRead,
    };
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      accessRequestClient,
      personalServerFetch: async () => jsonResponse({ ok: true }),
      escrow: mockEscrowConfig(),
    });

    const result = await vana.readApprovedData({ requestId: "dcr_1" });

    expect(result.data).toEqual({ ok: true });
    expect(acknowledgeRead).toHaveBeenCalledOnce();
    expect(acknowledgeRead).toHaveBeenCalledWith("dcr_1");
  });

  it("returns the successful read when acknowledgement fails", async () => {
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: vi.fn(),
      getAccessRequestStatus: vi.fn(async () => approvedStatus()),
      acknowledgeRead: vi.fn(async () => {
        throw new Error("ack failed");
      }),
    };
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "icloud_notes",
      scopes: ["icloud_notes.notes"],
      accessRequestClient,
      personalServerFetch: async () => jsonResponse({ ok: true }),
      escrow: mockEscrowConfig(),
    });

    const result = await vana.readApprovedData({ requestId: "dcr_1" });

    expect(result.data).toEqual({ ok: true });
    expect(accessRequestClient.acknowledgeRead).toHaveBeenCalledOnce();
  });

  it("reads data when the access request is ready_for_read", async () => {
    const vana = makeController(readyForReadStatus(), async () =>
      jsonResponse({ ok: true }),
    );

    const result = await vana.readApprovedData({ requestId: "dcr_1" });

    expect(result.data).toEqual({ ok: true });
  });

  it("throws AccessNotApprovedError and does not read when the DCR is completed", async () => {
    const personalServerFetch = vi.fn(async () => jsonResponse({ ok: true }));
    const vana = makeController(
      { ...approvedStatus(), status: "completed" },
      personalServerFetch,
    );

    await expect(vana.readApprovedData({ requestId: "dcr_1" })).rejects.toThrow(
      AccessNotApprovedError,
    );
    // `completed` is terminal, not read-ready: the PS is never contacted.
    expect(personalServerFetch).not.toHaveBeenCalled();
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
    if (call % 2 === 1) {
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
    await expectPaymentHeaderDomain(capturedHeaders[1]?.["X-PAYMENT"], {
      chainId: 14800,
      escrowContract: ESCROW_CONTRACT_MOKSHA,
      network: "vana:14800",
    });
  });

  it("production env (chainId 1480): escrowContract defaults to registry address", async () => {
    const { controller, capturedHeaders } = makeControllerWithPaymentCapture(
      "production",
      // No escrowContract — SDK must resolve from registry
    );

    await controller.readApprovedData({ requestId: "dcr_1" });

    await expectPaymentHeaderDomain(capturedHeaders[1]?.["X-PAYMENT"], {
      chainId: 1480,
      escrowContract: ESCROW_CONTRACT_MAINNET,
      network: "vana:1480",
    });
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

    await expectPaymentHeaderDomain(capturedHeaders[1]?.["X-PAYMENT"], {
      chainId: 1480,
      escrowContract: CUSTOM_CONTRACT,
      network: "vana:1480",
    });
  });

  it("chainId override requires a matching escrowContract when not in the registry", () => {
    expect(() =>
      makeControllerWithPaymentCapture("production", { chainId: 31337 }),
    ).toThrow(/chainId 31337/);
  });

  it("default escrow config uses a process-local nonce source across reads", async () => {
    const { controller, capturedHeaders } =
      makeControllerWithPaymentCapture("production");

    await controller.readApprovedData({ requestId: "dcr_1" });
    await controller.readApprovedData({ requestId: "dcr_2" });

    const paymentNonces = [capturedHeaders[1], capturedHeaders[3]].map(
      (headers) =>
        BigInt(
          (JSON.parse(atob(headers["X-PAYMENT"])) as DecodedPaymentHeader)
            .payload.message.paymentNonce,
        ),
    );

    expect(paymentNonces[1]).toBe(paymentNonces[0] + 1n);
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

describe("createDirectDataController — multi-scope reads", () => {
  const MULTI_SCOPES = [
    "linkedin.profile",
    "linkedin.skills",
    "linkedin.education",
  ];

  function multiScopeStatus(): AccessRequestStatus {
    return {
      status: "approved",
      personalServerUrl: "https://ps.example.com",
      grantId: GRANT_ID,
      scope: MULTI_SCOPES[0],
      scopes: MULTI_SCOPES,
    };
  }

  function makeMultiScopeController(
    personalServerFetch: (
      url: string,
      init: { method: string; headers: Record<string, string> },
    ) => Promise<FetchResponseLike>,
    acknowledgeRead = vi.fn(async () => undefined),
  ) {
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: vi.fn(),
      getAccessRequestStatus: vi.fn(async () => multiScopeStatus()),
      acknowledgeRead,
    };
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "linkedin",
      scopes: MULTI_SCOPES,
      accessRequestClient,
      personalServerFetch,
      escrow: mockEscrowConfig(),
    });
    return { vana, acknowledgeRead };
  }

  it("reads the named scope instead of the first approved one", async () => {
    const seen: string[] = [];
    const { vana } = makeMultiScopeController(async (url) => {
      seen.push(url);
      return jsonResponse({ skills: ["typescript"] });
    });

    const result = await vana.readApprovedData({
      requestId: "dcr_1",
      scope: "linkedin.skills",
    });

    expect(result.scope).toBe("linkedin.skills");
    expect(result.data).toEqual({ skills: ["typescript"] });
    expect(seen).toEqual(["https://ps.example.com/v1/data/linkedin.skills"]);
  });

  it("rejects a scope the user did not approve without contacting the Personal Server", async () => {
    const personalServerFetch = vi.fn(async () => jsonResponse({ ok: true }));
    const { vana } = makeMultiScopeController(personalServerFetch);

    await expect(
      vana.readApprovedData({ requestId: "dcr_1", scope: "spotify.profile" }),
    ).rejects.toThrow(ScopeNotApprovedError);
    expect(personalServerFetch).not.toHaveBeenCalled();
  });

  it("still reads the first approved scope when no scope is given", async () => {
    const seen: string[] = [];
    const { vana } = makeMultiScopeController(async (url) => {
      seen.push(url);
      return jsonResponse({ ok: true });
    });

    const result = await vana.readApprovedData({ requestId: "dcr_1" });

    expect(result.scope).toBe("linkedin.profile");
    expect(seen).toEqual(["https://ps.example.com/v1/data/linkedin.profile"]);
  });

  it("skips acknowledgement when acknowledge is false", async () => {
    const { vana, acknowledgeRead } = makeMultiScopeController(async () =>
      jsonResponse({ ok: true }),
    );

    await vana.readApprovedData({
      requestId: "dcr_1",
      scope: "linkedin.skills",
      acknowledge: false,
    });

    expect(acknowledgeRead).not.toHaveBeenCalled();
  });

  it("reads every approved scope and keys the results by scope", async () => {
    const { vana } = makeMultiScopeController(async (url) =>
      jsonResponse({ from: url.split("/v1/data/")[1] }),
    );

    const result = await vana.readAllApprovedData({ requestId: "dcr_1" });

    expect(Object.keys(result.results)).toEqual(MULTI_SCOPES);
    expect(result.results["linkedin.education"].data).toEqual({
      from: "linkedin.education",
    });
    expect(result.errors).toEqual({});
  });

  it("acknowledges once, after every scope has been read", async () => {
    const readsBeforeAck: string[] = [];
    const acknowledgeRead = vi.fn(async () => {
      readsBeforeAck.push("ack");
      return undefined;
    });
    const { vana } = makeMultiScopeController(async (url) => {
      readsBeforeAck.push(url.split("/v1/data/")[1]);
      return jsonResponse({ ok: true });
    }, acknowledgeRead);

    await vana.readAllApprovedData({ requestId: "dcr_1" });

    expect(acknowledgeRead).toHaveBeenCalledOnce();
    expect(readsBeforeAck).toEqual([...MULTI_SCOPES, "ack"]);
  });

  it("keeps the scopes that were paid for when a later scope fails", async () => {
    const { vana } = makeMultiScopeController(async (url) => {
      if (url.endsWith("linkedin.skills")) {
        return jsonResponse({ error: "boom" }, { status: 500 });
      }
      return jsonResponse({ ok: true });
    });

    const result = await vana.readAllApprovedData({ requestId: "dcr_1" });

    expect(Object.keys(result.results)).toEqual([
      "linkedin.profile",
      "linkedin.education",
    ]);
    expect(Object.keys(result.errors)).toEqual(["linkedin.skills"]);
  });
});

describe("createDirectDataController — readAllApprovedData failure handling", () => {
  it("does not acknowledge when every scope fails", async () => {
    // Acknowledging moves the DCR to `completed`, which is terminal. Doing that
    // after reading nothing would destroy a request the app could still retry.
    const acknowledgeRead = vi.fn(async () => undefined);
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: vi.fn(),
      getAccessRequestStatus: vi.fn(async () => ({
        status: "approved" as const,
        personalServerUrl: "https://ps.example.com",
        grantId: GRANT_ID,
        scope: "linkedin.profile",
        scopes: ["linkedin.profile", "linkedin.skills"],
      })),
      acknowledgeRead,
    };
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "linkedin",
      scopes: ["linkedin.profile", "linkedin.skills"],
      accessRequestClient,
      personalServerFetch: async () =>
        jsonResponse({ error: "down" }, { status: 500 }),
      escrow: mockEscrowConfig(),
    });

    const result = await vana.readAllApprovedData({ requestId: "dcr_1" });

    expect(result.results).toEqual({});
    expect(Object.keys(result.errors)).toEqual([
      "linkedin.profile",
      "linkedin.skills",
    ]);
    expect(acknowledgeRead).not.toHaveBeenCalled();
  });
});

describe("createDirectDataController — multi-scope read safety (codex review)", () => {
  const SCOPES = ["linkedin.profile", "linkedin.skills"];

  function makeController(
    personalServerFetch: (
      url: string,
      init: { method: string; headers: Record<string, string> },
    ) => Promise<FetchResponseLike>,
    status: AccessRequestStatus,
    acknowledgeRead = vi.fn(async () => undefined),
  ) {
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: vi.fn(),
      getAccessRequestStatus: vi.fn(async () => status),
      acknowledgeRead,
    };
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "linkedin",
      scopes: SCOPES,
      accessRequestClient,
      personalServerFetch,
      escrow: mockEscrowConfig(),
    });
    return { vana, acknowledgeRead };
  }

  it("does not acknowledge when any scope failed, so the failed scope stays retryable", async () => {
    // Acknowledging moves the DCR to `completed`, which is terminal. Acking on a
    // partial success would make the scope that failed impossible to retry.
    const { vana, acknowledgeRead } = makeController(
      async (url) =>
        url.endsWith("linkedin.skills")
          ? jsonResponse({ error: "boom" }, { status: 500 })
          : jsonResponse({ ok: true }),
      {
        status: "approved",
        personalServerUrl: "https://ps.example.com",
        grantId: GRANT_ID,
        scope: "linkedin.profile",
        scopes: SCOPES,
      },
    );

    const result = await vana.readAllApprovedData({ requestId: "dcr_1" });

    expect(Object.keys(result.results)).toEqual(["linkedin.profile"]);
    expect(Object.keys(result.errors)).toEqual(["linkedin.skills"]);
    expect(acknowledgeRead).not.toHaveBeenCalled();
  });

  it("reads a status that carries scopes but no singular scope", async () => {
    // `scope` is optional on the public status type. A client that returns only
    // the array is still read-ready.
    const seen: string[] = [];
    const { vana } = makeController(
      async (url) => {
        seen.push(url);
        return jsonResponse({ ok: true });
      },
      {
        status: "approved",
        personalServerUrl: "https://ps.example.com",
        grantId: GRANT_ID,
        scopes: SCOPES,
      },
    );

    const result = await vana.readApprovedData({ requestId: "dcr_1" });

    expect(result.scope).toBe("linkedin.profile");
    expect(seen).toEqual(["https://ps.example.com/v1/data/linkedin.profile"]);
  });
});

describe("createDirectDataController - questions", () => {
  const QUESTION = {
    derivedScope: "coach.weekly",
    sourceScopes: ["oura.sleep"],
    question: "How did I sleep this week?",
    recompute: "snapshot" as const,
  };

  function questionsFixture(scopes: string[]) {
    const spy = vi.fn(async () => ({
      requestId: "dcr_q",
      approvalUrl: "https://app.vana.org/data-connection-requests/dcr_q",
      appAddress: APP_ADDRESS,
    }));
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: spy,
      getAccessRequestStatus: vi.fn(),
    };
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "oura",
      scopes,
      accessRequestClient,
    });
    return { vana, spy };
  }

  it("passes questions through to the client verbatim", async () => {
    const { vana, spy } = questionsFixture(["oura.sleep", "coach.weekly"]);

    await vana.createAccessRequest({
      returnUrl: "https://notes-lens.example/return",
      questions: [QUESTION],
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ questions: [QUESTION] }),
    );
  });

  it("rejects a derived scope missing from the configured scopes before calling the client", async () => {
    // "coach.weekly" is not among the controller scopes, so the app could
    // never read the answer it asked for.
    const { vana, spy } = questionsFixture(["oura.sleep"]);

    await expect(
      vana.createAccessRequest({
        returnUrl: "https://notes-lens.example/return",
        questions: [QUESTION],
      }),
    ).rejects.toThrow(DirectConfigError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects more than four questions before calling the client", async () => {
    const { vana, spy } = questionsFixture(["oura.sleep", "coach.weekly"]);

    await expect(
      vana.createAccessRequest({
        returnUrl: "https://notes-lens.example/return",
        questions: Array.from({ length: 5 }, () => QUESTION),
      }),
    ).rejects.toThrow(DirectConfigError);
    expect(spy).not.toHaveBeenCalled();
  });
});
