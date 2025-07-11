import { Button } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { CopyButton } from "./CopyButton";

interface FileIdDisplayProps {
  fileId: number | string;
  label?: string;
  chainId?: number;
  showCopy?: boolean;
  showExternalLink?: boolean;
  className?: string;
}

// Block explorer URLs for different chains
const getBlockExplorerUrl = (chainId: number, _fileId: number | string) => {
  const baseUrls: Record<number, string> = {
    14800: "https://moksha.vanascan.io", // Moksha testnet
    1480: "https://vanascan.io", // Vana mainnet
  };

  const baseUrl = baseUrls[chainId];
  if (!baseUrl) return null;

  // TODO: Update this URL pattern when the block explorer supports file lookups
  // For now, link to the Data Registry contract
  return `${baseUrl}/address/0x...#readContract`;
};

export function FileIdDisplay({
  fileId,
  label,
  chainId = 14800,
  showCopy = true,
  showExternalLink = true,
  className = "",
}: FileIdDisplayProps) {
  const displayFileId = `#${fileId}`;
  const explorerUrl = showExternalLink
    ? getBlockExplorerUrl(chainId, fileId)
    : null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && <span className="text-sm font-medium">{label}:</span>}
      <span
        className="font-mono text-sm cursor-default"
        title={`File ID: ${fileId}`}
      >
        {displayFileId}
      </span>
      {showCopy && (
        <CopyButton
          value={fileId.toString()}
          isInline
          size="sm"
          variant="flat"
          tooltip="Copy file ID"
        />
      )}
      {showExternalLink && explorerUrl && (
        <Button
          size="sm"
          variant="flat"
          isIconOnly
          as="a"
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="View in block explorer"
        >
          <ExternalLink className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
