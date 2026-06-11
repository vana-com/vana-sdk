/**
 * On-chain status mutation primitives for DataRegistryV2 data points.
 *
 * The v2 contract drops the file concept in favor of versioned data points
 * keyed on (owner, scope). Each data point has a lifecycle Status that the
 * owner can change directly — there's no EIP-712 signature flow and no
 * gateway endpoint that mediates this, because the contract enforces
 * `msg.sender == owner` for `setStatus`. The owner therefore has to sign
 * and broadcast the tx from their own wallet.
 *
 * These helpers are signer/transport-agnostic — they return the raw
 * `{to, data}` request object so callers can feed it to any wallet stack
 * (viem `sendTransaction`/`writeContract`, ethers, wallet-rpc, MPC,
 * Safe transactions, etc.). Mirrors the shape used by `escrow-deposit.ts`.
 *
 * @category Protocol
 */
import { encodeFunctionData } from "viem";
import type { DataPortabilityGatewayConfig } from "./eip712";

// Lifecycle states from IDataRegistryV2.Status. Wire encoding is uint8.
// - None: no data point exists for this (owner, scope).
// - Active: has data, served on /v1/escrow/pay's recordDataAccess path.
// - Inactive: owner-paused — refuses new versions until re-activated.
//   `addData` (or addDataWithSignature) auto-revives Inactive → Active.
// - Unavailable: terminal soft-delete — `addData` and recordDataAccess both
//   revert. The owner can still resurrect by calling setStatus(Active), but
//   that signals intent to bring the data point back online; a downstream
//   client treating Unavailable as a delete tombstone should re-fetch after
//   any DataPointStatusChanged event.
export enum DataPointStatus {
  None = 0,
  Active = 1,
  Inactive = 2,
  Unavailable = 3,
}

// Minimal ABI fragment for the owner-only `setStatus(scope, newStatus)`
// entry point. Kept inline so callers don't have to load the full contract
// ABI just to change a status.
export const DATA_REGISTRY_STATUS_ABI = [
  {
    type: "function",
    name: "setStatus",
    stateMutability: "nonpayable",
    inputs: [
      { name: "scope", type: "string" },
      { name: "newStatus", type: "uint8" },
    ],
    outputs: [],
  },
] as const;

export function dataRegistryContractAddress(
  config: DataPortabilityGatewayConfig,
): `0x${string}` {
  return config.contracts.dataRegistry as `0x${string}`;
}

export interface SetDataPointStatusInput {
  scope: string;
  status: DataPointStatus;
}

// Shape compatible with viem's `sendTransaction` / `writeContract` request
// objects. No `value` — `setStatus` is non-payable.
export interface DataPointStatusTransactionRequest {
  to: `0x${string}`;
  data: `0x${string}`;
}

export function encodeSetDataPointStatusData(
  input: SetDataPointStatusInput,
): `0x${string}` {
  return encodeFunctionData({
    abi: DATA_REGISTRY_STATUS_ABI,
    functionName: "setStatus",
    args: [input.scope, input.status],
  });
}

// Build the full tx request for a status change. Feed straight to
// `walletClient.sendTransaction({...req, account, chain})`. The caller's
// `account` MUST equal the data point's owner — the contract reverts
// otherwise.
export function buildSetDataPointStatusRequest(
  config: DataPortabilityGatewayConfig,
  input: SetDataPointStatusInput,
): DataPointStatusTransactionRequest {
  return {
    to: dataRegistryContractAddress(config),
    data: encodeSetDataPointStatusData(input),
  };
}

// Convenience for the "remove this data point" intent — the v2 equivalent
// of the old DELETE /v1/files/:id flow. Sets the status to Unavailable so
// downstream readers (recordDataAccess, future addData) revert. Callers
// that want the data point pausable rather than tombstoned should use
// `buildSetDataPointStatusRequest` with `DataPointStatus.Inactive`.
export function buildMarkDataPointUnavailableRequest(
  config: DataPortabilityGatewayConfig,
  input: { scope: string },
): DataPointStatusTransactionRequest {
  return buildSetDataPointStatusRequest(config, {
    scope: input.scope,
    status: DataPointStatus.Unavailable,
  });
}
