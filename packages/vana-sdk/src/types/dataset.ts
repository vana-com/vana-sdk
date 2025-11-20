/**
 * Dataset management types for the Vana SDK.
 *
 * @remarks
 * Handles the logical grouping of files and the Contributor Workflow
 * (Pending -> Accepted/Rejected) through the DatasetRegistry contract.
 *
 * @category Data Management
 */

import type { Address } from "viem";

/**
 * Represents a dataset registered on the Vana network.
 *
 * @remarks
 * Datasets group related files together and manage the contributor workflow
 * where files must be accepted by the dataset owner before being included.
 *
 * @category Data Management
 */
export interface Dataset {
  /** Dataset owner address with authority to accept/reject files */
  owner: Address;

  /** File IDs waiting for owner approval */
  pendingFileIds: number[];

  /** File IDs accepted into the dataset */
  fileIds: number[];

  /** Schema ID defining the structure/validation for dataset files */
  schemaId: number;

  /** Unix timestamp when dataset was created */
  createdAt: number;
}

/**
 * Parameters for creating a new dataset.
 *
 * @remarks
 * The dataset owner is automatically set to the transaction sender.
 * Files can be added through the contribute workflow and must be
 * accepted by the owner to be included in the dataset.
 *
 * @category Data Management
 */
export interface CreateDatasetParams {
  /** Schema ID defining file structure and validation rules */
  schemaId: number;

  /** Optional metadata (name, description) - typically stored on IPFS */
  metadata?: {
    name: string;
    description?: string;
    tags?: string[];
  };
}
