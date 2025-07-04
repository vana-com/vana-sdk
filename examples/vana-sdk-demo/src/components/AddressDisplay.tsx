import { Button } from "@/components/ui/button";
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
  className = ""
}: AddressDisplayProps) {
  const displayAddress = truncate 
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && <span className="text-sm font-medium">{label}:</span>}
      <span 
        className="font-mono text-sm cursor-default" 
        title={address}
      >
        {displayAddress}
      </span>
      {showCopy && (
        <Button
          size="sm"
          variant="ghost"
          onClick={copyToClipboard}
          className="h-6 w-6 p-0"
        >
          <Copy className="h-3 w-3" />
        </Button>
      )}
      {showExternalLink && explorerUrl && (
        <Button
          size="sm"
          variant="ghost"
          asChild
          className="h-6 w-6 p-0"
        >
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3" />
          </a>
        </Button>
      )}
    </div>
  );
}