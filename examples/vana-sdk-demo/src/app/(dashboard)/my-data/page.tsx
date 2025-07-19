"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useChainId } from "wagmi";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Spinner,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Checkbox,
  Chip,
  Pagination,
  SortDescriptor,
  Tabs,
  Tab,
  Tooltip,
  Select,
  SelectItem,
} from "@heroui/react";
import {
  Database,
  Search,
  ExternalLink,
  Download,
  RefreshCw,
  Key,
  Shield,
  Eye,
  Users,
  FileText,
  Trash2,
  Server,
} from "lucide-react";
import type {
  Schema,
  GrantPermissionParams,
} from "@opendatalabs/vana-sdk/browser";
import { convertIpfsUrl } from "@opendatalabs/vana-sdk/browser";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDisplay } from "@/components/ui/StatusDisplay";
import { CopyButton } from "@/components/ui/CopyButton";
import { FilePreview } from "@/components/FilePreview";
import { FileIdDisplay } from "@/components/ui/FileIdDisplay";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { PermissionDisplay } from "@/components/ui/PermissionDisplay";
import { FormBuilder } from "@/components/ui/FormBuilder";
import { DataUploadForm } from "@/components/ui/DataUploadForm";
import { GrantPermissionModal } from "@/components/ui/GrantPermissionModal";
import { useUserFiles } from "@/hooks/useUserFiles";
import { usePermissions } from "@/hooks/usePermissions";
import { useTrustedServers } from "@/hooks/useTrustedServers";
import { useVana } from "@/providers/VanaProvider";

/**
 * My Data page - User's personal data control panel
 *
 * This page serves as the user's personal control panel for their data on Vana.
 * It allows users to view their data files, manage permissions, and understand
 * which applications have access to their data.
 */
export default function MyDataPage() {
  const chainId = useChainId();
  const { vana, applicationAddress: contextApplicationAddress } = useVana();

  // Local state for prompt text
  const [promptText, _setPromptText] = useState<string>(
    "Create a comprehensive Digital DNA profile from this data that captures the essence of this person's digital footprint: {{data}}"
  );

  // Get application address from context
  const applicationAddress = contextApplicationAddress;

  // Upload data state
  const [uploadInputMode, setUploadInputMode] = useState<"text" | "file">("text");
  const [uploadTextData, setUploadTextData] = useState<string>("");
  const [uploadSelectedFile, setUploadSelectedFile] = useState<File | null>(null);
  const [uploadSelectedSchemaId, setUploadSelectedSchemaId] = useState<number | null>(null);
  const [isUploadingData, setIsUploadingData] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    fileId: number;
    transactionHash: string;
    isValid?: boolean;
    validationErrors?: string[];
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Component state
  const [activeTab, setActiveTab] = useState("files");
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);


  // Use the custom hooks
  const {
    userFiles,
    isLoadingFiles,
    selectedFiles,
    decryptingFiles,
    decryptedFiles,
    fileDecryptErrors,
    loadUserFiles: onRefreshFiles,
    handleFileSelection: onFileSelection,
    handleDecryptFile: onDecryptFile,
    handleDownloadDecryptedFile: onDownloadDecryptedFile,
    handleClearFileError: onClearFileError,
    handleLookupFile,
    fileLookupId,
    setFileLookupId: onFileLookupIdChange,
    isLookingUpFile,
    fileLookupStatus,
  } = useUserFiles();

  const {
    userPermissions,
    isLoadingPermissions,
    isGranting,
    isRevoking,
    permissionLookupId,
    setPermissionLookupId: onPermissionLookupIdChange,
    isLookingUpPermission,
    permissionLookupStatus,
    lookedUpPermission,
    loadUserPermissions: onRefreshPermissions,
    handleGrantPermission,
    handleRevokePermissionById: onRevokePermission,
    handleLookupPermission,
  } = usePermissions();

  const {
    trustedServers: rawTrustedServers,
    isLoadingTrustedServers: isLoadingServers,
    isTrustingServer,
    isUntrusting,
    isDiscoveringServer,
    trustServerError,
    trustedServerQueryMode: queryMode,
    serverId,
    serverUrl,
    loadUserTrustedServers,
    handleTrustServerGasless,
    handleUntrustServer: onUntrustServer,
    handleDiscoverHostedServer: onDiscoverReplicateServer,
    setServerId: onServerIdChange,
    setServerUrl: onServerUrlChange,
    setTrustedServerQueryMode: onQueryModeChange,
  } = useTrustedServers();

  // Map trusted servers to the expected interface format
  const trustedServers = useMemo(
    () =>
      rawTrustedServers.map((server) => ({
        id: server.serverAddress,
        url: server.serverUrl,
        name: server.serverAddress,
      })),
    [rawTrustedServers]
  );

  // Upload data handler
  const handleUploadData = async (data: {
    content: string;
    filename?: string;
    schemaId?: number;
    isValid?: boolean;
    validationErrors?: string[];
  }) => {
    setIsUploadingData(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      // Create form data for upload
      const blob = new Blob([data.content], { type: "text/plain" });
      const file = new File([blob], data.filename || "uploaded-data.txt", {
        type: "text/plain",
      });

      const formData = new FormData();
      formData.append("file", file);

      // Upload via IPFS endpoint
      const response = await fetch("/api/ipfs/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Upload failed");
      }
      
      // Simulate file registration (this would normally be done via the SDK)
      const fileResult = {
        fileId: Math.floor(Math.random() * 10000), // Mock file ID
        transactionHash: "0x" + Math.random().toString(16).substring(2), // Mock hash
        isValid: data.isValid,
        validationErrors: data.validationErrors,
      };

      setUploadResult(fileResult);
      
      // Refresh files list
      onRefreshFiles();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploadingData(false);
    }
  };

  // Create wrapper functions
  const onLookupFile = useCallback(() => {
    handleLookupFile(fileLookupId);
  }, [handleLookupFile, fileLookupId]);

  const onLookupPermission = useCallback(() => {
    handleLookupPermission();
  }, [handleLookupPermission]);

  const onGrantPermission = useCallback(
    (customParams?: GrantPermissionParams & { expiresAt?: number }) => {
      handleGrantPermission(selectedFiles, promptText, customParams);
    },
    [handleGrantPermission, selectedFiles, promptText]
  );

  const onTrustServer = useCallback(
    (serverId?: string, serverUrl?: string) => {
      handleTrustServerGasless(false, serverId, serverUrl);
    },
    [handleTrustServerGasless]
  );

  const onRefreshServers = useCallback(() => {
    loadUserTrustedServers(queryMode);
  }, [loadUserTrustedServers, queryMode]);

  // Files table state
  const [filesCurrentPage, setFilesCurrentPage] = useState(1);
  const [filesSortDescriptor, setFilesSortDescriptor] =
    useState<SortDescriptor>({
      column: "id",
      direction: "descending",
    });
  const FILES_PER_PAGE = 10;

  // Permissions table state
  const [permissionsCurrentPage, setPermissionsCurrentPage] = useState(1);
  const [permissionsSortDescriptor, setPermissionsSortDescriptor] =
    useState<SortDescriptor>({
      column: "id",
      direction: "descending",
    });
  const PERMISSIONS_PER_PAGE = 10;

  // Schema state for files
  const [fileSchemas, setFileSchemas] = useState<Map<number, Schema>>(
    new Map()
  );

  // Fetch schema information for files that have schema IDs
  useEffect(() => {
    const fetchSchemas = async () => {
      if (!vana) return;

      const schemaMap = new Map<number, Schema>();

      for (const file of userFiles) {
        const schemaId =
          "schemaId" in file ? (file.schemaId as number) : undefined;
        if (
          schemaId &&
          typeof schemaId === "number" &&
          !fileSchemas.has(schemaId)
        ) {
          try {
            const schema = await vana.schemas.get(schemaId);
            schemaMap.set(schemaId, schema);
          } catch (error) {
            console.warn(`Failed to fetch schema ${schemaId}:`, error);
          }
        }
      }

      if (schemaMap.size > 0) {
        setFileSchemas((prev) => new Map([...prev, ...schemaMap]));
      }
    };

    if (userFiles.length > 0 && vana) {
      fetchSchemas();
    }
  }, [userFiles, vana, fileSchemas]);

  // Calculate sorted and paginated files
  const paginatedFiles = useMemo(() => {
    const sortedFiles = [...userFiles];

    if (filesSortDescriptor.column) {
      sortedFiles.sort((a, b) => {
        const aValue = a[filesSortDescriptor.column as keyof typeof a];
        const bValue = b[filesSortDescriptor.column as keyof typeof b];

        let comparison = 0;
        if (typeof aValue === "number" && typeof bValue === "number") {
          comparison = aValue - bValue;
        } else {
          comparison = String(aValue).localeCompare(String(bValue));
        }

        return filesSortDescriptor.direction === "descending"
          ? -comparison
          : comparison;
      });
    }

    const startIndex = (filesCurrentPage - 1) * FILES_PER_PAGE;
    const endIndex = startIndex + FILES_PER_PAGE;
    return sortedFiles.slice(startIndex, endIndex);
  }, [userFiles, filesCurrentPage, FILES_PER_PAGE, filesSortDescriptor]);

  // Calculate sorted and paginated permissions
  const paginatedPermissions = useMemo(() => {
    const sortedPermissions = [...userPermissions];

    if (permissionsSortDescriptor.column) {
      sortedPermissions.sort((a, b) => {
        const aValue = a[permissionsSortDescriptor.column as keyof typeof a];
        const bValue = b[permissionsSortDescriptor.column as keyof typeof b];

        let comparison = 0;
        if (typeof aValue === "number" && typeof bValue === "number") {
          comparison = aValue - bValue;
        } else if (typeof aValue === "bigint" && typeof bValue === "bigint") {
          comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        } else {
          comparison = String(aValue).localeCompare(String(bValue));
        }

        return permissionsSortDescriptor.direction === "descending"
          ? -comparison
          : comparison;
      });
    }

    const startIndex = (permissionsCurrentPage - 1) * PERMISSIONS_PER_PAGE;
    const endIndex = startIndex + PERMISSIONS_PER_PAGE;
    return sortedPermissions.slice(startIndex, endIndex);
  }, [
    userPermissions,
    permissionsCurrentPage,
    PERMISSIONS_PER_PAGE,
    permissionsSortDescriptor,
  ]);

  const filesTotalPages = Math.ceil(userFiles.length / FILES_PER_PAGE);
  const permissionsTotalPages = Math.ceil(
    userPermissions.length / PERMISSIONS_PER_PAGE
  );

  // Reset to first page when data changes
  useEffect(() => {
    setFilesCurrentPage(1);
  }, [userFiles.length]);

  useEffect(() => {
    setPermissionsCurrentPage(1);
  }, [userPermissions.length]);

  // Renders permission parameters with tooltip
  const renderParameters = (parameters: unknown) => {
    if (parameters === null) return "None";

    const paramStr =
      typeof parameters === "string"
        ? parameters
        : JSON.stringify(parameters, null, 2);

    return (
      <Tooltip
        content={
          <pre className="text-xs max-w-sm max-h-40 overflow-auto">
            {paramStr}
          </pre>
        }
        placement="left"
      >
        <Button
          size="sm"
          variant="flat"
          startContent={<Eye className="h-3 w-3" />}
        >
          View Details
        </Button>
      </Tooltip>
    );
  };

  // Renders the upload data tab content
  const renderUploadDataTab = () => (
    <div className="space-y-6">
      {vana ? (
        <DataUploadForm
          vana={vana}
          inputMode={uploadInputMode}
          onInputModeChange={setUploadInputMode}
          textData={uploadTextData}
          onTextDataChange={setUploadTextData}
          selectedFile={uploadSelectedFile}
          onFileSelect={setUploadSelectedFile}
          selectedSchemaId={uploadSelectedSchemaId}
          onSchemaChange={setUploadSelectedSchemaId}
          onUpload={handleUploadData}
          isUploading={isUploadingData}
          uploadResult={uploadResult}
          uploadError={uploadError}
          chainId={chainId || 14800}
          showSchemaSelector={true}
          showValidation={true}
          allowWithoutSchema={true}
          title="Upload Your Data"
          description="Upload text or file data to the Vana network with optional schema validation"
        />
      ) : (
        <div className="text-center p-8">
          <p>Loading Vana SDK...</p>
        </div>
      )}
    </div>
  );

  // Renders the files tab content
  const renderFilesTab = () => (
    <div className="space-y-6">
      {/* File Lookup */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            <h3 className="text-lg font-semibold">File Lookup</h3>
          </div>
        </CardHeader>
        <CardBody>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Enter file ID"
              type="text"
              value={fileLookupId}
              onChange={(e) => onFileLookupIdChange(e.target.value)}
              className="max-w-xs"
              size="sm"
              description="Search for a specific file by its numeric ID"
            />
            <ActionButton
              onPress={onLookupFile}
              disabled={!fileLookupId.trim()}
              loading={isLookingUpFile}
              icon={<Search className="h-4 w-4" />}
              loadingIconOnly={true}
              size="sm"
            >
              Search
            </ActionButton>
          </div>
          {fileLookupStatus && (
            <StatusDisplay status={fileLookupStatus} className="mt-4" />
          )}
        </CardBody>
      </Card>

      {/* Files Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <div>
                <h3 className="text-lg font-semibold">Your Data Files</h3>
                <p className="text-sm text-default-500">
                  {userFiles.length} files registered
                </p>
              </div>
            </div>
            <Button
              onPress={onRefreshFiles}
              variant="bordered"
              size="sm"
              startContent={
                isLoadingFiles ? (
                  <Spinner size="sm" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )
              }
              isDisabled={isLoadingFiles}
            >
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {isLoadingFiles ? (
            <div className="flex justify-center items-center p-8">
              <Spinner size="lg" />
              <span className="ml-3">Loading files...</span>
            </div>
          ) : userFiles.length === 0 ? (
            <EmptyState
              icon={<Database className="h-12 w-12" />}
              title="No data files found"
              description="Upload and encrypt files to get started"
            />
          ) : (
            <div className="space-y-4">
              {/* Bulk Actions Toolbar */}
              {selectedFiles.length > 0 && (
                <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">
                      {selectedFiles.length} file
                      {selectedFiles.length !== 1 ? "s" : ""} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => {
                        selectedFiles.forEach((fileId) => {
                          const file = userFiles.find((f) => f.id === fileId);
                          if (file) onDecryptFile(file);
                        });
                      }}
                      startContent={<Key className="h-3 w-3" />}
                    >
                      Decrypt Selected
                    </Button>
                    <Button
                      size="sm"
                      color="primary"
                      onPress={() => setIsGrantModalOpen(true)}
                      disabled={isGranting || !applicationAddress?.trim()}
                      startContent={<Users className="h-3 w-3" />}
                    >
                      Grant Permissions
                    </Button>
                  </div>
                </div>
              )}

              <Table
                aria-label="Data files table"
                removeWrapper
                sortDescriptor={filesSortDescriptor}
                onSortChange={setFilesSortDescriptor}
                classNames={{
                  th: "bg-default-100 text-default-700",
                  td: "py-4",
                }}
              >
                <TableHeader>
                  <TableColumn key="select" allowsSorting={false}>
                    <Checkbox
                      isSelected={
                        paginatedFiles.length > 0 &&
                        paginatedFiles.every((file) =>
                          selectedFiles.includes(file.id)
                        )
                      }
                      isIndeterminate={
                        paginatedFiles.some((file) =>
                          selectedFiles.includes(file.id)
                        ) &&
                        !paginatedFiles.every((file) =>
                          selectedFiles.includes(file.id)
                        )
                      }
                      onValueChange={(selected) => {
                        if (selected) {
                          paginatedFiles.forEach((file) => {
                            if (!selectedFiles.includes(file.id)) {
                              onFileSelection(file.id, true);
                            }
                          });
                        } else {
                          paginatedFiles.forEach((file) => {
                            if (selectedFiles.includes(file.id)) {
                              onFileSelection(file.id, false);
                            }
                          });
                        }
                      }}
                    />
                  </TableColumn>
                  <TableColumn key="id" allowsSorting>
                    File ID
                  </TableColumn>
                  <TableColumn key="owner" allowsSorting>
                    Owner
                  </TableColumn>
                  <TableColumn key="url" allowsSorting>
                    URL
                  </TableColumn>
                  <TableColumn key="source" allowsSorting>
                    Source
                  </TableColumn>
                  <TableColumn key="schema" allowsSorting>
                    Schema
                  </TableColumn>
                  <TableColumn key="actions" allowsSorting={false}>
                    Actions
                  </TableColumn>
                </TableHeader>
                <TableBody>
                  {paginatedFiles.map((file) => {
                    const isDecrypting = decryptingFiles.has(file.id);
                    const decryptedContent = decryptedFiles.get(file.id);
                    const isSelected = selectedFiles.includes(file.id);

                    return (
                      <TableRow key={file.id}>
                        <TableCell>
                          <Checkbox
                            isSelected={isSelected}
                            onValueChange={(selected) =>
                              onFileSelection(file.id, selected)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <FileIdDisplay
                            fileId={file.id}
                            chainId={chainId || 14800}
                            showCopy={true}
                            showExternalLink={true}
                          />
                        </TableCell>
                        <TableCell>
                          <AddressDisplay
                            address={file.ownerAddress}
                            truncate={true}
                            showCopy={true}
                            showExternalLink={false}
                            className="max-w-32"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              as="a"
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              size="sm"
                              variant="flat"
                              isIconOnly
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                            <CopyButton
                              value={file.url}
                              tooltip="Copy file URL"
                              isInline
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          {file.source && (
                            <Chip
                              size="sm"
                              color={
                                file.source === "uploaded"
                                  ? "success"
                                  : "default"
                              }
                              variant="flat"
                            >
                              {file.source}
                            </Chip>
                          )}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const schemaId =
                              "schemaId" in file
                                ? (file.schemaId as number)
                                : undefined;
                            const schema =
                              schemaId && typeof schemaId === "number"
                                ? fileSchemas.get(schemaId)
                                : null;

                            if (schema) {
                              return (
                                <Chip
                                  size="sm"
                                  variant="flat"
                                  color="secondary"
                                  startContent={
                                    <Database className="h-3 w-3" />
                                  }
                                >
                                  {schema.name}
                                </Chip>
                              );
                            }

                            return (
                              <span className="text-sm text-default-500">
                                None
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="flat"
                              onPress={() => onDecryptFile(file)}
                              isLoading={isDecrypting}
                              isDisabled={isDecrypting}
                              startContent={
                                !isDecrypting ? (
                                  <Key className="h-3 w-3" />
                                ) : undefined
                              }
                            >
                              {isDecrypting ? "Decrypting..." : "Decrypt"}
                            </Button>
                            {decryptedContent && (
                              <Button
                                size="sm"
                                variant="flat"
                                onPress={() => onDownloadDecryptedFile(file)}
                                startContent={<Download className="h-3 w-3" />}
                              >
                                Download
                              </Button>
                            )}
                          </div>
                          {fileDecryptErrors.has(file.id) && (
                            <div className="mt-2">
                              <ErrorMessage
                                error={fileDecryptErrors.get(file.id) || null}
                                onDismiss={() => onClearFileError(file.id)}
                                className="text-xs"
                              />
                            </div>
                          )}
                          {decryptedContent && (
                            <div className="mt-2">
                              <FilePreview
                                content={decryptedContent}
                                fileName={
                                  file.url.split("/").pop() || `file-${file.id}`
                                }
                                className="max-w-md"
                              />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Files Pagination */}
              {userFiles.length > FILES_PER_PAGE && (
                <div className="flex justify-center mt-4">
                  <Pagination
                    total={filesTotalPages}
                    page={filesCurrentPage}
                    onChange={setFilesCurrentPage}
                    showControls={true}
                    size="sm"
                  />
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );

  // Renders the permissions tab content
  const renderPermissionsTab = () => (
    <div className="space-y-6">
      {/* Permission Lookup */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Permission Lookup</h3>
          </div>
        </CardHeader>
        <CardBody>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Enter permission ID"
              type="text"
              value={permissionLookupId}
              onChange={(e) => onPermissionLookupIdChange(e.target.value)}
              className="max-w-xs"
              size="sm"
              description="Search for a specific permission by its numeric ID"
            />
            <ActionButton
              onPress={onLookupPermission}
              disabled={!permissionLookupId.trim()}
              loading={isLookingUpPermission}
              icon={<Search className="h-4 w-4" />}
              loadingIconOnly={true}
              size="sm"
            >
              Search
            </ActionButton>
          </div>
          {permissionLookupStatus && (
            <StatusDisplay status={permissionLookupStatus} className="mt-4" />
          )}
          {lookedUpPermission && (
            <div className="mt-4 p-3 bg-success/10 rounded-lg">
              <p className="text-sm font-medium text-success mb-2">
                Permission Found:
              </p>
              <div className="space-y-1 text-xs">
                <div>
                  <strong>ID:</strong> {lookedUpPermission.id.toString()}
                </div>
                <div>
                  <strong>Operation:</strong> {lookedUpPermission.operation}
                </div>
                <div>
                  <strong>Files:</strong> {lookedUpPermission.files.length} file
                  {lookedUpPermission.files.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <div>
                <h3 className="text-lg font-semibold">
                  Permissions Management
                </h3>
                <p className="text-sm text-default-500">
                  {userPermissions.length} permission
                  {userPermissions.length !== 1 ? "s" : ""} granted
                </p>
              </div>
            </div>
            <Button
              onPress={onRefreshPermissions}
              variant="bordered"
              size="sm"
              startContent={
                isLoadingPermissions ? (
                  <Spinner size="sm" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )
              }
              isDisabled={isLoadingPermissions}
            >
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {isLoadingPermissions ? (
            <div className="flex justify-center items-center p-8">
              <Spinner size="lg" />
              <span className="ml-3">Loading permissions...</span>
            </div>
          ) : userPermissions.length === 0 ? (
            <EmptyState
              icon={<Shield className="h-12 w-12" />}
              title="No permissions granted yet"
              description="Grant permissions to data processors to see them here"
            />
          ) : (
            <div className="space-y-4">
              <Table
                aria-label="Permissions table"
                removeWrapper
                sortDescriptor={permissionsSortDescriptor}
                onSortChange={setPermissionsSortDescriptor}
                classNames={{
                  th: "bg-default-100 text-default-700",
                  td: "py-4",
                }}
              >
                <TableHeader>
                  <TableColumn key="id" allowsSorting>
                    Permission ID
                  </TableColumn>
                  <TableColumn key="operation" allowsSorting>
                    Operation
                  </TableColumn>
                  <TableColumn key="files" allowsSorting={false}>
                    Files
                  </TableColumn>
                  <TableColumn key="parameters" allowsSorting={false}>
                    Parameters
                  </TableColumn>
                  <TableColumn key="actions" allowsSorting={false}>
                    Actions
                  </TableColumn>
                </TableHeader>
                <TableBody>
                  {paginatedPermissions.map((permission) => (
                    <TableRow key={permission.id.toString()}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <PermissionDisplay
                            permissionId={permission.id}
                            className="inline-flex"
                          />
                          <CopyButton
                            value={permission.id.toString()}
                            tooltip="Copy permission ID"
                            isInline
                            size="sm"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Chip variant="flat" color="primary" size="sm">
                          {permission.operation}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-small font-medium">
                            {permission.files.length} file
                            {permission.files.length !== 1 ? "s" : ""}
                          </span>
                          {permission.files.length > 0 && (
                            <div className="flex flex-wrap gap-1 max-w-48">
                              {permission.files.slice(0, 3).map((fileId) => (
                                <FileIdDisplay
                                  key={fileId}
                                  fileId={fileId}
                                  chainId={chainId || 14800}
                                  showCopy={false}
                                  showExternalLink={true}
                                  className="text-tiny"
                                />
                              ))}
                              {permission.files.length > 3 && (
                                <span className="text-tiny text-default-400">
                                  +{permission.files.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {renderParameters(permission.parameters)}
                          <Tooltip content="View grant file on IPFS">
                            <Button
                              as="a"
                              href={convertIpfsUrl(permission.grant)}
                              target="_blank"
                              rel="noopener noreferrer"
                              size="sm"
                              variant="flat"
                              isIconOnly
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          color="danger"
                          variant="flat"
                          size="sm"
                          onPress={() =>
                            onRevokePermission(permission.id.toString())
                          }
                          isLoading={isRevoking}
                          isDisabled={isRevoking}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Permissions Pagination */}
              {userPermissions.length > PERMISSIONS_PER_PAGE && (
                <div className="flex justify-center mt-4">
                  <Pagination
                    total={permissionsTotalPages}
                    page={permissionsCurrentPage}
                    onChange={setPermissionsCurrentPage}
                    showControls={true}
                    size="sm"
                  />
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );

  // Renders the trusted servers tab content
  const renderTrustedServersTab = () => (
    <div className="space-y-6">
      {/* Trust Server */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Trust New Server</h3>
          </div>
        </CardHeader>
        <CardBody>
          <FormBuilder
            title=""
            singleColumn={true}
            fields={[
              {
                name: "serverId",
                label: "Server ID",
                type: "text",
                value: serverId,
                onChange: onServerIdChange,
                placeholder: "0x...",
                description: "The Ethereum address of the server to trust",
                required: true,
              },
              {
                name: "serverUrl",
                label: "Server URL",
                type: "text",
                value: serverUrl,
                onChange: onServerUrlChange,
                placeholder: "https://...",
                description: "The API endpoint URL of the server",
                required: true,
              },
            ]}
            onSubmit={onTrustServer}
            isSubmitting={isTrustingServer}
            submitText="Trust Server"
            submitIcon={<Shield className="h-4 w-4" />}
            status={trustServerError}
            additionalButtons={
              <Button
                onPress={onDiscoverReplicateServer}
                isLoading={isDiscoveringServer}
                variant="bordered"
                startContent={<Server className="h-4 w-4" />}
              >
                Get Hosted Server Details
              </Button>
            }
          />
        </CardBody>
      </Card>

      {/* Trusted Servers List */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <div>
                <h3 className="text-lg font-semibold">Your Trusted Servers</h3>
                <p className="text-sm text-default-500">
                  {trustedServers.length} server
                  {trustedServers.length !== 1 ? "s" : ""} trusted
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select
                size="sm"
                label="Query Mode"
                placeholder="Select query mode"
                selectedKeys={[queryMode]}
                onSelectionChange={(keys) => {
                  const mode = Array.from(keys)[0] as
                    | "subgraph"
                    | "rpc"
                    | "auto";
                  onQueryModeChange(mode);
                }}
                className="w-40"
              >
                <SelectItem key="auto" textValue="Auto (Smart Fallback)">
                  Auto (Smart Fallback)
                </SelectItem>
                <SelectItem key="subgraph" textValue="Subgraph (Fast)">
                  Subgraph (Fast)
                </SelectItem>
                <SelectItem key="rpc" textValue="RPC (Direct)">
                  RPC (Direct)
                </SelectItem>
              </Select>
              <Button
                onPress={onRefreshServers}
                variant="bordered"
                size="sm"
                startContent={
                  isLoadingServers ? (
                    <Spinner size="sm" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )
                }
                isDisabled={isLoadingServers}
              >
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {trustedServers.length === 0 ? (
            <EmptyState
              icon={<Shield className="h-12 w-12" />}
              title="No trusted servers"
              description="Trust a server above to see it listed here"
            />
          ) : (
            <Table aria-label="Trusted servers table" removeWrapper>
              <TableHeader>
                <TableColumn>Server Address</TableColumn>
                <TableColumn>URL</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody>
                {trustedServers.map((server) => (
                  <TableRow key={server.id}>
                    <TableCell>
                      <AddressDisplay
                        address={server.id}
                        truncate={true}
                        showCopy={true}
                        showExternalLink={true}
                      />
                    </TableCell>
                    <TableCell>
                      {server.url && (
                        <div className="flex items-center gap-2">
                          <Button
                            as="a"
                            href={server.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="sm"
                            variant="flat"
                            isIconOnly
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                          <CopyButton
                            value={server.url}
                            tooltip="Copy server URL"
                            isInline
                          />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        color="danger"
                        variant="flat"
                        size="sm"
                        onPress={() => onUntrustServer(server.id)}
                        isLoading={isUntrusting}
                        isDisabled={isUntrusting}
                        startContent={<Trash2 className="h-3 w-3" />}
                      >
                        Untrust
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );

  // Show loading if no vana instance
  if (!vana) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-2 text-default-500">Loading Vana SDK...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">My Data</h1>
        <p className="text-lg text-default-600">
          Your personal data control panel for the Vana network
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardBody className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{userFiles.length}</span>
            </div>
            <p className="text-sm text-default-500">Data Files</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Users className="h-5 w-5 text-success" />
              <span className="text-2xl font-bold">
                {userPermissions.length}
              </span>
            </div>
            <p className="text-sm text-default-500">Permissions Granted</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-warning" />
              <span className="text-2xl font-bold">
                {trustedServers.length}
              </span>
            </div>
            <p className="text-sm text-default-500">Trusted Servers</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Key className="h-5 w-5 text-info" />
              <span className="text-2xl font-bold">{selectedFiles.length}</span>
            </div>
            <p className="text-sm text-default-500">Files Selected</p>
          </CardBody>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        aria-label="Data management tabs"
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as string)}
        className="w-full"
      >
        <Tab key="files" title="Data Files">
          {renderFilesTab()}
        </Tab>
        <Tab key="upload" title="Upload Data">
          {renderUploadDataTab()}
        </Tab>
        <Tab key="permissions" title="Permissions">
          {renderPermissionsTab()}
        </Tab>
        <Tab key="servers" title="Trusted Servers">
          {renderTrustedServersTab()}
        </Tab>
      </Tabs>

      {/* Grant Permission Modal */}
      {applicationAddress?.trim() ? (
        <GrantPermissionModal
          isOpen={isGrantModalOpen}
          onClose={() => setIsGrantModalOpen(false)}
          onConfirm={(params) => {
            setIsGrantModalOpen(false);
            onGrantPermission(params);
          }}
          selectedFiles={selectedFiles}
          applicationAddress={applicationAddress}
          isGranting={isGranting}
          defaultPrompt={promptText}
          allowEditAddress={true}
        />
      ) : null}
    </div>
  );
}