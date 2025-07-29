import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Textarea,
  Divider,
  Chip,
  Progress,
} from "@heroui/react";
import {
  Database,
  Server,
  CheckCircle,
  AlertCircle,
  Layers,
  Upload,
} from "lucide-react";
import type { VanaInstance } from "@opendatalabs/vana-sdk/browser";
import type { Address } from "viem";
import { CodeDisplay } from "./CodeDisplay";
import { StatusMessage } from "./StatusMessage";

export interface BatchOperationsTabProps {
  /** Vana SDK instance */
  vana: VanaInstance;
  /** Chain ID for display */
  chainId: number;
  /** Configuration */
  className?: string;
}

/**
 * BatchOperationsTab component - Demonstrates new batch operations for server files and permissions
 *
 * This component showcases the new `submitAddServerFilesAndPermissions()` method that allows
 * adding multiple files with their associated permissions in a single blockchain transaction.
 */
export const BatchOperationsTab: React.FC<BatchOperationsTabProps> = ({
  vana,
  chainId: _chainId,
  className = "",
}) => {
  // Form state
  const [serverAddress, setServerAddress] = useState<string>("");
  const [serverUrl, setServerUrl] = useState<string>("");
  const [serverPublicKey, setServerPublicKey] = useState<string>("");
  const [fileUrls, setFileUrls] = useState<string>("");
  const [grantJson, setGrantJson] = useState<string>("");

  // Operation state
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchStatus, setBatchStatus] = useState<string>("");
  const [batchResult, setBatchResult] = useState<{
    transactionHash: string;
    serverRegistered: boolean;
    filesAdded: number;
    permissionsGranted: number;
  } | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  /**
   * Handles the batch operation submission
   */
  const handleBatchOperation = async () => {
    if (
      !serverAddress.trim() ||
      !serverUrl.trim() ||
      !serverPublicKey.trim() ||
      !fileUrls.trim()
    ) {
      setBatchError("Please fill in all required fields");
      return;
    }

    setIsBatchProcessing(true);
    setBatchStatus("Preparing batch operation...");
    setBatchError(null);
    setBatchResult(null);

    try {
      // Parse file URLs
      const urls = fileUrls
        .split("\n")
        .map((url) => url.trim())
        .filter((url) => url.length > 0);
      if (urls.length === 0) {
        throw new Error("Please provide at least one file URL");
      }

      // Parse grant JSON
      let grantData;
      try {
        grantData = grantJson.trim() ? JSON.parse(grantJson) : {};
      } catch {
        throw new Error("Invalid JSON in grant data");
      }

      setBatchStatus("Creating batch transaction...");

      // Create file permissions for each file (example structure)
      const filePermissions = urls.map(() => [
        {
          account: serverAddress as Address,
          key: serverPublicKey,
          operation: "llm_inference",
          parameters: grantData,
        },
      ]);

      // Prepare the batch operation parameters
      const batchParams = {
        granteeId: BigInt(1), // Example grantee ID
        grant: JSON.stringify(grantData),
        fileUrls: urls,
        serverAddress: serverAddress as Address,
        serverUrl: serverUrl,
        serverPublicKey: serverPublicKey,
        filePermissions: filePermissions,
      };

      setBatchStatus("Submitting to blockchain...");

      // Submit the batch operation
      const transactionHash =
        await vana.permissions.submitAddServerFilesAndPermissions(batchParams);

      setBatchResult({
        transactionHash,
        serverRegistered: true,
        filesAdded: urls.length,
        permissionsGranted: urls.length,
      });

      setBatchStatus("✅ Batch operation completed successfully!");

      // Clear form on success
      setServerAddress("");
      setServerUrl("");
      setServerPublicKey("");
      setFileUrls("");
      setGrantJson("");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Batch operation failed";
      setBatchError(errorMessage);
      setBatchStatus("❌ Batch operation failed");
    } finally {
      setIsBatchProcessing(false);
    }
  };

  /**
   * Loads example data for testing
   */
  const loadExampleData = () => {
    setServerAddress("0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36");
    setServerUrl("https://example-server.com");
    setServerPublicKey(
      "0x04a7b5d5b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3",
    );
    setFileUrls(
      "ipfs://QmExampleHash1\nipfs://QmExampleHash2\nipfs://QmExampleHash3",
    );
    setGrantJson(`{
  "operation": "llm_inference",
  "model": "gpt-4",
  "maxTokens": 1000,
  "temperature": 0.7,
  "prompt": "Analyze the user data"
}`);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Introduction */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-lg font-semibold">Batch Operations</h3>
              <p className="text-sm text-default-600">
                Demonstrate the new batch transaction capabilities for server
                registration, file addition, and permission granting in a single
                transaction.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <p className="text-sm">
              The <code>submitAddServerFilesAndPermissions()</code> method
              allows you to:
            </p>
            <ul className="text-sm space-y-1 ml-4">
              <li>• Register/trust a server</li>
              <li>• Add multiple files to the data registry</li>
              <li>• Grant permissions for all files to the server</li>
              <li>• All in a single blockchain transaction</li>
            </ul>
            <Button
              variant="flat"
              size="sm"
              onPress={loadExampleData}
              startContent={<Database className="h-4 w-4" />}
            >
              Load Example Data
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Batch Operation Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            <div>
              <h4 className="font-semibold">Server and Files Configuration</h4>
              <p className="text-sm text-default-600">
                Configure the server and files for the batch operation
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {/* Server Configuration */}
            <div className="space-y-3">
              <h5 className="text-sm font-medium">Server Information</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Server Address"
                  placeholder="0x742d35Cc..."
                  value={serverAddress}
                  onChange={(e) => setServerAddress(e.target.value)}
                  description="The wallet address of the server"
                  isRequired
                />
                <Input
                  label="Server URL"
                  placeholder="https://api.example.com"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  description="The public URL endpoint for the server"
                  isRequired
                />
              </div>
              <Input
                label="Server Public Key"
                placeholder="0x04a7b5d5b7c8..."
                value={serverPublicKey}
                onChange={(e) => setServerPublicKey(e.target.value)}
                description="The server's public key for encryption"
                isRequired
              />
            </div>

            <Divider />

            {/* File Configuration */}
            <div className="space-y-3">
              <h5 className="text-sm font-medium">File URLs</h5>
              <Textarea
                label="File URLs (one per line)"
                placeholder={`ipfs://QmExampleHash1
ipfs://QmExampleHash2
ipfs://QmExampleHash3`}
                value={fileUrls}
                onChange={(e) => setFileUrls(e.target.value)}
                minRows={3}
                maxRows={8}
                description="IPFS URLs of files to add and grant permissions for"
                isRequired
              />
            </div>

            <Divider />

            {/* Grant Configuration */}
            <div className="space-y-3">
              <h5 className="text-sm font-medium">Grant Parameters</h5>
              <Textarea
                label="Grant JSON"
                placeholder={`{
  "operation": "llm_inference",
  "model": "gpt-4",
  "prompt": "Analyze the data"
}`}
                value={grantJson}
                onChange={(e) => setGrantJson(e.target.value)}
                minRows={5}
                maxRows={10}
                description="JSON object with permission parameters"
                classNames={{
                  input: "font-mono text-sm",
                }}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Status and Results */}
      {(batchStatus || batchError || batchResult) && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <h4 className="font-semibold">Operation Status</h4>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              {/* Status Message */}
              {batchStatus && (
                <StatusMessage
                  status={batchStatus}
                  type={
                    batchStatus.includes("✅")
                      ? "success"
                      : batchStatus.includes("❌")
                        ? "error"
                        : "info"
                  }
                />
              )}

              {/* Error Display */}
              {batchError && (
                <div className="p-3 bg-danger/10 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="h-4 w-4 text-danger" />
                    <span className="text-sm font-medium text-danger">
                      Batch Operation Failed
                    </span>
                  </div>
                  <div className="text-xs text-danger">{batchError}</div>
                </div>
              )}

              {/* Success Result */}
              {batchResult && (
                <div className="p-3 bg-success/10 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium text-success">
                      Batch Operation Completed
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="font-medium">Server:</span>
                      <Chip
                        size="sm"
                        color="success"
                        variant="flat"
                        className="ml-1"
                      >
                        {batchResult.serverRegistered ? "Registered" : "Failed"}
                      </Chip>
                    </div>
                    <div>
                      <span className="font-medium">Files Added:</span>
                      <Chip
                        size="sm"
                        color="primary"
                        variant="flat"
                        className="ml-1"
                      >
                        {batchResult.filesAdded}
                      </Chip>
                    </div>
                    <div>
                      <span className="font-medium">Permissions:</span>
                      <Chip
                        size="sm"
                        color="secondary"
                        variant="flat"
                        className="ml-1"
                      >
                        {batchResult.permissionsGranted}
                      </Chip>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <span className="font-medium">Tx Hash:</span>
                      <div className="font-mono text-xs mt-1 p-1 bg-default-100 rounded">
                        {batchResult.transactionHash.slice(0, 10)}...
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Progress indicator */}
              {isBatchProcessing && (
                <Progress
                  size="sm"
                  isIndeterminate
                  aria-label="Processing batch operation"
                  className="max-w-md"
                />
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Execute Button */}
      <Card>
        <CardBody>
          <Button
            onPress={handleBatchOperation}
            isLoading={isBatchProcessing}
            color="primary"
            size="lg"
            className="w-full"
            isDisabled={
              !serverAddress || !serverUrl || !serverPublicKey || !fileUrls
            }
            startContent={
              !isBatchProcessing ? <Upload className="h-4 w-4" /> : undefined
            }
          >
            {isBatchProcessing
              ? "Processing Batch Operation..."
              : "Execute Batch Operation"}
          </Button>
        </CardBody>
      </Card>

      {/* Code Example */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h4 className="font-semibold">Code Example</h4>
          </div>
        </CardHeader>
        <CardBody>
          <CodeDisplay
            language="typescript"
            code={`// Example of using the new batch operation method
const batchParams = {
  granteeId: BigInt(1), // Server/application grantee ID
  grant: JSON.stringify(grantData), // Permission parameters
  fileUrls: [
    "ipfs://QmExampleHash1",
    "ipfs://QmExampleHash2", 
    "ipfs://QmExampleHash3"
  ],
  serverAddress: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
  serverUrl: "https://api.example.com",
  serverPublicKey: "0x04a7b5d5b7c8...",
  filePermissions: urls.map(() => [{
    account: serverAddress,
    key: serverPublicKey,
    operation: "llm_inference",
    parameters: grantData,
  }])
};

// Submit the batch operation
const transactionHash = await vana.permissions.submitAddServerFilesAndPermissions(batchParams);

console.log("Batch operation completed:", transactionHash);`}
          />
        </CardBody>
      </Card>
    </div>
  );
};
