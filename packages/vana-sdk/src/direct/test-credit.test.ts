import { describe, it, expect, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyWeb3Signed } from "../auth/web3-signed";
import { createDirectDataController } from "./controller";
import { EscrowBalanceTooLowError, PaymentRequiredError } from "./errors";
import type { FetchResponseLike } from "./personal-server-read";
import { requestTestCredit, TestCreditError } from "./test-credit";
import type { AccessRequestClient, AccessRequestStatus } from "./types";

const app = privateKeyToAccount(generatePrivateKey());
const signMessage = (message: string) => app.signMessage({ message });
const BASE = "https://account.example";
const OP_ID = "00000000-0000-4000-8000-000000000001";

function op(status: string) {
  return {
    id: OP_ID,
    appAddress: app.address.toLowerCase(),
    status,
    reason: "first_setup",
    amountWei: "1000000000000000000",
    txHash: "0xabc",
    lastError: null,
  };
}

function res(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("requestTestCredit", () => {
  it("signs the POST with the app key and polls until confirmed", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const responses = [
      res(op("submitted"), 202),
      res(op("submitted")),
      res(op("confirmed")),
    ];
    const fetchFn = vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return responses.shift() as Response;
    });
    const result = await requestTestCredit({
      signMessage,
      baseUrl: BASE,
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: async () => undefined,
    });
    expect(result).toEqual({ status: "funded", operation: op("confirmed") });
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/api/v1/moksha-test-credits`,
      `${BASE}/api/v1/moksha-test-credits/operations/${OP_ID}`,
      `${BASE}/api/v1/moksha-test-credits/operations/${OP_ID}`,
    ]);
    const post = calls[0].init;
    const verified = await verifyWeb3Signed({
      headerValue: (post.headers as Record<string, string>).authorization,
      expectedOrigin: BASE,
      expectedMethod: "POST",
      expectedPath: "/api/v1/moksha-test-credits",
      bodyBytes: post.body as Uint8Array,
    });
    expect(verified.signer).toBe(app.address);
    expect(
      JSON.parse(new TextDecoder().decode(post.body as Uint8Array)),
    ).toHaveProperty("idempotencyKey");
    const get = await verifyWeb3Signed({
      headerValue: (calls[1].init.headers as Record<string, string>)
        .authorization,
      expectedOrigin: BASE,
      expectedMethod: "GET",
      expectedPath: `/api/v1/moksha-test-credits/operations/${OP_ID}`,
    });
    expect(get.signer).toBe(app.address);
  });

  it("waits on the in-flight top-up when one is already open", async () => {
    const responses = [
      res(
        {
          error: { code: "operation_in_progress" },
          operation: op("submitted"),
        },
        409,
      ),
      res(op("confirmed")),
    ];
    const result = await requestTestCredit({
      signMessage,
      baseUrl: BASE,
      fetchFn: (async () => responses.shift()) as unknown as typeof fetch,
      sleep: async () => undefined,
    });
    expect(result.status).toBe("funded");
  });

  it("reports not_needed and policy refusals without throwing", async () => {
    const call = (r: Response) =>
      requestTestCredit({
        signMessage,
        baseUrl: BASE,
        fetchFn: (async () => r) as unknown as typeof fetch,
      });
    expect(
      await call(res({ error: { code: "balance_sufficient" } }, 422)),
    ).toEqual({
      status: "not_needed",
    });
    expect(
      await call(
        res({ error: { code: "account_cap_reached", message: "limit" } }, 429, {
          "retry-after": "3600",
        }),
      ),
    ).toEqual({
      status: "refused",
      code: "account_cap_reached",
      message: "limit",
      retryAfterSeconds: 3600,
    });
    expect(
      await call(
        res({ error: { code: "claim_required", message: "claim" } }, 403),
      ),
    ).toMatchObject({ status: "refused", code: "claim_required" });
  });

  it("throws on an unexpected status, a failed top-up and a timeout", async () => {
    await expect(
      requestTestCredit({
        signMessage,
        baseUrl: BASE,
        fetchFn: (async () => res({}, 500)) as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(TestCreditError);
    await expect(
      requestTestCredit({
        signMessage,
        baseUrl: BASE,
        fetchFn: (async () =>
          res(op("failed"), 202)) as unknown as typeof fetch,
      }),
    ).rejects.toThrow("Test credit top-up failed");
    await expect(
      requestTestCredit({
        signMessage,
        baseUrl: BASE,
        timeoutMs: 0,
        fetchFn: (async () =>
          res(op("submitted"), 202)) as unknown as typeof fetch,
      }),
    ).rejects.toThrow("Timed out waiting for the test credit");
  });
});

// ---------- controller auto top-up ----------

const GRANT_ID = `0x${"ab".repeat(32)}`;
const NATIVE = "0x0000000000000000000000000000000000000000";

function psResponse(body: unknown, status = 200): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const challenge = () =>
  psResponse(
    { grantId: GRANT_ID, asset: NATIVE, amount: "10000000000000000" },
    402,
  );
const tooLow = () =>
  psResponse(
    {
      success: false,
      error: "Insufficient finalized balance for this payment",
      available: "0",
    },
    402,
  );

function controller(input: {
  network: "moksha" | "mainnet";
  autoTopUp?: boolean;
  ps: FetchResponseLike[];
  account: Response[];
}) {
  const status: AccessRequestStatus = {
    status: "approved",
    personalServerUrl: "https://ps.example.com",
    grantId: GRANT_ID,
    scope: "oura.sleep",
  };
  const accessRequestClient: AccessRequestClient = {
    createAccessRequest: vi.fn(),
    getAccessRequestStatus: vi.fn(async () => status),
  };
  const accountFetch = vi.fn(async () => input.account.shift() as Response);
  const psFetch = vi.fn(async () => input.ps.shift() as FetchResponseLike);
  const vana = createDirectDataController({
    network: input.network,
    appPrivateKey: generatePrivateKey(),
    app: { id: "t", name: "T", homepageUrl: "https://t.example" },
    source: "oura",
    scopes: ["oura.sleep"],
    accessRequestClient,
    personalServerFetch: psFetch,
    escrow: {
      client: { payForOp: vi.fn() },
      escrowContract: "0x000000000000000000000000000000000000dEaD",
    },
    testCredit: {
      autoTopUp: input.autoTopUp,
      baseUrl: BASE,
      pollIntervalMs: 0,
      fetchFn: accountFetch as unknown as typeof fetch,
    },
  });
  return { vana, accountFetch, psFetch };
}

describe("readApprovedData with testCredit.autoTopUp", () => {
  it("names a low-balance refusal EscrowBalanceTooLowError (still a PaymentRequiredError)", async () => {
    const { vana } = controller({
      network: "moksha",
      ps: [challenge(), tooLow()],
      account: [],
    });
    const error = await vana
      .readApprovedData({ requestId: "dcr_1" })
      .catch((e) => e);
    expect(error).toBeInstanceOf(EscrowBalanceTooLowError);
    expect(error).toBeInstanceOf(PaymentRequiredError);
  });

  it("keeps other post-payment 402s a plain PaymentRequiredError", async () => {
    const { vana } = controller({
      network: "moksha",
      autoTopUp: true,
      ps: [challenge(), psResponse({ error: "something else" }, 402)],
      account: [],
    });
    const error = await vana
      .readApprovedData({ requestId: "dcr_1" })
      .catch((e) => e);
    expect(error).toBeInstanceOf(PaymentRequiredError);
    expect(error).not.toBeInstanceOf(EscrowBalanceTooLowError);
  });

  it("tops up on Moksha and retries the read once", async () => {
    const { vana, accountFetch, psFetch } = controller({
      network: "moksha",
      autoTopUp: true,
      ps: [challenge(), tooLow(), challenge(), psResponse({ nights: 3 })],
      account: [res(op("submitted"), 202), res(op("confirmed"))],
    });
    const result = await vana.readApprovedData({ requestId: "dcr_1" });
    expect(result.data).toEqual({ nights: 3 });
    expect(accountFetch).toHaveBeenCalledTimes(2);
    expect(psFetch).toHaveBeenCalledTimes(4);
  });

  it("does not top up on mainnet or when autoTopUp is off", async () => {
    for (const setup of [
      { network: "mainnet" as const, autoTopUp: true },
      { network: "moksha" as const, autoTopUp: false },
    ]) {
      const { vana, accountFetch } = controller({
        ...setup,
        ps: [challenge(), tooLow()],
        account: [],
      });
      await expect(
        vana.readApprovedData({ requestId: "dcr_1" }),
      ).rejects.toBeInstanceOf(EscrowBalanceTooLowError);
      expect(accountFetch).not.toHaveBeenCalled();
    }
  });

  it("rethrows the original error when the top-up is refused, without a second read", async () => {
    const { vana, psFetch } = controller({
      network: "moksha",
      autoTopUp: true,
      ps: [challenge(), tooLow()],
      account: [res({ error: { code: "inactive", message: "no reads" } }, 422)],
    });
    await expect(
      vana.readApprovedData({ requestId: "dcr_1" }),
    ).rejects.toBeInstanceOf(EscrowBalanceTooLowError);
    expect(psFetch).toHaveBeenCalledTimes(2);
  });

  it("requestTestCredit refuses on mainnet", async () => {
    const { vana } = controller({ network: "mainnet", ps: [], account: [] });
    await expect(vana.requestTestCredit()).rejects.toThrow(
      "only available on Moksha",
    );
  });
});
