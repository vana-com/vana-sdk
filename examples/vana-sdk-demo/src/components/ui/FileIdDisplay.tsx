import { Button } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { CopyButton } from "./CopyButton";
import { getContractAddress } from "vana-sdk";
import { keccak256, toBytes } from "viem";

interface FileIdDisplayProps {
  fileId: number | string;
  label?: string;
  chainId?: number;
  showCopy?: boolean;
  showExternalLink?: boolean;
  className?: string;
}

// Calculate function selector hash for DataRegistry functions
const getFunctionHash = (functionSignature: string): string => {
  // Function selector is the first 4 bytes of keccak256 hash of the function signature
  const hash = keccak256(toBytes(functionSignature));
  // Return first 4 bytes (8 hex characters after 0x)
  return hash.slice(0, 10);
};

// Block explorer URLs for different chains
const getBlockExplorerUrl = (chainId: number, _fileId: number | string) => {
  const baseUrls: Record<number, string> = {
    14800: "https://moksha.vanascan.io", // Moksha testnet
    1480: "https://vanascan.io", // Vana mainnet
  };

  const baseUrl = baseUrls[chainId];
  if (!baseUrl) return null;

  try {
    // Get DataRegistry contract address using SDK
    const contractAddress = getContractAddress(chainId, "DataRegistry");

    // Get function hash for the files getter function
    const functionHash = getFunctionHash("files(uint256)");

    // Link to the specific function in the DataRegistry contract
    // Users can then directly access the files(uint256) function to look up file details
    return `${baseUrl}/address/${contractAddress}?tab=read_write_proxy#${functionHash}`;
  } catch (error) {
    console.warn(
      `Failed to get DataRegistry address for chain ${chainId}:`,
      error,
    );
    return null;
  }
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
