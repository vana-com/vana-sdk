import React from "react";
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
} from "@heroui/react";
import {
  Database,
  Search,
  ExternalLink,
  Download,
  RefreshCw,
} from "lucide-react";
import type { UserFile } from "vana-sdk/types/data";
import { SectionHeader } from "./ui/SectionHeader";
import { ActionButton } from "./ui/ActionButton";
import { EmptyState } from "./ui/EmptyState";
import { StatusDisplay } from "./ui/StatusDisplay";
import { StatusMessage } from "./ui/StatusMessage";
import { ExplorerLink } from "./ui/ExplorerLink";
import { CopyButton } from "./ui/CopyButton";

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
  onFileSelection: (fileId: number, selected: boolean) => void;
  onDecryptFile: (
    file: UserFile & { source?: "discovered" | "looked-up" | "uploaded" },
  ) => void;
  onDownloadDecryptedFile: (
    file: UserFile & { source?: "discovered" | "looked-up" | "uploaded" },
  ) => void;

  // Permission granting
  onGrantPermission: () => void;
  isGranting: boolean;
  grantStatus: string;
  grantTxHash: string;

  // User info
  _userAddress: string | undefined;
  chainId: number;
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
  onFileSelection,
  onDecryptFile,
  onDownloadDecryptedFile,
  onGrantPermission,
  isGranting,
  grantStatus,
  grantTxHash,
  _userAddress,
  chainId,
}) => {
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
            <Table
              aria-label="Data files table"
              removeWrapper
              classNames={{
                th: "bg-default-100 text-default-700",
                td: "py-4",
              }}
            >
              <TableHeader>
                <TableColumn>Select</TableColumn>
                <TableColumn>File ID</TableColumn>
                <TableColumn>Owner</TableColumn>
                <TableColumn>Size</TableColumn>
                <TableColumn>URL</TableColumn>
                <TableColumn>Source</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody>
                {userFiles.map((file) => {
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
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-small">
                            {file.id}
                          </span>
                          <CopyButton
                            value={file.id.toString()}
                            tooltip="Copy file ID"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-small truncate max-w-32">
                            {file.ownerAddress}
                          </span>
                          <CopyButton
                            value={file.ownerAddress}
                            tooltip="Copy owner address"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-small">
                          {file.metadata?.size || "Unknown"} bytes
                        </span>
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
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        {file.source && (
                          <Chip
                            size="sm"
                            color={
                              file.source === "uploaded" ? "success" : "default"
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {userFiles.length > 0 && (
          <div className="mt-4 p-3 bg-primary/10 rounded">
            <p className="text-sm text-primary">
              <strong>Selected files:</strong> {selectedFiles.length} • Use
              &quot;Decrypt&quot; to view encrypted file contents using your
              wallet signature.
            </p>
          </div>
        )}

        {fileLookupStatus && (
          <StatusDisplay status={fileLookupStatus} className="mt-4" />
        )}

        {/* Grant Permission Section */}
        {selectedFiles.length > 0 && (
          <div className="mt-6 p-4 bg-default-100 rounded">
            <h4 className="font-medium mb-3 text-default-700">
              Grant Permission ({selectedFiles.length} file
              {selectedFiles.length !== 1 ? "s" : ""} selected)
            </h4>
            <Button
              onPress={onGrantPermission}
              disabled={selectedFiles.length === 0 || isGranting}
              className="mb-4"
            >
              {isGranting && <Spinner size="sm" className="mr-2" />}
              Grant Permission to Selected Files
            </Button>

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
