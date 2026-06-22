import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  grantRegistrationDomain,
  GRANT_REGISTRATION_TYPES,
  type DataPortabilityGatewayConfig,
} from "./eip712";
import {
  isDataPortabilityGatewayConfig,
  verifyGrantRegistration,
} from "./grants";

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

// Generated fresh per test run — `owner.address` is referenced dynamically
// in every assertion below, so the test stays deterministic-within-run
// without committing a key to the repo.
const owner = privateKeyToAccount(generatePrivateKey());

const granteeId =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const SCOPES = ["instagram.profile"];

describe("Data Portability grant helpers", () => {
  it("validates gateway config shape", () => {
    expect(isDataPortabilityGatewayConfig(CONFIG)).toBe(true);
    expect(
      isDataPortabilityGatewayConfig({
        chainId: 14800,
        contracts: { dataPortabilityPermissions: "0x1" },
      }),
    ).toBe(false);
    // Missing the escrow contract → invalid, since /v1/escrow/pay needs it.
    const { dataPortabilityEscrow: _omit, ...withoutEscrow } = CONFIG.contracts;
    expect(
      isDataPortabilityGatewayConfig({
        chainId: 14800,
        contracts: withoutEscrow,
      }),
    ).toBe(false);
  });

  it("verifies grant registration signatures with perpetual expiry", async () => {
    const signature = await owner.signTypedData({
      domain: grantRegistrationDomain(CONFIG),
      types: GRANT_REGISTRATION_TYPES,
      primaryType: "GrantRegistration",
      message: {
        grantorAddress: owner.address,
        granteeId,
        scopes: SCOPES,
        grantVersion: 1n,
        expiresAt: 0n,
      },
    });

    await expect(
      verifyGrantRegistration({
        gatewayConfig: CONFIG,
        grantorAddress: owner.address,
        granteeId,
        scopes: SCOPES,
        grantVersion: "1",
        expiresAt: "0",
        signature,
      }),
    ).resolves.toEqual({
      valid: true,
      grantorAddress: owner.address,
      granteeId,
      scopes: SCOPES,
      grantVersion: "1",
      expiresAt: "0",
    });
  });

  it("rejects expired grants when expiresAt is in the past", async () => {
    const expiresAt = 1_700_000_000n;
    const signature = await owner.signTypedData({
      domain: grantRegistrationDomain(CONFIG),
      types: GRANT_REGISTRATION_TYPES,
      primaryType: "GrantRegistration",
      message: {
        grantorAddress: owner.address,
        granteeId,
        scopes: SCOPES,
        grantVersion: 2n,
        expiresAt,
      },
    });

    await expect(
      verifyGrantRegistration({
        gatewayConfig: CONFIG,
        grantorAddress: owner.address,
        granteeId,
        scopes: SCOPES,
        grantVersion: 2,
        expiresAt,
        signature,
        // One second past the signed deadline.
        nowSeconds: Number(expiresAt) + 1,
      }),
    ).resolves.toEqual({ valid: false, error: "Grant has expired" });
  });

  it("rejects scopes that are empty or non-string", async () => {
    const signature = await owner.signTypedData({
      domain: grantRegistrationDomain(CONFIG),
      types: GRANT_REGISTRATION_TYPES,
      primaryType: "GrantRegistration",
      message: {
        grantorAddress: owner.address,
        granteeId,
        scopes: SCOPES,
        grantVersion: 1n,
        expiresAt: 0n,
      },
    });

    await expect(
      verifyGrantRegistration({
        gatewayConfig: CONFIG,
        grantorAddress: owner.address,
        granteeId,
        scopes: [],
        grantVersion: 1,
        expiresAt: 0,
        signature,
      }),
    ).resolves.toEqual({
      valid: false,
      error: "scopes must be a non-empty array",
    });
  });

  it("rejects grantVersion < 1", async () => {
    await expect(
      verifyGrantRegistration({
        gatewayConfig: CONFIG,
        grantorAddress: owner.address,
        granteeId,
        scopes: SCOPES,
        grantVersion: 0,
        expiresAt: 0,
        signature: ("0x" + "00".repeat(65)) as `0x${string}`,
      }),
    ).resolves.toEqual({
      valid: false,
      error: "grantVersion must be a uint256 >= 1",
    });
  });

  it("rejects number inputs outside the safe-integer range", async () => {
    // 2**53 + 1 can't be represented exactly in JS — it rounds to 2**53.
    // BigInt() would happily convert the rounded value with no warning, so
    // toUint256 must reject the unsafe number up front and force the caller
    // to pass a string/bigint when they need precision past MAX_SAFE_INTEGER.
    const unsafe = Number.MAX_SAFE_INTEGER + 2;
    await expect(
      verifyGrantRegistration({
        gatewayConfig: CONFIG,
        grantorAddress: owner.address,
        granteeId,
        scopes: SCOPES,
        grantVersion: unsafe,
        expiresAt: 0,
        signature: ("0x" + "00".repeat(65)) as `0x${string}`,
      }),
    ).resolves.toEqual({
      valid: false,
      error: "grantVersion must be a uint256 >= 1",
    });
    await expect(
      verifyGrantRegistration({
        gatewayConfig: CONFIG,
        grantorAddress: owner.address,
        granteeId,
        scopes: SCOPES,
        grantVersion: 1,
        expiresAt: unsafe,
        signature: ("0x" + "00".repeat(65)) as `0x${string}`,
      }),
    ).resolves.toEqual({
      valid: false,
      error: "expiresAt must be a non-negative uint256",
    });
  });
});
