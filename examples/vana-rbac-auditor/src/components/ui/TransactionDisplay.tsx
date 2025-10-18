/**
 * Transaction Display Component
 * Shows transaction hashes with copy and explorer link
 */
"use client";

import { Button, Tooltip, Chip } from "@heroui/react";
import { Copy, ExternalLink, Check } from "lucide-react";
import type { Address } from "viem";
import { useState } from "react";
import type { Network } from "../../lib/types";
import { formatAddress, getExplorerUrl, copyToClipboard } from "../../lib/utils";

interface TransactionDisplayProps {
  txHash: Address;
  network: Network;
  showCopy?: boolean;
  showExplorer?: boolean;
  status?: "success" | "pending" | "failed";
  compact?: boolean;
}

/**
 * TransactionDisplay shows transaction hashes with actions
 */
export function TransactionDisplay({
  txHash,
  network,
  showCopy = true,
  showExplorer = true,
  status,
  compact = false,
}: TransactionDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(txHash);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const truncatedHash = formatAddress(txHash);

  const statusColor = status === "success" ? "success" : status === "failed" ? "danger" : "warning";

  return (
    <div className="flex items-center gap-2">
      {status && (
        <Chip size="sm" color={statusColor} variant="dot" />
      )}

      <Tooltip content={txHash}>
        <code
          className={`font-mono ${compact ? "text-xs" : "text-sm"} text-foreground cursor-help`}
          aria-label={`Transaction ${txHash}`}
        >
          {truncatedHash}
        </code>
      </Tooltip>

      {(showCopy || showExplorer) && (
        <div className="flex gap-1">
          {showCopy && (
            <Tooltip content={copied ? "Copied!" : "Copy transaction hash"}>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={handleCopy}
                className="min-w-unit-6 w-unit-6 h-unit-6"
                aria-label="Copy transaction hash"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </Tooltip>
          )}
          {showExplorer && (
            <Tooltip content="View transaction on explorer">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                as="a"
                href={getExplorerUrl("tx", txHash, network)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-unit-6 w-unit-6 h-unit-6"
                aria-label="View transaction on block explorer"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}
