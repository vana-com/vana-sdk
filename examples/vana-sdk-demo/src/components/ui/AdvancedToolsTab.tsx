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
} from "@heroui/react";
import { Lock, Key, Database, TestTube, Wrench } from "lucide-react";
import type { Vana, Schema } from "@opendatalabs/vana-sdk";
import { InputModeToggle } from "./InputModeToggle";
import { CodeDisplay } from "./CodeDisplay";

export interface AdvancedToolsTabProps {
  /** Vana SDK instance */
  vana: Vana;

  /** Available schemas */
  schemas: (Schema & { source?: "discovered" | "created" })[];

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
  chainId: _chainId,
  className = "",
}) => {
  const [activeSubTab, setActiveSubTab] = useState("encryption");

  // Encryption testing state
  const [encryptionSeed, setEncryptionSeed] = useState("");
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
      const key = await vana.data.generateEncryptionKey(
        encryptionSeed || undefined,
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
      const encrypted = await vana.data.encryptUserData(data, encryptionKey);
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
      const decrypted = await vana.data.decryptUserData(
        encryptedData,
        encryptionKey,
      );
      setDecryptedData(decrypted);
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
        <Tab key="storage" title="Storage Testing">
          {renderStorageTab()}
        </Tab>
      </Tabs>
    </div>
  );
};
