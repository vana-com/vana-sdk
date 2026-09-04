/**
 * Job queue protocol types for encrypted Personal Server execution.
 *
 *                 Builder -> GW -> Agent -> Sandbox
 * Builder -> GW: submit an enclave-encrypted request.
 * GW -> Agent: claim work with a fenced lease and sealed owner identity.
 * Agent -> Sandbox: decrypt, wake the owner sandbox, and execute privately.
 * Sandbox -> Agent: encrypt the result to the builder's public key.
 * Agent -> GW: store the sealed result and complete with its object key, hash, and size.
 * GW -> Builder: return inline or polled status with an object-storage handle.
 * Builder: decrypt and verify the result's job, scope, and version bindings.
 * Full flow: personal-server-ts `docs/260903-jobs-contract.md`, section 1.
 *
 * @category Protocol
 */

import type { Address, Hex } from "viem";
import type { SealedEnvelope } from "./identity";

export const JOB_PROTOCOL_VERSION = 1;
export const JOB_OPERATIONS = ["raw_read", "inference"] as const;
export type JobOperation = (typeof JOB_OPERATIONS)[number];
export const JOB_STATES = [
  "queued",
  "claimed",
  "running",
  "completed",
  "failed",
  "expired",
  "cancelled",
] as const;
export type JobState = (typeof JOB_STATES)[number];
/** Payment lifecycle recorded for a queued job. */
export type PaymentState = "none" | "reserved" | "settled";
export const DEFAULT_LEASE_SECONDS = 30;
export const MAX_LEASE_SECONDS = 300;
export const MAX_ATTEMPTS = 3;
export const MAX_WAIT_SECONDS = 25;
export const CLAIM_POLL_FLOOR_MS = 1000;
export const DEFAULT_JOB_DEADLINE_SECONDS = 600;
export const MAX_JOB_DEADLINE_SECONDS = 3600;

/** Inner plaintext of the request box (ECIES to the enclave publicKey). */
export interface JobRequest {
  v: 1;
  jobId: string;
  owner: Address;
  builder: Address;
  builderPublicKey: Hex;
  grantId: Hex;
  scope: string;
  operation: JobOperation;
  pinnedVersion: string | null;
  deadline: string; /* ISO */
}
/** Plaintext of the request box; the Gateway never sees it. */
export interface JobRequestEnvelope {
  request: JobRequest;
  /**
   * `Web3Signed <b64>.<sig>` by the builder: `aud` = Gateway origin,
   * `uri` = `/v1/jobs/execute`,
   * `bodyHash` = `sha256(canonicalJobRequestBytes(request))`.
   */
  auth: string;
}
/** Outer body of POST /v1/jobs (signed Web3Signed by the builder). */
export interface JobSubmission {
  owner: Address;
  grantId: Hex;
  scope: string;
  operation: JobOperation;
  idempotencyKey: string;
  /** Client UUID, echoed in `JobRequest.jobId`. */
  jobId: string;
  deadline?: string;
  /** Base64 ECIES from `sealJobRequest`. */
  requestCiphertext: string;
}
/** Where a completed job's sealed result lives. Bytes never transit the Gateway. */
export interface ResultHandle {
  /** Object key in vana-storage, `jobresults/{chainId}/{jobId}`. */
  objectKey: string;
  /** Absolute URL the builder GETs. The Gateway builds it from its storage origin. */
  url: string;
  /** Byte length of the sealed object. */
  size: number;
  /** sha256 of the sealed bytes, 0x-prefixed. */
  hash: Hex;
  /** Logical expiry. After this the Gateway stops serving the handle. */
  expiresAt: string;
}
/** Response from `GET /v1/jobs/:id`. */
export interface JobStatus {
  jobId: string;
  state: JobState;
  operation: JobOperation;
  owner: Address;
  grantId: Hex;
  scope: string;
  pinnedVersion: string | null;
  attempt: number;
  price: string;
  payer: "builder";
  paymentState: PaymentState;
  createdAt: string;
  claimedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  /** Present only when `state === "completed"`. */
  result?: ResultHandle;
}
/** Request body for `POST /v1/jobs/claim`. */
export interface ClaimRequest {
  leaseSeconds?: number;
  capacity?: number;
}
/** Claimed job and owner identity returned by `POST /v1/jobs/claim`. */
export interface ClaimResponse {
  job: {
    jobId: string;
    owner: Address;
    builder: Address;
    grantId: Hex;
    scope: string;
    operation: JobOperation;
    pinnedVersion: string | null;
    requestCiphertext: string;
    attempt: number;
    deadlineAt: string | null;
    claimExpiresAt: string;
    fencingToken: number; /* = attempt; every node write echoes it */
  };
  identity: {
    userPsId: Hex;
    epoch: number;
    enclaveAddress: Address;
    enclavePublicKey: Hex;
    sealedEnvelope: SealedEnvelope;
  };
}
/** Request body for `POST /v1/jobs/:id/heartbeat`. */
export interface HeartbeatRequest {
  leaseSeconds?: number;
  fencingToken: number;
}
/** Request body for `POST /v1/jobs/:id/complete`. */
export interface CompleteRequest {
  fencingToken: number;
  resultHash: Hex;
  resultSize: number;
  /** `jobresults/{chainId}/{jobId}`. */
  resultObjectKey: string;
}
/** Request body for `POST /v1/jobs/:id/fail`. */
export interface FailRequest {
  fencingToken: number;
  reason: string; /* <= 1024, fail.ts:16 */
}
/** Successful response from a fenced job write endpoint. */
export interface FencedResponse {
  success: true;
  jobId: string;
  state: JobState;
  claimExpiresAt: string | null;
}
/** Inner plaintext of the result box (ECIES to builderPublicKey). */
export interface JobResult {
  v: 1;
  jobId: string;
  scope: string;
  version: string | null;
  contentType: string;
  body: string; /* base64 */
}
/** Admission lifecycle of a registered TEE node. */
export type TeeNodeState = "pending" | "admitted" | "draining" | "removed";
/** Request body for `POST /v1/tee-nodes`. */
export interface TeeNodeRegistration {
  nodeId: string;
  appId: Hex;
  composeHash: Hex;
  publicUrl: string;
  capacity: number;
  secret: string;
}
/** Request body for `POST /v1/tee-nodes/:id/heartbeat`. */
export interface TeeNodeHeartbeat {
  composeHash: Hex;
  instanceId: string;
  activeSandboxes: number;
  capacity: number;
}
/** Public registration and capacity state for a TEE node. */
export interface TeeNode {
  nodeId: string;
  appId: Hex;
  composeHash: Hex;
  publicUrl: string;
  state: TeeNodeState;
  capacity: number;
  activeSandboxes: number;
  lastHeartbeatAt: string | null;
}
