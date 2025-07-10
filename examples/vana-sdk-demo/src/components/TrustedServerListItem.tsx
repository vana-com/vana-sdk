import React from "react";
import { Button, Chip, Spinner } from "@heroui/react";
import { ExplorerLink } from "./ui/ExplorerLink";

interface TrustedServerListItemProps {
  /**
   * The server ID (address)
   */
  serverId: string;
  /**
   * The index of this server in the list (for numbering)
   */
  index: number;
  /**
   * Callback when untrust button is clicked
   */
  onUntrust: (serverId: string) => void;
  /**
   * Whether the untrust operation is in progress
   * @default false
   */
  isUntrusting?: boolean;
  /**
   * Chain ID for explorer links
   */
  chainId: number;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * TrustedServerListItem component for displaying a single trusted server
 * with its address and untrust functionality
 */
export const TrustedServerListItem: React.FC<TrustedServerListItemProps> = ({
  serverId,
  index,
  onUntrust,
  isUntrusting = false,
  chainId,
  className = "",
}) => {
  const handleUntrust = () => {
    onUntrust(serverId);
  };

  return (
    <div
      className={`flex items-center justify-between p-4 bg-muted rounded-lg border ${className}`}
    >
      <div className="flex items-center space-x-3">
        <Chip variant="flat">#{index + 1}</Chip>
        <ExplorerLink type="address" hash={serverId} chainId={chainId} />
      </div>
      <Button
        onPress={handleUntrust}
        disabled={isUntrusting}
        color="danger"
        size="sm"
      >
        {isUntrusting ? <Spinner size="sm" /> : "Untrust"}
      </Button>
    </div>
  );
};
