"use client";

import React, { useState, useEffect } from "react";
import { useVana } from "@/providers/VanaProvider";
import { useAccount, useChainId } from "wagmi";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Spinner,
  Chip,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Select,
  SelectItem,
  Tooltip,
} from "@heroui/react";
import {
  FileText,
  Check,
  X,
  RefreshCw,
  Plus,
  ExternalLink,
  Copy,
} from "lucide-react";
import type { Dataset } from "@opendatalabs/vana-sdk";
import { AddressDisplay } from "@/components/ui/AddressDisplay";

// Unified file row type
type FileRow = {
  fileId: number;
  datasetId: number;
  status: "pending" | "accepted";
  ownerAddress: string;
  addedAtBlock: bigint;
  url: string;
  datasetOwner: string;
  schemaId: number;
};

export default function DatasetsPage() {
  const { vana } = useVana();
  const { address } = useAccount();
  const chainId = useChainId();

  // Helper function to get block explorer URL
  const getBlockExplorerUrl = (fileId: number) => {
    const baseUrl =
      chainId === 1480 ? "https://vanascan.io" : "https://moksha.vanascan.io";
    return `${baseUrl}/tx/${fileId}`; // Update with correct path for files
  };

  // Helper function to copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // User's datasets state
  const [userDatasets, setUserDatasets] = useState<
    Array<Dataset & { id: number }>
  >([]);
  const [loadingUserDatasets, setLoadingUserDatasets] = useState(false);

  // Unified files state
  const [allFiles, setAllFiles] = useState<FileRow[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "accepted"
  >("all");
  const [datasetFilter, setDatasetFilter] = useState<string>("");

  // Selection
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Create dataset state
  const [showCreate, setShowCreate] = useState(false);
  const [schemaId, setSchemaId] = useState("");
  const [creating, setCreating] = useState(false);

  // Processing state
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Load user's owned datasets
  const loadUserDatasets = async () => {
    if (!vana || !address) return;

    setLoadingUserDatasets(true);
    try {
      const datasets = await vana.dataset.getUserDatasets({
        owner: address,
      });
      setUserDatasets(datasets);
    } catch (err) {
      console.error("Failed to load user datasets:", err);
      setError(err instanceof Error ? err.message : "Failed to load datasets");
    } finally {
      setLoadingUserDatasets(false);
    }
  };

  // Load all files from all datasets
  const loadAllFiles = async () => {
    if (!vana || userDatasets.length === 0) return;

    setLoadingFiles(true);
    try {
      const filesPromises: Promise<FileRow>[] = [];

      for (const dataset of userDatasets) {
        // Load pending files
        for (const fileId of dataset.pendingFileIds) {
          filesPromises.push(
            vana.data.getFileById(fileId).then((file) => ({
              fileId,
              datasetId: dataset.id,
              status: "pending" as const,
              ownerAddress: file.ownerAddress,
              addedAtBlock: file.addedAtBlock,
              url: file.url,
              datasetOwner: dataset.owner,
              schemaId: dataset.schemaId,
            })),
          );
        }

        // Load accepted files
        for (const fileId of dataset.fileIds) {
          filesPromises.push(
            vana.data.getFileById(fileId).then((file) => ({
              fileId,
              datasetId: dataset.id,
              status: "accepted" as const,
              ownerAddress: file.ownerAddress,
              addedAtBlock: file.addedAtBlock,
              url: file.url,
              datasetOwner: dataset.owner,
              schemaId: dataset.schemaId,
            })),
          );
        }
      }

      const files = await Promise.all(filesPromises);
      setAllFiles(files);
    } catch (err) {
      console.error("Failed to load files:", err);
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoadingFiles(false);
    }
  };

  // Load datasets on mount
  useEffect(() => {
    if (vana && address) {
      void loadUserDatasets();
    }
  }, [vana, address]);

  // Load files when datasets change
  useEffect(() => {
    if (userDatasets.length > 0) {
      void loadAllFiles();
    }
  }, [userDatasets]);

  // Filter files based on current filters
  const filteredFiles = React.useMemo(() => {
    return allFiles.filter((file) => {
      // Status filter
      if (statusFilter !== "all" && file.status !== statusFilter) {
        return false;
      }

      // Dataset filter
      if (datasetFilter && file.datasetId.toString() !== datasetFilter) {
        return false;
      }

      return true;
    });
  }, [allFiles, statusFilter, datasetFilter]);

  // Handle accept file
  const handleAcceptFile = async (datasetId: number, fileId: number) => {
    if (!vana) return;

    const key = `${datasetId}-${fileId}`;
    setProcessing((prev) => new Set(prev).add(key));
    setError(null);

    try {
      const tx = await vana.dataset.acceptFile(datasetId, fileId);
      await vana.publicClient.waitForTransactionReceipt({ hash: tx.hash });

      // Reload data
      await loadUserDatasets();
    } catch (err) {
      console.error("Failed to accept file:", err);
      setError(err instanceof Error ? err.message : "Failed to accept file");
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // Handle reject file
  const handleRejectFile = async (datasetId: number, fileId: number) => {
    if (!vana) return;

    const key = `${datasetId}-${fileId}`;
    setProcessing((prev) => new Set(prev).add(key));
    setError(null);

    try {
      const tx = await vana.dataset.rejectFile(datasetId, fileId);
      await vana.publicClient.waitForTransactionReceipt({ hash: tx.hash });

      // Reload data
      await loadUserDatasets();
    } catch (err) {
      console.error("Failed to reject file:", err);
      setError(err instanceof Error ? err.message : "Failed to reject file");
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // Handle batch accept
  const handleBatchAccept = async () => {
    const selectedFiles = Array.from(selectedKeys).map((key) => {
      const [datasetId, fileId] = key.split("-").map(Number);
      return { datasetId, fileId };
    });

    for (const { datasetId, fileId } of selectedFiles) {
      await handleAcceptFile(datasetId, fileId);
    }

    setSelectedKeys(new Set());
  };

  // Handle batch reject
  const handleBatchReject = async () => {
    const selectedFiles = Array.from(selectedKeys).map((key) => {
      const [datasetId, fileId] = key.split("-").map(Number);
      return { datasetId, fileId };
    });

    for (const { datasetId, fileId } of selectedFiles) {
      await handleRejectFile(datasetId, fileId);
    }

    setSelectedKeys(new Set());
  };

  // Handle create dataset
  const handleCreateDataset = async () => {
    if (!vana || !schemaId) return;

    setCreating(true);
    setError(null);

    try {
      const tx = await vana.dataset.createDataset(Number(schemaId));
      await vana.publicClient.waitForTransactionReceipt({ hash: tx.hash });

      setShowCreate(false);
      setSchemaId("");
      await loadUserDatasets();
    } catch (err) {
      console.error("Failed to create dataset:", err);
      setError(err instanceof Error ? err.message : "Failed to create dataset");
    } finally {
      setCreating(false);
    }
  };

  // Check if user is owner of the dataset
  const isOwner = (datasetOwner: string) => {
    return datasetOwner.toLowerCase() === address?.toLowerCase();
  };

  // Count pending files that can be acted upon
  const pendingFileCount = filteredFiles.filter(
    (f) => f.status === "pending" && isOwner(f.datasetOwner),
  ).length;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Dataset Files</h1>
          <p className="text-default-500 mt-2">
            Manage files across all your datasets
          </p>
        </div>
        <Button
          color="primary"
          startContent={<Plus className="h-4 w-4" />}
          onPress={() => {
            setShowCreate(!showCreate);
          }}
        >
          Create Dataset
        </Button>
      </div>

      {/* Create Dataset Form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Create New Dataset</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              label="Schema ID"
              placeholder="Enter schema ID"
              value={schemaId}
              onChange={(e) => {
                setSchemaId(e.target.value);
              }}
              type="number"
            />
            <div className="flex gap-2">
              <Button
                color="primary"
                onPress={handleCreateDataset}
                isLoading={creating}
                isDisabled={!schemaId || !vana}
              >
                Create
              </Button>
              <Button
                variant="flat"
                onPress={() => {
                  setShowCreate(false);
                  setSchemaId("");
                }}
              >
                Cancel
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Card className="border-default-200 bg-default-50 dark:bg-default-100/10">
          <CardBody>
            <p className="text-sm">{error}</p>
          </CardBody>
        </Card>
      )}

      {/* Files Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full gap-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <div>
                <h3 className="text-lg font-semibold">Files</h3>
                <p className="text-sm text-default-500">
                  {filteredFiles.length} file
                  {filteredFiles.length !== 1 ? "s" : ""}{" "}
                  {pendingFileCount > 0 &&
                    `· ${pendingFileCount} pending review`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Select
                label="Status"
                selectedKeys={[statusFilter]}
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0] as string;
                  setStatusFilter(key as "all" | "pending" | "accepted");
                }}
                className="min-w-[140px]"
                size="sm"
              >
                <SelectItem key="all">All</SelectItem>
                <SelectItem key="pending">Pending</SelectItem>
                <SelectItem key="accepted">Accepted</SelectItem>
              </Select>

              <Select
                label="Dataset"
                selectedKeys={datasetFilter ? [datasetFilter] : []}
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0] as string;
                  setDatasetFilter(key || "");
                }}
                className="min-w-[160px]"
                size="sm"
                items={[
                  { key: "", label: "All Datasets" },
                  ...userDatasets.map((d) => ({
                    key: d.id.toString(),
                    label: `Dataset #${d.id}`,
                  })),
                ]}
              >
                {(item) => <SelectItem key={item.key}>{item.label}</SelectItem>}
              </Select>

              {selectedKeys.size > 0 && (
                <div className="flex gap-2">
                  <Button
                    color="success"
                    size="sm"
                    variant="flat"
                    startContent={<Check className="h-4 w-4" />}
                    onPress={handleBatchAccept}
                  >
                    Accept ({selectedKeys.size})
                  </Button>
                  <Button
                    color="danger"
                    size="sm"
                    variant="flat"
                    startContent={<X className="h-4 w-4" />}
                    onPress={handleBatchReject}
                  >
                    Reject ({selectedKeys.size})
                  </Button>
                </div>
              )}

              <Button
                onPress={() => loadUserDatasets()}
                variant="bordered"
                size="sm"
                isIconOnly
                startContent={
                  loadingUserDatasets ? (
                    <Spinner size="sm" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )
                }
                isDisabled={loadingUserDatasets}
              />
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {loadingUserDatasets || loadingFiles ? (
            <div className="flex justify-center items-center p-8">
              <Spinner size="lg" />
              <span className="ml-3">Loading files...</span>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                No files found.{" "}
                {userDatasets.length === 0
                  ? "Create a dataset to get started."
                  : ""}
              </p>
            </div>
          ) : (
            <Table
              aria-label="Files table"
              selectionMode="multiple"
              selectedKeys={selectedKeys}
              disallowEmptySelection={false}
              onSelectionChange={(keys) => {
                if (keys === "all") {
                  // Select all pending files that user owns
                  const ownedPending = filteredFiles
                    .filter(
                      (f) => f.status === "pending" && isOwner(f.datasetOwner),
                    )
                    .map((f) => `${f.datasetId}-${f.fileId}`);
                  setSelectedKeys(new Set(ownedPending));
                } else {
                  setSelectedKeys(new Set(keys as Set<string>));
                }
              }}
            >
              <TableHeader>
                <TableColumn>File ID</TableColumn>
                <TableColumn>Dataset ID</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn>Contributor</TableColumn>
                <TableColumn>Block</TableColumn>
                <TableColumn>URL</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody>
                {filteredFiles.map((file) => {
                  const key = `${file.datasetId}-${file.fileId}`;
                  const isProcessing = processing.has(key);
                  const canAct =
                    file.status === "pending" && isOwner(file.datasetOwner);

                  return (
                    <TableRow key={key}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">#{file.fileId}</span>
                          <Tooltip content="Copy File ID">
                            <Button
                              size="sm"
                              variant="light"
                              isIconOnly
                              onPress={() =>
                                copyToClipboard(file.fileId.toString())
                              }
                              className="min-w-unit-6 w-6 h-6"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </Tooltip>
                          <Tooltip content="View in Explorer">
                            <Button
                              as="a"
                              href={getBlockExplorerUrl(file.fileId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              size="sm"
                              variant="light"
                              isIconOnly
                              className="min-w-unit-6 w-6 h-6"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">
                          #{file.datasetId}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Chip
                          color={
                            file.status === "accepted" ? "success" : "warning"
                          }
                          size="sm"
                          variant="flat"
                        >
                          {file.status}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <AddressDisplay address={file.ownerAddress} />
                      </TableCell>
                      <TableCell>
                        <span>{Number(file.addedAtBlock)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-500 truncate max-w-[200px]">
                            {file.url}
                          </span>
                          <Tooltip content="Open URL">
                            <Button
                              as="a"
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              size="sm"
                              variant="light"
                              isIconOnly
                              className="min-w-unit-6 w-6 h-6 flex-shrink-0"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </Tooltip>
                          <Tooltip content="Copy URL">
                            <Button
                              size="sm"
                              variant="light"
                              isIconOnly
                              onPress={() => copyToClipboard(file.url)}
                              className="min-w-unit-6 w-6 h-6 flex-shrink-0"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canAct && (
                          <div className="flex gap-2">
                            <Button
                              color="success"
                              size="sm"
                              variant="light"
                              startContent={<Check className="h-3 w-3" />}
                              onPress={() =>
                                handleAcceptFile(file.datasetId, file.fileId)
                              }
                              isLoading={isProcessing}
                              isDisabled={isProcessing}
                            >
                              Accept
                            </Button>
                            <Button
                              color="danger"
                              size="sm"
                              variant="light"
                              startContent={<X className="h-3 w-3" />}
                              onPress={() =>
                                handleRejectFile(file.datasetId, file.fileId)
                              }
                              isLoading={isProcessing}
                              isDisabled={isProcessing}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
