/**
 * PS Lite owner-binding message and signing helpers.
 *
 * PS Lite uses this replayable personal-sign message as a wallet-owned input
 * for opening the user's local encrypted runtime. This is intentionally
 * separate from Personal Server registration, which is EIP-712 typed data.
 *
 * @category Protocol
 */

import {
  isAddress,
  type Account,
  type Address,
  type Hex,
  type SignableMessage,
} from "viem";

export const PERSONAL_SERVER_LITE_OWNER_BINDING_VERSION = "vana.account.v1";
export const PERSONAL_SERVER_LITE_OWNER_BINDING_PURPOSE = "ps-lite-owner";
export const PERSONAL_SERVER_LITE_OWNER_BINDING_PREFIX =
  `${PERSONAL_SERVER_LITE_OWNER_BINDING_VERSION}:${PERSONAL_SERVER_LITE_OWNER_BINDING_PURPOSE}:` as const;

export type PersonalServerLiteOwnerBindingPurpose =
  typeof PERSONAL_SERVER_LITE_OWNER_BINDING_PURPOSE;

export type PersonalServerLiteOwnerBindingMessage =
  `${typeof PERSONAL_SERVER_LITE_OWNER_BINDING_PREFIX}${Lowercase<Address>}`;

export interface PersonalServerLiteOwnerBindingSigner {
  address: Address;
  signMessage(input: {
    message: PersonalServerLiteOwnerBindingMessage;
  }): Promise<Hex> | Hex;
}

export interface ViemPersonalServerLiteOwnerBindingWalletClient {
  account?: Account | Address | null;
  signMessage(input: {
    account?: Account | Address;
    message: SignableMessage;
  }): Promise<Hex>;
}

export type ViemPersonalServerLiteOwnerBindingSignerSource =
  | PersonalServerLiteOwnerBindingSigner
  | ViemPersonalServerLiteOwnerBindingWalletClient;

export interface BuildPersonalServerLiteOwnerBindingSignatureInput {
  signer: PersonalServerLiteOwnerBindingSigner;
}

export interface PersonalServerLiteOwnerBindingSignature {
  signature: Hex;
  signerAddress: Address;
  message: PersonalServerLiteOwnerBindingMessage;
  purpose: PersonalServerLiteOwnerBindingPurpose;
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

function isPersonalServerLiteOwnerBindingSigner(
  source: ViemPersonalServerLiteOwnerBindingSignerSource,
): source is PersonalServerLiteOwnerBindingSigner {
  return "address" in source && typeof source.signMessage === "function";
}

export function buildPersonalServerLiteOwnerBindingMessage(
  ownerAddress: Address,
): PersonalServerLiteOwnerBindingMessage {
  assertAddress(ownerAddress, "ownerAddress");
  return `${PERSONAL_SERVER_LITE_OWNER_BINDING_PREFIX}${ownerAddress.toLowerCase()}` as PersonalServerLiteOwnerBindingMessage;
}

export function createViemPersonalServerLiteOwnerBindingSigner(
  source: ViemPersonalServerLiteOwnerBindingSignerSource,
  options: { account?: Account | Address } = {},
): PersonalServerLiteOwnerBindingSigner {
  if (isPersonalServerLiteOwnerBindingSigner(source)) {
    return source;
  }

  const accountAddress =
    getAccountAddress(options.account) ?? getAccountAddress(source.account);

  if (accountAddress) {
    return {
      address: accountAddress,
      signMessage: ({ message }) =>
        source.signMessage({
          account: options.account ?? source.account ?? accountAddress,
          message,
        }),
    };
  }

  throw new Error(
    "Viem wallet client requires an account option or account property",
  );
}

export async function buildPersonalServerLiteOwnerBindingSignature(
  input: BuildPersonalServerLiteOwnerBindingSignatureInput,
): Promise<PersonalServerLiteOwnerBindingSignature> {
  const message = buildPersonalServerLiteOwnerBindingMessage(
    input.signer.address,
  );
  const signature = await input.signer.signMessage({ message });

  return {
    signature,
    signerAddress: input.signer.address,
    message,
    purpose: PERSONAL_SERVER_LITE_OWNER_BINDING_PURPOSE,
  };
}

export const signPersonalServerLiteOwnerBinding =
  buildPersonalServerLiteOwnerBindingSignature;
