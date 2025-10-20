import React from "react";
import { getTxUrl, getAddressUrl } from "@/lib/explorer";

export type ExplorerLinkType = "address" | "tx";

interface ExplorerLinkProps {
  /**
   * The type of blockchain entity to link to
   */
  type: ExplorerLinkType;
  /**
   * The hash or address to link to
   */
  hash: string;
  /**
   * The blockchain chain ID
   */
  chainId: number;
  /**
   * Optional custom label (defaults to truncated hash)
   */
  label?: string;
  /**
   * Whether to truncate the displayed hash
   * @default true
   */
  truncate?: boolean;
  /**
   * Whether to show as an external link button/icon
   * @default true
   */
  showExternalIcon?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Custom click handler (overrides default link behavior)
   */
  onClick?: (url: string) => void;
}

/**
 * ExplorerLink component for linking to blockchain explorers
 * Automatically generates the correct explorer URL based on type and chain
 */
export const ExplorerLink: React.FC<ExplorerLinkProps> = ({
  type,
  hash,
  chainId,
  label,
  truncate = true,
  showExternalIcon = true,
  className = "",
  onClick,
}) => {
  const explorerUrl =
    type === "tx" ? getTxUrl(chainId, hash) : getAddressUrl(chainId, hash);

  const displayText = label ?? (truncate ? truncateHash(hash) : hash);

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick(explorerUrl);
    }
  };

  const baseClasses = `text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors ${className}`;

  if (showExternalIcon) {
    return (
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={`inline-flex items-center gap-1 ${baseClasses}`}
      >
        <span className="font-mono text-sm">{displayText}</span>
        <ExternalLinkIcon />
      </a>
    );
  }

  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={`font-mono text-sm ${baseClasses}`}
    >
      {displayText}
    </a>
  );
};

/**
 * Truncate hash to show first 6 and last 4 characters
 */
function truncateHash(hash: string, startLength = 6, endLength = 4): string {
  if (hash.length <= startLength + endLength) {
    return hash;
  }
  return `${hash.slice(0, startLength)}...${hash.slice(-endLength)}`;
}

/**
 * Simple external link icon SVG
 */
function ExternalLinkIcon() {
  return (
    <svg
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}
