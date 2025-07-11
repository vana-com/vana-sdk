import { Button } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { CopyButton } from "./CopyButton";

interface AddressDisplayProps {
  address: string;
  label?: string;
  explorerUrl?: string;
  showCopy?: boolean;
  showExternalLink?: boolean;
  truncate?: boolean;
  className?: string;
}

export function AddressDisplay({
  address,
  label,
  explorerUrl,
  showCopy = true,
  showExternalLink = true,
  truncate = true,
  className = "",
}: AddressDisplayProps) {
  const displayAddress = truncate
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && <span className="text-sm font-medium">{label}:</span>}
      <span className="font-mono text-sm cursor-default" title={address}>
        {displayAddress}
      </span>
      {showCopy && (
        <CopyButton
          value={address}
          isInline
          size="sm"
          variant="flat"
          tooltip="Copy address"
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
        >
          <ExternalLink className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
