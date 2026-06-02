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
 * Five operation kinds are wired up; each kind's name matches the
 * corresponding `payments.kind` column value on the gateway:
 *
 *   - 'grant_registration'   — one-time fee when a grant is first registered
 *                              (POST /v1/grants).
 *   - 'data_access'          — per-access surcharge on grant payments
 *                              (every accessRecord posted against a grant).
 *   - 'data_registration'    — one-time fee for registering a data point
 *                              (POST /v1/data → addDataWithSignature).
 *   - 'server_registration'  — one-time fee for registering a personal server
 *                              (POST /v1/servers).
 *   - 'builder_registration' — one-time fee for registering a builder
 *                              (POST /v1/builders; gateway-only, no on-chain
 *                              submission).
 *
 * Disabled or unregistered fees skip enforcement: the corresponding
 * operation settles WITHOUT requiring a payment from escrow. `getFee`
 * surfaces this via `enabled: false` rather than throwing — the gateway
 * itself treats a disabled fee as a steady state, not a misconfig.
 *
 * Deployers can override the on-chain operation strings via
 * `FEE_REGISTRY_<KIND>_OP` env vars on the gateway side; the matching
 * SDK escape hatch is the `opts.<kind>OpName` arguments.
 *
 * This module is signer/transport-agnostic — callers pass in their own
 * `PublicClient` for the contract reads. No caching here; long-running
 * service consumers should wrap with their own TTL. Mirrors
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

export type FeeKind =
  | "grant_registration"
  | "data_access"
  | "data_registration"
  | "server_registration"
  | "builder_registration";

/**
 * Map from a user-facing opType (POST /v1/escrow/pay body field, matches
 * the gateway's `payments.op_type` column) to the FeeKind that gates its
 * one-time registration fee.
 *
 * Data access is a per-call surcharge on grants only — it's not a
 * registration fee for any op, so it lives outside this map.
 */
export const REGISTRATION_KIND_FOR_OP: Record<string, FeeKind> = {
  grant: "grant_registration",
  data: "data_registration",
  server: "server_registration",
  builder: "builder_registration",
};

export interface FeeEntry {
  amount: bigint;
  // Asset the fee is denominated in. 0x0000…0000 = native VANA; anything
  // else is an ERC-20 contract address.
  asset: Address;
  // The recipient the on-chain settle pass routes the fee to. Only
  // meaningful when `enabled` — disabled fees never land as a SettleOp `to`.
  payee: Address;
  enabled: boolean;
}

/**
 * Compound fee schedule for one op type, mirroring the gateway's
 * lib/op-fees.ts `OpFee`. For ANY op type, `registrationFee` is the
 * one-time fee charged at registration. For `'grant'` only, `dataAccessFee`
 * is the per-access surcharge — for any other op type it's always 0n with
 * `dataAccessEnabled: false`.
 *
 * `xxxEnabled` reflects the on-chain `Fee.enabled` flag. When OFF, the
 * corresponding amount is 0 and the pay handler should NOT require
 * payment for that kind. When both are off (for a grant) or registration
 * is off (for any other op type), the entire payment flow is skipped —
 * the op settles directly via the no-payment path.
 */
export interface OpFee {
  // Asset for whichever components are enabled. Falls back to native VANA
  // (0x0) when both components are disabled. The pay handler enforces that
  // the payer's `asset` matches.
  asset: Address;
  registrationFee: bigint;
  dataAccessFee: bigint;
  registrationEnabled: boolean;
  dataAccessEnabled: boolean;
  // Surfaced for the SDK's on-chain log-filter use case; the gateway's
  // OpFee type doesn't include these but the SDK keeps them since callers
  // sizing on-chain assertions need to know where the fee lands. Equal to
  // the zero address when the corresponding kind is disabled.
  registrationPayee: Address;
  dataAccessPayee: Address;
}

export interface FeeRegistryOptions {
  grantRegistrationOpName?: string;
  dataAccessOpName?: string;
  dataRegistrationOpName?: string;
  serverRegistrationOpName?: string;
  builderRegistrationOpName?: string;
}

function operationNameFor(
  kind: FeeKind,
  opts: FeeRegistryOptions | undefined,
): string {
  switch (kind) {
    case "grant_registration":
      return opts?.grantRegistrationOpName ?? "grant_registration";
    case "data_access":
      return opts?.dataAccessOpName ?? "data_access";
    case "data_registration":
      return opts?.dataRegistrationOpName ?? "data_registration";
    case "server_registration":
      return opts?.serverRegistrationOpName ?? "server_registration";
    case "builder_registration":
      return opts?.builderRegistrationOpName ?? "builder_registration";
  }
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/**
 * Reads one fee kind from the FeeRegistry. Calls the contract's
 * `operationKey(name)` first to derive the bytes32 key — matches the
 * gateway's approach exactly (could compute locally via keccak256, but
 * going through the contract eliminates any chance of encoding drift).
 *
 * Returns `{enabled: false}` entries WITHOUT throwing — disabled is a
 * valid steady state on the gateway. The only validation is the
 * zero-payee check, and that only fires when the fee is enabled
 * (a disabled fee never lands as a SettleOp `to`).
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

  if (fee.enabled && fee.payee === ZERO_ADDRESS) {
    throw new Error(
      `FeeRegistry: enabled operation "${opName}" has zero-address payee — contract pre-flight rejects payouts to 0x0`,
    );
  }

  return fee;
}

/**
 * Convenience: combine the FeeRegistry reads for one op type into the
 * compound shape the pay handler validates against.
 *
 * For 'grant' opType the result includes both registration + data_access
 * components; for other op types data_access is always disabled with
 * amount=0. Disabled components contribute 0 to the signed total —
 * callers compute `amount = registrationFee + dataAccessFee` and the pay
 * handler accepts (or short-circuits with 'Payment not required' when
 * both are 0).
 *
 * Throws on asset mismatch ONLY when both components are enabled — a
 * disabled fee never lands as a SettleOp, so its asset is moot.
 */
export async function getOpFee(
  client: PublicClient,
  config: DataPortabilityGatewayConfig,
  opType: string,
  opts?: FeeRegistryOptions,
): Promise<OpFee> {
  const registrationKind = REGISTRATION_KIND_FOR_OP[opType];
  if (!registrationKind) {
    throw new Error(
      `getOpFee: unknown opType "${opType}" — supported types are ${Object.keys(REGISTRATION_KIND_FOR_OP).join(", ")}`,
    );
  }

  const includeDataAccess = opType === "grant";
  const [registration, dataAccess] = await Promise.all([
    getFee(client, config, registrationKind, opts),
    includeDataAccess
      ? getFee(client, config, "data_access", opts)
      : Promise.resolve<FeeEntry>({
          amount: 0n,
          asset: ZERO_ADDRESS,
          payee: ZERO_ADDRESS,
          enabled: false,
        }),
  ]);

  if (
    registration.enabled &&
    dataAccess.enabled &&
    registration.asset.toLowerCase() !== dataAccess.asset.toLowerCase()
  ) {
    throw new Error(
      `FeeRegistry asset mismatch for "${opType}": registration=${registration.asset} vs data_access=${dataAccess.asset}. The gateway requires both kinds to settle in the same asset when both are enabled.`,
    );
  }

  const asset = registration.enabled
    ? registration.asset
    : dataAccess.enabled
      ? dataAccess.asset
      : ZERO_ADDRESS;

  return {
    asset,
    registrationFee: registration.enabled ? registration.amount : 0n,
    dataAccessFee: dataAccess.enabled ? dataAccess.amount : 0n,
    registrationEnabled: registration.enabled,
    dataAccessEnabled: dataAccess.enabled,
    registrationPayee: registration.enabled ? registration.payee : ZERO_ADDRESS,
    dataAccessPayee: dataAccess.enabled ? dataAccess.payee : ZERO_ADDRESS,
  };
}
