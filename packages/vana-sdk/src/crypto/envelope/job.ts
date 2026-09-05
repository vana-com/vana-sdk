/**
 * ECIES envelopes for encrypted job requests and results.
 *
 * Request plaintext is UTF-8 JSON with object keys sorted recursively and
 * array order preserved. Result bodies use a hybrid streaming envelope:
 * ECIES wraps a random AES key, nonce prefix, and result metadata, while fixed
 * chunks of the body are sealed independently with AES-256-GCM. The Request
 * ciphertext is base64 of `iv || ephemPub || ct || mac`, as specified by the
 * ECIES provider interface. Result ciphertext is the raw hybrid byte sequence
 * stored in object storage. The Gateway hashes raw ciphertext bytes, not
 * plaintext.
 * The builder verifies the decrypted result's job ID, scope, and version
 * bindings. The PS worker verifies
 * `auth.bodyHash === sha256(canonicalJobRequestBytes(request))`; the Gateway
 * never sees the plaintext. Flow: personal-server-ts
 * `docs/260903-jobs-contract.md`, section 1.
 *
 * @category Cryptography
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, fromHex, isAddress, isHex, toHex, type Hex } from "viem";
import { CURVE, FORMAT, MAC } from "../ecies/constants";
import {
  deserializeECIES,
  ECIESError,
  serializeECIES,
  type ECIESEncrypted,
  type ECIESProvider,
} from "../ecies/interface";
import {
  JOB_OPERATIONS,
  JOB_PROTOCOL_VERSION,
  type JobOperation,
  type JobRequest,
  type JobRequestEnvelope,
  type JobResult,
} from "../../protocol/jobs";
import { fromBase64, toBase64 } from "../../utils/encoding";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
/** Result metadata is only a few short fields; cap it before decoding attacker-reachable bytes. */
const MAX_JOB_RESULT_HEADER_BYTES = 4096;
const WRAPPED_KEY_LENGTH_BYTES = 4;
const FRAME_LENGTH_BYTES = 4;
const FRAME_FLAGS_BYTES = 1;
const AES_KEY_BYTES = 32;
const AES_GCM_NONCE_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;
const WRAPPED_METADATA_LENGTH_BYTES = 4;
const WRAPPED_KEY_PLAINTEXT_PREFIX_BYTES =
  AES_KEY_BYTES + AES_GCM_NONCE_BYTES + WRAPPED_METADATA_LENGTH_BYTES;
const MAX_WRAPPED_KEY_BYTES = 8192;
const FINAL_FRAME_FLAG = 1;
const MAX_CHUNK_INDEX = 0xffffffff;

/** Current hybrid sealed-result wire-format version. */
export const JOB_RESULT_FORMAT_VERSION = 2;
/** Plaintext bytes authenticated independently in each result frame. */
export const JOB_RESULT_CHUNK_BYTES = 1024 * 1024;

/** Result fields authenticated for every encrypted body chunk. */
export type JobResultMetadata = Omit<JobResult, "body">;

/** Streaming sealer output. Write the header before transformed body frames. */
export interface SealedJobResultStream {
  header: Uint8Array;
  transform: TransformStream<Uint8Array, Uint8Array>;
}

/** Verified metadata and incrementally decrypted result body. */
export interface OpenedJobResultStream {
  metadata: JobResultMetadata;
  body: ReadableStream<Uint8Array>;
}

/** Builder-visible bindings checked before any result body chunk is yielded. */
export interface JobResultExpectation {
  jobId: string;
  scope?: string;
  version?: string | null;
}

/** A job envelope or result did not match the jobs protocol. */
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

/**
 * Returns the canonical UTF-8 JSON bytes committed to by the auth body hash.
 *
 * @param request - Job request to validate and serialize canonically.
 * @returns Recursively key-sorted, whitespace-free UTF-8 JSON bytes.
 * @throws {JobEnvelopeError} If the request does not match the protocol schema.
 */
export function canonicalJobRequestBytes(request: JobRequest): Uint8Array {
  validateJobRequest(request);
  return canonicalJsonBytes(request);
}

function requestPlaintext(envelope: JobRequestEnvelope): Uint8Array {
  validateRequestEnvelope(envelope);
  return canonicalJsonBytes(envelope);
}

function resultMetadata(result: JobResult): JobResultMetadata {
  return {
    v: result.v,
    jobId: result.jobId,
    scope: result.scope,
    version: result.version,
    contentType: result.contentType,
  };
}

function encryptedBytesToBase64(
  encrypted: Awaited<ReturnType<ECIESProvider["encrypt"]>>,
): string {
  return toBase64(fromHex(`0x${serializeECIES(encrypted)}`, "bytes"));
}

function encryptedToBytes(
  encrypted: Awaited<ReturnType<ECIESProvider["encrypt"]>>,
): Uint8Array {
  const bytes = new Uint8Array(
    encrypted.iv.length +
      encrypted.ephemPublicKey.length +
      encrypted.ciphertext.length +
      encrypted.mac.length,
  );
  let offset = 0;
  bytes.set(encrypted.iv, offset);
  offset += encrypted.iv.length;
  bytes.set(encrypted.ephemPublicKey, offset);
  offset += encrypted.ephemPublicKey.length;
  bytes.set(encrypted.ciphertext, offset);
  offset += encrypted.ciphertext.length;
  bytes.set(encrypted.mac, offset);
  return bytes;
}

function bytesToEncrypted(bytes: Uint8Array): ECIESEncrypted {
  const absoluteMinLength = FORMAT.IV_LENGTH + 1 + MAC.LENGTH + 1;
  if (bytes.length < absoluteMinLength) {
    throw new ECIESError(
      `Invalid ECIES data: too short (${bytes.length} bytes, minimum ${absoluteMinLength} bytes required)`,
      "DECRYPTION_FAILED",
    );
  }

  const prefix = bytes[FORMAT.EPHEMERAL_KEY_OFFSET];
  if (prefix !== CURVE.PREFIX.UNCOMPRESSED) {
    throw new ECIESError(
      `Invalid ephemeral public key: must be uncompressed format (0x04 prefix), got 0x${prefix.toString(16).padStart(2, "0")}`,
      "DECRYPTION_FAILED",
    );
  }

  const ephemKeySize = CURVE.UNCOMPRESSED_PUBLIC_KEY_LENGTH;
  const minLength = FORMAT.IV_LENGTH + ephemKeySize + MAC.LENGTH + 1;
  if (bytes.length < minLength) {
    throw new ECIESError(
      `Invalid ECIES data: too short (${bytes.length} bytes, minimum ${minLength} bytes required)`,
      "DECRYPTION_FAILED",
    );
  }

  return {
    iv: bytes.subarray(FORMAT.IV_OFFSET, FORMAT.IV_OFFSET + FORMAT.IV_LENGTH),
    ephemPublicKey: bytes.subarray(
      FORMAT.EPHEMERAL_KEY_OFFSET,
      FORMAT.EPHEMERAL_KEY_OFFSET + ephemKeySize,
    ),
    ciphertext: bytes.subarray(
      FORMAT.EPHEMERAL_KEY_OFFSET + ephemKeySize,
      bytes.length - MAC.LENGTH,
    ),
    mac: bytes.subarray(bytes.length - MAC.LENGTH),
  };
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainObject(
  value: unknown,
  field: string,
  kind: string,
): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new JobEnvelopeError(`Invalid ${kind}: invalid ${field}`);
  }
}

function requireExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  kind: string,
): void {
  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key) || value[key] === undefined) {
      throw new JobEnvelopeError(`Invalid ${kind}: missing ${key}`);
    }
  }
  const expected = new Set<PropertyKey>(expectedKeys);
  for (const key of Reflect.ownKeys(value)) {
    if (!expected.has(key)) {
      throw new JobEnvelopeError(
        `Invalid ${kind}: unknown field ${String(key)}`,
      );
    }
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

function validateJobRequest(value: unknown): JobRequest {
  requirePlainObject(value, "request", "job request");
  requireExactKeys(
    value,
    [
      "v",
      "jobId",
      "owner",
      "builder",
      "builderPublicKey",
      "grantId",
      "scope",
      "operation",
      "pinnedVersion",
      "deadline",
    ],
    "job request",
  );
  if (value.v !== JOB_PROTOCOL_VERSION) {
    throw new JobEnvelopeError(
      `Unsupported job request version: ${String(value.v)}`,
    );
  }
  requireString(value.jobId, "jobId", "job request");
  if (typeof value.owner !== "string" || !isAddress(value.owner)) {
    throw new JobEnvelopeError("Invalid job request: invalid owner");
  }
  if (typeof value.builder !== "string" || !isAddress(value.builder)) {
    throw new JobEnvelopeError("Invalid job request: invalid builder");
  }
  if (
    typeof value.builderPublicKey !== "string" ||
    !isHex(value.builderPublicKey)
  ) {
    throw new JobEnvelopeError("Invalid job request: invalid builderPublicKey");
  }
  if (typeof value.grantId !== "string" || !isHex(value.grantId)) {
    throw new JobEnvelopeError("Invalid job request: invalid grantId");
  }
  requireString(value.scope, "scope", "job request");
  if (!JOB_OPERATIONS.includes(value.operation as JobOperation)) {
    throw new JobEnvelopeError("Invalid job request: invalid operation");
  }
  if (value.pinnedVersion !== null && typeof value.pinnedVersion !== "string") {
    throw new JobEnvelopeError("Invalid job request: missing pinnedVersion");
  }
  if (
    typeof value.deadline !== "string" ||
    !Number.isFinite(Date.parse(value.deadline))
  ) {
    throw new JobEnvelopeError("Invalid job request: invalid deadline");
  }
  return value as unknown as JobRequest;
}

function validateRequestEnvelope(value: unknown): JobRequestEnvelope {
  requirePlainObject(value, "envelope", "job request envelope");
  requireExactKeys(value, ["request", "auth"], "job request envelope");
  validateJobRequest(value.request);
  requireString(value.auth, "auth", "job request envelope");
  return value as unknown as JobRequestEnvelope;
}

function validateResultMetadata(value: unknown): JobResultMetadata {
  requirePlainObject(value, "metadata", "job result");
  requireExactKeys(
    value,
    ["v", "jobId", "scope", "version", "contentType"],
    "job result",
  );
  if (value.v !== JOB_PROTOCOL_VERSION) {
    throw new JobEnvelopeError(
      `Unsupported job result version: ${String(value.v)}`,
    );
  }
  for (const field of ["jobId", "scope", "contentType"]) {
    requireString(value[field], field, "job result");
  }
  if (value.version !== null && typeof value.version !== "string") {
    throw new JobEnvelopeError("Invalid job result: missing version");
  }
  return value as unknown as JobResultMetadata;
}

function validateResult(value: unknown): JobResult {
  requirePlainObject(value, "result", "job result");
  requireExactKeys(
    value,
    ["v", "jobId", "scope", "version", "contentType", "body"],
    "job result",
  );
  validateResultMetadata(resultMetadata(value as unknown as JobResult));
  if (!(value.body instanceof Uint8Array)) {
    throw new JobEnvelopeError("Invalid job result: missing body");
  }
  return value as unknown as JobResult;
}

function webCrypto(): Crypto {
  if (
    typeof globalThis.crypto === "undefined" ||
    typeof globalThis.crypto.getRandomValues !== "function" ||
    !globalThis.crypto.subtle
  ) {
    throw new JobEnvelopeError(
      "Job result streaming requires the Web Crypto API",
    );
  }
  return globalThis.crypto;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

function readUint32(bytes: Uint8Array, offset = 0): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}

function wrappedKeyPlaintext(
  contentKey: Uint8Array,
  noncePrefix: Uint8Array,
  metadataBytes: Uint8Array,
): Uint8Array {
  const plaintext = new Uint8Array(
    WRAPPED_KEY_PLAINTEXT_PREFIX_BYTES + metadataBytes.length,
  );
  plaintext.set(contentKey, 0);
  plaintext.set(noncePrefix, AES_KEY_BYTES);
  new DataView(plaintext.buffer).setUint32(
    AES_KEY_BYTES + AES_GCM_NONCE_BYTES,
    metadataBytes.length,
  );
  plaintext.set(metadataBytes, WRAPPED_KEY_PLAINTEXT_PREFIX_BYTES);
  return plaintext;
}

function parseWrappedKeyPlaintext(plaintext: Uint8Array): {
  contentKey: Uint8Array;
  noncePrefix: Uint8Array;
  metadataBytes: Uint8Array;
  metadata: JobResultMetadata;
} {
  if (plaintext.length < WRAPPED_KEY_PLAINTEXT_PREFIX_BYTES) {
    throw new JobEnvelopeError("Invalid job result: wrapped key is truncated");
  }
  const metadataLength = readUint32(
    plaintext,
    AES_KEY_BYTES + AES_GCM_NONCE_BYTES,
  );
  if (metadataLength > MAX_JOB_RESULT_HEADER_BYTES) {
    throw new JobEnvelopeError(
      `Invalid job result: header exceeds ${MAX_JOB_RESULT_HEADER_BYTES} bytes`,
    );
  }
  if (
    plaintext.length !==
    WRAPPED_KEY_PLAINTEXT_PREFIX_BYTES + metadataLength
  ) {
    throw new JobEnvelopeError(
      "Invalid job result: header length exceeds payload",
    );
  }
  const metadataBytes = plaintext.slice(WRAPPED_KEY_PLAINTEXT_PREFIX_BYTES);
  const metadata = validateResultMetadata(
    parseObject(metadataBytes, "job result header"),
  );
  return {
    contentKey: plaintext.slice(0, AES_KEY_BYTES),
    noncePrefix: plaintext.slice(
      AES_KEY_BYTES,
      AES_KEY_BYTES + AES_GCM_NONCE_BYTES,
    ),
    metadataBytes,
    metadata,
  };
}

async function importAesKey(
  contentKey: Uint8Array,
  usage: KeyUsage,
): Promise<CryptoKey> {
  return webCrypto().subtle.importKey(
    "raw",
    contentKey as BufferSource,
    { name: "AES-GCM" },
    false,
    [usage],
  );
}

function chunkNonce(noncePrefix: Uint8Array, chunkIndex: number): Uint8Array {
  if (chunkIndex > MAX_CHUNK_INDEX) {
    throw new JobEnvelopeError("Invalid job result: too many chunks");
  }
  const nonce = noncePrefix.slice();
  const view = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
  view.setUint32(8, view.getUint32(8) ^ chunkIndex);
  return nonce;
}

function chunkAad(
  metadataBytes: Uint8Array,
  chunkIndex: number,
  final: boolean,
  plaintextLength: number,
): Uint8Array {
  const aad = new Uint8Array(14 + metadataBytes.length);
  aad[0] = JOB_RESULT_FORMAT_VERSION;
  aad.set(uint32(metadataBytes.length), 1);
  aad.set(metadataBytes, 5);
  aad.set(uint32(chunkIndex), 5 + metadataBytes.length);
  aad[9 + metadataBytes.length] = final ? FINAL_FRAME_FLAG : 0;
  aad.set(uint32(plaintextLength), 10 + metadataBytes.length);
  return aad;
}

async function encryptResultChunk(
  key: CryptoKey,
  noncePrefix: Uint8Array,
  metadataBytes: Uint8Array,
  plaintext: Uint8Array,
  chunkIndex: number,
  final: boolean,
): Promise<Uint8Array> {
  const encrypted = new Uint8Array(
    await webCrypto().subtle.encrypt(
      {
        name: "AES-GCM",
        iv: chunkNonce(noncePrefix, chunkIndex) as BufferSource,
        additionalData: chunkAad(
          metadataBytes,
          chunkIndex,
          final,
          plaintext.length,
        ) as BufferSource,
        tagLength: AES_GCM_TAG_BYTES * 8,
      },
      key,
      plaintext as BufferSource,
    ),
  );
  const frame = new Uint8Array(
    FRAME_LENGTH_BYTES + FRAME_FLAGS_BYTES + encrypted.length,
  );
  new DataView(frame.buffer).setUint32(0, encrypted.length);
  frame[FRAME_LENGTH_BYTES] = final ? FINAL_FRAME_FLAG : 0;
  frame.set(encrypted, FRAME_LENGTH_BYTES + FRAME_FLAGS_BYTES);
  return frame;
}

function verifyResultBindings(
  metadata: JobResultMetadata,
  expect: JobResultExpectation,
): void {
  if (metadata.jobId !== expect.jobId) {
    throw new JobEnvelopeError(
      `Job result ID ${metadata.jobId} does not match expected job ID ${expect.jobId}`,
    );
  }
  if (expect.scope !== undefined && metadata.scope !== expect.scope) {
    throw new JobEnvelopeError(
      `Job result scope ${metadata.scope} does not match expected scope ${expect.scope}`,
    );
  }
  if (expect.version !== undefined && metadata.version !== expect.version) {
    throw new JobEnvelopeError(
      `Job result version ${String(metadata.version)} does not match expected version ${String(expect.version)}`,
    );
  }
}

class ByteStreamReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private current: Uint8Array | undefined;
  private offset = 0;
  private ended = false;

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
  }

  private async ensureBytes(): Promise<boolean> {
    while (!this.current || this.offset === this.current.length) {
      if (this.ended) return false;
      const next = await this.reader.read();
      if (next.done) {
        this.ended = true;
        this.current = undefined;
        return false;
      }
      if (!(next.value instanceof Uint8Array)) {
        throw new JobEnvelopeError(
          "Invalid job result: stream yielded non-byte data",
        );
      }
      this.current = next.value;
      this.offset = 0;
    }
    return true;
  }

  async readExactOrNull(length: number): Promise<Uint8Array | null> {
    if (!(await this.ensureBytes())) return null;
    const bytes = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      if (!(await this.ensureBytes())) {
        throw new JobEnvelopeError("Invalid job result: truncated payload");
      }
      const available = this.current!.length - this.offset;
      const count = Math.min(available, length - written);
      bytes.set(
        this.current!.subarray(this.offset, this.offset + count),
        written,
      );
      this.offset += count;
      written += count;
    }
    return bytes;
  }

  async readExact(length: number): Promise<Uint8Array> {
    const bytes = await this.readExactOrNull(length);
    if (!bytes) {
      throw new JobEnvelopeError("Invalid job result: truncated payload");
    }
    return bytes;
  }

  async hasRemaining(): Promise<boolean> {
    return this.ensureBytes();
  }

  async cancel(reason?: unknown): Promise<void> {
    await this.reader.cancel(reason);
  }
}

function normalizeChunkError(error: unknown): Error {
  if (error instanceof JobEnvelopeError) return error;
  return new JobEnvelopeError(
    `Invalid job result: chunk authentication failed${error instanceof Error ? `: ${error.message}` : ""}`,
  );
}

/**
 * Encrypts a validated job request envelope for a Personal Server enclave.
 *
 * The PS worker verifies
 * `auth.bodyHash === sha256(canonicalJobRequestBytes(request))`; the Gateway
 * never sees the plaintext.
 *
 * @param envelope - Request and builder Web3Signed authorization to encrypt.
 * @param enclavePublicKey - Public key returned by `GET /v1/identity?owner=`.
 * @param ecies - Injected ECIES implementation.
 * @returns Base64 ciphertext encoded as `iv || ephemPub || ct || mac`.
 * @throws {JobEnvelopeError} If the envelope or request is invalid.
 * @throws If ECIES encryption fails or the enclave public key is invalid.
 *
 * @example
 * ```ts
 * const identity = await fetch(`/v1/identity?owner=${owner}`).then((response) =>
 *   response.json(),
 * );
 * const requestCiphertext = await sealJobRequest(
 *   requestEnvelope,
 *   identity.publicKey,
 *   ecies,
 * );
 * await fetch("/v1/jobs", {
 *   method: "POST",
 *   body: JSON.stringify({ ...submission, requestCiphertext }),
 * });
 * ```
 */
export async function sealJobRequest(
  envelope: JobRequestEnvelope,
  enclavePublicKey: Hex,
  ecies: ECIESProvider,
): Promise<string> {
  const encrypted = await ecies.encrypt(
    fromHex(enclavePublicKey, "bytes"),
    requestPlaintext(envelope),
  );
  return encryptedBytesToBase64(encrypted);
}

/**
 * Decrypts and validates a job request envelope inside the enclave.
 *
 * @param ciphertext - Base64 `iv || ephemPub || ct || mac` ciphertext.
 * @param privateKey - Enclave key bytes, supplied as `Uint8Array` so the agent can zero them after use.
 * @param ecies - Injected ECIES implementation.
 * @returns The validated request envelope exactly as parsed from plaintext.
 * @throws {JobEnvelopeError} If plaintext is malformed or fails schema validation.
 * @throws If ciphertext decoding or ECIES decryption fails.
 */
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

/** Create a bounded-memory hybrid sealer for a job result body. */
export async function sealJobResultStream(
  metadataValue: JobResultMetadata,
  builderPublicKey: Hex,
  ecies: ECIESProvider,
): Promise<SealedJobResultStream> {
  const metadata = validateResultMetadata(metadataValue);
  const metadataBytes = canonicalJsonBytes(metadata);
  if (metadataBytes.length > MAX_JOB_RESULT_HEADER_BYTES) {
    throw new JobEnvelopeError(
      `Invalid job result: header exceeds ${MAX_JOB_RESULT_HEADER_BYTES} bytes`,
    );
  }

  const crypto = webCrypto();
  const contentKey = crypto.getRandomValues(new Uint8Array(AES_KEY_BYTES));
  const noncePrefix = crypto.getRandomValues(
    new Uint8Array(AES_GCM_NONCE_BYTES),
  );
  const key = await importAesKey(contentKey, "encrypt");
  const keyPlaintext = wrappedKeyPlaintext(
    contentKey,
    noncePrefix,
    metadataBytes,
  );
  const encryptedKey = await ecies.encrypt(
    fromHex(builderPublicKey, "bytes"),
    keyPlaintext,
  );
  contentKey.fill(0);
  keyPlaintext.fill(0);
  const wrappedKey = encryptedToBytes(encryptedKey);
  if (wrappedKey.length > MAX_WRAPPED_KEY_BYTES) {
    throw new JobEnvelopeError("Invalid job result: wrapped key is too large");
  }
  const header = new Uint8Array(
    1 + WRAPPED_KEY_LENGTH_BYTES + wrappedKey.length,
  );
  header[0] = JOB_RESULT_FORMAT_VERSION;
  new DataView(header.buffer).setUint32(1, wrappedKey.length);
  header.set(wrappedKey, 1 + WRAPPED_KEY_LENGTH_BYTES);

  let pending = new Uint8Array(JOB_RESULT_CHUNK_BYTES);
  let pendingLength = 0;
  let chunkIndex = 0;
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      if (!(chunk instanceof Uint8Array)) {
        throw new JobEnvelopeError(
          "Invalid job result: stream yielded non-byte data",
        );
      }
      let offset = 0;
      while (offset < chunk.length) {
        if (pendingLength === JOB_RESULT_CHUNK_BYTES) {
          controller.enqueue(
            await encryptResultChunk(
              key,
              noncePrefix,
              metadataBytes,
              pending,
              chunkIndex,
              false,
            ),
          );
          chunkIndex += 1;
          pending = new Uint8Array(JOB_RESULT_CHUNK_BYTES);
          pendingLength = 0;
        }
        const count = Math.min(
          chunk.length - offset,
          JOB_RESULT_CHUNK_BYTES - pendingLength,
        );
        pending.set(chunk.subarray(offset, offset + count), pendingLength);
        pendingLength += count;
        offset += count;
      }
    },
    async flush(controller) {
      controller.enqueue(
        await encryptResultChunk(
          key,
          noncePrefix,
          metadataBytes,
          pending.subarray(0, pendingLength),
          chunkIndex,
          true,
        ),
      );
    },
  });

  return { header, transform };
}

/**
 * Encrypts a validated job result for its builder and describes the ciphertext.
 *
 * This compatibility wrapper drives {@link sealJobResultStream} and allocates
 * the final sealed byte array once. `hash` and `size` retain their Gateway
 * object-storage semantics.
 */
export async function sealJobResult(
  result: JobResult,
  builderPublicKey: Hex,
  ecies: ECIESProvider,
): Promise<{ bytes: Uint8Array; hash: Hex; size: number }> {
  validateResult(result);
  const sealed = await sealJobResultStream(
    resultMetadata(result),
    builderPublicKey,
    ecies,
  );
  const frameCount = Math.max(
    1,
    Math.ceil(result.body.length / JOB_RESULT_CHUNK_BYTES),
  );
  const size =
    sealed.header.length +
    result.body.length +
    frameCount * (FRAME_LENGTH_BYTES + FRAME_FLAGS_BYTES + AES_GCM_TAG_BYTES);
  const bytes = new Uint8Array(size);
  bytes.set(sealed.header, 0);
  let outputOffset = sealed.header.length;
  const reader = sealed.transform.readable.getReader();
  const drain = (async () => {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes.set(next.value, outputOffset);
      outputOffset += next.value.length;
    }
  })();
  const writer = sealed.transform.writable.getWriter();
  const fill = (async () => {
    for (
      let offset = 0;
      offset < result.body.length;
      offset += JOB_RESULT_CHUNK_BYTES
    ) {
      await writer.write(
        result.body.subarray(offset, offset + JOB_RESULT_CHUNK_BYTES),
      );
    }
    await writer.close();
  })();
  await Promise.all([drain, fill]);
  if (outputOffset !== bytes.length) {
    throw new JobEnvelopeError("Invalid job result: sealed size mismatch");
  }
  return { bytes, hash: bytesToHex(sha256(bytes)), size };
}

/** Open and authenticate a hybrid job result without buffering its body. */
export async function openJobResultStream(
  bytesStream: ReadableStream<Uint8Array>,
  builderPrivateKey: Hex,
  ecies: ECIESProvider,
  expect: JobResultExpectation,
): Promise<OpenedJobResultStream> {
  const reader = new ByteStreamReader(bytesStream);
  const headerPrefix = await reader.readExact(1 + WRAPPED_KEY_LENGTH_BYTES);
  const formatVersion = headerPrefix[0];
  if (formatVersion !== JOB_RESULT_FORMAT_VERSION) {
    throw new JobEnvelopeError(
      `Unsupported job result format: ${String(formatVersion)}`,
    );
  }
  const wrappedKeyLength = readUint32(headerPrefix, 1);
  if (wrappedKeyLength === 0 || wrappedKeyLength > MAX_WRAPPED_KEY_BYTES) {
    throw new JobEnvelopeError(
      "Invalid job result: invalid wrapped key length",
    );
  }
  const wrappedKey = await reader.readExact(wrappedKeyLength);
  const keyPlaintext = await ecies.decrypt(
    fromHex(builderPrivateKey, "bytes"),
    bytesToEncrypted(wrappedKey),
  );
  const parsed = parseWrappedKeyPlaintext(keyPlaintext);
  verifyResultBindings(parsed.metadata, expect);
  const key = await importAesKey(parsed.contentKey, "decrypt");
  parsed.contentKey.fill(0);
  keyPlaintext.fill(0);

  let chunkIndex = 0;
  let finished = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) {
        controller.close();
        return;
      }
      try {
        const frameHeader = await reader.readExactOrNull(
          FRAME_LENGTH_BYTES + FRAME_FLAGS_BYTES,
        );
        if (!frameHeader) {
          throw new JobEnvelopeError("Invalid job result: missing final chunk");
        }
        const encryptedLength = readUint32(frameHeader);
        if (
          encryptedLength < AES_GCM_TAG_BYTES ||
          encryptedLength > JOB_RESULT_CHUNK_BYTES + AES_GCM_TAG_BYTES
        ) {
          throw new JobEnvelopeError(
            "Invalid job result: invalid chunk length",
          );
        }
        const flags = frameHeader[FRAME_LENGTH_BYTES];
        if (flags !== 0 && flags !== FINAL_FRAME_FLAG) {
          throw new JobEnvelopeError("Invalid job result: invalid chunk flags");
        }
        const final = flags === FINAL_FRAME_FLAG;
        const plaintextLength = encryptedLength - AES_GCM_TAG_BYTES;
        if (!final && plaintextLength !== JOB_RESULT_CHUNK_BYTES) {
          throw new JobEnvelopeError(
            "Invalid job result: short non-final chunk",
          );
        }
        const encrypted = await reader.readExact(encryptedLength);
        const plaintext = new Uint8Array(
          await webCrypto().subtle.decrypt(
            {
              name: "AES-GCM",
              iv: chunkNonce(parsed.noncePrefix, chunkIndex) as BufferSource,
              additionalData: chunkAad(
                parsed.metadataBytes,
                chunkIndex,
                final,
                plaintextLength,
              ) as BufferSource,
              tagLength: AES_GCM_TAG_BYTES * 8,
            },
            key,
            encrypted as BufferSource,
          ),
        );
        if (plaintext.length !== plaintextLength) {
          throw new JobEnvelopeError(
            "Invalid job result: decrypted chunk length mismatch",
          );
        }
        chunkIndex += 1;
        if (final) {
          if (await reader.hasRemaining()) {
            throw new JobEnvelopeError(
              "Invalid job result: bytes follow final chunk",
            );
          }
          finished = true;
        }
        controller.enqueue(plaintext);
        if (finished) controller.close();
      } catch (error) {
        controller.error(normalizeChunkError(error));
        void reader.cancel(error).catch(() => undefined);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return { metadata: parsed.metadata, body };
}

function bufferedResultBodySize(sealedBytes: Uint8Array): number {
  if (sealedBytes.length < 1 + WRAPPED_KEY_LENGTH_BYTES) {
    throw new JobEnvelopeError("Invalid job result: truncated payload");
  }
  if (sealedBytes[0] !== JOB_RESULT_FORMAT_VERSION) {
    throw new JobEnvelopeError(
      `Unsupported job result format: ${String(sealedBytes[0])}`,
    );
  }
  const wrappedKeyLength = readUint32(sealedBytes, 1);
  if (wrappedKeyLength === 0 || wrappedKeyLength > MAX_WRAPPED_KEY_BYTES) {
    throw new JobEnvelopeError(
      "Invalid job result: invalid wrapped key length",
    );
  }
  let offset = 1 + WRAPPED_KEY_LENGTH_BYTES + wrappedKeyLength;
  if (offset > sealedBytes.length) {
    throw new JobEnvelopeError("Invalid job result: truncated payload");
  }
  let bodySize = 0;
  let sawFinal = false;
  while (offset < sealedBytes.length) {
    if (sealedBytes.length - offset < FRAME_LENGTH_BYTES + FRAME_FLAGS_BYTES) {
      throw new JobEnvelopeError("Invalid job result: truncated payload");
    }
    const encryptedLength = readUint32(sealedBytes, offset);
    const flags = sealedBytes[offset + FRAME_LENGTH_BYTES];
    if (
      encryptedLength < AES_GCM_TAG_BYTES ||
      encryptedLength > JOB_RESULT_CHUNK_BYTES + AES_GCM_TAG_BYTES ||
      (flags !== 0 && flags !== FINAL_FRAME_FLAG)
    ) {
      throw new JobEnvelopeError("Invalid job result: invalid chunk framing");
    }
    const plaintextLength = encryptedLength - AES_GCM_TAG_BYTES;
    if (flags === 0 && plaintextLength !== JOB_RESULT_CHUNK_BYTES) {
      throw new JobEnvelopeError("Invalid job result: short non-final chunk");
    }
    offset += FRAME_LENGTH_BYTES + FRAME_FLAGS_BYTES;
    if (encryptedLength > sealedBytes.length - offset) {
      throw new JobEnvelopeError("Invalid job result: truncated payload");
    }
    offset += encryptedLength;
    bodySize += plaintextLength;
    if (flags === FINAL_FRAME_FLAG) {
      sawFinal = true;
      if (offset !== sealedBytes.length) {
        throw new JobEnvelopeError(
          "Invalid job result: bytes follow final chunk",
        );
      }
    }
  }
  if (!sawFinal) {
    throw new JobEnvelopeError("Invalid job result: missing final chunk");
  }
  return bodySize;
}

/**
 * Decrypts a job result and verifies its builder-visible protocol bindings.
 *
 * The builder private key is a `Hex` wallet key. For `expect.version`,
 * `undefined` skips the check while `null` requires a null result version.
 *
 * @param sealedBytes - Raw hybrid sealed-result bytes.
 * @param builderPrivateKey - Builder's wallet private key as hex.
 * @param ecies - Injected ECIES implementation.
 * @param expect - Required job ID and optional scope and version bindings.
 * @returns The validated result when every supplied binding matches.
 * @throws {JobEnvelopeError} If plaintext is malformed, invalid, or a binding differs.
 * @throws If ciphertext decoding or ECIES decryption fails.
 *
 * @example
 * ```ts
 * const sealedBytes = new Uint8Array(await response.arrayBuffer());
 * const result = await openJobResult(sealedBytes, key, ecies, {
 *   jobId,
 *   scope,
 * });
 * const text = new TextDecoder().decode(result.body);
 * ```
 */
export async function openJobResult(
  sealedBytes: Uint8Array,
  builderPrivateKey: Hex,
  ecies: ECIESProvider,
  expect: JobResultExpectation,
): Promise<JobResult> {
  const bodySize = bufferedResultBodySize(sealedBytes);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(sealedBytes);
      controller.close();
    },
  });
  const opened = await openJobResultStream(
    stream,
    builderPrivateKey,
    ecies,
    expect,
  );
  const body = new Uint8Array(bodySize);
  let offset = 0;
  await opened.body.pipeTo(
    new WritableStream({
      write(chunk) {
        body.set(chunk, offset);
        offset += chunk.length;
      },
    }),
  );
  if (offset !== body.length) {
    throw new JobEnvelopeError("Invalid job result: opened size mismatch");
  }
  return { ...opened.metadata, body };
}
