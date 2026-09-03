/**
 * ECIES envelopes for encrypted job requests and results.
 *
 * Request plaintext is UTF-8 JSON with object keys sorted recursively and
 * array order preserved. Result properties follow their interface order. The
 * wire ciphertext is base64 of `iv || ephemPub || ct || mac`, as specified by
 * the ECIES provider interface. The Gateway hashes raw ciphertext bytes, not
 * plaintext.
 * Per the jobs flow in contract section 1, the builder verifies the decrypted
 * result's job ID, scope, and version bindings.
 * Gateway and PS worker verify
 * `auth.bodyHash === sha256(canonicalJobRequestBytes(request))`.
 *
 * @category Cryptography
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, fromHex, toHex, type Hex } from "viem";
import {
  deserializeECIES,
  serializeECIES,
  type ECIESProvider,
} from "../ecies/interface";
import type {
  JobRequest,
  JobRequestEnvelope,
  JobResult,
} from "../../protocol/jobs";
import { fromBase64, toBase64 } from "../../utils/encoding";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/** A decrypted job envelope did not match the jobs protocol. */
export class JobEnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobEnvelopeError";
  }
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          sortJsonKeys((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
}

function canonicalJsonBytes(value: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(sortJsonKeys(value)));
}

/** Canonical UTF-8 JSON bytes committed to by a job request's auth body hash. */
export function canonicalJobRequestBytes(request: JobRequest): Uint8Array {
  return canonicalJsonBytes(request);
}

function requestPlaintext(envelope: JobRequestEnvelope): Uint8Array {
  return canonicalJsonBytes(envelope);
}

function resultPlaintext(result: JobResult): Uint8Array {
  return textEncoder.encode(
    JSON.stringify({
      v: result.v,
      jobId: result.jobId,
      scope: result.scope,
      version: result.version,
      contentType: result.contentType,
      body: result.body,
    }),
  );
}

function encryptedBytesToBase64(
  encrypted: Awaited<ReturnType<ECIESProvider["encrypt"]>>,
): string {
  return toBase64(fromHex(`0x${serializeECIES(encrypted)}`, "bytes"));
}

function base64ToEncrypted(ciphertext: string) {
  return deserializeECIES(toHex(fromBase64(ciphertext)));
}

function parseObject(
  plaintext: Uint8Array,
  kind: string,
): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(textDecoder.decode(plaintext));
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new JobEnvelopeError(`Invalid ${kind}: expected an object`);
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof JobEnvelopeError) throw error;
    throw new JobEnvelopeError(`Invalid ${kind}: malformed JSON`);
  }
}

function requireString(
  value: unknown,
  field: string,
  kind: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new JobEnvelopeError(`Invalid ${kind}: missing ${field}`);
  }
}

function validateRequestEnvelope(
  value: Record<string, unknown>,
): JobRequestEnvelope {
  const request = value.request;
  if (
    request === null ||
    typeof request !== "object" ||
    Array.isArray(request)
  ) {
    throw new JobEnvelopeError("Invalid job request envelope: missing request");
  }
  const fields = request as Record<string, unknown>;
  if (fields.v !== 1) {
    throw new JobEnvelopeError(
      `Unsupported job request version: ${String(fields.v)}`,
    );
  }
  for (const field of [
    "jobId",
    "owner",
    "builder",
    "builderPublicKey",
    "grantId",
    "scope",
    "operation",
    "deadline",
  ]) {
    requireString(fields[field], field, "job request");
  }
  if (
    fields.pinnedVersion !== null &&
    typeof fields.pinnedVersion !== "string"
  ) {
    throw new JobEnvelopeError("Invalid job request: missing pinnedVersion");
  }
  requireString(value.auth, "auth", "job request envelope");
  return value as unknown as JobRequestEnvelope;
}

function validateResult(value: Record<string, unknown>): JobResult {
  if (value.v !== 1) {
    throw new JobEnvelopeError(
      `Unsupported job result version: ${String(value.v)}`,
    );
  }
  for (const field of ["jobId", "scope", "contentType"]) {
    requireString(value[field], field, "job result");
  }
  if (typeof value.body !== "string") {
    throw new JobEnvelopeError("Invalid job result: missing body");
  }
  if (value.version !== null && typeof value.version !== "string") {
    throw new JobEnvelopeError("Invalid job result: missing version");
  }
  return value as unknown as JobResult;
}

export async function sealJobRequest(
  e: JobRequestEnvelope,
  enclavePublicKey: Hex,
  ecies: ECIESProvider,
): Promise<string> {
  const encrypted = await ecies.encrypt(
    fromHex(enclavePublicKey, "bytes"),
    requestPlaintext(e),
  );
  return encryptedBytesToBase64(encrypted);
}

export async function openJobRequest(
  ciphertext: string,
  privateKey: Uint8Array,
  ecies: ECIESProvider,
): Promise<JobRequestEnvelope> {
  const plaintext = await ecies.decrypt(
    privateKey,
    base64ToEncrypted(ciphertext),
  );
  return validateRequestEnvelope(
    parseObject(plaintext, "job request envelope"),
  );
}

export async function sealJobResult(
  r: JobResult,
  builderPublicKey: Hex,
  ecies: ECIESProvider,
): Promise<{ ciphertext: string; hash: Hex; size: number }> {
  const encrypted = await ecies.encrypt(
    fromHex(builderPublicKey, "bytes"),
    resultPlaintext(r),
  );
  const ciphertext = encryptedBytesToBase64(encrypted);
  const bytes = fromBase64(ciphertext);
  return { ciphertext, hash: bytesToHex(sha256(bytes)), size: bytes.length };
}

export async function openJobResult(
  ciphertext: string,
  builderPrivateKey: Hex,
  ecies: ECIESProvider,
  expect: { jobId: string; scope?: string; version?: string | null },
): Promise<JobResult> {
  const plaintext = await ecies.decrypt(
    fromHex(builderPrivateKey, "bytes"),
    base64ToEncrypted(ciphertext),
  );
  const result = validateResult(parseObject(plaintext, "job result"));
  if (result.jobId !== expect.jobId) {
    throw new JobEnvelopeError(
      `Job result ID ${result.jobId} does not match expected job ID ${expect.jobId}`,
    );
  }
  if (expect.scope !== undefined && result.scope !== expect.scope) {
    throw new JobEnvelopeError(
      `Job result scope ${result.scope} does not match expected scope ${expect.scope}`,
    );
  }
  if (expect.version !== undefined && result.version !== expect.version) {
    throw new JobEnvelopeError(
      `Job result version ${String(result.version)} does not match expected version ${String(expect.version)}`,
    );
  }
  return result;
}
