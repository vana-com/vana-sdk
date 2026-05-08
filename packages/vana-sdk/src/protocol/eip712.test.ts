import { describe, expect, it } from "vitest";
import {
  BUILDER_REGISTRATION_TYPES,
  FILE_REGISTRATION_TYPES,
  GRANT_REGISTRATION_TYPES,
  GRANT_REVOCATION_TYPES,
  SERVER_REGISTRATION_TYPES,
  builderRegistrationDomain,
  fileRegistrationDomain,
  grantRegistrationDomain,
  grantRevocationDomain,
  serverRegistrationDomain,
  type DataPortabilityGatewayConfig,
} from "./eip712";

const CONFIG: DataPortabilityGatewayConfig = {
  chainId: 14800,
  contracts: {
    dataRegistry: "0x1111111111111111111111111111111111111111",
    dataPortabilityPermissions: "0x2222222222222222222222222222222222222222",
    dataPortabilityServer: "0x3333333333333333333333333333333333333333",
    dataPortabilityGrantees: "0x4444444444444444444444444444444444444444",
  },
};

describe("Data Portability EIP-712 helpers", () => {
  it("builds domains for each protocol contract", () => {
    expect(fileRegistrationDomain(CONFIG)).toMatchObject({
      name: "Vana Data Portability",
      version: "1",
      chainId: 14800,
      verifyingContract: CONFIG.contracts.dataRegistry,
    });
    expect(grantRegistrationDomain(CONFIG)).toMatchObject({
      verifyingContract: CONFIG.contracts.dataPortabilityPermissions,
    });
    expect(grantRevocationDomain(CONFIG)).toMatchObject({
      verifyingContract: CONFIG.contracts.dataPortabilityPermissions,
    });
    expect(serverRegistrationDomain(CONFIG)).toMatchObject({
      verifyingContract: CONFIG.contracts.dataPortabilityServer,
    });
    expect(builderRegistrationDomain(CONFIG)).toMatchObject({
      verifyingContract: CONFIG.contracts.dataPortabilityGrantees,
    });
  });

  it("exports stable typed-data shapes", () => {
    expect(FILE_REGISTRATION_TYPES.FileRegistration).toEqual([
      { name: "ownerAddress", type: "address" },
      { name: "url", type: "string" },
      { name: "schemaId", type: "bytes32" },
    ]);
    expect(GRANT_REGISTRATION_TYPES.GrantRegistration).toEqual([
      { name: "grantorAddress", type: "address" },
      { name: "granteeId", type: "bytes32" },
      { name: "grant", type: "string" },
      { name: "fileIds", type: "uint256[]" },
    ]);
    expect(GRANT_REVOCATION_TYPES.GrantRevocation).toEqual([
      { name: "grantorAddress", type: "address" },
      { name: "grantId", type: "bytes32" },
    ]);
    expect(SERVER_REGISTRATION_TYPES.ServerRegistration).toEqual([
      { name: "ownerAddress", type: "address" },
      { name: "serverAddress", type: "address" },
      { name: "publicKey", type: "string" },
      { name: "serverUrl", type: "string" },
    ]);
    expect(BUILDER_REGISTRATION_TYPES.BuilderRegistration).toEqual([
      { name: "ownerAddress", type: "address" },
      { name: "granteeAddress", type: "address" },
      { name: "publicKey", type: "string" },
      { name: "appUrl", type: "string" },
    ]);
  });
});
