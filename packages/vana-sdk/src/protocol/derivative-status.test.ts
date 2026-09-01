import { describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { parseWeb3SignedHeader } from "../auth/web3-signed";
import {
  DerivativeQuestionNotFoundError,
  DerivativeQuestionRejectedError,
  DerivativeQuestionTimeoutError,
  WriteForbiddenError,
  WriteRequestError,
  WriteTransportError,
} from "../errors";
import { createMockPersonalServer } from "../tests/mock-personal-server";
import { registerQuestion } from "./derivative-questions";
import {
  DERIVATIVE_STATUS_PATH,
  derivativeStatusTarget,
  DerivativeStatusSchema,
  getDerivativeStatus,
  isDerivativeStatusSettled,
  waitForDerivativeStatus,
} from "./derivative-status";

const PS_ORIGIN = "http://ps.test:8798";
const SOURCE_SCOPE = "oura.sleep";
const DERIVED_SCOPE = "coach.weekly";
const OTHER_SCOPE = "health.records";
const WRITE_GRANT_ID = "0xwritegrant1";
const READ_GRANT_ID = "0xreadgrant1";

const owner = privateKeyToAccount(generatePrivateKey());
const builder = privateKeyToAccount(generatePrivateKey());
const reader = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

function makeServer() {
  return createMockPersonalServer({
    origin: PS_ORIGIN,
    owner: owner.address,
    grants: [
      {
        id: WRITE_GRANT_ID,
        grantorAddress: owner.address,
        granteeId: builder.address,
        scopes: ["write:coach.*", "coach.*", "oura.*"],
      },
      {
        // The consent-flow reader: a bare read entry, no write anywhere.
        id: READ_GRANT_ID,
        grantorAddress: owner.address,
        granteeId: reader.address,
        scopes: ["coach.*"],
      },
    ],
  });
}

async function registerOne(server: ReturnType<typeof makeServer>) {
  const registration = await registerQuestion({
    personalServerUrl: PS_ORIGIN,
    signer: builder,
    grantId: WRITE_GRANT_ID,
    derivedScope: DERIVED_SCOPE,
    sourceScopes: [SOURCE_SCOPE],
    question: "How did my sleep trend this week?",
    fetch: server.fetch,
  });
  return registration.questionId;
}

const readerParams = (server: ReturnType<typeof makeServer>) => ({
  personalServerUrl: PS_ORIGIN,
  derivedScope: DERIVED_SCOPE,
  grantId: READ_GRANT_ID,
  signer: reader,
  fetch: server.fetch,
});

describe("derivativeStatusTarget", () => {
  it("puts the derived scope in the query and encodes it", () => {
    expect(derivativeStatusTarget("coach.weekly")).toBe(
      "/v1/derivatives/status?derivedScope=coach.weekly",
    );
    expect(derivativeStatusTarget("a b&c")).toBe(
      "/v1/derivatives/status?derivedScope=a%20b%26c",
    );
  });
});

describe("getDerivativeStatus", () => {
  it("reads the lifecycle of a pending question with a bare read grant", async () => {
    const server = makeServer();
    await registerOne(server);

    const status = await getDerivativeStatus(readerParams(server));

    expect(status).toEqual({
      derivedScope: DERIVED_SCOPE,
      status: "pending",
      lastComputedAt: null,
      derivedVersion: null,
      derivedCollectedAt: null,
      errorCode: null,
      retryAfterSeconds: null,
    });
  });

  it("signs the bare path, not the query, and carries the grant in the envelope", async () => {
    const server = makeServer();
    await registerOne(server);

    await getDerivativeStatus(readerParams(server));

    const call = server.requests.at(-1);
    expect(call?.method).toBe("GET");
    expect(call?.path).toBe(
      `${DERIVATIVE_STATUS_PATH}?derivedScope=${DERIVED_SCOPE}`,
    );
    const { payload } = parseWeb3SignedHeader(
      call?.headers.authorization ?? "",
    );
    expect(payload.uri).toBe(DERIVATIVE_STATUS_PATH);
    expect(payload.grantId).toBe(READ_GRANT_ID);
    expect(payload.method).toBe("GET");
  });

  it("reports a ready answer with the version the compute wrote", async () => {
    const server = makeServer();
    const questionId = await registerOne(server);
    server.settleQuestion(questionId, { status: "ready" });

    const status = await getDerivativeStatus(readerParams(server));

    expect(status.status).toBe("ready");
    expect(status.derivedVersion).toBe(1);
    expect(status.lastComputedAt).not.toBeNull();
    expect(status.errorCode).toBeNull();
    expect(isDerivativeStatusSettled(status)).toBe(true);
  });

  it("distinguishes a retrying failure from a terminal one", async () => {
    const server = makeServer();
    const questionId = await registerOne(server);

    server.settleQuestion(questionId, {
      status: "failed",
      error: "relay 503",
      errorCode: "inference_unavailable",
      retryAfterSeconds: 300,
    });
    const retrying = await getDerivativeStatus(readerParams(server));
    expect(retrying.errorCode).toBe("inference_unavailable");
    expect(retrying.retryAfterSeconds).toBe(300);
    expect(isDerivativeStatusSettled(retrying)).toBe(false);

    server.settleQuestion(questionId, {
      status: "failed",
      error: "source scope deleted",
      errorCode: "source_missing",
    });
    const terminal = await getDerivativeStatus(readerParams(server));
    expect(terminal.errorCode).toBe("source_missing");
    expect(terminal.retryAfterSeconds).toBeNull();
    expect(isDerivativeStatusSettled(terminal)).toBe(true);
  });

  it("never serves the question, its sources, its id or the raw error", async () => {
    const server = makeServer();
    const questionId = await registerOne(server);
    server.settleQuestion(questionId, {
      status: "failed",
      error: "source scope oura.sleep is deleted",
      errorCode: "source_missing",
    });

    const status = await getDerivativeStatus(readerParams(server));

    expect(Object.keys(status).sort()).toEqual([
      "derivedCollectedAt",
      "derivedScope",
      "derivedVersion",
      "errorCode",
      "lastComputedAt",
      "retryAfterSeconds",
      "status",
    ]);
    expect(JSON.stringify(status)).not.toContain(SOURCE_SCOPE);
    expect(JSON.stringify(status)).not.toContain(questionId);
  });

  it("lets the owner read without a grant", async () => {
    const server = makeServer();
    await registerOne(server);

    const status = await getDerivativeStatus({
      personalServerUrl: PS_ORIGIN,
      derivedScope: DERIVED_SCOPE,
      signer: owner,
      fetch: server.fetch,
    });

    expect(status.status).toBe("pending");
  });

  it("refuses a scope the grant does not cover, before any lookup", async () => {
    const server = makeServer();
    await registerOne(server);

    await expect(
      getDerivativeStatus({
        ...readerParams(server),
        derivedScope: OTHER_SCOPE,
      }),
    ).rejects.toBeInstanceOf(WriteForbiddenError);
  });

  it("refuses a signer holding no grant at all", async () => {
    const server = makeServer();
    await registerOne(server);

    await expect(
      getDerivativeStatus({ ...readerParams(server), signer: stranger }),
    ).rejects.toBeInstanceOf(WriteForbiddenError);
  });

  it("answers 404 for a covered scope with no question behind it", async () => {
    const server = makeServer();

    await expect(
      getDerivativeStatus(readerParams(server)),
    ).rejects.toBeInstanceOf(DerivativeQuestionNotFoundError);
  });

  it("refuses an empty derived scope before signing anything", async () => {
    const server = makeServer();

    await expect(
      getDerivativeStatus({ ...readerParams(server), derivedScope: "" }),
    ).rejects.toBeInstanceOf(WriteRequestError);
    expect(server.requests).toHaveLength(0);
  });

  it("reports a transport failure as such", async () => {
    const server = makeServer();
    await registerOne(server);
    server.failNext(1);

    await expect(
      getDerivativeStatus(readerParams(server)),
    ).rejects.toBeInstanceOf(WriteTransportError);
  });

  it("refuses a body that is not a status view", async () => {
    const server = makeServer();
    await registerOne(server);
    server.respondNextWith(200, {
      derivedScope: DERIVED_SCOPE,
      status: "done",
    });

    await expect(
      getDerivativeStatus(readerParams(server)),
    ).rejects.toBeInstanceOf(DerivativeQuestionRejectedError);
  });

  it("accepts a view from a server that omits the newer fields", () => {
    // A field the server has not sent yet reads as null, not as a parse error.
    const parsed = DerivativeStatusSchema.parse({
      derivedScope: DERIVED_SCOPE,
      status: "pending",
      lastComputedAt: null,
      derivedVersion: null,
      derivedCollectedAt: null,
    });
    expect(parsed.errorCode).toBeNull();
    expect(parsed.retryAfterSeconds).toBeNull();
  });
});

describe("waitForDerivativeStatus", () => {
  it("polls until the answer is ready", async () => {
    const server = makeServer();
    const questionId = await registerOne(server);
    let polls = 0;
    const countingFetch: typeof fetch = (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(DERIVATIVE_STATUS_PATH)) {
        polls += 1;
        if (polls === 3) server.settleQuestion(questionId, { status: "ready" });
      }
      return server.fetch(input, init);
    };

    const status = await waitForDerivativeStatus({
      ...readerParams(server),
      fetch: countingFetch,
      pollIntervalMs: 0,
    });

    expect(status.status).toBe("ready");
    // The third poll is the one that sees it: the settle lands before the
    // request it belongs to is answered.
    expect(polls).toBe(3);
  });

  it("returns a terminal failure instead of throwing", async () => {
    const server = makeServer();
    const questionId = await registerOne(server);
    server.settleQuestion(questionId, {
      status: "failed",
      error: "provider 400",
      errorCode: "internal",
    });

    const status = await waitForDerivativeStatus({
      ...readerParams(server),
      pollIntervalMs: 0,
    });

    expect(status.status).toBe("failed");
    expect(status.errorCode).toBe("internal");
  });

  it("keeps waiting through a failure the server will retry", async () => {
    const server = makeServer();
    const questionId = await registerOne(server);
    server.settleQuestion(questionId, {
      status: "failed",
      error: "relay 503",
      errorCode: "inference_unavailable",
      retryAfterSeconds: 60,
    });
    vi.useFakeTimers();

    try {
      const waiting = waitForDerivativeStatus({
        ...readerParams(server),
        timeoutMs: 120_000,
        pollIntervalMs: 0,
      });
      // The first poll sees the retrying failure, which is not a result.
      await vi.advanceTimersByTimeAsync(0);
      server.settleQuestion(questionId, { status: "ready" });
      await vi.advanceTimersByTimeAsync(60_000);

      await expect(waiting).resolves.toMatchObject({ status: "ready" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits for the server's retry time rather than the poll interval", async () => {
    const server = makeServer();
    const questionId = await registerOne(server);
    server.settleQuestion(questionId, {
      status: "failed",
      error: "relay 503",
      errorCode: "inference_unavailable",
      retryAfterSeconds: 30,
    });
    let polls = 0;
    const countingFetch: typeof fetch = (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(DERIVATIVE_STATUS_PATH)) polls += 1;
      return server.fetch(input, init);
    };
    vi.useFakeTimers();

    try {
      const waiting = waitForDerivativeStatus({
        ...readerParams(server),
        fetch: countingFetch,
        timeoutMs: 120_000,
        pollIntervalMs: 10,
      });
      // Let the first poll settle and schedule the wait.
      await vi.advanceTimersByTimeAsync(0);
      expect(polls).toBe(1);

      // The 10ms poll interval does not decide the cadence; the server's
      // 30s retry does, so nothing is asked before it fires.
      await vi.advanceTimersByTimeAsync(29_999);
      expect(polls).toBe(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(polls).toBe(2);

      server.settleQuestion(questionId, { status: "ready" });
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(waiting).resolves.toMatchObject({ status: "ready" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out while the question is still computing", async () => {
    const server = makeServer();
    await registerOne(server);

    await expect(
      waitForDerivativeStatus({
        ...readerParams(server),
        timeoutMs: 0,
        pollIntervalMs: 0,
      }),
    ).rejects.toBeInstanceOf(DerivativeQuestionTimeoutError);
  });

  it("stops on an aborted signal", async () => {
    const server = makeServer();
    await registerOne(server);
    const controller = new AbortController();
    controller.abort();

    await expect(
      waitForDerivativeStatus({
        ...readerParams(server),
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
