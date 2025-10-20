/**
 * Network Selector Component
 * Button group for selecting Mainnet or Moksha testnet
 */
"use client";

import { Button } from "@heroui/react";
import type { Network } from "../../lib/types";

interface NetworkSelectorProps {
  selected: Network;
  onSelect: (network: Network) => void;
  disabled?: boolean;
}

/**
 * NetworkSelector as button group (Lovable's UX pattern)
 */
export function NetworkSelector({
  selected,
  onSelect,
  disabled = false,
}: NetworkSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-default-500">
        Network
      </label>
      <div className="flex gap-2 p-1 bg-content2/30 rounded-lg border border-divider/50">
        <Button
          size="sm"
          variant={selected === "mainnet" ? "solid" : "light"}
          color={selected === "mainnet" ? "primary" : "default"}
          onPress={() => onSelect("mainnet")}
          isDisabled={disabled}
        >
          Mainnet
        </Button>
        <Button
          size="sm"
          variant={selected === "moksha" ? "solid" : "light"}
          color={selected === "moksha" ? "primary" : "default"}
          onPress={() => onSelect("moksha")}
          isDisabled={disabled}
        >
          Moksha
        </Button>
      </div>
    </div>
  );
}
