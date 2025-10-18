/**
 * Rotation Batch Preview Component
 * Shows batch summary, validation results, and transaction list
 */
"use client";

import { Button, Chip } from "@heroui/react";
import { ChevronLeft, Download, Shield, Wrench } from "lucide-react";
import type { Address } from "viem";
import type { Network } from "@/lib/types";
import type { BatchGenerationResult } from "@/lib/batch/types";
import { getAddressLabel } from "@/config";
import { getAuditableContracts, KNOWN_ROLES } from "@/config/contracts";

interface RotationBatchPreviewProps {
  result: BatchGenerationResult;
  network: Network;
  onEdit: () => void;
  onDownload: () => void;
}

export function RotationBatchPreview({
  result,
  network,
  onEdit,
  onDownload,
}: RotationBatchPreviewProps) {
  if (!result.success || !result.batch) {
    return null;
  }

  const { batch } = result;
  const transactions = batch.transactions;

  // Count grants vs revokes
  const grantCount = transactions.filter(
    (tx) => tx.contractMethod.name === "grantRole"
  ).length;
  const revokeCount = transactions.filter(
    (tx) => tx.contractMethod.name === "revokeRole"
  ).length;

  // Helper to get contract name from address
  const getContractName = (address: string): string | null => {
    const contracts = getAuditableContracts(network);
    const contract = contracts.find(
      (c) => c.address.toLowerCase() === address.toLowerCase()
    );
    return contract?.name || null;
  };

  // Helper to format address with label
  const formatAddressWithLabel = (address: string): string => {
    const label = getAddressLabel(address as Address);
    if (label) {
      return `${address.slice(0, 10)}...${address.slice(-8)} (${label})`;
    }
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
  };

  // Helper to format contract with name
  const formatContractWithName = (address: string): string => {
    const name = getContractName(address);
    if (name) {
      return `${address.slice(0, 10)}...${address.slice(-8)} (${name})`;
    }
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
  };

  // Helper to format role with name
  const formatRoleWithName = (roleHash: string): string => {
    const name = KNOWN_ROLES[roleHash];
    if (name) {
      return `${roleHash.slice(0, 10)}... (${name})`;
    }
    return `${roleHash.slice(0, 10)}...`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-divider pb-4">
        <Shield className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Preview Rotation Batch</h2>
      </div>

      {/* Summary Section */}
      <div className="p-4 bg-content2/30 rounded-lg border border-divider/50 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Batch Summary</h3>
        </div>

        <div className="space-y-2 text-sm">
          <p>
            <span className="text-default-500">Network:</span>{" "}
            <strong>
              {network === "mainnet" ? "Mainnet" : "Moksha"} (chainId:{" "}
              {batch.chainId})
            </strong>
          </p>
          <p>
            <span className="text-default-500">Operation:</span>{" "}
            <strong>{batch.meta.name}</strong>
          </p>
          <p className="text-default-500">{batch.meta.description}</p>
        </div>

        <div className="flex gap-2 mt-3 pt-3 border-t border-divider/30">
          <Chip size="sm" color="success" variant="flat">
            {grantCount} grants
          </Chip>
          <Chip size="sm" color="warning" variant="flat">
            {revokeCount} revokes
          </Chip>
          <Chip size="sm" color="primary" variant="flat">
            {transactions.length} total
          </Chip>
        </div>
      </div>

      {/* Validation Results */}
      <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-success" />
          <h3 className="font-semibold text-success">Validation Passed</h3>
        </div>
        <ul className="text-sm space-y-1 text-success-700 dark:text-success-300">
          <li>✓ All addresses are valid</li>
          <li>✓ Old and new addresses are different</li>
          <li>✓ Ready for Safe Transaction Builder import</li>
        </ul>
      </div>

      {/* Transactions Preview */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-default-500" />
          <h3 className="font-semibold">
            Transactions ({transactions.length})
          </h3>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-2 border border-divider/50 rounded-lg p-3 bg-content1">
          {transactions.slice(0, 10).map((tx, idx) => (
            <div
              key={idx}
              className="text-xs font-mono p-2 bg-content2/30 rounded border border-divider/30"
            >
              <div className="font-semibold flex items-center gap-2">
                <span className="text-default-500">{idx + 1}.</span>
                <span
                  className={
                    tx.contractMethod.name === "grantRole"
                      ? "text-success"
                      : "text-warning"
                  }
                >
                  {tx.contractMethod.name}
                </span>
              </div>
              <div className="text-default-500 ml-6 mt-1 space-y-0.5">
                <div>
                  role: {formatRoleWithName(tx.contractInputsValues.role)}
                </div>
                <div>
                  account: {formatAddressWithLabel(tx.contractInputsValues.account)}
                </div>
                <div>
                  to: {formatContractWithName(tx.to)}
                </div>
              </div>
            </div>
          ))}
          {transactions.length > 10 && (
            <p className="text-xs text-center text-default-500 pt-2 border-t border-divider/30">
              ... and {transactions.length - 10} more transactions
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between pt-4 border-t border-divider">
        <Button
          variant="flat"
          startContent={<ChevronLeft className="h-4 w-4" />}
          onPress={onEdit}
        >
          Edit
        </Button>
        <Button
          color="primary"
          startContent={<Download className="h-4 w-4" />}
          onPress={onDownload}
          size="lg"
        >
          Download Batch
        </Button>
      </div>
    </div>
  );
}
