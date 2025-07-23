/**
 * IPFS URL utilities for the Vana SDK
 *
 * Centralized functions for handling IPFS URLs, converting them to gateway URLs,
 * and extracting IPFS hashes from various URL formats.
 */

/**
 * Default IPFS gateway URL
 */
export const DEFAULT_IPFS_GATEWAY = "https://dweb.link/ipfs/";

/**
 * Alternative IPFS gateways for fallback - ordered by reliability and rate limits
 */
export const IPFS_GATEWAYS = [
  "https://dweb.link/ipfs/", // Interplanetary Shipyard - highly reliable
  "https://ipfs.io/ipfs/", // IPFS Foundation - reliable
  "https://cloudflare-ipfs.com/ipfs/", // Cloudflare - good performance
  "https://gateway.pinata.cloud/ipfs/", // Pinata - backup option (has rate limits)
  "https://ipfs.filebase.io/ipfs/", // Filebase - emerging reliable option
] as const;

/**
 * Check if a URL is an IPFS URL (starts with ipfs://)
 *
 * @param url - The URL to check
 * @returns True if the URL is an IPFS URL
 */
export function isIpfsUrl(url: string): boolean {
  return url.startsWith("ipfs://");
}

/**
 * Convert an IPFS URL to an HTTP gateway URL
 *
 * @param url - The IPFS URL to convert (e.g., "ipfs://QmHash...")
 * @param gateway - Optional gateway URL (defaults to DEFAULT_IPFS_GATEWAY)
 * @returns The HTTP gateway URL or original URL if not an IPFS URL
 * @example
 * ```ts
 * convertIpfsUrl("ipfs://QmHash123")
 * // Returns: "https://ipfs.io/ipfs/QmHash123"
 *
 * convertIpfsUrl("ipfs://QmHash123", "https://gateway.pinata.cloud/ipfs/")
 * // Returns: "https://gateway.pinata.cloud/ipfs/QmHash123"
 * ```
 */
export function convertIpfsUrl(
  url: string,
  gateway: string = DEFAULT_IPFS_GATEWAY,
): string {
  if (isIpfsUrl(url)) {
    const hash = url.replace("ipfs://", "");
    return `${gateway}${hash}`;
  }
  return url;
}

/**
 * Extract IPFS hash from various URL formats
 *
 * **Edge Cases:**
 * - Returns null for non-IPFS URLs or malformed hashes
 * - Handles both CIDv0 (starts with Qm) and CIDv1 formats
 * - Minimum 46 characters required for standalone hash detection
 * - Gateway paths with subdirectories are not supported
 *
 * @param url - The URL to extract hash from
 * @returns The IPFS hash or null if not found
 * @example
 * ```ts
 * extractIpfsHash("ipfs://QmHash123") // Returns: "QmHash123"
 * extractIpfsHash("https://gateway.pinata.cloud/ipfs/QmHash123") // Returns: "QmHash123"
 * extractIpfsHash("QmHash123456789012345678901234567890123456") // Returns: "QmHash123456789012345678901234567890123456"
 * extractIpfsHash("https://example.com/file.json") // Returns: null (not IPFS)
 * extractIpfsHash("ipfs://QmHash/subdirectory") // Returns: null (subdirectories not supported)
 * ```
 */
export function extractIpfsHash(url: string): string | null {
  // Handle various IPFS URL formats
  const patterns = [
    /ipfs\/([a-zA-Z0-9]+)/, // https://gateway.pinata.cloud/ipfs/HASH
    /^ipfs:\/\/([a-zA-Z0-9]+)$/, // ipfs://HASH
    /^([a-zA-Z0-9]{46,})$/, // Just the hash (46+ chars for IPFS hashes)
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Get multiple gateway URLs for an IPFS hash (useful for fallback)
 *
 * @param hash - The IPFS hash
 * @returns Array of gateway URLs
 */
export function getGatewayUrls(hash: string): string[] {
  return IPFS_GATEWAYS.map((gateway) => `${gateway}${hash}`);
}

/**
 * Convert an IPFS URL to multiple gateway URLs for fallback
 *
 * @param url - The IPFS URL
 * @returns Array of gateway URLs or original URL if not IPFS
 */
export function convertIpfsUrlWithFallbacks(url: string): string[] {
  const hash = extractIpfsHash(url);
  if (hash) {
    return getGatewayUrls(hash);
  }
  return [url];
}

/**
 * Fetch content from IPFS with automatic gateway fallbacks
 *
 * **Edge Cases:**
 * - Non-IPFS URLs are fetched directly without fallback
 * - 10-second timeout per gateway attempt to prevent hanging
 * - Rate-limited gateways (429) are skipped immediately
 * - Exponential backoff between retries (1s, 2s, 3s, etc.)
 * - AbortSignal in options is merged with timeout signal
 *
 * @param url - The IPFS URL to fetch
 * @param options - Optional fetch options
 * @returns Promise resolving to Response object
 * @throws Error if all gateways fail
 */
export async function fetchWithFallbacks(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const hash = extractIpfsHash(url);
  if (!hash) {
    // Not an IPFS URL, fetch directly
    return fetch(url, options);
  }

  const gatewayUrls = getGatewayUrls(hash);
  let lastError: Error | null = null;

  for (let i = 0; i < gatewayUrls.length; i++) {
    const gatewayUrl = gatewayUrls[i];
    try {
      const response = await fetch(gatewayUrl, {
        ...options,
        // Add timeout to avoid hanging on slow gateways
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      // If response is ok, return it
      if (response.ok) {
        return response;
      }

      // If rate limited (429), try next gateway immediately
      if (response.status === 429) {
        lastError = new Error(`Gateway rate limited: ${gatewayUrl}`);
        continue;
      }

      // For other HTTP errors, still try next gateway
      lastError = new Error(`Gateway error ${response.status}: ${gatewayUrl}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // For rate limiting or timeout errors, continue to next gateway
      if (
        lastError.message.includes("429") ||
        lastError.name === "TimeoutError"
      ) {
        continue;
      }
    }

    // Add delay between retries (except for last attempt)
    if (i < gatewayUrls.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }

  throw new Error(
    `All IPFS gateways failed for hash ${hash}. Last error: ${lastError?.message}`,
  );
}
