import { describe, expect, it, vi } from "vitest";
import {
  keccak256,
  recoverTypedDataAddress,
  stringToBytes,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DataPointDeletedError, DataPointNotFoundError } from "../errors";
import { ADD_DATA_TYPES, dataRegistryDomain } from "./eip712";
import type { DataPortabilityGatewayConfig } from "./eip712";
import {
  TOMBSTONE_DATA_HASH,
  TOMBSTONE_DATA_HASH_PREIMAGE,
  TOMBSTONE_METADATA_HASH,
  TOMBSTONE_METADATA_HASH_PREIMAGE,
  buildDataPointDeletionSignature,
  buildDataPointDeletionTypedData,
  computeTombstoneHash,
  createViemDataPointDeletionSigner,
  deleteDataPoint,
  isDataPointTombstone,
  isTombstoneHashes,
  type DataPointBlobStore,
  type DataPointDeletionSigner,
  type DataPointDeletionTypedData,
  type DeleteDataPointInput,
} from "./data-point-deletion";
import type { DataPointRecord, DeleteDataPointParams } from "./gateway";
import { deriveDataPointId } from "./lineage";

const CONFIG: DataPortabilityGatewayConfig = {
  chainId: 14800,
  contracts: {
    dataRegistry: "0x1111111111111111111111111111111111111111",
    dataPortabilityPermissions: "0x2222222222222222222222222222222222222222",
    dataPortabilityServer: "0x3333333333333333333333333333333333333333",
    dataPortabilityGrantees: "0x4444444444444444444444444444444444444444",
    dataPortabilityEscrow: "0x5555555555555555555555555555555555555555",
    feeRegistry: "0x6666666666666666666666666666666666666666",
  },
};

const OWNER_KEY = `0x${"a".repeat(64)}` as const;
const owner = privateKeyToAccount(OWNER_KEY);
const SCOPE = "instagram.profile";

function ownerSigner(): DataPointDeletionSigner {
  return {
    address: owner.address,
    signTypedData: (typedData: DataPointDeletionTypedData) =>
      owner.signTypedData(typedData),
  };
}

function liveRecord(expectedVersion = "3"): DataPointRecord {
  return {
    id: deriveDataPointId(owner.address, SCOPE),
    ownerAddress: owner.address,
    scope: SCOPE,
    dataHash: `0x${"11".repeat(32)}`,
    metadataHash: `0x${"22".repeat(32)}`,
    expectedVersion,
    addedAt: "2026-08-01T00:00:00.000Z",
  };
}

function harness(overrides: Partial<DeleteDataPointInput> = {}) {
  const calls: string[] = [];
  const gateway = {
    getDataPoint: vi.fn(async () => {
      calls.push("getDataPoint");
      return liveRecord();
    }),
    deleteDataPoint: vi.fn(async (_params: DeleteDataPointParams) => {
      calls.push("deleteDataPoint");
      return {
        dataPointId: deriveDataPointId(owner.address, SCOPE),
        expectedVersion: "4",
        deletedAt: "2026-08-25T00:00:00.000Z",
      };
    }),
  };
  const storage: DataPointBlobStore = {
    deleteScope: vi.fn(async () => {
      calls.push("deleteScope");
      return { count: 3, totalBytes: 4096 };
    }),
  };
  const signer = ownerSigner();
  const signTypedData = vi.fn(async (typedData: DataPointDeletionTypedData) => {
    calls.push("signTypedData");
    return signer.signTypedData(typedData);
  });
  const input: DeleteDataPointInput = {
    gateway,
    storage,
    signer: { address: signer.address, signTypedData },
    scope: SCOPE,
    config: CONFIG,
    ...overrides,
  };
  return { calls, gateway, storage, signTypedData, input };
}

describe("tombstone constants", () => {
  it("pin keccak256 of the utf8 preimages", () => {
    expect(TOMBSTONE_DATA_HASH_PREIMAGE).toBe("vana.data-point.tombstone.v1");
    expect(TOMBSTONE_METADATA_HASH_PREIMAGE).toBe(
      "vana.data-point.tombstone.metadata.v1",
    );
    expect(keccak256(stringToBytes(TOMBSTONE_DATA_HASH_PREIMAGE))).toBe(
      TOMBSTONE_DATA_HASH,
    );
    expect(keccak256(stringToBytes(TOMBSTONE_METADATA_HASH_PREIMAGE))).toBe(
      TOMBSTONE_METADATA_HASH,
    );
    expect(computeTombstoneHash(TOMBSTONE_DATA_HASH_PREIMAGE)).toBe(
      TOMBSTONE_DATA_HASH,
    );
    expect(computeTombstoneHash(TOMBSTONE_METADATA_HASH_PREIMAGE)).toBe(
      TOMBSTONE_METADATA_HASH,
    );
    // Literal values other repos hard-code against.
    expect(TOMBSTONE_DATA_HASH).toBe(
      "0x30c45ee72fe56d1927701316925ab7ceacd3b6f9267061735d59396f075c6222",
    );
    expect(TOMBSTONE_METADATA_HASH).toBe(
      "0xc5255a141acd6a2ae55971b62c0a85977c2511989dc114ad2abc2b7644f57d90",
    );
    expect(TOMBSTONE_DATA_HASH).not.toBe(TOMBSTONE_METADATA_HASH);
  });

  it("detects tombstones by hash pair or deletedAt, case-insensitively", () => {
    expect(
      isTombstoneHashes(TOMBSTONE_DATA_HASH, TOMBSTONE_METADATA_HASH),
    ).toBe(true);
    expect(
      isTombstoneHashes(
        TOMBSTONE_DATA_HASH.toUpperCase().replace("0X", "0x"),
        TOMBSTONE_METADATA_HASH,
      ),
    ).toBe(true);
    expect(isTombstoneHashes(TOMBSTONE_DATA_HASH, `0x${"00".repeat(32)}`)).toBe(
      false,
    );
    expect(isTombstoneHashes(undefined, TOMBSTONE_METADATA_HASH)).toBe(false);

    expect(isDataPointTombstone(liveRecord())).toBe(false);
    expect(
      isDataPointTombstone({
        ...liveRecord(),
        deletedAt: "2026-08-25T00:00:00Z",
      }),
    ).toBe(true);
    expect(isDataPointTombstone({ ...liveRecord(), deletedAt: null })).toBe(
      false,
    );
    expect(
      isDataPointTombstone({
        ...liveRecord(),
        dataHash: TOMBSTONE_DATA_HASH,
        metadataHash: TOMBSTONE_METADATA_HASH,
      }),
    ).toBe(true);
    expect(isDataPointTombstone(null)).toBe(false);
    expect(isDataPointTombstone("nope")).toBe(false);
    expect(
      isDataPointTombstone({ version: "1.0", scope: SCOPE, data: {} }),
    ).toBe(false);
  });
});

describe("buildDataPointDeletionTypedData", () => {
  it("reuses ADD_DATA_TYPES against the DataRegistry domain with the tombstone hashes", () => {
    expect(
      buildDataPointDeletionTypedData({
        ownerAddress: owner.address,
        scope: SCOPE,
        expectedVersion: 4n,
        config: CONFIG,
      }),
    ).toEqual({
      domain: dataRegistryDomain(CONFIG),
      types: ADD_DATA_TYPES,
      primaryType: "AddData",
      message: {
        ownerAddress: owner.address,
        scope: SCOPE,
        dataHash: TOMBSTONE_DATA_HASH,
        metadataHash: TOMBSTONE_METADATA_HASH,
        expectedVersion: 4n,
      },
    });
  });

  it("rejects invalid input before signing", () => {
    expect(() =>
      buildDataPointDeletionTypedData({
        ownerAddress: "0xbad" as Hex,
        scope: SCOPE,
        expectedVersion: 1n,
        config: CONFIG,
      }),
    ).toThrow("ownerAddress must be a valid EVM address");
    expect(() =>
      buildDataPointDeletionTypedData({
        ownerAddress: owner.address,
        scope: "",
        expectedVersion: 1n,
        config: CONFIG,
      }),
    ).toThrow("scope must be a non-empty string");
    expect(() =>
      buildDataPointDeletionTypedData({
        ownerAddress: owner.address,
        scope: SCOPE,
        expectedVersion: 0n,
        config: CONFIG,
      }),
    ).toThrow("expectedVersion must be a positive version number");
  });
});

describe("buildDataPointDeletionSignature", () => {
  it("produces a signature a plain AddData verifier recovers to the owner", async () => {
    const signed = await buildDataPointDeletionSignature({
      signer: ownerSigner(),
      scope: SCOPE,
      expectedVersion: 4n,
      config: CONFIG,
    });

    expect(signed.signerAddress).toBe(owner.address);
    expect(signed.typedData.message.dataHash).toBe(TOMBSTONE_DATA_HASH);
    expect(signed.typedData.message.metadataHash).toBe(TOMBSTONE_METADATA_HASH);

    // Verify exactly the way the gateway's POST /v1/data path does, with the
    // tombstone hashes substituted -- no deletion-specific typed data exists.
    const recovered = await recoverTypedDataAddress({
      domain: dataRegistryDomain(CONFIG),
      types: ADD_DATA_TYPES,
      primaryType: "AddData",
      message: {
        ownerAddress: owner.address,
        scope: SCOPE,
        dataHash: TOMBSTONE_DATA_HASH,
        metadataHash: TOMBSTONE_METADATA_HASH,
        expectedVersion: 4n,
      },
      signature: signed.signature,
    });
    expect(recovered).toBe(owner.address);

    // And a different version or a real data hash does NOT recover to owner.
    const wrongVersion = await recoverTypedDataAddress({
      domain: dataRegistryDomain(CONFIG),
      types: ADD_DATA_TYPES,
      primaryType: "AddData",
      message: {
        ownerAddress: owner.address,
        scope: SCOPE,
        dataHash: TOMBSTONE_DATA_HASH,
        metadataHash: TOMBSTONE_METADATA_HASH,
        expectedVersion: 5n,
      },
      signature: signed.signature,
    });
    expect(wrongVersion).not.toBe(owner.address);
  });

  it("adapts a viem wallet client through createViemDataPointDeletionSigner", async () => {
    const walletClient = {
      account: owner,
      signTypedData: vi.fn(async (typedData: DataPointDeletionTypedData) =>
        owner.signTypedData(typedData),
      ),
    };
    const signer = createViemDataPointDeletionSigner(walletClient);
    expect(signer.address).toBe(owner.address);

    const signed = await buildDataPointDeletionSignature({
      signer,
      scope: SCOPE,
      expectedVersion: 2n,
      config: CONFIG,
    });
    expect(walletClient.signTypedData).toHaveBeenCalledWith(
      expect.objectContaining({ account: owner, primaryType: "AddData" }),
    );
    expect(
      await recoverTypedDataAddress({
        ...signed.typedData,
        signature: signed.signature,
      }),
    ).toBe(owner.address);

    expect(() =>
      createViemDataPointDeletionSigner({
        signTypedData: walletClient.signTypedData,
      }),
    ).toThrow(
      "Viem wallet client requires an account option or account property",
    );
  });
});

describe("deleteDataPoint", () => {
  it("runs fetch -> sign -> gateway DELETE -> storage deleteScope, in that order", async () => {
    const { calls, gateway, storage, signTypedData, input } = harness();

    const result = await deleteDataPoint(input);

    expect(calls).toEqual([
      "getDataPoint",
      "signTypedData",
      "deleteDataPoint",
      "deleteScope",
    ]);
    const dataPointId = deriveDataPointId(owner.address, SCOPE);
    expect(gateway.getDataPoint).toHaveBeenCalledWith(dataPointId);
    // Signed for current + 1 with the tombstone pair.
    expect(signTypedData).toHaveBeenCalledWith(
      expect.objectContaining({
        message: {
          ownerAddress: owner.address,
          scope: SCOPE,
          dataHash: TOMBSTONE_DATA_HASH,
          metadataHash: TOMBSTONE_METADATA_HASH,
          expectedVersion: 4n,
        },
      }),
    );
    const deleteCall = gateway.deleteDataPoint.mock.calls[0]?.[0];
    if (!deleteCall) throw new Error("deleteDataPoint was not called");
    expect(deleteCall).toMatchObject({
      ownerAddress: owner.address,
      scope: SCOPE,
      expectedVersion: "4",
    });
    expect(
      await recoverTypedDataAddress({
        ...buildDataPointDeletionTypedData({
          ownerAddress: owner.address,
          scope: SCOPE,
          expectedVersion: 4n,
          config: CONFIG,
        }),
        signature: deleteCall.signature as Hex,
      }),
    ).toBe(owner.address);
    expect(storage.deleteScope).toHaveBeenCalledWith(owner.address, SCOPE);

    expect(result).toEqual({
      status: "deleted",
      dataPointId,
      ownerAddress: owner.address,
      scope: SCOPE,
      version: "4",
      signature: deleteCall.signature,
      tombstone: {
        dataPointId,
        expectedVersion: "4",
        deletedAt: "2026-08-25T00:00:00.000Z",
      },
      storage: { count: 3, totalBytes: 4096 },
    });
  });

  it("skips the gateway lookup when currentVersion is supplied", async () => {
    const { calls, gateway, input } = harness({ currentVersion: 9n });

    const result = await deleteDataPoint(input);

    expect(gateway.getDataPoint).not.toHaveBeenCalled();
    expect(calls).toEqual(["signTypedData", "deleteDataPoint", "deleteScope"]);
    expect(result.version).toBe("10");
    expect(gateway.deleteDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: "10" }),
    );
  });

  it("returns a partial result when the gateway tombstone lands but blob delete fails", async () => {
    const { calls, input } = harness({
      storage: {
        deleteScope: vi.fn(async () => {
          calls.push("deleteScope");
          throw new Error("vana-storage scope delete failed: 503");
        }),
      },
    });

    const result = await deleteDataPoint(input);

    expect(calls).toEqual([
      "getDataPoint",
      "signTypedData",
      "deleteDataPoint",
      "deleteScope",
    ]);
    expect(result.status).toBe("partial");
    if (result.status !== "partial") throw new Error("unreachable");
    expect(result.storageError).toBeInstanceOf(Error);
    expect(result.storageError.message).toBe(
      "vana-storage scope delete failed: 503",
    );
    expect(result.version).toBe("4");
    expect(result.tombstone.deletedAt).toBe("2026-08-25T00:00:00.000Z");
  });

  it("does not touch storage when the gateway DELETE fails", async () => {
    const { calls, storage, input } = harness();
    const gatewayFailure = new Error("Gateway error: 400 signature mismatch");
    (
      input.gateway.deleteDataPoint as ReturnType<typeof vi.fn>
    ).mockRejectedValue(gatewayFailure);

    await expect(deleteDataPoint(input)).rejects.toBe(gatewayFailure);
    expect(calls).toEqual(["getDataPoint", "signTypedData"]);
    expect(input.gateway.deleteDataPoint).toHaveBeenCalledTimes(1);
    expect(storage.deleteScope).not.toHaveBeenCalled();
  });

  it("throws DataPointNotFoundError without signing when nothing is registered", async () => {
    const { calls, input } = harness();
    (input.gateway.getDataPoint as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    await expect(deleteDataPoint(input)).rejects.toBeInstanceOf(
      DataPointNotFoundError,
    );
    expect(input.gateway.getDataPoint).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it("throws DataPointDeletedError when the current record is already a tombstone", async () => {
    const { calls, input } = harness();
    (input.gateway.getDataPoint as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...liveRecord("4"),
      dataHash: TOMBSTONE_DATA_HASH,
      metadataHash: TOMBSTONE_METADATA_HASH,
      deletedAt: "2026-08-20T00:00:00.000Z",
    });

    const error = await deleteDataPoint(input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataPointDeletedError);
    expect((error as DataPointDeletedError).details.deletedAt).toBe(
      "2026-08-20T00:00:00.000Z",
    );
    expect(input.gateway.getDataPoint).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it("propagates DataPointDeletedError from a 410 gateway read", async () => {
    const { calls, input } = harness();
    (input.gateway.getDataPoint as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DataPointDeletedError("gone", { deletedAt: null }),
    );

    await expect(deleteDataPoint(input)).rejects.toBeInstanceOf(
      DataPointDeletedError,
    );
    expect(input.gateway.getDataPoint).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });
});
