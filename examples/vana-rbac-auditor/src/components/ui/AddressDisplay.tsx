/**
 * Address Display Component
 * Shows address with label, copy button, and block explorer link
 */
"use client";

import { Button, Tooltip } from "@heroui/react";
import { Copy, ExternalLink } from "lucide-react";
import type { Address } from "viem";
import type { Network } from "../../lib/types";
import { formatAddress, getExplorerUrl, copyToClipboard } from "../../lib/utils";
import { useState } from "react";

interface AddressDisplayProps {
  address: Address;
  label?: string;
  network: Network;
  showCopy?: boolean;
  showExplorer?: boolean;
  compact?: boolean;
}

/**
 * AddressDisplay shows address with actions and optional label
 */
export function AddressDisplay({
  address,
  label,
  network,
  showCopy = true,
  showExplorer = true,
  compact = false,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(address);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col gap-0.5">
        {label && (
          <span className={`text-xs text-default-500 font-medium ${compact ? "truncate max-w-[120px]" : ""}`}>
            {label}
          </span>
        )}
        <Tooltip content={address} placement="bottom">
          <code className="mono text-sm text-foreground cursor-help">
            {formatAddress(address)}
          </code>
        </Tooltip>
      </div>

      {(showCopy || showExplorer) && (
        <div className="flex gap-1">
          {showCopy && (
            <Tooltip content={copied ? "Copied!" : "Copy address"}>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={handleCopy}
                className="min-w-unit-6 w-unit-6 h-unit-6"
                aria-label="Copy address to clipboard"
              >
                <Copy className={`h-3 w-3 ${copied ? "text-success" : ""}`} />
              </Button>
            </Tooltip>
          )}
          {showExplorer && (
            <Tooltip content="View on explorer">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                as="a"
                href={getExplorerUrl("address", address, network)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-unit-6 w-unit-6 h-unit-6"
                aria-label="View address on block explorer"
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
