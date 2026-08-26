/**
 * Builder key abstraction shared by the Write API and lineage reads.
 *
 * @remarks
 * Everything the Personal Server asks a builder to sign is an EIP-191
 * `personal_sign` over a Web3Signed payload, so one `signMessage` callback is
 * the whole contract. {@link resolveWriteSigner} accepts the shapes a builder
 * already has: a viem `LocalAccount` (backend, `privateKeyToAccount`), a viem
 * `WalletClient` (browser wallet), or a bare `{ signMessage }` object.
 *
 * @category Protocol
 */

import type { Account, Address, Hex } from "viem";
import type { Web3SignedSignFn } from "../auth/web3-signed-builder";
import { WriteRequestError } from "../errors";

/** The signer the Write API drives: an EIP-191 signature over a string. */
export interface WriteSigner {
  /** The builder address, when known. Used for messages only. */
  address?: Address;
  /** EIP-191 (`personal_sign`) over the Web3Signed payload string. */
  signMessage: Web3SignedSignFn;
}

/** The subset of a viem `LocalAccount` the Write API uses. */
export interface ViemWriteAccount {
  address: Address;
  type: "local";
  signMessage(args: { message: string }): Promise<Hex>;
}

/** The subset of a viem `WalletClient` the Write API uses. */
export interface ViemWriteWalletClient {
  type?: string;
  account?: Account | undefined;
  signMessage(args: {
    account: Account | Address;
    message: string;
  }): Promise<Hex>;
}

/** Any signer {@link resolveWriteSigner} understands. */
export type WriteSignerSource =
  | WriteSigner
  | ViemWriteAccount
  | ViemWriteWalletClient;

export interface ResolveWriteSignerOptions {
  /**
   * Account to sign with when the viem wallet client has no hoisted account
   * (browser wallets). Ignored for other signer shapes.
   */
  account?: Account | Address;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isViemWriteAccount(source: unknown): source is ViemWriteAccount {
  return (
    isRecord(source) &&
    source.type === "local" &&
    typeof source.address === "string" &&
    typeof source.signMessage === "function"
  );
}

function isViemWriteWalletClient(
  source: unknown,
): source is ViemWriteWalletClient {
  return (
    isRecord(source) &&
    source.type === "walletClient" &&
    typeof source.signMessage === "function"
  );
}

function accountAddress(account: Account | Address): Address {
  return typeof account === "string" ? account : account.address;
}

/**
 * Normalise a builder key into a {@link WriteSigner}.
 *
 * @param source - A viem `LocalAccount`, a viem `WalletClient`, or a
 *   `{ signMessage }` object (returned as-is).
 * @param options - `account` for a wallet client without a hoisted account.
 * @returns A signer whose `signMessage` produces EIP-191 signatures.
 * @throws {WriteRequestError} When a wallet client has no account to sign
 *   with, or the source exposes no `signMessage` function.
 */
export function resolveWriteSigner(
  source: WriteSignerSource,
  options: ResolveWriteSignerOptions = {},
): WriteSigner {
  if (isViemWriteWalletClient(source)) {
    const account = options.account ?? source.account;
    if (account === undefined) {
      throw new WriteRequestError(
        "Viem wallet client requires an account option or account property",
      );
    }
    return {
      address: accountAddress(account),
      signMessage: (message) => source.signMessage({ account, message }),
    };
  }
  if (isViemWriteAccount(source)) {
    return {
      address: source.address,
      signMessage: (message) => source.signMessage({ message }),
    };
  }
  if (!isRecord(source) || typeof source.signMessage !== "function") {
    throw new WriteRequestError(
      "signer must be a viem LocalAccount, a viem WalletClient, or a { signMessage } object",
    );
  }
  return source as WriteSigner;
}
