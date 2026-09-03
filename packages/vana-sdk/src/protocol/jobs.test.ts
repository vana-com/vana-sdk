import { sha256 } from "@noble/hashes/sha2";
import { describe, expect, it } from "vitest";
import {
  bytesToHex,
  fromHex,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  openJobRequest,
  openJobResult,
  sealJobRequest,
  sealJobResult,
} from "../crypto/envelope/job";
import { NodeECIESUint8Provider } from "../crypto/ecies/node";
import { fromBase64 } from "../utils/encoding";
import {
  CLAIM_POLL_FLOOR_MS,
  DEFAULT_JOB_DEADLINE_SECONDS,
  DEFAULT_LEASE_SECONDS,
  JOB_OPERATIONS,
  JOB_PROTOCOL_VERSION,
  JOB_STATES,
  MAX_ATTEMPTS,
  MAX_INLINE_RESULT_BYTES,
  MAX_JOB_DEADLINE_SECONDS,
  MAX_LEASE_SECONDS,
  MAX_WAIT_SECONDS,
  type ClaimRequest,
  type ClaimResponse,
  type CompleteRequest,
  type FailRequest,
  type FencedResponse,
  type HeartbeatRequest,
  type JobRequest,
  type JobRequestEnvelope,
  type JobResult,
  type JobStatus,
  type JobSubmission,
  type TeeNode,
  type TeeNodeHeartbeat,
  type TeeNodeRegistration,
} from "./jobs";

const testKey = (role: string): Hex =>
  keccak256(toBytes(`vana-sdk jobs test: ${role}`));
const BUILDER_PRIVATE_KEY = testKey("builder");
const ENCLAVE_PRIVATE_KEY = testKey("enclave");
const OTHER_PRIVATE_KEY = testKey("other");
const BUILDER = privateKeyToAccount(BUILDER_PRIVATE_KEY);
const ENCLAVE = privateKeyToAccount(ENCLAVE_PRIVATE_KEY);
const OWNER = "0x000000000000000000000000000000000000dEaD" as Address;
const GRANT_ID = bytesToHex(new Uint8Array(32).fill(1));
const HASH = bytesToHex(new Uint8Array(32).fill(2));
const USER_PS_ID = bytesToHex(new Uint8Array(32).fill(3));
const APP_ID = bytesToHex(new Uint8Array(20).fill(4));
const COMPOSE_HASH = bytesToHex(new Uint8Array(32).fill(5));
const JOB_ID = "018f47d2-a321-7e10-b528-24e5ef8a624b";
const NOW = "2026-09-03T12:00:00.000Z";

const request: JobRequest = {
  v: 1,
  jobId: JOB_ID,
  owner: OWNER,
  builder: BUILDER.address,
  builderPublicKey: BUILDER.publicKey,
  grantId: GRANT_ID,
  scope: "profile.email",
  operation: "raw_read",
  pinnedVersion: "7",
  deadline: NOW,
};
const requestEnvelope: JobRequestEnvelope = {
  request,
  auth: "Web3Signed public-fixture.signature",
};
const submission: JobSubmission = {
  owner: OWNER,
  grantId: GRANT_ID,
  scope: request.scope,
  operation: request.operation,
  idempotencyKey: "jobs-fixture-1",
  jobId: JOB_ID,
  deadline: NOW,
  requestCiphertext: "cHVibGlj",
};
const status: JobStatus = {
  jobId: JOB_ID,
  state: "completed",
  operation: "raw_read",
  owner: OWNER,
  grantId: GRANT_ID,
  scope: request.scope,
  pinnedVersion: "7",
  attempt: 1,
  price: "0",
  payer: "builder",
  paymentState: "none",
  createdAt: NOW,
  claimedAt: NOW,
  completedAt: NOW,
  failureReason: null,
  resultCiphertext: "cHVibGlj",
  resultHash: HASH,
  resultSize: 6,
  resultExpiresAt: NOW,
};
const claimRequest: ClaimRequest = { leaseSeconds: 30, capacity: 1 };
const claimResponse: ClaimResponse = {
  job: {
    jobId: JOB_ID,
    owner: OWNER,
    builder: BUILDER.address,
    grantId: GRANT_ID,
    scope: request.scope,
    operation: "raw_read",
    pinnedVersion: "7",
    requestCiphertext: "cHVibGlj",
    attempt: 1,
    deadlineAt: NOW,
    claimExpiresAt: NOW,
    fencingToken: 1,
  },
  identity: {
    userPsId: USER_PS_ID,
    epoch: 1,
    enclaveAddress: ENCLAVE.address,
    enclavePublicKey: ENCLAVE.publicKey,
    sealedEnvelope: {
      v: 1,
      iv: "aXY=",
      ciphertext: "Y2lwaGVydGV4dA==",
      tag: "dGFn",
      wrappedContentKey: {
        iv: "aXY=",
        ciphertext: "a2V5",
        tag: "dGFn",
      },
    },
  },
};
const heartbeatRequest: HeartbeatRequest = {
  leaseSeconds: 30,
  fencingToken: 1,
};
const completeRequest: CompleteRequest = {
  fencingToken: 1,
  resultHash: HASH,
  resultSize: 6,
  resultCiphertext: "cHVibGlj",
};
const failRequest: FailRequest = { fencingToken: 1, reason: "public failure" };
const fencedResponse: FencedResponse = {
  success: true,
  jobId: JOB_ID,
  state: "running",
  claimExpiresAt: NOW,
};
const result: JobResult = {
  v: 1,
  jobId: JOB_ID,
  scope: request.scope,
  version: "7",
  contentType: "application/json",
  body: "eyJlbWFpbCI6InB1YmxpY0BleGFtcGxlLmNvbSJ9",
};
const teeNodeRegistration: TeeNodeRegistration = {
  nodeId: "tee-fixture-1",
  appId: APP_ID,
  composeHash: COMPOSE_HASH,
  publicUrl: "https://tee.example.test",
  capacity: 4,
  secret: "public-test-secret",
};
const teeNodeHeartbeat: TeeNodeHeartbeat = {
  composeHash: COMPOSE_HASH,
  instanceId: "instance-fixture-1",
  activeSandboxes: 1,
  capacity: 4,
};
const teeNode: TeeNode = {
  nodeId: teeNodeRegistration.nodeId,
  appId: APP_ID,
  composeHash: COMPOSE_HASH,
  publicUrl: teeNodeRegistration.publicUrl,
  state: "admitted",
  capacity: 4,
  activeSandboxes: 1,
  lastHeartbeatAt: NOW,
};

describe("job protocol constants", () => {
  it("matches the contract literals", () => {
    expect(JOB_PROTOCOL_VERSION).toBe(1);
    expect(DEFAULT_LEASE_SECONDS).toBe(30);
    expect(MAX_LEASE_SECONDS).toBe(300);
    expect(MAX_ATTEMPTS).toBe(3);
    expect(MAX_WAIT_SECONDS).toBe(25);
    expect(CLAIM_POLL_FLOOR_MS).toBe(1000);
    expect(MAX_INLINE_RESULT_BYTES).toBe(1_048_576);
    expect(DEFAULT_JOB_DEADLINE_SECONDS).toBe(600);
    expect(MAX_JOB_DEADLINE_SECONDS).toBe(3600);
    expect(JOB_OPERATIONS).toEqual(["raw_read", "inference"]);
    expect(JOB_STATES).toEqual([
      "queued",
      "claimed",
      "running",
      "completed",
      "failed",
      "expired",
      "cancelled",
    ]);
  });

  it("type-checks one public fixture for every DTO", () => {
    expect([
      request,
      requestEnvelope,
      submission,
      status,
      claimRequest,
      claimResponse,
      heartbeatRequest,
      completeRequest,
      failRequest,
      fencedResponse,
      result,
      teeNodeRegistration,
      teeNodeHeartbeat,
      teeNode,
    ]).toHaveLength(14);
  });
});

describe("job ECIES envelopes", () => {
  const ecies = new NodeECIESUint8Provider();

  it("round-trips a request", async () => {
    const ciphertext = await sealJobRequest(
      requestEnvelope,
      ENCLAVE.publicKey,
      ecies,
    );

    await expect(
      openJobRequest(ciphertext, fromHex(ENCLAVE_PRIVATE_KEY, "bytes"), ecies),
    ).resolves.toEqual(requestEnvelope);
  });

  it("round-trips a result", async () => {
    const sealed = await sealJobResult(result, BUILDER.publicKey, ecies);

    await expect(
      openJobResult(sealed.ciphertext, BUILDER_PRIVATE_KEY, ecies, {
        jobId: JOB_ID,
      }),
    ).resolves.toEqual(result);
  });

  it("round-trips a result with all expected bindings", async () => {
    const sealed = await sealJobResult(result, BUILDER.publicKey, ecies);

    await expect(
      openJobResult(sealed.ciphertext, BUILDER_PRIVATE_KEY, ecies, {
        jobId: JOB_ID,
        scope: result.scope,
        version: result.version,
      }),
    ).resolves.toEqual(result);
  });

  it("round-trips a zero-byte result body", async () => {
    const emptyResult = { ...result, body: "" };
    const sealed = await sealJobResult(emptyResult, BUILDER.publicKey, ecies);

    await expect(
      openJobResult(sealed.ciphertext, BUILDER_PRIVATE_KEY, ecies, {
        jobId: JOB_ID,
      }),
    ).resolves.toEqual(emptyResult);
  });

  it("rejects a wrong recipient private key", async () => {
    const ciphertext = await sealJobRequest(
      requestEnvelope,
      ENCLAVE.publicKey,
      ecies,
    );

    await expect(
      openJobRequest(ciphertext, fromHex(OTHER_PRIVATE_KEY, "bytes"), ecies),
    ).rejects.toThrow();
  });

  it("rejects a result whose job ID does not match", async () => {
    const sealed = await sealJobResult(result, BUILDER.publicKey, ecies);

    await expect(
      openJobResult(sealed.ciphertext, BUILDER_PRIVATE_KEY, ecies, {
        jobId: "different-job-id",
      }),
    ).rejects.toThrow(
      `${JOB_ID} does not match expected job ID different-job-id`,
    );
  });

  it("rejects a result whose scope does not match", async () => {
    const sealed = await sealJobResult(result, BUILDER.publicKey, ecies);

    await expect(
      openJobResult(sealed.ciphertext, BUILDER_PRIVATE_KEY, ecies, {
        jobId: JOB_ID,
        scope: "profile.name",
      }),
    ).rejects.toThrow(
      `Job result scope ${result.scope} does not match expected scope profile.name`,
    );
  });

  it.each([
    ["7", null],
    ["8", "7"],
  ])(
    "rejects a result version %s when expected version is %s",
    async (resultVersion, expectedVersion) => {
      const versionedResult = { ...result, version: resultVersion };
      const sealed = await sealJobResult(
        versionedResult,
        BUILDER.publicKey,
        ecies,
      );

      await expect(
        openJobResult(sealed.ciphertext, BUILDER_PRIVATE_KEY, ecies, {
          jobId: JOB_ID,
          version: expectedVersion,
        }),
      ).rejects.toThrow(
        `Job result version ${String(resultVersion)} does not match expected version ${String(expectedVersion)}`,
      );
    },
  );

  it("hashes and measures the decoded ciphertext bytes", async () => {
    const sealed = await sealJobResult(result, BUILDER.publicKey, ecies);
    const rawCiphertext = fromBase64(sealed.ciphertext);

    expect(sealed.hash).toBe(bytesToHex(sha256(rawCiphertext)));
    expect(sealed.size).toBe(rawCiphertext.length);
  });

  it("rejects unsupported versions and missing required fields", async () => {
    const badRequest = {
      ...requestEnvelope,
      request: { ...request, v: 2 },
    } as unknown as JobRequestEnvelope;
    const requestCiphertext = await sealJobRequest(
      badRequest,
      ENCLAVE.publicKey,
      ecies,
    );
    await expect(
      openJobRequest(
        requestCiphertext,
        fromHex(ENCLAVE_PRIVATE_KEY, "bytes"),
        ecies,
      ),
    ).rejects.toThrow("Unsupported job request version: 2");

    const badResult = { ...result, body: undefined } as unknown as JobResult;
    const sealedResult = await sealJobResult(
      badResult,
      BUILDER.publicKey,
      ecies,
    );
    await expect(
      openJobResult(sealedResult.ciphertext, BUILDER_PRIVATE_KEY, ecies, {
        jobId: JOB_ID,
      }),
    ).rejects.toThrow("Invalid job result: missing body");
  });
});
