import React from "react";
import { Button, Spinner, type ButtonProps } from "@heroui/react";

interface ActionButtonProps extends Omit<ButtonProps, "children"> {
  /**
   * The button label/content
   */
  children: React.ReactNode;
  /**
   * Loading state - shows spinner when true
   */
  loading?: boolean;
  /**
   * Icon to display (hidden when loading)
   */
  icon?: React.ReactNode;
  /**
   * Text to display when loading (optional, defaults to showing only spinner)
   */
  loadingText?: string;
  /**
   * Position of the icon relative to text
   * @default 'left'
   */
  iconPosition?: "left" | "right";
  /**
   * Show only icon when loading (no text)
   * @default false
   */
  loadingIconOnly?: boolean;
}

/**
 * ActionButton component - A button with built-in loading state and icon support
 * Extends HeroUI's Button component with loading states and icon handling
 */
export const ActionButton: React.FC<ActionButtonProps> = ({
  children,
  loading = false,
  icon,
  loadingText,
  iconPosition = "left",
  loadingIconOnly = false,
  disabled,
  ...buttonProps
}) => {
  const isDisabled = disabled || loading;

  const renderContent = () => {
    if (loading) {
      if (loadingIconOnly) {
        return <Spinner size="sm" />;
      }

      return (
        <>
          <Spinner size="sm" className={loadingText ? "mr-2" : ""} />
          {loadingText || children}
        </>
      );
    }

    if (icon) {
      if (iconPosition === "right") {
        return (
          <>
            {children}
            <span className="ml-2">{icon}</span>
          </>
        );
      }

      return (
        <>
          <span className="mr-2">{icon}</span>
          {children}
        </>
      );
    }

    return children;
  };

  return (
    <Button disabled={isDisabled} {...buttonProps}>
      {renderContent()}
    </Button>
  );
};
