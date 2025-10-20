/**
 * Type definitions for Safe Transaction Builder batch generation
 * Following Safe Transaction Builder JSON schema v1.0
 */
import type { Address } from "viem";

/**
 * User input from rotation form
 */
export interface RotationFormInput {
  oldAddress: Address;
  newAddress: Address;
  role?: string; // Role hash (e.g., "0x3b5f..."). Undefined = all roles
  contractAddresses?: Address[]; // Undefined = all contracts
}

/**
 * Validation error with code, field, and message
 */
export interface ValidationError {
  code: string; // E.g., "E001"
  field: string; // E.g., "oldAddress"
  message: string; // User-facing error message
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Safe Transaction Builder - Transaction format
 * Based on Safe Transaction Builder JSON schema
 */
export interface SafeTransaction {
  to: string; // Contract address (checksummed)
  value: string; // Wei amount (always "0" for role operations)
  data: null; // Always null - Safe encodes from contractMethod
  contractMethod: {
    readonly inputs: readonly {
      readonly internalType: string; // e.g., "bytes32", "address"
      readonly name: string; // e.g., "role", "account"
      readonly type: string; // e.g., "bytes32", "address"
    }[];
    readonly name: string; // e.g., "grantRole", "revokeRole"
    readonly payable: false;
  };
  contractInputsValues: {
    [key: string]: string; // e.g., { role: "0x...", account: "0x..." }
  };
}

/**
 * Safe Transaction Builder - Metadata
 */
export interface SafeMetadata {
  name: string; // Human-readable batch name
  description: string; // Detailed description
  txBuilderVersion: string; // Safe UI version (use "1.16.5")
  createdFromSafeAddress: string; // Leave blank - Safe fills on import
  createdFromOwnerAddress: string; // Leave blank - Safe fills on import
  checksum: string; // Leave blank - Safe regenerates
}

/**
 * Safe Transaction Builder - File format
 */
export interface SafeBatchFile {
  version: "1.0";
  chainId: string; // "1480" (mainnet) or "14800" (moksha)
  createdAt: number; // Unix timestamp (milliseconds)
  meta: SafeMetadata;
  transactions: SafeTransaction[];
}

/**
 * Batch generation result
 */
export interface BatchGenerationResult {
  success: boolean;
  batch?: SafeBatchFile;
  errors?: ValidationError[];
  transactionCount?: number;
}

/**
 * Pre-defined ABI fragments for role management functions
 */
export const GRANT_ROLE_METHOD = {
  inputs: [
    { internalType: "bytes32", name: "role", type: "bytes32" },
    { internalType: "address", name: "account", type: "address" },
  ],
  name: "grantRole",
  payable: false,
} as const;

export const REVOKE_ROLE_METHOD = {
  inputs: [
    { internalType: "bytes32", name: "role", type: "bytes32" },
    { internalType: "address", name: "account", type: "address" },
  ],
  name: "revokeRole",
  payable: false,
} as const;
