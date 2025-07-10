import React from "react";
import { Button } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { ExplorerLink } from "./ui/ExplorerLink";
import { getAddressUrl } from "@/lib/explorer";

interface ContractListItemProps {
  /**
   * The contract name
   */
  contractName: string;
  /**
   * The contract address (if deployed)
   */
  contractAddress?: string;
  /**
   * Chain ID for explorer links
   */
  chainId: number;
  /**
   * Whether the contract is deployed on this network
   * @default true
   */
  isDeployed?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * ContractListItem component for displaying contract details
 * Shows name, address, and explorer link if deployed
 */
export const ContractListItem: React.FC<ContractListItemProps> = ({
  contractName,
  contractAddress,
  chainId,
  isDeployed = true,
  className = "",
}) => {
  const baseClasses = isDeployed
    ? "flex items-center justify-between p-3 bg-muted rounded-md"
    : "flex items-center justify-between p-3 bg-muted/50 rounded-md";

  return (
    <div className={`${baseClasses} ${className}`}>
      <div className="flex-1">
        <p
          className={`font-medium text-sm ${isDeployed ? "" : "text-muted-foreground"}`}
        >
          {contractName}
        </p>
        {isDeployed && contractAddress ? (
          <ExplorerLink
            type="address"
            hash={contractAddress}
            chainId={chainId}
            showExternalIcon={false}
            className="text-xs"
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Not deployed on this network
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant="bordered"
        disabled={!isDeployed || !contractAddress}
        {...(isDeployed && contractAddress
          ? {
              as: "a",
              href: getAddressUrl(chainId, contractAddress),
              target: "_blank",
              rel: "noopener noreferrer",
            }
          : {})}
      >
        <ExternalLink className="mr-2 h-4 w-4" />
        {isDeployed ? "View" : "N/A"}
      </Button>
    </div>
  );
};
