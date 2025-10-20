import React, { useState } from "react";
import { Button, Tooltip } from "@heroui/react";
import { Copy, Check } from "lucide-react";

interface CopyButtonProps {
  value: string;
  tooltip?: string;
  size?: "sm" | "md" | "lg";
  variant?: "flat" | "bordered" | "solid";
  className?: string;
  isInline?: boolean;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  value,
  tooltip = "Copy to clipboard",
  size = "sm",
  variant = "flat",
  className,
  isInline = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <Tooltip content={copied ? "Copied!" : tooltip}>
      <Button
        size={size}
        variant={variant}
        onPress={handleCopy}
        startContent={
          copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />
        }
        className={className}
        color={copied ? "success" : "default"}
        isIconOnly={isInline}
      >
        {isInline ? null : copied ? "Copied" : "Copy"}
      </Button>
    </Tooltip>
  );
};
