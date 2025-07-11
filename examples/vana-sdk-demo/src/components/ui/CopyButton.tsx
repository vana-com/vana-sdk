import React, { useState } from "react";
import { Button, Tooltip } from "@heroui/react";
import { Copy, Check } from "lucide-react";

interface CopyButtonProps {
  value: string;
  tooltip?: string;
  size?: "sm" | "md" | "lg";
  variant?: "flat" | "bordered" | "solid";
  className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  value,
  tooltip = "Copy to clipboard",
  size = "sm",
  variant = "flat",
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </Tooltip>
  );
};
