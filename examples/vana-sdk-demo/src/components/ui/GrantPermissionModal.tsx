import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
  Select,
  SelectItem,
  Chip,
  Divider,
  Card,
  CardBody,
} from "@heroui/react";
import { Eye, Shield, AlertCircle, Cloud, Database } from "lucide-react";
import { validateGrant } from "@opendatalabs/vana-sdk/browser-wasm";
import type {
  GrantPermissionParams,
  GrantedPermission,
  Grantee,
} from "@opendatalabs/vana-sdk/browser-wasm";

export interface GrantPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (params: GrantPermissionParams & { expiresAt?: number }) => void;
  selectedFiles: number[];
  grantees: Grantee[];
  isGranting: boolean;
  existingPermissions?: GrantedPermission[]; // To check for duplicates
}

export const GrantPermissionModal: React.FC<GrantPermissionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  selectedFiles,
  grantees,
  isGranting,
}) => {
  const [operation, setOperation] = useState("llm_inference");
  const [promptText, setPromptText] = useState(
    "Generate a personality profile based on the following text: {{data}}",
  );
  const [expirationOption, setExpirationOption] = useState("never");
  const [customExpiration, setCustomExpiration] = useState("");
  const [selectedGranteeId, setSelectedGranteeId] = useState<string>("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setOperation("llm_inference");
      setPromptText(
        "Generate a personality profile based on the following text: {{data}}",
      );
      setExpirationOption("never");
      setCustomExpiration("");
      setSelectedGranteeId("");
      setValidationErrors([]);
    }
  }, [isOpen]);

  // Calculate expiration timestamp
  const getExpirationTimestamp = (): number | undefined => {
    const now = Math.floor(Date.now() / 1000);

    switch (expirationOption) {
      case "never":
        return undefined; // No expiration
      case "24h":
        return now + 86400; // 24 hours
      case "7d":
        return now + 604800; // 7 days
      case "30d":
        return now + 2592000; // 30 days
      case "custom": {
        const customHours = parseInt(customExpiration);
        if (isNaN(customHours) || customHours <= 0) {
          return now + 86400; // Default to 24h if invalid
        }
        return now + customHours * 3600;
      }
      default:
        return undefined; // Default to never
    }
  };

  // Validate grant parameters
  const validateGrantParams = async () => {
    setIsValidating(true);
    setValidationErrors([]);

    try {
      const expiresAt = getExpirationTimestamp();

      // Find selected grantee address
      const selectedGrantee = grantees.find(
        (g) => g.id.toString() === selectedGranteeId,
      );
      const granteeAddress = selectedGrantee?.address || "";

      // Create a mock grant file for validation
      const mockGrantFile = {
        grantee: granteeAddress,
        operation: operation,
        parameters: {
          prompt: promptText,
        },
        ...(expiresAt && { expires: expiresAt }),
      };

      // Validate using SDK
      const result = validateGrant(mockGrantFile, {
        throwOnError: false,
        operation: operation,
        grantee: granteeAddress as `0x${string}`,
      });

      if (!result.valid) {
        const errorMessages = result.errors.map((error) => error.message);
        setValidationErrors(errorMessages);
        return false;
      }

      // Additional validation for our specific use case
      const errors: string[] = [];

      if (!operation.trim()) {
        errors.push("Operation is required");
      }

      if (!promptText.trim()) {
        errors.push("Prompt text is required");
      }

      if (selectedFiles.length === 0) {
        errors.push("At least one file must be selected");
      }

      if (!selectedGranteeId.trim()) {
        errors.push(
          grantees.length === 0
            ? "No grantees available. Please add grantees in the Grantees tab first."
            : "Grantee selection is required",
        );
      }

      if (
        expirationOption === "custom" &&
        (!customExpiration || isNaN(parseInt(customExpiration)))
      ) {
        errors.push("Custom expiration must be a valid number of hours");
      }

      if (errors.length > 0) {
        setValidationErrors(errors);
        return false;
      }

      return true;
    } catch (error) {
      setValidationErrors([
        error instanceof Error ? error.message : "Unknown validation error",
      ]);
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirm = async () => {
    console.debug("🔴 [GrantPermissionModal] handleConfirm called");
    console.debug("🔴 [GrantPermissionModal] selectedFiles:", selectedFiles);
    console.debug(
      "🔴 [GrantPermissionModal] selectedGranteeId:",
      selectedGranteeId,
    );
    console.debug("🔴 [GrantPermissionModal] grantees:", grantees);
    console.debug("🔴 [GrantPermissionModal] operation:", operation);
    console.debug("🔴 [GrantPermissionModal] promptText:", promptText);

    const isValid = await validateGrantParams();
    console.debug("🔴 [GrantPermissionModal] validation result:", isValid);

    if (!isValid) {
      console.debug("🔴 [GrantPermissionModal] validation failed, returning");
      return;
    }

    // Find selected grantee address
    const selectedGrantee = grantees.find(
      (g) => g.id.toString() === selectedGranteeId,
    );
    console.debug(
      "🔴 [GrantPermissionModal] selectedGrantee:",
      selectedGrantee,
    );

    const granteeAddress = selectedGrantee?.address || "";
    console.debug("🔴 [GrantPermissionModal] granteeAddress:", granteeAddress);

    const expiresAt = getExpirationTimestamp();
    console.debug("🔴 [GrantPermissionModal] expiresAt:", expiresAt);

    const params: GrantPermissionParams & { expiresAt?: number } = {
      grantee: granteeAddress as `0x${string}`,
      operation,
      files: selectedFiles,
      parameters: {
        prompt: promptText,
      },
      ...(expiresAt && { expiresAt }),
    };

    console.debug("🔴 [GrantPermissionModal] final params:", params);
    console.debug("🔴 [GrantPermissionModal] calling onConfirm with params");

    try {
      onConfirm(params);
      console.debug("🔴 [GrantPermissionModal] onConfirm called successfully");
    } catch (error) {
      console.error("🔴 [GrantPermissionModal] onConfirm failed:", error);
    }
  };

  const handleClose = () => {
    if (!isGranting) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="2xl"
      scrollBehavior="inside"
      isDismissable={!isGranting}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Grant Permission
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            {/* Data Storage Visibility */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-default-100">
                <CardBody className="py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">
                      On-chain Storage
                    </span>
                  </div>
                  <div className="text-xs text-default-600 space-y-1">
                    <div>• File IDs: {selectedFiles.length} files</div>
                    <div>• Permission ID</div>
                    <div>• Grant URL</div>
                  </div>
                </CardBody>
              </Card>

              <Card className="bg-primary/10 border border-primary/20">
                <CardBody className="py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Cloud className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">
                      Off-chain Storage (IPFS)
                    </span>
                  </div>
                  <div className="text-xs text-primary-700 space-y-1">
                    <div>• Operation type</div>
                    <div>• LLM prompt</div>
                    <div>• Expiration rules</div>
                  </div>
                </CardBody>
              </Card>
            </div>

            <Divider />

            {/* Selected Files */}
            <div>
              <p className="text-sm font-medium mb-2">Selected Files:</p>
              <div className="flex flex-wrap gap-2">
                {selectedFiles.map((fileId) => (
                  <Chip key={fileId} size="sm" variant="flat" color="primary">
                    File {fileId}
                  </Chip>
                ))}
              </div>
            </div>

            <Divider />

            {/* Off-chain Configuration (IPFS) */}
            <div className="bg-primary/5 p-3 rounded-lg">
              <p className="text-sm font-medium text-primary mb-3">
                Off-chain Configuration
              </p>

              {/* Operation */}
              <Input
                label="Operation"
                value={operation}
                onChange={(e) => setOperation(e.target.value)}
                placeholder="llm_inference"
                description="The operation that will be performed on your data"
              />

              {/* Parameters (Prompt) */}
              <Textarea
                label="LLM Prompt"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Enter your custom prompt for the LLM"
                description="Customize the prompt that will be used by the LLM when processing your data. Use {{data}} as a placeholder for your file contents."
                minRows={4}
                maxRows={8}
                className="mt-3"
              />

              {/* Expiration */}
              <div className="space-y-2 mt-3">
                <Select
                  label="Expiration"
                  selectedKeys={[expirationOption]}
                  onSelectionChange={(keys) =>
                    setExpirationOption(Array.from(keys)[0] as string)
                  }
                  description="How long this permission should remain valid"
                >
                  <SelectItem key="never" textValue="Never (no expiration)">
                    Never (no expiration)
                  </SelectItem>
                  <SelectItem key="24h" textValue="24 hours">
                    24 hours
                  </SelectItem>
                  <SelectItem key="7d" textValue="7 days">
                    7 days
                  </SelectItem>
                  <SelectItem key="30d" textValue="30 days">
                    30 days
                  </SelectItem>
                  <SelectItem key="custom" textValue="Custom">
                    Custom
                  </SelectItem>
                </Select>

                {expirationOption === "custom" && (
                  <Input
                    label="Custom Expiration (Hours)"
                    type="number"
                    value={customExpiration}
                    onChange={(e) => setCustomExpiration(e.target.value)}
                    placeholder="24"
                    description="Number of hours from now"
                    min="1"
                  />
                )}
              </div>
            </div>

            {/* Grantee Selection */}
            <Select
              label="Grantee"
              placeholder={
                grantees.length === 0
                  ? "No grantees available"
                  : "Select a grantee"
              }
              selectedKeys={selectedGranteeId ? [selectedGranteeId] : []}
              onSelectionChange={(keys) => {
                const selectedKey = Array.from(keys)[0] as string;
                setSelectedGranteeId(selectedKey || "");
              }}
              description={
                grantees.length === 0
                  ? "Please add grantees in the Grantees tab first"
                  : "Select the grantee that will receive this permission"
              }
              isDisabled={grantees.length === 0}
            >
              {grantees.map((grantee) => (
                <SelectItem
                  key={grantee.id.toString()}
                  textValue={`ID: ${grantee.id} - ${grantee.address}`}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      ID: {grantee.id}
                    </span>
                    <span className="text-xs text-default-500">
                      {grantee.address}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </Select>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="p-3 bg-danger/10 rounded-lg border border-danger/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-danger" />
                  <p className="text-sm font-medium text-danger">
                    Validation Errors:
                  </p>
                </div>
                <ul className="text-sm text-danger space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-danger">•</span>
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Preview */}
            <div className="p-3 bg-primary/10 rounded-lg">
              <p className="text-sm font-medium text-primary mb-2">Preview:</p>
              <div className="text-sm text-primary-700 space-y-1">
                <p>
                  <strong>Operation:</strong> {operation}
                </p>
                <p>
                  <strong>Files:</strong> {selectedFiles.length} selected
                </p>
                <p>
                  <strong>Expires:</strong>{" "}
                  {getExpirationTimestamp()
                    ? new Date(
                        (getExpirationTimestamp() ?? 0) * 1000,
                      ).toLocaleString()
                    : "Never"}
                </p>
                <p>
                  <strong>Grantee:</strong>{" "}
                  {selectedGranteeId
                    ? (() => {
                        const selectedGrantee = grantees.find(
                          (g) => g.id.toString() === selectedGranteeId,
                        );
                        return selectedGrantee
                          ? `ID: ${selectedGrantee.id} (${selectedGrantee.address})`
                          : "Not found";
                      })()
                    : "Not selected"}
                </p>
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={handleClose} isDisabled={isGranting}>
            Cancel
          </Button>
          <Button
            color="primary"
            onPress={handleConfirm}
            isLoading={isGranting || isValidating}
            isDisabled={selectedFiles.length === 0 || !selectedGranteeId.trim()}
            startContent={
              !isGranting && !isValidating ? (
                <Eye className="h-4 w-4" />
              ) : undefined
            }
          >
            {isValidating
              ? "Validating..."
              : isGranting
                ? "Granting..."
                : "Grant Permission"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
