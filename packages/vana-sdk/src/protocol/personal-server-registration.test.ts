import { describe, expect, it, vi } from "vitest";
import {
  PERSONAL_SERVER_REGISTRATION_DEFAULT_CHAIN_ID,
  PERSONAL_SERVER_REGISTRATION_DEFAULT_VERIFYING_CONTRACT,
  buildPersonalServerRegistrationSignature,
  buildPersonalServerRegistrationTypedData,
  createViemPersonalServerRegistrationSigner,
  personalServerRegistrationDomain,
  registerPersonalServerSignature,
  type PersonalServerRegistrationSigner,
} from "./personal-server-registration";

const OWNER_ADDRESS = "0x1111111111111111111111111111111111111111";
const SERVER_ADDRESS = "0x2222222222222222222222222222222222222222";
const SERVER_PUBLIC_KEY = "did:key:z6MkiPersonalServerPublicKey";
const SERVER_URL = "https://ps.example.com";
const SIGNATURE = `0x${"aa".repeat(65)}` as const;

describe("Personal Server registration", () => {
  it("builds the canonical ServerRegistration typed data shape", () => {
    expect(
      buildPersonalServerRegistrationTypedData({
        ownerAddress: OWNER_ADDRESS,
        serverAddress: SERVER_ADDRESS,
        serverPublicKey: SERVER_PUBLIC_KEY,
        serverUrl: SERVER_URL,
      }),
    ).toEqual({
      domain: {
        name: "Vana Data Portability",
        version: "1",
        chainId: PERSONAL_SERVER_REGISTRATION_DEFAULT_CHAIN_ID,
        verifyingContract:
          PERSONAL_SERVER_REGISTRATION_DEFAULT_VERIFYING_CONTRACT,
      },
      types: {
        ServerRegistration: [
          { name: "ownerAddress", type: "address" },
          { name: "serverAddress", type: "address" },
          { name: "publicKey", type: "string" },
          { name: "serverUrl", type: "string" },
        ],
      },
      primaryType: "ServerRegistration",
      message: {
        ownerAddress: OWNER_ADDRESS,
        serverAddress: SERVER_ADDRESS,
        publicKey: SERVER_PUBLIC_KEY,
        serverUrl: SERVER_URL,
      },
    });
  });

  it("builds the default domain without requiring unrelated contract config", () => {
    expect(personalServerRegistrationDomain()).toEqual({
      name: "Vana Data Portability",
      version: "1",
      chainId: PERSONAL_SERVER_REGISTRATION_DEFAULT_CHAIN_ID,
      verifyingContract:
        PERSONAL_SERVER_REGISTRATION_DEFAULT_VERIFYING_CONTRACT,
    });
  });

  it("accepts explicit chain and verifying contract overrides", () => {
    const verifyingContract = "0x3333333333333333333333333333333333333333";

    expect(
      buildPersonalServerRegistrationTypedData({
        ownerAddress: OWNER_ADDRESS,
        serverAddress: SERVER_ADDRESS,
        serverPublicKey: SERVER_PUBLIC_KEY,
        serverUrl: SERVER_URL,
        chainId: 14800,
        verifyingContract,
      }).domain,
    ).toEqual({
      name: "Vana Data Portability",
      version: "1",
      chainId: 14800,
      verifyingContract,
    });
  });

  it("still accepts an explicit gateway config", () => {
    const verifyingContract = "0x3333333333333333333333333333333333333333";

    expect(
      buildPersonalServerRegistrationTypedData({
        ownerAddress: OWNER_ADDRESS,
        serverAddress: SERVER_ADDRESS,
        serverPublicKey: SERVER_PUBLIC_KEY,
        serverUrl: SERVER_URL,
        config: {
          chainId: 14800,
          contracts: {
            dataRegistry: "0x4444444444444444444444444444444444444444",
            dataPortabilityPermissions:
              "0x5555555555555555555555555555555555555555",
            dataPortabilityServer: verifyingContract,
            dataPortabilityGrantees:
              "0x6666666666666666666666666666666666666666",
          },
        },
      }).domain,
    ).toEqual({
      name: "Vana Data Portability",
      version: "1",
      chainId: 14800,
      verifyingContract,
    });
  });

  it("uses the signer address as ownerAddress and signs the typed data", async () => {
    const signer: PersonalServerRegistrationSigner = {
      address: OWNER_ADDRESS,
      signTypedData: vi.fn().mockResolvedValue(SIGNATURE),
    };

    const result = await buildPersonalServerRegistrationSignature({
      signer,
      serverAddress: SERVER_ADDRESS,
      serverPublicKey: SERVER_PUBLIC_KEY,
      serverUrl: SERVER_URL,
    });

    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledWith(result.typedData);
    expect(result).toMatchObject({
      signature: SIGNATURE,
      signerAddress: OWNER_ADDRESS,
    });
    expect(result).not.toHaveProperty("intent");
    expect(result.typedData.message.ownerAddress).toBe(OWNER_ADDRESS);
  });

  it("exports the registerPersonalServerSignature alias", async () => {
    const signer: PersonalServerRegistrationSigner = {
      address: OWNER_ADDRESS,
      signTypedData: () => SIGNATURE,
    };

    await expect(
      registerPersonalServerSignature({
        signer,
        serverAddress: SERVER_ADDRESS,
        serverPublicKey: SERVER_PUBLIC_KEY,
        serverUrl: SERVER_URL,
      }),
    ).resolves.toMatchObject({
      signature: SIGNATURE,
    });
  });

  it("adapts a viem local account-style signer", async () => {
    const viemAccount = {
      address: OWNER_ADDRESS,
      signTypedData: vi.fn().mockResolvedValue(SIGNATURE),
    };
    const signer = createViemPersonalServerRegistrationSigner(viemAccount);

    const result = await buildPersonalServerRegistrationSignature({
      signer,
      serverAddress: SERVER_ADDRESS,
      serverPublicKey: SERVER_PUBLIC_KEY,
      serverUrl: SERVER_URL,
    });

    expect(viemAccount.signTypedData).toHaveBeenCalledWith(result.typedData);
    expect(result.signerAddress).toBe(OWNER_ADDRESS);
  });

  it("adapts a viem wallet client-style signer with an account", async () => {
    const walletClient = {
      signTypedData: vi.fn().mockResolvedValue(SIGNATURE),
    };
    const signer = createViemPersonalServerRegistrationSigner(walletClient, {
      account: OWNER_ADDRESS,
    });

    const result = await buildPersonalServerRegistrationSignature({
      signer,
      serverAddress: SERVER_ADDRESS,
      serverPublicKey: SERVER_PUBLIC_KEY,
      serverUrl: SERVER_URL,
    });

    expect(walletClient.signTypedData).toHaveBeenCalledWith({
      ...result.typedData,
      account: OWNER_ADDRESS,
    });
  });

  it("rejects invalid address inputs", () => {
    expect(() =>
      buildPersonalServerRegistrationTypedData({
        ownerAddress: "0xnot-an-address",
        serverAddress: SERVER_ADDRESS,
        serverPublicKey: SERVER_PUBLIC_KEY,
        serverUrl: SERVER_URL,
      }),
    ).toThrow("ownerAddress must be a valid EVM address");

    expect(() =>
      buildPersonalServerRegistrationTypedData({
        ownerAddress: OWNER_ADDRESS,
        serverAddress: "0xnot-an-address",
        serverPublicKey: SERVER_PUBLIC_KEY,
        serverUrl: SERVER_URL,
      }),
    ).toThrow("serverAddress must be a valid EVM address");

    expect(() =>
      buildPersonalServerRegistrationTypedData({
        ownerAddress: OWNER_ADDRESS,
        serverAddress: SERVER_ADDRESS,
        serverPublicKey: SERVER_PUBLIC_KEY,
        serverUrl: SERVER_URL,
        verifyingContract: "0xnot-an-address",
      }),
    ).toThrow("verifyingContract must be a valid EVM address");
  });
});
