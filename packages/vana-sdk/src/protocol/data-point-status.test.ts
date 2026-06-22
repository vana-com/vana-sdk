import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import {
  DATA_REGISTRY_STATUS_ABI,
  DataPointStatus,
  buildMarkDataPointUnavailableRequest,
  buildSetDataPointStatusRequest,
  dataRegistryContractAddress,
  encodeSetDataPointStatusData,
} from "./data-point-status";
import type { DataPortabilityGatewayConfig } from "./eip712";

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

const SCOPE = "instagram.profile";

describe("Data point status primitives", () => {
  it("resolves the DataRegistry contract address from the gateway config", () => {
    expect(dataRegistryContractAddress(CONFIG)).toBe(
      CONFIG.contracts.dataRegistry,
    );
  });

  it("pins the IDataRegistryV2.Status enum wire values", () => {
    // Wire encoding is uint8; reordering these on the Solidity side would
    // silently corrupt every encoded setStatus tx, so freeze the mapping.
    expect(DataPointStatus.None).toBe(0);
    expect(DataPointStatus.Active).toBe(1);
    expect(DataPointStatus.Inactive).toBe(2);
    expect(DataPointStatus.Unavailable).toBe(3);
  });

  function decodedArgs(data: `0x${string}`) {
    const decoded = decodeFunctionData({
      abi: DATA_REGISTRY_STATUS_ABI,
      data,
    });
    return {
      functionName: decoded.functionName,
      args: decoded.args,
    };
  }

  it("round-trips setStatus calldata", () => {
    const data = encodeSetDataPointStatusData({
      scope: SCOPE,
      status: DataPointStatus.Inactive,
    });
    expect(decodedArgs(data)).toEqual({
      functionName: "setStatus",
      args: [SCOPE, DataPointStatus.Inactive],
    });
  });

  it("builds a setStatus tx request targeting the DataRegistry contract", () => {
    const req = buildSetDataPointStatusRequest(CONFIG, {
      scope: SCOPE,
      status: DataPointStatus.Active,
    });
    expect(req.to).toBe(CONFIG.contracts.dataRegistry);
    expect(decodedArgs(req.data)).toEqual({
      functionName: "setStatus",
      args: [SCOPE, DataPointStatus.Active],
    });
  });

  it("the markUnavailable convenience encodes status=Unavailable", () => {
    // The v2 contract has no DELETE — Unavailable is the soft-tombstone the
    // SDK promotes as the file-deletion replacement.
    const req = buildMarkDataPointUnavailableRequest(CONFIG, { scope: SCOPE });
    expect(req.to).toBe(CONFIG.contracts.dataRegistry);
    expect(decodedArgs(req.data)).toEqual({
      functionName: "setStatus",
      args: [SCOPE, DataPointStatus.Unavailable],
    });
  });
});
