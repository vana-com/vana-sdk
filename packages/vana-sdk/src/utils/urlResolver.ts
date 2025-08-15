/**
 * Universal URL resolver for the Vana SDK
 *
 * Handles fetching data from various protocols (IPFS, HTTP, Arweave, etc.)
 * in a consistent, reliable way.
 */

import { convertIpfsUrl, IPFS_GATEWAYS } from "./ipfs";

/**
 * Error thrown when URL resolution fails
 */
export class UrlResolutionError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = "UrlResolutionError";
  }
}

/**
 * Fetches and parses JSON data from any supported URL protocol
 *
 * @param url - The URL to fetch from (supports ipfs://, https://, http://, ar://)
 * @returns Promise resolving to the parsed JSON data
 * @throws {UrlResolutionError} When the URL cannot be resolved or parsed
 *
 * @example
 * ```typescript
 * // Fetch from IPFS
 * const data = await fetchFromUrl("ipfs://QmXxx...");
 *
 * // Fetch from HTTPS
 * const data = await fetchFromUrl("https://example.com/data.json");
 *
 * // Handles protocol conversion internally
 * const schema = await fetchFromUrl(schemaDefinitionUrl);
 * ```
 */
export async function fetchFromUrl(url: string): Promise<unknown> {
  try {
    // Convert protocol-specific URLs to HTTP
    const httpUrl = resolveToHttp(url);

    // Fetch with retry logic for IPFS
    const response = await fetchWithRetry(httpUrl, url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Parse JSON response
    const data = await response.json();
    return data;
  } catch (error) {
    throw new UrlResolutionError(
      `Failed to fetch from ${url}: ${error instanceof Error ? error.message : "Unknown error"}`,
      url,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Converts any supported protocol URL to HTTP(S)
 *
 * @param url - The URL to convert
 * @returns HTTP(S) URL that can be fetched
 */
function resolveToHttp(url: string): string {
  // IPFS protocol
  if (url.startsWith("ipfs://")) {
    return convertIpfsUrl(url);
  }

  // Arweave protocol
  if (url.startsWith("ar://")) {
    const txId = url.replace("ar://", "");
    return `https://arweave.net/${txId}`;
  }

  // Already HTTP(S)
  if (url.startsWith("https://") || url.startsWith("http://")) {
    return url;
  }

  throw new Error(`Unsupported protocol in URL: ${url}`);
}

/**
 * Fetches with retry logic, particularly useful for IPFS gateways
 *
 * @param httpUrl - The HTTP URL to fetch
 * @param originalUrl - The original URL (for IPFS gateway retry)
 * @returns Response from successful fetch
 */
async function fetchWithRetry(
  httpUrl: string,
  originalUrl: string,
): Promise<Response> {
  // First attempt
  try {
    const response = await fetch(httpUrl);
    if (response.ok) return response;
  } catch {
    // Continue to retry logic
  }

  // If original was IPFS and first gateway failed, try alternatives
  if (originalUrl.startsWith("ipfs://")) {
    for (const gateway of IPFS_GATEWAYS) {
      try {
        const alternativeUrl = convertIpfsUrl(originalUrl, gateway);
        if (alternativeUrl === httpUrl) continue; // Skip already tried

        const response = await fetch(alternativeUrl);
        if (response.ok) return response;
      } catch {
        // Try next gateway
      }
    }
  }

  // Final attempt at original URL
  return fetch(httpUrl);
}
