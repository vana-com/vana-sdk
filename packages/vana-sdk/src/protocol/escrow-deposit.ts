/**
 * On-chain deposit primitives for the DataPortabilityEscrow contract.
 *
 * The escrow holds the finalized balance that `/v1/escrow/pay` debits against.
 * A payer credits their balance by sending one of two function calls to the
 * escrow contract — depositNative (native VANA, amount via `msg.value`) or
 * depositToken (ERC-20, caller must `approve` the escrow first). The credited
 * `account` need not equal `msg.sender`, so a third party can fund someone
 * else's escrow.
 *
 * Once the on-chain tx lands, call `GatewayClient.submitEscrowDeposit({txHash})`
 * to announce it; the gateway reconciles it into the balance and surfaces it
 * under `getEscrowBalance(account).deposits.finalized`.
 *
 * These helpers are signer/transport-agnostic — they return the raw
 * `{to, data, value?}` request object so callers can feed it to any wallet
 * stack (viem `sendTransaction`/`writeContract`, ethers, wallet-rpc, MPC,
 * Safe transactions, etc.).
 *
 * @category Protocol
 */
import { encodeFunctionData } from "viem";
import type { DataPortabilityGatewayConfig } from "./eip712";

// ABI for the two deposit entry points on DataPortabilityEscrow. Same shape
// the gateway uses to decode pending/mined tx calldata at
// /v1/escrow/deposit time (data-gateway/lib/escrow.ts:39).
export const ESCROW_DEPOSIT_ABI = [
  {
    type: "function",
    name: "depositNative",
    stateMutability: "payable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "depositToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export function escrowContractAddress(
  config: DataPortabilityGatewayConfig,
): `0x${string}` {
  return config.contracts.dataPortabilityEscrow as `0x${string}`;
}

export interface DepositNativeInput {
  // Address credited inside the escrow. Often the same as the wallet sending
  // the tx, but third-party funding is supported.
  account: `0x${string}`;
  amount: bigint;
}

export interface DepositTokenInput {
  account: `0x${string}`;
  // ERC-20 contract address.
  token: `0x${string}`;
  amount: bigint;
}

// Shape compatible with viem's `sendTransaction` / `writeContract` request
// objects. `value` is omitted on the ERC-20 path because the amount lives in
// the token contract, not `msg.value`.
export interface DepositTransactionRequest {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}

export function encodeDepositNativeData(input: {
  account: `0x${string}`;
}): `0x${string}` {
  return encodeFunctionData({
    abi: ESCROW_DEPOSIT_ABI,
    functionName: "depositNative",
    args: [input.account],
  });
}

export function encodeDepositTokenData(
  input: DepositTokenInput,
): `0x${string}` {
  return encodeFunctionData({
    abi: ESCROW_DEPOSIT_ABI,
    functionName: "depositToken",
    args: [input.account, input.token, input.amount],
  });
}

// Build the full tx request for a native-VANA deposit. Feed it straight to
// `walletClient.sendTransaction({...req, account, chain})`. ERC-20 needs a
// prior `approve(escrow, amount)` on the token — use viem's built-in
// `erc20Abi` for that; the SDK doesn't bundle one to avoid the import surface.
export function buildDepositNativeRequest(
  config: DataPortabilityGatewayConfig,
  input: DepositNativeInput,
): DepositTransactionRequest {
  return {
    to: escrowContractAddress(config),
    data: encodeDepositNativeData({ account: input.account }),
    value: input.amount,
  };
}

export function buildDepositTokenRequest(
  config: DataPortabilityGatewayConfig,
  input: DepositTokenInput,
): DepositTransactionRequest {
  return {
    to: escrowContractAddress(config),
    data: encodeDepositTokenData(input),
  };
}
