import { describe, expect, it, vi } from "vitest";
import { recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  PERSONAL_SERVER_DEREGISTRATION_DEFAULT_CHAIN_ID,
  PERSONAL_SERVER_DEREGISTRATION_DEFAULT_TTL_SECONDS,
  PERSONAL_SERVER_DEREGISTRATION_DEFAULT_VERIFYING_CONTRACT,
  buildPersonalServerDeregistrationSignature,
  buildPersonalServerDeregistrationTypedData,
  createViemPersonalServerDeregistrationSigner,
  deregisterPersonalServerSignature,
  personalServerDeregistrationDeadline,
  personalServerDeregistrationDomain,
  type PersonalServerDeregistrationSigner,
} from "./personal-server-revocation";

const OWNER_ADDRESS = "0x1111111111111111111111111111111111111111";
const SERVER_ADDRESS = "0x2222222222222222222222222222222222222222";
const SERVER_ID = `0x${"cd".repeat(32)}` as Hex; // 32-byte serverId
const DEADLINE = 1_782_911_924;
const SIGNATURE = `0x${"aa".repeat(65)}` as const;

describe("Personal Server deregistration", () => {
  it("builds the canonical ServerDeregistration typed data shape", () => {
    expect(
      buildPersonalServerDeregistrationTypedData({
        ownerAddress: OWNER_ADDRESS,
        serverAddress: SERVER_ADDRESS,
        serverId: SERVER_ID,
        deadline: DEADLINE,
      }),
    ).toEqual({
      domain: {
        name: "Vana Data Portability",
        version: "1",
        chainId: PERSONAL_SERVER_DEREGISTRATION_DEFAULT_CHAIN_ID,
        verifyingContract:
          PERSONAL_SERVER_DEREGISTRATION_DEFAULT_VERIFYING_CONTRACT,
      },
      types: {
        ServerDeregistration: [
          { name: "ownerAddress", type: "address" },
          { name: "serverAddress", type: "address" },
          { name: "serverId", type: "bytes32" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "ServerDeregistration",
      message: {
        ownerAddress: OWNER_ADDRESS,
        serverAddress: SERVER_ADDRESS,
        serverId: SERVER_ID,
        deadline: BigInt(DEADLINE),
      },
    });
  });

  it("coerces a bigint deadline and preserves it", () => {
    const typedData = buildPersonalServerDeregistrationTypedData({
      ownerAddress: OWNER_ADDRESS,
      serverAddress: SERVER_ADDRESS,
      serverId: SERVER_ID,
      deadline: 42n,
    });
    expect(typedData.message.deadline).toBe(42n);
  });

  it("builds the default domain without requiring unrelated contract config", () => {
    expect(personalServerDeregistrationDomain()).toEqual({
      name: "Vana Data Portability",
      version: "1",
      chainId: PERSONAL_SERVER_DEREGISTRATION_DEFAULT_CHAIN_ID,
      verifyingContract:
        PERSONAL_SERVER_DEREGISTRATION_DEFAULT_VERIFYING_CONTRACT,
    });
  });

  it("derives the domain from a gateway config using dataPortabilityServer", () => {
    const verifyingContract =
      "0x00000000000000000000000000000000000000cc" as const;
    expect(
      personalServerDeregistrationDomain({
        config: {
          chainId: 14800,
          contracts: {
            dataRegistry: "0x00000000000000000000000000000000000000aa",
            dataPortabilityPermissions:
              "0x00000000000000000000000000000000000000bb",
            dataPortabilityServer: verifyingContract,
            dataPortabilityGrantees:
              "0x00000000000000000000000000000000000000dd",
            dataPortabilityEscrow: "0x00000000000000000000000000000000000000ee",
            feeRegistry: "0x00000000000000000000000000000000000000ff",
          },
        },
      }),
    ).toEqual({
      name: "Vana Data Portability",
      version: "1",
      chainId: 14800,
      verifyingContract,
    });
  });

  it("builds a signature payload, using the signer address as ownerAddress", async () => {
    const signer: PersonalServerDeregistrationSigner = {
      address: OWNER_ADDRESS,
      signTypedData: vi.fn().mockResolvedValue(SIGNATURE),
    };

    const result = await buildPersonalServerDeregistrationSignature({
      signer,
      serverAddress: SERVER_ADDRESS,
      serverId: SERVER_ID,
      deadline: DEADLINE,
    });

    expect(result.signature).toBe(SIGNATURE);
    expect(result.signerAddress).toBe(OWNER_ADDRESS);
    expect(result.deadline).toBe(DEADLINE);
    expect(result.typedData.message.ownerAddress).toBe(OWNER_ADDRESS);
    expect(result.typedData.message.serverId).toBe(SERVER_ID);
    expect(signer.signTypedData).toHaveBeenCalledWith(result.typedData);
  });

  it("exposes deregisterPersonalServerSignature as an alias", () => {
    expect(deregisterPersonalServerSignature).toBe(
      buildPersonalServerDeregistrationSignature,
    );
  });

  // The whole point of matching the gateway's types/domain: a signature built
  // here must recover to the owner under the SAME typed-data definition the
  // gateway uses (data-gateway `recoverServerDeregistrationSigner`). If our
  // ServerDeregistration shape drifts from the gateway's, this fails — instead
  // of silently 401-ing in production.
  it("round-trips: a signed payload recovers to the owner address", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}` as Hex);

    const { signature, typedData } =
      await buildPersonalServerDeregistrationSignature({
        signer: {
          address: account.address,
          signTypedData: (td) => account.signTypedData(td),
        },
        serverAddress: SERVER_ADDRESS,
        serverId: SERVER_ID,
        deadline: DEADLINE,
      });

    const recovered = await recoverTypedDataAddress({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: "ServerDeregistration",
      message: typedData.message,
      signature,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  describe("validation", () => {
    it("rejects an invalid owner address", () => {
      expect(() =>
        buildPersonalServerDeregistrationTypedData({
          ownerAddress: "not-an-address" as `0x${string}`,
          serverAddress: SERVER_ADDRESS,
          serverId: SERVER_ID,
          deadline: DEADLINE,
        }),
      ).toThrow(/ownerAddress/);
    });

    it("rejects an invalid server address", () => {
      expect(() =>
        buildPersonalServerDeregistrationTypedData({
          ownerAddress: OWNER_ADDRESS,
          serverAddress: "0xnope" as `0x${string}`,
          serverId: SERVER_ID,
          deadline: DEADLINE,
        }),
      ).toThrow(/serverAddress/);
    });

    it("rejects a serverId that is not 32 bytes", () => {
      expect(() =>
        buildPersonalServerDeregistrationTypedData({
          ownerAddress: OWNER_ADDRESS,
          serverAddress: SERVER_ADDRESS,
          serverId: "0x1234" as Hex,
          deadline: DEADLINE,
        }),
      ).toThrow(/serverId/);
    });

    it("rejects a non-positive deadline", () => {
      expect(() =>
        buildPersonalServerDeregistrationTypedData({
          ownerAddress: OWNER_ADDRESS,
          serverAddress: SERVER_ADDRESS,
          serverId: SERVER_ID,
          deadline: 0,
        }),
      ).toThrow(/deadline/);
    });
  });

  describe("personalServerDeregistrationDeadline", () => {
    it("adds the default TTL to the provided now", () => {
      expect(personalServerDeregistrationDeadline(1000)).toBe(
        1000 + PERSONAL_SERVER_DEREGISTRATION_DEFAULT_TTL_SECONDS,
      );
    });

    it("honors a custom TTL and floors the now value", () => {
      expect(personalServerDeregistrationDeadline(1000.9, 60)).toBe(1060);
    });
  });

  describe("createViemPersonalServerDeregistrationSigner", () => {
    it("returns a native signer unchanged", () => {
      const signer: PersonalServerDeregistrationSigner = {
        address: OWNER_ADDRESS,
        signTypedData: vi.fn().mockResolvedValue(SIGNATURE),
      };
      expect(createViemPersonalServerDeregistrationSigner(signer)).toBe(signer);
    });

    it("adapts a viem wallet client, threading the account through", async () => {
      const walletClient = {
        account: OWNER_ADDRESS as `0x${string}`,
        signTypedData: vi.fn().mockResolvedValue(SIGNATURE),
      };
      const signer = createViemPersonalServerDeregistrationSigner(walletClient);
      expect(signer.address).toBe(OWNER_ADDRESS);

      const typedData = buildPersonalServerDeregistrationTypedData({
        ownerAddress: OWNER_ADDRESS,
        serverAddress: SERVER_ADDRESS,
        serverId: SERVER_ID,
        deadline: DEADLINE,
      });
      await signer.signTypedData(typedData);
      expect(walletClient.signTypedData).toHaveBeenCalledWith({
        ...typedData,
        account: OWNER_ADDRESS,
      });
    });

    it("throws when a wallet client has no resolvable account", () => {
      expect(() =>
        createViemPersonalServerDeregistrationSigner({
          signTypedData: vi.fn(),
        }),
      ).toThrow(/account/);
    });
  });
});
