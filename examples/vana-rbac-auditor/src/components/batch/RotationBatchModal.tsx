/**
 * Rotation Batch Modal Component
 * Main modal with form and orchestration for batch rotation
 */
"use client";

import { useState, useMemo } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Button,
  Input,
  Select,
  SelectItem,
  Chip,
} from "@heroui/react";
import { RotateCw, AlertCircle, Info, CheckCircle } from "lucide-react";
import type { Address } from "viem";
import type { Network, AuditResults } from "@/lib/types";
import type { RotationFormInput, BatchGenerationResult } from "@/lib/batch/types";
import {
  generateRotationBatch,
  downloadBatch,
  discoverRolesToRotate,
} from "@/lib/batch/generateRotationBatch";
import { getAuditableContracts, KNOWN_ROLES } from "@/config/contracts";
import { getKnownAddresses } from "@/config";
import { isKnownAddress } from "@/config/addresses";
import { RotationBatchPreview } from "./RotationBatchPreview";

interface RotationBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  network: Network;
  auditResults?: AuditResults;
}

export function RotationBatchModal({
  isOpen,
  onClose,
  network,
  auditResults,
}: RotationBatchModalProps) {
  // Form state
  const [oldAddress, setOldAddress] = useState<string>("");
  const [newAddress, setNewAddress] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [selectedContracts, setSelectedContracts] = useState<Set<string>>(
    new Set(["all"])
  );

  // UI state
  const [showPreview, setShowPreview] = useState(false);
  const [generationResult, setGenerationResult] =
    useState<BatchGenerationResult | null>(null);

  // Get options for dropdowns
  const contracts = useMemo(() => getAuditableContracts(network), [network]);

  const roleOptions = useMemo(() => {
    const entries = Object.entries(KNOWN_ROLES);
    return [
      { value: "all", label: "All roles" },
      ...entries.map(([hash, name]) => ({ value: hash, label: name })),
    ];
  }, []);

  const contractOptions = useMemo(() => {
    return [
      { value: "all", label: `All Contracts (${contracts.length})` },
      ...contracts.map((c) => ({ value: c.address, label: c.name })),
    ];
  }, [contracts]);

  const knownAddresses = useMemo(() => {
    const addresses = getKnownAddresses();
    return Object.entries(addresses).map(([addr, info]) => ({
      address: addr,
      label: info.label,
    }));
  }, []);

  // Discover which roles will be rotated (for UI display)
  const discoveredRoles = useMemo(() => {
    if (!oldAddress || selectedRole !== "all") return [];

    try {
      return discoverRolesToRotate(
        oldAddress as Address,
        undefined,
        auditResults
      );
    } catch {
      return [];
    }
  }, [oldAddress, selectedRole, auditResults]);

  // Handle preview
  const handlePreview = () => {
    // Build input from form
    const input: RotationFormInput = {
      oldAddress: oldAddress as Address,
      newAddress: newAddress as Address,
      role: selectedRole === "all" ? undefined : selectedRole,
      contractAddresses:
        selectedContracts.has("all") || selectedContracts.size === 0
          ? undefined
          : Array.from(selectedContracts) as Address[],
    };

    const result = generateRotationBatch(input, network, auditResults);
    setGenerationResult(result);

    if (result.success) {
      setShowPreview(true);
    }
  };

  // Handle download
  const handleDownload = () => {
    if (generationResult?.success && generationResult.batch) {
      downloadBatch(generationResult.batch, network);
      // TODO: Show success toast
      onClose();
    }
  };

  // Handle back to edit
  const handleEdit = () => {
    setShowPreview(false);
  };

  // Handle close and reset
  const handleClose = () => {
    setShowPreview(false);
    setGenerationResult(null);
    onClose();
  };

  // Check if new address is unknown
  const isNewAddressUnknown = useMemo(() => {
    if (!newAddress || newAddress.length === 0) return false;
    try {
      return !isKnownAddress(newAddress as Address);
    } catch {
      return false;
    }
  }, [newAddress]);

  // Check if form can be previewed
  const canPreview = Boolean(oldAddress?.length) && Boolean(newAddress?.length);

  // Handle contract selection
  const handleContractSelection = (keys: Set<string>) => {
    const newSelection = new Set(Array.from(keys));

    // If "all" is selected, clear other selections
    if (newSelection.has("all") && !selectedContracts.has("all")) {
      setSelectedContracts(new Set(["all"]));
    }
    // If specific contracts are selected, remove "all"
    else if (newSelection.size > 0 && newSelection.has("all") === false) {
      setSelectedContracts(newSelection);
    }
    // If empty, default to "all"
    else if (newSelection.size === 0) {
      setSelectedContracts(new Set(["all"]));
    } else {
      setSelectedContracts(newSelection);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="2xl"
      scrollBehavior="inside"
      classNames={{
        base: "max-h-[90vh]",
      }}
    >
      <ModalContent>
        {showPreview ? (
          <ModalBody className="py-6">
            <RotationBatchPreview
              result={generationResult!}
              network={network}
              onEdit={handleEdit}
              onDownload={handleDownload}
            />
          </ModalBody>
        ) : (
          <>
            <ModalHeader className="flex items-center gap-2 border-b border-divider pb-4">
              <RotateCw className="h-5 w-5 text-primary" />
              <span>Generate Rotation Batch</span>
            </ModalHeader>

            <ModalBody className="gap-4 pb-6 pt-4">
              {/* Network indicator */}
              <div className="px-3 py-2 bg-primary/10 rounded-lg text-sm border border-primary/20 flex items-center gap-2">
                <Info className="h-4 w-4 text-primary flex-shrink-0" />
                <span>
                  Network:{" "}
                  <strong>
                    {network === "mainnet" ? "Mainnet" : "Moksha"}
                  </strong>{" "}
                  (chainId: {network === "mainnet" ? "1480" : "14800"})
                </span>
              </div>

              <p className="text-sm text-default-500">
                Replace old address with new address across contracts.
              </p>

              <div className="h-px bg-divider" />

              {/* Old Address */}
              <Select
                label="Old Address"
                placeholder="Select or paste address"
                selectedKeys={oldAddress ? [oldAddress] : []}
                onSelectionChange={(keys) =>
                  setOldAddress((Array.from(keys)[0] as string) || "")
                }
                isRequired
                classNames={{
                  trigger: "bg-content2/50",
                }}
                description="Address to remove permissions from"
              >
                {knownAddresses.map(({ address, label }) => (
                  <SelectItem key={address}>
                    {label} ({address.slice(0, 6)}...{address.slice(-4)})
                  </SelectItem>
                ))}
              </Select>

              {/* New Address */}
              <div>
                <Input
                  label="New Address"
                  placeholder="0x..."
                  value={newAddress}
                  onValueChange={setNewAddress}
                  isRequired
                  classNames={{
                    inputWrapper: "bg-content2/50",
                  }}
                  description="Address to grant permissions to"
                />
                {isNewAddressUnknown && (
                  <div className="mt-2 px-3 py-2 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-warning">
                      Unknown address (not in known addresses registry)
                    </p>
                  </div>
                )}
              </div>

              {/* Role */}
              <Select
                label="Role (Optional)"
                placeholder="All roles"
                selectedKeys={[selectedRole]}
                onSelectionChange={(keys) =>
                  setSelectedRole((Array.from(keys)[0] as string) || "all")
                }
                classNames={{
                  trigger: "bg-content2/50",
                }}
                description="Leave as 'All roles' to rotate all permissions"
              >
                {roleOptions.map((option) => (
                  <SelectItem key={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </Select>

              {/* Role Discovery Indicator - shown when "All roles" is selected */}
              {selectedRole === "all" && oldAddress && (
                <>
                  {auditResults && discoveredRoles.length > 0 ? (
                    <div className="p-3 bg-success/10 border border-success/30 rounded-lg">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-success mb-2">
                            Will rotate {discoveredRoles.length} active role{discoveredRoles.length !== 1 ? 's' : ''} this address currently has:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {discoveredRoles.slice(0, 6).map((roleHash) => (
                              <Chip key={roleHash} size="sm" variant="flat" color="success">
                                {KNOWN_ROLES[roleHash] || `${roleHash.slice(0, 10)}...`}
                              </Chip>
                            ))}
                            {discoveredRoles.length > 6 && (
                              <Chip size="sm" variant="flat" color="success">
                                +{discoveredRoles.length - 6} more
                              </Chip>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : auditResults && discoveredRoles.length === 0 ? (
                    <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-2">
                      <Info className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-warning">
                        This address has no active roles in the audit results. The batch will be empty.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-warning">
                        No audit results available. Will attempt to rotate all possible roles.
                        <strong className="block mt-1">Recommendation:</strong> Run audit first or select a specific role.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Contracts */}
              <Select
                label="Contracts (Optional)"
                placeholder="All contracts"
                selectionMode="multiple"
                selectedKeys={selectedContracts}
                onSelectionChange={(keys) =>
                  handleContractSelection(keys as Set<string>)
                }
                classNames={{
                  trigger: "bg-content2/50",
                }}
                description="Leave as 'All' to rotate across all contracts"
              >
                {contractOptions.map((option) => (
                  <SelectItem key={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </Select>

              <div className="h-px bg-divider" />

              {/* Validation errors */}
              {generationResult?.errors && generationResult.errors.length > 0 && (
                <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg">
                  <p className="text-sm font-medium text-danger mb-2">
                    Validation Errors
                  </p>
                  <ul className="text-xs text-danger/90 space-y-1">
                    {generationResult.errors.map((err) => (
                      <li key={err.code}>
                        • {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button variant="flat" onPress={handleClose}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handlePreview}
                  isDisabled={!canPreview}
                >
                  Preview Batch
                </Button>
              </div>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
