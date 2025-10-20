import React from "react";
import { Button } from "@heroui/react";
import { Copy } from "lucide-react";

interface CodeDisplayProps {
  /**
   * The code/text content to display
   */
  code: string;
  /**
   * Language for syntax highlighting (currently just affects styling)
   */
  language?: "json" | "text" | "javascript" | "typescript";
  /**
   * Maximum height of the code display
   */
  maxHeight?: string;
  /**
   * Whether to show a copy button
   * @default false
   */
  showCopy?: boolean;
  /**
   * Custom copy function - if not provided, uses default clipboard API
   */
  onCopy?: (code: string) => void;
  /**
   * Additional CSS classes for the container
   */
  className?: string;
  /**
   * Text size variant
   * @default 'sm'
   */
  size?: "xs" | "sm" | "base";
  /**
   * Whether to wrap text or allow horizontal scrolling
   * @default true
   */
  wrap?: boolean;
}

/**
 * CodeDisplay component for showing formatted code, JSON, or other technical content
 * with optional copy functionality and scrolling
 */
export const CodeDisplay: React.FC<CodeDisplayProps> = ({
  code,
  language = "text",
  maxHeight = "max-h-48",
  showCopy = false,
  onCopy,
  className = "",
  size = "sm",
  wrap = true,
}) => {
  const handleCopy = () => {
    if (onCopy) {
      onCopy(code);
    } else {
      void navigator.clipboard.writeText(code).catch(console.error);
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case "xs":
        return "text-xs";
      case "sm":
        return "text-sm";
      case "base":
        return "text-base";
      default:
        return "text-sm";
    }
  };

  const getWrapClasses = () => {
    if (wrap) {
      return "whitespace-pre-wrap break-all";
    }
    return "whitespace-pre overflow-auto";
  };

  const renderCode = () => {
    const sizeClasses = getSizeClasses();
    const wrapClasses = getWrapClasses();
    const baseClasses = `font-mono ${sizeClasses} ${wrapClasses}`;

    // For simple text content, use a paragraph
    if (language === "text" && !code.includes("\n")) {
      return <p className={baseClasses}>{code}</p>;
    }

    // For multi-line or structured content, use pre
    return <pre className={baseClasses}>{code}</pre>;
  };

  return (
    <div className={`bg-muted p-4 rounded-lg border ${className}`}>
      {showCopy && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">
            {language === "json" ? "JSON" : "Code"}
          </span>
          <Button size="sm" variant="bordered" onPress={handleCopy}>
            <Copy className="mr-2 h-3 w-3" />
            Copy
          </Button>
        </div>
      )}
      <div className={`${maxHeight} overflow-y-auto`}>{renderCode()}</div>
    </div>
  );
};
