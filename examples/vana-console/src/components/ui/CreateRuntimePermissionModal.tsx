import React, { useState, useEffect } from "react";
import type { Address } from "viem";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
  SelectItem,
  Divider,
  Card,
  CardBody,
} from "@heroui/react";
import { DollarSign, AlertCircle, Cloud, Database } from "lucide-react";
import { useVana } from "@/providers/VanaProvider";

export interface CreateRuntimePermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetId: bigint | null;
  onSuccess?: () => void;
}

/**
 * Modal for creating runtime permissions for dataset monetization
 *
 * This modal allows DLP operators to create permissions for data consumers
 * to execute operations on their datasets via Vana Runtime TEE environment.
 */
export const CreateRuntimePermissionModal: React.FC<
  CreateRuntimePermissionModalProps
> = ({ isOpen, onClose, datasetId, onSuccess }) => {
  const { vana } = useVana();

  // Form state
  const [grantee, setGrantee] = useState<string>("");
  const [task, setTask] = useState("thinker/task:v1");
  const [operation, setOperation] = useState("aggregate_keywords");
  const [pricePerFile, setPricePerFile] = useState("0.1");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState("");
  const [endBlock, setEndBlock] = useState("");

  // Operation state
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setGrantee("");
      setTask("thinker/task:v1");
      setOperation("aggregate_keywords");
      setPricePerFile("0.1");
      setMinimumPrice("");
      setMaximumPrice("");
      setEndBlock("");
      setError(null);
      setValidationErrors([]);
    }
  }, [isOpen]);

  // Validate form
  const validateForm = (): boolean => {
    const errors: string[] = [];

    if (!datasetId) {
      errors.push("Dataset ID is required");
    }

    if (!grantee.trim()) {
      errors.push("Grantee address is required");
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(grantee)) {
      errors.push("Grantee address must be a valid Ethereum address");
    }

    if (!task.trim()) {
      errors.push("Task is required");
    }

    if (!operation.trim()) {
      errors.push("Operation is required");
    }

    if (!pricePerFile.trim()) {
      errors.push("Price per file is required");
    } else {
      const price = parseFloat(pricePerFile);
      if (isNaN(price) || price < 0) {
        errors.push("Price per file must be a valid non-negative number");
      }
    }

    if (minimumPrice && isNaN(parseFloat(minimumPrice))) {
      errors.push("Minimum price must be a valid number");
    }

    if (maximumPrice && isNaN(parseFloat(maximumPrice))) {
      errors.push("Maximum price must be a valid number");
    }

    if (!endBlock.trim()) {
      errors.push("End block is required");
    } else {
      try {
        const block = BigInt(endBlock);
        if (block <= 0) {
          errors.push("End block must be greater than 0");
        }
      } catch {
        errors.push("End block must be a valid number");
      }
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Handle create permission
  const handleCreate = async () => {
    if (!vana || !datasetId) {
      setError("Vana SDK not initialized or dataset not selected");
      return;
    }

    if (!validateForm()) {
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const pricing: {
        price_per_file_vana: number;
        minimum_price_vana?: number;
        maximum_price_vana?: number;
      } = {
        price_per_file_vana: parseFloat(pricePerFile),
      };

      if (minimumPrice) {
        pricing.minimum_price_vana = parseFloat(minimumPrice);
      }

      if (maximumPrice) {
        pricing.maximum_price_vana = parseFloat(maximumPrice);
      }

      // TODO: Re-enable when VanaRuntimePermissions contract is deployed and SDK is updated
      // const result = await vana.runtimePermissions.createPermission({
      //   datasetId,
      //   grantee: grantee as Address,
      //   task,
      //   operation,
      //   pricing,
      //   endBlock: BigInt(endBlock),
      // });
      // console.log("Permission created:", result);

      // Stub implementation until contract is deployed
      console.log("Permission creation stubbed - contract not deployed yet");
      setError("Runtime permissions feature is not yet available. The VanaRuntimePermissions contract has not been deployed yet. This UI is ready for when the contract is available.");
      return; // Don't proceed until contract is deployed

      // Call success callback
      // if (onSuccess) {
      //   onSuccess();
      // }
      // Close modal
      // onClose();
    } catch (err) {
      console.error("Failed to create permission:", err);
      setError(err instanceof Error ? err.message : "Failed to create permission");
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="2xl"
      scrollBehavior="inside"
      isDismissable={!isCreating}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Create Runtime Permission
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            {/* Storage Visibility Info */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-default-100">
                <CardBody className="py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">On-chain Storage</span>
                  </div>
                  <div className="text-xs text-default-600 space-y-1">
                    <div>• Dataset ID</div>
                    <div>• Grantee ID</div>
                    <div>• Block range</div>
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
                    <div>• Task name</div>
                    <div>• Operation type</div>
                    <div>• Pricing details</div>
                    <div>• Operation parameters</div>
                  </div>
                </CardBody>
              </Card>
            </div>

            <Divider />

            {/* Dataset ID Display */}
            <div className="p-3 bg-default-100 rounded-lg">
              <p className="text-sm font-medium mb-1">Dataset ID:</p>
              <p className="text-lg font-mono">
                {datasetId?.toString() ?? "Not selected"}
              </p>
            </div>

            <Divider />

            {/* Grantee Address */}
            <Input
              label="Grantee Address"
              value={grantee}
              onChange={(e) => setGrantee(e.target.value)}
              placeholder="0x..."
              description="Ethereum address of the data consumer"
              isRequired
            />

            <Divider />

            {/* Off-chain Configuration (IPFS) */}
            <div className="bg-primary/5 p-3 rounded-lg">
              <p className="text-sm font-medium text-primary mb-3">
                Off-chain Configuration
              </p>

              {/* Task */}
              <Input
                label="Task"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="thinker/task:v1"
                description="The Vana Runtime task that will process the data"
                isRequired
              />

              {/* Operation */}
              <Select
                label="Operation"
                selectedKeys={[operation]}
                onSelectionChange={(keys) => {
                  setOperation(Array.from(keys)[0] as string);
                }}
                description="The specific operation to be performed on the data"
                isRequired
                className="mt-3"
              >
                <SelectItem key="aggregate_keywords" textValue="Aggregate Keywords">
                  Aggregate Keywords
                </SelectItem>
                <SelectItem key="query_keywords" textValue="Query Keywords">
                  Query Keywords (10% rate)
                </SelectItem>
                <SelectItem key="get_stats" textValue="Get Stats">
                  Get Stats (flat 0.01 VANA)
                </SelectItem>
              </Select>

              {/* Pricing */}
              <div className="space-y-3 mt-3">
                <Input
                  label="Price Per File (VANA)"
                  type="number"
                  value={pricePerFile}
                  onChange={(e) => setPricePerFile(e.target.value)}
                  placeholder="0.1"
                  description="Base price per file in VANA tokens"
                  min="0"
                  step="0.01"
                  isRequired
                />

                <Input
                  label="Minimum Price (VANA)"
                  type="number"
                  value={minimumPrice}
                  onChange={(e) => setMinimumPrice(e.target.value)}
                  placeholder="Optional"
                  description="Optional minimum total price"
                  min="0"
                  step="0.01"
                />

                <Input
                  label="Maximum Price (VANA)"
                  type="number"
                  value={maximumPrice}
                  onChange={(e) => setMaximumPrice(e.target.value)}
                  placeholder="Optional"
                  description="Optional maximum total price"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            {/* Block Range */}
            <Input
              label="End Block"
              type="number"
              value={endBlock}
              onChange={(e) => setEndBlock(e.target.value)}
              placeholder="2000000"
              description="The block number when this permission expires"
              isRequired
            />

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
                  {validationErrors.map((err, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-danger">•</span>
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-3 bg-danger/10 rounded-lg border border-danger/20">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-danger" />
                  <p className="text-sm text-danger">{error}</p>
                </div>
              </div>
            )}

            {/* Preview */}
            <div className="p-3 bg-primary/10 rounded-lg">
              <p className="text-sm font-medium text-primary mb-2">Preview:</p>
              <div className="text-sm text-primary-700 space-y-1">
                <p>
                  <strong>Dataset:</strong> {datasetId?.toString() ?? "N/A"}
                </p>
                <p>
                  <strong>Grantee:</strong> {grantee || "Not set"}
                </p>
                <p>
                  <strong>Task:</strong> {task}
                </p>
                <p>
                  <strong>Operation:</strong> {operation}
                </p>
                <p>
                  <strong>Price:</strong> {pricePerFile} VANA per file
                </p>
                {minimumPrice && (
                  <p>
                    <strong>Minimum:</strong> {minimumPrice} VANA
                  </p>
                )}
                {maximumPrice && (
                  <p>
                    <strong>Maximum:</strong> {maximumPrice} VANA
                  </p>
                )}
                <p>
                  <strong>Valid until block:</strong> {endBlock || "Not set"}
                </p>
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={handleClose} isDisabled={isCreating}>
            Cancel
          </Button>
          <Button
            color="primary"
            onPress={handleCreate}
            isLoading={isCreating}
            isDisabled={!datasetId}
            startContent={
              !isCreating ? <DollarSign className="h-4 w-4" /> : undefined
            }
          >
            {isCreating ? "Creating..." : "Create Permission"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
