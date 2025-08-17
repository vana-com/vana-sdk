import { Button } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { CopyButton } from "./CopyButton";
import { getContractAddress } from "@opendatalabs/vana-sdk/browser-wasm";
import { keccak256, toBytes } from "viem";
import { getContractUrl } from "@/lib/explorer";

interface RefinerIdDisplayProps {
  refinerId: number | string;
  label?: string;
  chainId?: number;
  showCopy?: boolean;
  showExternalLink?: boolean;
  className?: string;
}

// Calculate function selector hash for DataRefinerRegistry functions
const getFunctionHash = (functionSignature: string): string => {
  // Function selector is the first 4 bytes of keccak256 hash of the function signature
  const hash = keccak256(toBytes(functionSignature));
  // Return first 4 bytes (8 hex characters after 0x)
  return hash.slice(0, 10);
};

// Block explorer URLs for different chains
const getBlockExplorerUrl = (chainId: number, _refinerId: number | string) => {
  try {
    // Get DataRefinerRegistry contract address using SDK
    const contractAddress = getContractAddress(chainId, "DataRefinerRegistry");

    // Get function hash for the refiners getter function
    const functionHash = getFunctionHash("refiners(uint256)");

    // Link to the specific function in the DataRefinerRegistry contract
    // Users can then directly access the refiners(uint256) function to look up refiner details
    return getContractUrl(chainId, contractAddress, {
      tab: "read_write_proxy",
      hash: functionHash,
    });
  } catch (error) {
    console.warn(
      `Failed to get DataRefinerRegistry address for chain ${chainId}:`,
      error,
    );
    return null;
  }
};

export function RefinerIdDisplay({
  refinerId,
  label,
  chainId = 14800,
  showCopy = true,
  showExternalLink = true,
  className = "",
}: RefinerIdDisplayProps) {
  const displayRefinerId = `Refiner #${refinerId}`;
  const explorerUrl = showExternalLink
    ? getBlockExplorerUrl(chainId, refinerId)
    : null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && <span className="text-sm font-medium">{label}:</span>}
      <span
        className="font-mono text-sm cursor-default"
        title={`Refiner ID: ${refinerId}`}
      >
        {displayRefinerId}
      </span>
      {showCopy && (
        <CopyButton
          value={refinerId.toString()}
          isInline
          size="sm"
          variant="flat"
          tooltip="Copy refiner ID"
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
