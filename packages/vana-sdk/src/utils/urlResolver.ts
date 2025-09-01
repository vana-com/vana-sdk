/**
 * Provides universal URL resolution across multiple protocols.
 *
 * @remarks
 * This module enables fetching data from various protocols including IPFS,
 * HTTP/HTTPS, and Arweave through a unified interface. It handles protocol
 * conversion, gateway selection, and fallback strategies automatically.
 *
 * @category Utilities
 * @module utils/urlResolver
 */

import { universalFetch } from "./download";

/**
 * Indicates that URL resolution or data fetching failed.
 *
 * @remarks
 * This error provides context about which URL failed and why,
 * making it easier to debug issues with external resources.
 *
 * @category Errors
 */
export class UrlResolutionError extends Error {
  /**
   * Creates a new URL resolution error.
   *
   * @param message - Description of what went wrong
   * @param url - The URL that failed to resolve
   * @param cause - The underlying error that caused the failure
   */
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
 * @param downloadRelayer - Optional download relayer for CORS bypass
 * @param downloadRelayer.proxyDownload - Function to proxy downloads through application server
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
export async function fetchFromUrl(
  url: string,
  downloadRelayer?: { proxyDownload: (url: string) => Promise<Blob> },
): Promise<unknown> {
  try {
    // Use unified download utility with automatic fallbacks
    const response = await universalFetch(url, downloadRelayer);

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
