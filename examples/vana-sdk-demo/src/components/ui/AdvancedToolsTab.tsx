import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Tabs,
  Tab,
  Button,
  Input,
  Textarea,
  Select,
  SelectItem,
  Chip,
  Divider,
  RadioGroup,
  Radio,
} from "@heroui/react";
import { Lock, Key, Database, TestTube, Wrench } from "lucide-react";
import type { Vana, Schema } from "@opendatalabs/vana-sdk/browser";
import type { WalletClient } from "viem";
import {
  generateEncryptionKey as sdkGenerateEncryptionKey,
  encryptBlobWithSignedKey as sdkEncryptUserData,
  decryptBlobWithSignedKey as sdkDecryptUserData,
  DEFAULT_ENCRYPTION_SEED,
  BrowserPlatformAdapter,
  convertIpfsUrl,
} from "@opendatalabs/vana-sdk/browser";
import { InputModeToggle } from "./InputModeToggle";
import { CodeDisplay } from "./CodeDisplay";

export interface AdvancedToolsTabProps {
  /** Vana SDK instance */
  vana: Vana;

  /** Available schemas */
  schemas: (Schema & { source?: "discovered" | "created" })[];

  /** Wallet client for signing operations */
  walletClient: WalletClient;

  /** Chain ID for explorer links */
  chainId: number;

  /** Configuration */
  className?: string;
}

/**
 * AdvancedToolsTab component - Advanced developer tools for encryption testing and utilities
 *
 * @remarks
 * This component provides advanced tools for developers including:
 * 1. Encryption key generation and testing
 * 2. Data encryption/decryption utilities
 * 3. Storage provider testing
 * 4. SDK configuration tools
 */
export const AdvancedToolsTab: React.FC<AdvancedToolsTabProps> = ({
  vana,
  schemas: _schemas,
  walletClient,
  chainId: _chainId,
  className = "",
}) => {
  const [activeSubTab, setActiveSubTab] = useState("encryption");

  // File decryption state
  const [decryptFileId, setDecryptFileId] = useState("");
  const [decryptMode, setDecryptMode] = useState<"wallet" | "private-key">(
    "wallet",
  );
  const [decryptPrivateKey, setDecryptPrivateKey] = useState("");
  const [decryptSeed, setDecryptSeed] = useState(DEFAULT_ENCRYPTION_SEED);
  const [isDecryptingFile, setIsDecryptingFile] = useState(false);
  const [decryptionResult, setDecryptionResult] = useState<{
    content: string;
    fileKey: string;
    ownerAddress: string;
    algorithm: string;
    metadata: Record<string, unknown>;
    decryptedBlob?: Blob | null;
  } | null>(null);
  const [decryptionError, setDecryptionError] = useState("");

  // Create platform adapter for encryption operations
  const platformAdapter = new BrowserPlatformAdapter();

  // Encryption testing state
  const [encryptionSeed, setEncryptionSeed] = useState(DEFAULT_ENCRYPTION_SEED);
  const [encryptionKey, setEncryptionKey] = useState("");
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [testData, setTestData] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [encryptedData, setEncryptedData] = useState<Blob | null>(null);
  const [decryptedData, setDecryptedData] = useState("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encryptionStatus, setEncryptionStatus] = useState("");

  // Storage testing state
  const [storageProvider, setStorageProvider] = useState("ipfs");
  const [testFile, setTestFile] = useState<File | null>(null);
  const [isTestingStorage, setIsTestingStorage] = useState(false);
  const [storageResults, setStorageResults] = useState<{
    provider: string;
    uploadTime: number;
    url: string;
    size: number;
  } | null>(null);

  /**
   * Generates an encryption key using the SDK
   */
  const generateEncryptionKey = async () => {
    setIsGeneratingKey(true);
    setEncryptionStatus("Generating encryption key...");

    try {
      const key = await sdkGenerateEncryptionKey(
        walletClient,
        encryptionSeed || DEFAULT_ENCRYPTION_SEED,
      );
      setEncryptionKey(key);
      setEncryptionStatus("Encryption key generated successfully!");
    } catch (error) {
      setEncryptionStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsGeneratingKey(false);
    }
  };

  /**
   * Encrypts the test data
   */
  const encryptTestData = async () => {
    if (!encryptionKey || !testData) return;

    setIsEncrypting(true);
    setEncryptionStatus("Encrypting data...");

    try {
      const data =
        inputMode === "text" ? testData : (await selectedFile?.text()) || "";
      const blob = new Blob([data], { type: "text/plain" });
      const encrypted = await sdkEncryptUserData(
        blob,
        encryptionKey,
        platformAdapter,
      );
      setEncryptedData(encrypted);
      setEncryptionStatus("Data encrypted successfully!");
    } catch (error) {
      setEncryptionStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsEncrypting(false);
    }
  };

  /**
   * Decrypts the encrypted data
   */
  const decryptTestData = async () => {
    if (!encryptedData || !encryptionKey) return;

    setIsEncrypting(true);
    setEncryptionStatus("Decrypting data...");

    try {
      const decrypted = await sdkDecryptUserData(
        encryptedData,
        encryptionKey,
        platformAdapter,
      );
      const text = await decrypted.text();
      setDecryptedData(text);
      setEncryptionStatus("Data decrypted successfully!");
    } catch (error) {
      setEncryptionStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsEncrypting(false);
    }
  };

  /**
   * Decrypts a file using either wallet or private key
   */
  const decryptFileById = async () => {
    if (!decryptFileId.trim()) {
      setDecryptionError("Please enter a file ID");
      return;
    }

    if (decryptMode === "private-key" && !decryptPrivateKey.trim()) {
      setDecryptionError("Please enter a private key");
      return;
    }

    setIsDecryptingFile(true);
    setDecryptionError("");
    setDecryptionResult(null);

    try {
      const fileId = parseInt(decryptFileId.trim());
      if (isNaN(fileId) || fileId < 0) {
        throw new Error(
          "Invalid file ID. Please enter a valid positive number.",
        );
      }

      // Get file details
      const file = await vana.data.getFileById(fileId);

      let decryptedBlob: Blob;
      let fileKey: string;

      if (decryptMode === "wallet") {
        // Use wallet-based decryption with custom seed
        decryptedBlob = await vana.data.decryptFile(file, decryptSeed);
        // Generate the key for display (this matches what the SDK would generate)
        fileKey = await sdkGenerateEncryptionKey(walletClient, decryptSeed);
      } else {
        // Use private key (already-derived encryption key) for decryption
        fileKey = decryptPrivateKey.trim();

        // Get the encrypted file data with CORS fallback
        let encryptedData: Blob;
        try {
          // First try converting IPFS URL to HTTP gateway URL
          const httpUrl = convertIpfsUrl(file.url);
          const response = await fetch(httpUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          encryptedData = await response.blob();
        } catch (error) {
          console.warn("Direct fetch failed, trying proxy:", error);
          // Fallback to proxy for CORS issues
          const proxyUrl = `/api/proxy?url=${encodeURIComponent(file.url)}`;
          const response = await fetch(proxyUrl);
          if (!response.ok) {
            throw new Error(`Proxy failed: HTTP ${response.status}`);
          }
          encryptedData = await response.blob();
        }

        // Use SDK's decryption function with the provided key
        decryptedBlob = await sdkDecryptUserData(
          encryptedData,
          fileKey,
          platformAdapter,
        );
      }

      // Try to read as text, but handle non-text files gracefully
      let content: string;
      let isTextFile = true;
      try {
        content = await decryptedBlob.text();
        // Basic check if it's likely text
        if (content.includes("\x00") || content.length === 0) {
          isTextFile = false;
          content = `[Binary file - ${decryptedBlob.size} bytes]`;
        }
      } catch {
        isTextFile = false;
        content = `[Binary file - ${decryptedBlob.size} bytes]`;
      }

      setDecryptionResult({
        content,
        fileKey,
        ownerAddress: file.ownerAddress,
        algorithm: "AES-256-GCM",
        metadata: {
          fileId: file.id,
          fileName: `file-${file.id}`,
          fileSize: `${decryptedBlob.size} bytes`,
          fileType: decryptedBlob.type || "application/octet-stream",
          isTextFile,
          storageUrl: file.url,
          encryptionSeed: decryptSeed,
          decryptionMode: decryptMode,
          decryptedAt: new Date().toISOString(),
        },
        decryptedBlob: isTextFile ? null : decryptedBlob,
      });
    } catch (error) {
      setDecryptionError(
        error instanceof Error ? error.message : "Unknown error occurred",
      );
    } finally {
      setIsDecryptingFile(false);
    }
  };

  /**
   * Tests storage provider upload
   */
  const testStorageUpload = async () => {
    if (!testFile) return;

    setIsTestingStorage(true);
    const startTime = performance.now();

    try {
      // Create a blob from the test file
      const fileBlob = new Blob([await testFile.arrayBuffer()], {
        type: testFile.type,
      });

      // Upload test file (unencrypted for testing purposes)
      const result = await vana.data.uploadEncryptedFile(
        fileBlob,
        testFile.name,
      );

      const endTime = performance.now();
      const uploadTime = endTime - startTime;

      setStorageResults({
        provider: storageProvider,
        uploadTime,
        url: result.url,
        size: testFile.size,
      });
    } catch (error) {
      console.error("Storage test failed:", error);
    } finally {
      setIsTestingStorage(false);
    }
  };

  /**
   * Renders the encryption testing tab
   */
  const renderEncryptionTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            <h4 className="text-lg font-semibold">Encryption Testing</h4>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {/* Encryption Seed */}
            <Input
              label="Encryption Seed"
              placeholder="Enter custom seed (optional)"
              value={encryptionSeed}
              onChange={(e) => setEncryptionSeed(e.target.value)}
              description="Used to derive your encryption key via wallet signature"
            />

            {/* Generate Key */}
            <div className="flex items-center gap-2">
              <Button
                onPress={generateEncryptionKey}
                isLoading={isGeneratingKey}
                color="primary"
                startContent={<Key className="h-4 w-4" />}
              >
                Generate Key
              </Button>
              {encryptionKey && (
                <Chip color="success" variant="flat">
                  Key Generated
                </Chip>
              )}
            </div>

            {/* Display generated key */}
            {encryptionKey && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Generated Encryption Key:</p>
                <CodeDisplay
                  code={encryptionKey}
                  showCopy={true}
                  language="text"
                  maxHeight="max-h-32"
                />
              </div>
            )}

            <Divider />

            {/* Input Mode */}
            <InputModeToggle mode={inputMode} onModeChange={setInputMode} />

            {/* Test Data Input */}
            {inputMode === "text" ? (
              <Textarea
                label="Test Data"
                placeholder="Enter test data to encrypt..."
                value={testData}
                onChange={(e) => setTestData(e.target.value)}
                minRows={4}
              />
            ) : (
              <Input
                type="file"
                label="Select Test File"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            )}

            {/* Encryption Operations */}
            <div className="flex items-center gap-2">
              <Button
                onPress={encryptTestData}
                isLoading={isEncrypting}
                color="primary"
                isDisabled={!encryptionKey || !testData}
                startContent={<Lock className="h-4 w-4" />}
              >
                Encrypt
              </Button>
              <Button
                onPress={decryptTestData}
                isLoading={isEncrypting}
                variant="bordered"
                isDisabled={!encryptedData || !encryptionKey}
                startContent={<Key className="h-4 w-4" />}
              >
                Decrypt
              </Button>
            </div>

            {/* Status */}
            {encryptionStatus && (
              <div className="p-3 bg-info/10 rounded-lg">
                <p className="text-sm text-info">{encryptionStatus}</p>
              </div>
            )}

            {/* Encrypted Data Display */}
            {encryptedData && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Encrypted Data:</p>
                <div className="p-3 bg-warning/10 rounded-lg">
                  <div className="text-sm">
                    <p>
                      <strong>Size:</strong> {encryptedData.size} bytes
                    </p>
                    <p>
                      <strong>Type:</strong>{" "}
                      {encryptedData.type || "application/octet-stream"}
                    </p>
                    <p className="text-warning-600 mt-2">
                      ⚠️ Encrypted binary data - not human readable
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="flat"
                    className="mt-2"
                    onPress={() => {
                      const url = URL.createObjectURL(encryptedData);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "encrypted-data.bin";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Download Encrypted File
                  </Button>
                </div>
              </div>
            )}

            {/* Decrypted Result */}
            {decryptedData && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Decrypted Data:</p>
                <CodeDisplay
                  code={decryptedData}
                  showCopy={true}
                  language="text"
                  maxHeight="max-h-40"
                />
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );

  /**
   * Renders the file decryption tab
   */
  const renderFileDecryptionTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            <h4 className="text-lg font-semibold">File Decryption</h4>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {/* File ID Input */}
            <Input
              label="File ID"
              placeholder="Enter file ID to decrypt"
              value={decryptFileId}
              onChange={(e) => setDecryptFileId(e.target.value)}
              description="The numeric ID of the file you want to decrypt"
            />

            {/* Encryption Seed Input */}
            <Input
              label="Encryption Seed"
              placeholder="Enter encryption seed"
              value={decryptSeed}
              onChange={(e) => setDecryptSeed(e.target.value)}
              description="Seed used to derive the encryption key for decryption"
            />

            {/* Decryption Mode */}
            <RadioGroup
              label="Decryption Mode"
              value={decryptMode}
              onValueChange={(value) =>
                setDecryptMode(value as "wallet" | "private-key")
              }
            >
              <Radio value="wallet">Use Connected Wallet</Radio>
              <Radio value="private-key">Manual Encryption Key</Radio>
            </RadioGroup>

            {/* Encryption Key Input (conditional) */}
            {decryptMode === "private-key" && (
              <Input
                label="Encryption Key"
                placeholder="Enter the derived encryption key"
                value={decryptPrivateKey}
                onChange={(e) => setDecryptPrivateKey(e.target.value)}
                description="The already-derived encryption key (same as what wallet mode generates)"
                type="password"
              />
            )}

            {/* Decrypt Button */}
            <Button
              onPress={decryptFileById}
              isLoading={isDecryptingFile}
              color="primary"
              isDisabled={
                !decryptFileId.trim() ||
                (decryptMode === "private-key" && !decryptPrivateKey.trim())
              }
              startContent={<Key className="h-4 w-4" />}
            >
              Decrypt File
            </Button>

            {/* Error Display */}
            {decryptionError && (
              <div className="p-3 bg-danger/10 rounded-lg">
                <p className="text-sm text-danger">{decryptionError}</p>
              </div>
            )}

            {/* Results Display */}
            {decryptionResult && (
              <div className="space-y-4">
                <h5 className="font-medium text-success">
                  Decryption Results:
                </h5>

                {/* Debug Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">File Encryption Key:</p>
                    <CodeDisplay
                      code={decryptionResult.fileKey}
                      showCopy={true}
                      language="text"
                      maxHeight="max-h-20"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Owner Address:</p>
                    <CodeDisplay
                      code={decryptionResult.ownerAddress}
                      showCopy={true}
                      language="text"
                      maxHeight="max-h-20"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Encryption Algorithm:</p>
                    <div className="p-2 bg-primary/10 rounded border">
                      <span className="text-sm font-mono text-primary">
                        {decryptionResult.algorithm}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">File Info:</p>
                    <div className="p-3 bg-default-50 rounded-lg text-sm space-y-1">
                      <div>
                        <strong>File Name:</strong>{" "}
                        {decryptionResult.metadata.fileName as string}
                      </div>
                      <div>
                        <strong>File Size:</strong>{" "}
                        {decryptionResult.metadata.fileSize as string}
                      </div>
                      <div>
                        <strong>File Type:</strong>{" "}
                        {decryptionResult.metadata.fileType as string}
                      </div>
                      <div>
                        <strong>Is Text File:</strong>{" "}
                        {decryptionResult.metadata.isTextFile ? "Yes" : "No"}
                      </div>
                      <div>
                        <strong>Decrypted At:</strong>{" "}
                        {new Date(
                          decryptionResult.metadata.decryptedAt as string,
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Decrypted Content or Download */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Decrypted Content:</p>
                  {decryptionResult.metadata.isTextFile ? (
                    <CodeDisplay
                      code={decryptionResult.content}
                      showCopy={true}
                      language="text"
                      maxHeight="max-h-64"
                    />
                  ) : (
                    <div className="p-4 bg-warning/10 rounded-lg border border-warning/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-warning-700">
                            Binary file detected
                          </p>
                          <p className="text-xs text-warning-600">
                            This file contains binary data that cannot be
                            displayed as text.
                          </p>
                        </div>
                        {decryptionResult.decryptedBlob && (
                          <Button
                            size="sm"
                            color="primary"
                            variant="flat"
                            onPress={() => {
                              if (decryptionResult.decryptedBlob) {
                                const url = URL.createObjectURL(
                                  decryptionResult.decryptedBlob,
                                );
                                const a = document.createElement("a");
                                a.href = url;
                                a.download =
                                  (decryptionResult.metadata
                                    .fileName as string) ||
                                  `decrypted-file-${decryptionResult.metadata.fileId}`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }
                            }}
                          >
                            Download Decrypted File
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Technical Metadata (collapsible) */}
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-default-600 hover:text-default-900">
                    View Technical Metadata
                  </summary>
                  <div className="mt-2">
                    <CodeDisplay
                      code={JSON.stringify(decryptionResult.metadata, null, 2)}
                      showCopy={true}
                      language="json"
                      maxHeight="max-h-32"
                    />
                  </div>
                </details>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );

  /**
   * Renders the storage testing tab
   */
  const renderStorageTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <h4 className="text-lg font-semibold">Storage Provider Testing</h4>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <Select
              label="Storage Provider"
              placeholder="Select storage provider"
              selectedKeys={[storageProvider]}
              onSelectionChange={(keys) =>
                setStorageProvider(Array.from(keys)[0] as string)
              }
            >
              <SelectItem key="ipfs" textValue="IPFS">
                IPFS
              </SelectItem>
              <SelectItem key="pinata" textValue="Pinata">
                Pinata
              </SelectItem>
              <SelectItem key="google-drive" textValue="Google Drive">
                Google Drive
              </SelectItem>
            </Select>

            <Input
              type="file"
              label="Test File"
              onChange={(e) => setTestFile(e.target.files?.[0] || null)}
            />

            <Button
              onPress={testStorageUpload}
              isLoading={isTestingStorage}
              color="primary"
              isDisabled={!testFile}
              startContent={<TestTube className="h-4 w-4" />}
            >
              Test Upload
            </Button>

            {storageResults && (
              <div className="p-4 bg-success/10 rounded-lg">
                <h5 className="font-medium text-success mb-2">
                  Upload Results:
                </h5>
                <div className="space-y-1 text-sm">
                  <p>
                    <strong>Provider:</strong> {storageResults.provider}
                  </p>
                  <p>
                    <strong>Upload Time:</strong>{" "}
                    {storageResults.uploadTime.toFixed(2)}ms
                  </p>
                  <p>
                    <strong>File Size:</strong> {storageResults.size} bytes
                  </p>
                  <p>
                    <strong>URL:</strong>{" "}
                    <a
                      href={storageResults.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {storageResults.url}
                    </a>
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-lg font-semibold">
                Advanced Developer Tools
              </h3>
              <p className="text-sm text-default-600">
                Advanced utilities for encryption testing and storage
                benchmarking
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Sub-tabs */}
      <Tabs
        aria-label="Advanced tools tabs"
        selectedKey={activeSubTab}
        onSelectionChange={(key) => setActiveSubTab(key as string)}
        className="w-full"
      >
        <Tab key="encryption" title="Encryption Testing">
          {renderEncryptionTab()}
        </Tab>
        <Tab key="file-decryption" title="File Decryption">
          {renderFileDecryptionTab()}
        </Tab>
        <Tab key="storage" title="Storage Testing">
          {renderStorageTab()}
        </Tab>
      </Tabs>
    </div>
  );
};
