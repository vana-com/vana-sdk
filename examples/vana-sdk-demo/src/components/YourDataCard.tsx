import React from "react";
import { Input, Button, Spinner } from "@heroui/react";
import { Database, Search } from "lucide-react";
import { UserFile } from "vana-sdk";
import { SectionHeader } from "./ui/SectionHeader";
import { ActionButton } from "./ui/ActionButton";
import { ResourceList } from "./ui/ResourceList";
import { FileCard } from "./FileCard";
import { EmptyState } from "./ui/EmptyState";
import { StatusDisplay } from "./ui/StatusDisplay";
import { StatusMessage } from "./ui/StatusMessage";
import { ExplorerLink } from "./ui/ExplorerLink";

interface YourDataCardProps {
  // File lookup
  fileLookupId: string;
  onFileLookupIdChange: (id: string) => void;
  onLookupFile: () => void;
  isLookingUpFile: boolean;
  fileLookupStatus: string;

  // User files
  userFiles: UserFile[];
  isLoadingFiles: boolean;
  onRefreshFiles: () => void;

  // File selection and decryption
  selectedFiles: number[];
  decryptingFiles: Set<number>;
  decryptedFiles: Map<number, string>;
  onFileSelection: (fileId: number, selected: boolean) => void;
  onDecryptFile: (file: UserFile) => void;
  onDownloadDecryptedFile: (file: UserFile) => void;

  // Permission granting
  onGrantPermission: () => void;
  isGranting: boolean;
  grantStatus: string;
  grantTxHash: string;

  // User info
  userAddress: string | undefined;
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
  userAddress,
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

        <ResourceList
          title="Your Data Files"
          description={`Manage your registered data files and grant permissions (${userFiles.length} files)`}
          items={userFiles}
          isLoading={isLoadingFiles}
          onRefresh={onRefreshFiles}
          renderItem={(file) => {
            const isDecrypting = decryptingFiles.has(file.id);
            const decryptedContent = decryptedFiles.get(file.id);
            return (
              <FileCard
                key={file.id}
                file={file}
                isSelected={selectedFiles.includes(file.id)}
                isDecrypted={!!decryptedContent}
                decryptedContent={decryptedContent}
                isDecrypting={isDecrypting}
                userAddress={userAddress}
                onSelect={() =>
                  onFileSelection(file.id, !selectedFiles.includes(file.id))
                }
                onDecrypt={() => onDecryptFile(file)}
                onDownloadDecrypted={() => onDownloadDecryptedFile(file)}
              />
            );
          }}
          emptyState={
            <EmptyState
              icon={<Database className="h-12 w-12" />}
              title="No data files found"
              description="Upload and encrypt files to get started"
            />
          }
        />

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
          <div className="mt-6 p-4 bg-green-50/50 rounded">
            <h3 className="font-medium mb-3 text-green-700">
              Grant Permission ({selectedFiles.length} file
              {selectedFiles.length !== 1 ? "s" : ""} selected)
            </h3>
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
