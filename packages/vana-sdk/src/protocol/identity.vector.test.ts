import * as secp256k1 from "@noble/secp256k1";
import { describe, expect, it } from "vitest";
import {
  concat,
  fromHex,
  keccak256,
  recoverPublicKey,
  toBytes,
  toHex,
  type Hex,
} from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";
import {
  ENCLAVE_IDENTITY_EVIDENCE_VERSION,
  ENCLAVE_WALLET_PURPOSE,
  appRootPreimage,
  kmsIssuedPreimage,
  userPsId,
  verifyEnclaveIdentityEvidence,
  type EnclaveIdentityEvidence,
} from "./identity";

const LIVE_VECTOR = {
  appId: "205730c6547ad5884e8eddba3ace7406efb1260d",
  path: "users/spikevector/wallet/ethereum/secp256k1/v1",
  purpose: "wallet",
  publicKeyCompressed:
    "026d004dca2082e5cf067b34142f8d99568116c330f93671d1761abb2e155c01ea",
  publicKeyUncompressed:
    "046d004dca2082e5cf067b34142f8d99568116c330f93671d1761abb2e155c01eaf465173f6068dacd0bab448e6c0be4016deaf21e07021be1100491f651272be2",
  signatureChain0:
    "310fcdedac7f5a8c665072fb694946fd45d30df61d1eb30ae9dd94e0c586fc212021059c11952fa40ae57f91a36f13617a0cf30496db52af8599289c3c5ff48c00",
  signatureChain1:
    "394d8e0863b49b8459c11515f8f6a10f34a543b607faaeac00b121d8d321366a1ec91b1bb889904fe064425eeee05e4e7ad4292da3b2f034b3897adf6a87bb6c00",
  appRootPublicKey:
    "02724f8036ee1ca252ab10adbd511540273813973f5e6a2321645320d498af4464",
  kmsRootPublicKey:
    "0334c76e0c3f52ec64cbf9bbf5c910c272330166fd656c0a86bb330963e46910e1",
  composeHash:
    "068f954f2c651c39cadafc275dc6d0083ec34e592268a590dcaef35920587ac2",
  osImageHash:
    "bd369a8c2f9edb2b52dad48ac8e0b32dde5f1337c423a506b48d07403a7d8033",
} as const;

function hex(value: string): Hex {
  return `0x${value}`;
}

function compressed(publicKey: Hex): Hex {
  return toHex(
    secp256k1.ProjectivePoint.fromHex(fromHex(publicKey, "bytes")).toRawBytes(
      true,
    ),
  );
}

function chainSignature(signature: Hex): Hex {
  const v = Number.parseInt(signature.slice(-2), 16);
  return `${signature.slice(0, -2)}${(v - 27).toString(16).padStart(2, "0")}` as Hex;
}

function testScalar(label: string): Hex {
  return keccak256(toBytes(`vana-sdk-identity-vector:${label}`));
}

describe("dstack identity vectors", () => {
  it("recovers the app and Phala KMS roots from the live vector", async () => {
    const link0Hash = appRootPreimage(
      LIVE_VECTOR.purpose,
      hex(LIVE_VECTOR.publicKeyUncompressed),
    );
    const recoveredAppRoot = await recoverPublicKey({
      hash: link0Hash,
      signature: hex(LIVE_VECTOR.signatureChain0),
    });

    expect(compressed(recoveredAppRoot).slice(2)).toBe(
      LIVE_VECTOR.appRootPublicKey,
    );
    expect(
      appRootPreimage(
        LIVE_VECTOR.purpose,
        hex(LIVE_VECTOR.publicKeyCompressed),
      ),
    ).toBe(link0Hash);

    const recoveredKmsRoot = await recoverPublicKey({
      hash: kmsIssuedPreimage(hex(LIVE_VECTOR.appId), recoveredAppRoot),
      signature: hex(LIVE_VECTOR.signatureChain1),
    });

    expect(compressed(recoveredKmsRoot).slice(2)).toBe(
      LIVE_VECTOR.kmsRootPublicKey,
    );

    const oldHexTextHash = keccak256(
      concat([
        toBytes(`dstack-kms-issued:${LIVE_VECTOR.appId}`),
        fromHex(compressed(recoveredAppRoot), "bytes"),
      ]),
    );
    const wrongKmsRoot = await recoverPublicKey({
      hash: oldHexTextHash,
      signature: hex(LIVE_VECTOR.signatureChain1),
    });

    expect(compressed(wrongKmsRoot).slice(2)).not.toBe(
      LIVE_VECTOR.kmsRootPublicKey,
    );
  });

  it("verifies a fresh wallet-purpose chain end to end", async () => {
    const appRootScalar = testScalar("app-root");
    const kmsRootScalar = testScalar("kms-root");
    const enclaveScalar = testScalar("enclave");
    const ownerScalar = testScalar("owner");
    const appRoot = privateKeyToAccount(appRootScalar);
    const kmsRoot = privateKeyToAccount(kmsRootScalar);
    const enclave = privateKeyToAccount(enclaveScalar);
    const owner = privateKeyToAccount(ownerScalar);
    const appId = hex("1234567890abcdef1234567890abcdef12345678");
    const chainId = 14800;
    const epoch = 1;
    const signatureChain0 = chainSignature(
      await sign({
        hash: appRootPreimage(ENCLAVE_WALLET_PURPOSE, enclave.publicKey),
        privateKey: appRootScalar,
        to: "hex",
      }),
    );
    const signatureChain1 = chainSignature(
      await sign({
        hash: kmsIssuedPreimage(appId, appRoot.publicKey),
        privateKey: kmsRootScalar,
        to: "hex",
      }),
    );
    const evidence: EnclaveIdentityEvidence = {
      v: ENCLAVE_IDENTITY_EVIDENCE_VERSION,
      userPsId: userPsId(chainId, owner.address),
      chainId,
      ownerAddress: owner.address,
      epoch,
      address: enclave.address,
      publicKey: enclave.publicKey,
      appId,
      composeHash: hex(LIVE_VECTOR.composeHash),
      osImageHash: hex(LIVE_VECTOR.osImageHash),
      purpose: ENCLAVE_WALLET_PURPOSE,
      signatureChain: [signatureChain0, signatureChain1],
      quote: "0x1234",
      kmsRootFingerprint: keccak256(kmsRoot.publicKey),
    };

    await expect(
      verifyEnclaveIdentityEvidence(
        evidence,
        { kmsRootPubkey: kmsRoot.publicKey, appIds: [appId] },
        { ownerAddress: owner.address, chainId, epoch },
      ),
    ).resolves.toBeUndefined();
  });
});
