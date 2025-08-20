/**
 * Universal download utility with CORS bypass and IPFS gateway fallbacks
 *
 * @category Utilities
 */

import { fetchWithFallbacks, extractIpfsHash } from "./ipfs";

/**
 * Fetch content with automatic fallbacks for CORS and IPFS
 *
 * @remarks
 * This utility provides a robust download mechanism that handles:
 * 1. Direct fetch for regular URLs
 * 2. Download relayer for CORS-restricted URLs
 * 3. IPFS gateway fallbacks for IPFS content
 *
 * The function automatically determines the best strategy based on the URL
 * and available configuration, providing transparent fallback behavior.
 *
 * @param url - The URL to fetch (HTTP, HTTPS, or IPFS)
 * @param downloadRelayer - Optional download relayer for CORS bypass
 * @param downloadRelayer.proxyDownload - Function to proxy downloads through application server
 * @returns Promise resolving to Response object
 * @throws Error if all download attempts fail
 * @example
 * ```typescript
 * // With download relayer configured
 * const response = await fetchWithRelayer(
 *   'https://drive.google.com/file.json',
 *   vana.downloadRelayer
 * );
 * const data = await response.json();
 *
 * // IPFS URL - will use gateway fallbacks
 * const ipfsResponse = await fetchWithRelayer('ipfs://QmHash123');
 * const content = await ipfsResponse.text();
 * ```
 */
export async function fetchWithRelayer(
  url: string,
  downloadRelayer?: { proxyDownload: (url: string) => Promise<Blob> },
): Promise<Response> {
  // Handle Arweave URLs
  let processedUrl = url;
  if (url.startsWith("ar://")) {
    const txId = url.replace("ar://", "");
    processedUrl = `https://arweave.net/${txId}`;
  }

  // For IPFS URLs, use the IPFS fallback mechanism
  const ipfsHash = extractIpfsHash(processedUrl);
  if (ipfsHash) {
    try {
      return await fetchWithFallbacks(url);
    } catch (ipfsError) {
      // If all IPFS gateways fail and we have a relayer, try it as last resort
      if (downloadRelayer) {
        try {
          // Try with the first gateway URL format
          const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
          const blob = await downloadRelayer.proxyDownload(gatewayUrl);
          return new Response(blob);
        } catch {
          // Re-throw original IPFS error
          throw ipfsError;
        }
      }
      throw ipfsError;
    }
  }

  // For non-IPFS URLs, try direct then relayer
  try {
    const response = await fetch(processedUrl);
    return response;
  } catch (error) {
    // Try download relayer if configured
    if (downloadRelayer) {
      try {
        const blob = await downloadRelayer.proxyDownload(processedUrl);
        return new Response(blob);
      } catch {
        // Re-throw original error
        throw error;
      }
    }
    throw new Error(
      `Failed to fetch from ${processedUrl}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
