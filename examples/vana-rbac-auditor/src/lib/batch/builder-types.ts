/**
 * Type definitions for composable batch transaction builder
 *
 * @remarks
 * This module provides a flexible, extensible architecture for building batches
 * of blockchain operations. The design separates operation definition from execution,
 * allowing operations to be composed manually or via templates, then executed
 * directly via wallet or exported to Safe Transaction Builder.
 *
 * **Architecture Principles:**
 * - Operations are immutable value objects
 * - Execution state is separate from operation definition
 * - Type-safe contract method definitions
 * - Extensible to any contract operation type
 *
 * @category Batch Builder
 */

import type { Address, Hash } from "viem";
import type { Network } from "../types";

/**
 * Supported operation types
 *
 * @remarks
 * Currently supports role management operations. Designed to be extensible
 * to other operation types (e.g., "transfer", "approve") without breaking changes.
 */
export type OperationType = "grant" | "revoke";

/**
 * Contract method ABI definition
 *
 * @remarks
 * Matches Safe Transaction Builder format for contract method definitions.
 * Allows Safe UI to decode parameters and generate transaction data.
 */
export interface ContractMethodDefinition {
  readonly inputs: readonly {
    readonly internalType: string;
    readonly name: string;
    readonly type: string;
  }[];
  readonly name: string;
  readonly payable: false;
}

/**
 * Reference to a contract with human-readable identification
 */
export interface ContractReference {
  /** Contract address (checksummed) */
  address: Address;
  /** Human-readable contract name (e.g., "DataRegistry") */
  name: string;
}

/**
 * Display metadata for an operation
 *
 * @remarks
 * Enriches operations with human-readable labels for UI display.
 * Not used in transaction execution - purely for user experience.
 */
export interface OperationMetadata {
  /** Human-readable role name (e.g., "ADMIN_ROLE") */
  roleLabel?: string;
  /** Known address label (e.g., "Core Team Member") */
  accountLabel?: string;
  /** Optional user-provided description */
  description?: string;
}

/**
 * Execution state lifecycle for an operation
 *
 * @remarks
 * Tracks operation execution from pending through completion or failure.
 * Provides detailed status for UI progress tracking.
 *
 * **State Transitions:**
 * pending → simulating → awaiting_signature → executing → success | failed
 */
export type ExecutionStatus =
  | { state: "pending" }
  | { state: "simulating" }
  | { state: "awaiting_signature" }
  | { state: "executing"; txHash: Hash }
  | { state: "success"; txHash: Hash; blockNumber: bigint }
  | { state: "failed"; error: string; txHash?: Hash };

/**
 * Single operation in a batch
 *
 * @remarks
 * Atomic unit of work representing one contract call. Operations are immutable
 * value objects - execution state is tracked separately. Designed to be
 * serializable for persistence and export.
 *
 * @example
 * ```typescript
 * const operation: BatchOperation = {
 *   id: "550e8400-e29b-41d4-a716-446655440000",
 *   type: "revoke",
 *   contract: {
 *     address: "0x1234...",
 *     name: "DataRegistry"
 *   },
 *   method: "revokeRole",
 *   parameters: {
 *     role: "0x3b5f...",
 *     account: "0xabcd..."
 *   },
 *   metadata: {
 *     roleLabel: "ADMIN_ROLE",
 *     accountLabel: "Deactivated User"
 *   }
 * };
 * ```
 */
export interface BatchOperation {
  /** Unique identifier (UUID v4) */
  id: string;

  /** Operation type for categorization and filtering */
  type: OperationType;

  /** Target contract reference */
  contract: ContractReference;

  /** Contract method to call (e.g., "grantRole", "revokeRole") */
  method: string;

  /**
   * Method parameters as key-value pairs
   *
   * @remarks
   * Keys match contract method parameter names.
   * Values must be strings (addresses checksummed, bytes32 as hex).
   */
  parameters: Record<string, string>;

  /** Optional display metadata */
  metadata?: OperationMetadata;

  /**
   * Execution tracking state
   *
   * @remarks
   * Populated during execution, undefined for pending operations.
   * Not serialized when exporting to Safe JSON.
   */
  execution?: ExecutionStatus;
}

/**
 * Validation warning
 *
 * @remarks
 * Non-blocking issues that user should be aware of but don't prevent execution.
 * Examples: duplicate operations, unusual patterns, potential inefficiencies.
 */
export interface ValidationWarning {
  /** Warning code (e.g., "W001") */
  code: string;
  /** Human-readable warning message */
  message: string;
  /** Operation ID(s) this warning relates to */
  operationIds?: string[];
}

/**
 * Comprehensive validation result
 *
 * @remarks
 * Extends basic ValidationResult with warnings and additional context.
 * Errors block execution; warnings inform but don't prevent.
 */
export interface BatchValidationResult {
  /** True if no errors (warnings still allowed) */
  valid: boolean;
  /** Blocking errors that prevent execution */
  errors: Array<{
    code: string;
    message: string;
    operationId?: string;
  }>;
  /** Non-blocking warnings */
  warnings: ValidationWarning[];
}

/**
 * Complete batch definition
 *
 * @remarks
 * Container for a set of operations with metadata. Can be persisted to local
 * storage, exported to Safe JSON, or executed directly via wallet.
 *
 * @example
 * ```typescript
 * const batch: Batch = {
 *   id: "batch-1",
 *   name: "Q4 Permission Cleanup",
 *   description: "Remove deactivated users",
 *   network: "mainnet",
 *   operations: [...],
 *   createdAt: Date.now(),
 *   updatedAt: Date.now()
 * };
 * ```
 */
export interface Batch {
  /** Unique batch identifier */
  id: string;

  /** Human-readable batch name */
  name: string;

  /** Optional detailed description */
  description?: string;

  /** Target network */
  network: Network;

  /** Operations in execution order */
  operations: BatchOperation[];

  /** Creation timestamp (Unix milliseconds) */
  createdAt: number;

  /** Last modification timestamp (Unix milliseconds) */
  updatedAt: number;

  /** Address that created the batch (if wallet connected) */
  createdBy?: Address;

  /** Execution history (populated after execution) */
  executionHistory?: BatchExecutionResult[];
}

/**
 * Summary statistics for batch execution
 */
export interface ExecutionSummary {
  /** Total operations attempted */
  total: number;
  /** Successfully executed operations */
  successful: number;
  /** Failed operations */
  failed: number;
  /** Skipped operations (e.g., user aborted) */
  skipped: number;
}

/**
 * Result of executing a batch
 *
 * @remarks
 * Records complete execution history including per-operation results.
 * Can be persisted for audit trail or retry of failed operations.
 */
export interface BatchExecutionResult {
  /** Execution timestamp (Unix milliseconds) */
  executedAt: number;

  /** Address that executed the batch */
  executedBy: Address;

  /** Operations with execution state populated */
  operations: BatchOperation[];

  /** Summary statistics */
  summary: ExecutionSummary;
}

/**
 * Wallet role information
 *
 * @remarks
 * Discovered by querying on-chain hasRole for connected wallet.
 * Used to show user which operations they can likely execute.
 */
export interface WalletRoleInfo {
  /** Contract name */
  contract: string;
  /** Contract address */
  contractAddress: Address;
  /** Human-readable role name */
  role: string;
  /** Role hash (bytes32) */
  roleHash: string;
}

/**
 * Template function signature
 *
 * @remarks
 * Templates generate arrays of operations from high-level parameters.
 * Examples: "revoke all from address", "rotate addresses".
 *
 * @example
 * ```typescript
 * const template: TemplateFunction = (params, network, auditResults) => {
 *   const address = params.address as Address;
 *   const roles = discoverRolesToRotate(address, undefined, auditResults);
 *   return roles.map(roleHash => createRevokeOperation(address, roleHash));
 * };
 * ```
 */
export type TemplateFunction = (
  params: Record<string, unknown>,
  network: Network,
  auditResults?: unknown,
) => BatchOperation[];

/**
 * Template registration metadata
 */
export interface TemplateInfo {
  /** Unique template identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of what the template does */
  description: string;
  /** Template function */
  generate: TemplateFunction;
}
