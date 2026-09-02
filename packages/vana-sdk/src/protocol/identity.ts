/**
 * Enclave identity and consent primitives for Personal Servers.
 *
 * Owner/Web -> Gateway -> Agent(CVM): derive wallet and quote
 * Web verifies evidence; Account encrypts the EIP-191 master signature to the
 * enclave public key; Gateway relays it blind; Agent decrypts and seals it.
 *
 * @category Protocol
 */

import * as secp256k1 from "@noble/secp256k1";
import {
  concat,
  encodePacked,
  fromHex,
  getAddress,
  keccak256,
  recoverPublicKey,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { publicKeyToAddress } from "viem/accounts";
import { serializeECIES, type ECIESProvider } from "../crypto/ecies/interface";
import { deriveMasterKey } from "../crypto/keys/derive";
import type { ServerRegistrationMessage } from "./eip712";

export const ENCLAVE_IDENTITY_EVIDENCE_VERSION = 1;
export const USER_PS_ID_DOMAIN = "vana.ps-enclave.v1";
export const ENCLAVE_WALLET_PURPOSE = "vana.ps-enclave.wallet.v1";
export const MASTER_SIGNATURE_DELIVERY_VERSION = "vana.ps-enclave.delivery.v1";
export const SEALED_ENVELOPE_VERSION = 1;

const VANA_MAINNET_CHAIN_ID = 1480;
const MOKSHA_CHAIN_ID = 14800;
const KMS_ISSUED_PREFIX = "dstack-kms-issued";
const PREIMAGE_SEPARATOR = ":";
const UNCOMPRESSED_PUBLIC_KEY_BYTES = 65;
const UNCOMPRESSED_PUBLIC_KEY_PREFIX = "04";

export type UserPsId = Hex;

export interface EnclaveIdentityEvidence {
  v: typeof ENCLAVE_IDENTITY_EVIDENCE_VERSION;
  userPsId: UserPsId;
  chainId: number;
  ownerAddress: Address;
  epoch: number;
  address: Address;
  publicKey: Hex;
  appId: Hex;
  composeHash: Hex;
  osImageHash?: Hex;
  purpose: string;
  signatureChain: [Hex, Hex];
  quote: Hex;
  eventLog?: string;
  kmsRootFingerprint: Hex;
}

export interface IdentityRequest {
  ownerAddress: Address;
  chainId: number;
}

export type IdentityState = "prepared" | "registered" | "sealed" | "retired";

export interface IdentityResponse {
  identity: EnclaveIdentityEvidence;
  state: IdentityState;
  created: boolean;
  serverUrl: string;
  serverId?: Hex;
  serverStatus?:
    | "pending"
    | "submitting"
    | "confirmed"
    | "finalized"
    | "failed";
  sealed: boolean;
}

export type IdentityRegistrationRequest =
  | { version: "v2"; message: ServerRegistrationMessage }
  | {
      version: "v3";
      message: ServerRegistrationMessage & { nonce: string; deadline: string };
    };

export interface IdentityRegistrationResponse {
  serverId: Hex;
  state: "registered";
  serverStatus: "pending";
}

/** Inner plaintext of the ECIES box. */
export interface MasterSignatureDelivery {
  v: typeof MASTER_SIGNATURE_DELIVERY_VERSION;
  userPsId: UserPsId;
  epoch: number;
  enclaveAddress: Address;
  ownerAddress: Address;
  masterSignature: Hex;
  issuedAt: number;
}

export interface SealedSecretSubmission {
  userPsId: UserPsId;
  epoch: number;
  enclaveAddress: Address;
  ciphertext: Hex;
}

export interface SealedSecretResponse {
  sealed: true;
  secretHash: Hex;
  sealedAt: string;
}

export interface AesGcmBox {
  iv: string;
  ciphertext: string;
  tag: string;
}

/** Persisted enclave envelope; the Gateway treats it as opaque text. */
export interface SealedEnvelope extends AesGcmBox {
  v: typeof SEALED_ENVELOPE_VERSION;
  wrappedContentKey: AesGcmBox;
}

export interface EnclaveTrustAnchors {
  kmsRootPubkey: Hex;
  appIds: Hex[];
}

/** Fleet-provisioned trust anchors keyed by Vana chain ID. */
export const ENCLAVE_TRUST_ANCHORS: Record<number, EnclaveTrustAnchors> = {
  // filled at fleet provisioning; verify fails closed while empty
  [VANA_MAINNET_CHAIN_ID]: { kmsRootPubkey: "0x", appIds: [] },
  // filled at fleet provisioning; verify fails closed while empty
  [MOKSHA_CHAIN_ID]: { kmsRootPubkey: "0x", appIds: [] },
};

/**
 * Derives the deterministic Personal Server ID used by enclave paths.
 *
 * @param chainId - Vana chain ID.
 * @param ownerAddress - Checksummed owner address.
 * @returns The path-compatible keccak256 digest.
 */
export function userPsId(chainId: number, ownerAddress: Address): UserPsId {
  const packed = encodePacked(
    ["string", "uint256", "address"],
    [USER_PS_ID_DOMAIN, BigInt(chainId), getAddress(ownerAddress)],
  );

  return keccak256(packed);
}

/**
 * Builds keccak256(purpose || ":" || hex(pubkey)) for signature-chain link 0.
 *
 * ASSUMPTION: hex(pubkey) is lowercase, without 0x, for the 65-byte key.
 * TODO(verify-against-dstack-vector): pin with a captured CVM chain
 * (dstack kms/src/crypto.rs).
 */
export function appRootPreimage(purpose: string, publicKey: Hex): Hex {
  const keyHex = publicKey.slice(2).toLowerCase();
  return keccak256(toBytes(`${purpose}${PREIMAGE_SEPARATOR}${keyHex}`));
}

/**
 * Builds the dstack KMS issuance digest for signature-chain link 1.
 *
 * ASSUMPTION: appId is lowercase hex without 0x encoded as UTF-8; the app-root
 * key is appended as 33 raw SEC1-compressed bytes.
 * TODO(verify-against-dstack-vector): pin with a captured CVM chain.
 */
export function kmsIssuedPreimage(appId: Hex, appRootPublicKey: Hex): Hex {
  const appIdHex = appId.slice(2).toLowerCase();
  const prefix = toBytes(
    `${KMS_ISSUED_PREFIX}${PREIMAGE_SEPARATOR}${appIdHex}`,
  );
  const compressed = secp256k1.ProjectivePoint.fromHex(
    fromHex(appRootPublicKey, "bytes"),
  ).toRawBytes(true);

  return keccak256(concat([prefix, compressed]));
}

async function recoverChainKey(
  hash: Hex,
  signature: Hex,
  link: number,
): Promise<Hex> {
  try {
    return (await recoverPublicKey({ hash, signature })).toLowerCase() as Hex;
  } catch {
    throw new Error(`Invalid enclave signature chain link ${link}`);
  }
}

/**
 * Verifies the enclave wallet binding against fleet-provisioned trust anchors.
 *
 * @param evidence - Identity evidence returned by the enclave agent.
 * @param anchors - Pinned KMS root and allowed dstack app IDs.
 * @throws When any identity binding or trust check fails.
 */
export async function verifyEnclaveIdentityEvidence(
  evidence: EnclaveIdentityEvidence,
  anchors: EnclaveTrustAnchors,
): Promise<void> {
  if (evidence.v !== ENCLAVE_IDENTITY_EVIDENCE_VERSION) {
    throw new Error("Unsupported enclave identity evidence version");
  }

  if (!Number.isInteger(evidence.epoch) || evidence.epoch < 1) {
    throw new Error("Invalid enclave identity epoch");
  }

  const derivedAddress = publicKeyToAddress(evidence.publicKey);

  if (getAddress(derivedAddress) !== getAddress(evidence.address)) {
    throw new Error("Enclave public key does not match its address");
  }

  const appRootPublicKey = await recoverChainKey(
    appRootPreimage(evidence.purpose, evidence.publicKey),
    evidence.signatureChain[0],
    0,
  );
  const kmsRootPublicKey = await recoverChainKey(
    kmsIssuedPreimage(evidence.appId, appRootPublicKey),
    evidence.signatureChain[1],
    1,
  );

  if (anchors.kmsRootPubkey === "0x") {
    throw new Error("KMS root trust anchor is not provisioned");
  }

  if (kmsRootPublicKey !== anchors.kmsRootPubkey.toLowerCase()) {
    throw new Error("KMS root public key does not match the trust anchor");
  }

  if (
    keccak256(kmsRootPublicKey) !== evidence.kmsRootFingerprint.toLowerCase()
  ) {
    throw new Error("KMS root fingerprint does not match the evidence");
  }

  const appId = evidence.appId.toLowerCase();
  if (
    !anchors.appIds.some((allowedAppId) => allowedAppId.toLowerCase() === appId)
  ) {
    throw new Error("Enclave app ID is not trusted");
  }
}

/**
 * Builds the authenticated master-signature plaintext delivered to an enclave.
 *
 * @param evidence - Verified enclave identity evidence.
 * @param masterSignature - EIP-191 signature over the master-key message.
 * @param now - Issuance time in Unix seconds.
 * @returns The plaintext delivery object.
 */
export function buildMasterSignatureDelivery(
  evidence: EnclaveIdentityEvidence,
  masterSignature: Hex,
  now = Math.floor(Date.now() / 1000),
): MasterSignatureDelivery {
  deriveMasterKey(masterSignature);

  return {
    v: MASTER_SIGNATURE_DELIVERY_VERSION,
    userPsId: evidence.userPsId,
    epoch: evidence.epoch,
    enclaveAddress: evidence.address,
    ownerAddress: evidence.ownerAddress,
    masterSignature,
    issuedAt: now,
  };
}

function assertUncompressedKey(publicKey: Hex): void {
  const hex = publicKey.slice(2);
  if (
    hex.length !== UNCOMPRESSED_PUBLIC_KEY_BYTES * 2 ||
    !hex.startsWith(UNCOMPRESSED_PUBLIC_KEY_PREFIX) ||
    !/^[0-9a-fA-F]+$/.test(hex)
  ) {
    throw new Error("Public key must be a 65-byte uncompressed secp256k1 key");
  }
}

/**
 * Encrypts a master-signature delivery in the SDK's ECIES wire format.
 *
 * @param delivery - Plaintext delivery object.
 * @param publicKey - Enclave 65-byte uncompressed public key.
 * @param ecies - Platform-specific ECIES provider.
 * @returns The 0x-prefixed serialized ciphertext.
 */
export async function encryptMasterSignatureDelivery(
  delivery: MasterSignatureDelivery,
  publicKey: Hex,
  ecies: ECIESProvider,
): Promise<Hex> {
  assertUncompressedKey(publicKey);

  const plaintext = toBytes(JSON.stringify(delivery));
  const encrypted = await ecies.encrypt(fromHex(publicKey, "bytes"), plaintext);

  return `0x${serializeECIES(encrypted)}`;
}
