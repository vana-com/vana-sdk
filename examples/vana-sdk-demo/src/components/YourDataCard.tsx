import React, { useMemo, useState } from "react";
import {
  Input,
  Button,
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
  Textarea,
  SortDescriptor,
} from "@heroui/react";
import {
  Database,
  Search,
  ExternalLink,
  Download,
  RefreshCw,
  Key,
} from "lucide-react";
import type { UserFile, Schema, Vana } from "@opendatalabs/vana-sdk";
import { SectionHeader } from "./ui/SectionHeader";
import { ActionButton } from "./ui/ActionButton";
import { EmptyState } from "./ui/EmptyState";
import { StatusDisplay } from "./ui/StatusDisplay";
import { StatusMessage } from "./ui/StatusMessage";
import { ExplorerLink } from "./ui/ExplorerLink";
import { CopyButton } from "./ui/CopyButton";
import { FilePreview } from "./FilePreview";
import { FileIdDisplay } from "./ui/FileIdDisplay";
import { AddressDisplay } from "./ui/AddressDisplay";
import { ErrorMessage } from "./ui/ErrorMessage";

interface YourDataCardProps {
  // File lookup
  fileLookupId: string;
  onFileLookupIdChange: (id: string) => void;
  onLookupFile: () => void;
  isLookingUpFile: boolean;
  fileLookupStatus: string;

  // User files
  userFiles: (UserFile & {
    source?: "discovered" | "looked-up" | "uploaded";
  })[];
  isLoadingFiles: boolean;
  onRefreshFiles: () => void;

  // File selection and decryption
  selectedFiles: number[];
  decryptingFiles: Set<number>;
  decryptedFiles: Map<number, string>;
  fileDecryptErrors: Map<number, string>;
  onFileSelection: (fileId: number, selected: boolean) => void;
  onDecryptFile: (
    file: UserFile & { source?: "discovered" | "looked-up" | "uploaded" },
  ) => void;
  onDownloadDecryptedFile: (
    file: UserFile & { source?: "discovered" | "looked-up" | "uploaded" },
  ) => void;
  onClearFileError: (fileId: number) => void;

  // Permission granting
  onGrantPermission: () => void;
  isGranting: boolean;
  grantStatus: string;
  grantTxHash: string;

  // Prompt customization
  promptText: string;
  onPromptTextChange: (text: string) => void;

  // Application info
  applicationAddress: string;

  // User info
  _userAddress: string | undefined;
  chainId: number;

  // Vana instance for schema fetching
  vana: Vana;
}

/**
 * YourDataCard component - Complete user data management and permissions workflow
 * Demonstrates getUserFiles(), uploadFile(), decryptUserData()
 */
export const YourDataCard: React.FC<YourDataCardProps> = ({
  fileLookupId,
  onFileLookupIdChange,
  onLookupFile,
  isLookingUpFile,
  fileLookupStatus,
  userFiles,
  isLoadingFiles,
  onRefreshFiles,
  selectedFiles,
  decryptingFiles,
  decryptedFiles,
  fileDecryptErrors,
  onFileSelection,
  onDecryptFile,
  onDownloadDecryptedFile,
  onClearFileError,
  onGrantPermission,
  isGranting,
  grantStatus,
  grantTxHash,
  promptText,
  onPromptTextChange,
  applicationAddress,
  _userAddress,
  chainId,
  vana,
}) => {
  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(1);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "id",
    direction: "descending",
  });
  const ITEMS_PER_PAGE = 10;

  // Schema state for files
  const [fileSchemas, setFileSchemas] = useState<Map<number, Schema>>(
    new Map(),
  );

  // Fetch schema information for files that have schema IDs
  React.useEffect(() => {
    const fetchSchemas = async () => {
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

    if (userFiles.length > 0) {
      fetchSchemas();
    }
  }, [userFiles, vana, fileSchemas]);

  // Calculate sorted and paginated items
  const paginatedFiles = useMemo(() => {
    const sortedFiles = [...userFiles];

    // Sort files based on sortDescriptor
    if (sortDescriptor.column) {
      sortedFiles.sort((a, b) => {
        const aValue = a[sortDescriptor.column as keyof typeof a];
        const bValue = b[sortDescriptor.column as keyof typeof b];

        let comparison = 0;
        if (typeof aValue === "number" && typeof bValue === "number") {
          comparison = aValue - bValue;
        } else {
          comparison = String(aValue).localeCompare(String(bValue));
        }

        return sortDescriptor.direction === "descending"
          ? -comparison
          : comparison;
      });
    }

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return sortedFiles.slice(startIndex, endIndex);
  }, [userFiles, currentPage, ITEMS_PER_PAGE, sortDescriptor]);

  const totalPages = Math.ceil(userFiles.length / ITEMS_PER_PAGE);

  // Reset to first page when userFiles changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [userFiles.length]);
  return (
    <section id="data">
      <SectionHeader
        icon={<Database className="h-5 w-5" />}
        title="Your Data"
        description={
          <>
            <em>
              Demonstrates: `getUserFiles()`, `uploadFile()`,
              `decryptUserData()`
            </em>
            <br />
            Manage your registered data files and decrypt content you own.
          </>
        }
      />
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-4 ml-auto">
          <Input
            placeholder="Enter file ID"
            type="text"
            value={fileLookupId}
            onChange={(e) => onFileLookupIdChange(e.target.value)}
            className="w-32"
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

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-semibold">Your Data Files</h3>
              <p className="text-small text-default-500">
                Manage your registered data files and grant permissions (
                {userFiles.length} files)
              </p>
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
            <>
              <Table
                aria-label="Data files table"
                removeWrapper
                sortDescriptor={sortDescriptor}
                onSortChange={setSortDescriptor}
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
                          // Select all files on current page
                          paginatedFiles.forEach((file) => {
                            if (!selectedFiles.includes(file.id)) {
                              onFileSelection(file.id, true);
                            }
                          });
                        } else {
                          // Deselect all files on current page
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

              {/* Pagination */}
              {userFiles.length > ITEMS_PER_PAGE && (
                <div className="flex justify-center mt-4">
                  <Pagination
                    total={totalPages}
                    page={currentPage}
                    onChange={setCurrentPage}
                    showControls={true}
                    size="sm"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {userFiles.length > 0 && (
          <div className="mt-4 p-3 bg-primary/10 rounded">
            <p className="text-sm text-primary">
              <strong>Selected files:</strong> {selectedFiles.length} of{" "}
              {userFiles.length} total
              {userFiles.length > ITEMS_PER_PAGE && (
                <span className="ml-2">
                  • Page {currentPage} of {totalPages} (showing{" "}
                  {paginatedFiles.length} files)
                </span>
              )}
              <br />
              Use &quot;Decrypt&quot; to view encrypted file contents using your
              wallet signature.
            </p>
          </div>
        )}

        {fileLookupStatus && (
          <StatusDisplay status={fileLookupStatus} className="mt-4" />
        )}

        {/* Grant Permission Section */}
        {selectedFiles.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-semibold text-default-900">
                  Grant Permissions
                </h4>
                <p className="text-sm text-default-500">
                  {selectedFiles.length} file
                  {selectedFiles.length !== 1 ? "s" : ""} selected for
                  permission granting
                </p>
              </div>
              <Button
                onPress={onGrantPermission}
                disabled={selectedFiles.length === 0 || isGranting}
                color="primary"
                size="md"
              >
                {isGranting && <Spinner size="sm" className="mr-2" />}
                Grant Permissions
              </Button>
            </div>

            {/* Prompt Customization */}
            <div className="mb-4">
              <Textarea
                label="LLM Prompt"
                placeholder="Enter your custom prompt for the LLM"
                value={promptText}
                onChange={(e) => onPromptTextChange(e.target.value)}
                description="Customize the prompt that will be used by the LLM when processing your data. Use {{data}} as a placeholder for your file contents."
                minRows={3}
                maxRows={6}
              />
            </div>

            {/* Application Address Display */}
            {applicationAddress && (
              <div className="mb-4 p-3 bg-primary/10 rounded-lg">
                <p className="text-sm font-medium text-primary-700 mb-2">
                  Permission Grantee (Application):
                </p>
                <AddressDisplay
                  address={applicationAddress}
                  showCopy={true}
                  showExternalLink={true}
                  truncate={false}
                  className="text-sm"
                />
                <p className="text-xs text-primary-600 mt-1">
                  Permissions will be granted to this application address
                  derived from the server's private key.
                </p>
              </div>
            )}

            {grantStatus && (
              <StatusMessage
                status={grantStatus}
                inline={true}
                className="mt-2"
              />
            )}

            {grantTxHash && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="font-medium mb-2">Transaction Hash:</p>
                <ExplorerLink
                  type="tx"
                  hash={grantTxHash}
                  chainId={chainId || 14800}
                  truncate={true}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
