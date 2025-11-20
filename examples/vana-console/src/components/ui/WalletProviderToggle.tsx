import React from "react";
import { Button } from "@heroui/react";

export type WalletProvider = "rainbow" | "para";

interface WalletProviderToggleProps {
  /**
   * Current wallet provider selection
   */
  provider: WalletProvider;
  /**
   * Callback when provider changes
   */
  onProviderChange: (provider: WalletProvider) => void;
  /**
   * Whether the toggle is disabled (e.g., when wallet is connected)
   */
  disabled?: boolean;
  /**
   * Size of the buttons
   * @default 'sm'
   */
  size?: "sm" | "md" | "lg";
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * WalletProviderToggle component for switching between Rainbow Kit and Para wallet providers
 *
 * @remarks
 * Provides an elegant toggle to switch wallet connection methods.
 * Should be disabled when a wallet is already connected to avoid confusion.
 */
export const WalletProviderToggle: React.FC<WalletProviderToggleProps> = ({
  provider,
  onProviderChange,
  disabled = false,
  size = "sm",
  className = "",
}) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button
        variant={provider === "rainbow" ? "solid" : "bordered"}
        color={provider === "rainbow" ? "primary" : "default"}
        size={size}
        onPress={() => {
          onProviderChange("rainbow");
        }}
        isDisabled={disabled}
        className="min-w-[90px]"
      >
        🌈 Rainbow
      </Button>
      <Button
        variant={provider === "para" ? "solid" : "bordered"}
        color={provider === "para" ? "primary" : "default"}
        size={size}
        onPress={() => {
          onProviderChange("para");
        }}
        isDisabled={disabled}
        className="min-w-[90px]"
      >
        ⚡ Para
      </Button>
    </div>
  );
};
