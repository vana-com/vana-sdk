/**
 * Data point deletion (tombstone) helpers for DataRegistryV2.
 *
 * A deletion is an owner-signed `AddData` for version `current + 1` whose
 * `dataHash` / `metadataHash` are the protocol-wide tombstone constants below.
 * The gateway records the tombstone version and marks the row `deletedAt`;
 * the encrypted blobs in vana-storage are removed afterwards as a best-effort
 * follow-up. The tombstone is the durable fact; blob removal is cleanup.
 *
 * The typed-data definition is exactly {@link ADD_DATA_TYPES} against
 * {@link dataRegistryDomain} -- the same signature the registration path uses,
 * so a verifier cannot tell a deletion apart from a registration except by
 * the hashes.
 *
 * @category Protocol
 */

import {
  isAddress,
  keccak256,
  stringToBytes,
  type Account,
  type Address,
  type Hex,
  type TypedDataDefinition,
} from "viem";
import { DataPointDeletedError, DataPointNotFoundError } from "../errors";
import { isPlainObject } from "../utils/response-body";
import {
  ADD_DATA_TYPES,
  dataRegistryDomain,
  type AddDataMessage,
  type DataPortabilityGatewayConfig,
} from "./eip712";
import type {
  DeleteDataPointResult as GatewayDeleteDataPointResult,
  GatewayClient,
} from "./gateway";
import { deriveDataPointId } from "./lineage";

/** UTF-8 preimage of {@link TOMBSTONE_DATA_HASH}. */
export const TOMBSTONE_DATA_HASH_PREIMAGE = "vana.data-point.tombstone.v1";
/** UTF-8 preimage of {@link TOMBSTONE_METADATA_HASH}. */
export const TOMBSTONE_METADATA_HASH_PREIMAGE =
  "vana.data-point.tombstone.metadata.v1";

/**
 * `keccak256(utf8("vana.data-point.tombstone.v1"))` -- the `dataHash` a
 * deletion AddData carries. Single source of truth shared with the gateway
 * and Personal Server; never change without a new `.vN` preimage.
 */
export const TOMBSTONE_DATA_HASH =
  "0x30c45ee72fe56d1927701316925ab7ceacd3b6f9267061735d59396f075c6222" as const;

/**
 * `keccak256(utf8("vana.data-point.tombstone.metadata.v1"))` -- the
 * `metadataHash` a deletion AddData carries.
 */
export const TOMBSTONE_METADATA_HASH =
  "0xc5255a141acd6a2ae55971b62c0a85977c2511989dc114ad2abc2b7644f57d90" as const;

/**
 * Recompute a tombstone hash from its preimage. Exposed so tests and
 * downstream services can prove the pinned constants match the contract.
 */
export function computeTombstoneHash(preimage: string): Hex {
  return keccak256(stringToBytes(preimage));
}

/** True when the pair of hashes is exactly the tombstone pair. */
export function isTombstoneHashes(
  dataHash: string | undefined,
  metadataHash: string | undefined,
): boolean {
  return (
    typeof dataHash === "string" &&
    typeof metadataHash === "string" &&
    dataHash.toLowerCase() === TOMBSTONE_DATA_HASH &&
    metadataHash.toLowerCase() === TOMBSTONE_METADATA_HASH
  );
}

/**
 * Detect a deleted data point from any record-shaped value: a non-null
 * `deletedAt`, or the tombstone hash pair. Accepts `unknown` so read
 * helpers can run it on a raw JSON body before trusting the payload.
 */
export function isDataPointTombstone(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  if (typeof value["deletedAt"] === "string") return true;
  return isTombstoneHashes(
    typeof value["dataHash"] === "string" ? value["dataHash"] : undefined,
    typeof value["metadataHash"] === "string"
      ? value["metadataHash"]
      : undefined,
  );
}

/**
 * Read `deletedAt` off any value a gateway or Personal Server might hand
 * back (a record, an error body, `null`, an array, ...). Returns `null`
 * unless it is a string, so every `DataPointDeletedError` carries the same
 * `deletedAt` semantics regardless of which read path raised it.
 */
export function tombstoneDeletedAt(value: unknown): string | null {
  if (!isPlainObject(value)) return null;
  const deletedAt = value["deletedAt"];
  return typeof deletedAt === "string" ? deletedAt : null;
}

export type DataPointDeletionTypedData = TypedDataDefinition<
  typeof ADD_DATA_TYPES,
  "AddData"
> & {
  message: AddDataMessage;
};

export interface DataPointDeletionSigner {
  /** The data point owner. Must match `AddData.ownerAddress`. */
  address: Address;
  signTypedData(typedData: DataPointDeletionTypedData): Promise<Hex> | Hex;
}

export interface ViemDataPointDeletionWalletClient {
  account?: Account | Address | null;
  signTypedData(
    typedData: DataPointDeletionTypedData & { account?: Account | Address },
  ): Promise<Hex>;
}

export type ViemDataPointDeletionSignerSource =
  | DataPointDeletionSigner
  | ViemDataPointDeletionWalletClient;

export interface BuildDataPointDeletionTypedDataInput {
  ownerAddress: Address;
  scope: string;
  /**
   * The version the tombstone is written at -- `current + 1`. This is the
   * `AddData.expectedVersion` field; the gateway rejects with 409 unless it
   * is strictly greater than the stored version.
   */
  expectedVersion: bigint;
  config: DataPortabilityGatewayConfig;
}

export interface BuildDataPointDeletionSignatureInput {
  signer: DataPointDeletionSigner;
  scope: string;
  /** See {@link BuildDataPointDeletionTypedDataInput.expectedVersion}. */
  expectedVersion: bigint;
  config: DataPortabilityGatewayConfig;
}

export interface DataPointDeletionSignature {
  signature: Hex;
  signerAddress: Address;
  typedData: DataPointDeletionTypedData;
}

function assertAddress(value: string, name: string): void {
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid EVM address`);
  }
}

function getAccountAddress(
  account: Account | Address | null | undefined,
): Address | undefined {
  if (!account) return undefined;
  return typeof account === "string" ? account : account.address;
}

function isDataPointDeletionSigner(
  source: ViemDataPointDeletionSignerSource,
): source is DataPointDeletionSigner {
  return "address" in source && typeof source.signTypedData === "function";
}

/**
 * Adapt a viem local account or wallet client to
 * {@link DataPointDeletionSigner}. Mirrors
 * `createViemPersonalServerRegistrationSigner`.
 */
export function createViemDataPointDeletionSigner(
  source: ViemDataPointDeletionSignerSource,
  options: { account?: Account | Address } = {},
): DataPointDeletionSigner {
  if (isDataPointDeletionSigner(source)) {
    return source;
  }

  const accountAddress =
    getAccountAddress(options.account) ?? getAccountAddress(source.account);

  if (accountAddress) {
    return {
      address: accountAddress,
      signTypedData: (typedData) =>
        source.signTypedData({
          ...typedData,
          account: options.account ?? source.account ?? accountAddress,
        }),
    };
  }

  throw new Error(
    "Viem wallet client requires an account option or account property",
  );
}

/**
 * Build the exact `AddData` typed data a deletion signs: the tombstone hash
 * pair at `expectedVersion`, against the DataRegistryV2 domain.
 */
export function buildDataPointDeletionTypedData(
  input: BuildDataPointDeletionTypedDataInput,
): DataPointDeletionTypedData {
  assertAddress(input.ownerAddress, "ownerAddress");
  if (input.scope.length === 0) {
    throw new Error("scope must be a non-empty string");
  }
  if (input.expectedVersion <= 0n) {
    throw new Error("expectedVersion must be a positive version number");
  }

  return {
    domain: dataRegistryDomain(input.config),
    types: ADD_DATA_TYPES,
    primaryType: "AddData",
    message: {
      ownerAddress: input.ownerAddress,
      scope: input.scope,
      dataHash: TOMBSTONE_DATA_HASH,
      metadataHash: TOMBSTONE_METADATA_HASH,
      expectedVersion: input.expectedVersion,
    },
  };
}

/** Sign a deletion `AddData` with the owner's signer. */
export async function buildDataPointDeletionSignature(
  input: BuildDataPointDeletionSignatureInput,
): Promise<DataPointDeletionSignature> {
  const typedData = buildDataPointDeletionTypedData({
    ownerAddress: input.signer.address,
    scope: input.scope,
    expectedVersion: input.expectedVersion,
    config: input.config,
  });
  const signature = await input.signer.signTypedData(typedData);

  return {
    signature,
    signerAddress: input.signer.address,
    typedData,
  };
}

/**
 * Outcome of a scope-wide blob delete. `VanaStorage.deleteScope` returns a
 * superset of this shape.
 */
export interface DataPointBlobDeleteResult {
  count: number;
  totalBytes: number;
}

/**
 * The storage half of a deletion -- structurally satisfied by `VanaStorage`.
 * Removes every version's blob under `(owner, scope)`.
 */
export interface DataPointBlobStore {
  deleteScope(
    ownerAddress: Address,
    scope: string,
  ): Promise<DataPointBlobDeleteResult>;
}

export interface DeleteDataPointInput {
  /** Gateway client -- only `getDataPoint` and `deleteDataPoint` are used. */
  gateway: Pick<GatewayClient, "getDataPoint" | "deleteDataPoint">;
  /** Blob store for the best-effort cleanup after the tombstone lands. */
  storage: DataPointBlobStore;
  /** Owner signer. `signer.address` is the data point owner. */
  signer: DataPointDeletionSigner;
  scope: string;
  config: DataPortabilityGatewayConfig;
  /**
   * Skip the gateway lookup and treat this as the current version. Use when
   * the caller already holds a fresh `DataPointRecord.expectedVersion`;
   * omit to let the SDK fetch it.
   */
  currentVersion?: bigint;
}

interface DataPointDeletionBase {
  dataPointId: Hex;
  ownerAddress: Address;
  scope: string;
  /** Decimal-string uint256 of the tombstone version (`current + 1`). */
  version: string;
  signature: Hex;
  /** The gateway's 200 body for the tombstone. */
  tombstone: GatewayDeleteDataPointResult;
}

/** Both the gateway tombstone and the blob cleanup succeeded. */
export interface DataPointDeletedResult extends DataPointDeletionBase {
  status: "deleted";
  storage: DataPointBlobDeleteResult;
}

/**
 * The gateway recorded the tombstone (durable, the data point is deleted)
 * but the blob cleanup failed. Retry `storage.deleteScope(owner, scope)`
 * later; the tombstone does not need to be re-signed.
 */
export interface DataPointDeletionPartialResult extends DataPointDeletionBase {
  status: "partial";
  storageError: Error;
}

export type DataPointDeletionResult =
  | DataPointDeletedResult
  | DataPointDeletionPartialResult;

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

// The wire type says decimal-string uint256, but the type system cannot
// enforce that at runtime: refuse anything else here rather than letting
// `BigInt()` throw a bare SyntaxError (or, worse, sign for a bogus version).
function parseExpectedVersion(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(
      `Gateway returned a malformed expectedVersion: ${JSON.stringify(value)}`,
    );
  }
  return BigInt(value);
}

/**
 * Delete a data point end to end. Symmetric with `registerDataPoint`.
 *
 * Order, deliberately:
 *   1. fetch the current version from the gateway (unless supplied),
 *   2. sign the tombstone `AddData` for `current + 1`,
 *   3. `DELETE /v1/data/:dataPointId` on the gateway,
 *   4. delete every blob under `(owner, scope)` in vana-storage.
 *
 * Steps 1-3 throw on failure ({@link DataPointNotFoundError},
 * {@link DataPointDeletedError}, `DataPointVersionConflictError`, or a
 * generic gateway error). A step-4 failure does NOT throw: the tombstone is
 * already the durable fact, so the result comes back with
 * `status: "partial"` and the storage error attached.
 */
export async function deleteDataPoint(
  input: DeleteDataPointInput,
): Promise<DataPointDeletionResult> {
  const ownerAddress = input.signer.address;
  const dataPointId = deriveDataPointId(ownerAddress, input.scope);

  let currentVersion = input.currentVersion;
  if (currentVersion === undefined) {
    const record = await input.gateway.getDataPoint(dataPointId);
    if (record === null) {
      throw new DataPointNotFoundError(
        `No data point registered for scope '${input.scope}' owned by ${ownerAddress}`,
        { dataPointId, scope: input.scope, ownerAddress },
      );
    }
    if (isDataPointTombstone(record)) {
      throw new DataPointDeletedError(
        `Data point ${dataPointId} (scope '${input.scope}') is already deleted`,
        {
          dataPointId,
          scope: input.scope,
          ownerAddress,
          deletedAt: tombstoneDeletedAt(record),
        },
      );
    }
    currentVersion = parseExpectedVersion(record.expectedVersion);
  }

  const tombstoneVersion = currentVersion + 1n;
  const signed = await buildDataPointDeletionSignature({
    signer: input.signer,
    scope: input.scope,
    expectedVersion: tombstoneVersion,
    config: input.config,
  });

  const tombstone = await input.gateway.deleteDataPoint({
    ownerAddress,
    scope: input.scope,
    expectedVersion: tombstoneVersion.toString(),
    signature: signed.signature,
  });

  const base: DataPointDeletionBase = {
    dataPointId,
    ownerAddress,
    scope: input.scope,
    version: tombstoneVersion.toString(),
    signature: signed.signature,
    tombstone,
  };

  try {
    const storage = await input.storage.deleteScope(ownerAddress, input.scope);
    return { ...base, status: "deleted", storage };
  } catch (cause) {
    return { ...base, status: "partial", storageError: toError(cause) };
  }
}
