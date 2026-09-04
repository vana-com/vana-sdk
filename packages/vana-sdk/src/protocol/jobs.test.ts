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
  canonicalJobRequestBytes,
  openJobRequest,
  openJobResult,
  sealJobRequest,
  sealJobResult,
} from "../crypto/envelope/job";
import { serializeECIES } from "../crypto/ecies/interface";
import { NodeECIESUint8Provider } from "../crypto/ecies/node";
import { fromBase64, toBase64 } from "../utils/encoding";
import {
  CLAIM_POLL_FLOOR_MS,
  DEFAULT_JOB_DEADLINE_SECONDS,
  DEFAULT_LEASE_SECONDS,
  JOB_OPERATIONS,
  JOB_PROTOCOL_VERSION,
  JOB_STATES,
  MAX_ATTEMPTS,
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
const ecies = new NodeECIESUint8Provider();

// Request wire pin: base64(iv||ephemPub||ct||mac). Regenerate only with the protocol.
const REQUEST_CIPHERTEXT_FIXTURE =
  "PLB8RPVnQTshYNvvb7WwDwSDwusNTuFVlHZMTsNRO9fW8Ii8dxJCGD2ipHGS0edmoKrLJjdQ6LgJFbXiAG2LhWqWdLjGcELAcG0M4VllgjDS8/TSzPuA4DK4Iwa76EZbl1T6V9Tf40kBCXfFhkOjyvw3hZW/cyvFk49I1jjXLqYrBJzwxzUha/G1wehWaZgOs30UiMC3zuPJYizspSTCTOucLxyvr+ojGJw6q4bBx5O53lhy7Wv7XUjdEwVf/XwSYLabwKBhNvvXr3yaZ0Bo/9vRIlIj+DMdRdm+xO+JHX4knypGiqBa3z0jxH5Z+R8dgSC6DrBiC+8nc/l+oVuhwqfKcVkMcDnDaOpAZW6XxSbX3AErwgj9Qq00EqJ7zvH03xoBHT6bPAYKM36XpDP/njVQjNH4/Z137DO50HU/Wi2k/jtbSNsv12OLPFURjje+J5VAvUQ/lZk/EXMdzhq5NMeUxOYWmmvDgKoTHo3ZZF8ca3rHZ9YDp6QnptT6acQwXyQFK9KPN5+U6tX/LUuHAOlOIkDAgukIx2NOFTATYcLnZd2h5NQ4sxZxLEhiiGZ0eAGkthSwNmb8805aDL8PIpklqE4k/eRSGuNmqvkiSf6hVSp6ssXarDf9U+kM3r+lWVkV55hTZZp6y7ujrjfhFqe0GV5mDB1Ok1o+c51ysoG0YL77YrFT1azhkR1QT1Sq+XLZSnNkkSx8sAyE56HH9H977yGbtU+Hd4u1Dyq08b0Pfa3cd2T6khJEgVjd9y6+cQ8HGqJVT6w0IEsz5MtOVuT7vot08L+o7uv54PMrbJo66lcx1Pxy8pzBe69pY6vDvN7oiQaXLjXdnC5YBkfu/ShaVWFSfCg0tFEMJu14xn+CBlXvWSCuEaQ/S4s8jsir9Q==";
// Result wire pin: raw iv||ephemPub||ct||mac bytes (base64 only as test source notation).
const RESULT_SEALED_BYTES_FIXTURE = fromBase64(
  "0T4gw2djHW/Ps2fCLYDxeQQSQNSqi7NvLfy2ALLQt4Gclhn+tCwNJsZ09K1jGnZ+UGVyPj/8I+FcIhIiE88F8QdEhO/lJziE7O7nc4ie6AcVfCpY08S8jOOT41G487Lar+cvpLHH7UbA0avDOO2+rqF66JrL0np68sKE5JTzdYSw8gqGzGSHxQBgu21cUmwlGw5nbfwvJxeCnT3G5L5jIZYOV2WFOEfwtKISt3+XJKnmmD62Y0TmnfGFiyT3NEz8d66TVC+w8QVGMssA5qzZmHd1q0mrXk2jlNAbks6gbTyTJLxTf3YkxDq3UBtoV5GkCLpSXtGGjaBrwmOnKmMF80OdJQzsSAyakJoYDk2N/Llls8C6gMQ/4aqnbaMl5nzbag==",
);

const canonicalVectorRequest: JobRequest = {
  v: 1,
  jobId: "00000000-0000-4000-8000-000000000001",
  owner: "0x0000000000000000000000000000000000000001",
  builder: "0x0000000000000000000000000000000000000002",
  builderPublicKey: "0x1234",
  grantId: "0x0000000000000000000000000000000000000000000000000000000000000000",
  scope: "profile.email",
  operation: "raw_read",
  pinnedVersion: null,
  deadline: "2026-01-01T00:00:00.000Z",
};

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
  result: {
    objectKey: `jobresults/14800/${JOB_ID}`,
    url: `https://storage.example.test/jobresults/14800/${JOB_ID}`,
    size: 6,
    hash: HASH,
    expiresAt: NOW,
  },
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
  resultObjectKey: `jobresults/14800/${JOB_ID}`,
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

async function encryptRaw(plaintext: string, publicKey: Hex): Promise<string> {
  const encrypted = await ecies.encrypt(
    fromHex(publicKey, "bytes"),
    new TextEncoder().encode(plaintext),
  );
  return toBase64(fromHex(`0x${serializeECIES(encrypted)}` as Hex, "bytes"));
}

async function encryptRawBytes(
  plaintext: string,
  publicKey: Hex,
): Promise<Uint8Array> {
  const encrypted = await ecies.encrypt(
    fromHex(publicKey, "bytes"),
    new TextEncoder().encode(plaintext),
  );
  return fromHex(`0x${serializeECIES(encrypted)}` as Hex, "bytes");
}

function tamperCiphertext(ciphertext: string): string {
  const bytes = fromBase64(ciphertext);
  bytes[bytes.length - 1] ^= 1;
  return toBase64(bytes);
}

function tamperBytes(bytes: Uint8Array): Uint8Array {
  const tampered = bytes.slice();
  tampered[tampered.length - 1] ^= 1;
  return tampered;
}

describe("job protocol constants", () => {
  it("matches the contract literals", () => {
    expect(JOB_PROTOCOL_VERSION).toBe(1);
    expect(DEFAULT_LEASE_SECONDS).toBe(30);
    expect(MAX_LEASE_SECONDS).toBe(300);
    expect(MAX_ATTEMPTS).toBe(3);
    expect(MAX_WAIT_SECONDS).toBe(25);
    expect(CLAIM_POLL_FLOOR_MS).toBe(1000);
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

describe("canonicalJobRequestBytes", () => {
  it("matches the Gateway and PS worker wire pin", () => {
    const bytes = canonicalJobRequestBytes(canonicalVectorRequest);

    // Wire pins shared by the Gateway and PS worker; update only with the protocol.
    expect(new TextDecoder().decode(bytes)).toBe(
      '{"builder":"0x0000000000000000000000000000000000000002","builderPublicKey":"0x1234","deadline":"2026-01-01T00:00:00.000Z","grantId":"0x0000000000000000000000000000000000000000000000000000000000000000","jobId":"00000000-0000-4000-8000-000000000001","operation":"raw_read","owner":"0x0000000000000000000000000000000000000001","pinnedVersion":null,"scope":"profile.email","v":1}',
    );
    expect(bytesToHex(sha256(bytes))).toBe(
      "0xc610d7c24e7a8b952db6e7f2ce902fec090016e44bf30a8908021432678d81a0",
    );
  });

  it("is independent of request property insertion order", () => {
    const reorderedRequest: JobRequest = {
      deadline: canonicalVectorRequest.deadline,
      scope: canonicalVectorRequest.scope,
      grantId: canonicalVectorRequest.grantId,
      owner: canonicalVectorRequest.owner,
      pinnedVersion: canonicalVectorRequest.pinnedVersion,
      operation: canonicalVectorRequest.operation,
      builderPublicKey: canonicalVectorRequest.builderPublicKey,
      builder: canonicalVectorRequest.builder,
      jobId: canonicalVectorRequest.jobId,
      v: canonicalVectorRequest.v,
    };

    expect(canonicalJobRequestBytes(reorderedRequest)).toEqual(
      canonicalJobRequestBytes(canonicalVectorRequest),
    );
  });

  it("pins non-ASCII scope as UTF-8", () => {
    const unicodeRequest: JobRequest = {
      ...canonicalVectorRequest,
      scope: "profilé.ｅmail",
    };
    const bytes = canonicalJobRequestBytes(unicodeRequest);

    // Wire pins shared by the Gateway and PS worker; update only with the protocol.
    expect(new TextDecoder().decode(bytes)).toBe(
      '{"builder":"0x0000000000000000000000000000000000000002","builderPublicKey":"0x1234","deadline":"2026-01-01T00:00:00.000Z","grantId":"0x0000000000000000000000000000000000000000000000000000000000000000","jobId":"00000000-0000-4000-8000-000000000001","operation":"raw_read","owner":"0x0000000000000000000000000000000000000001","pinnedVersion":null,"scope":"profilé.ｅmail","v":1}',
    );
    expect(bytesToHex(sha256(bytes))).toBe(
      "0xa0207ad59041c224b1deb24439ac2055da66fdb77884dcee15ad08d5fb594b37",
    );
  });

  it.each([
    [
      "absent",
      {
        v: request.v,
        jobId: request.jobId,
        owner: request.owner,
        builder: request.builder,
        builderPublicKey: request.builderPublicKey,
        grantId: request.grantId,
        scope: request.scope,
        operation: request.operation,
        deadline: request.deadline,
      },
    ],
    ["undefined", { ...request, pinnedVersion: undefined }],
  ])("rejects pinnedVersion when %s", async (_kind, invalidRequest) => {
    expect(() =>
      canonicalJobRequestBytes(invalidRequest as unknown as JobRequest),
    ).toThrow("missing pinnedVersion");
    await expect(
      sealJobRequest(
        {
          request: invalidRequest as unknown as JobRequest,
          auth: requestEnvelope.auth,
        },
        ENCLAVE.publicKey,
        ecies,
      ),
    ).rejects.toThrow("missing pinnedVersion");
  });
});

describe("job ECIES envelopes", () => {
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

  it("opens the pinned request ciphertext fixture", async () => {
    await expect(
      openJobRequest(
        REQUEST_CIPHERTEXT_FIXTURE,
        fromHex(ENCLAVE_PRIVATE_KEY, "bytes"),
        ecies,
      ),
    ).resolves.toEqual(requestEnvelope);
  });

  it("preserves the canonical request bytes through a round trip", async () => {
    const ciphertext = await sealJobRequest(
      requestEnvelope,
      ENCLAVE.publicKey,
      ecies,
    );
    const opened = await openJobRequest(
      ciphertext,
      fromHex(ENCLAVE_PRIVATE_KEY, "bytes"),
      ecies,
    );

    expect(canonicalJobRequestBytes(opened.request)).toEqual(
      canonicalJobRequestBytes(requestEnvelope.request),
    );
  });

  it("round-trips a result", async () => {
    const sealed = await sealJobResult(result, BUILDER.publicKey, ecies);

    await expect(
      openJobResult(sealed.bytes, BUILDER_PRIVATE_KEY, ecies, {
        jobId: JOB_ID,
      }),
    ).resolves.toEqual(result);
  });

  it("opens the pinned result ciphertext fixture", async () => {
    await expect(
      openJobResult(RESULT_SEALED_BYTES_FIXTURE, BUILDER_PRIVATE_KEY, ecies, {
        jobId: JOB_ID,
      }),
    ).resolves.toEqual(result);
  });

  it("round-trips a result with all expected bindings", async () => {
    const sealed = await sealJobResult(result, BUILDER.publicKey, ecies);

    await expect(
      openJobResult(sealed.bytes, BUILDER_PRIVATE_KEY, ecies, {
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
      openJobResult(sealed.bytes, BUILDER_PRIVATE_KEY, ecies, {
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

  it("rejects a result opened with the wrong private key", async () => {
    const sealed = await sealJobResult(result, BUILDER.publicKey, ecies);

    await expect(
      openJobResult(sealed.bytes, OTHER_PRIVATE_KEY, ecies, {
        jobId: JOB_ID,
      }),
    ).rejects.toThrow();
  });

  it("rejects tampered request and result ciphertext", async () => {
    const requestCiphertext = await sealJobRequest(
      requestEnvelope,
      ENCLAVE.publicKey,
      ecies,
    );
    const sealedResult = await sealJobResult(result, BUILDER.publicKey, ecies);

    await expect(
      openJobRequest(
        tamperCiphertext(requestCiphertext),
        fromHex(ENCLAVE_PRIVATE_KEY, "bytes"),
        ecies,
      ),
    ).rejects.toThrow();
    await expect(
      openJobResult(
        tamperBytes(sealedResult.bytes),
        BUILDER_PRIVATE_KEY,
        ecies,
        { jobId: JOB_ID },
      ),
    ).rejects.toThrow();
  });

  it("rejects non-JSON and array request plaintext", async () => {
    const notJson = await encryptRaw("not JSON", ENCLAVE.publicKey);
    const array = await encryptRaw("[]", ENCLAVE.publicKey);

    await expect(
      openJobRequest(notJson, fromHex(ENCLAVE_PRIVATE_KEY, "bytes"), ecies),
    ).rejects.toThrow("malformed JSON");
    await expect(
      openJobRequest(array, fromHex(ENCLAVE_PRIVATE_KEY, "bytes"), ecies),
    ).rejects.toThrow("expected an object");
  });

  it("rejects envelopes missing request or auth", async () => {
    const missingRequest = await encryptRaw(
      JSON.stringify({ auth: requestEnvelope.auth }),
      ENCLAVE.publicKey,
    );
    const missingAuth = await encryptRaw(
      JSON.stringify({ request }),
      ENCLAVE.publicKey,
    );

    await expect(
      openJobRequest(
        missingRequest,
        fromHex(ENCLAVE_PRIVATE_KEY, "bytes"),
        ecies,
      ),
    ).rejects.toThrow("missing request");
    await expect(
      openJobRequest(missingAuth, fromHex(ENCLAVE_PRIVATE_KEY, "bytes"), ecies),
    ).rejects.toThrow("missing auth");
  });

  it.each([
    ["unknownField", { ...request, unknownField: true }],
    ["operation", { ...request, operation: "unknown" }],
    ["deadline", { ...request, deadline: "not-a-date" }],
    ["owner", { ...request, owner: "not-an-address" }],
  ])("rejects an invalid request %s on open", async (field, invalidRequest) => {
    const ciphertext = await encryptRaw(
      JSON.stringify({ auth: requestEnvelope.auth, request: invalidRequest }),
      ENCLAVE.publicKey,
    );

    await expect(
      openJobRequest(ciphertext, fromHex(ENCLAVE_PRIVATE_KEY, "bytes"), ecies),
    ).rejects.toThrow(field);
  });

  it("rejects a Date deadline on seal", async () => {
    await expect(
      sealJobRequest(
        {
          ...requestEnvelope,
          request: {
            ...request,
            deadline: new Date(),
          } as unknown as JobRequest,
        },
        ENCLAVE.publicKey,
        ecies,
      ),
    ).rejects.toThrow("deadline");
  });

  it("rejects an unknown result field on seal and open", async () => {
    const resultWithUnknown = { ...result, unknownField: true };

    await expect(
      sealJobResult(
        resultWithUnknown as unknown as JobResult,
        BUILDER.publicKey,
        ecies,
      ),
    ).rejects.toThrow("unknownField");

    const sealedBytes = await encryptRawBytes(
      JSON.stringify(resultWithUnknown),
      BUILDER.publicKey,
    );
    await expect(
      openJobResult(sealedBytes, BUILDER_PRIVATE_KEY, ecies, { jobId: JOB_ID }),
    ).rejects.toThrow("unknownField");
  });

  it("rejects a result whose job ID does not match", async () => {
    const sealed = await sealJobResult(result, BUILDER.publicKey, ecies);

    await expect(
      openJobResult(sealed.bytes, BUILDER_PRIVATE_KEY, ecies, {
        jobId: "different-job-id",
      }),
    ).rejects.toThrow(
      `${JOB_ID} does not match expected job ID different-job-id`,
    );
  });

  it("rejects a result whose scope does not match", async () => {
    const sealed = await sealJobResult(result, BUILDER.publicKey, ecies);

    await expect(
      openJobResult(sealed.bytes, BUILDER_PRIVATE_KEY, ecies, {
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
        openJobResult(sealed.bytes, BUILDER_PRIVATE_KEY, ecies, {
          jobId: JOB_ID,
          version: expectedVersion,
        }),
      ).rejects.toThrow(
        `Job result version ${String(resultVersion)} does not match expected version ${String(expectedVersion)}`,
      );
    },
  );

  it("accepts an expected null version and skips an undefined version", async () => {
    const nullResult = { ...result, version: null };
    const sealedNull = await sealJobResult(
      nullResult,
      BUILDER.publicKey,
      ecies,
    );
    const sealedString = await sealJobResult(result, BUILDER.publicKey, ecies);

    await expect(
      openJobResult(sealedNull.bytes, BUILDER_PRIVATE_KEY, ecies, {
        jobId: JOB_ID,
        version: null,
      }),
    ).resolves.toEqual(nullResult);
    await expect(
      openJobResult(sealedString.bytes, BUILDER_PRIVATE_KEY, ecies, {
        jobId: JOB_ID,
        version: undefined,
      }),
    ).resolves.toEqual(result);
  });

  it("pins the result ciphertext hash and CBC wire size", async () => {
    const sealed = await sealJobResult(result, BUILDER.publicKey, ecies);
    const plaintext = new TextEncoder().encode(
      JSON.stringify({
        v: result.v,
        jobId: result.jobId,
        scope: result.scope,
        version: result.version,
        contentType: result.contentType,
        body: result.body,
      }),
    );
    const blockSize = 16;
    const ciphertextLength =
      (Math.floor(plaintext.length / blockSize) + 1) * blockSize;

    expect(sealed.size).toBe(16 + 65 + ciphertextLength + 32);
    expect(sealed.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(sealed.hash).toBe(bytesToHex(sha256(sealed.bytes)));
  });

  it("rejects unsupported versions and missing required fields", async () => {
    const badRequest = {
      ...requestEnvelope,
      request: { ...request, v: 2 },
    } as unknown as JobRequestEnvelope;
    await expect(
      sealJobRequest(badRequest, ENCLAVE.publicKey, ecies),
    ).rejects.toThrow("Unsupported job request version: 2");
    const requestCiphertext = await encryptRaw(
      JSON.stringify(badRequest),
      ENCLAVE.publicKey,
    );
    await expect(
      openJobRequest(
        requestCiphertext,
        fromHex(ENCLAVE_PRIVATE_KEY, "bytes"),
        ecies,
      ),
    ).rejects.toThrow("Unsupported job request version: 2");

    const badResult = { ...result, body: undefined } as unknown as JobResult;
    await expect(
      sealJobResult(badResult, BUILDER.publicKey, ecies),
    ).rejects.toThrow("Invalid job result: missing body");
    const sealedResultBytes = await encryptRawBytes(
      JSON.stringify(badResult),
      BUILDER.publicKey,
    );
    await expect(
      openJobResult(sealedResultBytes, BUILDER_PRIVATE_KEY, ecies, {
        jobId: JOB_ID,
      }),
    ).rejects.toThrow("Invalid job result: missing body");
  });
});
