import type { Address, Hash } from "viem";

/**
 * Parameters for creating a runtime permission grant
 *
 * @remarks
 * Defines access permissions for data consumers to execute operations on datasets
 * via Vana Runtime. Similar to GrantPermissionParams but for VanaRuntimePermissions contract.
 *
 * @category Runtime Permissions
 * @example
 * ```typescript
 * const params: RuntimePermissionParams = {
 *   datasetId: 123n,
 *   grantee: "0x...",
 *   task: "thinker/task:v1",
 *   operation: "aggregate_keywords",
 *   pricing: { price_per_file_vana: 0.1 },
 *   endBlock: 2000000n
 * };
 * ```
 */
export interface RuntimePermissionParams {
  /** Dataset ID that this permission applies to */
  datasetId: bigint;

  /** Address of the data consumer (grantee) */
  grantee: Address;

  /** Task identifier (e.g., "thinker/task:v1") */
  task: string;

  /** Operation name (e.g., "train", "aggregate_keywords") */
  operation: string;

  /** Pricing configuration */
  pricing: {
    /** Price per file in VANA */
    price_per_file_vana: number;
    /** Optional minimum price in VANA */
    minimum_price_vana?: number;
    /** Optional maximum price in VANA */
    maximum_price_vana?: number;
  };

  /** Operation parameters and constraints */
  parameters?: Record<string, unknown>;

  /** Optional start block (defaults to current block) */
  startBlock?: bigint;

  /** End block for permission expiry */
  endBlock: bigint;

  /** Optional: Pre-uploaded grant URL (IPFS) */
  grantUrl?: string;
}

/**
 * Grant file structure for runtime permissions
 *
 * @remarks
 * Stored on IPFS and referenced on-chain via the grant field.
 * Contains detailed permission parameters including pricing and operation constraints.
 *
 * @category Runtime Permissions
 */
export interface RuntimeGrantFile {
  /** Address of the data consumer */
  grantee: Address;

  /** Task identifier */
  task: string;

  /** Operation name */
  operation: string;

  /** Pricing configuration */
  pricing: {
    price_per_file_vana: number;
    minimum_price_vana?: number;
    maximum_price_vana?: number;
  };

  /** Operation parameters and constraints */
  parameters?: Record<string, unknown>;
}

/**
 * On-chain permission structure
 *
 * @remarks
 * Returned by VanaRuntimePermissions contract methods.
 * The grant field contains an IPFS hash referencing the detailed RuntimeGrantFile.
 *
 * @category Runtime Permissions
 */
export interface RuntimePermission {
  /** Unique permission identifier */
  id: bigint;

  /** Dataset this permission applies to */
  datasetId: bigint;

  /** Grantee identifier (consumer ID) */
  granteeId: bigint;

  /** IPFS hash of the grant file */
  grant: string;

  /** Nonce for replay protection */
  nonce: bigint;

  /** Block number when permission becomes active */
  startBlock: bigint;

  /** Block number when permission expires */
  endBlock: bigint;
}

/**
 * Result from creating a permission
 *
 * @remarks
 * Contains the permission ID, transaction hash, and grant URL for reference.
 *
 * @category Runtime Permissions
 */
export interface RuntimePermissionResult {
  /** On-chain permission ID */
  permissionId: bigint;

  /** Transaction hash */
  hash: Hash;

  /** IPFS URL of the grant file */
  grantUrl: string;
}
