// Event mapping configuration for transaction result parsing
// Maps SDK operation names to their corresponding contract events

import type { VanaContract } from "../generated/abi";

export interface EventMapping {
  contract: VanaContract;
  event: string;
}

/**
 * Comprehensive mapping of SDK transaction operations to blockchain events.
 * Used by the generic transaction parser to know which contract and event
 * to look for when parsing transaction results.
 */
export const EVENT_MAPPINGS = {
  // DataPortabilityPermissions operations
  grant: {
    contract: "DataPortabilityPermissions",
    event: "PermissionAdded",
  },
  revoke: {
    contract: "DataPortabilityPermissions",
    event: "PermissionRevoked",
  },
  revokePermission: {
    contract: "DataPortabilityPermissions",
    event: "PermissionRevoked",
  },
  addServerFilesAndPermissions: {
    contract: "DataPortabilityPermissions",
    event: "PermissionAdded",
  },

  // DataPortabilityServers operations
  trustServer: {
    contract: "DataPortabilityServers",
    event: "ServerTrusted",
  },
  untrustServer: {
    contract: "DataPortabilityServers",
    event: "ServerUntrusted",
  },
  registerServer: {
    contract: "DataPortabilityServers",
    event: "ServerRegistered",
  },
  updateServer: {
    contract: "DataPortabilityServers",
    event: "ServerUpdated",
  },
  addAndTrustServer: {
    contract: "DataPortabilityServers",
    event: "ServerTrusted",
  },

  // DataRegistry operations
  addFile: {
    contract: "DataRegistry",
    event: "FileAdded",
  },
  addFileWithPermissionsAndSchema: {
    contract: "DataRegistry",
    event: "FileAdded",
  },
  addFileWithSchema: {
    contract: "DataRegistry",
    event: "FileAdded",
  },
  addFileWithPermissions: {
    contract: "DataRegistry",
    event: "FileAdded",
  },
  addRefinement: {
    contract: "DataRegistry",
    event: "RefinementAdded",
  },
  addRefiner: {
    contract: "DataRefinerRegistry",
    event: "RefinerAdded",
  },
  updateSchemaId: {
    contract: "DataRefinerRegistry",
    event: "SchemaAdded",
  },
  addSchema: {
    contract: "DataRefinerRegistry",
    event: "SchemaAdded",
  },
  updateRefinement: {
    contract: "DataRegistry",
    event: "RefinementUpdated",
  },
  addFilePermission: {
    contract: "DataRegistry",
    event: "PermissionGranted",
  },

  // DataPortabilityGrantees operations
  registerGrantee: {
    contract: "DataPortabilityGrantees",
    event: "GranteeRegistered",
  },
} as const satisfies Record<string, EventMapping>;

export type TransactionOperation = keyof typeof EVENT_MAPPINGS;
