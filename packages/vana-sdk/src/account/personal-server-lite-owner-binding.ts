/**
 * Optional first-party Account integration for PS Lite owner binding.
 *
 * The PS Lite helper lives in `personal-server-lite/owner-binding`.
 * This module adapts any Account-style client exposing `getAddress` and
 * `signMessage` to the SDK owner-binding signature shape.
 *
 * @category Account
 */

import type { Address, Hex } from "viem";
import {
  buildPersonalServerLiteOwnerBindingMessage,
  PERSONAL_SERVER_LITE_OWNER_BINDING_PURPOSE,
  type PersonalServerLiteOwnerBindingSignature,
} from "../personal-server-lite/owner-binding";

export interface AccountPersonalServerLiteOwnerBindingClient {
  getAddress(): Promise<Address | null> | Address | null;
  signMessage(input: {
    message: ReturnType<typeof buildPersonalServerLiteOwnerBindingMessage>;
  }): Promise<Hex> | Hex;
}

export interface SignPersonalServerLiteOwnerBindingWithAccountClientConfig {
  client: AccountPersonalServerLiteOwnerBindingClient;
}

export class AccountPersonalServerLiteOwnerBindingError extends Error {
  code?: number | string;
  details?: unknown;

  constructor(input: {
    message: string;
    code?: number | string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "AccountPersonalServerLiteOwnerBindingError";
    this.code = input.code;
    this.details = input.details;
  }
}

export async function signPersonalServerLiteOwnerBindingWithAccountClient(
  config: SignPersonalServerLiteOwnerBindingWithAccountClientConfig,
): Promise<PersonalServerLiteOwnerBindingSignature> {
  let address: Address | null;
  try {
    address = await config.client.getAddress();
  } catch (error) {
    throw accountOwnerBindingError(error);
  }

  if (!address) {
    throw new AccountPersonalServerLiteOwnerBindingError({
      message: "Account did not return a wallet address",
      code: "account_address_required",
    });
  }

  const message = buildPersonalServerLiteOwnerBindingMessage(address);
  let signature: Hex;
  try {
    signature = await config.client.signMessage({ message });
  } catch (error) {
    throw accountOwnerBindingError(error);
  }

  return {
    signature,
    signerAddress: address,
    message,
    purpose: PERSONAL_SERVER_LITE_OWNER_BINDING_PURPOSE,
  };
}

function accountOwnerBindingError(
  error: unknown,
): AccountPersonalServerLiteOwnerBindingError {
  if (error instanceof AccountPersonalServerLiteOwnerBindingError) {
    return error;
  }

  const rpcError = error as
    | { code?: number | string; message?: string }
    | undefined;
  const code = rpcError?.code;
  const message =
    typeof rpcError?.message === "string" && rpcError.message.length > 0
      ? rpcError.message
      : "Account PS Lite owner-binding signature failed";

  return new AccountPersonalServerLiteOwnerBindingError({
    message,
    code,
    details: error,
  });
}
