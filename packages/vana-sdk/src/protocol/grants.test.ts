import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  grantRegistrationDomain,
  GRANT_REGISTRATION_TYPES,
  type DataPortabilityGatewayConfig,
} from "./eip712";
import {
  isDataPortabilityGatewayConfig,
  parseGrantRegistrationPayload,
  verifyGrantRegistration,
} from "./grants";

const CONFIG: DataPortabilityGatewayConfig = {
  chainId: 14800,
  contracts: {
    dataRegistry: "0x1111111111111111111111111111111111111111",
    dataPortabilityPermissions: "0x2222222222222222222222222222222222222222",
    dataPortabilityServer: "0x3333333333333333333333333333333333333333",
    dataPortabilityGrantees: "0x4444444444444444444444444444444444444444",
  },
};

const owner = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000001",
);

const granteeId =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("Data Portability grant helpers", () => {
  it("parses grant registration payloads", () => {
    const grant = JSON.stringify({
      user: owner.address,
      builder: "0x0000000000000000000000000000000000000002",
      scopes: ["instagram.profile"],
      expiresAt: 0,
      nonce: 1,
    });

    expect(parseGrantRegistrationPayload(grant)).toEqual({
      user: owner.address,
      builder: "0x0000000000000000000000000000000000000002",
      scopes: ["instagram.profile"],
      expiresAt: 0,
      nonce: 1,
    });
  });

  it("validates gateway config shape", () => {
    expect(isDataPortabilityGatewayConfig(CONFIG)).toBe(true);
    expect(
      isDataPortabilityGatewayConfig({
        chainId: 14800,
        contracts: { dataPortabilityPermissions: "0x1" },
      }),
    ).toBe(false);
  });

  it("verifies grant registration signatures", async () => {
    const grant = JSON.stringify({
      user: owner.address,
      scopes: ["instagram.profile"],
      expiresAt: 0,
      nonce: 1,
    });
    const signature = await owner.signTypedData({
      domain: grantRegistrationDomain(CONFIG),
      types: GRANT_REGISTRATION_TYPES,
      primaryType: "GrantRegistration",
      message: {
        grantorAddress: owner.address,
        granteeId,
        grant,
        fileIds: [1n],
      },
    });

    await expect(
      verifyGrantRegistration({
        gatewayConfig: CONFIG,
        grantorAddress: owner.address,
        granteeId,
        grant,
        fileIds: [1],
        signature,
      }),
    ).resolves.toMatchObject({
      valid: true,
      grantorAddress: owner.address,
      granteeId,
      fileIds: ["1"],
    });
  });

  it("rejects signed grants whose embedded user does not match grantorAddress", async () => {
    const grant = JSON.stringify({
      user: "0x0000000000000000000000000000000000000003",
      scopes: ["instagram.profile"],
      expiresAt: 0,
    });
    const signature = await owner.signTypedData({
      domain: grantRegistrationDomain(CONFIG),
      types: GRANT_REGISTRATION_TYPES,
      primaryType: "GrantRegistration",
      message: {
        grantorAddress: owner.address,
        granteeId,
        grant,
        fileIds: [],
      },
    });

    await expect(
      verifyGrantRegistration({
        gatewayConfig: CONFIG,
        grantorAddress: owner.address,
        granteeId,
        grant,
        signature,
      }),
    ).resolves.toEqual({
      valid: false,
      error: "Grant user does not match grantorAddress",
    });
  });
});
