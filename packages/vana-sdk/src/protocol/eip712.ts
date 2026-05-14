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
}

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

export const FILE_REGISTRATION_TYPES = {
  FileRegistration: [
    { name: "ownerAddress", type: "address" },
    { name: "url", type: "string" },
    { name: "schemaId", type: "bytes32" },
  ],
} as const;

export const GRANT_REGISTRATION_TYPES = {
  GrantRegistration: [
    { name: "grantorAddress", type: "address" },
    { name: "granteeId", type: "bytes32" },
    { name: "grant", type: "string" },
    { name: "fileIds", type: "uint256[]" },
  ],
} as const;

export const GRANT_REVOCATION_TYPES = {
  GrantRevocation: [
    { name: "grantorAddress", type: "address" },
    { name: "grantId", type: "bytes32" },
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

export interface FileRegistrationMessage {
  ownerAddress: `0x${string}`;
  url: string;
  schemaId: `0x${string}`;
}

export interface GrantRegistrationMessage {
  grantorAddress: `0x${string}`;
  granteeId: `0x${string}`;
  grant: string;
  fileIds: bigint[];
}

export interface GrantRevocationMessage {
  grantorAddress: `0x${string}`;
  grantId: `0x${string}`;
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
