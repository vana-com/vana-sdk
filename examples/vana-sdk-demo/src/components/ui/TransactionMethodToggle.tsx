import React from "react";
import { Select, SelectItem, Chip } from "@heroui/react";
import { Zap, Wallet } from "lucide-react";

export interface TransactionMethod {
  type: "gasless" | "regular";
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  chipColor: "success" | "primary";
}

export const TRANSACTION_METHODS: Record<string, TransactionMethod> = {
  gasless: {
    type: "gasless",
    label: "Gasless (Relayer)",
    description: "No gas fees required - relayer pays",
    icon: Zap,
    chipColor: "success",
  },
  regular: {
    type: "regular",
    label: "Regular (Direct)",
    description: "You pay gas fees directly",
    icon: Wallet,
    chipColor: "primary",
  },
};

interface TransactionMethodToggleProps {
  value: "gasless" | "regular";
  onChange: (value: "gasless" | "regular") => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  description?: string;
  relayerConfigured?: boolean;
}

export function TransactionMethodToggle({
  value,
  onChange,
  disabled = false,
  className = "",
  label = "Transaction Method",
  description,
  relayerConfigured = true,
}: TransactionMethodToggleProps) {
  const selectedMethod = TRANSACTION_METHODS[value];

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <Chip
          size="sm"
          color={selectedMethod.chipColor}
          variant="flat"
          startContent={<selectedMethod.icon className="h-3 w-3" />}
        >
          {selectedMethod.label}
        </Chip>
      </div>

      {description && (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          {description}
        </p>
      )}

      <Select
        selectedKeys={[value]}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as "gasless" | "regular";
          onChange(selected);
        }}
        isDisabled={disabled}
        size="sm"
        aria-label="Transaction method"
      >
        <SelectItem
          key="gasless"
          isDisabled={!relayerConfigured}
          startContent={<Zap className="h-4 w-4" />}
        >
          <div className="flex flex-col">
            <span>{TRANSACTION_METHODS.gasless.label}</span>
            <span className="text-xs text-gray-500">
              {TRANSACTION_METHODS.gasless.description}
              {!relayerConfigured && " (Not configured)"}
            </span>
          </div>
        </SelectItem>
        <SelectItem key="regular" startContent={<Wallet className="h-4 w-4" />}>
          <div className="flex flex-col">
            <span>{TRANSACTION_METHODS.regular.label}</span>
            <span className="text-xs text-gray-500">
              {TRANSACTION_METHODS.regular.description}
            </span>
          </div>
        </SelectItem>
      </Select>

      {!relayerConfigured && value === "gasless" && (
        <p className="text-xs text-orange-600 dark:text-orange-400">
          ⚠️ Gasless transactions require relayer configuration
        </p>
      )}
    </div>
  );
}
