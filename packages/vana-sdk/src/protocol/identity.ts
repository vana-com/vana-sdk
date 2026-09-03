/**
 * Enclave identity and consent primitives for Personal Servers.
 *
 * Owner/Web -> Gateway -> Agent(CVM): derive wallet and quote
 * Web verifies evidence; Account authenticates and encrypts the EIP-191 master
 * signature to the enclave key; Gateway relays it blind; Agent decrypts/seals.
 *
 * @category Protocol
 */

import * as secp256k1 from "@noble/secp256k1";
import {
  concat,
  encodePacked,
  fromHex,
  getAddress,
  isAddressEqual,
  keccak256,
  recoverPublicKey,
  toBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { publicKeyToAddress } from "viem/accounts";
import { serializeECIES, type ECIESProvider } from "../crypto/ecies/interface";
import { deriveMasterKey, recoverServerOwner } from "../crypto/keys/derive";
import type { ServerRegistrationMessage } from "./eip712";

export const ENCLAVE_IDENTITY_EVIDENCE_VERSION = 1;
export const USER_PS_ID_DOMAIN = "vana.ps-enclave.v1";
export const ENCLAVE_WALLET_PURPOSE = "vana.ps-enclave.wallet.v1";
export const MASTER_SIGNATURE_DELIVERY_VERSION = "vana.ps-enclave.delivery.v1";
/** Agent rejects deliveries when `|now - issuedAt|` exceeds this value. */
export const MASTER_SIGNATURE_DELIVERY_MAX_AGE_SECONDS = 600;
export const SEALED_ENVELOPE_VERSION = 1;

const VANA_MAINNET_CHAIN_ID = 1480;
const MOKSHA_CHAIN_ID = 14800;
const KMS_ISSUED_PREFIX = "dstack-kms-issued";
const PREIMAGE_SEPARATOR = ":";
const UNCOMPRESSED_PUBLIC_KEY_BYTES = 65;
const UNCOMPRESSED_PUBLIC_KEY_PREFIX = "04";
const EMPTY_HEX = "0x";

/** `keccak256(encodePacked([string,uint256,address], [USER_PS_ID_DOMAIN,chainId,owner]))`. */
export type UserPsId = Hex;

/** Attested identity evidence returned by the enclave agent. */
export interface EnclaveIdentityEvidence {
  v: typeof ENCLAVE_IDENTITY_EVIDENCE_VERSION;
  userPsId: UserPsId;
  chainId: number;
  ownerAddress: Address;
  /** Path suffix `users/{id}/wallet/ethereum/secp256k1/v{epoch}`. */
  epoch: number;
  address: Address;
  /** 65-byte uncompressed `0x04..`; `publicKeyToAddress(publicKey) == address`. */
  publicKey: Hex;
  /** 20-byte dstack `app_id`. */
  appId: Hex;
  /** 32-byte compose hash. */
  composeHash: Hex;
  /** Omitted when the OS does not expose its image hash. */
  osImageHash?: Hex;
  /** Must equal `ENCLAVE_WALLET_PURPOSE`. */
  purpose: string;
  /** `[appRoot over link 0, kmsRoot over link 1]`; see `appRootPreimage` and `kmsIssuedPreimage`. */
  signatureChain: [Hex, Hex];
  /** Raw TDX quote with report_data `keccak256(userPsId || address)`; not parsed. */
  quote: Hex;
  eventLog?: string;
  /** `keccak256` of the uncompressed KMS root public key. */
  kmsRootFingerprint: Hex;
}

/** Identity values the caller expects the evidence to bind. */
export interface ExpectedIdentity {
  ownerAddress: Address;
  chainId: number;
  epoch: number;
}

/** Request for an owner-scoped enclave identity. */
export interface IdentityRequest {
  ownerAddress: Address;
  chainId: number;
}

/** Lifecycle state of an enclave identity. */
export type IdentityState = "prepared" | "registered" | "sealed" | "retired";

/** Gateway response containing enclave identity state and registration data. */
export interface IdentityResponse {
  identity: EnclaveIdentityEvidence;
  state: IdentityState;
  created: boolean;
  /** Exact `ServerRegistration.serverUrl` the owner signs. */
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

/** Versioned server-registration request for an enclave identity. */
export type IdentityRegistrationRequest =
  | { version: "v2"; message: ServerRegistrationMessage }
  | {
      version: "v3";
      message: ServerRegistrationMessage & { nonce: string; deadline: string };
    };

/** Accepted identity-registration response. */
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
  /** 65-byte EIP-191 signature over `MASTER_KEY_MESSAGE`. */
  masterSignature: Hex;
  /** Unix seconds; see `MASTER_SIGNATURE_DELIVERY_MAX_AGE_SECONDS`. */
  issuedAt: number;
}

/** Enclave-bound ciphertext submitted for sealing. */
export interface SealedSecretSubmission {
  userPsId: UserPsId;
  epoch: number;
  enclaveAddress: Address;
  /** `iv(16) || ephemPub(65) || ct || mac(32)` to `evidence.publicKey`. */
  ciphertext: Hex;
}

/** Confirmation that the enclave sealed a submitted secret. */
export interface SealedSecretResponse {
  sealed: true;
  /** `sha256(ciphertext)`. */
  secretHash: Hex;
  sealedAt: string;
}

/** AES-GCM fields encoded as base64 strings. */
export interface AesGcmBox {
  /** Base64 initialization vector. */
  iv: string;
  /** Base64 ciphertext. */
  ciphertext: string;
  /** Base64 authentication tag. */
  tag: string;
}

/** Persisted enclave envelope; the Gateway treats it as opaque text. */
export interface SealedEnvelope extends AesGcmBox {
  v: typeof SEALED_ENVELOPE_VERSION;
  wrappedContentKey: AesGcmBox;
}

/** Fleet-pinned KMS root and allowed dstack application IDs. */
export interface EnclaveTrustAnchors {
  kmsRootPubkey: Hex;
  appIds: readonly Hex[];
}

function emptyAnchor(): Readonly<EnclaveTrustAnchors> {
  return Object.freeze({
    kmsRootPubkey: EMPTY_HEX,
    appIds: Object.freeze([] as Hex[]),
  });
}

/** Fleet-provisioned trust anchors keyed by Vana chain ID. */
export const ENCLAVE_TRUST_ANCHORS: Readonly<
  Record<number, Readonly<EnclaveTrustAnchors>>
> = Object.freeze({
  // filled at fleet provisioning; verify fails closed while empty
  [VANA_MAINNET_CHAIN_ID]: emptyAnchor(),
  // filled at fleet provisioning; verify fails closed while empty
  [MOKSHA_CHAIN_ID]: emptyAnchor(),
});

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

function compressPublicKey(publicKey: Hex): Uint8Array {
  return secp256k1.ProjectivePoint.fromHex(
    fromHex(publicKey, "bytes"),
  ).toRawBytes(true);
}

function sameKey(a: Hex, b: Hex): boolean {
  return toHex(compressPublicKey(a)) === toHex(compressPublicKey(b));
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
 * Builds keccak256(utf8(purpose || ":" || lowercase hex(compressed pubkey))).
 *
 * Matches `dstack/guest-agent/src/rpc_service.rs:612-628`.
 */
export function appRootPreimage(purpose: string, publicKey: Hex): Hex {
  const keyHex = toHex(compressPublicKey(publicKey)).slice(2);
  return keccak256(toBytes(`${purpose}${PREIMAGE_SEPARATOR}${keyHex}`));
}

/**
 * Hashes the KMS prefix, raw app ID bytes, and compressed app-root public key.
 *
 * Matches `dstack/kms/src/crypto.rs:23-40`; there is no separator between the
 * raw 20-byte app ID and the compressed key.
 */
export function kmsIssuedPreimage(appId: Hex, appRootPublicKey: Hex): Hex {
  const prefix = concat([
    toBytes(`${KMS_ISSUED_PREFIX}${PREIMAGE_SEPARATOR}`),
    fromHex(appId, "bytes"),
  ]);
  const compressed = compressPublicKey(appRootPublicKey);

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
 * @param expected - Owner, chain, and epoch requested by the caller.
 *
 * @remarks
 * The dstack chain signs only `purpose || publicKey` and `appId || appRootPub`;
 * owner, chain and epoch are bound to the key by the TDX quote report_data
 * (`keccak256(userPsId || address)`), which v1 stores but does not verify
 * (DCAP is step 4). Until then the agent's derivation check is the backstop.
 * @throws When any identity binding or trust check fails.
 */
export async function verifyEnclaveIdentityEvidence(
  evidence: EnclaveIdentityEvidence,
  anchors: EnclaveTrustAnchors,
  expected: ExpectedIdentity,
): Promise<void> {
  if (evidence.v !== ENCLAVE_IDENTITY_EVIDENCE_VERSION) {
    throw new Error("Unsupported enclave identity evidence version");
  }

  if (!Number.isInteger(evidence.epoch) || evidence.epoch < 1) {
    throw new Error("Invalid enclave identity epoch");
  }

  if (evidence.chainId !== expected.chainId) {
    throw new Error(
      "Enclave identity chain ID does not match expected chain ID",
    );
  }

  if (!isAddressEqual(evidence.ownerAddress, expected.ownerAddress)) {
    throw new Error("Enclave identity owner does not match expected owner");
  }

  if (evidence.epoch !== expected.epoch) {
    throw new Error("Enclave identity epoch does not match expected epoch");
  }

  const expectedUserPsId = userPsId(expected.chainId, expected.ownerAddress);
  if (evidence.userPsId.toLowerCase() !== expectedUserPsId.toLowerCase()) {
    throw new Error("Enclave userPsId does not match expected identity");
  }

  if (evidence.purpose !== ENCLAVE_WALLET_PURPOSE) {
    throw new Error("Unexpected enclave wallet purpose");
  }

  if (anchors.kmsRootPubkey === EMPTY_HEX) {
    throw new Error("KMS root trust anchor is not provisioned");
  }

  assertUncompressedKey(evidence.publicKey);
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

  let matchesAnchor: boolean;
  try {
    matchesAnchor = sameKey(kmsRootPublicKey, anchors.kmsRootPubkey);
  } catch {
    throw new Error("KMS root trust anchor is malformed");
  }

  if (!matchesAnchor) {
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
 * @returns The authenticated plaintext delivery object.
 * @throws When the signature is malformed or does not belong to the owner.
 */
export async function buildMasterSignatureDelivery(
  evidence: EnclaveIdentityEvidence,
  masterSignature: Hex,
  now = Math.floor(Date.now() / 1000),
): Promise<MasterSignatureDelivery> {
  // Validate signature length and hex encoding before recovery.
  deriveMasterKey(masterSignature);
  const signerAddress = await recoverServerOwner(masterSignature);

  if (!isAddressEqual(signerAddress, evidence.ownerAddress)) {
    throw new Error("Master signature signer does not match evidence owner");
  }

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

/**
 * Encrypts a master-signature delivery in the SDK's ECIES wire format.
 *
 * @param delivery - Plaintext delivery object.
 * @param publicKey - Enclave 65-byte uncompressed public key.
 * @param ecies - Platform-specific ECIES provider.
 * @returns The 0x-prefixed serialized ciphertext.
 * @throws When the public key is malformed or belongs to another enclave.
 */
export async function encryptMasterSignatureDelivery(
  delivery: MasterSignatureDelivery,
  publicKey: Hex,
  ecies: ECIESProvider,
): Promise<Hex> {
  assertUncompressedKey(publicKey);

  if (!isAddressEqual(publicKeyToAddress(publicKey), delivery.enclaveAddress)) {
    throw new Error(
      "Public key does not belong to the delivery's enclave address",
    );
  }

  const plaintext = toBytes(JSON.stringify(delivery));
  const encrypted = await ecies.encrypt(fromHex(publicKey, "bytes"), plaintext);

  return `0x${serializeECIES(encrypted)}`;
}
