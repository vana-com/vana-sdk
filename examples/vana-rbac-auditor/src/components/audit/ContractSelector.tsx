/**
 * Contract Selector Component
 * Searchable dropdown for selecting contracts to audit
 */
"use client";

import { Select, SelectItem } from "@heroui/react";
import { useMemo } from "react";
import type { Network } from "../../lib/types";
import {
  getAuditableContracts,
  getContractDisplayName,
} from "../../config/contracts";

interface ContractSelectorProps {
  network: Network;
  selected: string[];
  onSelect: (contracts: string[]) => void;
  disabled?: boolean;
}

/**
 * ContractSelector with search and "All Contracts" option
 */
export function ContractSelector({
  network,
  selected,
  onSelect,
  disabled = false,
}: ContractSelectorProps) {
  const contracts = useMemo(
    () => getAuditableContracts(network),
    [network]
  );

  const options = useMemo(() => {
    const opts = [
      { value: "all", label: "All Contracts" },
      ...contracts.map((c) => ({
        value: c.name,
        label: getContractDisplayName(c.name),
      })),
    ];
    return opts;
  }, [contracts]);

  const handleSelectionChange = (keys: "all" | Set<React.Key>) => {
    if (keys === "all") {
      onSelect(["all"]);
    } else {
      const selectedKeys = Array.from(keys).map(String);
      onSelect(selectedKeys.length > 0 ? selectedKeys : ["all"]);
    }
  };

  const selectedKeys = useMemo(() => {
    return selected.includes("all")
      ? new Set(["all"])
      : new Set(selected);
  }, [selected]);

  return (
    <Select
      label="Contract"
      selectedKeys={selectedKeys}
      onSelectionChange={handleSelectionChange}
      isDisabled={disabled}
      placeholder="Select contracts..."
      className="w-full md:w-[280px]"
      classNames={{
        trigger: "bg-content2/20 border-divider/50",
        label: "text-sm font-medium text-default-500",
      }}
    >
      {options.map((option) => (
        <SelectItem key={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </Select>
  );
}
