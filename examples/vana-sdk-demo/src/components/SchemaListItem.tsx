import React from "react";
import { Chip } from "@heroui/react";
import { Schema } from "@opendatalabs/vana-sdk/browser";
import { IdChip } from "./ui/IdChip";

interface SchemaListItemProps {
  /**
   * The schema object to display (with optional source property)
   */
  schema: Schema & { source?: "discovered" | "created" };
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * SchemaListItem component for displaying schema details
 * Shows ID, name, type, definition URL, and creation status
 */
export const SchemaListItem: React.FC<SchemaListItemProps> = ({
  schema,
  className = "",
}) => {
  return (
    <div className={`p-3 border rounded bg-muted/30 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <IdChip label="ID" id={schema.id} />
            {schema.source === "created" && (
              <Chip variant="flat">Created by You</Chip>
            )}
          </div>
          <h5 className="font-medium mt-1">{schema.name}</h5>
          <p className="text-sm text-muted-foreground">Type: {schema.type}</p>
          <a
            href={schema.definitionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            View Definition
          </a>
        </div>
      </div>
    </div>
  );
};
