import { Button } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { getBlockUrl } from "@/lib/explorer";
import { useChainId } from "wagmi";

interface BlockDisplayProps {
  blockNumber: bigint | number;
  explorerUrl?: string;
  showExternalLink?: boolean;
  className?: string;
}

export function BlockDisplay({
  blockNumber,
  explorerUrl,
  showExternalLink = true,
  className = "",
}: BlockDisplayProps) {
  const chainId = useChainId();
  const blockNum =
    typeof blockNumber === "bigint"
      ? blockNumber.toString()
      : blockNumber.toString();
  const blockUrl = explorerUrl
    ? `${explorerUrl}/block/${blockNum}`
    : getBlockUrl(chainId, blockNumber);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="font-mono text-sm">#{blockNum}</span>
      {showExternalLink && (
        <Button
          size="sm"
          variant="light"
          as="a"
          href={blockUrl}
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
