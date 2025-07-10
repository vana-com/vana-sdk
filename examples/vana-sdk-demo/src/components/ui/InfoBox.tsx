import React from "react";

export type InfoBoxVariant = "info" | "warning" | "success" | "error";

interface InfoBoxProps {
  /**
   * The main title/heading for the info box
   */
  title: string;
  /**
   * Array of items to display as bullet points
   */
  items: React.ReactNode[];
  /**
   * Icon to display next to the title
   */
  icon?: React.ReactNode;
  /**
   * Visual variant that determines colors
   * @default 'info'
   */
  variant?: InfoBoxVariant;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * InfoBox component for displaying informational content with icon, title, and bullet points
 * Used for educational content, workflow explanations, and feature descriptions
 */
export const InfoBox: React.FC<InfoBoxProps> = ({
  title,
  items,
  icon,
  variant = "info",
  className = "",
}) => {
  const { containerClasses, iconClasses, titleClasses, itemClasses } =
    getVariantClasses(variant);

  return (
    <div className={`p-4 ${containerClasses} rounded-lg ${className}`}>
      <div className="flex items-start gap-2">
        {icon && (
          <span className={`h-4 w-4 mt-0.5 ${iconClasses}`}>{icon}</span>
        )}
        <div className="text-sm">
          <p className={`font-medium mb-1 ${titleClasses}`}>{title}</p>
          <ul className={`text-xs space-y-1 ${itemClasses}`}>
            {items.map((item, index) => (
              <li key={index}>• {item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

/**
 * Get CSS classes based on the variant
 */
function getVariantClasses(variant: InfoBoxVariant): {
  containerClasses: string;
  iconClasses: string;
  titleClasses: string;
  itemClasses: string;
} {
  switch (variant) {
    case "info":
      return {
        containerClasses:
          "bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800",
        iconClasses: "text-blue-600",
        titleClasses: "text-blue-800 dark:text-blue-200",
        itemClasses: "text-blue-700 dark:text-blue-300",
      };
    case "success":
      return {
        containerClasses:
          "bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800",
        iconClasses: "text-green-600",
        titleClasses: "text-green-800 dark:text-green-200",
        itemClasses: "text-green-700 dark:text-green-300",
      };
    case "warning":
      return {
        containerClasses:
          "bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800",
        iconClasses: "text-amber-600",
        titleClasses: "text-amber-800 dark:text-amber-200",
        itemClasses: "text-amber-700 dark:text-amber-300",
      };
    case "error":
      return {
        containerClasses:
          "bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800",
        iconClasses: "text-red-600",
        titleClasses: "text-red-800 dark:text-red-200",
        itemClasses: "text-red-700 dark:text-red-300",
      };
    default:
      return {
        containerClasses: "bg-muted border border-border",
        iconClasses: "text-muted-foreground",
        titleClasses: "text-foreground",
        itemClasses: "text-muted-foreground",
      };
  }
}
