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
  // Permission operations
  grant: {
    contract: "DataPortabilityPermissions",
    event: "PermissionAdded",
  },
  revoke: {
    contract: "DataPortabilityPermissions",
    event: "PermissionRevoked",
  },
  trustServer: {
    contract: "DataPortabilityServers",
    event: "ServerTrusted",
  },
  untrustServer: {
    contract: "DataPortabilityServers",
    event: "ServerUntrusted",
  },

  // Data registry operations
  addFile: {
    contract: "DataRegistry",
    event: "FileAdded",
  },
  addRefinement: {
    contract: "DataRegistry",
    event: "RefinementAdded",
  },
  updateRefinement: {
    contract: "DataRegistry",
    event: "RefinementUpdated",
  },
  addFilePermission: {
    contract: "DataRegistry",
    event: "PermissionGranted",
  },
} as const satisfies Record<string, EventMapping>;

export type TransactionOperation = keyof typeof EVENT_MAPPINGS;
