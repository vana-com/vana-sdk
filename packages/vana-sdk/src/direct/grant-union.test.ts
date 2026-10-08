import { describe, it, expect, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  findLiveGrant,
  liveGrantScopes,
  mergeWithLiveGrant,
  unionGrantScopes,
  type GrantUnionGateway,
} from "./grant-union";
import { createDirectDataController } from "./controller";
import { createDefaultAccessRequestClient } from "./access-request-client";
import { DirectConfigError } from "./errors";
import type { AccessRequestClient } from "./types";
import type { GrantListItem } from "../protocol/gateway";

const OWNER = "0x00000000000000000000000000000000000000aa";
const OTHER_OWNER = "0x00000000000000000000000000000000000000bb";
const BUILDER_ID = `0x${"ab".repeat(32)}`;
const OTHER_BUILDER_ID = `0x${"cd".repeat(32)}`;

function grant(overrides: Partial<GrantListItem>): GrantListItem {
  return {
    id: `0x${"11".repeat(32)}`,
    grantorAddress: OWNER,
    granteeId: BUILDER_ID,
    scopes: [],
    status: "finalized",
    addedAt: "2026-10-01T00:00:00.000Z",
    expiresAt: null,
    expired: false,
    revokedAt: null,
    revocationSignature: null,
    paymentStatus: "paid",
    paidAt: null,
    paidBy: null,
    grantVersion: "1",
    settleTxHash: null,
    settleSubmittedAt: null,
    revocationTxHash: null,
    revocationSubmittedAt: null,
    fee: {
      asset: "0x0000000000000000000000000000000000000000",
      registrationFee: "0",
      dataAccessFee: "0",
      totalDue: "0",
    },
    ...overrides,
  };
}

/** In-memory gateway: grants keyed by owner, builders keyed by address. */
function fakeGateway(
  grantsByOwner: Record<string, GrantListItem[]>,
  builders: Record<string, string> = {},
) {
  return {
    listGrantsByUser: vi.fn(
      async (owner: string) => grantsByOwner[owner.toLowerCase()] ?? [],
    ),
    getBuilder: vi.fn(async (address: string) => {
      const id = builders[address.toLowerCase()];
      return id
        ? {
            id,
            ownerAddress: address,
            granteeAddress: address,
            publicKey: "0x",
            appUrl: "https://app.example",
            addedAt: "2026-10-01T00:00:00.000Z",
          }
        : null;
    }),
  } satisfies GrantUnionGateway;
}

describe("unionGrantScopes", () => {
  it("keeps live scopes, adds new ones, and drops removed ones", () => {
    const union = unionGrantScopes(
      ["oura.sleep", "oura.readiness", "github.repositories"],
      ["whoop.recovery", "oura.sleep"],
      ["github.repositories"],
    );
    expect(union.scopes).toEqual([
      "oura.sleep",
      "oura.readiness",
      "whoop.recovery",
    ]);
    expect(union.kept).toEqual(["oura.sleep", "oura.readiness"]);
    expect(union.added).toEqual(["whoop.recovery"]);
    expect(union.removed).toEqual(["github.repositories"]);
    expect(union.notCarried).toEqual([]);
  });

  it("matches removals verbatim, so read and write are separate entries", () => {
    const union = unionGrantScopes(
      ["coach.weekly", "write:coach.weekly"],
      ["oura.sleep"],
      ["write:coach.weekly"],
    );
    expect(union.scopes).toEqual(["coach.weekly", "oura.sleep"]);
    expect(union.removed).toEqual(["write:coach.weekly"]);
  });

  it("does not carry live entries a request cannot hold", () => {
    const union = unionGrantScopes(["chatgpt.*", "oura.sleep"], ["x.y"]);
    expect(union.scopes).toEqual(["oura.sleep", "x.y"]);
    expect(union.notCarried).toEqual(["chatgpt.*"]);
  });

  it("refuses an entry that is both requested and removed", () => {
    expect(() => unionGrantScopes([], ["oura.sleep"], ["oura.sleep"])).toThrow(
      DirectConfigError,
    );
  });

  it("deduplicates", () => {
    expect(
      unionGrantScopes(["a.b", "a.b"], ["c.d", "c.d", "a.b"]).scopes,
    ).toEqual(["a.b", "c.d"]);
  });
});

describe("liveGrantScopes / findLiveGrant", () => {
  it("returns the scopes of this app's active grant only", async () => {
    const gateway = fakeGateway({
      [OWNER]: [
        grant({ granteeId: OTHER_BUILDER_ID, scopes: ["spotify.history"] }),
        grant({ scopes: ["oura.sleep"] }),
      ],
    });
    expect(await liveGrantScopes(gateway, OWNER, BUILDER_ID)).toEqual([
      "oura.sleep",
    ]);
    expect(gateway.listGrantsByUser).toHaveBeenCalledWith(OWNER);
  });

  it("matches granteeId case-insensitively", async () => {
    const gateway = fakeGateway({
      [OWNER]: [
        grant({
          granteeId: BUILDER_ID.toUpperCase().replace("0X", "0x"),
          scopes: ["a.b"],
        }),
      ],
    });
    expect(await liveGrantScopes(gateway, OWNER, BUILDER_ID)).toEqual(["a.b"]);
  });

  it("ignores revoked and expired grants", async () => {
    const gateway = fakeGateway({
      [OWNER]: [
        grant({ scopes: ["a.b"], revokedAt: "2026-10-02T00:00:00.000Z" }),
        grant({ scopes: ["c.d"], expired: true }),
      ],
    });
    expect(await liveGrantScopes(gateway, OWNER, BUILDER_ID)).toEqual([]);
  });

  it("prefers the newest grantVersion if a stale list shows two", async () => {
    const gateway = fakeGateway({
      [OWNER]: [
        grant({ scopes: ["old.scope"], grantVersion: "2" }),
        grant({ scopes: ["new.scope"], grantVersion: "10" }),
      ],
    });
    const live = await findLiveGrant(gateway, OWNER, BUILDER_ID);
    expect(live?.scopes).toEqual(["new.scope"]);
  });
});

describe("mergeWithLiveGrant", () => {
  it("resolves the app's granteeId from its address and merges", async () => {
    const appAddress = "0x00000000000000000000000000000000000000c1";
    const gateway = fakeGateway(
      { [OWNER]: [grant({ id: "0xgrant", scopes: ["oura.sleep"] })] },
      { [appAddress]: BUILDER_ID },
    );
    const result = await mergeWithLiveGrant({
      gateway,
      owner: OWNER,
      appAddress,
      scopes: ["whoop.recovery"],
    });
    expect(result).toMatchObject({
      status: "merged",
      grantId: "0xgrant",
      scopes: ["oura.sleep", "whoop.recovery"],
      kept: ["oura.sleep"],
      added: ["whoop.recovery"],
      removed: [],
    });
  });

  it("reports no_live_grant for an owner without one", async () => {
    const gateway = fakeGateway({
      [OTHER_OWNER]: [grant({ scopes: ["a.b"] })],
    });
    const result = await mergeWithLiveGrant({
      gateway,
      owner: OWNER,
      granteeId: BUILDER_ID,
      scopes: ["whoop.recovery"],
      removeScopes: ["oura.sleep"],
    });
    expect(result.status).toBe("no_live_grant");
    expect(result.scopes).toEqual(["whoop.recovery"]);
    expect(result.removed).toEqual([]);
  });

  it("reports no_live_grant when the app is not a registered builder", async () => {
    const gateway = fakeGateway({ [OWNER]: [grant({ scopes: ["a.b"] })] });
    const result = await mergeWithLiveGrant({
      gateway,
      owner: OWNER,
      appAddress: "0x00000000000000000000000000000000000000c9",
      scopes: ["x.y"],
    });
    expect(result.status).toBe("no_live_grant");
    expect(gateway.listGrantsByUser).not.toHaveBeenCalled();
  });

  it("needs granteeId or appAddress", async () => {
    await expect(
      mergeWithLiveGrant({
        gateway: fakeGateway({}),
        owner: OWNER,
        scopes: ["x.y"],
      }),
    ).rejects.toThrow(DirectConfigError);
  });

  it("checks the requested/removed conflict before any network call", async () => {
    const gateway = fakeGateway({});
    await expect(
      mergeWithLiveGrant({
        gateway,
        owner: OWNER,
        granteeId: BUILDER_ID,
        scopes: ["x.y"],
        removeScopes: ["x.y"],
      }),
    ).rejects.toThrow(DirectConfigError);
    expect(gateway.listGrantsByUser).not.toHaveBeenCalled();
  });
});

describe("createDirectDataController — grant union", () => {
  const APP_KEY = generatePrivateKey();
  const APP_ADDRESS = privateKeyToAccount(APP_KEY).address;
  const APP = { id: "pet", name: "Pet", homepageUrl: "https://pet.example" };

  function setup(gateway: GrantUnionGateway) {
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: vi.fn(async () => ({
        requestId: "dcr_1",
        approvalUrl: "https://app.vana.org/data-connection-requests/dcr_1",
        appAddress: APP_ADDRESS,
      })),
      getAccessRequestStatus: vi.fn(),
    };
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "whoop",
      scopes: ["whoop.recovery"],
      accessRequestClient,
      gateway,
    });
    return { vana, accessRequestClient };
  }

  it("extends the owner's live grant instead of replacing it", async () => {
    const gateway = fakeGateway(
      {
        [OWNER]: [
          grant({ id: "0xg", scopes: ["oura.sleep", "github.repositories"] }),
        ],
      },
      { [APP_ADDRESS.toLowerCase()]: BUILDER_ID },
    );
    const { vana, accessRequestClient } = setup(gateway);
    const result = await vana.createAccessRequest({
      returnUrl: "https://pet.example/return",
      owner: OWNER,
      removeScopes: ["github.repositories"],
    });
    expect(accessRequestClient.createAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: ["oura.sleep", "whoop.recovery"],
        removeScopes: ["github.repositories"],
      }),
    );
    expect(result.scopes).toEqual(["oura.sleep", "whoop.recovery"]);
    expect(result.grantUnion).toMatchObject({
      status: "merged",
      grantId: "0xg",
      kept: ["oura.sleep"],
      added: ["whoop.recovery"],
      removed: ["github.repositories"],
    });
  });

  it("sends the configured scopes and reads nothing without an owner", async () => {
    const gateway = fakeGateway({});
    const { vana, accessRequestClient } = setup(gateway);
    const result = await vana.createAccessRequest({
      returnUrl: "https://pet.example/return",
      removeScopes: ["oura.sleep"],
    });
    expect(gateway.listGrantsByUser).not.toHaveBeenCalled();
    expect(accessRequestClient.createAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: ["whoop.recovery"],
        removeScopes: ["oura.sleep"],
      }),
    );
    expect(result.grantUnion?.status).toBe("owner_unknown");
  });

  it("sends duplicate configured scopes verbatim when nothing is merged", async () => {
    const accessRequestClient: AccessRequestClient = {
      createAccessRequest: vi.fn(async () => ({
        requestId: "dcr_1",
        approvalUrl: "https://app.vana.org/data-connection-requests/dcr_1",
        appAddress: APP_ADDRESS,
      })),
      getAccessRequestStatus: vi.fn(),
    };
    const gateway = fakeGateway({});
    const vana = createDirectDataController({
      appPrivateKey: APP_KEY,
      app: APP,
      source: "whoop",
      scopes: ["whoop.recovery", "whoop.sleep", "whoop.recovery"],
      accessRequestClient,
      gateway,
    });
    const result = await vana.createAccessRequest({
      returnUrl: "https://pet.example/return",
    });
    const call = vi.mocked(accessRequestClient.createAccessRequest).mock
      .calls[0]![0];
    expect(call.scopes).toEqual([
      "whoop.recovery",
      "whoop.sleep",
      "whoop.recovery",
    ]);
    expect(call).not.toHaveProperty("removeScopes");
    expect(result.scopes).toEqual(call.scopes);
    expect(gateway.listGrantsByUser).not.toHaveBeenCalled();
  });

  it("honors mergeLiveGrant: false", async () => {
    const gateway = fakeGateway({
      [OWNER]: [grant({ scopes: ["oura.sleep"] })],
    });
    const { vana, accessRequestClient } = setup(gateway);
    const result = await vana.createAccessRequest({
      returnUrl: "https://pet.example/return",
      owner: OWNER,
      mergeLiveGrant: false,
    });
    expect(gateway.listGrantsByUser).not.toHaveBeenCalled();
    const call = vi.mocked(accessRequestClient.createAccessRequest).mock
      .calls[0]![0];
    expect(call.scopes).toEqual(["whoop.recovery"]);
    expect(call).not.toHaveProperty("removeScopes");
    expect(result.grantUnion?.status).toBe("disabled");
  });

  it("still creates the request when the gateway read fails", async () => {
    const gateway: GrantUnionGateway = {
      listGrantsByUser: vi.fn(async () => {
        throw new Error("Gateway error: 503");
      }),
      getBuilder: vi.fn(async () => ({
        id: BUILDER_ID,
        ownerAddress: APP_ADDRESS,
        granteeAddress: APP_ADDRESS,
        publicKey: "0x",
        appUrl: "",
        addedAt: "",
      })),
    };
    const { vana, accessRequestClient } = setup(gateway);
    const result = await vana.createAccessRequest({
      returnUrl: "https://pet.example/return",
      owner: OWNER,
    });
    expect(accessRequestClient.createAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: ["whoop.recovery"] }),
    );
    expect(result.grantUnion).toMatchObject({
      status: "unavailable",
      reason: "Gateway error: 503",
    });
  });

  it("rejects a removal that is also requested, before any call", async () => {
    const gateway = fakeGateway({});
    const { vana, accessRequestClient } = setup(gateway);
    await expect(
      vana.createAccessRequest({
        returnUrl: "https://pet.example/return",
        owner: OWNER,
        removeScopes: ["whoop.recovery"],
      }),
    ).rejects.toThrow(DirectConfigError);
    expect(accessRequestClient.createAccessRequest).not.toHaveBeenCalled();
  });
});

describe("createDefaultAccessRequestClient — removeScopes", () => {
  function captureBody() {
    const bodies: Record<string, unknown>[] = [];
    const client = createDefaultAccessRequestClient({
      baseUrl: "https://app.vana.org",
      approvalBaseUrl: "https://app.vana.org",
      createIdempotencyKey: () => "key-1",
      fetchFn: async (_url, init) => {
        bodies.push(JSON.parse(init?.body ?? "{}"));
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ requestId: "dcr_1" }),
          text: async () => "",
        };
      },
    });
    return { client, bodies };
  }
  const base = {
    appAddress: "0x00000000000000000000000000000000000000c1",
    app: { id: "a", name: "A", homepageUrl: "https://a.example" },
    source: "whoop",
    scopes: ["whoop.recovery"],
    returnUrl: "https://a.example",
    network: "mainnet" as const,
  };

  it("sends removeScopes when non-empty", async () => {
    const { client, bodies } = captureBody();
    await client.createAccessRequest({ ...base, removeScopes: ["oura.sleep"] });
    expect(bodies[0]).toMatchObject({ removeScopes: ["oura.sleep"] });
  });

  it("omits removeScopes when empty, keeping the body unchanged", async () => {
    const { client, bodies } = captureBody();
    await client.createAccessRequest({ ...base, removeScopes: [] });
    expect(bodies[0]).not.toHaveProperty("removeScopes");
  });
});
