import React from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Input,
  Divider,
  Select,
  SelectItem,
  Textarea,
  Button,
  Chip,
} from "@heroui/react";
import { Schema } from "vana-sdk";
import { SectionHeader } from "./ui/SectionHeader";
import { ActionButton } from "./ui/ActionButton";
import { StatusMessage } from "./ui/StatusMessage";
import { CodeDisplay } from "./ui/CodeDisplay";
import { InputModeToggle, InputMode } from "./ui/InputModeToggle";
import { FileUpload } from "./ui/FileUpload";
import {
  Lock,
  FileText,
  Key,
  RotateCcw,
  Eye,
  EyeOff,
  Download,
} from "lucide-react";

interface EncryptionTestCardProps {
  // Encryption state
  encryptionSeed: string;
  onEncryptionSeedChange: (seed: string) => void;
  encryptionKey: string;
  isGeneratingKey: boolean;
  onGenerateKey: () => void;

  // Input mode and data
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  testData: string;
  onTestDataChange: (data: string) => void;
  uploadedFile: File | null;
  onFileUpload: (file: File | null) => void;

  // Encryption operations
  isEncrypting: boolean;
  onEncryptData: () => void;
  onDecryptData: () => void;
  onResetAll: () => void;

  // Status and results
  encryptionStatus: string;
  encryptedData: Blob | null;
  decryptedData: string;
  showEncryptedContent: boolean;
  onToggleEncryptedContent: () => void;

  // Blockchain upload
  schemas: (Schema & { source?: "discovered" | "created" })[];
  selectedSchemaId: string;
  onSchemaSelectionChange: (schemaId: string) => void;
  isUploadingToChain: boolean;
  onUploadToChain: () => void;
  newFileId: number | null;

  // Storage configuration
  storageConfig: {
    provider: string;
    endpoint?: string;
    ipfsMode?: string;
  };

  // Utility functions
  onCopyToClipboard: (text: string) => void;
  onDownloadDecrypted: () => void;
}

/**
 * EncryptionTestCard component - Complete canonical encryption testing workflow
 * Demonstrates generateEncryptionKey(), encryptUserData(), decryptUserData()
 */
export const EncryptionTestCard: React.FC<EncryptionTestCardProps> = ({
  encryptionSeed,
  onEncryptionSeedChange,
  encryptionKey,
  isGeneratingKey,
  onGenerateKey,
  inputMode,
  onInputModeChange,
  testData,
  onTestDataChange,
  uploadedFile,
  onFileUpload,
  isEncrypting,
  onEncryptData,
  onDecryptData,
  onResetAll,
  encryptionStatus,
  encryptedData,
  decryptedData,
  showEncryptedContent,
  onToggleEncryptedContent,
  schemas,
  selectedSchemaId,
  onSchemaSelectionChange,
  isUploadingToChain,
  onUploadToChain,
  newFileId,
  storageConfig,
  onCopyToClipboard,
  onDownloadDecrypted,
}) => {
  const getEncryptedDataHex = async () => {
    if (!encryptedData) return "";
    const arrayBuffer = await encryptedData.arrayBuffer();
    return Array.from(new Uint8Array(arrayBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const [hexData, setHexData] = React.useState<string>("");

  React.useEffect(() => {
    if (encryptedData && showEncryptedContent) {
      getEncryptedDataHex().then(setHexData);
    }
  }, [encryptedData, showEncryptedContent]);

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          icon={<Lock className="h-5 w-5" />}
          title="Canonical Encryption Testing"
          description={
            <>
              <em>
                Demonstrates: `generateEncryptionKey()`, `encryptUserData()`,
                `decryptUserData()`
              </em>
              <br />
              Test the core encryption functions with your own data to
              understand how Vana protects user information.
            </>
          }
        />
      </CardHeader>
      <CardBody className="space-y-6">
        {/* Step 1: Configure Encryption Seed */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Step 1: Configure Encryption Seed
            </span>
          </div>
          <Input
            label="Encryption Seed"
            value={encryptionSeed}
            onValueChange={onEncryptionSeedChange}
            placeholder="Enter custom seed or use default"
            description="Used to derive your encryption key via wallet signature"
          />
        </div>

        <Divider />

        {/* Step 2: Generate Encryption Key */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Step 2: Generate Encryption Key
            </span>
            <ActionButton
              onPress={onGenerateKey}
              loading={isGeneratingKey}
              icon={<Key className="h-4 w-4" />}
              color="primary"
              size="sm"
            >
              Generate Key
            </ActionButton>
          </div>
          {encryptionKey && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Generated Encryption Key:</p>
              <CodeDisplay
                code={encryptionKey}
                showCopy={true}
                onCopy={onCopyToClipboard}
                language="text"
                maxHeight="max-h-32"
              />
            </div>
          )}
        </div>

        <Divider />

        {/* Step 3: Data Input Mode */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Step 3: Choose Data Input Mode
            </span>
            <InputModeToggle
              mode={inputMode}
              onModeChange={onInputModeChange}
            />
          </div>

          {inputMode === "text" && (
            <div className="space-y-3">
              <label htmlFor="test-data">Enter text data to encrypt:</label>
              <Textarea
                id="test-data"
                value={testData}
                onValueChange={onTestDataChange}
                placeholder="Enter your sensitive data here..."
                minRows={4}
              />
            </div>
          )}

          {inputMode === "file" && (
            <FileUpload
              id="file-upload"
              label="Upload file to test encryption"
              onFileChange={onFileUpload}
              file={uploadedFile}
              accept="*/*"
              placeholder="Upload any file to test encryption"
            />
          )}
        </div>

        <Divider />

        {/* Step 4: Encryption Operations */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Step 4: Encryption Operations
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ActionButton
              onPress={onEncryptData}
              loading={isEncrypting}
              icon={<Lock className="h-4 w-4" />}
              color="success"
              className="w-full"
              disabled={
                !encryptionKey ||
                (inputMode === "text" && !testData) ||
                (inputMode === "file" && !uploadedFile)
              }
            >
              Encrypt Data
            </ActionButton>
            <ActionButton
              onPress={onDecryptData}
              icon={<Key className="h-4 w-4" />}
              color="primary"
              className="w-full"
              disabled={!encryptedData}
            >
              Decrypt Data
            </ActionButton>
            <ActionButton
              onPress={onResetAll}
              icon={<RotateCcw className="h-4 w-4" />}
              color="default"
              variant="bordered"
              className="w-full"
            >
              Reset All
            </ActionButton>
          </div>
        </div>

        {/* Encryption Status */}
        {encryptionStatus && <StatusMessage status={encryptionStatus} />}

        {/* Encrypted Data Results */}
        {encryptedData && (
          <>
            <Divider />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Encrypted Data Results</h4>
                <div className="flex items-center gap-2">
                  <Chip variant="flat">{encryptedData.size} bytes</Chip>
                  <Chip variant="flat">OpenPGP Encrypted</Chip>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Binary Content (Hex):
                  </span>
                  <Button
                    size="sm"
                    variant="light"
                    onPress={onToggleEncryptedContent}
                  >
                    {showEncryptedContent ? (
                      <>
                        <EyeOff className="mr-2 h-4 w-4" />
                        Hide
                      </>
                    ) : (
                      <>
                        <Eye className="mr-2 h-4 w-4" />
                        Show
                      </>
                    )}
                  </Button>
                </div>
                {showEncryptedContent && (
                  <CodeDisplay
                    code={hexData}
                    showCopy={true}
                    onCopy={onCopyToClipboard}
                    language="text"
                    maxHeight="max-h-40"
                    wrap={true}
                  />
                )}
              </div>

              <StatusMessage
                status="✅ Data encrypted successfully! You can now decrypt it to verify the round-trip works."
                type="success"
              />
            </div>
          </>
        )}

        {/* Upload to Blockchain Section */}
        {encryptedData && (
          <>
            <Divider />
            <div className="space-y-4">
              <h4 className="font-medium">Upload to Blockchain</h4>

              {/* Storage Configuration Display */}
              <div className="bg-muted p-4 rounded-lg">
                <h5 className="font-medium mb-2">Storage Configuration</h5>
                <div className="space-y-2 text-sm">
                  <div>
                    <strong>Provider:</strong> {storageConfig.provider}
                  </div>
                  {storageConfig.endpoint && (
                    <div>
                      <strong>Endpoint:</strong> {storageConfig.endpoint}
                    </div>
                  )}
                  {storageConfig.ipfsMode && (
                    <div>
                      <strong>IPFS Mode:</strong> {storageConfig.ipfsMode}
                    </div>
                  )}
                </div>
              </div>

              {/* Schema Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium">
                  Select Schema for Upload:
                </label>
                <Select
                  aria-label="Select schema for upload"
                  selectedKeys={selectedSchemaId ? [selectedSchemaId] : []}
                  onSelectionChange={(keys) => {
                    const selectedKey = Array.from(keys)[0] as string;
                    onSchemaSelectionChange(selectedKey || "");
                  }}
                  placeholder={
                    schemas.length === 0
                      ? "No schemas available"
                      : "Select a schema..."
                  }
                  isDisabled={schemas.length === 0}
                >
                  {schemas.map((schema) => (
                    <SelectItem
                      key={schema.id.toString()}
                      textValue={`${schema.name} (ID: ${schema.id})`}
                    >
                      {schema.name} (ID: {schema.id})
                    </SelectItem>
                  ))}
                </Select>
                {schemas.length === 0 && (
                  <p className="text-xs text-orange-600">
                    ⚠️ No schemas found. Please create a schema first in the
                    section below.
                  </p>
                )}
              </div>

              <ActionButton
                onPress={onUploadToChain}
                loading={isUploadingToChain}
                disabled={!selectedSchemaId || schemas.length === 0}
                icon={<FileText className="h-4 w-4" />}
                color="primary"
                className="w-full"
              >
                Upload Encrypted File to Blockchain
              </ActionButton>

              {newFileId !== null && (
                <StatusMessage
                  status={`✅ File uploaded successfully! File ID: ${newFileId}`}
                  type="success"
                />
              )}
            </div>
          </>
        )}

        {/* Decrypted Data Results */}
        {decryptedData && (
          <>
            <Divider />
            <div className="space-y-4">
              <h4 className="font-medium">Decrypted Data Results</h4>
              <CodeDisplay
                code={decryptedData}
                showCopy={true}
                onCopy={onCopyToClipboard}
                language="text"
                maxHeight="max-h-48"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="bordered"
                  onPress={() => onCopyToClipboard(decryptedData)}
                >
                  Copy Decrypted Data
                </Button>
                <Button
                  size="sm"
                  variant="bordered"
                  onPress={onDownloadDecrypted}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download as File
                </Button>
              </div>
              <StatusMessage
                status={`✅ Round-trip encryption/decryption successful! ${
                  inputMode === "text"
                    ? `Data matches: ${decryptedData === testData ? "✅" : "❌"}`
                    : "File decrypted successfully. Download to verify content."
                }`}
                type="success"
              />
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
};
