import React from "react";
import { Button } from "@heroui/react";
import { FileText, Upload } from "lucide-react";

export type InputMode = "text" | "file";

interface InputModeToggleProps {
  /**
   * Current mode selection
   */
  mode: InputMode;
  /**
   * Callback when mode changes
   */
  onModeChange: (mode: InputMode) => void;
  /**
   * Whether the toggle is disabled
   * @default false
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
 * InputModeToggle component for switching between text and file input modes
 * Provides a consistent toggle pattern across the application
 */
export const InputModeToggle: React.FC<InputModeToggleProps> = ({
  mode,
  onModeChange,
  disabled = false,
  size = "sm",
  className = "",
}) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button
        variant={mode === "text" ? "solid" : "bordered"}
        size={size}
        onPress={() => {
          onModeChange("text");
        }}
        disabled={disabled}
      >
        <FileText className="mr-2 h-4 w-4" />
        Text
      </Button>
      <Button
        variant={mode === "file" ? "solid" : "bordered"}
        size={size}
        onPress={() => {
          onModeChange("file");
        }}
        disabled={disabled}
      >
        <Upload className="mr-2 h-4 w-4" />
        File
      </Button>
    </div>
  );
};
