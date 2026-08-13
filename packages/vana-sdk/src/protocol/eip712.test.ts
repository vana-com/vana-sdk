import { describe, expect, it } from "vitest";
import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ADD_DATA_TYPES,
  BUILDER_REGISTRATION_TYPES,
  GENERIC_PAYMENT_TYPES,
  GRANT_REGISTRATION_TYPES,
  GRANT_REVOCATION_TYPES,
  NATIVE_VANA_ASSET,
  RECORD_DATA_ACCESS_TYPES,
  SERVER_REGISTRATION_TYPES,
  WITHDRAW_AUTHORIZATION_TYPES,
  builderRegistrationDomain,
  buildWithdrawAuthorizationTypedData,
  dataRegistryDomain,
  escrowPaymentDomain,
  grantRegistrationDomain,
  grantRevocationDomain,
  serverRegistrationDomain,
  withdrawAuthorizationDomain,
  type DataPortabilityGatewayConfig,
} from "./eip712";

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

describe("Data Portability EIP-712 helpers", () => {
  it("builds domains for each protocol contract", () => {
    expect(dataRegistryDomain(CONFIG)).toMatchObject({
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
    expect(escrowPaymentDomain(CONFIG)).toMatchObject({
      verifyingContract: CONFIG.contracts.dataPortabilityEscrow,
    });
    expect(withdrawAuthorizationDomain(CONFIG)).toEqual(
      escrowPaymentDomain(CONFIG),
    );
  });

  it("exposes the native VANA asset sentinel", () => {
    expect(NATIVE_VANA_ASSET).toBe(
      "0x0000000000000000000000000000000000000000",
    );
  });

  it("exports stable typed-data shapes", () => {
    expect(GRANT_REGISTRATION_TYPES.GrantRegistration).toEqual([
      { name: "grantorAddress", type: "address" },
      { name: "granteeId", type: "bytes32" },
      { name: "scopes", type: "string[]" },
      { name: "grantVersion", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
    ]);
    expect(GRANT_REVOCATION_TYPES.GrantRevocation).toEqual([
      { name: "grantorAddress", type: "address" },
      { name: "grantId", type: "bytes32" },
      { name: "grantVersion", type: "uint256" },
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
    expect(GENERIC_PAYMENT_TYPES.GenericPayment).toEqual([
      { name: "payerAddress", type: "address" },
      { name: "opType", type: "string" },
      { name: "opId", type: "bytes32" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "paymentNonce", type: "uint256" },
    ]);
    expect(WITHDRAW_AUTHORIZATION_TYPES.WithdrawAuthorization).toEqual([
      { name: "account", type: "address" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "withdrawNonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ]);
    expect(ADD_DATA_TYPES.AddData).toEqual([
      { name: "ownerAddress", type: "address" },
      { name: "scope", type: "string" },
      { name: "dataHash", type: "bytes32" },
      { name: "metadataHash", type: "bytes32" },
      { name: "expectedVersion", type: "uint256" },
    ]);
    expect(RECORD_DATA_ACCESS_TYPES.RecordDataAccess).toEqual([
      { name: "ownerAddress", type: "address" },
      { name: "scope", type: "string" },
      { name: "version", type: "uint256" },
      { name: "accessor", type: "address" },
      { name: "recordId", type: "bytes32" },
    ]);
  });

  it("builds a signed withdrawal authorization without a recipient", async () => {
    const account = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f094538e8a55c3611c5a70cfa2de42b44397316c",
    );
    const typedData = buildWithdrawAuthorizationTypedData(CONFIG, {
      account: account.address,
      asset: NATIVE_VANA_ASSET,
      amount: 42n,
      withdrawNonce: 7n,
      deadline: 1_800_000_000n,
    });

    expect(typedData.message).not.toHaveProperty("recipient");
    const signature = await account.signTypedData(typedData);
    const recovered = await recoverTypedDataAddress({
      ...typedData,
      signature,
    });

    expect(recovered).toBe(account.address);
  });
});
