import React from "react";
import { Chip } from "@heroui/react";
import { Refiner } from "@opendatalabs/vana-sdk";
import { IdChip } from "./ui/IdChip";
import { AddressDisplay } from "./ui/AddressDisplay";

interface RefinerListItemProps {
  /**
   * The refiner object to display (with optional source property)
   */
  refiner: Refiner & { source?: "discovered" | "created" };
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * RefinerListItem component for displaying refiner details
 * Shows ID, DLP ID, Schema ID, name, owner, and instruction URL
 */
export const RefinerListItem: React.FC<RefinerListItemProps> = ({
  refiner,
  className = "",
}) => {
  return (
    <div className={`p-3 border rounded bg-muted/30 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <IdChip label="ID" id={refiner.id} />
            <IdChip label="DLP" id={refiner.dlpId} />
            <IdChip label="Schema" id={refiner.schemaId} />
            {refiner.source === "created" && (
              <Chip variant="flat">Created by You</Chip>
            )}
          </div>
          <h5 className="font-medium mt-1">{refiner.name}</h5>
          <div className="text-sm text-muted-foreground">
            <AddressDisplay
              address={refiner.owner}
              showCopy={false}
              showExternalLink={false}
              className="inline"
            />
          </div>
          <a
            href={refiner.refinementInstructionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            View Instructions
          </a>
        </div>
      </div>
    </div>
  );
};
