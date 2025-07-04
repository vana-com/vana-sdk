import { Button } from "@/components/ui/button";
import { ExternalLink, Shield } from "lucide-react";
import { keccak256, toHex } from "viem";

interface PermissionDisplayProps {
  permissionId: number;
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
  // Calculate the hash for the contract tab URL
  const hashForUrl =
    grantHash || `0x${permissionId.toString(16).padStart(8, "0")}`;

  // Link to the PermissionRegistry contract with the permission hash
  const contractUrl = `https://moksha.vanascan.io/address/0x9f03B01A17d54c6934F2735B5d38a60C56Bf0dBe?tab=read_proxy&source_address=0xEfcd140D3b740dEfCa423fC12F4B5548E1FC0B36#${hashForUrl}`; // TODO: change to the correct explorer url and source address and contract address

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Shield className="h-4 w-4 text-muted-foreground" />
      <span className="font-mono text-sm">#{permissionId}</span>
      {showExternalLink && (
        <Button size="sm" variant="ghost" asChild className="h-6 w-6 p-0">
          <a href={contractUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3" />
          </a>
        </Button>
      )}
    </div>
  );
}
