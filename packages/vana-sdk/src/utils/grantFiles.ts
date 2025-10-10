import { keccak256, toHex } from "viem";
import type { GrantFile, GrantPermissionParams } from "../types/permissions";
import { SerializationError, NetworkError } from "../errors";

interface GrantFileStorageResponse {
  success: boolean;
  error?: string;
  url?: string;
}

/**
 * Creates grant file structure for permission storage.
 *
 * @remarks
 * Constructs JSON structure that represents a permission grant
 * in the Vana protocol. The grant file contains all necessary information
 * for a grantee to perform operations on behalf of the grantor.
 *
 * @param params - Permission parameters to create the grant file from
 * @returns Grant file object for IPFS storage
 *
 * @example
 * ```typescript
 * const grant = createGrantFile({
 *   grantee: '0x742d35Cc...',
 *   operation: 'llm_inference',
 *   parameters: { model: 'gpt-4' },
 *   expiresAt: Date.now() + 86400000 // 24 hours
 * });
 * ```
 */
export function createGrantFile(params: GrantPermissionParams): GrantFile {
  const grantFile: GrantFile = {
    grantee: params.grantee,
    operation: params.operation,
    parameters: { ...params.parameters },
  };

  // Add filters to parameters if provided
  if (params.filters) {
    grantFile.parameters.filters = params.filters;
  }

  // Add expiration if provided
  if (params.expiresAt) {
    grantFile.expires = params.expiresAt;
  }

  return grantFile;
}

/**
 * Stores a grant file in IPFS via the relayer service.
 *
 * @remarks
 * This function uploads the grant file to IPFS through the relayer's upload endpoint.
 * The returned URL can be stored on-chain as part of the permission grant, allowing
 * anyone to retrieve the detailed permission parameters later.
 *
 * @param grantFile - The grant file to store
 * @param relayerUrl - URL of the relayer service
 * @returns Promise resolving to the IPFS URL
 * @throws {NetworkError} When the upload fails or relayer is unavailable
 * @example
 * ```typescript
 * const grantFile = createGrantFile(params);
 *
 * try {
 *   const ipfsUrl = await storeGrantFile(grantFile, 'https://relayer.vana.com');
 *   console.log(`Grant file stored at: ${ipfsUrl}`);
 *   // ipfsUrl: "ipfs://QmHash123..."
 * } catch (error) {
 *   console.error('Failed to store grant file:', error);
 * }
 * ```
 */
export async function storeGrantFile(
  grantFile: GrantFile,
  relayerUrl: string,
): Promise<string> {
  try {
    // Convert grant file to blob and use IPFS upload endpoint
    const grantFileBlob = new Blob([JSON.stringify(grantFile, null, 2)], {
      type: "application/json",
    });

    const formData = new FormData();
    formData.append("file", grantFileBlob, "grant-file.json");

    const response = await fetch(`${relayerUrl}/api/ipfs/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new NetworkError(
        `Failed to store grant file: ${response.statusText}`,
        new Error(`HTTP ${response.status}`),
      );
    }

    const responseData: unknown = await response.json();
    const data = responseData as GrantFileStorageResponse;

    if (!data.success) {
      throw new NetworkError(data.error ?? "Failed to store grant file");
    }

    if (!data.url) {
      throw new NetworkError("Upload succeeded but no URL was returned");
    }
    return data.url; // The IPFS URL from the upload response
  } catch (error) {
    if (error instanceof NetworkError) {
      throw error;
    }
    throw new NetworkError(
      `Network error while storing grant file: ${error instanceof Error ? error.message : "Unknown error"}`,
      error as Error,
    );
  }
}

/**
 * Retrieves detailed grant file data from IPFS or HTTP storage.
 *
 * @remarks
 * **This is Step 2 of the performant two-step permission API.**
 *
 * Use this method to resolve detailed permission data (operation, parameters, etc.)
 * for specific grants after first getting the fast on-chain data using
 * `getUserPermissionGrantsOnChain()`. This design eliminates N+1 query problems
 * by allowing selective lazy-loading of expensive off-chain data.
 *
 * **Performance**: Single network request per grant file (typically 100-500ms).
 * **Reliability**: Tries multiple IPFS gateways as fallbacks if primary URL fails.
 *
 * @param grantUrl - The grant file URL from OnChainPermissionGrant.grantUrl
 * @param _relayerUrl - URL of the relayer service (optional, unused)
 * @param downloadRelayer - Optional download relayer for proxying CORS-restricted downloads
 * @param downloadRelayer.proxyDownload - Function to proxy download requests through application server
 * @returns Promise resolving to the complete grant file with operation details
 * @throws {NetworkError} When all retrieval attempts fail
 * @throws {SerializationError} When grant file format is invalid
 * @example
 * ```typescript
 * // Step 1: Fast on-chain data (no N+1 queries)
 * const grants = await vana.permissions.getUserPermissionGrantsOnChain();
 *
 * // Step 2: Lazy-load details for specific grant when needed
 * const grantFile = await retrieveGrantFile(grants[0].grantUrl);
 *
 * console.log(`Operation: ${grantFile.operation}`);
 * console.log(`Grantee: ${grantFile.grantee}`);
 * console.log(`Parameters:`, grantFile.parameters);
 *
 * // Only fetch details for grants user actually wants to see
 * for (const grant of selectedGrants) {
 *   const details = await retrieveGrantFile(grant.grantUrl);
 *   displayGrantDetails(details);
 * }
 * ```
 */
export async function retrieveGrantFile(
  grantUrl: string,
  _relayerUrl?: string,
  downloadRelayer?: { proxyDownload: (url: string) => Promise<Blob> },
): Promise<GrantFile> {
  try {
    // Check if the URL is a gateway URL instead of ipfs:// protocol
    if (grantUrl.startsWith("http") && grantUrl.includes("/ipfs/")) {
      console.warn(
        `⚠️  Grant URL uses HTTP gateway format instead of ipfs:// protocol. ` +
          `Found: ${grantUrl}. ` +
          `Consider using ipfs:// format for better protocol-agnostic storage.`,
      );
    }

    // Use the unified download utility
    const { universalFetch } = await import("./download");
    const response = await universalFetch(grantUrl, downloadRelayer);

    if (!response.ok) {
      throw new NetworkError(
        `Failed to retrieve grant file: HTTP ${response.status}`,
      );
    }

    const text = await response.text();
    const grantFile = JSON.parse(text);

    if (!validateGrantFile(grantFile)) {
      throw new NetworkError(`Invalid grant file format from ${grantUrl}`);
    }

    return grantFile;
  } catch (error) {
    if (error instanceof NetworkError) {
      throw error;
    }
    throw new NetworkError(
      `Error retrieving grant file: ${error instanceof Error ? error.message : "Unknown error"}`,
      error as Error,
    );
  }
}

/**
 * Generates a content hash for a grant file.
 * This can be used for integrity verification.
 *
 * @remarks
 * Creates a deterministic keccak256 hash of the grant file by first sorting
 * all object keys recursively to ensure consistent hashing regardless of
 * property order. This hash can be used to verify grant file integrity
 * or as a unique identifier.
 *
 * @param grantFile - The grant file to generate a hash for
 * @returns The keccak256 hash of the grant file as a hex string
 * @throws {SerializationError} When the grant file cannot be serialized
 * @example
 * ```typescript
 * const grantFile = {
 *   grantee: '0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36',
 *   operation: 'read',
 *   parameters: { version: '1.0', mode: 'full' }
 * };
 *
 * const hash = getGrantFileHash(grantFile);
 * console.log(`Grant file hash: ${hash}`);
 * // "0x1234567890abcdef..."
 *
 * // Same grant file with different property order produces same hash
 * const grantFile2 = {
 *   operation: 'read',
 *   parameters: { mode: 'full', version: '1.0' },
 *   grantee: '0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36'
 * };
 *
 * const hash2 = getGrantFileHash(grantFile2);
 * console.log(hash === hash2); // true
 * ```
 */
export function getGrantFileHash(grantFile: GrantFile): string {
  try {
    // Create a stable JSON representation
    const sortedFile: GrantFile = {
      grantee: grantFile.grantee,
      operation: grantFile.operation,
      parameters: sortObjectKeys(grantFile.parameters) as Record<
        string,
        unknown
      >,
    };

    // Add expires if present
    if (grantFile.expires !== undefined) {
      sortedFile.expires = grantFile.expires;
    }

    const jsonString = JSON.stringify(sortedFile);
    console.info(`Hash: ${keccak256(toHex(jsonString))}`);
    return keccak256(toHex(jsonString));
  } catch (error) {
    throw new SerializationError(
      `Failed to generate grant file hash: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Recursively sorts object keys for stable serialization.
 *
 * @param obj - The object to sort keys recursively
 * @returns The object with all keys sorted recursively
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sortObjectKeys(item));
  }

  const sortedObj: Record<string, unknown> = {};
  Object.keys(obj as Record<string, unknown>)
    .sort()
    .forEach((key) => {
      sortedObj[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    });

  return sortedObj;
}

/**
 * Validates that a grant file has the required structure.
 *
 * @remarks
 * Performs runtime validation to ensure data conforms to the GrantFile interface.
 * Checks for required fields (grantee, operation, parameters) and validates their
 * types and formats. This is a type guard function that enables TypeScript to
 * narrow the type when it returns true.
 *
 * @param data - The data to validate as a grant file
 * @returns True if the data is a valid grant file, false otherwise
 * @example
 * ```typescript
 * const unknownData = await fetch(url).then(r => r.json());
 *
 * if (validateGrantFile(unknownData)) {
 *   // TypeScript now knows unknownData is a GrantFile
 *   console.log(`Grant for operation: ${unknownData.operation}`);
 *   console.log(`Grantee: ${unknownData.grantee}`);
 * } else {
 *   throw new Error('Invalid grant file format');
 * }
 *
 * // Validation examples:
 * validateGrantFile({
 *   grantee: '0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36',
 *   operation: 'read',
 *   parameters: {}
 * }); // true
 *
 * validateGrantFile({
 *   grantee: 'invalid-address',
 *   operation: 'read',
 *   parameters: {}
 * }); // false (invalid address format)
 *
 * validateGrantFile({
 *   operation: 'read',
 *   parameters: {}
 * }); // false (missing grantee)
 * ```
 */
export function validateGrantFile(data: unknown): data is GrantFile {
  if (!data || typeof data !== "object") {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Validate required fields
  // Validate grantee address
  if (
    typeof obj.grantee !== "string" ||
    !obj.grantee.match(/^0x[a-fA-F0-9]{40}$/)
  ) {
    return false;
  }

  if (typeof obj.operation !== "string" || obj.operation.length === 0) {
    return false;
  }

  // Files are no longer stored in grant files - they're tracked in the contract

  if (!obj.parameters || typeof obj.parameters !== "object") {
    return false;
  }

  // Validate optional expires field
  if (obj.expires !== undefined) {
    if (
      typeof obj.expires !== "number" ||
      obj.expires < 0 ||
      !Number.isInteger(obj.expires)
    ) {
      return false;
    }
  }

  return true;
}
