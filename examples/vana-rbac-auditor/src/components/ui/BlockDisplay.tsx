/**
 * Block Display Component
 * Shows block numbers with copy and explorer link
 */
"use client";

import { Button, Tooltip } from "@heroui/react";
import { Copy, ExternalLink, Check } from "lucide-react";
import { useState } from "react";
import type { Network } from "../../lib/types";
import { formatNumber, getExplorerUrl, copyToClipboard } from "../../lib/utils";

interface BlockDisplayProps {
  block: number;
  network: Network;
  showCopy?: boolean;
  showExplorer?: boolean;
  compact?: boolean;
}

/**
 * BlockDisplay shows block numbers with actions
 */
export function BlockDisplay({
  block,
  network,
  showCopy = true,
  showExplorer = true,
  compact = false,
}: BlockDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(block.toString());
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formattedBlock = formatNumber(block);

  return (
    <div className="flex items-center gap-2">
      <Tooltip content={`Block #${formattedBlock}`}>
        <code
          className={`font-mono ${compact ? "text-xs" : "text-sm"} text-default-500 cursor-help`}
          aria-label={`Block number ${block}`}
        >
          {formattedBlock}
        </code>
      </Tooltip>

      {(showCopy || showExplorer) && (
        <div className="flex gap-1">
          {showCopy && (
            <Tooltip content={copied ? "Copied!" : "Copy block number"}>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={handleCopy}
                className="min-w-unit-6 w-unit-6 h-unit-6"
                aria-label="Copy block number"
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
            <Tooltip content="View block on explorer">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                as="a"
                href={getExplorerUrl("block", block.toString(), network)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-unit-6 w-unit-6 h-unit-6"
                aria-label="View block on block explorer"
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
