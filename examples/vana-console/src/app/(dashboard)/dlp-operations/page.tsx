"use client";

import React, { useState } from "react";
import { useChainId } from "wagmi";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Spinner,
} from "@heroui/react";
import { DollarSign, Plus, RefreshCw } from "lucide-react";
import type { RuntimePermission } from "@opendatalabs/vana-sdk/browser";
import { useVana } from "@/providers/VanaProvider";
import { CreateRuntimePermissionModal } from "@/components/ui/CreateRuntimePermissionModal";

/**
 * DLP Operations page - Monetize dataset access via Vana Runtime
 *
 * This page allows DLP operators to create and manage runtime permissions
 * for their datasets. Data consumers can request access, pay for operations,
 * and execute tasks on encrypted data through the Vana Runtime TEE environment.
 */
export default function DLPOperationsPage() {
  const chainId = useChainId();
  const { vana } = useVana();

  // State
  const [datasetIdInput, setDatasetIdInput] = useState<string>("");
  const [selectedDatasetId, setSelectedDatasetId] = useState<bigint | null>(
    null,
  );
  const [permissions, setPermissions] = useState<RuntimePermission[]>([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load permissions for selected dataset
  const loadPermissions = async () => {
    if (!vana || !datasetIdInput) {
      setError("Please enter a dataset ID");
      return;
    }

    setIsLoadingPermissions(true);
    setError(null);

    try {
      const datasetId = BigInt(datasetIdInput);
      setSelectedDatasetId(datasetId);

      // TODO: Re-enable when VanaRuntimePermissions contract is deployed and SDK is updated
      // const permissionIds =
      //   await vana.runtimePermissions.getDatasetPermissions(datasetId);
      // const perms = await Promise.all(
      //   permissionIds.map((id: bigint) => vana.runtimePermissions.getPermission(id)),
      // );

      // Stub implementation until contract is deployed
      const perms: RuntimePermission[] = [];

      setPermissions(perms);
    } catch (err) {
      console.error("Failed to load permissions:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load permissions",
      );
      setPermissions([]);
    } finally {
      setIsLoadingPermissions(false);
    }
  };

  // Handle permission created
  const handlePermissionCreated = () => {
    setIsModalOpen(false);
    void loadPermissions(); // Refresh the list
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          DLP Operations
        </h1>
        <p className="text-lg text-default-600">
          Monetize dataset access via Vana Runtime
        </p>
      </div>

      {/* Dataset Selector */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Select Dataset</h3>
          </div>
        </CardHeader>
        <CardBody>
          <div className="flex gap-2">
            <Input
              type="number"
              label="Dataset ID"
              placeholder="Enter your dataset ID"
              value={datasetIdInput}
              onChange={(e) => setDatasetIdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void loadPermissions();
                }
              }}
              className="flex-1"
            />
            <Button
              color="primary"
              startContent={<RefreshCw className="h-4 w-4" />}
              onPress={() => {
                void loadPermissions();
              }}
              isLoading={isLoadingPermissions}
            >
              Load Permissions
            </Button>
          </div>
          {error && (
            <p className="text-danger text-sm mt-2">{error}</p>
          )}
        </CardBody>
      </Card>

      {/* Permissions Table */}
      {selectedDatasetId !== null && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">
                Runtime Permissions for Dataset #{selectedDatasetId.toString()}
              </h3>
            </div>
            <Button
              color="primary"
              startContent={<Plus className="h-4 w-4" />}
              onPress={() => setIsModalOpen(true)}
              isDisabled={!vana}
            >
              Create Permission
            </Button>
          </CardHeader>
          <CardBody>
            {isLoadingPermissions ? (
              <div className="flex justify-center items-center p-8">
                <Spinner size="lg" />
              </div>
            ) : permissions.length > 0 ? (
              <Table aria-label="Runtime permissions table" removeWrapper>
                <TableHeader>
                  <TableColumn>Grantee ID</TableColumn>
                  <TableColumn>Dataset ID</TableColumn>
                  <TableColumn>Grant URL</TableColumn>
                  <TableColumn>Start Block</TableColumn>
                  <TableColumn>End Block</TableColumn>
                </TableHeader>
                <TableBody>
                  {permissions.map((permission, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono text-sm">
                        {permission.granteeId.toString()}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {permission.datasetId.toString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-xs truncate">
                        {permission.grant}
                      </TableCell>
                      <TableCell>{permission.startBlock.toString()}</TableCell>
                      <TableCell>{permission.endBlock.toString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center p-8">
                <p className="text-default-600">
                  No permissions found for this dataset.
                </p>
                <p className="text-sm text-default-500 mt-2">
                  Create a permission to allow data consumers to access your
                  dataset.
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Create Permission Modal */}
      <CreateRuntimePermissionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        datasetId={selectedDatasetId}
        onSuccess={handlePermissionCreated}
      />
    </div>
  );
}
