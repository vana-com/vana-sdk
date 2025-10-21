/**
 * Template Selector Component
 *
 * @remarks
 * Provides UI for selecting and configuring batch operation templates.
 * Templates generate operations based on current audit state.
 */
"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Select,
  SelectItem,
  Autocomplete,
  AutocompleteItem,
  Button,
} from "@heroui/react";
import { Zap, AlertCircle, Info } from "lucide-react";
import type { Address } from "viem";
import type { AuditResults } from "../../lib/types";
import {
  TEMPLATES,
  type TemplateId,
  type RevokeAllTemplateParams,
  type RotationTemplateParams,
} from "../../lib/batch";
import { getKnownAddresses, isKnownAddress } from "../../config";

interface TemplateSelectorProps {
  auditResults: AuditResults;
  onGenerate: (
    operations: import("../../lib/batch").CreateOperationInput[],
  ) => void;
}

/**
 * TemplateSelector allows users to pick and configure templates
 */
export function TemplateSelector({
  auditResults,
  onGenerate,
}: TemplateSelectorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(
    null,
  );

  // Revoke All state
  const [revokeAddress, setRevokeAddress] = useState<string>("");

  // Rotation state
  const [rotationOldAddress, setRotationOldAddress] = useState<string>("");
  const [rotationNewAddress, setRotationNewAddress] = useState<string>("");
  const [rotationNewAddressInput, setRotationNewAddressInput] =
    useState<string>("");

  const knownAddresses = useMemo(() => {
    const addresses = getKnownAddresses();
    return Object.entries(addresses).map(([addr, info]) => ({
      address: addr,
      label: info.label,
    }));
  }, []);

  // Get all addresses that have permissions from audit results
  const addressesWithPermissions = useMemo(() => {
    const addresses = new Set<string>();
    auditResults.currentState.forEach((entry) => {
      addresses.add(entry.address);
    });

    // Convert to array and attach labels where available
    return Array.from(addresses).map((address) => {
      const known = knownAddresses.find(
        (ka) => ka.address.toLowerCase() === address.toLowerCase(),
      );
      return {
        address,
        label: known?.label,
      };
    });
  }, [auditResults, knownAddresses]);

  // Count operations that would be generated
  const operationCount = useMemo(() => {
    if (!selectedTemplate) return 0;

    try {
      if (selectedTemplate === "revoke-all" && revokeAddress) {
        const params: RevokeAllTemplateParams = {
          address: revokeAddress as Address,
        };
        const operations = TEMPLATES["revoke-all"].generate(
          params,
          auditResults,
        );
        return operations.length;
      }

      if (
        selectedTemplate === "rotation" &&
        rotationOldAddress &&
        rotationNewAddress
      ) {
        const params: RotationTemplateParams = {
          oldAddress: rotationOldAddress as Address,
          newAddress: rotationNewAddress as Address,
        };
        const operations = TEMPLATES.rotation.generate(params, auditResults);
        return operations.length;
      }
    } catch {
      return 0;
    }

    return 0;
  }, [
    selectedTemplate,
    revokeAddress,
    rotationOldAddress,
    rotationNewAddress,
    auditResults,
  ]);

  const handleGenerate = () => {
    if (!selectedTemplate) return;

    try {
      if (selectedTemplate === "revoke-all" && revokeAddress) {
        const params: RevokeAllTemplateParams = {
          address: revokeAddress as Address,
        };
        const operations = TEMPLATES["revoke-all"].generate(
          params,
          auditResults,
        );
        onGenerate(operations);

        // Reset form
        setRevokeAddress("");
        setSelectedTemplate(null);
      }

      if (
        selectedTemplate === "rotation" &&
        rotationOldAddress &&
        rotationNewAddress
      ) {
        const params: RotationTemplateParams = {
          oldAddress: rotationOldAddress as Address,
          newAddress: rotationNewAddress as Address,
        };
        const operations = TEMPLATES.rotation.generate(params, auditResults);
        onGenerate(operations);

        // Reset form
        setRotationOldAddress("");
        setRotationNewAddress("");
        setRotationNewAddressInput("");
        setSelectedTemplate(null);
      }
    } catch (error) {
      console.error("Template generation failed:", error);
    }
  };

  const canGenerate = useMemo(() => {
    if (!selectedTemplate) return false;

    if (selectedTemplate === "revoke-all") {
      return Boolean(revokeAddress) && operationCount > 0;
    }

    if (selectedTemplate === "rotation") {
      return (
        Boolean(rotationOldAddress) &&
        Boolean(rotationNewAddress) &&
        operationCount > 0
      );
    }

    return false;
  }, [
    selectedTemplate,
    revokeAddress,
    rotationOldAddress,
    rotationNewAddress,
    operationCount,
  ]);

  // Check if address is unknown
  const isRevokeAddressUnknown = useMemo(() => {
    if (!revokeAddress) return false;
    try {
      return !isKnownAddress(revokeAddress as Address);
    } catch {
      return false;
    }
  }, [revokeAddress]);

  const isRotationNewAddressUnknown = useMemo(() => {
    if (!rotationNewAddress) return false;
    try {
      return !isKnownAddress(rotationNewAddress as Address);
    } catch {
      return false;
    }
  }, [rotationNewAddress]);

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-primary" />
        <span className="font-semibold">Quick Actions (Templates)</span>
      </CardHeader>
      <CardBody className="gap-4">
        <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm flex items-start gap-2">
          <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-default-700">
            Templates generate operations based on{" "}
            <strong>current audit state</strong>. They only act on roles
            addresses actually have right now.
          </p>
        </div>

        {/* Template picker */}
        <Select
          label="Select Template"
          placeholder="Choose a template..."
          selectedKeys={selectedTemplate ? [selectedTemplate] : []}
          onSelectionChange={(keys) => {
            const key = Array.from(keys)[0] as TemplateId | undefined;
            setSelectedTemplate(key ?? null);
          }}
          classNames={{
            trigger: "bg-content2/50",
          }}
        >
          {Object.entries(TEMPLATES).map(([id, template]) => (
            <SelectItem key={id} textValue={template.name}>
              <div>
                <div className="font-medium">{template.name}</div>
                <div className="text-xs text-default-400">
                  {template.description}
                </div>
              </div>
            </SelectItem>
          ))}
        </Select>

        {/* Revoke All Form */}
        {selectedTemplate === "revoke-all" && (
          <div className="space-y-4">
            <div className="h-px bg-divider" />

            <Select
              label="Address to Revoke From"
              placeholder="Select address"
              selectedKeys={revokeAddress ? [revokeAddress] : []}
              onSelectionChange={(keys) => {
                const addr = Array.from(keys)[0] as string;
                setRevokeAddress(addr || "");
              }}
              isRequired
              classNames={{
                trigger: "bg-content2/50",
              }}
              description="Remove all roles this address currently has"
            >
              {addressesWithPermissions.map(({ address, label }) => (
                <SelectItem
                  key={address}
                  textValue={label ? `${label} (${address})` : address}
                >
                  {label ? (
                    <>
                      {label} ({address.slice(0, 6)}...{address.slice(-4)})
                    </>
                  ) : (
                    <span className="font-mono text-sm">
                      {address.slice(0, 8)}...{address.slice(-6)}
                    </span>
                  )}
                </SelectItem>
              ))}
            </Select>

            {isRevokeAddressUnknown && (
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <p className="text-xs text-warning">
                  Unknown address (not in known addresses registry)
                </p>
              </div>
            )}

            {operationCount > 0 && (
              <div className="p-3 bg-success/10 border border-success/30 rounded-lg">
                <p className="text-sm text-success">
                  Will generate <strong>{operationCount}</strong> revoke
                  operation
                  {operationCount !== 1 ? "s" : ""} based on roles this address
                  currently has
                </p>
              </div>
            )}
          </div>
        )}

        {/* Rotation Form */}
        {selectedTemplate === "rotation" && (
          <div className="space-y-4">
            <div className="h-px bg-divider" />

            <Select
              label="Old Address"
              placeholder="Select or paste address"
              selectedKeys={rotationOldAddress ? [rotationOldAddress] : []}
              onSelectionChange={(keys) => {
                const addr = Array.from(keys)[0] as string;
                setRotationOldAddress(addr || "");
              }}
              isRequired
              classNames={{
                trigger: "bg-content2/50",
              }}
              description="Address losing roles"
            >
              {knownAddresses.map(({ address, label }) => (
                <SelectItem key={address} textValue={`${label} (${address})`}>
                  {label} ({address.slice(0, 6)}...{address.slice(-4)})
                </SelectItem>
              ))}
            </Select>

            <Autocomplete
              label="New Address"
              placeholder="Select known address or type custom 0x..."
              inputValue={rotationNewAddressInput}
              onInputChange={(value) => {
                setRotationNewAddressInput(value);
                // If user is typing custom address (not selecting), update the actual address
                if (value.startsWith("0x")) {
                  setRotationNewAddress(value);
                }
              }}
              onSelectionChange={(key) => {
                if (key) {
                  // When selecting from dropdown, use the key (actual address)
                  setRotationNewAddress(key as string);
                }
              }}
              allowsCustomValue
              isRequired
              classNames={{
                base: "bg-content2/50",
              }}
              description="Address gaining roles (select from known or paste new)"
            >
              {knownAddresses.map(({ address, label }) => (
                <AutocompleteItem
                  key={address}
                  textValue={`${label} (${address})`}
                >
                  {label} ({address.slice(0, 6)}...{address.slice(-4)})
                </AutocompleteItem>
              ))}
            </Autocomplete>

            {isRotationNewAddressUnknown && (
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <p className="text-xs text-warning">
                  Unknown address (not in known addresses registry)
                </p>
              </div>
            )}

            {operationCount > 0 && (
              <div className="p-3 bg-success/10 border border-success/30 rounded-lg">
                <p className="text-sm text-success">
                  Will generate <strong>{operationCount}</strong> operation
                  {operationCount !== 1 ? "s" : ""} ({operationCount / 2} grants
                  + {operationCount / 2} revokes)
                </p>
              </div>
            )}
          </div>
        )}

        {/* Generate button */}
        {selectedTemplate && (
          <div className="pt-2">
            <Button
              color="primary"
              size="lg"
              onPress={handleGenerate}
              isDisabled={!canGenerate}
              startContent={<Zap className="h-4 w-4" />}
              fullWidth
            >
              {canGenerate
                ? `Add ${operationCount} Operation${operationCount !== 1 ? "s" : ""} to Queue`
                : "Select required fields to continue"}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
