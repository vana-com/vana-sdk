/**
 * Moksha test credit: free test VANA for an app's own escrow while it builds.
 *
 * @remarks
 * Vana Account tops up a Moksha app's escrow when the app is claimed by a
 * Vana Account, its escrow is below 0.1 VANA, and it was just set up or paid
 * for a read in the last 7 days: +1 VANA, at most 5 VANA per Account per
 * 24 hours. Requests are signed with the app key (Web3Signed). Mainnet is
 * never topped up.
 *
 * @category Direct
 * @module direct/test-credit
 */

import { buildWeb3SignedHeader } from "../auth/web3-signed-builder";
import type { Web3SignedSignFn } from "../auth/web3-signed-builder";

/** Vana Account, which serves the test-credit API. */
export const DEFAULT_TEST_CREDIT_BASE_URL = "https://account.vana.org";

const CREATE_PATH = "/api/v1/moksha-test-credits";
const OPERATION_PATH = "/api/v1/moksha-test-credits/operations/";

/** A top-up as Vana Account reports it. */
export interface TestCreditOperation {
  id: string;
  appAddress: string;
  status: "reserved" | "signed" | "submitted" | "confirmed" | "failed";
  reason: "first_setup" | "low_balance";
  amountWei: string;
  txHash: string | null;
  lastError: string | null;
}

/** Outcome of {@link requestTestCredit}. */
export type TestCreditResult =
  /** The top-up is finalized; the escrow can pay for reads. */
  | { status: "funded"; operation: TestCreditOperation }
  /** The escrow already has at least 0.1 VANA. */
  | { status: "not_needed" }
  /**
   * Refused by policy: `inactive` (no paid read in 7 days),
   * `account_cap_reached` or `global_cap_reached` (with `retryAfterSeconds`),
   * `claim_required` (claim the app in Vana Account first) or
   * `test_credits_disabled`.
   */
  | {
      status: "refused";
      code: string;
      message: string;
      retryAfterSeconds?: number;
    };

/** The request failed or the top-up did not finalize in time. */
export class TestCreditError extends Error {
  constructor(
    message: string,
    readonly details?: { status?: number; operation?: TestCreditOperation },
  ) {
    super(message);
    this.name = "TestCreditError";
  }
}

export interface RequestTestCreditOptions {
  /** Signs with the app key (EIP-191), e.g. viem `account.signMessage`. */
  signMessage: Web3SignedSignFn;
  /** Defaults to {@link DEFAULT_TEST_CREDIT_BASE_URL}. */
  baseUrl?: string;
  /** Stable key for retrying after an uncertain response. Defaults to a new UUID. */
  idempotencyKey?: string;
  fetchFn?: typeof fetch;
  /** Defaults to 3000 ms. */
  pollIntervalMs?: number;
  /** Give up waiting for finalization after this long. Defaults to 120000 ms. */
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Ask Vana Account to top up the calling app's Moksha escrow and wait until
 * the deposit is finalized. Safe to retry with the same `idempotencyKey`.
 */
export async function requestTestCredit(
  options: RequestTestCreditOptions,
): Promise<TestCreditResult> {
  const baseUrl = (options.baseUrl ?? DEFAULT_TEST_CREDIT_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const origin = new URL(baseUrl).origin;
  const fetchFn = options.fetchFn ?? fetch;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const pollIntervalMs = options.pollIntervalMs ?? 3000;
  const deadline = Date.now() + (options.timeoutMs ?? 120_000);

  const body = new TextEncoder().encode(
    JSON.stringify({
      idempotencyKey: options.idempotencyKey ?? crypto.randomUUID(),
    }),
  );
  const created = await fetchFn(`${baseUrl}${CREATE_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: await buildWeb3SignedHeader({
        signMessage: options.signMessage,
        aud: origin,
        method: "POST",
        uri: CREATE_PATH,
        body,
      }),
    },
    body,
  });
  const createdBody = (await created.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
    operation?: TestCreditOperation;
  } & Partial<TestCreditOperation>;

  let operation: TestCreditOperation;
  if (created.status === 200 || created.status === 202) {
    operation = createdBody as TestCreditOperation;
  } else if (created.status === 409 && createdBody.operation) {
    // A top-up for this app is already in flight: wait for that one.
    operation = createdBody.operation;
  } else if (createdBody.error?.code === "balance_sufficient") {
    return { status: "not_needed" };
  } else if (
    [403, 422, 429, 503].includes(created.status) &&
    createdBody.error?.code
  ) {
    const retryAfter = Number(created.headers.get("retry-after"));
    return {
      status: "refused",
      code: createdBody.error.code,
      message: createdBody.error.message ?? createdBody.error.code,
      ...(Number.isFinite(retryAfter) && retryAfter > 0
        ? { retryAfterSeconds: retryAfter }
        : {}),
    };
  } else {
    throw new TestCreditError(
      `Test credit request failed: ${created.status} ${createdBody.error?.code ?? ""}`.trim(),
      { status: created.status },
    );
  }

  while (operation.status !== "confirmed") {
    if (operation.status === "failed") {
      throw new TestCreditError("Test credit top-up failed", { operation });
    }
    if (Date.now() >= deadline) {
      throw new TestCreditError("Timed out waiting for the test credit", {
        operation,
      });
    }
    await sleep(pollIntervalMs);
    const path = `${OPERATION_PATH}${encodeURIComponent(operation.id)}`;
    const res = await fetchFn(`${baseUrl}${path}`, {
      headers: {
        authorization: await buildWeb3SignedHeader({
          signMessage: options.signMessage,
          aud: origin,
          method: "GET",
          uri: path,
        }),
      },
    });
    if (!res.ok) {
      throw new TestCreditError(`Test credit status failed: ${res.status}`, {
        status: res.status,
        operation,
      });
    }
    operation = (await res.json()) as TestCreditOperation;
  }
  return { status: "funded", operation };
}
