"use client";

import React from "react";
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
  type SortDescriptor,
  Pagination,
} from "@heroui/react";
import {
  Database,
  Search,
  ExternalLink,
  Download,
  RefreshCw,
  Key,
  Users,
  FileJson,
} from "lucide-react";
import type { Schema } from "@opendatalabs/vana-sdk/browser";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDisplay } from "@/components/ui/StatusDisplay";
import { CopyButton } from "@/components/ui/CopyButton";
import { ContentPreviewModal } from "@/components/ui/ContentPreviewModal";
import { FileIdDisplay } from "@/components/ui/FileIdDisplay";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import type { ExtendedUserFile } from "@/hooks/useUserFiles";

interface FilesTabProps {
  // File data
  userFiles: ExtendedUserFile[];
  isLoadingFiles: boolean;
  selectedFiles: number[];
  decryptingFiles: Set<number>;
  decryptedFiles: Map<number, string>;
  fileDecryptErrors: Map<number, string>;

  // File lookup
  fileLookupId: string;
  isLookingUpFile: boolean;
  fileLookupStatus: string;

  // Schema data
  fileSchemas: Map<number, Schema>;

  // Pagination
  filesCurrentPage: number;
  filesSortDescriptor: SortDescriptor;
  filesTotalPages: number;
  FILES_PER_PAGE: number;

  // Chain info
  chainId: number;

  // Grant permission state
  applicationAddress: string;
  isGranting: boolean;

  // Callbacks
  onRefreshFiles: () => void;
  onFileSelection: (fileId: number, selected: boolean) => void;
  onDecryptFile: (file: ExtendedUserFile) => void;
  onDownloadDecryptedFile: (file: ExtendedUserFile) => void;
  onClearFileError: (fileId: number) => void;
  onFileLookupIdChange: (id: string) => void;
  onLookupFile: () => void;
  setFilesCurrentPage: (page: number) => void;
  setFilesSortDescriptor: (descriptor: SortDescriptor) => void;
  setIsGrantModalOpen: (open: boolean) => void;
}

export function FilesTab({
  userFiles,
  isLoadingFiles,
  selectedFiles,
  decryptingFiles,
  decryptedFiles,
  fileDecryptErrors,
  fileLookupId,
  isLookingUpFile,
  fileLookupStatus,
  fileSchemas,
  filesCurrentPage,
  filesSortDescriptor,
  filesTotalPages,
  FILES_PER_PAGE,
  chainId,
  applicationAddress,
  isGranting,
  onRefreshFiles,
  onFileSelection,
  onDecryptFile,
  onDownloadDecryptedFile,
  onClearFileError,
  onFileLookupIdChange,
  onLookupFile,
  setFilesCurrentPage,
  setFilesSortDescriptor,
  setIsGrantModalOpen,
}: FilesTabProps) {
  // Content preview modal state
  const [contentModalOpen, setContentModalOpen] = React.useState(false);
  const [selectedContentForModal, setSelectedContentForModal] = React.useState<{
    content: string;
    url: string;
    fileId: number;
  } | null>(null);

  // Calculate paginated files
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
  const paginatedFiles = sortedFiles.slice(startIndex, endIndex);

  return (
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
              onChange={(e) => {
                onFileLookupIdChange(e.target.value);
              }}
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
                      onPress={() => {
                        setIsGrantModalOpen(true);
                      }}
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
                          selectedFiles.includes(file.id),
                        )
                      }
                      isIndeterminate={
                        paginatedFiles.some((file) =>
                          selectedFiles.includes(file.id),
                        ) &&
                        !paginatedFiles.every((file) =>
                          selectedFiles.includes(file.id),
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
                            onValueChange={(selected) => {
                              onFileSelection(file.id, selected);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <FileIdDisplay
                            fileId={file.id}
                            chainId={chainId}
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
                            {!decryptedContent ? (
                              <Button
                                size="sm"
                                variant="flat"
                                onPress={() => {
                                  onDecryptFile(file);
                                }}
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
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="flat"
                                  onPress={() => {
                                    setSelectedContentForModal({
                                      content: decryptedContent,
                                      url: file.url,
                                      fileId: file.id,
                                    });
                                    setContentModalOpen(true);
                                  }}
                                  startContent={
                                    <FileJson className="h-3 w-3" />
                                  }
                                >
                                  JSON Preview
                                </Button>
                                <Button
                                  size="sm"
                                  variant="flat"
                                  onPress={() => {
                                    onDownloadDecryptedFile(file);
                                  }}
                                  startContent={
                                    <Download className="h-3 w-3" />
                                  }
                                >
                                  Download
                                </Button>
                              </>
                            )}
                          </div>
                          {fileDecryptErrors.has(file.id) && (
                            <div className="mt-2">
                              <ErrorMessage
                                error={fileDecryptErrors.get(file.id) ?? null}
                                onDismiss={() => {
                                  onClearFileError(file.id);
                                }}
                                className="text-xs"
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

      {/* File Content Modal */}
      {selectedContentForModal && (
        <ContentPreviewModal
          isOpen={contentModalOpen}
          onClose={() => {
            setContentModalOpen(false);
            setSelectedContentForModal(null);
          }}
          title="File Content"
          subtitle={`${selectedContentForModal.url} (ID: ${selectedContentForModal.fileId})`}
          icon={<Database className="h-5 w-5" />}
          content={selectedContentForModal.content}
          language="json"
        />
      )}
    </div>
  );
}
