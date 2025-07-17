import React, { useMemo, useState } from "react";
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
  Textarea,
  SortDescriptor,
  Tabs,
  Tab,
  Tooltip,
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
} from "lucide-react";
import type { UserFile, GrantedPermission } from "@opendatalabs/vana-sdk";
import { convertIpfsUrl } from "@opendatalabs/vana-sdk";
import { ActionButton } from "../ui/ActionButton";
import { EmptyState } from "../ui/EmptyState";
import { StatusDisplay } from "../ui/StatusDisplay";
import { StatusMessage } from "../ui/StatusMessage";
import { ExplorerLink } from "../ui/ExplorerLink";
import { CopyButton } from "../ui/CopyButton";
import { FilePreview } from "../FilePreview";
import { FileIdDisplay } from "../ui/FileIdDisplay";
import { AddressDisplay } from "../ui/AddressDisplay";
import { ErrorMessage } from "../ui/ErrorMessage";
import { PermissionDisplay } from "../ui/PermissionDisplay";

/**
 * Props for the UserDashboardView component
 */
export interface UserDashboardViewProps {
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

  // User permissions
  userPermissions: GrantedPermission[];
  isLoadingPermissions: boolean;
  onRevokePermission: (permissionId: string) => void;
  isRevoking: boolean;
  onRefreshPermissions: () => void;

  // User info
  userAddress: string | undefined;
  chainId: number;
}

/**
 * User dashboard view component - consolidates data files and permissions management
 *
 * @remarks
 * This view serves as the user's personal control panel for their data on Vana.
 * It allows users to view their data files, manage permissions, and understand
 * which applications have access to their data.
 *
 * The component consolidates the functionality of YourDataCard and PermissionsTable
 * into a single, cohesive interface organized in tabs for better usability.
 *
 * @param props - The component props
 * @returns The rendered user dashboard view
 */
export function UserDashboardView({
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
  userPermissions,
  isLoadingPermissions,
  onRevokePermission,
  isRevoking,
  onRefreshPermissions,
  userAddress: _userAddress,
  chainId,
}: UserDashboardViewProps) {
  const [activeTab, setActiveTab] = useState("files");

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

  /**
   * Calculate sorted and paginated files
   */
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

  /**
   * Calculate sorted and paginated permissions
   */
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
    userPermissions.length / PERMISSIONS_PER_PAGE,
  );

  // Reset to first page when data changes
  React.useEffect(() => {
    setFilesCurrentPage(1);
  }, [userFiles.length]);

  React.useEffect(() => {
    setPermissionsCurrentPage(1);
  }, [userPermissions.length]);

  /**
   * Renders permission parameters with tooltip
   */
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

  /**
   * Renders the files tab content
   */
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

      {/* Permission Granting Section */}
      {selectedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Grant Permissions</h3>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
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
              <Textarea
                label="LLM Prompt"
                placeholder="Enter your custom prompt for the LLM"
                value={promptText}
                onChange={(e) => onPromptTextChange(e.target.value)}
                description="Customize the prompt that will be used by the LLM when processing your data. Use {{data}} as a placeholder for your file contents."
                minRows={3}
                maxRows={6}
              />

              {/* Application Address Display */}
              {applicationAddress && (
                <div className="p-3 bg-primary/10 rounded-lg">
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
                <div className="p-4 bg-muted rounded-lg">
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
          </CardBody>
        </Card>
      )}
    </div>
  );

  /**
   * Renders the permissions tab content
   */
  const renderPermissionsTab = () => (
    <div className="space-y-6">
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
                                  chainId={chainId}
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">My Data</h1>
        <p className="text-lg text-default-600">
          Your personal data control panel for the Vana network
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
        <Tab key="permissions" title="Permissions">
          {renderPermissionsTab()}
        </Tab>
      </Tabs>
    </div>
  );
}
