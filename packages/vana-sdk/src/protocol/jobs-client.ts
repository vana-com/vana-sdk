/**
 * Builder-side client for encrypted Gateway jobs.
 *
 * @remarks
 * This Node-only client fetches an owner's sealed enclave identity, signs and
 * seals raw-read work, submits it to the Gateway, polls builder-visible state,
 * and decrypts the bound result with the builder private key.
 *
 * @category Protocol
 */

import { randomUUID } from "node:crypto";
import {
  isAddress,
  isAddressEqual,
  isHex,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount, publicKeyToAddress } from "viem/accounts";
import {
  buildWeb3SignedHeader,
  computeBodyHash,
} from "../auth/web3-signed-builder";
import type { ECIESProvider } from "../crypto/ecies/interface";
import { NodeECIESUint8Provider } from "../crypto/ecies/node";
import {
  canonicalJobRequestBytes,
  openJobResult,
  sealJobRequest,
} from "../crypto/envelope/job";
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
  type JobGatewayErrorCode,
  type JobsClientError,
} from "../errors";
import { userPsId, type IdentityResponse } from "./identity";
import {
  CLAIM_POLL_FLOOR_MS,
  DEFAULT_JOB_DEADLINE_SECONDS,
  JOB_OPERATIONS,
  JOB_PROTOCOL_VERSION,
  JOB_STATES,
  MAX_INLINE_RESULT_BYTES,
  MAX_JOB_DEADLINE_SECONDS,
  MAX_WAIT_SECONDS,
  type JobRequest,
  type JobResult,
  type JobOperation,
  type JobState,
  type JobStatus,
  type JobSubmission,
} from "./jobs";
import { resolveWriteSigner, type WriteSignerSource } from "./write-signer";

const IDENTITY_PATH = "/v1/identity";
const JOBS_PATH = "/v1/jobs";
const JOB_EXECUTE_PATH = "/v1/jobs/execute";
const AUTHORIZATION_HEADER = "Authorization";
const CONTENT_TYPE_HEADER = "Content-Type";
const JSON_CONTENT_TYPE = "application/json";
const GET_METHOD = "GET";
const POST_METHOD = "POST";
const RAW_READ_OPERATION = "raw_read";
const SEALED_IDENTITY_STATE = "sealed";
const HTTP_OK = 200;
const HTTP_ACCEPTED = 202;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const MILLISECONDS_PER_SECOND = 1_000;
const DEFAULT_JOB_TIMEOUT_MS = 120_000;
const DEFAULT_JOB_POLL_MS = CLAIM_POLL_FLOOR_MS;
const TERMINAL_JOB_STATES: ReadonlySet<JobState> = new Set([
  "completed",
  "failed",
  "expired",
  "cancelled",
]);

/** A viem local account that exposes the public key required by job requests. */
export type JobsBuilderAccount = Extract<LocalAccount, WriteSignerSource>;

/** Configuration captured by {@link createJobsClient}. */
export interface JobsClientOptions {
  /** Gateway base URL; its origin is the Web3Signed audience. */
  gatewayUrl: string;
  /** Vana chain ID used by the owner identity lookup. */
  chainId: number;
  /** Raw builder private key, used for signing and result decryption. */
  builderPrivateKey?: Hex;
  /**
   * viem local account used for signing. Its public key supports submission,
   * but without `builderPrivateKey` this client cannot decrypt results:
   * `openResult` and `readRaw` reject while submit/status/wait remain usable.
   */
  builderAccount?: JobsBuilderAccount;
  /** HTTP implementation; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** ECIES implementation; defaults to the Node provider. */
  ecies?: ECIESProvider;
  /** Clock used when constructing a job deadline. */
  now?: () => Date;
}

/** Parameters for one encrypted raw-read submission. */
export interface SubmitRawReadParams {
  /** Owner whose enclave executes the read. */
  owner: Address;
  /** Owner-issued builder grant. */
  grantId: Hex;
  /** Data scope to read. */
  scope: string;
  /** Exact record version to require, or `null` for an unpinned read. */
  pinnedVersion?: string | null;
  /** Requested deadline offset, clamped to the protocol maximum. */
  deadlineSeconds?: number;
  /** Gateway inline-wait seconds, clamped to `0..MAX_WAIT_SECONDS`. */
  wait?: number;
}

/** Result of submitting an encrypted raw-read job. */
export interface SubmitRawReadResult {
  /** Client-generated job UUID. */
  jobId: string;
  /** Current Gateway state. */
  state: JobState;
  /** Full status when the Gateway returned an inline 200 response. */
  job?: JobStatus;
}

/** Polling controls for {@link JobsClient.waitForJob}. */
export interface WaitForJobOptions {
  /** Total polling budget in milliseconds. */
  timeoutMs?: number;
  /** Delay between reads; values below `CLAIM_POLL_FLOOR_MS` are raised. */
  pollMs?: number;
}

/** Expected plaintext bindings for {@link JobsClient.openResult}. */
export interface OpenJobResultOptions {
  /** Bind the plaintext to this job id. */
  expect: {
    jobId: string;
    scope?: string;
    version?: string | null;
  };
}

/** Parameters for the submit, wait, and decrypt convenience flow. */
export interface ReadRawParams extends SubmitRawReadParams, WaitForJobOptions {}

/** Builder operations exposed by {@link createJobsClient}. */
export interface JobsClient {
  /**
   * Encrypt and submit a raw-read job.
   *
   * @param params - Owner, grant, scope, deadline, and inline-wait controls.
   * @returns The job id and current state, plus inline status on HTTP 200.
   * @throws {OwnerNotReadyError} When the owner identity is not sealed.
   * @throws {JobsClientError} When the Gateway or transport rejects the call.
   */
  submitRawRead(params: SubmitRawReadParams): Promise<SubmitRawReadResult>;

  /**
   * Read one builder-visible job status.
   *
   * @param jobId - Client-generated job UUID.
   * @returns The current job status.
   * @throws {JobNotFoundError} When the job is absent or belongs to another builder.
   * @throws {JobsClientError} For other Gateway or transport failures.
   */
  getJob(jobId: string): Promise<JobStatus>;

  /**
   * Poll until a job completes, fails, expires, or is cancelled.
   *
   * @param jobId - Job UUID to poll.
   * @param options - Timeout and poll cadence.
   * @returns The terminal job status.
   * @throws {JobTimeoutError} When the caller or job deadline is exhausted.
   */
  waitForJob(jobId: string, options?: WaitForJobOptions): Promise<JobStatus>;

  /**
   * Decrypt and validate an inline job result.
   *
   * @param job - Terminal job status containing `resultCiphertext`.
   * @param options - Expected plaintext job, scope, and version bindings.
   * @returns The validated plaintext job result.
   * @remarks Decryption requires `builderPrivateKey`; `builderAccount` alone
   *   only supports submission, status reads, and waiting.
   * @throws {JobRejectedError} When ciphertext or a raw private key is unavailable.
   * @throws {JobEnvelopeError} When decrypted protocol fields or bindings differ.
   */
  openResult(job: JobStatus, options: OpenJobResultOptions): Promise<JobResult>;

  /**
   * Submit, wait for, and decrypt one raw read.
   *
   * @param params - Raw-read request plus polling controls.
   * @returns The decrypted, binding-checked job result.
   * @remarks This convenience flow decrypts the result and therefore requires
   *   `builderPrivateKey`; a client configured only with `builderAccount`
   *   cannot call `readRaw`.
   * @throws {JobsClientError} When submission, polling, or decryption setup fails.
   * @throws {JobEnvelopeError} When decrypted result bindings differ.
   *
   * @example
   * ```typescript
   * const result = await client.readRaw({
   *   owner,
   *   grantId,
   *   scope: "profile.email",
   *   wait: 25,
   * });
   * ```
   */
  readRaw(params: ReadRawParams): Promise<JobResult>;
}

interface ResolvedBuilder {
  address: Address;
  publicKey: Hex;
  signMessage: ReturnType<typeof resolveWriteSigner>["signMessage"];
}

interface GatewayErrorBody {
  code: JobGatewayErrorCode | null;
  message: string;
  reason?: string;
  details?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeGateway(gatewayUrl: string): {
  baseUrl: string;
  audience: string;
} {
  try {
    const url = new URL(gatewayUrl);
    if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
      throw new JobRejectedError(
        "gatewayUrl must be an origin without a path, query, or fragment",
      );
    }
    return {
      baseUrl: url.origin,
      audience: url.origin,
    };
  } catch (error) {
    if (error instanceof JobRejectedError) throw error;
    throw new JobRejectedError(
      "gatewayUrl must be an absolute URL",
      undefined,
      null,
      {
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

function resolveFetch(fetchFn?: typeof fetch): typeof fetch {
  const resolved = fetchFn ?? globalThis.fetch;
  if (resolved === undefined) {
    throw new JobRejectedError("No fetch implementation available");
  }
  return resolved;
}

function sourcePublicKey(source: WriteSignerSource): Hex | undefined {
  if (isRecord(source) && typeof source["publicKey"] === "string") {
    return source["publicKey"] as Hex;
  }
  return undefined;
}

function resolveBuilder(options: JobsClientOptions): {
  builder: ResolvedBuilder;
  privateKey?: Hex;
} {
  if (options.builderPrivateKey && options.builderAccount) {
    throw new JobRejectedError(
      "Provide builderPrivateKey or builderAccount, not both",
    );
  }
  let source: WriteSignerSource | undefined;
  try {
    source = options.builderPrivateKey
      ? privateKeyToAccount(options.builderPrivateKey)
      : options.builderAccount;
  } catch (error) {
    throw new JobRejectedError("Invalid builder private key", undefined, null, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!source) {
    throw new JobRejectedError(
      "builderPrivateKey or builderAccount is required",
    );
  }
  let signer: ReturnType<typeof resolveWriteSigner>;
  try {
    signer = resolveWriteSigner(source);
  } catch (error) {
    throw new JobRejectedError("Invalid builder signer", undefined, null, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const publicKey = sourcePublicKey(source);
  if (!signer.address || !publicKey) {
    throw new JobRejectedError(
      "Builder signer must expose both address and publicKey",
    );
  }
  return {
    builder: {
      address: signer.address,
      publicKey,
      signMessage: signer.signMessage,
    },
    ...(options.builderPrivateKey
      ? { privateKey: options.builderPrivateKey }
      : {}),
  };
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved)) {
    throw new JobRejectedError(`${field} must be a finite number`);
  }
  return Math.min(maximum, Math.max(minimum, Math.trunc(resolved)));
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function gatewayErrorBody(body: unknown, fallback: string): GatewayErrorBody {
  if (!isRecord(body)) return { code: null, message: fallback };
  const code = typeof body["code"] === "string" ? body["code"] : null;
  const message =
    typeof body["error"] === "string"
      ? body["error"]
      : typeof body["message"] === "string"
        ? body["message"]
        : fallback;
  const reason =
    typeof body["reason"] === "string" ? body["reason"] : undefined;
  const details = isRecord(body["details"]) ? body["details"] : undefined;
  return {
    code,
    message,
    ...(reason ? { reason } : {}),
    ...(details ? { details } : {}),
  };
}

async function rejectedResponse(
  response: Response,
  fallback: string,
): Promise<JobsClientError> {
  const parsed = gatewayErrorBody(await responseBody(response), fallback);
  const details =
    response.status === HTTP_UNAUTHORIZED && parsed.reason
      ? { ...parsed.details, reason: parsed.reason }
      : parsed.details;
  const message =
    response.status === HTTP_UNAUTHORIZED && parsed.reason
      ? `${parsed.message}: ${parsed.reason}`
      : parsed.message;
  if (response.status === HTTP_FORBIDDEN) {
    if (parsed.code === "BUILDER_UNKNOWN") {
      return new BuilderUnknownError(parsed.message, details);
    }
    if (parsed.code === "GRANT_INVALID") {
      return new GrantInvalidError(parsed.message, details);
    }
    if (parsed.code === "OWNER_NOT_READY") {
      return new OwnerNotReadyError(parsed.message, details);
    }
  }
  if (response.status === HTTP_NOT_FOUND) {
    return new JobNotFoundError(parsed.message, details);
  }
  if (response.status === HTTP_CONFLICT && parsed.code === "JOB_ID_TAKEN") {
    return new JobIdTakenError(parsed.message, details);
  }
  if (response.status === HTTP_PAYLOAD_TOO_LARGE) {
    return new JobRequestTooLargeError(parsed.message, parsed.code, details);
  }
  return new JobRejectedError(message, response.status, parsed.code, details);
}

function requireStatus(value: unknown, status: number): JobStatus {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value["jobId"]) ||
    typeof value["state"] !== "string" ||
    !JOB_STATES.includes(value["state"] as JobState) ||
    !isNonEmptyString(value["owner"]) ||
    !isNonEmptyString(value["grantId"]) ||
    !isNonEmptyString(value["scope"]) ||
    !isNonEmptyString(value["operation"]) ||
    !JOB_OPERATIONS.includes(value["operation"] as JobOperation)
  ) {
    throw new JobRejectedError(
      "Gateway response did not contain a job status",
      status,
    );
  }
  return value as unknown as JobStatus;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasMatchingIdentityKey(value: Record<string, unknown>): boolean {
  const address = value["address"];
  const publicKey = value["publicKey"];
  if (
    typeof address !== "string" ||
    !isAddress(address) ||
    typeof publicKey !== "string" ||
    !isHex(publicKey)
  ) {
    return false;
  }
  try {
    return (
      publicKeyToAddress(publicKey).toLowerCase() === address.toLowerCase()
    );
  } catch {
    return false;
  }
}

function hasExpectedIdentity(
  value: Record<string, unknown>,
  owner: Address,
  chainId: number,
): boolean {
  const identityOwner = value["ownerAddress"];
  const identityChainId = value["chainId"];
  const identityUserPsId = value["userPsId"];
  if (
    !hasMatchingIdentityKey(value) ||
    typeof identityOwner !== "string" ||
    !isAddress(identityOwner) ||
    typeof identityChainId !== "number" ||
    typeof identityUserPsId !== "string" ||
    !isHex(identityUserPsId)
  ) {
    return false;
  }
  return (
    isAddressEqual(identityOwner, owner) &&
    identityChainId === chainId &&
    identityUserPsId.toLowerCase() === userPsId(chainId, owner).toLowerCase()
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireFiniteDuration(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new JobRejectedError(`${field} must be a finite number`);
  }
  return Math.max(0, value);
}

/**
 * Create a reusable Node builder client for encrypted Gateway jobs.
 *
 * @param options - Gateway, chain, builder signer, and injectable adapters.
 * @returns A client bound to the configured builder and Gateway.
 * @throws {JobRejectedError} When configuration or signer shape is invalid.
 *
 * @remarks
 * This client is Node-only. `builderPrivateKey` supports the complete flow;
 * `builderAccount` alone supports submit/status/wait but cannot decrypt, so
 * `openResult` and `readRaw` require the raw private key.
 *
 * @example
 * ```typescript
 * const client = createJobsClient({
 *   gatewayUrl: "https://gateway.example.com",
 *   chainId: 14800,
 *   builderPrivateKey: process.env.BUILDER_PRIVATE_KEY as Hex,
 * });
 * const result = await client.readRaw({ owner, grantId, scope: "profile" });
 * ```
 */
export function createJobsClient(options: JobsClientOptions): JobsClient {
  const { baseUrl, audience } = normalizeGateway(options.gatewayUrl);
  const fetchFn = resolveFetch(options.fetch);
  const { builder, privateKey } = resolveBuilder(options);
  const ecies = options.ecies ?? new NodeECIESUint8Provider();
  const now = options.now ?? (() => new Date());

  async function request(
    url: string,
    init: RequestInit,
    description: string,
  ): Promise<Response> {
    try {
      return await fetchFn(url, init);
    } catch (error) {
      throw new JobTransportError(
        `${description} failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  async function getIdentity(
    owner: Address,
  ): Promise<IdentityResponse["identity"]> {
    const query = new URLSearchParams({
      owner,
      chainId: String(options.chainId),
    });
    const response = await request(
      `${baseUrl}${IDENTITY_PATH}?${query.toString()}`,
      { method: GET_METHOD },
      "Owner identity lookup",
    );
    if (response.status === HTTP_NOT_FOUND) {
      const parsed = gatewayErrorBody(
        await responseBody(response),
        "Owner identity not found",
      );
      throw new OwnerNotReadyError(parsed.message, parsed.details);
    }
    if (!response.ok) {
      throw await rejectedResponse(response, "Owner identity lookup rejected");
    }
    const body = await responseBody(response);
    if (
      !isRecord(body) ||
      body["state"] !== SEALED_IDENTITY_STATE ||
      !isRecord(body["identity"])
    ) {
      throw new OwnerNotReadyError("Owner identity is not sealed", {
        state: isRecord(body) ? body["state"] : undefined,
      });
    }
    if (!hasExpectedIdentity(body["identity"], owner, options.chainId)) {
      throw new JobRejectedError(
        "Gateway returned a malformed or mismatched owner identity",
        response.status,
      );
    }
    // Full TDX/KMS evidence verification awaits provisioned trust anchors and is intentionally outside this driver-matching client.
    return body["identity"] as unknown as IdentityResponse["identity"];
  }

  const client: JobsClient = {
    async submitRawRead(params) {
      const identity = await getIdentity(params.owner);
      const deadlineSeconds = clampInteger(
        params.deadlineSeconds,
        DEFAULT_JOB_DEADLINE_SECONDS,
        1,
        MAX_JOB_DEADLINE_SECONDS,
        "deadlineSeconds",
      );
      const wait = clampInteger(params.wait, 0, 0, MAX_WAIT_SECONDS, "wait");
      const jobId = randomUUID();
      const nowMs = now().getTime();
      if (!Number.isFinite(nowMs)) {
        throw new JobRejectedError("now must return a valid Date");
      }
      const deadline = new Date(
        nowMs + deadlineSeconds * MILLISECONDS_PER_SECOND,
      ).toISOString();
      const requestBody: JobRequest = {
        v: JOB_PROTOCOL_VERSION,
        jobId,
        owner: params.owner,
        builder: builder.address,
        builderPublicKey: builder.publicKey,
        grantId: params.grantId,
        scope: params.scope,
        operation: RAW_READ_OPERATION,
        pinnedVersion: params.pinnedVersion ?? null,
        deadline,
      };
      const auth = await buildWeb3SignedHeader({
        signMessage: builder.signMessage,
        aud: audience,
        method: POST_METHOD,
        uri: JOB_EXECUTE_PATH,
        bodyHash: computeBodyHash(canonicalJobRequestBytes(requestBody)),
        nonce: randomUUID(),
      });
      const requestCiphertext = await sealJobRequest(
        { request: requestBody, auth },
        identity.publicKey,
        ecies,
      );
      const submission: JobSubmission = {
        owner: requestBody.owner,
        grantId: requestBody.grantId,
        scope: requestBody.scope,
        operation: requestBody.operation,
        idempotencyKey: randomUUID(),
        jobId,
        deadline,
        requestCiphertext,
      };
      const bodyBytes = new TextEncoder().encode(JSON.stringify(submission));
      const authorization = await buildWeb3SignedHeader({
        signMessage: builder.signMessage,
        aud: audience,
        method: POST_METHOD,
        uri: JOBS_PATH,
        body: bodyBytes,
        nonce: randomUUID(),
      });
      const response = await request(
        `${baseUrl}${JOBS_PATH}?wait=${wait}`,
        {
          method: POST_METHOD,
          headers: {
            [AUTHORIZATION_HEADER]: authorization,
            [CONTENT_TYPE_HEADER]: JSON_CONTENT_TYPE,
          },
          body: bodyBytes,
        },
        "Job submission",
      );
      if (!response.ok) {
        throw await rejectedResponse(response, "Job submission rejected");
      }
      const body = await responseBody(response);
      if (response.status === HTTP_OK && isRecord(body)) {
        const job = requireStatus(body["job"], response.status);
        if (job.jobId !== jobId) {
          throw new JobRejectedError(
            "Gateway returned a job id that does not match the submission",
            response.status,
          );
        }
        return { jobId, state: job.state, job };
      }
      if (
        response.status === HTTP_ACCEPTED &&
        isRecord(body) &&
        body["jobId"] === jobId &&
        typeof body["state"] === "string" &&
        JOB_STATES.includes(body["state"] as JobState)
      ) {
        return { jobId, state: body["state"] as JobState };
      }
      throw new JobRejectedError(
        "Gateway returned an undocumented job submission response",
        response.status,
      );
    },

    async getJob(jobId) {
      const path = `${JOBS_PATH}/${encodeURIComponent(jobId)}`;
      const authorization = await buildWeb3SignedHeader({
        signMessage: builder.signMessage,
        aud: audience,
        method: GET_METHOD,
        uri: path,
        nonce: randomUUID(),
      });
      const response = await request(
        `${baseUrl}${path}`,
        {
          method: GET_METHOD,
          headers: { [AUTHORIZATION_HEADER]: authorization },
        },
        "Job status read",
      );
      if (!response.ok) {
        throw await rejectedResponse(response, "Job status read rejected");
      }
      const body = await responseBody(response);
      return requireStatus(
        isRecord(body) ? body["job"] : undefined,
        response.status,
      );
    },

    async waitForJob(jobId, waitOptions = {}) {
      const timeoutMs = requireFiniteDuration(
        waitOptions.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS,
        "timeoutMs",
      );
      const pollMs = Math.max(
        CLAIM_POLL_FLOOR_MS,
        requireFiniteDuration(
          waitOptions.pollMs ?? DEFAULT_JOB_POLL_MS,
          "pollMs",
        ),
      );
      const startedAt = Date.now();
      const callerDeadline = startedAt + timeoutMs;
      let latest: JobStatus | undefined;
      for (;;) {
        if (Date.now() >= callerDeadline) {
          throw new JobTimeoutError(
            `Timed out waiting for terminal job ${jobId}`,
            {
              jobId,
              timeoutMs,
              state: latest?.state,
            },
          );
        }
        latest = await client.getJob(jobId);
        if (TERMINAL_JOB_STATES.has(latest.state)) return latest;
        const remaining = callerDeadline - Date.now();
        if (remaining <= 0) {
          throw new JobTimeoutError(
            `Timed out waiting for terminal job ${jobId}`,
            {
              jobId,
              timeoutMs,
              state: latest.state,
            },
          );
        }
        await sleep(Math.min(pollMs, remaining));
      }
    },

    async openResult(job, openOptions) {
      if (!job.resultCiphertext) {
        throw new JobRejectedError(
          "Job status does not include inline resultCiphertext",
          undefined,
          null,
          {
            jobId: job.jobId,
            state: job.state,
            resultHandle: job.resultHandle,
            maxInlineResultBytes: MAX_INLINE_RESULT_BYTES,
          },
        );
      }
      if (!privateKey) {
        throw new JobRejectedError(
          "openResult requires createJobsClient({ builderPrivateKey })",
        );
      }
      return openJobResult(
        job.resultCiphertext,
        privateKey,
        ecies,
        openOptions.expect,
      );
    },

    async readRaw(params) {
      const submitted = await client.submitRawRead(params);
      const job =
        submitted.job && TERMINAL_JOB_STATES.has(submitted.job.state)
          ? submitted.job
          : await client.waitForJob(submitted.jobId, {
              timeoutMs: params.timeoutMs,
              pollMs: params.pollMs,
            });
      return client.openResult(job, {
        expect: {
          jobId: submitted.jobId,
          scope: params.scope,
          ...(params.pinnedVersion !== undefined &&
          params.pinnedVersion !== null
            ? { version: params.pinnedVersion }
            : {}),
        },
      });
    },
  };

  return client;
}
