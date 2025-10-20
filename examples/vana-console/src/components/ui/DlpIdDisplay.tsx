import { Button } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { CopyButton } from "./CopyButton";
import { getContractAddress } from "@opendatalabs/vana-sdk/browser";
import { keccak256, toBytes } from "viem";
import { getContractUrl } from "@/lib/explorer";

interface DlpIdDisplayProps {
  dlpId: number | string;
  label?: string;
  chainId?: number;
  showCopy?: boolean;
  showExternalLink?: boolean;
  className?: string;
}

// Calculate function selector hash for DLPRegistry functions
const getFunctionHash = (functionSignature: string): string => {
  // Function selector is the first 4 bytes of keccak256 hash of the function signature
  const hash = keccak256(toBytes(functionSignature));
  // Return first 4 bytes (8 hex characters after 0x)
  return hash.slice(0, 10);
};

// Block explorer URLs for different chains
const getBlockExplorerUrl = (chainId: number, _dlpId: number | string) => {
  try {
    // Get DLPRegistry contract address using SDK
    const contractAddress = getContractAddress(chainId, "DLPRegistry");

    // Get function hash for the dlps getter function
    const functionHash = getFunctionHash("dlps(uint256)");

    // Link to the specific function in the DLPRegistry contract
    // Users can then directly access the dlps(uint256) function to look up DLP details
    return getContractUrl(chainId, contractAddress, {
      tab: "read_write_proxy",
      hash: functionHash,
    });
  } catch (error) {
    console.warn(
      `Failed to get DLPRegistry address for chain ${chainId}:`,
      error,
    );
    return null;
  }
};

export function DlpIdDisplay({
  dlpId,
  label,
  chainId = 14800,
  showCopy = true,
  showExternalLink = true,
  className = "",
}: DlpIdDisplayProps) {
  const displayDlpId = `DLP #${dlpId}`;
  const explorerUrl = showExternalLink
    ? getBlockExplorerUrl(chainId, dlpId)
    : null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && <span className="text-sm font-medium">{label}:</span>}
      <span
        className="font-mono text-sm cursor-default"
        title={`DLP ID: ${dlpId}`}
      >
        {displayDlpId}
      </span>
      {showCopy && (
        <CopyButton
          value={dlpId.toString()}
          isInline
          size="sm"
          variant="flat"
          tooltip="Copy DLP ID"
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
