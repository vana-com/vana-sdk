import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert an IPFS URL to an HTTP gateway URL
 */
export function getIpfsGatewayUrl(ipfsUrl: string): string {
  if (ipfsUrl.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${ipfsUrl.replace("ipfs://", "")}`;
  }
  return ipfsUrl;
}
