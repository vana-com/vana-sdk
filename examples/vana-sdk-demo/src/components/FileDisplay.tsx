import { Button } from "@/components/ui/button";
import { ExternalLink, FileText } from "lucide-react";
import { getContractUrl } from "@/lib/explorer";
import { useChainId } from "wagmi";

interface FileDisplayProps {
  fileId: number;
  url?: string;
  showExternalLink?: boolean;
  className?: string;
}

export function FileDisplay({
  fileId,
  url,
  showExternalLink = true,
  className = "",
}: FileDisplayProps) {
  const chainId = useChainId();

  // Link to the DataRegistry contract with the file ID
  const contractUrl = getContractUrl(
    chainId,
    "0x80D424C7B0D7ce775E9b5b7d0f9d3f6AE3f8e8f8",
    {
      tab: "read_proxy",
      sourceAddress: "0xEfcd140D3b740dEfCa423fC12F4B5548E1FC0B36",
      hash: fileId.toString(),
    },
  ); // TODO: change to the correct contract address

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <FileText className="h-4 w-4 text-muted-foreground" />
      <span className="font-mono text-sm">#{fileId}</span>
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
