/**
 * Job queue protocol types for encrypted Personal Server execution.
 *
 *                 Builder -> GW -> Agent -> Sandbox
 * Builder -> GW: submit an enclave-encrypted request.
 * GW -> Agent: claim work with a fenced lease and sealed owner identity.
 * Agent -> Sandbox: decrypt, wake the owner sandbox, and execute privately.
 * Sandbox -> Agent: encrypt the result to the builder's public key.
 * Agent -> GW: complete with ciphertext hash and size, or fail the job.
 * GW -> Builder: return inline or polled status and opaque ciphertext.
 * Builder: decrypt and verify the result's job, scope, and version bindings.
 * See HANDOFF-contract.md section 1 for the complete flow.
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
export type PaymentState = "none" | "reserved" | "settled";
export const DEFAULT_LEASE_SECONDS = 30;
export const MAX_LEASE_SECONDS = 300;
export const MAX_ATTEMPTS = 3;
export const MAX_WAIT_SECONDS = 25;
export const CLAIM_POLL_FLOOR_MS = 1000;
export const MAX_INLINE_RESULT_BYTES = 1_048_576;
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
export interface JobRequestEnvelope {
  request: JobRequest;
  auth: string; /* "Web3Signed <b64>.<sig>" by builder over uri /v1/jobs/execute, bodyHash = sha256(JSON(request)) */
}
/** Outer body of POST /v1/jobs (signed Web3Signed by the builder). */
export interface JobSubmission {
  owner: Address;
  grantId: Hex;
  scope: string;
  operation: JobOperation;
  idempotencyKey: string;
  jobId: string;
  /* client uuid, echoed in JobRequest */ deadline?: string;
  requestCiphertext: string; /* base64 ECIES */
}
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
  resultCiphertext?: string;
  resultHandle?: string;
  resultHash?: Hex;
  resultSize?: number;
  resultExpiresAt?: string;
}
export interface ClaimRequest {
  leaseSeconds?: number;
  capacity?: number;
}
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
export interface HeartbeatRequest {
  leaseSeconds?: number;
  fencingToken: number;
}
export interface CompleteRequest {
  fencingToken: number;
  resultHash: Hex;
  resultSize: number;
  resultCiphertext?: string;
  /* inline <= MAX_INLINE_RESULT_BYTES */ resultHandle?: string; /* v1.1, R2 */
}
export interface FailRequest {
  fencingToken: number;
  reason: string; /* <= 1024, fail.ts:16 */
}
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
export type TeeNodeState = "pending" | "admitted" | "draining" | "removed";
export interface TeeNodeRegistration {
  nodeId: string;
  appId: Hex;
  composeHash: Hex;
  publicUrl: string;
  capacity: number;
  secret: string;
}
export interface TeeNodeHeartbeat {
  composeHash: Hex;
  instanceId: string;
  activeSandboxes: number;
  capacity: number;
}
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
