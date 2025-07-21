import { Button } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { getContractUrl } from "@/lib/explorer";
import { useChainId } from "wagmi";

interface PermissionDisplayProps {
  permissionId: bigint;
  grantHash?: string;
  showExternalLink?: boolean;
  className?: string;
}

export function PermissionDisplay({
  permissionId,
  grantHash,
  showExternalLink = true,
  className = "",
}: PermissionDisplayProps) {
  const chainId = useChainId();

  // Calculate the hash for the contract tab URL
  const hashForUrl =
    grantHash || `0x${permissionId.toString(16).padStart(64, "0")}`; // Use 64 chars for full uint256

  // Link to the DataPortabilityPermissions contract with the permission hash
  const contractUrl = getContractUrl(
    chainId,
    "0x0d15681C472082e33Aac426C588d9d0C2264014c", // DataPortabilityPermissions contract
    {
      tab: "read_proxy",
      sourceAddress: "0xEfcd140D3b740dEfCa423fC12F4B5548E1FC0B36",
      hash: hashForUrl,
    },
  ); // TODO: Verify the correct source address for DataPortabilityPermissions

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
