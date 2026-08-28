import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress } from "viem";
import { parseWeb3SignedHeader } from "../auth/web3-signed";
import { buildWeb3SignedHeader } from "../auth/web3-signed-builder";
import {
  DerivativeComputeUnavailableError,
  DerivativeCycleError,
  DerivativeQuestionFailedError,
  DerivativeQuestionInvalidError,
  DerivativeQuestionNotFoundError,
  DerivativeQuestionTimeoutError,
  DerivativeSourceNotGrantedError,
  WriteForbiddenError,
  WriteRequestError,
  WriteUnauthorizedError,
} from "../errors";
import {
  createMockPersonalServer,
  type MockPersonalServer,
} from "../tests/mock-personal-server";
import {
  askPersonalServer,
  deleteQuestion,
  DERIVATIVE_QUESTIONS_PATH,
  getQuestion,
  listQuestions,
  recomputeQuestion,
  registerQuestion,
  waitForQuestion,
} from "./derivative-questions";
import { WRITE_SIGNATURE_HEADER } from "./personal-server-write";

const ORIGIN = "http://ps.test:8799";
const SOURCE_SCOPE = "oura.sleep";
const OTHER_SOURCE_SCOPE = "chatgpt.conversations";
const DERIVED_SCOPE = "coach.weekly";
const QUESTION = "How did my sleep relate to my mood this week?";

/** Read every source, read the derived scope, write the derived scope. */
const GRANT_ID = "0xquestiongrant";
/** Same, but without the source read entries. */
const NO_SOURCE_GRANT_ID = "0xquestiongrant-nosources";
/** Wide enough to register the other half of a cycle. */
const WIDE_GRANT_ID = "0xquestiongrant-wide";
/** A second builder holding its own grant on the same derived scope. */
const OTHER_GRANT_ID = "0xquestiongrant-other";

const owner = privateKeyToAccount(generatePrivateKey());
const builder = privateKeyToAccount(generatePrivateKey());
const otherBuilder = privateKeyToAccount(generatePrivateKey());

function makeServer(
  overrides: Partial<Parameters<typeof createMockPersonalServer>[0]> = {},
): MockPersonalServer {
  return createMockPersonalServer({
    origin: ORIGIN,
    owner: owner.address,
    grants: [
      {
        id: GRANT_ID,
        grantorAddress: owner.address,
        granteeId: builder.address,
        scopes: [
          SOURCE_SCOPE,
          OTHER_SOURCE_SCOPE,
          DERIVED_SCOPE,
          `write:${DERIVED_SCOPE}`,
        ],
      },
      {
        id: NO_SOURCE_GRANT_ID,
        grantorAddress: owner.address,
        granteeId: builder.address,
        scopes: [DERIVED_SCOPE, `write:${DERIVED_SCOPE}`],
      },
      {
        id: WIDE_GRANT_ID,
        grantorAddress: owner.address,
        granteeId: builder.address,
        scopes: [
          SOURCE_SCOPE,
          DERIVED_SCOPE,
          `write:${DERIVED_SCOPE}`,
          "write:oura.*",
        ],
      },
      {
        id: OTHER_GRANT_ID,
        grantorAddress: owner.address,
        granteeId: otherBuilder.address,
        scopes: [SOURCE_SCOPE, DERIVED_SCOPE, `write:${DERIVED_SCOPE}`],
      },
    ],
    ...overrides,
  });
}

function auth(server: MockPersonalServer, grantId = GRANT_ID) {
  return {
    personalServerUrl: ORIGIN,
    signer: builder,
    grantId,
    fetch: server.fetch,
    retry: { attempts: 1 },
  };
}

const registration = {
  derivedScope: DERIVED_SCOPE,
  sourceScopes: [SOURCE_SCOPE, OTHER_SOURCE_SCOPE],
  question: QUESTION,
};

function proofsIn(server: MockPersonalServer): string[] {
  return server.requests
    .map((request) => request.headers["x-vana-write-signature"])
    .filter((value): value is string => value !== undefined);
}

function handshakeCount(server: MockPersonalServer): number {
  return server.requests.filter(
    (request) => request.path === "/v1/write/session",
  ).length;
}

describe("registerQuestion", () => {
  it("opens one write session and posts a signed, compact registration", async () => {
    const server = makeServer();
    const question = await registerQuestion({
      ...auth(server),
      ...registration,
      model: "z-ai/glm-5.2",
    });

    expect(question.status).toBe("pending");
    expect(question.derivedScope).toBe(DERIVED_SCOPE);
    expect(question.sourceScopes).toEqual([SOURCE_SCOPE, OTHER_SOURCE_SCOPE]);
    expect(question.model).toBe("z-ai/glm-5.2");
    expect(question.registeredBy).toEqual({
      kind: "builder",
      builder: builder.address,
      grantId: GRANT_ID,
    });
    expect(question.lastComputedAt).toBeNull();
    expect(question.derivedVersion).toBeNull();

    expect(handshakeCount(server)).toBe(1);
    const post = server.requests[1];
    expect(post.method).toBe("POST");
    expect(post.path).toBe(DERIVATIVE_QUESTIONS_PATH);
    expect(post.headers.authorization).toMatch(/^Bearer vana_write_/);
    expect(post.headers["content-type"]).toBe("application/json");

    // The body is the compact JSON.stringify form, byte for byte: the
    // Personal Server re-serialises what it parsed and rejects anything else
    // with WRITE_BODY_NOT_CANONICAL.
    const sent = new TextDecoder().decode(post.body);
    expect(sent).toBe(
      JSON.stringify({ ...registration, model: "z-ai/glm-5.2" }),
    );
    expect(JSON.stringify(JSON.parse(sent))).toBe(sent);

    const proof = parseWeb3SignedHeader(
      post.headers[WRITE_SIGNATURE_HEADER.toLowerCase()],
    );
    expect(proof.payload).toMatchObject({
      aud: ORIGIN,
      method: "POST",
      uri: DERIVATIVE_QUESTIONS_PATH,
      grantId: GRANT_ID,
    });
    expect(
      await recoverMessageAddress({
        message: proof.payloadBase64,
        signature: proof.signature,
      }),
    ).toBe(builder.address);
  });

  it("is refused by the Personal Server when the body is not compact JSON", async () => {
    const server = makeServer();
    await registerQuestion({ ...auth(server), ...registration });
    const session = [...server.sessions.values()][0];
    const pretty = JSON.stringify(registration, null, 2);
    const proof = await buildWeb3SignedHeader({
      signMessage: (message) => builder.signMessage({ message }),
      aud: ORIGIN,
      method: "POST",
      uri: DERIVATIVE_QUESTIONS_PATH,
      body: new TextEncoder().encode(pretty),
      grantId: GRANT_ID,
    });
    const response = await server.fetch(
      `${ORIGIN}${DERIVATIVE_QUESTIONS_PATH}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
          [WRITE_SIGNATURE_HEADER]: proof,
        },
        body: pretty,
      },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.errorCode).toBe(
      "WRITE_BODY_NOT_CANONICAL",
    );
  });

  it("reuses the session and signs a fresh proof for every call", async () => {
    const server = makeServer();
    const first = await registerQuestion({ ...auth(server), ...registration });
    const second = await getQuestion({
      ...auth(server),
      questionId: first.questionId,
    });
    const third = await getQuestion({
      ...auth(server),
      questionId: first.questionId,
    });

    expect(second.questionId).toBe(first.questionId);
    expect(third.questionId).toBe(first.questionId);
    expect(handshakeCount(server)).toBe(1);

    // Three calls, three distinct single-use proofs: two identical GETs
    // signed inside the same second must not produce the same bytes.
    const proofs = proofsIn(server);
    expect(proofs).toHaveLength(3);
    expect(new Set(proofs).size).toBe(3);
  });

  it("re-opens the session once when the Personal Server forgot it", async () => {
    const server = makeServer();
    const first = await registerQuestion({ ...auth(server), ...registration });
    const firstToken = [...server.sessions.keys()][0];

    // A restarted Personal Server drops its in-memory sessions; the grant
    // and the builder key are still good.
    server.dropSessions();
    const question = await getQuestion({
      ...auth(server),
      questionId: first.questionId,
    });

    expect(question.questionId).toBe(first.questionId);
    expect(handshakeCount(server)).toBe(2);
    const [secondToken] = [...server.sessions.keys()];
    expect(secondToken).not.toBe(firstToken);
    // The 401 was replayed with a new proof, not the rejected one.
    const proofs = proofsIn(server);
    expect(new Set(proofs).size).toBe(proofs.length);
  });

  it("sends nothing without a grant", async () => {
    const server = makeServer();
    const err = await registerQuestion({
      ...auth(server),
      grantId: "",
      ...registration,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteRequestError);
    expect((err as WriteRequestError).message).toContain("grantId is required");
    expect(server.requests).toEqual([]);
  });

  it("refuses an invalid registration before signing anything", async () => {
    const server = makeServer();
    const cases: Array<Record<string, unknown>> = [
      { ...registration, sourceScopes: [] },
      { ...registration, sourceScopes: [SOURCE_SCOPE, SOURCE_SCOPE] },
      { ...registration, sourceScopes: [DERIVED_SCOPE] },
      {
        ...registration,
        sourceScopes: new Array(17).fill(0).map((_, i) => `s${i}.x`),
      },
      { ...registration, question: "   " },
      { ...registration, question: "x".repeat(8_001) },
      { ...registration, model: "not a model id" },
      // The naming rule: a coach.* grant would otherwise read the source.
      {
        derivedScope: "oura.summary",
        sourceScopes: [SOURCE_SCOPE],
        question: QUESTION,
      },
    ];
    for (const params of cases) {
      const err = await registerQuestion({
        ...auth(server),
        ...(params as unknown as typeof registration),
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(WriteRequestError);
    }
    expect(server.requests).toEqual([]);
  });
});

describe("derivative question errors", () => {
  it("maps 403 DERIVATIVE_SOURCE_NOT_GRANTED, naming the uncovered scopes", async () => {
    const server = makeServer();
    const err = await registerQuestion({
      ...auth(server, NO_SOURCE_GRANT_ID),
      ...registration,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DerivativeSourceNotGrantedError);
    const error = err as DerivativeSourceNotGrantedError;
    expect(error.status).toBe(403);
    expect(error.errorCode).toBe("DERIVATIVE_SOURCE_NOT_GRANTED");
    expect(error.code).toBe("DERIVATIVE_SOURCE_NOT_GRANTED");
    expect(error.details).toEqual({
      scopes: [SOURCE_SCOPE, OTHER_SOURCE_SCOPE],
    });
  });

  it("maps 409 DERIVATIVE_CYCLE", async () => {
    const server = makeServer();
    await registerQuestion({
      ...auth(server, WIDE_GRANT_ID),
      derivedScope: DERIVED_SCOPE,
      sourceScopes: [SOURCE_SCOPE],
      question: QUESTION,
    });
    const err = await registerQuestion({
      ...auth(server, WIDE_GRANT_ID),
      derivedScope: SOURCE_SCOPE,
      sourceScopes: [DERIVED_SCOPE],
      question: QUESTION,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DerivativeCycleError);
    expect((err as DerivativeCycleError).status).toBe(409);
    expect((err as DerivativeCycleError).errorCode).toBe("DERIVATIVE_CYCLE");
  });

  it("maps 404 for another builder's question on the same scope", async () => {
    const server = makeServer();
    const theirs = await registerQuestion({
      personalServerUrl: ORIGIN,
      signer: otherBuilder,
      grantId: OTHER_GRANT_ID,
      fetch: server.fetch,
      retry: { attempts: 1 },
      derivedScope: DERIVED_SCOPE,
      sourceScopes: [SOURCE_SCOPE],
      question: QUESTION,
    });
    const err = await getQuestion({
      ...auth(server),
      questionId: theirs.questionId,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DerivativeQuestionNotFoundError);
    expect((err as DerivativeQuestionNotFoundError).status).toBe(404);
    expect((err as DerivativeQuestionNotFoundError).errorCode).toBe(
      "DERIVATIVE_QUESTION_NOT_FOUND",
    );
  });

  it("maps 503 DERIVATIVE_COMPUTE_UNAVAILABLE", async () => {
    const server = makeServer({ computeUnavailable: true });
    const err = await registerQuestion({
      ...auth(server),
      ...registration,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DerivativeComputeUnavailableError);
    expect((err as DerivativeComputeUnavailableError).status).toBe(503);
  });

  it("maps a 400 DERIVATIVE_QUESTION_INVALID the server raised", async () => {
    const server = makeServer();
    await registerQuestion({ ...auth(server), ...registration });
    server.respondNextWith(400, {
      error: {
        code: 400,
        errorCode: "DERIVATIVE_QUESTION_INVALID",
        message: "question must be a non-empty string",
        details: { field: "question" },
      },
    });
    const err = await registerQuestion({
      ...auth(server),
      ...registration,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DerivativeQuestionInvalidError);
    const error = err as DerivativeQuestionInvalidError;
    expect(error.status).toBe(400);
    expect(error.details).toEqual({ field: "question" });
  });

  it("maps 403 SCOPE_MISMATCH on a derived scope the grant cannot write", async () => {
    const server = makeServer();
    const err = await registerQuestion({
      ...auth(server),
      derivedScope: "somebody.else",
      sourceScopes: [SOURCE_SCOPE],
      question: QUESTION,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(WriteForbiddenError);
    expect((err as WriteForbiddenError).errorCode).toBe("SCOPE_MISMATCH");
  });

  it("surfaces the 401 the Personal Server answers for an unknown id", async () => {
    // The server answers an unknown question id after OWNER authentication,
    // so a builder is told 401, never 404. The SDK re-handshakes once (the
    // status is indistinguishable from a dropped session) and surfaces it.
    const server = makeServer();
    await registerQuestion({ ...auth(server), ...registration });
    const err = await getQuestion({
      ...auth(server),
      questionId: "q-does-not-exist",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(WriteUnauthorizedError);
    expect(handshakeCount(server)).toBe(2);
  });
});

describe("listQuestions", () => {
  it("lists this builder's questions and keeps the query out of the proof", async () => {
    const server = makeServer();
    const first = await registerQuestion({ ...auth(server), ...registration });
    const second = await registerQuestion({
      ...auth(server),
      ...registration,
      question: "And the week before?",
    });

    const questions = await listQuestions({
      ...auth(server),
      derivedScope: DERIVED_SCOPE,
    });
    expect(questions.map((q) => q.questionId)).toEqual([
      first.questionId,
      second.questionId,
    ]);

    const list = server.requests[server.requests.length - 1];
    expect(list.path).toBe(
      `${DERIVATIVE_QUESTIONS_PATH}?derivedScope=${encodeURIComponent(DERIVED_SCOPE)}`,
    );
    // The Personal Server verifies the proof against the path only, so the
    // signed uri must not carry the query string.
    const proof = parseWeb3SignedHeader(
      list.headers[WRITE_SIGNATURE_HEADER.toLowerCase()],
    );
    expect(proof.payload.uri).toBe(DERIVATIVE_QUESTIONS_PATH);
    expect(proof.payload.method).toBe("GET");
  });

  it("requires a derived scope before sending anything", async () => {
    const server = makeServer();
    const err = await listQuestions({
      ...auth(server),
      derivedScope: "",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WriteRequestError);
    expect(server.requests).toEqual([]);
  });
});

describe("recomputeQuestion and deleteQuestion", () => {
  it("schedules a recompute of a computed question", async () => {
    const server = makeServer();
    const question = await registerQuestion({
      ...auth(server),
      ...registration,
    });
    server.settleQuestion(question.questionId, { status: "ready" });

    const result = await recomputeQuestion({
      ...auth(server),
      questionId: question.questionId,
    });
    expect(result).toEqual({
      questionId: question.questionId,
      derivedScope: DERIVED_SCOPE,
      status: "stale",
    });
  });

  it("deletes a registration", async () => {
    const server = makeServer();
    const question = await registerQuestion({
      ...auth(server),
      ...registration,
    });
    const deleted = await deleteQuestion({
      ...auth(server),
      questionId: question.questionId,
    });
    expect(deleted).toEqual({ questionId: question.questionId, deleted: true });
    expect(server.questions.size).toBe(0);

    const del = server.requests[server.requests.length - 1];
    expect(del.method).toBe("DELETE");
    const proof = parseWeb3SignedHeader(
      del.headers[WRITE_SIGNATURE_HEADER.toLowerCase()],
    );
    expect(proof.payload.method).toBe("DELETE");
  });

  it("refuses a call without a question id", async () => {
    const server = makeServer();
    const params = { ...auth(server), questionId: "" };
    await expect(getQuestion(params)).rejects.toBeInstanceOf(WriteRequestError);
    await expect(recomputeQuestion(params)).rejects.toBeInstanceOf(
      WriteRequestError,
    );
    await expect(deleteQuestion(params)).rejects.toBeInstanceOf(
      WriteRequestError,
    );
    expect(server.requests).toEqual([]);
  });
});

function requestPath(input: RequestInfo | URL): string {
  const href =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  return new URL(href).pathname;
}

/** A fetch that settles the question once it has been polled `after` times. */
function settlingFetch(
  server: MockPersonalServer,
  questionId: () => string | undefined,
  after: number,
  outcome: Parameters<MockPersonalServer["settleQuestion"]>[1],
): typeof fetch {
  let polls = 0;
  return async (input, init) => {
    const id = questionId();
    if (
      id !== undefined &&
      (init?.method ?? "GET") === "GET" &&
      requestPath(input) === `${DERIVATIVE_QUESTIONS_PATH}/${id}`
    ) {
      polls += 1;
      if (polls === after) server.settleQuestion(id, outcome);
    }
    return server.fetch(input, init);
  };
}

/** A fetch that settles every question the moment it is registered. */
function settleOnRegister(
  server: MockPersonalServer,
  outcome: Parameters<MockPersonalServer["settleQuestion"]>[1],
): typeof fetch {
  return async (input, init) => {
    const response = await server.fetch(input, init);
    if (
      init?.method === "POST" &&
      requestPath(input) === DERIVATIVE_QUESTIONS_PATH &&
      response.status === 201
    ) {
      const body = (await response.clone().json()) as { questionId: string };
      server.settleQuestion(body.questionId, outcome);
    }
    return response;
  };
}

describe("waitForQuestion", () => {
  it("polls until the question is ready", async () => {
    const server = makeServer();
    let questionId: string | undefined;
    const fetchFn = settlingFetch(server, () => questionId, 2, {
      status: "ready",
    });
    const question = await registerQuestion({
      ...auth(server),
      fetch: fetchFn,
      ...registration,
    });
    questionId = question.questionId;

    const settled = await waitForQuestion({
      ...auth(server),
      fetch: fetchFn,
      questionId: question.questionId,
      pollIntervalMs: 1,
      timeoutMs: 5_000,
    });

    expect(settled.status).toBe("ready");
    expect(settled.lastComputedAt).not.toBeNull();
    expect(settled.derivedVersion).toBe(1);
    // One handshake for every call in the run, not one per poll.
    expect(handshakeCount(server)).toBe(1);
    const polls = server.requests.filter(
      (request) =>
        request.path === `${DERIVATIVE_QUESTIONS_PATH}/${question.questionId}`,
    );
    expect(polls.length).toBeGreaterThan(1);
    expect(new Set(proofsIn(server)).size).toBe(proofsIn(server).length);
  });

  it("returns a failed question instead of throwing", async () => {
    const server = makeServer();
    const question = await registerQuestion({
      ...auth(server),
      ...registration,
    });
    server.settleQuestion(question.questionId, {
      status: "failed",
      error: "source scope oura.sleep has no local data",
    });

    const settled = await waitForQuestion({
      ...auth(server),
      questionId: question.questionId,
      pollIntervalMs: 1,
      timeoutMs: 1_000,
    });
    expect(settled.status).toBe("failed");
    expect(settled.error).toBe("source scope oura.sleep has no local data");
  });

  it("times out on a question that never settles", async () => {
    const server = makeServer();
    const question = await registerQuestion({
      ...auth(server),
      ...registration,
    });
    const err = await waitForQuestion({
      ...auth(server),
      questionId: question.questionId,
      pollIntervalMs: 1,
      timeoutMs: 10,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DerivativeQuestionTimeoutError);
    const error = err as DerivativeQuestionTimeoutError;
    expect(error.details).toMatchObject({
      questionId: question.questionId,
      status: "pending",
      timeoutMs: 10,
    });
    // The question is still registered: it keeps computing on the server.
    expect(server.questions.get(question.questionId)?.status).toBe("pending");
  });

  it("stops on an aborted signal", async () => {
    const server = makeServer();
    const question = await registerQuestion({
      ...auth(server),
      ...registration,
    });
    const controller = new AbortController();
    controller.abort();
    const err = await waitForQuestion({
      ...auth(server),
      questionId: question.questionId,
      signal: controller.signal,
      pollIntervalMs: 1,
      timeoutMs: 1_000,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("askPersonalServer", () => {
  it("registers, waits and reads the derived record", async () => {
    const server = makeServer();
    const fetchFn = settleOnRegister(server, {
      status: "ready",
      data: { answer: "you slept better on the days you wrote less" },
    });

    const { registration: settled, record } = await askPersonalServer({
      ...auth(server),
      fetch: fetchFn,
      ...registration,
      pollIntervalMs: 1,
      timeoutMs: 5_000,
    });

    expect(settled.status).toBe("ready");
    expect(record.scope).toBe(DERIVED_SCOPE);
    expect(record.version).toBe("1.0");
    expect(record.data).toMatchObject({
      questionId: settled.questionId,
      answer: "you slept better on the days you wrote less",
    });
    // The read is a Web3Signed GET under the same grant, not a write call.
    const read = server.requests[server.requests.length - 1];
    expect(read.method).toBe("GET");
    expect(read.path).toBe(`/v1/data/${encodeURIComponent(DERIVED_SCOPE)}`);
    expect(read.headers.authorization).toMatch(/^Web3Signed /);
  });

  it("throws when the question settles as failed", async () => {
    const server = makeServer();
    const fetchFn = settleOnRegister(server, {
      status: "failed",
      error: "INFERENCE_UNAVAILABLE",
    });

    const err = await askPersonalServer({
      ...auth(server),
      fetch: fetchFn,
      ...registration,
      pollIntervalMs: 1,
      timeoutMs: 1_000,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DerivativeQuestionFailedError);
    expect((err as DerivativeQuestionFailedError).details).toMatchObject({
      error: "INFERENCE_UNAVAILABLE",
    });
  });
});
