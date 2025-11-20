/**
 * Controller for managing datasets and contributor workflows.
 *
 * @remarks
 * Handles dataset creation, file acceptance/rejection, and querying
 * through the DatasetRegistry contract. Implements the Contributor
 * Workflow where files are submitted as pending and must be accepted
 * by the dataset owner.
 *
 * @category Controllers
 */

import { getContract, type Address } from "viem";
import { BaseController } from "./base";
import type {
  TransactionOptions,
  TransactionResult,
} from "../types/operations";
import type { Dataset } from "../types/dataset";
import type { ConsistencyOptions, PaginationOptions } from "../types/options";
import { getContractAddress } from "../generated/addresses";
import { getAbi } from "../generated/abi";
import { tx } from "../utils/transactionHelpers";
import { BlockchainError } from "../errors";
import { gasAwareMulticall } from "../utils/multicall";

/**
 * Dataset management controller implementing the Contributor Workflow.
 *
 * @remarks
 * Separates dataset management from raw file operations (DataController).
 * Handles the logical grouping of files and owner approval workflow.
 *
 * Key responsibilities:
 * - Creating new datasets with schema validation
 * - Managing pending file approval queue
 * - Accepting/rejecting contributor files
 * - Querying dataset state and file lists
 *
 * @example
 * ```typescript
 * // Create a dataset
 * const result = await vana.dataset.createDataset(schemaId);
 * const datasetId = await vana.waitForTransactionEvents(result);
 *
 * // Get pending files
 * const dataset = await vana.dataset.getDataset(datasetId);
 * console.log(`${dataset.pendingFileIds.length} files awaiting approval`);
 *
 * // Accept a file
 * await vana.dataset.acceptFile(datasetId, fileId);
 * ```
 */
export class DatasetController extends BaseController {
  /**
   * Create a new dataset on the Vana network.
   *
   * @remarks
   * Creates a dataset with the caller as the owner. The dataset will
   * use the specified schema for file validation. Files can be added
   * through the contribute workflow and must be accepted by the owner.
   *
   * @param schemaId - Schema ID defining file structure and validation
   * @param options - Optional transaction parameters (gas, nonce, etc.)
   * @returns Transaction result with DatasetCreated event
   * @throws {ReadOnlyError} When no wallet is configured
   * @throws {BlockchainError} When dataset creation fails
   *
   * @example
   * ```typescript
   * const tx = await vana.dataset.createDataset(42);
   * const events = await vana.waitForTransactionEvents(tx);
   * console.log(`Dataset ${events.datasetId} created`);
   * ```
   */
  async createDataset(
    schemaId: number,
    options?: TransactionOptions,
  ): Promise<TransactionResult<"DatasetRegistry", "createDataset">> {
    this.assertWallet();

    try {
      const chainId = await this.context.publicClient.getChainId();
      const address = getContractAddress(chainId, "DatasetRegistry");
      const abi = getAbi("DatasetRegistry");
      const account =
        this.context.walletClient.account ?? this.context.userAddress;

      if (!account) {
        throw new Error("No account found");
      }

      const accountAddress =
        typeof account === "string" ? account : account.address;

      const hash = await this.context.walletClient.writeContract({
        address,
        abi,
        functionName: "createDataset",
        args: [accountAddress, BigInt(schemaId)],
        account,
        chain: this.context.walletClient.chain,
        ...this.spreadTransactionOptions(options),
      });

      return tx({
        hash,
        from: accountAddress,
        contract: "DatasetRegistry",
        fn: "createDataset",
      });
    } catch (error) {
      throw new BlockchainError(
        `Failed to create dataset: ${error instanceof Error ? error.message : String(error)}`,
        error as Error,
      );
    }
  }

  /**
   * Accept a pending file into the dataset.
   *
   * @remarks
   * Validates and accepts a contributor's file submission. Only the
   * dataset owner can accept files. Once accepted, the file becomes
   * part of the dataset and can be used in operations.
   *
   * @param datasetId - Dataset ID to accept the file into
   * @param fileId - File ID to accept from pending queue
   * @param options - Optional transaction parameters
   * @returns Transaction result with FileAccepted event
   * @throws {ReadOnlyError} When no wallet is configured
   * @throws {BlockchainError} When file acceptance fails
   *
   * @example
   * ```typescript
   * const tx = await vana.dataset.acceptFile(1, 42);
   * await vana.publicClient.waitForTransactionReceipt({ hash: tx.hash });
   * console.log(`File ${fileId} accepted into dataset ${datasetId}`);
   * ```
   */
  async acceptFile(
    datasetId: number,
    fileId: number,
    options?: TransactionOptions,
  ): Promise<TransactionResult<"DatasetRegistry", "acceptFile">> {
    this.assertWallet();

    try {
      const chainId = await this.context.publicClient.getChainId();
      const address = getContractAddress(chainId, "DatasetRegistry");
      const abi = getAbi("DatasetRegistry");
      const account =
        this.context.walletClient.account ?? this.context.userAddress;

      if (!account) {
        throw new Error("No account found");
      }

      const accountAddress =
        typeof account === "string" ? account : account.address;

      const hash = await this.context.walletClient.writeContract({
        address,
        abi,
        functionName: "acceptFile",
        args: [BigInt(datasetId), BigInt(fileId)],
        account,
        chain: this.context.walletClient.chain,
        ...this.spreadTransactionOptions(options),
      });

      return tx({
        hash,
        from: accountAddress,
        contract: "DatasetRegistry",
        fn: "acceptFile",
      });
    } catch (error) {
      throw new BlockchainError(
        `Failed to accept file: ${error instanceof Error ? error.message : String(error)}`,
        error as Error,
      );
    }
  }

  /**
   * Reject a pending file submission.
   *
   * @remarks
   * Removes a file from the pending queue without accepting it.
   * Only the dataset owner can reject files. The file remains in
   * the DataRegistry but is not part of this dataset.
   *
   * @param datasetId - Dataset ID to reject the file from
   * @param fileId - File ID to reject from pending queue
   * @param options - Optional transaction parameters
   * @returns Transaction result with FileRejected event
   * @throws {ReadOnlyError} When no wallet is configured
   * @throws {BlockchainError} When file rejection fails
   *
   * @example
   * ```typescript
   * const tx = await vana.dataset.rejectFile(1, 42);
   * await vana.publicClient.waitForTransactionReceipt({ hash: tx.hash });
   * ```
   */
  async rejectFile(
    datasetId: number,
    fileId: number,
    options?: TransactionOptions,
  ): Promise<TransactionResult<"DatasetRegistry", "rejectFile">> {
    this.assertWallet();

    try {
      const chainId = await this.context.publicClient.getChainId();
      const address = getContractAddress(chainId, "DatasetRegistry");
      const abi = getAbi("DatasetRegistry");
      const account =
        this.context.walletClient.account ?? this.context.userAddress;

      if (!account) {
        throw new Error("No account found");
      }

      const accountAddress =
        typeof account === "string" ? account : account.address;

      const hash = await this.context.walletClient.writeContract({
        address,
        abi,
        functionName: "rejectFile",
        args: [BigInt(datasetId), BigInt(fileId)],
        account,
        chain: this.context.walletClient.chain,
        ...this.spreadTransactionOptions(options),
      });

      return tx({
        hash,
        from: accountAddress,
        contract: "DatasetRegistry",
        fn: "rejectFile",
      });
    } catch (error) {
      throw new BlockchainError(
        `Failed to reject file: ${error instanceof Error ? error.message : String(error)}`,
        error as Error,
      );
    }
  }

  /**
   * Get dataset details including file lists.
   *
   * @remarks
   * Retrieves complete dataset state including owner, pending files,
   * accepted files, schema, and creation time. This is a read-only
   * operation that doesn't require a wallet.
   *
   * @param datasetId - Dataset ID to query
   * @returns Dataset object with all details
   * @throws {BlockchainError} When dataset query fails
   *
   * @example
   * ```typescript
   * const dataset = await vana.dataset.getDataset(1);
   * console.log(`Owner: ${dataset.owner}`);
   * console.log(`Pending: ${dataset.pendingFileIds.length}`);
   * console.log(`Accepted: ${dataset.fileIds.length}`);
   * ```
   */
  async getDataset(datasetId: number): Promise<Dataset> {
    try {
      const chainId = await this.context.publicClient.getChainId();
      const address = getContractAddress(chainId, "DatasetRegistry");
      const abi = getAbi("DatasetRegistry");

      const contract = getContract({
        address,
        abi,
        client: this.context.publicClient,
      });

      const data = (await contract.read.getDataset([BigInt(datasetId)])) as any;

      // Map contract struct to SDK type
      return {
        owner: data.owner as `0x${string}`,
        pendingFileIds: data.pendingFileIds.map(Number),
        fileIds: data.fileIds.map(Number),
        schemaId: Number(data.schemaId),
        createdAt: Number(data.createdAt),
      };
    } catch (error) {
      throw new BlockchainError(
        `Failed to get dataset: ${error instanceof Error ? error.message : String(error)}`,
        error as Error,
      );
    }
  }

  /**
   * Get all datasets owned by a specific address.
   *
   * @remarks
   * Queries all datasets created by the specified owner. Uses the subgraph
   * when available for efficient querying, with fallback to RPC via event
   * logs and multicall for guaranteed real-time accuracy.
   *
   * This method will be optimized when datasets are added to the subgraph.
   * Until then, it efficiently queries the chain using event logs to find
   * dataset IDs, then uses multicall to batch-read dataset details.
   *
   * @param params - Query parameters
   * @param params.owner - Owner address to query datasets for
   * @param params.subgraphUrl - Optional custom subgraph URL
   * @param options - Optional consistency and pagination settings
   * @returns Array of datasets with their IDs
   * @throws {BlockchainError} When dataset query fails
   *
   * @example
   * ```typescript
   * // Get all datasets for an address
   * const datasets = await vana.dataset.getUserDatasets({
   *   owner: "0x123..."
   * });
   *
   * // With pagination
   * const page1 = await vana.dataset.getUserDatasets(
   *   { owner: "0x123..." },
   *   { limit: 10, offset: 0 }
   * );
   *
   * // Require recent data from chain
   * const recent = await vana.dataset.getUserDatasets(
   *   { owner: "0x123..." },
   *   { source: "chain" }
   * );
   * ```
   */
  async getUserDatasets(
    params: {
      owner: Address;
      subgraphUrl?: string;
    },
    options?: ConsistencyOptions & PaginationOptions,
  ): Promise<Array<Dataset & { id: number }>> {
    const { owner } = params;

    // Note: Subgraph doesn't have dataset entities yet, so we always use chain
    // This will be optimized when datasets are added to the subgraph schema
    const dataSource = "chain";

    // For now, we only support chain queries
    // Future: Add subgraph query path when datasets are in the subgraph
    if (dataSource === "chain") {
      try {
        const chainId = await this.context.publicClient.getChainId();
        const contractAddress = getContractAddress(chainId, "DatasetRegistry");
        const abi = getAbi("DatasetRegistry");

        // Strategy: Batch-read datasets with multicall, starting from ID 1
        // Dataset IDs are sequential, so we stop as soon as we hit a non-existent dataset
        // This avoids eth_getLogs which has range limits

        const BATCH_SIZE = 100; // Read 100 datasets at a time
        const MAX_DATASET_ID = 100000; // Safety limit to prevent infinite loops

        let currentId = 1;
        const userDatasets: Array<Dataset & { id: number }> = [];
        let reachedEnd = false;

        while (currentId <= MAX_DATASET_ID && !reachedEnd) {
          // Build batch of calls
          const batchEnd = Math.min(currentId + BATCH_SIZE, MAX_DATASET_ID + 1);
          const calls = [];
          for (let id = currentId; id < batchEnd; id++) {
            calls.push({
              address: contractAddress,
              abi,
              functionName: "getDataset",
              args: [BigInt(id)],
            });
          }

          // Batch-read datasets using multicall
          const results = await gasAwareMulticall(
            this.context.publicClient,
            {
              contracts: calls,
              allowFailure: true,
            },
            {
              allowFailure: true,
            },
          );

          // Process results and filter by owner
          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const datasetId = currentId + i;

            // If we hit a non-existent dataset (failed call or zero owner), we've reached the end
            if (result.status === "failure" || !result.result) {
              reachedEnd = true;
              break;
            }

            const data = result.result as any;
            const datasetOwner = data.owner as `0x${string}`;

            // Check for zero address (non-existent dataset)
            if (
              !datasetOwner ||
              datasetOwner === "0x0000000000000000000000000000000000000000"
            ) {
              reachedEnd = true;
              break;
            }

            // If this dataset is owned by the user, add it
            if (datasetOwner.toLowerCase() === owner.toLowerCase()) {
              userDatasets.push({
                id: datasetId,
                owner: datasetOwner,
                pendingFileIds: data.pendingFileIds.map(Number),
                fileIds: data.fileIds.map(Number),
                schemaId: Number(data.schemaId),
                createdAt: Number(data.createdAt),
              });
            }
          }

          currentId = batchEnd;
        }

        // Apply pagination to results
        const limit = options?.fetchAll
          ? userDatasets.length
          : (options?.limit ?? 100);
        const offset = options?.offset ?? 0;

        // Sort by creation time descending (most recent first)
        userDatasets.sort((a, b) => b.createdAt - a.createdAt);

        return userDatasets.slice(offset, offset + limit);
      } catch (error) {
        throw new BlockchainError(
          `Failed to get user datasets: ${error instanceof Error ? error.message : String(error)}`,
          error as Error,
        );
      }
    }

    // Future: When subgraph has dataset entities, implement this path
    // For now, this code path is unreachable but prepared for future enhancement
    throw new Error("Subgraph dataset queries not yet implemented");
  }
}
