/**
 * IPFS URL utilities for the Vana SDK
 *
 * Centralized functions for handling IPFS URLs, converting them to gateway URLs,
 * and extracting IPFS hashes from various URL formats.
 */

/**
 * Default IPFS gateway URL
 */
export const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";

/**
 * Alternative IPFS gateways for fallback
 */
export const IPFS_GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
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
 *
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
 * @param url - The URL to extract hash from
 * @returns The IPFS hash or null if not found
 *
 * @example
 * ```ts
 * extractIpfsHash("ipfs://QmHash123") // Returns: "QmHash123"
 * extractIpfsHash("https://gateway.pinata.cloud/ipfs/QmHash123") // Returns: "QmHash123"
 * extractIpfsHash("QmHash123456789012345678901234567890123456") // Returns: "QmHash123456789012345678901234567890123456"
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
