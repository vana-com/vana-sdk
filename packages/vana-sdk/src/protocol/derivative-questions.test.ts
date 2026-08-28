import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress } from "viem";
import { parseWeb3SignedHeader } from "../auth/web3-signed";
import { buildWeb3SignedHeader } from "../auth/web3-signed-builder";
import {
  DerivativeComputeUnavailableError,
  DerivativeCycleError,
  DerivativeDerivedScopeRequiredError,
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
/** A second derived scope the SAME grant may write, list and read. */
const OTHER_DERIVED_SCOPE = "coach.monthly";
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
          OTHER_DERIVED_SCOPE,
          `write:${OTHER_DERIVED_SCOPE}`,
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

/** A Personal Server protocol error body. */
interface ProtocolErrorBody {
  error: { code: string; errorCode: string; message: string };
}

async function errorBodyOf(response: Response): Promise<ProtocolErrorBody> {
  return (await response.json()) as ProtocolErrorBody;
}

/**
 * The `nonce` claim of a proof, read from the RAW payload: the SDK's parser
 * keeps only the claims it knows, so this is the only way to see it.
 */
function nonceOf(header: string): unknown {
  const { payloadBase64 } = parseWeb3SignedHeader(header);
  const base64 = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
  return payload.nonce;
}

/** A builder proof for one request target, built by hand. */
function builderProof(input: {
  target: string;
  method: string;
  nonce?: string;
  iat?: number;
  grantId?: string;
}): Promise<string> {
  return buildWeb3SignedHeader({
    signMessage: (message: string) => builder.signMessage({ message }),
    aud: ORIGIN,
    method: input.method,
    uri: input.target,
    grantId: input.grantId ?? GRANT_ID,
    ...(input.nonce === undefined ? {} : { nonce: input.nonce }),
    ...(input.iat === undefined ? {} : { iat: input.iat }),
  });
}

/** The bearer of the session the SDK just opened. */
function bearerOf(server: MockPersonalServer): string {
  return [...server.sessions.keys()][0];
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

  it("maps an unknown id to the typed not-found error without re-handshaking", async () => {
    // A caller holding a live write session is told 404, not the owner
    // gate's 401, so the SDK reports the real problem instead of walking
    // through a pointless handshake first.
    const server = makeServer();
    await registerQuestion({ ...auth(server), ...registration });
    const err = await getQuestion({
      ...auth(server),
      questionId: "q-does-not-exist",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DerivativeQuestionNotFoundError);
    expect((err as DerivativeQuestionNotFoundError).errorCode).toBe(
      "DERIVATIVE_QUESTION_NOT_FOUND",
    );
    expect(handshakeCount(server)).toBe(1);
  });

  it("does not re-handshake on a 401 the session cannot fix", async () => {
    // A replayed proof is a 401 about the PROOF, not the session: a new
    // session would fail exactly the same way, so re-handshaking would burn
    // a second proof and report an authentication problem the caller does
    // not have.
    const server = makeServer();
    const replaying = replayingFetch(server, (path) =>
      path.startsWith(`${DERIVATIVE_QUESTIONS_PATH}/`),
    );
    const question = await registerQuestion({
      ...auth(server),
      ...registration,
      fetch: replaying,
    });
    const err = await getQuestion({
      ...auth(server),
      fetch: replaying,
      questionId: question.questionId,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(WriteUnauthorizedError);
    expect((err as WriteUnauthorizedError).errorCode).toBe(
      "WRITE_ATTRIBUTION_REPLAY",
    );
    expect(handshakeCount(server)).toBe(1);
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

    const target = `${DERIVATIVE_QUESTIONS_PATH}?derivedScope=${encodeURIComponent(DERIVED_SCOPE)}`;
    const list = server.requests[server.requests.length - 1];
    expect(list.path).toBe(target);
    // The query decides the authorization, so the proof commits to it: the
    // signed uri is the whole request target, byte for byte.
    const proof = parseWeb3SignedHeader(
      list.headers[WRITE_SIGNATURE_HEADER.toLowerCase()],
    );
    expect(proof.payload.uri).toBe(target);
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

  it("refuses a proof signed for one derived scope on a list of another", async () => {
    // The query decides the authorization, so a proof that committed to
    // scope A must not authorize a list of scope B. Both scopes are
    // writable under this grant, so the scope policy cannot be what
    // refuses it: only the signature can.
    const server = makeServer();
    await registerQuestion({ ...auth(server), ...registration });
    const swapping: typeof fetch = async (input, init) => {
      const url = new URL(requestHref(input));
      if (url.searchParams.get("derivedScope") === DERIVED_SCOPE) {
        url.searchParams.set("derivedScope", OTHER_DERIVED_SCOPE);
        return server.fetch(url.toString(), init);
      }
      return server.fetch(input, init);
    };

    const err = await listQuestions({
      ...auth(server),
      fetch: swapping,
      derivedScope: DERIVED_SCOPE,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(WriteUnauthorizedError);
    expect((err as WriteUnauthorizedError).errorCode).toBe(
      "WRITE_ATTRIBUTION_INVALID",
    );
    // The same list signed for its own scope is served, so the refusal is
    // the swap and nothing else.
    const own = await listQuestions({
      ...auth(server),
      derivedScope: OTHER_DERIVED_SCOPE,
    });
    expect(own).toEqual([]);
  });

  it("maps 400 DERIVATIVE_DERIVED_SCOPE_REQUIRED to its own error", async () => {
    // The SDK refuses an empty derivedScope before signing, so this is the
    // answer a hand-built request gets. It must not be treated as an
    // authentication failure.
    const server = makeServer();
    const answering: typeof fetch = async (input, init) => {
      if (
        requestPath(input) === DERIVATIVE_QUESTIONS_PATH &&
        (init?.method ?? "GET") === "GET"
      ) {
        return new Response(
          JSON.stringify({
            error: {
              code: "BAD_REQUEST",
              errorCode: "DERIVATIVE_DERIVED_SCOPE_REQUIRED",
              message: "Listing questions as a builder needs a derived scope",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
      return server.fetch(input, init);
    };

    const err = await listQuestions({
      ...auth(server),
      fetch: answering,
      derivedScope: DERIVED_SCOPE,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DerivativeDerivedScopeRequiredError);
    expect((err as DerivativeDerivedScopeRequiredError).status).toBe(400);
    expect((err as DerivativeDerivedScopeRequiredError).errorCode).toBe(
      "DERIVATIVE_DERIVED_SCOPE_REQUIRED",
    );
    expect(handshakeCount(server)).toBe(1);
  });

  it("is answered 400, not 401, when the query is missing entirely", async () => {
    const server = makeServer();
    await registerQuestion({ ...auth(server), ...registration });
    const response = await server.fetch(
      `${ORIGIN}${DERIVATIVE_QUESTIONS_PATH}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${bearerOf(server)}`,
          [WRITE_SIGNATURE_HEADER]: await builderProof({
            target: DERIVATIVE_QUESTIONS_PATH,
            method: "GET",
            nonce: "list-without-a-scope",
          }),
        },
      },
    );

    expect(response.status).toBe(400);
    expect((await errorBodyOf(response)).error.errorCode).toBe(
      "DERIVATIVE_DERIVED_SCOPE_REQUIRED",
    );
  });
});

describe("proof nonces", () => {
  it("gives every question call a fresh nonce", async () => {
    const server = makeServer();
    const question = await registerQuestion({
      ...auth(server),
      ...registration,
    });
    const params = { ...auth(server), questionId: question.questionId };
    await getQuestion(params);
    await getQuestion(params);

    const nonces = proofsIn(server).map(nonceOf);
    expect(nonces).toHaveLength(3);
    for (const nonce of nonces) {
      expect(typeof nonce).toBe("string");
      expect((nonce as string).length).toBeGreaterThan(0);
    }
    expect(new Set(nonces).size).toBe(3);
  });

  it("lets two polls signed in the same second through on distinct nonces", async () => {
    // Same iat, same everything but the nonce: without it the two payloads
    // would be byte-identical and the second a replay.
    const server = makeServer();
    const question = await registerQuestion({
      ...auth(server),
      ...registration,
    });
    const target = `${DERIVATIVE_QUESTIONS_PATH}/${question.questionId}`;
    const iat = Math.floor(Date.now() / 1000);
    const poll = async (nonce: string): Promise<Response> =>
      server.fetch(`${ORIGIN}${target}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${bearerOf(server)}`,
          [WRITE_SIGNATURE_HEADER]: await builderProof({
            target,
            method: "GET",
            nonce,
            iat,
          }),
        },
      });

    const first = await poll("poll-1");
    const second = await poll("poll-2");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it("refuses a re-used nonce even when the rest of the payload changed", async () => {
    const server = makeServer();
    const question = await registerQuestion({
      ...auth(server),
      ...registration,
    });
    const target = `${DERIVATIVE_QUESTIONS_PATH}/${question.questionId}`;
    const iat = Math.floor(Date.now() / 1000);
    const poll = async (at: number): Promise<Response> =>
      server.fetch(`${ORIGIN}${target}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${bearerOf(server)}`,
          [WRITE_SIGNATURE_HEADER]: await builderProof({
            target,
            method: "GET",
            nonce: "single-use",
            iat: at,
          }),
        },
      });

    expect((await poll(iat)).status).toBe(200);
    // A different iat, so a different proof: the nonce is what is spent.
    const replay = await poll(iat + 5);
    expect(replay.status).toBe(401);
    expect((await errorBodyOf(replay)).error.errorCode).toBe(
      "WRITE_ATTRIBUTION_REPLAY",
    );
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
    // The full registration view, not the three-field summary older
    // Personal Servers answered.
    expect(result.questionId).toBe(question.questionId);
    expect(result.derivedScope).toBe(DERIVED_SCOPE);
    expect(result.status).toBe("stale");
    expect(result.question).toBe(QUESTION);
    expect(result.sourceScopes).toEqual([SOURCE_SCOPE, OTHER_SOURCE_SCOPE]);
    expect(result.registeredBy).toEqual({
      kind: "builder",
      builder: builder.address,
      grantId: GRANT_ID,
    });
    expect(result.lastComputedAt).not.toBeNull();
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

function requestHref(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function requestPath(input: RequestInfo | URL): string {
  return new URL(requestHref(input)).pathname;
}

/**
 * A fetch that sends the matching request to the server TWICE and returns
 * the second answer, so the caller's own call is the replay of its own
 * proof.
 */
function replayingFetch(
  server: MockPersonalServer,
  matches: (path: string) => boolean,
): typeof fetch {
  return async (input, init) => {
    if (matches(requestPath(input))) await server.fetch(input, init);
    return server.fetch(input, init);
  };
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
