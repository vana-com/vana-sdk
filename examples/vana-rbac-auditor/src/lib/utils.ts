import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Address } from "viem";
import { vanaMainnet, mokshaTestnet } from "@opendatalabs/vana-sdk/browser";
import type { Network } from "./types";

/**
 * Merge Tailwind classes with clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format address to shortened form: 0x1234...5678
 */
export function formatAddress(address: Address, chars = 4): string {
  return `${address.slice(0, 6)}...${address.slice(-chars)}`;
}

/**
 * Get block explorer URL for address, transaction, or block
 */
export function getExplorerUrl(
  type: "address" | "tx" | "block",
  value: string,
  network: Network
): string {
  const chain = network === "mainnet" ? vanaMainnet : mokshaTestnet;
  return `${chain.blockExplorers!.default.url}/${type}/${value}`;
}

/**
 * Format timestamp to human-readable date
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get relative time string (e.g., "2 days ago")
 */
export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp * 1000;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "just now";
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error("Failed to copy to clipboard:", error);
    return false;
  }
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}
