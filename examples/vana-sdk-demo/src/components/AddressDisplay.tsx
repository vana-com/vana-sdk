import { Button } from "@heroui/react";
import { Copy, ExternalLink } from "lucide-react";

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

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch (error) {
      console.error("Failed to copy address:", error);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && <span className="text-sm font-medium">{label}:</span>}
      <span className="font-mono text-sm cursor-default" title={address}>
        {displayAddress}
      </span>
      {showCopy && (
        <Button size="sm" variant="light" onPress={copyToClipboard} isIconOnly>
          <Copy className="h-3 w-3" />
        </Button>
      )}
      {showExternalLink && explorerUrl && (
        <Button
          size="sm"
          variant="light"
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
