import React from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Select,
  SelectItem,
  Textarea,
  Button,
  Spinner,
} from "@heroui/react";
import { Shield, FileText, Upload, Brain } from "lucide-react";
import { SectionHeader } from "./ui/SectionHeader";
import { InputModeToggle, InputMode } from "./ui/InputModeToggle";
import { FileUpload } from "./ui/FileUpload";
import { StatusMessage } from "./ui/StatusMessage";
import { IdChip } from "./ui/IdChip";
import { IpfsAddressDisplay } from "./ui/IpfsAddressDisplay";
import { ExplorerLink } from "./ui/ExplorerLink";
import { InfoBox } from "./ui/InfoBox";

interface ServerUploadCardProps {
  // Server selection
  trustedServers: string[];
  selectedServerForUpload: string;
  onSelectedServerForUploadChange: (serverId: string) => void;

  // Input mode and data
  serverInputMode: InputMode;
  onServerInputModeChange: (mode: InputMode) => void;
  serverTextData: string;
  onServerTextDataChange: (data: string) => void;
  serverFileToUpload: File | null;
  onServerFileToUploadChange: (file: File | null) => void;

  // Upload functionality
  onUploadToTrustedServer: () => void;
  isUploadingToServer: boolean;

  // Status and results
  serverUploadStatus: string;
  serverUploadResult: {
    fileId: number;
    transactionHash: string;
    url: string;
  } | null;

  // Chain information
  chainId: number;
}

/**
 * ServerUploadCard component - Complete trusted server file upload workflow
 * Demonstrates uploadFileWithPermissions(), getTrustedServerPublicKey()
 */
export const ServerUploadCard: React.FC<ServerUploadCardProps> = ({
  trustedServers,
  selectedServerForUpload,
  onSelectedServerForUploadChange,
  serverInputMode,
  onServerInputModeChange,
  serverTextData,
  onServerTextDataChange,
  serverFileToUpload,
  onServerFileToUploadChange,
  onUploadToTrustedServer,
  isUploadingToServer,
  serverUploadStatus,
  serverUploadResult,
  chainId,
}) => {
  return (
    <Card>
      <CardHeader>
        <SectionHeader
          icon={<Shield className="h-5 w-5" />}
          title="Upload File to Trusted Server"
          description={
            <>
              <em>
                Demonstrates: `uploadFileWithPermissions()`,
                `getTrustedServerPublicKey()`
              </em>
              <br />
              Complete workflow for securely sharing a file with a designated
              server using dual encryption.
            </>
          }
        />
      </CardHeader>
      <CardBody className="space-y-6">
        {/* Server Selection */}
        <div className="space-y-2">
          <label htmlFor="server-select">Select Trusted Server:</label>
          <Select
            id="server-select"
            aria-label="Select trusted server for file upload"
            selectedKeys={
              selectedServerForUpload ? [selectedServerForUpload] : []
            }
            onSelectionChange={(keys) => {
              const selectedKey = Array.from(keys)[0];
              onSelectedServerForUploadChange(
                selectedKey ? selectedKey.toString() : "",
              );
            }}
            placeholder={
              trustedServers.length === 0
                ? "No trusted servers"
                : "Select a server..."
            }
            isDisabled={isUploadingToServer || trustedServers.length === 0}
          >
            {trustedServers.map((serverId) => (
              <SelectItem key={serverId}>{serverId}</SelectItem>
            ))}
          </Select>
          {trustedServers.length === 0 && (
            <p className="text-xs text-orange-600">
              ⚠️ No trusted servers found. Please trust a server first in the
              section above.
            </p>
          )}
        </div>

        {/* Data Input Mode Selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Choose Data Input Mode
            </span>
            <InputModeToggle
              mode={serverInputMode}
              onModeChange={onServerInputModeChange}
              disabled={isUploadingToServer}
            />
          </div>

          {serverInputMode === "text" && (
            <div className="space-y-3">
              <label htmlFor="server-text-data">
                Enter text data to upload:
              </label>
              <Textarea
                id="server-text-data"
                value={serverTextData}
                onValueChange={onServerTextDataChange}
                placeholder="Enter your data here..."
                minRows={4}
                disabled={isUploadingToServer}
              />
            </div>
          )}

          {serverInputMode === "file" && (
            <FileUpload
              id="server-file-upload"
              label="Select File to Upload:"
              file={serverFileToUpload}
              onFileChange={(file) => {
                onServerFileToUploadChange(file);
              }}
              disabled={isUploadingToServer}
              placeholder="Click to select file"
            />
          )}
        </div>

        {/* Upload Button */}
        <Button
          onPress={onUploadToTrustedServer}
          disabled={
            isUploadingToServer ||
            !selectedServerForUpload ||
            (serverInputMode === "file" && !serverFileToUpload) ||
            (serverInputMode === "text" && !serverTextData.trim())
          }
          variant="solid"
          className="w-full"
        >
          {isUploadingToServer ? (
            <Spinner size="sm" className="mr-2" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {isUploadingToServer ? "Uploading..." : "Upload to Trusted Server"}
        </Button>

        {/* Status Messages */}
        {serverUploadStatus && (
          <StatusMessage status={serverUploadStatus} className="p-4" />
        )}

        {/* Success Result */}
        {serverUploadResult && (
          <div className="p-4 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-green-800 dark:text-green-200">
                  File uploaded successfully!
                </span>
              </div>
              <div className="space-y-2">
                <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                  <IdChip label="File ID" id={serverUploadResult.fileId} />
                </div>
                <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                  <IpfsAddressDisplay
                    ipfsUrl={serverUploadResult.url}
                    showCopy={true}
                    showExternalLink={true}
                    label="IPFS URL"
                  />
                </div>
                <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                  <ExplorerLink
                    type="tx"
                    hash={serverUploadResult.transactionHash}
                    chainId={chainId}
                    label="Transaction Hash"
                  />
                </div>
              </div>
              <p className="text-xs text-green-600">
                ✅ The file has been encrypted with your wallet signature and
                permissions granted to the trusted server via encrypted key
                sharing.
              </p>
            </div>
          </div>
        )}

        {/* Information */}
        <InfoBox
          title="How it works:"
          icon={<Brain className="h-4 w-4" />}
          variant="info"
          items={[
            "Your file is encrypted with your wallet signature key",
            "Your encryption key is encrypted with the server's real public key",
            "Only the selected trusted server can decrypt your encryption key",
            "The file is stored on IPFS and registered on the Vana blockchain with permissions",
            "You maintain full control over which servers can access your data",
          ]}
        />
      </CardBody>
    </Card>
  );
};
