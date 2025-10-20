import React from "react";

interface EmptyStateProps {
  /**
   * Icon to display (optional)
   */
  icon?: React.ReactNode;
  /**
   * Main title/heading for the empty state
   */
  title: string;
  /**
   * Optional description text
   */
  description?: string;
  /**
   * Optional action button or element
   */
  action?: React.ReactNode;
  /**
   * Size variant for the empty state
   * @default 'default'
   */
  size?: "compact" | "default" | "large";
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * EmptyState component for displaying empty lists, missing data, or placeholder content
 * Provides consistent styling and structure across the application
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  size = "default",
  className = "",
}) => {
  const { containerClasses, iconClasses, titleClasses, descriptionClasses } =
    getSizeClasses(size);

  return (
    <div
      className={`text-center text-muted-foreground ${containerClasses} ${className}`}
    >
      {icon && (
        <div className={`mx-auto mb-4 opacity-50 ${iconClasses}`}>{icon}</div>
      )}
      <p className={titleClasses}>{title}</p>
      {description && (
        <p className={`mt-2 ${descriptionClasses}`}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

/**
 * Get size-based CSS classes
 */
function getSizeClasses(size: EmptyStateProps["size"]): {
  containerClasses: string;
  iconClasses: string;
  titleClasses: string;
  descriptionClasses: string;
} {
  switch (size) {
    case "compact":
      return {
        containerClasses: "py-6",
        iconClasses: "h-8 w-8",
        titleClasses: "text-sm",
        descriptionClasses: "text-xs",
      };
    case "large":
      return {
        containerClasses: "py-12",
        iconClasses: "h-16 w-16",
        titleClasses: "font-medium text-lg",
        descriptionClasses: "text-base",
      };
    case "default":
    default:
      return {
        containerClasses: "py-8",
        iconClasses: "h-12 w-12",
        titleClasses: "font-medium",
        descriptionClasses: "text-sm",
      };
  }
}
