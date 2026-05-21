/**
 * EIP-712 domain and type builders for Data Portability protocol writes.
 *
 * These helpers are shared primitives only. Personal Server runtimes own when
 * to sign and submit these payloads.
 *
 * @category Protocol
 */

import type { TypedDataDomain } from "viem";

const DOMAIN_NAME = "Vana Data Portability";
const DOMAIN_VERSION = "1";

export interface DataPortabilityContracts {
  dataRegistry: string;
  dataPortabilityPermissions: string;
  dataPortabilityServer: string;
  dataPortabilityGrantees: string;
  // DataPortabilityEscrow — verifies GENERIC_PAYMENT_TYPES signatures backing
  // /v1/escrow/pay (the data-access payment path).
  dataPortabilityEscrow: string;
}

// Native VANA asset sentinel used by /v1/escrow/pay's `asset` field — pay any
// other ERC-20 by passing its contract address instead.
export const NATIVE_VANA_ASSET =
  "0x0000000000000000000000000000000000000000" as const;

export interface DataPortabilityGatewayConfig {
  chainId: number;
  contracts: DataPortabilityContracts;
}

function buildDomain(
  chainId: number,
  verifyingContract: `0x${string}`,
): TypedDataDomain {
  return {
    name: DOMAIN_NAME,
    version: DOMAIN_VERSION,
    chainId,
    verifyingContract,
  };
}

export function fileRegistrationDomain(
  config: DataPortabilityGatewayConfig,
): TypedDataDomain {
  return buildDomain(
    config.chainId,
    config.contracts.dataRegistry as `0x${string}`,
  );
}

export function grantRegistrationDomain(
  config: DataPortabilityGatewayConfig,
): TypedDataDomain {
  return buildDomain(
    config.chainId,
    config.contracts.dataPortabilityPermissions as `0x${string}`,
  );
}

export function grantRevocationDomain(
  config: DataPortabilityGatewayConfig,
): TypedDataDomain {
  return buildDomain(
    config.chainId,
    config.contracts.dataPortabilityPermissions as `0x${string}`,
  );
}

export function serverRegistrationDomain(
  config: DataPortabilityGatewayConfig,
): TypedDataDomain {
  return buildDomain(
    config.chainId,
    config.contracts.dataPortabilityServer as `0x${string}`,
  );
}

export function builderRegistrationDomain(
  config: DataPortabilityGatewayConfig,
): TypedDataDomain {
  return buildDomain(
    config.chainId,
    config.contracts.dataPortabilityGrantees as `0x${string}`,
  );
}

// Domain for the generic-payment EIP-712 signature consumed by
// /v1/escrow/pay. The verifyingContract is the escrow itself (not the per-op
// contract), so a single signature debits the payer's escrow balance for any
// supported op — `grant` today; file/builder/schema in the future.
export function escrowPaymentDomain(
  config: DataPortabilityGatewayConfig,
): TypedDataDomain {
  return buildDomain(
    config.chainId,
    config.contracts.dataPortabilityEscrow as `0x${string}`,
  );
}

export const FILE_REGISTRATION_TYPES = {
  FileRegistration: [
    { name: "ownerAddress", type: "address" },
    { name: "url", type: "string" },
    { name: "schemaId", type: "bytes32" },
  ],
} as const;

// grantVersion is a monotonic uint256 nonce per (grantor, grantee) pair. The
// gateway rejects any registration whose version is <= the stored value,
// which is the replay-attack defence now that re-registering the same pair
// is a permitted override. expiresAt is unix seconds; 0 = no expiry.
export const GRANT_REGISTRATION_TYPES = {
  GrantRegistration: [
    { name: "grantorAddress", type: "address" },
    { name: "granteeId", type: "bytes32" },
    { name: "scopes", type: "string[]" },
    { name: "grantVersion", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

// Revocation shares the (grantor, grantee) monotonic nonce with registration —
// both events advance the same grantVersion counter so an old revocation sig
// can't be replayed across a revoke → re-register cycle.
export const GRANT_REVOCATION_TYPES = {
  GrantRevocation: [
    { name: "grantorAddress", type: "address" },
    { name: "grantId", type: "bytes32" },
    { name: "grantVersion", type: "uint256" },
  ],
} as const;

export const SERVER_REGISTRATION_TYPES = {
  ServerRegistration: [
    { name: "ownerAddress", type: "address" },
    { name: "serverAddress", type: "address" },
    { name: "publicKey", type: "string" },
    { name: "serverUrl", type: "string" },
  ],
} as const;

export const BUILDER_REGISTRATION_TYPES = {
  BuilderRegistration: [
    { name: "ownerAddress", type: "address" },
    { name: "granteeAddress", type: "address" },
    { name: "publicKey", type: "string" },
    { name: "appUrl", type: "string" },
  ],
} as const;

// Generic payment for the escrow flow. The (opType, opId) pair routes the
// debit to the right op-row; paymentNonce is per-payer monotonic so the same
// signed message can't be replayed after a revoke + re-register cycle.
//
// Today opType is always 'grant' and opId is the bytes32 grantId.
export const GENERIC_PAYMENT_TYPES = {
  GenericPayment: [
    { name: "payerAddress", type: "address" },
    { name: "opType", type: "string" },
    { name: "opId", type: "bytes32" },
    { name: "asset", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "paymentNonce", type: "uint256" },
  ],
} as const;

export interface FileRegistrationMessage {
  ownerAddress: `0x${string}`;
  url: string;
  schemaId: `0x${string}`;
}

export interface GrantRegistrationMessage {
  grantorAddress: `0x${string}`;
  granteeId: `0x${string}`;
  scopes: string[];
  grantVersion: bigint;
  expiresAt: bigint;
}

export interface GrantRevocationMessage {
  grantorAddress: `0x${string}`;
  grantId: `0x${string}`;
  grantVersion: bigint;
}

export interface ServerRegistrationMessage {
  ownerAddress: `0x${string}`;
  serverAddress: `0x${string}`;
  publicKey: string;
  serverUrl: string;
}

export interface BuilderRegistrationMessage {
  ownerAddress: `0x${string}`;
  granteeAddress: `0x${string}`;
  publicKey: string;
  appUrl: string;
}

export interface GenericPaymentMessage {
  payerAddress: `0x${string}`;
  // 'grant' today — extensible to 'file' | 'builder' | 'schema' as those
  // op-types become payable. Sent verbatim over the wire and into the
  // typed-data string field, so callers must match the gateway's spelling.
  opType: string;
  opId: `0x${string}`;
  // NATIVE_VANA_ASSET for native VANA; an ERC-20 contract address otherwise.
  asset: `0x${string}`;
  amount: bigint;
  paymentNonce: bigint;
}
