/**
 * Personal Server deregistration (revoke) typed-data and signing helpers.
 *
 * Mirrors {@link ./personal-server-registration} for the inverse operation.
 * These helpers are protocol-owned and runtime-neutral. Apps can sign with
 * viem local accounts, wallet clients, Account products, or any equivalent
 * signer by adapting to {@link PersonalServerDeregistrationSigner}.
 *
 * The typed data matches the data-gateway `ServerDeregistration` payload
 * (`DELETE /v1/servers/:address`). Deregistration is **owner-only**: the
 * recovered signer must equal the owner that registered the server; the gateway
 * rejects server-key delegation.
 *
 * @category Protocol
 */

import {
  isAddress,
  isHex,
  size,
  type Account,
  type Address,
  type Hex,
  type TypedDataDomain,
  type TypedDataDefinition,
} from "viem";
import {
  SERVER_DEREGISTRATION_TYPES,
  serverDeregistrationDomain,
  type DataPortabilityGatewayConfig,
  type ServerDeregistrationMessage,
} from "./eip712";

export const PERSONAL_SERVER_DEREGISTRATION_DEFAULT_CHAIN_ID = 1480;
export const PERSONAL_SERVER_DEREGISTRATION_DEFAULT_VERIFYING_CONTRACT =
  "0x1483B1F634DBA75AeaE60da7f01A679aabd5ee2c" as const;
/** Default validity window (seconds) for a deregistration signature. */
export const PERSONAL_SERVER_DEREGISTRATION_DEFAULT_TTL_SECONDS = 300;

export type PersonalServerDeregistrationTypedData = TypedDataDefinition<
  typeof SERVER_DEREGISTRATION_TYPES,
  "ServerDeregistration"
> & {
  message: ServerDeregistrationMessage;
};

export interface PersonalServerDeregistrationSigner {
  address: Address;
  signTypedData(
    typedData: PersonalServerDeregistrationTypedData,
  ): Promise<Hex> | Hex;
}

export interface ViemPersonalServerDeregistrationWalletClient {
  account?: Account | Address | null;
  signTypedData(
    typedData: PersonalServerDeregistrationTypedData & {
      account?: Account | Address;
    },
  ): Promise<Hex>;
}

export type ViemPersonalServerDeregistrationSignerSource =
  | PersonalServerDeregistrationSigner
  | ViemPersonalServerDeregistrationWalletClient;

export interface BuildPersonalServerDeregistrationTypedDataInput {
  ownerAddress: Address;
  serverAddress: Address;
  /** The server record's id (bytes32) from `GatewayClient.getServer().id`. */
  serverId: Hex;
  /** Unix timestamp (seconds) after which the signature expires. */
  deadline: bigint | number;
  config?: DataPortabilityGatewayConfig;
  chainId?: number;
  verifyingContract?: Address;
}

export interface BuildPersonalServerDeregistrationSignatureInput {
  signer: PersonalServerDeregistrationSigner;
  serverAddress: Address;
  serverId: Hex;
  deadline: bigint | number;
  config?: DataPortabilityGatewayConfig;
  chainId?: number;
  verifyingContract?: Address;
}

export interface PersonalServerDeregistrationSignature {
  signature: Hex;
  signerAddress: Address;
  /** The deadline used, echoed as a number for the gateway request body. */
  deadline: number;
  typedData: PersonalServerDeregistrationTypedData;
}

export interface PersonalServerDeregistrationDomainInput {
  config?: DataPortabilityGatewayConfig;
  chainId?: number;
  verifyingContract?: Address;
}

function assertAddress(value: Address, name: string): void {
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid EVM address`);
  }
}

function assertServerId(value: Hex): void {
  if (!isHex(value) || size(value) !== 32) {
    throw new Error("serverId must be a 32-byte (bytes32) hex string");
  }
}

function normalizeDeadline(deadline: bigint | number): bigint {
  const value = typeof deadline === "bigint" ? deadline : BigInt(deadline);
  if (value <= 0n) {
    throw new Error("deadline must be a positive Unix timestamp (seconds)");
  }
  return value;
}

function getAccountAddress(
  account: Account | Address | null | undefined,
): Address | undefined {
  if (!account) {
    return undefined;
  }

  return typeof account === "string" ? account : account.address;
}

function isPersonalServerDeregistrationSigner(
  source: ViemPersonalServerDeregistrationSignerSource,
): source is PersonalServerDeregistrationSigner {
  return "address" in source && typeof source.signTypedData === "function";
}

/**
 * Compute a deregistration deadline (Unix seconds) `ttlSeconds` in the future.
 * Pure: the caller supplies `nowSeconds` so the result stays deterministic and
 * testable (no hidden `Date.now()`).
 */
export function personalServerDeregistrationDeadline(
  nowSeconds: number,
  ttlSeconds: number = PERSONAL_SERVER_DEREGISTRATION_DEFAULT_TTL_SECONDS,
): number {
  return Math.floor(nowSeconds) + ttlSeconds;
}

export function createViemPersonalServerDeregistrationSigner(
  source: ViemPersonalServerDeregistrationSignerSource,
  options: { account?: Account | Address } = {},
): PersonalServerDeregistrationSigner {
  if (isPersonalServerDeregistrationSigner(source)) {
    return source;
  }

  const accountAddress =
    getAccountAddress(options.account) ?? getAccountAddress(source.account);

  if (accountAddress) {
    return {
      address: accountAddress,
      signTypedData: (typedData) =>
        source.signTypedData({
          ...typedData,
          account: options.account ?? source.account ?? accountAddress,
        }),
    };
  }

  throw new Error(
    "Viem wallet client requires an account option or account property",
  );
}

export function personalServerDeregistrationDomain(
  input: PersonalServerDeregistrationDomainInput = {},
): TypedDataDomain {
  if (input.config) {
    return serverDeregistrationDomain(input.config);
  }

  const verifyingContract =
    input.verifyingContract ??
    PERSONAL_SERVER_DEREGISTRATION_DEFAULT_VERIFYING_CONTRACT;
  assertAddress(verifyingContract, "verifyingContract");

  return {
    name: "Vana Data Portability",
    version: "1",
    chainId: input.chainId ?? PERSONAL_SERVER_DEREGISTRATION_DEFAULT_CHAIN_ID,
    verifyingContract,
  };
}

export function buildPersonalServerDeregistrationTypedData(
  input: BuildPersonalServerDeregistrationTypedDataInput,
): PersonalServerDeregistrationTypedData {
  assertAddress(input.ownerAddress, "ownerAddress");
  assertAddress(input.serverAddress, "serverAddress");
  assertServerId(input.serverId);

  return {
    domain: personalServerDeregistrationDomain(input),
    types: SERVER_DEREGISTRATION_TYPES,
    primaryType: "ServerDeregistration",
    message: {
      ownerAddress: input.ownerAddress,
      serverAddress: input.serverAddress,
      serverId: input.serverId,
      deadline: normalizeDeadline(input.deadline),
    },
  };
}

export async function buildPersonalServerDeregistrationSignature(
  input: BuildPersonalServerDeregistrationSignatureInput,
): Promise<PersonalServerDeregistrationSignature> {
  const typedData = buildPersonalServerDeregistrationTypedData({
    ownerAddress: input.signer.address,
    serverAddress: input.serverAddress,
    serverId: input.serverId,
    deadline: input.deadline,
    config: input.config,
    chainId: input.chainId,
    verifyingContract: input.verifyingContract,
  });
  const signature = await input.signer.signTypedData(typedData);

  return {
    signature,
    signerAddress: input.signer.address,
    deadline: Number(typedData.message.deadline),
    typedData,
  };
}

export const deregisterPersonalServerSignature =
  buildPersonalServerDeregistrationSignature;
