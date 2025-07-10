import { useState } from "react";
import { Button, Badge, Checkbox } from "@heroui/react";
import { AddressDisplay } from "./AddressDisplay";
import { BlockDisplay } from "./BlockDisplay";
import { getAddressUrl } from "@/lib/explorer";
import { useChainId } from "wagmi";
import {
  FileText,
  Key,
  Copy,
  Download,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface FileCardProps {
  file: {
    id: number;
    url: string;
    ownerAddress: string;
    addedAtBlock: number | bigint;
    source?: "discovered" | "looked-up" | "uploaded";
  };
  isSelected?: boolean;
  isDecrypted?: boolean;
  decryptedContent?: string;
  isDecrypting?: boolean;
  userAddress?: string;
  onSelect?: () => void;
  onDecrypt?: () => void;
  onDownloadDecrypted?: () => void;
}

export function FileCard({
  file,
  isSelected = false,
  isDecrypted = false,
  decryptedContent,
  isDecrypting = false,
  userAddress,
  onSelect,
  onDecrypt,
  onDownloadDecrypted,
}: FileCardProps) {
  const chainId = useChainId();
  const [isExpanded, setIsExpanded] = useState(false);
  const isOwner =
    userAddress &&
    file.ownerAddress.toLowerCase() === userAddress.toLowerCase();

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(file.url);
    } catch (error) {
      console.error("Failed to copy URL:", error);
    }
  };

  const getSourceBadge = () => {
    switch (file.source) {
      case "looked-up":
        return <Badge variant="faded">Looked Up</Badge>;
      case "uploaded":
        return <Badge variant="solid">Just Uploaded</Badge>;
      case "discovered":
      default:
        return <Badge variant="flat">Discovered</Badge>;
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">File #{file.id}</span>
              {getSourceBadge()}
            </div>
            <div className="text-sm text-muted-foreground">
              <AddressDisplay
                address={file.ownerAddress}
                label="Owner"
                explorerUrl={getAddressUrl(chainId || 14800, file.ownerAddress)}
                truncate={true}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onSelect && (
            <Checkbox
              isSelected={isSelected}
              onValueChange={() => onSelect()}
              size="sm"
            />
          )}

          <Button
            size="sm"
            variant="light"
            onPress={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="space-y-3 pt-3 border-t">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Block:</span>{" "}
              <BlockDisplay
                blockNumber={file.addedAtBlock}
                className="inline-flex"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">URL:</span>
              <span className="font-mono text-xs truncate flex-1">
                {file.url}
              </span>
              <Button size="sm" variant="light" onPress={copyUrl} isIconOnly>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            {isOwner && onDecrypt && (
              <Button
                size="sm"
                variant="bordered"
                onPress={onDecrypt}
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Key className="mr-2 h-4 w-4" />
                )}
                {isDecrypting ? "Decrypting..." : "Decrypt"}
              </Button>
            )}
          </div>

          {/* Decrypted Content */}
          {isDecrypted && decryptedContent && (
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-medium text-green-800 dark:text-green-200">
                  Decrypted Content:
                </h5>
                {onDownloadDecrypted && (
                  <Button
                    size="sm"
                    variant="bordered"
                    onPress={onDownloadDecrypted}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                )}
              </div>
              <pre className="text-sm text-green-700 dark:text-green-300 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                {decryptedContent}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
