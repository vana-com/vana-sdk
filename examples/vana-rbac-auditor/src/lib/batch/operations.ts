/**
 * Operation factory functions for creating batch operations
 *
 * @remarks
 * Provides convenient factory functions for creating common operation types.
 * Handles parameter validation, address checksumming, and metadata enrichment.
 *
 * **Design Pattern:**
 * Each factory function creates a complete CreateOperationInput object that can
 * be passed directly to BatchBuilder.addOperation(). The factory handles all
 * the boilerplate and ensures consistency.
 *
 * @category Batch Builder
 * @module operations
 */

import { getAddress, type Address } from "viem";
import type { CreateOperationInput } from "./builder";
import type { ContractReference } from "./builder-types";
import { GRANT_ROLE_METHOD, REVOKE_ROLE_METHOD } from "./types";
import { getAddressLabel } from "../../config";
import { KNOWN_ROLES } from "../../config/contracts";

/**
 * Parameters for creating a role grant operation
 */
export interface CreateGrantOperationParams {
  /** Contract to grant role on */
  contract: ContractReference;
  /** Role hash (bytes32 as hex string) */
  roleHash: string;
  /** Account to grant role to */
  account: Address;
  /** Optional metadata overrides */
  metadata?: {
    roleLabel?: string;
    accountLabel?: string;
    description?: string;
  };
}

/**
 * Parameters for creating a role revoke operation
 */
export interface CreateRevokeOperationParams {
  /** Contract to revoke role on */
  contract: ContractReference;
  /** Role hash (bytes32 as hex string) */
  roleHash: string;
  /** Account to revoke role from */
  account: Address;
  /** Optional metadata overrides */
  metadata?: {
    roleLabel?: string;
    accountLabel?: string;
    description?: string;
  };
}

/**
 * Creates a grant role operation
 *
 * @remarks
 * Factory function for creating properly formatted grant operations.
 * Automatically checksums addresses and enriches with metadata from config.
 *
 * @param params - Grant operation parameters
 * @returns CreateOperationInput suitable for BatchBuilder.addOperation()
 *
 * @example
 * ```typescript
 * const operation = createGrantOperation({
 *   contract: {
 *     address: "0x123...",
 *     name: "DataRegistry"
 *   },
 *   roleHash: "0xabc...",
 *   account: "0xdef..."
 * });
 *
 * builder.addOperation(operation);
 * ```
 */
export function createGrantOperation(
  params: CreateGrantOperationParams,
): CreateOperationInput {
  const { contract, roleHash, account, metadata } = params;

  // Ensure addresses are checksummed
  const checksummedAccount = getAddress(account);
  const checksummedContract = getAddress(contract.address);

  // Enrich metadata with known labels
  const roleLabel = metadata?.roleLabel ?? KNOWN_ROLES[roleHash] ?? undefined;
  const accountLabel =
    metadata?.accountLabel ?? getAddressLabel(checksummedAccount);

  return {
    type: "grant",
    contract: {
      address: checksummedContract,
      name: contract.name,
    },
    method: "grantRole",
    parameters: {
      role: roleHash,
      account: checksummedAccount,
    },
    metadata: {
      roleLabel,
      accountLabel,
      description: metadata?.description,
    },
  };
}

/**
 * Creates a revoke role operation
 *
 * @remarks
 * Factory function for creating properly formatted revoke operations.
 * Automatically checksums addresses and enriches with metadata from config.
 *
 * @param params - Revoke operation parameters
 * @returns CreateOperationInput suitable for BatchBuilder.addOperation()
 *
 * @example
 * ```typescript
 * const operation = createRevokeOperation({
 *   contract: {
 *     address: "0x123...",
 *     name: "DataRegistry"
 *   },
 *   roleHash: "0xabc...",
 *   account: "0xdef..."
 * });
 *
 * builder.addOperation(operation);
 * ```
 */
export function createRevokeOperation(
  params: CreateRevokeOperationParams,
): CreateOperationInput {
  const { contract, roleHash, account, metadata } = params;

  // Ensure addresses are checksummed
  const checksummedAccount = getAddress(account);
  const checksummedContract = getAddress(contract.address);

  // Enrich metadata with known labels
  const roleLabel = metadata?.roleLabel ?? KNOWN_ROLES[roleHash] ?? undefined;
  const accountLabel =
    metadata?.accountLabel ?? getAddressLabel(checksummedAccount);

  return {
    type: "revoke",
    contract: {
      address: checksummedContract,
      name: contract.name,
    },
    method: "revokeRole",
    parameters: {
      role: roleHash,
      account: checksummedAccount,
    },
    metadata: {
      roleLabel,
      accountLabel,
      description: metadata?.description,
    },
  };
}

/**
 * Converts a BatchOperation to a Safe transaction format
 *
 * @remarks
 * Used internally by Safe JSON export. Converts our internal operation format
 * to the Safe Transaction Builder JSON schema.
 *
 * @param operation - Batch operation to convert
 * @returns Safe transaction object
 * @internal
 */
export function operationToSafeTransaction(operation: CreateOperationInput): {
  to: string;
  value: string;
  data: null;
  contractMethod: typeof GRANT_ROLE_METHOD | typeof REVOKE_ROLE_METHOD;
  contractInputsValues: Record<string, string>;
} {
  const method =
    operation.method === "grantRole" ? GRANT_ROLE_METHOD : REVOKE_ROLE_METHOD;

  return {
    to: getAddress(operation.contract.address),
    value: "0",
    data: null,
    contractMethod: method,
    contractInputsValues: operation.parameters,
  };
}
