/**
 * Batch operation templates
 *
 * @remarks
 * Templates generate operations based on CURRENT STATE from audit results.
 * They operate on what IS, not what MIGHT BE. All templates require audit
 * results - there are no theoretical fallbacks.
 *
 * **Philosophy:**
 * This is an auditor. It shows current state. Templates act on current state.
 * If you want to do something theoretical, use the manual builder.
 *
 * **Available Templates:**
 * - Revoke All: Remove roles address CURRENTLY HAS
 * - Rotation: Transfer roles old address CURRENTLY HAS to new address
 *
 * @category Batch Builder
 * @module templates
 */

import { getAddress, type Address } from "viem";
import type { AuditResults } from "../types";
import type { CreateOperationInput } from "./builder";
import { createGrantOperation, createRevokeOperation } from "./operations";

/**
 * Parameters for revoke-all template
 */
export interface RevokeAllTemplateParams {
  /** Address to revoke all roles from */
  address: Address;
  /** Optional contract filter (undefined = all contracts where address has roles) */
  contracts?: Address[];
  /** Optional role filter (undefined = all roles address currently has) */
  roleHash?: string;
}

/**
 * Parameters for rotation template
 */
export interface RotationTemplateParams {
  /** Address losing roles */
  oldAddress: Address;
  /** Address gaining roles */
  newAddress: Address;
  /** Optional role filter (undefined = all roles old address currently has) */
  roleHash?: string;
  /** Optional contract filter (undefined = all contracts where old address has roles) */
  contracts?: Address[];
}

/**
 * Revoke All Template
 *
 * @remarks
 * Generates revoke operations for roles address CURRENTLY HAS based on audit state.
 * No theoretical operations - only revokes what actually exists.
 *
 * Useful for:
 * - Offboarding team members
 * - Deactivating compromised accounts
 * - Emergency access removal
 *
 * @param params - Template parameters
 * @param auditResults - REQUIRED audit results (shows current state)
 * @returns Array of revoke operations for roles address currently has
 * @throws Error if audit results not provided
 *
 * @example
 * ```typescript
 * // Revoke all roles from deactivated user
 * const operations = revokeAllTemplate(
 *   { address: "0x123..." },
 *   auditResults  // REQUIRED - shows what roles they have NOW
 * );
 *
 * builder.addOperations(operations);
 * // Result: 8 revoke operations (only for roles user actually has)
 * ```
 */
export function revokeAllTemplate(
  params: RevokeAllTemplateParams,
  auditResults: AuditResults,
): CreateOperationInput[] {
  const { address, contracts: contractFilter, roleHash } = params;

  const normalizedAddress = getAddress(address).toLowerCase();

  // Get current permissions from audit results
  let currentPermissions = auditResults.currentState.filter(
    (entry) => getAddress(entry.address).toLowerCase() === normalizedAddress,
  );

  // Filter by role if specified
  if (roleHash) {
    currentPermissions = currentPermissions.filter(
      (entry) => entry.roleHash === roleHash,
    );
  }

  // Filter by contracts if specified
  if (contractFilter && contractFilter.length > 0) {
    const selectedAddresses = contractFilter.map((addr) =>
      getAddress(addr).toLowerCase(),
    );

    currentPermissions = currentPermissions.filter((entry) =>
      selectedAddresses.includes(
        getAddress(entry.contractAddress).toLowerCase(),
      ),
    );
  }

  // Generate revoke operations for ACTUAL current permissions
  return currentPermissions.map((entry) =>
    createRevokeOperation({
      contract: {
        address: entry.contractAddress,
        name: entry.contract,
      },
      roleHash: entry.roleHash,
      account: address,
    }),
  );
}

/**
 * Rotation Template
 *
 * @remarks
 * Generates grant+revoke pairs to transfer roles old address CURRENTLY HAS to new address.
 * Based on audit state - only rotates what old address actually has right now.
 *
 * Useful for:
 * - Rotating on-call operators
 * - Changing service account addresses
 * - Team member transitions
 *
 * **Operation Order:**
 * For each role old address currently has:
 * 1. Grant role to NEW address (prevents permission gaps)
 * 2. Revoke role from OLD address
 *
 * @param params - Template parameters
 * @param auditResults - REQUIRED audit results (shows what old address has)
 * @returns Array of grant+revoke operations
 *
 * @example
 * ```typescript
 * // Rotate all roles from old to new operator
 * const operations = rotationTemplate(
 *   {
 *     oldAddress: "0x123...",
 *     newAddress: "0xabc..."
 *   },
 *   auditResults  // REQUIRED - shows what old address has NOW
 * );
 *
 * builder.addOperations(operations);
 * // Result: 16 operations (8 grants + 8 revokes for roles old address has)
 * ```
 */
export function rotationTemplate(
  params: RotationTemplateParams,
  auditResults: AuditResults,
): CreateOperationInput[] {
  const {
    oldAddress,
    newAddress,
    roleHash,
    contracts: contractFilter,
  } = params;

  const normalizedOldAddress = getAddress(oldAddress).toLowerCase();

  // Get current permissions from audit results
  let currentPermissions = auditResults.currentState.filter(
    (entry) => getAddress(entry.address).toLowerCase() === normalizedOldAddress,
  );

  // Filter by role if specified
  if (roleHash) {
    currentPermissions = currentPermissions.filter(
      (entry) => entry.roleHash === roleHash,
    );
  }

  // Filter by contracts if specified
  if (contractFilter && contractFilter.length > 0) {
    const selectedAddresses = contractFilter.map((addr) =>
      getAddress(addr).toLowerCase(),
    );

    currentPermissions = currentPermissions.filter((entry) =>
      selectedAddresses.includes(
        getAddress(entry.contractAddress).toLowerCase(),
      ),
    );
  }

  // Generate grant+revoke pairs (grant first to avoid permission gaps)
  const operations: CreateOperationInput[] = [];

  for (const entry of currentPermissions) {
    // Grant to NEW address first
    operations.push(
      createGrantOperation({
        contract: {
          address: entry.contractAddress,
          name: entry.contract,
        },
        roleHash: entry.roleHash,
        account: newAddress,
      }),
    );

    // Then revoke from OLD address
    operations.push(
      createRevokeOperation({
        contract: {
          address: entry.contractAddress,
          name: entry.contract,
        },
        roleHash: entry.roleHash,
        account: oldAddress,
      }),
    );
  }

  return operations;
}

/**
 * Template registry
 *
 * @remarks
 * Templates operate on CURRENT STATE from audit results.
 * For theoretical operations, use the manual builder.
 */
export const TEMPLATES = {
  "revoke-all": {
    id: "revoke-all",
    name: "Revoke All Permissions",
    description: "Remove all roles address currently has",
    generate: revokeAllTemplate,
  },
  rotation: {
    id: "rotation",
    name: "Rotate Addresses",
    description: "Transfer roles old address currently has to new address",
    generate: rotationTemplate,
  },
} as const;

export type TemplateId = keyof typeof TEMPLATES;
