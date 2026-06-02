/**
 * Adapter for the on-chain FeeRegistry contract — the source of truth the
 * gateway re-reads on every /v1/escrow/pay to size the payment amount.
 *
 * The registry stores per-operation `{amount, asset, payee, enabled}`
 * records keyed on `keccak256(name)`. SDK consumers (builders sizing
 * payments) MUST read fees from this contract rather than hardcoding
 * them, or the signed `amount` won't match the gateway's expected total
 * and /v1/escrow/pay returns 400.
 *
 * Two operation names are wired up today:
 *   - 'registration' — one-time fee charged the first time a payment
 *     lands for a grant in 'pending' payment_status.
 *   - 'data_access'  — per-access fee charged every accepted payment.
 *
 * Deployers can override the on-chain operation names via the gateway's
 * FEE_REGISTRY_REGISTRATION_OP / FEE_REGISTRY_DATA_ACCESS_OP env vars;
 * the matching SDK escape hatch is the `opts.registrationOpName` /
 * `opts.dataAccessOpName` arguments.
 *
 * This module is signer/transport-agnostic — callers pass in their own
 * `PublicClient` for the contract reads. No caching here; a long-running
 * service consumer should wrap with their own TTL. Mirrors
 * data-gateway/lib/fee-registry.ts byte-for-byte.
 *
 * @category Protocol
 */
import { parseAbi, type Address, type Hex, type PublicClient } from "viem";
import type { DataPortabilityGatewayConfig } from "./eip712";

export const FEE_REGISTRY_ABI = parseAbi([
  "struct Fee { uint256 amount; address asset; address payee; bool enabled; }",
  "function fees(bytes32 operation) view returns (Fee)",
  "function operationKey(string name) pure returns (bytes32)",
]);

export type FeeKind = "registration" | "data_access";

export interface FeeEntry {
  amount: bigint;
  // Asset the fee is denominated in. 0x0000…0000 = native VANA;
  // anything else is an ERC-20 contract address.
  asset: Address;
  // The recipient the on-chain settle pass routes the fee to.
  payee: Address;
  enabled: boolean;
}

// Combined view that mirrors data-gateway/lib/op-fees.ts. Throws if the two
// kinds disagree on `asset` because the pay handler accepts a single
// `asset` on the payment payload — both fees must settle in the same one.
// Payees can differ (registration → one treasury, data-access → another).
export interface OpFee {
  asset: Address;
  registrationFee: bigint;
  dataAccessFee: bigint;
  registrationPayee: Address;
  dataAccessPayee: Address;
}

export interface FeeRegistryOptions {
  registrationOpName?: string;
  dataAccessOpName?: string;
}

function operationNameFor(
  kind: FeeKind,
  opts: FeeRegistryOptions | undefined,
): string {
  if (kind === "registration") {
    return opts?.registrationOpName ?? "registration";
  }
  return opts?.dataAccessOpName ?? "data_access";
}

/**
 * Reads one fee kind from the FeeRegistry. Calls the contract's
 * `operationKey(name)` first to derive the bytes32 key — matches the
 * gateway's approach exactly (could compute locally via keccak256, but
 * going through the contract eliminates any chance of encoding drift).
 *
 * Throws when:
 *  - the fee record's `enabled` flag is false (operator hasn't set it),
 *  - or the `payee` is the zero address (the contract's settle pre-flight
 *    rejects payouts to 0x0; surfacing it early gives a better error).
 */
export async function getFee(
  client: PublicClient,
  config: DataPortabilityGatewayConfig,
  kind: FeeKind,
  opts?: FeeRegistryOptions,
): Promise<FeeEntry> {
  const address = config.contracts.feeRegistry as Address;
  const opName = operationNameFor(kind, opts);

  const opKey = (await client.readContract({
    address,
    abi: FEE_REGISTRY_ABI,
    functionName: "operationKey",
    args: [opName],
  })) as Hex;

  const fee = (await client.readContract({
    address,
    abi: FEE_REGISTRY_ABI,
    functionName: "fees",
    args: [opKey],
  })) as FeeEntry;

  if (!fee.enabled) {
    throw new Error(
      `FeeRegistry: operation "${opName}" (kind=${kind}) is not enabled — operator must call setFeeByName before payments will validate`,
    );
  }
  if (fee.payee === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      `FeeRegistry: operation "${opName}" has zero-address payee — contract pre-flight rejects payouts to 0x0`,
    );
  }

  return fee;
}

/**
 * Convenience: read both fee kinds and combine into the shape the pay
 * handler validates against. Throws if the two kinds disagree on asset
 * (the gateway requires both to settle in the same one).
 *
 * Builders use this at startup, then sign `amount = registrationFee +
 * dataAccessFee` for the first grant payment and `amount = dataAccessFee`
 * for subsequent ones.
 */
export async function getOpFee(
  client: PublicClient,
  config: DataPortabilityGatewayConfig,
  opts?: FeeRegistryOptions,
): Promise<OpFee> {
  const [registration, dataAccess] = await Promise.all([
    getFee(client, config, "registration", opts),
    getFee(client, config, "data_access", opts),
  ]);
  if (registration.asset.toLowerCase() !== dataAccess.asset.toLowerCase()) {
    throw new Error(
      `FeeRegistry asset mismatch: registration=${registration.asset} vs data_access=${dataAccess.asset}. The gateway requires both fees to settle in the same asset.`,
    );
  }
  return {
    asset: registration.asset,
    registrationFee: registration.amount,
    dataAccessFee: dataAccess.amount,
    registrationPayee: registration.payee,
    dataAccessPayee: dataAccess.payee,
  };
}
