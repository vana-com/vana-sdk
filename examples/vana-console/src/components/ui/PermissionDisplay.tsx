import { Button } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { getContractUrl } from "@/lib/explorer";
import { useChainId } from "wagmi";

interface PermissionDisplayProps {
  permissionId: bigint;
  showExternalLink?: boolean;
  className?: string;
}

export function PermissionDisplay({
  permissionId,
  showExternalLink = true,
  className = "",
}: PermissionDisplayProps) {
  const chainId = useChainId();

  // Calculate the hash for the contract tab URL
  const hashForUrl = `0x${permissionId.toString(16).padStart(64, "0")}`; // Use 64 chars for full uint256

  // Link to the DataPermissions contract with the permission hash
  const contractUrl = getContractUrl(
    chainId,
    "0xD54523048AdD05b4d734aFaE7C68324Ebb7373eF",
    {
      tab: "read_proxy",
      sourceAddress: "0xc0908689CDc48742B5FaF5FC23b1D1Ce4DCA9EC8",
      hash: hashForUrl,
    },
  ); // TODO: change to the correct source address and contract address

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="font-mono text-sm">{permissionId.toString()}</span>
      {showExternalLink && (
        <Button
          size="sm"
          variant="light"
          as="a"
          href={contractUrl}
          target="_blank"
          rel="noopener noreferrer"
          isIconOnly
        >
          <ExternalLink className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
