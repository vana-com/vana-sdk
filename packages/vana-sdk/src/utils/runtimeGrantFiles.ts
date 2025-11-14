import type {
  RuntimePermissionParams,
  RuntimeGrantFile,
} from "../types/runtimePermissions";
import { NetworkError } from "../errors";

/**
 * Creates runtime grant file structure for permission storage
 *
 * @remarks
 * Similar to createGrantFile() but for runtime permissions.
 * Constructs the JSON structure that will be stored on IPFS.
 *
 * @param params - Permission parameters to create the grant file from
 * @returns Grant file object for IPFS storage
 *
 * @category Runtime Permissions
 * @example
 * ```typescript
 * const grantFile = createRuntimeGrantFile({
 *   datasetId: 123n,
 *   grantee: "0x...",
 *   task: "thinker/task:v1",
 *   operation: "aggregate_keywords",
 *   pricing: { price_per_file_vana: 0.1 },
 *   endBlock: 2000000n
 * });
 * ```
 */
export function createRuntimeGrantFile(
  params: RuntimePermissionParams,
): RuntimeGrantFile {
  return {
    grantee: params.grantee,
    task: params.task,
    operation: params.operation,
    pricing: {
      price_per_file_vana: params.pricing.price_per_file_vana,
      ...(params.pricing.minimum_price_vana && {
        minimum_price_vana: params.pricing.minimum_price_vana,
      }),
      ...(params.pricing.maximum_price_vana && {
        maximum_price_vana: params.pricing.maximum_price_vana,
      }),
    },
    parameters: params.parameters ?? {},
  };
}

/**
 * Stores grant file via relayer or direct IPFS
 *
 * @remarks
 * Reuses the same upload pattern as data portability grants.
 * If relayerUrl is provided, uploads via relayer. Otherwise, requires storageManager.
 *
 * @param grantFile - The grant file to store
 * @param relayerUrl - Optional URL of the relayer service
 * @returns Promise resolving to the IPFS URL
 * @throws {NetworkError} When the upload fails
 *
 * @category Runtime Permissions
 * @example
 * ```typescript
 * const grantFile = createRuntimeGrantFile(params);
 * const ipfsUrl = await storeRuntimeGrantFile(grantFile, relayerUrl);
 * console.log(`Grant stored at: ${ipfsUrl}`);
 * ```
 */
export async function storeRuntimeGrantFile(
  grantFile: RuntimeGrantFile,
  relayerUrl?: string,
): Promise<string> {
  if (relayerUrl) {
    // Use relayer if available
    const response = await fetch(`${relayerUrl}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(grantFile),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new NetworkError(
        `Failed to upload grant file via relayer: ${errorText}`,
      );
    }

    const data = await response.json();
    if (!data.url) {
      throw new NetworkError("Relayer did not return a URL");
    }

    return data.url;
  } else {
    // Direct IPFS upload would require storageManager
    // For now, throw error - can be implemented if needed
    throw new Error(
      "Direct IPFS upload not yet implemented. Use relayer or provide grantUrl.",
    );
  }
}

/**
 * Retrieves grant file from IPFS
 *
 * @remarks
 * Converts ipfs:// URLs to gateway URLs and fetches the grant file.
 * Uses Pinata gateway by default.
 *
 * @param ipfsHash - IPFS hash or full IPFS URL
 * @returns Promise resolving to the parsed grant file
 * @throws {NetworkError} When the fetch fails
 *
 * @category Runtime Permissions
 * @example
 * ```typescript
 * const permission = await sdk.runtimePermissions.getPermission(1024n);
 * const grantFile = await retrieveRuntimeGrantFile(permission.grant);
 * console.log(`Price: ${grantFile.pricing.price_per_file_vana} VANA`);
 * ```
 */
export async function retrieveRuntimeGrantFile(
  ipfsHash: string,
): Promise<RuntimeGrantFile> {
  // Convert ipfs:// to gateway URL if needed
  const url = ipfsHash.startsWith("ipfs://")
    ? `https://gateway.pinata.cloud/ipfs/${ipfsHash.slice(7)}`
    : ipfsHash.startsWith("http")
      ? ipfsHash
      : `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new NetworkError(
      `Failed to fetch grant file from ${url}: ${response.statusText}`,
    );
  }

  return await response.json();
}
