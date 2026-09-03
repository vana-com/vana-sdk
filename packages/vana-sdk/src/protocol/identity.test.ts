import * as secp256k1 from "@noble/secp256k1";
import { describe, expect, it } from "vitest";
import {
  concatHex,
  encodePacked,
  fromHex,
  keccak256,
  stringToHex,
  toBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";
import { deserializeECIES } from "../crypto/ecies/interface";
import { NodeECIESUint8Provider } from "../crypto/ecies/node";
import { MASTER_KEY_MESSAGE } from "../crypto/keys/derive";
import {
  ENCLAVE_IDENTITY_EVIDENCE_VERSION,
  ENCLAVE_TRUST_ANCHORS,
  ENCLAVE_WALLET_PURPOSE,
  MASTER_SIGNATURE_DELIVERY_VERSION,
  USER_PS_ID_DOMAIN,
  appRootPreimage,
  buildMasterSignatureDelivery,
  encryptMasterSignatureDelivery,
  kmsIssuedPreimage,
  userPsId,
  verifyEnclaveIdentityEvidence,
  type EnclaveIdentityEvidence,
  type EnclaveTrustAnchors,
  type ExpectedIdentity,
} from "./identity";

const VECTOR_OWNER_ADDRESS =
  "0x000000000000000000000000000000000000dEaD" as Address;
const OTHER_OWNER_ADDRESS =
  "0x000000000000000000000000000000000000bEEF" as Address;
const CHAIN_ID = 14800;
const APP_ID = "0x1111111111111111111111111111111111111111" as Hex;

// Deterministic test scalars; not real keys and no 64-hex literal for the EVM key scan.
const testKey = (label: string): Hex =>
  keccak256(toBytes(`vana-sdk-identity-test:${label}`));
const APP_ROOT_PRIVATE_KEY = testKey("app-root");
const KMS_ROOT_PRIVATE_KEY = testKey("kms-root");
const ENCLAVE_PRIVATE_KEY = testKey("enclave");
const OTHER_PRIVATE_KEY = testKey("other");
const OWNER_KEY = testKey("owner");
const OWNER_ACCOUNT = privateKeyToAccount(OWNER_KEY);
const MASTER_SIGNATURE = `0x${"ab".repeat(65)}` as Hex;
const ZERO_HASH = `0x${"00".repeat(32)}` as Hex;

function dstackSignature(signature: Hex): Hex {
  const v = Number.parseInt(signature.slice(-2), 16);
  return `${signature.slice(0, -2)}${(v - 27).toString(16).padStart(2, "0")}` as Hex;
}

function tamper(signature: Hex): Hex {
  const replacement = signature[2] === "0" ? "1" : "0";
  return `0x${replacement}${signature.slice(3)}` as Hex;
}

async function identityFixture(): Promise<{
  evidence: EnclaveIdentityEvidence;
  anchors: EnclaveTrustAnchors;
  expected: ExpectedIdentity;
}> {
  const appRootPublicKey = privateKeyToAccount(APP_ROOT_PRIVATE_KEY).publicKey;
  const kmsRootPublicKey = privateKeyToAccount(KMS_ROOT_PRIVATE_KEY).publicKey;
  const enclave = privateKeyToAccount(ENCLAVE_PRIVATE_KEY);
  const appRootSignature = dstackSignature(
    await sign({
      hash: appRootPreimage(ENCLAVE_WALLET_PURPOSE, enclave.publicKey),
      privateKey: APP_ROOT_PRIVATE_KEY,
      to: "hex",
    }),
  );
  const kmsRootSignature = dstackSignature(
    await sign({
      hash: kmsIssuedPreimage(APP_ID, appRootPublicKey),
      privateKey: KMS_ROOT_PRIVATE_KEY,
      to: "hex",
    }),
  );
  const evidence: EnclaveIdentityEvidence = {
    v: ENCLAVE_IDENTITY_EVIDENCE_VERSION,
    userPsId: userPsId(CHAIN_ID, OWNER_ACCOUNT.address),
    chainId: CHAIN_ID,
    ownerAddress: OWNER_ACCOUNT.address,
    epoch: 1,
    address: enclave.address,
    publicKey: enclave.publicKey,
    appId: APP_ID,
    composeHash: ZERO_HASH,
    purpose: ENCLAVE_WALLET_PURPOSE,
    signatureChain: [appRootSignature, kmsRootSignature],
    quote: "0x1234",
    kmsRootFingerprint: keccak256(kmsRootPublicKey),
  };

  return {
    evidence,
    anchors: { kmsRootPubkey: kmsRootPublicKey, appIds: [APP_ID] },
    expected: {
      ownerAddress: OWNER_ACCOUNT.address,
      chainId: CHAIN_ID,
      epoch: evidence.epoch,
    },
  };
}

describe("userPsId", () => {
  it("matches the enclave encoding and a fixed known vector", () => {
    const expected = keccak256(
      encodePacked(
        ["string", "uint256", "address"],
        [USER_PS_ID_DOMAIN, BigInt(CHAIN_ID), VECTOR_OWNER_ADDRESS],
      ),
    );

    expect(userPsId(CHAIN_ID, VECTOR_OWNER_ADDRESS)).toBe(expected);
    // Produced with viem encodePacked + keccak256 outside the mocked test runtime.
    expect(expected).toBe(
      "0xbe9e20c3cfc1d91970629660e4ecc58277e0e4172c4883e1a32465f6bc20020e",
    );
  });

  it("changes with the chain ID and owner", () => {
    const id = userPsId(CHAIN_ID, VECTOR_OWNER_ADDRESS);

    expect(userPsId(1480, VECTOR_OWNER_ADDRESS)).not.toBe(id);
    expect(userPsId(CHAIN_ID, OTHER_OWNER_ADDRESS)).not.toBe(id);
  });
});

describe("signature-chain preimages", () => {
  it("encodes link 0 as lowercase compressed-key hex in UTF-8", () => {
    const publicKey = privateKeyToAccount(APP_ROOT_PRIVATE_KEY).publicKey;
    const compressed = secp256k1.ProjectivePoint.fromHex(
      fromHex(publicKey, "bytes"),
    ).toRawBytes(true);
    const expected = keccak256(
      stringToHex(`${ENCLAVE_WALLET_PURPOSE}:${toHex(compressed).slice(2)}`),
    );

    expect(appRootPreimage(ENCLAVE_WALLET_PURPOSE, publicKey)).toBe(expected);
  });

  it("encodes link 1 as a UTF-8 prefix plus raw compressed SEC1 bytes", () => {
    const publicKey = privateKeyToAccount(APP_ROOT_PRIVATE_KEY).publicKey;
    const compressed = secp256k1.ProjectivePoint.fromHex(
      fromHex(publicKey, "bytes"),
    ).toRawBytes(true);
    const expected = keccak256(
      concatHex([stringToHex("dstack-kms-issued:"), APP_ID, toHex(compressed)]),
    );

    expect(kmsIssuedPreimage(APP_ID, publicKey)).toBe(expected);
  });
});

describe("verifyEnclaveIdentityEvidence", () => {
  it("freezes fleet trust anchors", () => {
    const anchors = ENCLAVE_TRUST_ANCHORS[CHAIN_ID];

    expect(Object.isFrozen(ENCLAVE_TRUST_ANCHORS)).toBe(true);
    expect(Object.isFrozen(anchors)).toBe(true);
    expect(Object.isFrozen(anchors?.appIds)).toBe(true);
  });

  it("accepts a valid two-link dstack signature chain", async () => {
    const { evidence, anchors, expected } = await identityFixture();

    await expect(
      verifyEnclaveIdentityEvidence(evidence, anchors, expected),
    ).resolves.toBeUndefined();
  });

  it("accepts a compressed KMS root anchor", async () => {
    const { evidence, anchors, expected } = await identityFixture();
    const kmsRootPubkey = toHex(
      secp256k1.ProjectivePoint.fromHex(
        fromHex(anchors.kmsRootPubkey, "bytes"),
      ).toRawBytes(true),
    );

    await expect(
      verifyEnclaveIdentityEvidence(
        evidence,
        { ...anchors, kmsRootPubkey },
        expected,
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects an unsupported evidence version", async () => {
    const { evidence, anchors, expected } = await identityFixture();

    await expect(
      verifyEnclaveIdentityEvidence(
        { ...evidence, v: 2 } as unknown as EnclaveIdentityEvidence,
        anchors,
        expected,
      ),
    ).rejects.toThrow("Unsupported enclave identity evidence version");
  });

  it.each([0, 1.5])("rejects invalid epoch %s", async (epoch) => {
    const { evidence, anchors, expected } = await identityFixture();

    await expect(
      verifyEnclaveIdentityEvidence({ ...evidence, epoch }, anchors, expected),
    ).rejects.toThrow("Invalid enclave identity epoch");
  });

  it.each(["0xzz", "compressed"])(
    "rejects a malformed public key (%s)",
    async (kind) => {
      const { evidence, anchors, expected } = await identityFixture();
      const publicKey =
        kind === "compressed"
          ? toHex(
              secp256k1.ProjectivePoint.fromHex(
                fromHex(evidence.publicKey, "bytes"),
              ).toRawBytes(true),
            )
          : (kind as Hex);

      await expect(
        verifyEnclaveIdentityEvidence(
          { ...evidence, publicKey },
          anchors,
          expected,
        ),
      ).rejects.toThrow(
        "Public key must be a 65-byte uncompressed secp256k1 key",
      );
    },
  );

  it("rejects a malformed KMS root anchor", async () => {
    const { evidence, anchors, expected } = await identityFixture();

    await expect(
      verifyEnclaveIdentityEvidence(
        evidence,
        { ...anchors, kmsRootPubkey: "0x1234" },
        expected,
      ),
    ).rejects.toThrow("KMS root trust anchor is malformed");
  });

  it("rejects an address that does not match the public key", async () => {
    const { evidence, anchors, expected } = await identityFixture();
    const address = privateKeyToAccount(OTHER_PRIVATE_KEY).address;

    await expect(
      verifyEnclaveIdentityEvidence(
        { ...evidence, address },
        anchors,
        expected,
      ),
    ).rejects.toThrow("Enclave public key does not match its address");
  });

  it("rejects a tampered link 0", async () => {
    const { evidence, anchors, expected } = await identityFixture();
    const signatureChain: [Hex, Hex] = [
      tamper(evidence.signatureChain[0]),
      evidence.signatureChain[1],
    ];

    await expect(
      verifyEnclaveIdentityEvidence(
        { ...evidence, signatureChain },
        anchors,
        expected,
      ),
    ).rejects.toThrow();
  });

  it("rejects an invalid link 0 encoding", async () => {
    const { evidence, anchors, expected } = await identityFixture();
    const signatureChain: [Hex, Hex] = ["0x", evidence.signatureChain[1]];

    await expect(
      verifyEnclaveIdentityEvidence(
        { ...evidence, signatureChain },
        anchors,
        expected,
      ),
    ).rejects.toThrow("Invalid enclave signature chain link 0");
  });

  it("rejects a tampered link 1", async () => {
    const { evidence, anchors, expected } = await identityFixture();
    const signatureChain: [Hex, Hex] = [
      evidence.signatureChain[0],
      tamper(evidence.signatureChain[1]),
    ];

    await expect(
      verifyEnclaveIdentityEvidence(
        { ...evidence, signatureChain },
        anchors,
        expected,
      ),
    ).rejects.toThrow();
  });

  it("rejects an invalid link 1 encoding", async () => {
    const { evidence, anchors, expected } = await identityFixture();
    const signatureChain: [Hex, Hex] = [evidence.signatureChain[0], "0x"];

    await expect(
      verifyEnclaveIdentityEvidence(
        { ...evidence, signatureChain },
        anchors,
        expected,
      ),
    ).rejects.toThrow("Invalid enclave signature chain link 1");
  });

  it("rejects a different KMS root trust anchor", async () => {
    const { evidence, anchors, expected } = await identityFixture();
    const kmsRootPubkey = privateKeyToAccount(OTHER_PRIVATE_KEY).publicKey;

    await expect(
      verifyEnclaveIdentityEvidence(
        evidence,
        {
          ...anchors,
          kmsRootPubkey,
        },
        expected,
      ),
    ).rejects.toThrow("KMS root public key does not match the trust anchor");
  });

  it("rejects a wrong KMS root fingerprint", async () => {
    const { evidence, anchors, expected } = await identityFixture();

    await expect(
      verifyEnclaveIdentityEvidence(
        { ...evidence, kmsRootFingerprint: ZERO_HASH },
        anchors,
        expected,
      ),
    ).rejects.toThrow("KMS root fingerprint does not match the evidence");
  });

  it("rejects an app ID outside the allowlist", async () => {
    const { evidence, anchors, expected } = await identityFixture();

    await expect(
      verifyEnclaveIdentityEvidence(
        evidence,
        { ...anchors, appIds: [] },
        expected,
      ),
    ).rejects.toThrow("Enclave app ID is not trusted");
  });

  it("fails closed while fleet anchors are empty", async () => {
    const { evidence, expected } = await identityFixture();
    const anchors = ENCLAVE_TRUST_ANCHORS[CHAIN_ID];
    const signatureChain: [Hex, Hex] = ["0x", "0x"];

    expect(anchors).toBeDefined();
    await expect(
      verifyEnclaveIdentityEvidence(
        { ...evidence, signatureChain },
        anchors,
        expected,
      ),
    ).rejects.toThrow("KMS root trust anchor is not provisioned");
  });

  it("rejects a different expected owner", async () => {
    const { evidence, anchors, expected } = await identityFixture();

    await expect(
      verifyEnclaveIdentityEvidence(evidence, anchors, {
        ...expected,
        ownerAddress: OTHER_OWNER_ADDRESS,
      }),
    ).rejects.toThrow("Enclave identity owner does not match expected owner");
  });

  it("rejects a different expected chain ID", async () => {
    const { evidence, anchors, expected } = await identityFixture();

    await expect(
      verifyEnclaveIdentityEvidence(evidence, anchors, {
        ...expected,
        chainId: 1480,
      }),
    ).rejects.toThrow(
      "Enclave identity chain ID does not match expected chain ID",
    );
  });

  it("rejects a different expected epoch", async () => {
    const { evidence, anchors, expected } = await identityFixture();

    await expect(
      verifyEnclaveIdentityEvidence(evidence, anchors, {
        ...expected,
        epoch: expected.epoch + 1,
      }),
    ).rejects.toThrow("Enclave identity epoch does not match expected epoch");
  });

  it("rejects a tampered userPsId", async () => {
    const { evidence, anchors, expected } = await identityFixture();

    await expect(
      verifyEnclaveIdentityEvidence(
        { ...evidence, userPsId: ZERO_HASH },
        anchors,
        expected,
      ),
    ).rejects.toThrow("Enclave userPsId does not match expected identity");
  });

  it("rejects a non-wallet purpose", async () => {
    const { evidence, anchors, expected } = await identityFixture();

    await expect(
      verifyEnclaveIdentityEvidence(
        { ...evidence, purpose: "vana.ps-enclave.sealing.v1" },
        anchors,
        expected,
      ),
    ).rejects.toThrow("Unexpected enclave wallet purpose");
  });
});

describe("master-signature delivery", () => {
  it("builds the enclave-bound plaintext fields", async () => {
    const { evidence } = await identityFixture();
    const masterSignature = await OWNER_ACCOUNT.signMessage({
      message: MASTER_KEY_MESSAGE,
    });
    const delivery = await buildMasterSignatureDelivery(
      evidence,
      masterSignature,
      1_700_000_000,
    );

    expect(delivery).toEqual({
      v: MASTER_SIGNATURE_DELIVERY_VERSION,
      userPsId: evidence.userPsId,
      epoch: evidence.epoch,
      enclaveAddress: evidence.address,
      ownerAddress: evidence.ownerAddress,
      masterSignature,
      issuedAt: 1_700_000_000,
    });
  });

  it("rejects a master signature that is not 65 bytes", async () => {
    const { evidence } = await identityFixture();

    await expect(
      buildMasterSignatureDelivery(evidence, "0xab"),
    ).rejects.toThrow("Invalid signature length");
  });

  it("rejects a signature from another wallet", async () => {
    const { evidence } = await identityFixture();
    const signature = await privateKeyToAccount(OTHER_PRIVATE_KEY).signMessage({
      message: MASTER_KEY_MESSAGE,
    });

    await expect(
      buildMasterSignatureDelivery(evidence, signature),
    ).rejects.toThrow("Master signature signer does not match evidence owner");
  });

  it("rejects a malformed 65-byte signature", async () => {
    const { evidence } = await identityFixture();

    await expect(
      buildMasterSignatureDelivery(evidence, MASTER_SIGNATURE),
    ).rejects.toThrow();
  });

  it("encrypts and decrypts an exact JSON delivery round trip", async () => {
    const { evidence } = await identityFixture();
    const masterSignature = await OWNER_ACCOUNT.signMessage({
      message: MASTER_KEY_MESSAGE,
    });
    const delivery = await buildMasterSignatureDelivery(
      evidence,
      masterSignature,
      1_700_000_000,
    );
    const ecies = new NodeECIESUint8Provider();

    const ciphertext = await encryptMasterSignatureDelivery(
      delivery,
      evidence.publicKey,
      ecies,
    );
    const plaintext = await ecies.decrypt(
      fromHex(ENCLAVE_PRIVATE_KEY, "bytes"),
      deserializeECIES(ciphertext),
    );

    expect(JSON.parse(new TextDecoder().decode(plaintext))).toEqual(delivery);
  });

  it.each(["0x04", `0x03${"11".repeat(64)}`, `0x04${"gg".repeat(64)}`])(
    "rejects invalid uncompressed public key %s",
    async (publicKey) => {
      const { evidence } = await identityFixture();
      const masterSignature = await OWNER_ACCOUNT.signMessage({
        message: MASTER_KEY_MESSAGE,
      });
      const delivery = await buildMasterSignatureDelivery(
        evidence,
        masterSignature,
      );

      await expect(
        encryptMasterSignatureDelivery(
          delivery,
          publicKey as Hex,
          new NodeECIESUint8Provider(),
        ),
      ).rejects.toThrow(
        "Public key must be a 65-byte uncompressed secp256k1 key",
      );
    },
  );

  it("rejects a public key that is not the delivery enclave", async () => {
    const { evidence } = await identityFixture();
    const masterSignature = await OWNER_ACCOUNT.signMessage({
      message: MASTER_KEY_MESSAGE,
    });
    const delivery = await buildMasterSignatureDelivery(
      evidence,
      masterSignature,
    );
    const publicKey = privateKeyToAccount(OTHER_PRIVATE_KEY).publicKey;

    await expect(
      encryptMasterSignatureDelivery(
        delivery,
        publicKey,
        new NodeECIESUint8Provider(),
      ),
    ).rejects.toThrow(
      "Public key does not belong to the delivery's enclave address",
    );
  });
});
