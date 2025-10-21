/**
 * Batch Builder Modal Component
 *
 * @remarks
 * Main modal for composing batches of operations via templates or manual entry.
 * Manages BatchBuilder state and coordinates UI components.
 */
"use client";

import { useState, useMemo, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Chip,
  Divider,
  Spinner,
} from "@heroui/react";
import {
  Layers,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle,
  FileJson,
  Play,
} from "lucide-react";
import type { Network, AuditResults } from "../../lib/types";
import {
  BatchBuilder,
  downloadSafeJSON,
  generateSafeFilename,
  executeBatch,
  type CreateOperationInput,
} from "../../lib/batch";
import { OperationQueue } from "./OperationQueue";
import { TemplateSelector } from "./TemplateSelector";

interface BatchBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  network: Network;
  auditResults: AuditResults;
}

/**
 * BatchBuilderModal provides full batch composition UI
 */
export function BatchBuilderModal({
  isOpen,
  onClose,
  network,
  auditResults,
}: BatchBuilderModalProps) {
  const [builder, setBuilder] = useState<BatchBuilder>(
    () => new BatchBuilder(network, "New Batch", ""),
  );
  const [batchName, setBatchName] = useState("Permission Batch");
  const [batchDescription, setBatchDescription] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);

  // Wallet connection
  const { isConnected, address: connectedAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // Get operations from builder
  const operations = useMemo(() => builder.getOperations(), [builder]);

  // Validation with audit results for orphaned contract detection
  const validation = useMemo(
    () => builder.validate(auditResults),
    [builder, auditResults],
  );

  // Handle template generation
  const handleTemplateGenerate = (newOperations: CreateOperationInput[]) => {
    builder.addOperations(newOperations);
    setBuilder(BatchBuilder.fromBatch(builder.toBatch()));
  };

  // Handle remove operation
  const handleRemoveOperation = (id: string) => {
    builder.removeOperation(id);
    // Force re-render by creating new builder instance
    setBuilder(BatchBuilder.fromBatch(builder.toBatch()));
  };

  // Handle reorder
  const handleReorder = (oldIndex: number, newIndex: number) => {
    const operation = operations[oldIndex];
    if (operation) {
      builder.moveOperationToIndex(operation.id, newIndex);
      setBuilder(BatchBuilder.fromBatch(builder.toBatch()));
    }
  };

  // Handle clear all
  const handleClearAll = () => {
    const newBuilder = new BatchBuilder(network, batchName, batchDescription);
    setBuilder(newBuilder);
  };

  // Handle download
  const handleDownload = () => {
    // Update builder with current name/description
    builder.setName(batchName);
    builder.setDescription(batchDescription);

    const batch = builder.toBatch();
    const filename = generateSafeFilename(batch);
    downloadSafeJSON(batch, filename);
  };

  // Handle execute
  const handleExecute = useCallback(async () => {
    if (!walletClient || !publicClient) return;

    setIsExecuting(true);

    // Update builder with current name/description
    builder.setName(batchName);
    builder.setDescription(batchDescription);

    const batch = builder.toBatch();

    try {
      await executeBatch(
        batch,
        walletClient,
        publicClient,
        (operationId, status) => {
          // Log execution progress
          console.log(`Operation ${operationId}:`, status);
        },
      );

      // Success - show success message or close modal
      alert("Batch executed successfully!");
    } catch (error) {
      console.error("Batch execution failed:", error);
      alert(
        `Batch execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsExecuting(false);
    }
  }, [walletClient, publicClient, builder, batchName, batchDescription]);

  // Handle close
  const handleClose = () => {
    // Reset builder
    setBuilder(new BatchBuilder(network, "New Batch", ""));
    setBatchName("Permission Batch");
    setBatchDescription("");
    onClose();
  };

  // Operation count by type
  const operationCounts = useMemo(() => {
    const grants = operations.filter((op) => op.type === "grant").length;
    const revokes = operations.filter((op) => op.type === "revoke").length;
    return { grants, revokes, total: operations.length };
  }, [operations]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="4xl"
      scrollBehavior="inside"
      classNames={{
        base: "max-h-[90vh]",
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 border-b border-divider pb-4">
          <Layers className="h-5 w-5 text-primary" />
          <span>Batch Transaction Builder</span>
        </ModalHeader>

        <ModalBody className="gap-4 pb-4 pt-4">
          {/* Network and wallet status */}
          <div className="space-y-2">
            <div className="px-3 py-2 bg-primary/10 rounded-lg text-sm border border-primary/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileJson className="h-4 w-4 text-primary flex-shrink-0" />
                <span>
                  Network:{" "}
                  <strong>
                    {network === "mainnet" ? "Mainnet" : "Moksha"}
                  </strong>
                  {" (chainId: "}
                  {network === "mainnet" ? "1480" : "14800"})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {operationCounts.total > 0 && (
                  <>
                    <Chip size="sm" color="success" variant="flat">
                      {operationCounts.grants} grants
                    </Chip>
                    <Chip size="sm" color="warning" variant="flat">
                      {operationCounts.revokes} revokes
                    </Chip>
                  </>
                )}
              </div>
            </div>

            {/* Wallet connection status */}
            {isConnected && connectedAddress ? (
              <div className="px-3 py-2 bg-success/10 rounded-lg text-sm border border-success/20 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
                <span>
                  Connected:{" "}
                  <span className="font-mono">
                    {connectedAddress.slice(0, 6)}...
                    {connectedAddress.slice(-4)}
                  </span>
                </span>
              </div>
            ) : (
              <div className="px-3 py-2 bg-warning/10 rounded-lg text-sm border border-warning/20 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning flex-shrink-0" />
                <span>
                  No wallet connected - connect to execute batch directly
                </span>
              </div>
            )}
          </div>

          {/* Batch metadata */}
          <div className="grid grid-cols-1 gap-3">
            <Input
              label="Batch Name"
              placeholder="e.g., Q4 Permission Cleanup"
              value={batchName}
              onValueChange={setBatchName}
              classNames={{
                inputWrapper: "bg-content2/50",
              }}
            />
            <Input
              label="Description (Optional)"
              placeholder="e.g., Remove deactivated users"
              value={batchDescription}
              onValueChange={setBatchDescription}
              classNames={{
                inputWrapper: "bg-content2/50",
              }}
            />
          </div>

          <Divider />

          {/* Template Selector */}
          <TemplateSelector
            auditResults={auditResults}
            onGenerate={handleTemplateGenerate}
          />

          <Divider />

          {/* Operation queue */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Operations Queue</h3>
              {operations.length > 0 && (
                <Button
                  size="sm"
                  variant="flat"
                  color="danger"
                  startContent={<Trash2 className="h-4 w-4" />}
                  onPress={handleClearAll}
                >
                  Clear All
                </Button>
              )}
            </div>

            <OperationQueue
              operations={operations}
              onRemove={handleRemoveOperation}
              onReorder={handleReorder}
              warnings={validation.warnings}
            />
          </div>

          {/* Validation display - only show errors if there are operations */}
          {operations.length > 0 &&
            !validation.valid &&
            validation.errors.length > 0 && (
              <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-danger flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-danger mb-1">
                      Validation Errors
                    </p>
                    <ul className="list-disc list-inside text-xs text-danger space-y-1">
                      {validation.errors.map((error, idx) => (
                        <li key={idx}>{error.message}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

          {operations.length > 0 && validation.warnings.length > 0 && (
            <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-warning mb-1">
                    Warnings
                  </p>
                  <ul className="list-disc list-inside text-xs text-warning space-y-1">
                    {validation.warnings.map((warning, idx) => (
                      <li key={idx}>{warning.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {validation.valid && operations.length > 0 && (
            <div className="p-3 bg-success/10 border border-success/30 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                <p className="text-sm text-success">
                  Batch is valid and ready to export
                </p>
              </div>
            </div>
          )}
        </ModalBody>

        <ModalFooter className="border-t border-divider">
          <Button variant="flat" onPress={handleClose} isDisabled={isExecuting}>
            Close
          </Button>
          <div className="flex gap-2">
            {isConnected && walletClient && publicClient && (
              <Button
                color="success"
                startContent={
                  isExecuting ? (
                    <Spinner size="sm" color="white" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )
                }
                onPress={handleExecute}
                isDisabled={
                  !validation.valid || operations.length === 0 || isExecuting
                }
              >
                {isExecuting ? "Executing..." : "Execute"}
              </Button>
            )}
            <Button
              color="primary"
              variant={
                isConnected && walletClient && publicClient ? "flat" : "solid"
              }
              startContent={<Download className="h-4 w-4" />}
              onPress={handleDownload}
              isDisabled={
                !validation.valid || operations.length === 0 || isExecuting
              }
            >
              Download Safe JSON
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
