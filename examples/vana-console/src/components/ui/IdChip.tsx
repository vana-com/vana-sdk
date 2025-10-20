import React from "react";
import { Chip } from "@heroui/react";

interface IdChipProps {
  /**
   * The label to display before the ID (e.g., "ID", "File ID", "Schema", "DLP")
   */
  label: string;
  /**
   * The ID value to display (string or number)
   */
  id: string | number;
  /**
   * Chip variant
   * @default 'bordered'
   */
  variant?: "solid" | "bordered" | "flat" | "shadow";
  /**
   * Chip size
   * @default 'md'
   */
  size?: "sm" | "md" | "lg";
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * IdChip component for consistently displaying on-chain identifiers
 * like file IDs, schema IDs, DLP IDs, etc.
 */
export const IdChip: React.FC<IdChipProps> = ({
  label,
  id,
  variant = "bordered",
  size = "md",
  className = "",
}) => {
  return (
    <Chip variant={variant} size={size} className={className}>
      {label}: {id}
    </Chip>
  );
};
