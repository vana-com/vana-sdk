import React from "react";

export type StatusType = "error" | "success" | "warning" | "info";

interface StatusMessageProps {
  status: string;
  type?: StatusType;
  className?: string;
  showIcon?: boolean;
  inline?: boolean;
}

/**
 * StatusMessage component for displaying status messages with consistent styling
 * @param status - The status message to display
 * @param type - The type of status (auto-detected if not provided)
 * @param className - Additional CSS classes
 * @param showIcon - Whether to show an animated icon (for success states)
 * @param inline - Whether to display as inline text or block element
 */
export const StatusMessage: React.FC<StatusMessageProps> = ({
  status,
  type,
  className = "",
  showIcon = false,
  inline = false,
}) => {
  // Auto-detect type from status content if not provided
  const detectedType = type || detectStatusType(status);

  if (inline) {
    const colorClasses = getInlineColorClasses(detectedType);
    return <p className={`text-sm ${colorClasses} ${className}`}>{status}</p>;
  }

  const { containerClasses, textClasses } = getBlockClasses(detectedType);

  return (
    <div className={`text-sm p-3 rounded-md ${containerClasses} ${className}`}>
      {showIcon && detectedType === "success" && (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <p className={textClasses}>{status}</p>
        </div>
      )}
      {(!showIcon || detectedType !== "success") && (
        <p className={textClasses}>{status}</p>
      )}
    </div>
  );
};

/**
 * Auto-detect status type from message content
 */
function detectStatusType(status: string): StatusType {
  const lowercaseStatus = status.toLowerCase();

  if (
    lowercaseStatus.includes("error") ||
    lowercaseStatus.includes("fail") ||
    lowercaseStatus.includes("❌")
  ) {
    return "error";
  }

  if (
    lowercaseStatus.includes("success") ||
    lowercaseStatus.includes("✅") ||
    lowercaseStatus.includes("complete")
  ) {
    return "success";
  }

  if (lowercaseStatus.includes("warning") || lowercaseStatus.includes("⚠️")) {
    return "warning";
  }

  return "info";
}

/**
 * Get inline color classes based on status type
 */
function getInlineColorClasses(type: StatusType): string {
  switch (type) {
    case "error":
      return "text-destructive";
    case "success":
      return "text-green-600";
    case "warning":
      return "text-amber-600 dark:text-amber-400";
    case "info":
      return "text-blue-700 dark:text-blue-300";
    default:
      return "text-muted-foreground";
  }
}

/**
 * Get block-level classes based on status type
 */
function getBlockClasses(type: StatusType): {
  containerClasses: string;
  textClasses: string;
} {
  switch (type) {
    case "error":
      return {
        containerClasses:
          "bg-red-50 border border-red-200 dark:bg-red-950/50 dark:border-red-800",
        textClasses: "text-red-700 dark:text-red-300",
      };
    case "success":
      return {
        containerClasses:
          "bg-green-50 border border-green-200 dark:bg-green-950/50 dark:border-green-800",
        textClasses: "text-green-700 dark:text-green-300",
      };
    case "warning":
      return {
        containerClasses:
          "bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
        textClasses: "text-amber-600 dark:text-amber-400",
      };
    case "info":
      return {
        containerClasses:
          "bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
        textClasses: "text-blue-700 dark:text-blue-300",
      };
    default:
      return {
        containerClasses: "bg-muted border border-border",
        textClasses: "text-muted-foreground",
      };
  }
}
