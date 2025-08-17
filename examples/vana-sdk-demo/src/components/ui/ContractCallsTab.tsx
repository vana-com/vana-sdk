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
  Divider,
  Progress,
} from "@heroui/react";
import {
  FileText,
  Server,
  Users,
  Lock,
  Database,
  UserPlus,
  AlertCircle,
} from "lucide-react";
import type { VanaInstance } from "@opendatalabs/vana-sdk/browser-wasm";
import type { Address } from "viem";
import { CodeDisplay } from "./CodeDisplay";
import { StatusMessage } from "./StatusMessage";

export interface ContractCallsTabProps {
  /** Vana SDK instance */
  vana: VanaInstance;
  /** Chain ID for display */
  chainId: number;
  /** Configuration */
  className?: string;
}

/**
 * ContractCallsTab component - Direct contract interaction forms
 *
 * This component provides forms for direct contract calls including:
 * - Permissions: addPermission, addServerFilesAndPermissions
 * - Servers: addAndTrustServerWithSignature
 * - Grantees: registerGrantee
 */
export const ContractCallsTab: React.FC<ContractCallsTabProps> = ({
  vana,
  chainId: _chainId,
  className = "",
}) => {
  // Permissions state
  const [permissionGranteeId, setPermissionGranteeId] = useState<string>("");
  const [permissionGrant, setPermissionGrant] = useState<string>("");
  const [permissionFileIds, setPermissionFileIds] = useState<string[]>([""]);
  const [isAddingPermission, setIsAddingPermission] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string>("");
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Server Files and Permissions state
  const [serverGranteeId, setServerGranteeId] = useState<string>("");
  const [serverGrant, setServerGrant] = useState<string>("");
  const [serverFileUrls, setServerFileUrls] = useState<string[]>([""]);
  const [serverAddress, setServerAddress] = useState<string>("");
  const [serverUrl, setServerUrl] = useState<string>("");
  const [serverPublicKey, setServerPublicKey] = useState<string>("");
  const [filePermissions, setFilePermissions] = useState<
    Array<Array<{ account: Address; key: string }>>
  >([[]]);
  const [isAddingServerFiles, setIsAddingServerFiles] = useState(false);
  const [serverFilesStatus, setServerFilesStatus] = useState<string>("");
  const [serverFilesError, setServerFilesError] = useState<string | null>(null);

  // Server state
  const [trustServerAddress, setTrustServerAddress] = useState<string>("");
  const [trustServerUrl, setTrustServerUrl] = useState<string>("");
  const [trustServerPublicKey, setTrustServerPublicKey] = useState<string>("");
  const [isTrustingServer, setIsTrustingServer] = useState(false);
  const [trustServerStatus, setTrustServerStatus] = useState<string>("");
  const [trustServerError, setTrustServerError] = useState<string | null>(null);

  // Grantee state
  const [granteeOwnerAddress, setGranteeOwnerAddress] = useState<string>("");
  const [granteeAddress, setGranteeAddress] = useState<string>("");
  const [granteePublicKey, setGranteePublicKey] = useState<string>("");
  const [isRegisteringGrantee, setIsRegisteringGrantee] = useState(false);
  const [granteeStatus, setGranteeStatus] = useState<string>("");
  const [granteeError, setGranteeError] = useState<string | null>(null);

  /**
   * Handles adding a permission
   */
  const handleAddPermission = async () => {
    if (
      !permissionGranteeId.trim() ||
      !permissionGrant.trim() ||
      permissionFileIds.some((id) => !id.trim())
    ) {
      setPermissionError("Please fill in all required fields");
      return;
    }

    setIsAddingPermission(true);
    setPermissionStatus("Preparing permission transaction...");
    setPermissionError(null);

    try {
      // Validate file IDs are numeric
      const validFileIds = permissionFileIds.filter(
        (id) => id.trim().length > 0,
      );

      if (validFileIds.length === 0) {
        throw new Error("Please provide at least one file ID");
      }

      for (const fileId of validFileIds) {
        if (isNaN(Number(fileId))) {
          throw new Error(
            `Invalid file ID: ${fileId}. File IDs must be numeric.`,
          );
        }
      }

      setPermissionStatus("Signing transaction...");

      // Resolve grantee ID to grantee address
      const grantee = await vana.permissions.getGranteeById(
        parseInt(permissionGranteeId),
      );
      if (!grantee) {
        throw new Error(`Grantee with ID ${permissionGranteeId} not found`);
      }

      // Use the proper Permission method with GrantPermissionParams
      const grantResult = await vana.permissions.grant({
        grantee: grantee.address, // Resolved grantee address from ID
        operation: "data_access", // Default operation type
        files: validFileIds.map((id) => parseInt(id)), // File IDs as numbers
        parameters: {}, // Empty parameters for simple permission
        grantUrl: permissionGrant, // Grant URL can be any string
      });

      const transactionHash = grantResult.transactionHash;

      setPermissionStatus(
        `✅ Permission added successfully! Transaction: ${transactionHash}`,
      );

      // Clear form on success
      setPermissionGranteeId("");
      setPermissionGrant("");
      setPermissionFileIds([""]);

      console.info("Permission added:", transactionHash);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to add permission";
      setPermissionError(errorMessage);
      setPermissionStatus("❌ Failed to add permission");
    } finally {
      setIsAddingPermission(false);
    }
  };

  /**
   * Handles adding server files and permissions
   */
  const handleAddServerFilesAndPermissions = async () => {
    if (
      !serverGranteeId.trim() ||
      !serverGrant.trim() ||
      serverFileUrls.some((url) => !url.trim()) ||
      !serverAddress.trim() ||
      !serverUrl.trim() ||
      !serverPublicKey.trim()
    ) {
      setServerFilesError("Please fill in all required fields");
      return;
    }

    setIsAddingServerFiles(true);
    setServerFilesStatus("Preparing batch transaction...");
    setServerFilesError(null);

    try {
      const validUrls = serverFileUrls.filter((url) => url.trim().length > 0);

      if (validUrls.length === 0) {
        throw new Error("Please provide at least one file URL");
      }

      setServerFilesStatus("Signing transaction...");

      const batchParams = {
        // nonce is handled internally by the SDK
        granteeId: BigInt(serverGranteeId),
        grant: serverGrant,
        fileUrls: validUrls,
        schemaIds: validUrls.map(() => 0), // No schema validation for demo
        serverAddress: serverAddress as Address,
        serverUrl: serverUrl,
        serverPublicKey: serverPublicKey,
        filePermissions: filePermissions,
      };

      const transactionHash =
        await vana.permissions.submitAddServerFilesAndPermissions(batchParams);

      setServerFilesStatus(
        `✅ Server files and permissions added successfully! Transaction: ${transactionHash}`,
      );

      // Clear form on success
      setServerGranteeId("");
      setServerGrant("");
      setServerFileUrls([""]);
      setServerAddress("");
      setServerUrl("");
      setServerPublicKey("");
      setFilePermissions([[]]);

      console.info("Server files and permissions added:", transactionHash);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to add server files and permissions";
      setServerFilesError(errorMessage);
      setServerFilesStatus("❌ Failed to add server files and permissions");
    } finally {
      setIsAddingServerFiles(false);
    }
  };

  /**
   * Handles trusting a server with signature
   */
  const handleTrustServer = async () => {
    if (
      !trustServerAddress.trim() ||
      !trustServerUrl.trim() ||
      !trustServerPublicKey.trim()
    ) {
      setTrustServerError("Please fill in all required fields");
      return;
    }

    setIsTrustingServer(true);
    setTrustServerStatus("Preparing server trust transaction...");
    setTrustServerError(null);

    try {
      setTrustServerStatus("Signing transaction...");

      const transactionHash =
        await vana.permissions.submitAddAndTrustServerWithSignature({
          serverAddress: trustServerAddress as Address,
          serverUrl: trustServerUrl,
          publicKey: trustServerPublicKey,
        });

      setTrustServerStatus("✅ Server added and trusted successfully!");

      // Clear form on success
      setTrustServerAddress("");
      setTrustServerUrl("");
      setTrustServerPublicKey("");

      console.info("Server trusted:", transactionHash);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to add and trust server";
      setTrustServerError(errorMessage);
      setTrustServerStatus("❌ Failed to add and trust server");
    } finally {
      setIsTrustingServer(false);
    }
  };

  /**
   * Handles registering a grantee
   */
  const handleRegisterGrantee = async () => {
    if (
      !granteeOwnerAddress.trim() ||
      !granteeAddress.trim() ||
      !granteePublicKey.trim()
    ) {
      setGranteeError("Please fill in all required fields");
      return;
    }

    setIsRegisteringGrantee(true);
    setGranteeStatus("Preparing grantee registration...");
    setGranteeError(null);

    try {
      setGranteeStatus("Signing transaction...");

      const transactionHash =
        await vana.permissions.submitRegisterGranteeWithSignature({
          owner: granteeOwnerAddress as Address,
          granteeAddress: granteeAddress as Address,
          publicKey: granteePublicKey,
        });

      setGranteeStatus("✅ Grantee registered successfully!");

      // Clear form on success
      setGranteeOwnerAddress("");
      setGranteeAddress("");
      setGranteePublicKey("");

      console.info("Grantee registered:", transactionHash);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to register grantee";
      setGranteeError(errorMessage);
      setGranteeStatus("❌ Failed to register grantee");
    } finally {
      setIsRegisteringGrantee(false);
    }
  };

  /**
   * Renders the Permissions section
   */
  const renderPermissionsSection = () => (
    <div className="space-y-6">
      {/* Add Permission */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <div>
              <h4 className="font-semibold">Add Permission</h4>
              <p className="text-sm text-default-600">
                Grant permission for a specific file to a grantee
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <div className="space-y-4">
              <Input
                label="Grantee ID"
                placeholder="1"
                value={permissionGranteeId}
                onChange={(e) => setPermissionGranteeId(e.target.value)}
                description="The ID of the grantee to grant permission to"
                isRequired
              />

              {/* File IDs Section */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h5 className="text-sm font-medium">File IDs</h5>
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() =>
                      setPermissionFileIds([...permissionFileIds, ""])
                    }
                  >
                    Add File ID
                  </Button>
                </div>
                {permissionFileIds.map((fileId, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="123"
                      value={fileId}
                      onChange={(e) => {
                        const newIds = [...permissionFileIds];
                        newIds[index] = e.target.value;
                        setPermissionFileIds(newIds);
                      }}
                      description={`File ID ${index + 1} (numeric)`}
                      isRequired
                    />
                    {permissionFileIds.length > 1 && (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="flat"
                        color="danger"
                        onPress={() => {
                          const newIds = permissionFileIds.filter(
                            (_, i) => i !== index,
                          );
                          setPermissionFileIds(newIds);
                        }}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <Textarea
              label="Grant URL"
              placeholder="https://example.com/grant or any string value"
              value={permissionGrant}
              onChange={(e) => setPermissionGrant(e.target.value)}
              minRows={2}
              description="Grant parameters (can be any string)"
              isRequired
            />
            <Button
              onPress={handleAddPermission}
              isLoading={isAddingPermission}
              color="primary"
              isDisabled={
                !permissionGranteeId ||
                !permissionGrant ||
                permissionFileIds.some((id) => !id.trim())
              }
              startContent={
                !isAddingPermission ? <Lock className="h-4 w-4" /> : undefined
              }
            >
              {isAddingPermission ? "Adding Permission..." : "Add Permission"}
            </Button>

            {/* Status */}
            {(permissionStatus || permissionError) && (
              <div className="space-y-2">
                {permissionStatus && (
                  <StatusMessage
                    status={permissionStatus}
                    type={
                      permissionStatus.includes("✅")
                        ? "success"
                        : permissionStatus.includes("❌")
                          ? "error"
                          : "info"
                    }
                  />
                )}
                {permissionError && (
                  <div className="p-3 bg-danger/10 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="h-4 w-4 text-danger" />
                      <span className="text-sm font-medium text-danger">
                        Error
                      </span>
                    </div>
                    <div className="text-xs text-danger">{permissionError}</div>
                  </div>
                )}
                {isAddingPermission && (
                  <Progress
                    size="sm"
                    isIndeterminate
                    aria-label="Adding permission"
                  />
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Add Server Files and Permissions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <div>
              <h4 className="font-semibold">
                Add Server Files and Permissions
              </h4>
              <p className="text-sm text-default-600">
                Batch operation to add server, files, and permissions in one
                transaction
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Grantee ID"
                placeholder="1"
                value={serverGranteeId}
                onChange={(e) => setServerGranteeId(e.target.value)}
                description="The ID of the grantee"
                isRequired
              />
              <Input
                label="Grant URL"
                placeholder="https://example.com/grant or any string value"
                value={serverGrant}
                onChange={(e) => setServerGrant(e.target.value)}
                description="Grant parameters (can be any string)"
                isRequired
              />
            </div>

            {/* Server Info */}
            <Divider />
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

            {/* Files Section */}
            <Divider />
            <div className="flex justify-between items-center">
              <h5 className="text-sm font-medium">File URLs</h5>
              <Button
                size="sm"
                variant="flat"
                onPress={() => setServerFileUrls([...serverFileUrls, ""])}
              >
                Add File
              </Button>
            </div>
            {serverFileUrls.map((url, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="ipfs://QmExampleHash..."
                  value={url}
                  onChange={(e) => {
                    const newUrls = [...serverFileUrls];
                    newUrls[index] = e.target.value;
                    setServerFileUrls(newUrls);
                  }}
                  description={`File URL ${index + 1}`}
                  isRequired
                />
                {serverFileUrls.length > 1 && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="flat"
                    color="danger"
                    onPress={() => {
                      const newUrls = serverFileUrls.filter(
                        (_, i) => i !== index,
                      );
                      setServerFileUrls(newUrls);
                      const newPerms = filePermissions.filter(
                        (_, i) => i !== index,
                      );
                      setFilePermissions(newPerms);
                    }}
                  >
                    ×
                  </Button>
                )}
              </div>
            ))}

            {/* File Permissions Section */}
            <Divider />
            <h5 className="text-sm font-medium">File Permissions</h5>
            <p className="text-xs text-default-500 mb-2">
              Define permissions for each file. Each file can have multiple
              permission entries.
            </p>
            {serverFileUrls.map((_, fileIndex) => (
              <Card key={fileIndex} className="p-3">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h6 className="text-sm font-medium">
                      File {fileIndex + 1} Permissions
                    </h6>
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => {
                        const newPerms = [...filePermissions];
                        if (!newPerms[fileIndex]) newPerms[fileIndex] = [];
                        newPerms[fileIndex].push({
                          account: "" as Address,
                          key: "",
                        });
                        setFilePermissions(newPerms);
                      }}
                    >
                      Add Permission
                    </Button>
                  </div>
                  {(filePermissions[fileIndex] || []).map((perm, permIndex) => (
                    <div
                      key={permIndex}
                      className="grid grid-cols-1 md:grid-cols-2 gap-2"
                    >
                      <Input
                        size="sm"
                        placeholder="0x... (account address)"
                        value={perm.account}
                        onChange={(e) => {
                          const newPerms = [...filePermissions];
                          if (!newPerms[fileIndex]) newPerms[fileIndex] = [];
                          newPerms[fileIndex][permIndex] = {
                            ...newPerms[fileIndex][permIndex],
                            account: e.target.value as Address,
                          };
                          setFilePermissions(newPerms);
                        }}
                        description="Account address"
                      />
                      <div className="flex gap-2">
                        <Input
                          size="sm"
                          placeholder="Public key"
                          value={perm.key}
                          onChange={(e) => {
                            const newPerms = [...filePermissions];
                            if (!newPerms[fileIndex]) newPerms[fileIndex] = [];
                            newPerms[fileIndex][permIndex] = {
                              ...newPerms[fileIndex][permIndex],
                              key: e.target.value,
                            };
                            setFilePermissions(newPerms);
                          }}
                          description="Public key"
                        />
                        {filePermissions[fileIndex]?.length > 0 && (
                          <Button
                            isIconOnly
                            size="sm"
                            variant="flat"
                            color="danger"
                            onPress={() => {
                              const newPerms = [...filePermissions];
                              newPerms[fileIndex] = newPerms[fileIndex].filter(
                                (_, i) => i !== permIndex,
                              );
                              setFilePermissions(newPerms);
                            }}
                          >
                            ×
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}

            <Button
              onPress={handleAddServerFilesAndPermissions}
              isLoading={isAddingServerFiles}
              color="primary"
              isDisabled={
                !serverGranteeId ||
                !serverGrant ||
                serverFileUrls.some((url) => !url) ||
                !serverAddress ||
                !serverUrl ||
                !serverPublicKey
              }
              startContent={
                !isAddingServerFiles ? (
                  <Database className="h-4 w-4" />
                ) : undefined
              }
            >
              {isAddingServerFiles
                ? "Adding Server Files and Permissions..."
                : "Add Server Files and Permissions"}
            </Button>

            {/* Status */}
            {(serverFilesStatus || serverFilesError) && (
              <div className="space-y-2">
                {serverFilesStatus && (
                  <StatusMessage
                    status={serverFilesStatus}
                    type={
                      serverFilesStatus.includes("✅")
                        ? "success"
                        : serverFilesStatus.includes("❌")
                          ? "error"
                          : "info"
                    }
                  />
                )}
                {serverFilesError && (
                  <div className="p-3 bg-danger/10 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="h-4 w-4 text-danger" />
                      <span className="text-sm font-medium text-danger">
                        Error
                      </span>
                    </div>
                    <div className="text-xs text-danger">
                      {serverFilesError}
                    </div>
                  </div>
                )}
                {isAddingServerFiles && (
                  <Progress
                    size="sm"
                    isIndeterminate
                    aria-label="Adding server files and permissions"
                  />
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Code Examples */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h4 className="font-semibold">Code Examples</h4>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <div>
              <h5 className="text-sm font-medium mb-2">Add Permission</h5>
              <CodeDisplay
                language="typescript"
                code={`// Add permission using proper Permission method with grantee ID
// First, resolve grantee ID to grantee address
const grantee = await vana.permissions.getGranteeById(1);
if (!grantee) {
  throw new Error('Grantee with ID 1 not found');
}

// Use GrantPermissionParams (proper Permission type)
const grantResult = await vana.permissions.grant({
  grantee: grantee.address,           // resolved grantee address from ID
  operation: "data_access",           // operation type
  files: [123, 456, 789],            // file IDs (array of numbers)
  parameters: {},                     // operation parameters
  grantUrl: "https://example.com/grant" // grant URL (any string)
});

console.log("Permission added:", grantResult.transactionHash);`}
              />
            </div>

            <Divider />

            <div>
              <h5 className="text-sm font-medium mb-2">
                Add Server Files and Permissions
              </h5>
              <CodeDisplay
                language="typescript"
                code={`// Batch operation for server, files, and permissions (via relayer)
const batchParams = {
  // nonce is handled internally by the SDK
  granteeId: BigInt(1),
  grant: "https://example.com/grant", // grant parameters (any string)
  fileUrls: [
    "ipfs://QmExampleHash1",
    "ipfs://QmExampleHash2", 
    "ipfs://QmExampleHash3"
  ],
  serverAddress: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
  serverUrl: "https://api.example.com",
  serverPublicKey: "0x04a7b5d5b7c8...",
  filePermissions: [
    // Permissions for file 1
    [
      { account: "0xabc123...", key: "0x04def456..." },
      { account: "0x789ghi...", key: "0x04jkl012..." }
    ],
    // Permissions for file 2
    [
      { account: "0xabc123...", key: "0x04def456..." }
    ],
    // Permissions for file 3
    [
      { account: "0xabc123...", key: "0x04def456..." }
    ]
  ]
};

const transactionHash = await vana.permissions.submitAddServerFilesAndPermissions(batchParams);

console.log("Batch operation completed:", transactionHash);`}
              />
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );

  /**
   * Renders the Servers section
   */
  const renderServersSection = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            <div>
              <h4 className="font-semibold">
                Add and Trust Server with Signature
              </h4>
              <p className="text-sm text-default-600">
                Register and trust a server with cryptographic signature
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Server Address"
                placeholder="0x742d35Cc..."
                value={trustServerAddress}
                onChange={(e) => setTrustServerAddress(e.target.value)}
                description="The wallet address of the server"
                isRequired
              />
              <Input
                label="Server URL"
                placeholder="https://api.example.com"
                value={trustServerUrl}
                onChange={(e) => setTrustServerUrl(e.target.value)}
                description="The public URL endpoint for the server"
                isRequired
              />
            </div>
            <Input
              label="Server Public Key"
              placeholder="0x04a7b5d5b7c8..."
              value={trustServerPublicKey}
              onChange={(e) => setTrustServerPublicKey(e.target.value)}
              description="The server's public key for encryption"
              isRequired
            />
            <Button
              onPress={handleTrustServer}
              isLoading={isTrustingServer}
              color="primary"
              isDisabled={
                !trustServerAddress || !trustServerUrl || !trustServerPublicKey
              }
              startContent={
                !isTrustingServer ? <Server className="h-4 w-4" /> : undefined
              }
            >
              {isTrustingServer
                ? "Adding and Trusting Server..."
                : "Add and Trust Server"}
            </Button>

            {/* Status */}
            {(trustServerStatus || trustServerError) && (
              <div className="space-y-2">
                {trustServerStatus && (
                  <StatusMessage
                    status={trustServerStatus}
                    type={
                      trustServerStatus.includes("✅")
                        ? "success"
                        : trustServerStatus.includes("❌")
                          ? "error"
                          : "info"
                    }
                  />
                )}
                {trustServerError && (
                  <div className="p-3 bg-danger/10 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="h-4 w-4 text-danger" />
                      <span className="text-sm font-medium text-danger">
                        Error
                      </span>
                    </div>
                    <div className="text-xs text-danger">
                      {trustServerError}
                    </div>
                  </div>
                )}
                {isTrustingServer && (
                  <Progress
                    size="sm"
                    isIndeterminate
                    aria-label="Adding and trusting server"
                  />
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Code Example */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h4 className="font-semibold">Code Example</h4>
          </div>
        </CardHeader>
        <CardBody>
          <CodeDisplay
            language="typescript"
            code={`// Add and trust server with signature (via relayer)
const transactionHash = await vana.permissions.submitAddAndTrustServerWithSignature({
  serverAddress: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
  serverUrl: "https://api.example.com",
  publicKey: "0x04a7b5d5b7c8..."
});

console.log("Server trusted:", transactionHash);`}
          />
        </CardBody>
      </Card>
    </div>
  );

  /**
   * Renders the Grantees section
   */
  const renderGranteesSection = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <h4 className="font-semibold">Register Grantee</h4>
              <p className="text-sm text-default-600">
                Register a new grantee in the permissions system
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Owner Address"
                placeholder="0x..."
                value={granteeOwnerAddress}
                onChange={(e) => setGranteeOwnerAddress(e.target.value)}
                description="The owner address for the grantee"
                isRequired
              />
              <Input
                label="Grantee Address"
                placeholder="0x..."
                value={granteeAddress}
                onChange={(e) => setGranteeAddress(e.target.value)}
                description="The Ethereum address of the grantee"
                isRequired
              />
            </div>
            <Input
              label="Public Key"
              placeholder="0x04a7b5d5b7c8..."
              value={granteePublicKey}
              onChange={(e) => setGranteePublicKey(e.target.value)}
              description="The grantee's public key for encryption"
              isRequired
            />
            <Button
              onPress={handleRegisterGrantee}
              isLoading={isRegisteringGrantee}
              color="primary"
              isDisabled={
                !granteeOwnerAddress || !granteeAddress || !granteePublicKey
              }
              startContent={
                !isRegisteringGrantee ? (
                  <UserPlus className="h-4 w-4" />
                ) : undefined
              }
            >
              {isRegisteringGrantee
                ? "Registering Grantee..."
                : "Register Grantee"}
            </Button>

            {/* Status */}
            {(granteeStatus || granteeError) && (
              <div className="space-y-2">
                {granteeStatus && (
                  <StatusMessage
                    status={granteeStatus}
                    type={
                      granteeStatus.includes("✅")
                        ? "success"
                        : granteeStatus.includes("❌")
                          ? "error"
                          : "info"
                    }
                  />
                )}
                {granteeError && (
                  <div className="p-3 bg-danger/10 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="h-4 w-4 text-danger" />
                      <span className="text-sm font-medium text-danger">
                        Error
                      </span>
                    </div>
                    <div className="text-xs text-danger">{granteeError}</div>
                  </div>
                )}
                {isRegisteringGrantee && (
                  <Progress
                    size="sm"
                    isIndeterminate
                    aria-label="Registering grantee"
                  />
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Code Example */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h4 className="font-semibold">Code Example</h4>
          </div>
        </CardHeader>
        <CardBody>
          <CodeDisplay
            language="typescript"
            code={`// Register a new grantee (via relayer)
const transactionHash = await vana.permissions.submitRegisterGranteeWithSignature({
  ownerAddress: "0x1234567890abcdef...",                    // owner address
  granteeAddress: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36", // grantee address
  publicKey: "0x04a7b5d5b7c8..."                            // public key
});

console.log("Grantee registered:", transactionHash);`}
          />
        </CardBody>
      </Card>
    </div>
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Introduction */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-lg font-semibold">Contract Calls</h3>
              <p className="text-sm text-default-600">
                Direct SDK interaction forms for permissions, servers, and
                grantees management.
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Content */}
      <Tabs aria-label="Contract calls sections" variant="underlined">
        <Tab key="permissions" title="Permissions">
          {renderPermissionsSection()}
        </Tab>
        <Tab key="servers" title="Servers">
          {renderServersSection()}
        </Tab>
        <Tab key="grantees" title="Grantees">
          {renderGranteesSection()}
        </Tab>
      </Tabs>
    </div>
  );
};
