// Re-export all types from the new modular structure
export * from "./types/index";

// Also re-export legacy types for backward compatibility
// These were previously defined in this file and are now in the types module
import type { Address } from "viem";

/**
 * Represents a user's registered data file.
 */
export interface UserFile {
  /** Unique identifier for the file */
  id: number;
  /** URL where the file is stored */
  url: string;
  /** EVM address of the file owner */
  ownerAddress: Address;
  /** Block number when the file was added to the registry */
  addedAtBlock: bigint;
}

/**
 * Parameters for the `vana.permissions.grant` method.
 */
export interface GrantPermissionParams {
  /** The on-chain identity of the application */
  to: Address;
  /** The class of computation, e.g., "llm_inference" */
  operation: string;
  /** Array of file IDs to grant permission for */
  files: number[];
  /** The full, off-chain parameters (e.g., LLM prompt) */
  parameters: Record<string, unknown>;
  /** Optional pre-stored grant URL to avoid duplicate IPFS storage */
  grantUrl?: string;
}
