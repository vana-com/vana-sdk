import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  bytesToHex,
  keccak256,
  toBytes,
  type Address,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseWeb3SignedHeader } from "../auth/web3-signed";
import { computeBodyHash } from "../auth/web3-signed-builder";
import {
  canonicalJobRequestBytes,
  JobEnvelopeError,
  openJobRequest,
  sealJobResult,
} from "../crypto/envelope/job";
import { NodeECIESUint8Provider } from "../crypto/ecies/node";
import {
  BuilderUnknownError,
  GrantInvalidError,
  JobIdTakenError,
  JobNotFoundError,
  JobRejectedError,
  JobRequestTooLargeError,
  JobTimeoutError,
  JobTransportError,
  OwnerNotReadyError,
} from "../errors";
import {
  CLAIM_POLL_FLOOR_MS,
  JOB_PROTOCOL_VERSION,
  type JobRequest,
  type JobResult,
  type JobStatus,
  type JobSubmission,
} from "./jobs";
import { createJobsClient, type JobsBuilderAccount } from "./jobs-client";
import { userPsId } from "./identity";

const GATEWAY_URL = "https://gateway.test";
const CHAIN_ID = 14_800;
const NOW = new Date("2026-09-03T12:00:00.000Z");
const SCOPE = "profile.email";
const OWNER = "0x000000000000000000000000000000000000dEaD" as Address;
const GRANT_ID = bytesToHex(new Uint8Array(32).fill(1));
const BUILDER_PRIVATE_KEY = keccak256(toBytes("jobs-client builder"));
const ENCLAVE_PRIVATE_KEY = keccak256(toBytes("jobs-client enclave"));
const builder = privateKeyToAccount(BUILDER_PRIVATE_KEY);
const enclave = privateKeyToAccount(ENCLAVE_PRIVATE_KEY);
const ecies = new NodeECIESUint8Provider();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function identityResponse(
  state: string = "sealed",
  overrides: Record<string, unknown> = {},
): Response {
  return jsonResponse(200, {
    state,
    identity: {
      ownerAddress: OWNER,
      chainId: CHAIN_ID,
      userPsId: userPsId(CHAIN_ID, OWNER),
      address: enclave.address,
      publicKey: enclave.publicKey,
      ...overrides,
    },
  });
}

function statusFor(
  jobId: string,
  state: JobStatus["state"],
  overrides: Partial<JobStatus> = {},
): JobStatus {
  return {
    jobId,
    state,
    operation: "raw_read",
    owner: OWNER,
    grantId: GRANT_ID,
    scope: SCOPE,
    pinnedVersion: null,
    attempt: state === "queued" ? 0 : 1,
    price: "0",
    payer: "builder",
    paymentState: "none",
    createdAt: NOW.toISOString(),
    claimedAt: null,
    completedAt: state === "completed" ? NOW.toISOString() : null,
    failureReason: null,
    ...overrides,
  };
}

function makeClient(fetchFn: typeof fetch) {
  return createJobsClient({
    gatewayUrl: GATEWAY_URL,
    chainId: CHAIN_ID,
    builderPrivateKey: BUILDER_PRIVATE_KEY,
    fetch: fetchFn,
    ecies,
    now: () => NOW,
  });
}

async function submissionFrom(init?: RequestInit): Promise<{
  submission: JobSubmission;
  request: JobRequest;
  auth: string;
}> {
  const submission = JSON.parse(
    new TextDecoder().decode(init?.body as Uint8Array),
  ) as JobSubmission;
  const opened = await openJobRequest(
    submission.requestCiphertext,
    toBytes(ENCLAVE_PRIVATE_KEY),
    ecies,
  );
  return { submission, request: opened.request, auth: opened.auth };
}

async function completedResponse(init?: RequestInit): Promise<Response> {
  const { request } = await submissionFrom(init);
  const result: JobResult = {
    v: JOB_PROTOCOL_VERSION,
    jobId: request.jobId,
    scope: request.scope,
    version: request.pinnedVersion ?? "17",
    contentType: "application/json",
    body: "eyJlbWFpbCI6ImFAZXhhbXBsZS5jb20ifQ==",
  };
  const sealed = await sealJobResult(result, builder.publicKey, ecies);
  return jsonResponse(200, {
    job: statusFor(request.jobId, "completed", {
      pinnedVersion: request.pinnedVersion,
      resultCiphertext: sealed.ciphertext,
      resultHash: sealed.hash,
      resultSize: sealed.size,
    }),
  });
}

describe("createJobsClient", () => {
  it("only types local accounts with public keys as builderAccount", () => {
    expectTypeOf<JobsBuilderAccount>().toEqualTypeOf<LocalAccount>();
  });

  it("allows a local builderAccount to submit but not decrypt", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes("/v1/identity?")) return identityResponse();
      const submission = JSON.parse(
        new TextDecoder().decode(init?.body as Uint8Array),
      ) as JobSubmission;
      return jsonResponse(202, {
        jobId: submission.jobId,
        state: "queued",
        created: true,
      });
    });
    const client = createJobsClient({
      gatewayUrl: GATEWAY_URL,
      chainId: CHAIN_ID,
      builderAccount: builder,
      fetch: fetchFn,
      ecies,
      now: () => NOW,
    });

    const submitted = await client.submitRawRead({
      owner: OWNER,
      grantId: GRANT_ID,
      scope: SCOPE,
    });
    expect(submitted.state).toBe("queued");
    await expect(
      client.openResult(
        statusFor(submitted.jobId, "completed", {
          resultCiphertext: "not-decrypted-without-a-key",
        }),
        { expect: { jobId: submitted.jobId } },
      ),
    ).rejects.toBeInstanceOf(JobRejectedError);
  });

  it("submits a byte-bound raw read and returns an inline completed job", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.startsWith(`${GATEWAY_URL}/v1/identity?`)) {
        return identityResponse();
      }
      if (url === `${GATEWAY_URL}/v1/jobs?wait=25`) {
        return completedResponse(init);
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const client = makeClient(fetchFn);

    const submitted = await client.submitRawRead({
      owner: OWNER,
      grantId: GRANT_ID,
      scope: SCOPE,
      wait: 25,
    });

    expect(submitted.state).toBe("completed");
    expect(submitted.job?.jobId).toBe(submitted.jobId);
    const post = fetchFn.mock.calls[1];
    const outer = parseWeb3SignedHeader(
      new Headers(post?.[1]?.headers).get("Authorization") ?? "",
    );
    expect(outer.payload).toMatchObject({
      aud: GATEWAY_URL,
      method: "POST",
      uri: "/v1/jobs",
      bodyHash: computeBodyHash(post?.[1]?.body as Uint8Array),
    });
  });

  it("rejects an inline job whose id differs from the submitted id", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes("/v1/identity?")) return identityResponse();
      return jsonResponse(200, {
        job: statusFor("00000000-0000-4000-8000-000000000099", "completed"),
      });
    });
    const client = makeClient(fetchFn);

    await expect(
      client.submitRawRead({ owner: OWNER, grantId: GRANT_ID, scope: SCOPE }),
    ).rejects.toBeInstanceOf(JobRejectedError);
  });

  it.each([
    "https://gateway.test/api",
    "https://gateway.test/?region=ca",
    "https://gateway.test/#jobs",
  ])("rejects a gateway URL that is not a bare origin: %s", (gatewayUrl) => {
    expect(() =>
      createJobsClient({
        gatewayUrl,
        chainId: CHAIN_ID,
        builderPrivateKey: BUILDER_PRIVATE_KEY,
        fetch: vi.fn<typeof fetch>(),
        ecies,
      }),
    ).toThrow(JobRejectedError);
  });

  it("performs an inline submit and decrypt as one readRaw call", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input, init) =>
      String(input).includes("/v1/identity?")
        ? identityResponse()
        : completedResponse(init),
    );
    const client = makeClient(fetchFn);

    const result = await client.readRaw({
      owner: OWNER,
      grantId: GRANT_ID,
      scope: SCOPE,
      pinnedVersion: "17",
    });

    expect(result).toMatchObject({
      scope: SCOPE,
      version: "17",
      contentType: "application/json",
    });
  });

  it("returns 202 and polls through running to a terminal job", async () => {
    let submittedJobId = "";
    let reads = 0;
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.startsWith(`${GATEWAY_URL}/v1/identity?`))
        return identityResponse();
      if (url.startsWith(`${GATEWAY_URL}/v1/jobs?wait=`)) {
        const opened = await submissionFrom(init);
        submittedJobId = opened.request.jobId;
        return jsonResponse(202, {
          jobId: submittedJobId,
          state: "queued",
          created: true,
        });
      }
      if (url === `${GATEWAY_URL}/v1/jobs/${submittedJobId}`) {
        reads += 1;
        return jsonResponse(200, {
          job: statusFor(submittedJobId, reads === 1 ? "running" : "completed"),
        });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const client = makeClient(fetchFn);
    const submitted = await client.submitRawRead({
      owner: OWNER,
      grantId: GRANT_ID,
      scope: SCOPE,
    });

    expect(submitted).toEqual({ jobId: submittedJobId, state: "queued" });
    vi.useFakeTimers();
    try {
      const waiting = client.waitForJob(submitted.jobId, {
        timeoutMs: 2_000,
        pollMs: CLAIM_POLL_FLOOR_MS,
      });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(CLAIM_POLL_FLOOR_MS);
      await expect(waiting).resolves.toMatchObject({ state: "completed" });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [400, "INVALID_WAIT", JobRejectedError],
    [400, "INVALID_BODY", JobRejectedError],
    [401, null, JobRejectedError],
    [403, "BUILDER_UNKNOWN", BuilderUnknownError],
    [403, "GRANT_INVALID", GrantInvalidError],
    [403, "OWNER_NOT_READY", OwnerNotReadyError],
    [413, "BODY_TOO_LARGE", JobRequestTooLargeError],
    [409, "JOB_ID_MISMATCH", JobRejectedError],
    [409, "JOB_ID_TAKEN", JobIdTakenError],
  ] as const)(
    "maps submit status %i code %s to %s",
    async (status, code, ErrorType) => {
      const fetchFn = vi.fn<typeof fetch>(async (input) =>
        String(input).includes("/v1/identity?")
          ? identityResponse()
          : jsonResponse(status, {
              error: "public failure",
              ...(code ? { code } : {}),
            }),
      );
      const client = makeClient(fetchFn);

      const rejected = client.submitRawRead({
        owner: OWNER,
        grantId: GRANT_ID,
        scope: SCOPE,
      });
      await expect(rejected).rejects.toBeInstanceOf(ErrorType);
      await expect(rejected).rejects.toMatchObject({ status, errorCode: code });
    },
  );

  it("rejects an identity that is not sealed before submitting", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      identityResponse("registered"),
    );
    const client = makeClient(fetchFn);

    await expect(
      client.submitRawRead({ owner: OWNER, grantId: GRANT_ID, scope: SCOPE }),
    ).rejects.toBeInstanceOf(OwnerNotReadyError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ownerAddress: builder.address },
    { chainId: CHAIN_ID + 1 },
    { userPsId: bytesToHex(new Uint8Array(32).fill(2)) },
  ])("rejects identity request binding mismatch: %o", async (override) => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      identityResponse("sealed", override),
    );
    const client = makeClient(fetchFn);

    await expect(
      client.submitRawRead({ owner: OWNER, grantId: GRANT_ID, scope: SCOPE }),
    ).rejects.toBeInstanceOf(JobRejectedError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("maps an identity 404 to OwnerNotReadyError", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse(404, { error: "Owner identity not found" }),
    );
    const client = makeClient(fetchFn);

    await expect(
      client.submitRawRead({ owner: OWNER, grantId: GRANT_ID, scope: SCOPE }),
    ).rejects.toMatchObject({
      name: "OwnerNotReadyError",
      message: "Owner identity not found",
    });
  });

  it("maps a getJob 404 to JobNotFoundError", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse(404, { code: "JOB_NOT_FOUND", error: "Job not found" }),
    );
    const client = makeClient(fetchFn);

    await expect(client.getJob("missing-job")).rejects.toBeInstanceOf(
      JobNotFoundError,
    );
  });

  it.each([
    { owner: "" },
    { grantId: "" },
    { scope: "" },
    { operation: "unknown" },
  ])("rejects a truncated or invalid job status: %o", async (override) => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse(200, {
        job: { ...statusFor("job-1", "running"), ...override },
      }),
    );
    const client = makeClient(fetchFn);

    await expect(client.getJob("job-1")).rejects.toBeInstanceOf(
      JobRejectedError,
    );
  });

  it.each([
    {
      address: "not-an-address",
      publicKey: enclave.publicKey,
    },
    {
      address: enclave.address,
      publicKey: builder.publicKey,
    },
  ])(
    "rejects a malformed or mismatched enclave identity: %o",
    async (identity) => {
      const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
        if (String(input).includes("/v1/identity?")) {
          return jsonResponse(200, { state: "sealed", identity });
        }
        const submission = JSON.parse(
          new TextDecoder().decode(init?.body as Uint8Array),
        ) as JobSubmission;
        return jsonResponse(202, {
          jobId: submission.jobId,
          state: "queued",
          created: true,
        });
      });
      const client = makeClient(fetchFn);

      await expect(
        client.submitRawRead({ owner: OWNER, grantId: GRANT_ID, scope: SCOPE }),
      ).rejects.toBeInstanceOf(JobRejectedError);
    },
  );

  it("wraps a fetch failure in JobTransportError", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network unavailable");
    });
    const client = makeClient(fetchFn);

    await expect(
      client.submitRawRead({ owner: OWNER, grantId: GRANT_ID, scope: SCOPE }),
    ).rejects.toBeInstanceOf(JobTransportError);
  });

  it("produces the same canonical request bytes and body hash as the driver", async () => {
    let captured: Awaited<ReturnType<typeof submissionFrom>> | undefined;
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes("/v1/identity?")) return identityResponse();
      captured = await submissionFrom(init);
      return jsonResponse(202, {
        jobId: captured.request.jobId,
        state: "queued",
        created: true,
      });
    });
    const client = makeClient(fetchFn);
    await client.submitRawRead({
      owner: OWNER,
      grantId: GRANT_ID,
      scope: SCOPE,
      pinnedVersion: "17",
    });

    expect(captured).toBeDefined();
    const request = captured!.request;
    const expectedDriverBytes = new TextEncoder().encode(
      JSON.stringify({
        builder: builder.address,
        builderPublicKey: builder.publicKey,
        deadline: "2026-09-03T12:10:00.000Z",
        grantId: GRANT_ID,
        jobId: request.jobId,
        operation: "raw_read",
        owner: OWNER,
        pinnedVersion: "17",
        scope: SCOPE,
        v: JOB_PROTOCOL_VERSION,
      }),
    );
    expect(canonicalJobRequestBytes(request)).toEqual(expectedDriverBytes);
    expect(parseWeb3SignedHeader(captured!.auth).payload).toMatchObject({
      aud: GATEWAY_URL,
      method: "POST",
      uri: "/v1/jobs/execute",
      bodyHash: computeBodyHash(expectedDriverBytes),
    });
  });

  it.each([
    { jobId: "wrong" },
    { jobId: "job-1", scope: "wrong" },
    { jobId: "job-1", scope: SCOPE, version: "wrong" },
  ])(
    "surfaces JobEnvelopeError for result binding mismatch",
    async (expectBinding) => {
      const result: JobResult = {
        v: JOB_PROTOCOL_VERSION,
        jobId: "job-1",
        scope: SCOPE,
        version: "17",
        contentType: "application/json",
        body: "e30=",
      };
      const sealed = await sealJobResult(result, builder.publicKey, ecies);
      const client = makeClient(vi.fn<typeof fetch>());

      await expect(
        client.openResult(
          statusFor(result.jobId, "completed", {
            resultCiphertext: sealed.ciphertext,
          }),
          { expect: expectBinding },
        ),
      ).rejects.toBeInstanceOf(JobEnvelopeError);
    },
  );

  it("throws a typed error when a completed job has no inline ciphertext", async () => {
    const client = makeClient(vi.fn<typeof fetch>());

    await expect(
      client.openResult(statusFor("job-1", "completed"), {
        expect: { jobId: "job-1" },
      }),
    ).rejects.toBeInstanceOf(JobRejectedError);
  });

  it("times out when a job never becomes terminal", async () => {
    const client = makeClient(vi.fn<typeof fetch>());
    client.getJob = vi.fn(async () => statusFor("job-1", "running"));
    vi.useFakeTimers();
    try {
      const waiting = client.waitForJob("job-1", {
        timeoutMs: CLAIM_POLL_FLOOR_MS,
      });
      const assertion = expect(waiting).rejects.toBeInstanceOf(JobTimeoutError);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(CLAIM_POLL_FLOOR_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores unmodeled Gateway deadline fields while polling", async () => {
    const client = makeClient(vi.fn<typeof fetch>());
    let polls = 0;
    client.getJob = vi.fn(async () => ({
      ...statusFor("job-1", ++polls === 1 ? "running" : "completed"),
      deadline: new Date(0).toISOString(),
    }));
    vi.useFakeTimers();
    try {
      const waiting = client.waitForJob("job-1", {
        timeoutMs: CLAIM_POLL_FLOOR_MS * 2,
      });
      const assertion = expect(waiting).resolves.toMatchObject({
        state: "completed",
      });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(CLAIM_POLL_FLOOR_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces the protocol poll floor", async () => {
    const client = makeClient(vi.fn<typeof fetch>());
    let polls = 0;
    client.getJob = vi.fn(async () => {
      polls += 1;
      return statusFor("job-1", polls === 1 ? "running" : "completed");
    });
    vi.useFakeTimers();
    try {
      const waiting = client.waitForJob("job-1", {
        timeoutMs: CLAIM_POLL_FLOOR_MS * 2,
        pollMs: 1,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(polls).toBe(1);
      await vi.advanceTimersByTimeAsync(CLAIM_POLL_FLOOR_MS - 1);
      expect(polls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(waiting).resolves.toMatchObject({ state: "completed" });
    } finally {
      vi.useRealTimers();
    }
  });
});
