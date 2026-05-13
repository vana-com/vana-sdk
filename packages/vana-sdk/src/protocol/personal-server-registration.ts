/**
 * Personal Server registration typed-data and signing helpers.
 *
 * These helpers are protocol-owned and runtime-neutral. Apps can sign with
 * viem local accounts, wallet clients, Account products, or any equivalent
 * signer by adapting to {@link PersonalServerRegistrationSigner}.
 *
 * @category Protocol
 */

import {
  isAddress,
  type Account,
  type Address,
  type Hex,
  type TypedDataDomain,
  type TypedDataDefinition,
} from "viem";
import {
  SERVER_REGISTRATION_TYPES,
  serverRegistrationDomain,
  type DataPortabilityGatewayConfig,
  type ServerRegistrationMessage,
} from "./eip712";

export const PERSONAL_SERVER_REGISTRATION_INTENT =
  "personal_server.server_registration.v1" as const;

export const PERSONAL_SERVER_REGISTRATION_DEFAULT_CHAIN_ID = 1480;
export const PERSONAL_SERVER_REGISTRATION_DEFAULT_VERIFYING_CONTRACT =
  "0x1483B1F634DBA75AeaE60da7f01A679aabd5ee2c" as const;

export type PersonalServerRegistrationIntent =
  typeof PERSONAL_SERVER_REGISTRATION_INTENT;

export type PersonalServerRegistrationTypedData = TypedDataDefinition<
  typeof SERVER_REGISTRATION_TYPES,
  "ServerRegistration"
> & {
  message: ServerRegistrationMessage;
};

export interface PersonalServerRegistrationSigner {
  address: Address;
  signTypedData(
    typedData: PersonalServerRegistrationTypedData,
  ): Promise<Hex> | Hex;
}

export interface ViemPersonalServerRegistrationWalletClient {
  account?: Account | Address | null;
  signTypedData(
    typedData: PersonalServerRegistrationTypedData & {
      account?: Account | Address;
    },
  ): Promise<Hex>;
}

export type ViemPersonalServerRegistrationSignerSource =
  | PersonalServerRegistrationSigner
  | ViemPersonalServerRegistrationWalletClient;

export interface BuildPersonalServerRegistrationTypedDataInput {
  ownerAddress: Address;
  serverAddress: Address;
  serverPublicKey: string;
  serverUrl: string;
  config?: DataPortabilityGatewayConfig;
  chainId?: number;
  verifyingContract?: Address;
}

export interface BuildPersonalServerRegistrationSignatureInput {
  signer: PersonalServerRegistrationSigner;
  serverAddress: Address;
  serverPublicKey: string;
  serverUrl: string;
  config?: DataPortabilityGatewayConfig;
  chainId?: number;
  verifyingContract?: Address;
}

export interface PersonalServerRegistrationSignature {
  signature: Hex;
  signerAddress: Address;
  typedData: PersonalServerRegistrationTypedData;
  intent: PersonalServerRegistrationIntent;
}

export interface PersonalServerRegistrationDomainInput {
  config?: DataPortabilityGatewayConfig;
  chainId?: number;
  verifyingContract?: Address;
}

function assertAddress(value: Address, name: string): void {
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid EVM address`);
  }
}

function getAccountAddress(
  account: Account | Address | null | undefined,
): Address | undefined {
  if (!account) {
    return undefined;
  }

  return typeof account === "string" ? account : account.address;
}

function isPersonalServerRegistrationSigner(
  source: ViemPersonalServerRegistrationSignerSource,
): source is PersonalServerRegistrationSigner {
  return "address" in source && typeof source.signTypedData === "function";
}

export function createViemPersonalServerRegistrationSigner(
  source: ViemPersonalServerRegistrationSignerSource,
  options: { account?: Account | Address } = {},
): PersonalServerRegistrationSigner {
  if (isPersonalServerRegistrationSigner(source)) {
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

export function personalServerRegistrationDomain(
  input: PersonalServerRegistrationDomainInput = {},
): TypedDataDomain {
  if (input.config) {
    return serverRegistrationDomain(input.config);
  }

  const verifyingContract =
    input.verifyingContract ??
    PERSONAL_SERVER_REGISTRATION_DEFAULT_VERIFYING_CONTRACT;
  assertAddress(verifyingContract, "verifyingContract");

  return {
    name: "Vana Data Portability",
    version: "1",
    chainId: input.chainId ?? PERSONAL_SERVER_REGISTRATION_DEFAULT_CHAIN_ID,
    verifyingContract,
  };
}

export function buildPersonalServerRegistrationTypedData(
  input: BuildPersonalServerRegistrationTypedDataInput,
): PersonalServerRegistrationTypedData {
  assertAddress(input.ownerAddress, "ownerAddress");
  assertAddress(input.serverAddress, "serverAddress");

  return {
    domain: personalServerRegistrationDomain(input),
    types: SERVER_REGISTRATION_TYPES,
    primaryType: "ServerRegistration",
    message: {
      ownerAddress: input.ownerAddress,
      serverAddress: input.serverAddress,
      publicKey: input.serverPublicKey,
      serverUrl: input.serverUrl,
    },
  };
}

export async function buildPersonalServerRegistrationSignature(
  input: BuildPersonalServerRegistrationSignatureInput,
): Promise<PersonalServerRegistrationSignature> {
  const typedData = buildPersonalServerRegistrationTypedData({
    ownerAddress: input.signer.address,
    serverAddress: input.serverAddress,
    serverPublicKey: input.serverPublicKey,
    serverUrl: input.serverUrl,
    config: input.config,
    chainId: input.chainId,
    verifyingContract: input.verifyingContract,
  });
  const signature = await input.signer.signTypedData(typedData);

  return {
    signature,
    signerAddress: input.signer.address,
    typedData,
    intent: PERSONAL_SERVER_REGISTRATION_INTENT,
  };
}

export const registerPersonalServerSignature =
  buildPersonalServerRegistrationSignature;
