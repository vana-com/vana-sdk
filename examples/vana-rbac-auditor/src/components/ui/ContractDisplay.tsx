/**
 * Contract Display Component
 * Shows contract names with copy address and explorer link
 */
"use client";

import { Button, Tooltip } from "@heroui/react";
import { Copy, ExternalLink, Check, FileCode } from "lucide-react";
import type { Address } from "viem";
import { useState } from "react";
import type { Network } from "../../lib/types";
import { getExplorerUrl, copyToClipboard, formatAddress } from "../../lib/utils";
import { getContractDisplayName } from "../../config/contracts";

interface ContractDisplayProps {
  name: string;
  address: Address;
  network: Network;
  showCopy?: boolean;
  showExplorer?: boolean;
  showIcon?: boolean;
}

/**
 * ContractDisplay shows contract names with technical details
 */
export function ContractDisplay({
  name,
  address,
  network,
  showCopy = true,
  showExplorer = true,
  showIcon = false,
}: ContractDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(address);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const displayName = getContractDisplayName(name);
  const truncatedAddress = formatAddress(address);

  return (
    <div className="flex items-center gap-2">
      {showIcon && (
        <FileCode className="h-4 w-4 text-primary flex-shrink-0" />
      )}

      <Tooltip content={`${address}\n${truncatedAddress}`}>
        <span
          className="font-medium text-foreground cursor-help"
          aria-label={`Contract: ${displayName}`}
        >
          {displayName}
        </span>
      </Tooltip>

      {(showCopy || showExplorer) && (
        <div className="flex gap-1">
          {showCopy && (
            <Tooltip content={copied ? "Copied!" : "Copy contract address"}>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={handleCopy}
                className="min-w-unit-6 w-unit-6 h-unit-6"
                aria-label="Copy contract address"
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
            <Tooltip content="View contract on explorer">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                as="a"
                href={getExplorerUrl("address", address, network)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-unit-6 w-unit-6 h-unit-6"
                aria-label="View contract on block explorer"
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
