/**
 * Safe Transaction Builder export functionality
 *
 * @remarks
 * Converts batches to Safe Transaction Builder JSON format for multi-sig execution.
 * Maintains compatibility with Safe UI's import feature.
 *
 * @category Batch Builder
 * @module export
 */

import type { Network } from "../types";
import type { Batch, BatchOperation } from "./builder-types";
import type { SafeBatchFile, SafeMetadata, SafeTransaction } from "./types";
import { operationToSafeTransaction } from "./operations";

/**
 * Converts network to chain ID string
 *
 * @remarks
 * Safe requires chain ID as string, not number.
 *
 * @param network - Network name
 * @returns Chain ID as string
 */
function networkToChainId(network: Network): string {
  return network === "mainnet" ? "1480" : "14800";
}

/**
 * Generates Safe batch metadata
 *
 * @remarks
 * Creates metadata following Safe Transaction Builder schema.
 * Safe UI will populate createdFromSafeAddress and createdFromOwnerAddress
 * on import, so we leave them empty.
 *
 * @param name - Batch name
 * @param description - Batch description
 * @returns Safe metadata object
 */
function createSafeMetadata(name: string, description?: string): SafeMetadata {
  return {
    name,
    description: description ?? "",
    txBuilderVersion: "1.16.5",
    createdFromSafeAddress: "",
    createdFromOwnerAddress: "",
    checksum: "", // Safe regenerates this
  };
}

/**
 * Converts a batch operation to Safe transaction format
 *
 * @param operation - Batch operation
 * @returns Safe transaction object
 */
function batchOperationToSafeTransaction(
  operation: BatchOperation,
): SafeTransaction {
  return operationToSafeTransaction({
    type: operation.type,
    contract: operation.contract,
    method: operation.method,
    parameters: operation.parameters,
    metadata: operation.metadata,
  });
}

/**
 * Exports a batch to Safe Transaction Builder JSON format
 *
 * @remarks
 * Creates a JSON file compatible with Safe Transaction Builder UI.
 * The returned object can be serialized and imported into Safe for
 * multi-sig execution.
 *
 * **Safe Compatibility:**
 * - Version: 1.0 (Safe schema version)
 * - All addresses are checksummed via viem's getAddress
 * - Chain ID provided as string
 * - Transactions maintain insertion order
 *
 * @param batch - Batch to export
 * @returns Safe batch file ready for JSON.stringify()
 *
 * @example
 * ```typescript
 * const batch = builder.toBatch();
 * const safeFile = exportToSafeJSON(batch);
 *
 * // Download as JSON file
 * const json = JSON.stringify(safeFile, null, 2);
 * const blob = new Blob([json], { type: "application/json" });
 * const url = URL.createObjectURL(blob);
 * // Trigger download...
 * ```
 */
export function exportToSafeJSON(batch: Batch): SafeBatchFile {
  const transactions = batch.operations.map(batchOperationToSafeTransaction);

  return {
    version: "1.0",
    chainId: networkToChainId(batch.network),
    createdAt: batch.createdAt,
    meta: createSafeMetadata(batch.name, batch.description),
    transactions,
  };
}

/**
 * Downloads a batch as Safe JSON file
 *
 * @remarks
 * Convenience function for browser environments. Creates a download
 * link and triggers the download automatically.
 *
 * @param batch - Batch to download
 * @param filename - Optional custom filename (defaults to batch name)
 *
 * @example
 * ```typescript
 * const batch = builder.toBatch();
 * downloadSafeJSON(batch); // Downloads "Test Batch.json"
 * downloadSafeJSON(batch, "my-custom-batch.json");
 * ```
 */
export function downloadSafeJSON(batch: Batch, filename?: string): void {
  const safeFile = exportToSafeJSON(batch);
  const json = JSON.stringify(safeFile, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename ?? `${batch.name}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates a descriptive filename for a batch export
 *
 * @remarks
 * Creates a sanitized filename from batch metadata.
 *
 * @param batch - Batch to generate filename for
 * @returns Safe filename (sanitized, with .json extension)
 *
 * @example
 * ```typescript
 * const name = generateSafeFilename(batch);
 * // "Q4-Permission-Cleanup-mainnet-2025-10-20.json"
 * ```
 */
export function generateSafeFilename(batch: Batch): string {
  const date = new Date(batch.createdAt);
  const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD

  // Sanitize batch name for filename
  const safeName = batch.name
    .replace(/[^a-zA-Z0-9-_\s]/g, "") // Remove special chars
    .replace(/\s+/g, "-") // Spaces to hyphens
    .substring(0, 50); // Limit length

  return `${safeName}-${batch.network}-${dateStr}.json`;
}
