"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useChainId } from "wagmi";
import { Card, CardBody, Tabs, Tab, type SortDescriptor } from "@heroui/react";
import { Shield, Users, FileText, Key } from "lucide-react";
import type {
  Schema,
  GrantPermissionParams,
} from "@opendatalabs/vana-sdk/browser";
import { DataUploadForm } from "@/components/ui/DataUploadForm";
import { GrantPermissionModal } from "@/components/ui/GrantPermissionModal";
import { useUserFiles } from "@/hooks/useUserFiles";
import { usePermissions } from "@/hooks/usePermissions";
import { useTrustedServers } from "@/hooks/useTrustedServers";
import { useGrantees } from "@/hooks/useGrantees";
import { useVana } from "@/providers/VanaProvider";
import { FilesTab } from "./components/FilesTab";
import { PermissionsTab } from "./components/PermissionsTab";
import { ServersTab } from "./components/ServersTab";
import { GranteesTab } from "./components/GranteesTab";
import { ContractCallsTab } from "@/components/ui/ContractCallsTab";

/**
 * My Data page - User's personal data control panel
 *
 * This page serves as the user's personal control panel for their data on Vana.
 * It allows users to view their data files, manage permissions, and understand
 * which applications have access to their data.
 */
export default function MyDataPage() {
  const chainId = useChainId();
  const { vana, applicationAddress: contextApplicationAddress } = useVana();

  // Local state for prompt text
  const [promptText] = useState<string>(
    "Create a comprehensive Digital DNA profile from this data that captures the essence of this person's digital footprint: {{data}}",
  );

  // Get application address from context
  const applicationAddress = contextApplicationAddress;

  // Upload data state
  const [uploadInputMode, setUploadInputMode] = useState<"text" | "file">(
    "text",
  );
  const [uploadTextData, setUploadTextData] = useState<string>("");
  const [uploadSelectedFile, setUploadSelectedFile] = useState<File | null>(
    null,
  );
  const [uploadSelectedSchemaId, setUploadSelectedSchemaId] = useState<
    number | null
  >(null);
  const [isUploadingData, setIsUploadingData] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    fileId: number;
    transactionHash: string;
    isValid?: boolean;
    validationErrors?: string[];
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Component state
  const [activeTab, setActiveTab] = useState("files");
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);

  // Use the custom hooks
  const {
    userFiles,
    isLoadingFiles,
    selectedFiles,
    decryptingFiles,
    decryptedFiles,
    fileDecryptErrors,
    loadUserFiles: onRefreshFiles,
    handleFileSelection: onFileSelection,
    handleDecryptFile: onDecryptFile,
    handleDownloadDecryptedFile: onDownloadDecryptedFile,
    handleClearFileError: onClearFileError,
    handleLookupFile,
    fileLookupId,
    setFileLookupId: onFileLookupIdChange,
    isLookingUpFile,
    fileLookupStatus,
  } = useUserFiles();

  const {
    userPermissions,
    isLoadingPermissions,
    resolvedPermissions,
    resolvingPermissions,
    resolvePermissionDetails,
    isGranting,
    isRevoking,
    permissionLookupId,
    setPermissionLookupId: onPermissionLookupIdChange,
    isLookingUpPermission,
    permissionLookupStatus,
    lookedUpPermission,
    loadUserPermissions: onRefreshPermissions,
    handleGrantPermission,
    handleRevokePermissionById: onRevokePermission,
    handleLookupPermission,
  } = usePermissions();

  const {
    trustedServers: rawTrustedServers,
    isLoadingTrustedServers: isLoadingServers,
    isTrustingServer,
    isUntrusting,
    isDiscoveringServer,
    trustServerError,
    serverAddress,
    serverUrl,
    loadUserTrustedServers,
    handleTrustServerGasless,
    handleUntrustServer,
    handleDiscoverHostedServer: onDiscoverReplicateServer,
    setServerAddress: onServerAddressChange,
    setServerUrl: onServerUrlChange,
    publicKey,
    setPublicKey: onPublicKeyChange,
  } = useTrustedServers();

  const {
    grantees,
    isLoadingGrantees,
    isAddingGrantee,
    isRemoving,
    addGranteeError,
    ownerAddress,
    granteeAddress,
    loadGrantees,
    handleAddGranteeGasless,
    handleRemoveGrantee,
    setOwnerAddress,
    setGranteeAddress,
    granteePublicKey,
    setGranteePublicKey,
  } = useGrantees();

  // Map trusted servers to the expected interface format
  const trustedServers = useMemo(
    () =>
      rawTrustedServers.map((server) => ({
        id: parseInt(server.id.split("-")[1] || server.id, 10), // Extract server ID from composite ID
        owner: server.user || "", // Use user field as owner
        url: server.serverUrl,
        serverAddress: server.serverAddress,
        publicKey: "", // TODO: Fetch from server info
        name: server.name ?? server.serverAddress,
      })),
    [rawTrustedServers],
  );

  // Wrapper to convert number serverId to string for handleUntrustServer
  const onUntrustServer = useCallback(
    (serverId: number) => {
      void handleUntrustServer(serverId.toString());
    },
    [handleUntrustServer],
  );

  // Upload data handler
  const handleUploadData = async (data: {
    content: string;
    filename?: string;
    schemaId?: number;
    isValid?: boolean;
    validationErrors?: string[];
  }) => {
    if (!vana) {
      setUploadError("Vana SDK not initialized");
      return;
    }

    setIsUploadingData(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      // Create blob from content
      const blob = new Blob([data.content], { type: "text/plain" });

      // Use the SDK's upload method - it handles encryption, storage, and blockchain registration
      const result = await vana.data.upload({
        content: blob,
        filename: data.filename ?? "uploaded-data.txt",
        schemaId: data.schemaId,
        encrypt: true, // Always encrypt user data
      });

      console.log("🟡 [MyDataPage] Upload result:", result);

      // Set the real result from blockchain
      setUploadResult({
        fileId: result.fileId,
        transactionHash: result.transactionHash,
        isValid: result.isValid,
        validationErrors: result.validationErrors,
      });

      // Refresh files list to show the new file
      setTimeout(() => {
        void onRefreshFiles();
      }, 2000); // Wait a bit for blockchain to propagate
    } catch (error) {
      console.error("Upload failed:", error);
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploadingData(false);
    }
  };

  // Create wrapper functions
  const onLookupFile = useCallback(() => {
    void handleLookupFile(fileLookupId);
  }, [handleLookupFile, fileLookupId]);

  const onLookupPermission = useCallback(() => {
    void handleLookupPermission();
  }, [handleLookupPermission]);

  const onGrantPermission = useCallback(
    (customParams?: GrantPermissionParams & { expiresAt?: number }) => {
      void handleGrantPermission(selectedFiles, promptText, customParams);
    },
    [handleGrantPermission, selectedFiles, promptText],
  );

  const onTrustServer = useCallback(() => {
    void handleTrustServerGasless(false, serverAddress, serverUrl, publicKey);
  }, [handleTrustServerGasless, serverAddress, serverUrl, publicKey]);

  const onRefreshServers = useCallback(() => {
    void loadUserTrustedServers();
  }, [loadUserTrustedServers]);

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

  // Schema state for files
  const [fileSchemas, setFileSchemas] = useState<Map<number, Schema>>(
    new Map(),
  );

  // Fetch schema information for files that have schema IDs
  useEffect(() => {
    const fetchSchemas = async () => {
      if (!vana) return;

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

    if (userFiles.length > 0 && vana) {
      void fetchSchemas();
    }
  }, [userFiles, vana, fileSchemas]);

  const filesTotalPages = Math.ceil(userFiles.length / FILES_PER_PAGE);
  const permissionsTotalPages = Math.ceil(
    userPermissions.length / PERMISSIONS_PER_PAGE,
  );

  // Reset to first page when data changes
  useEffect(() => {
    setFilesCurrentPage(1);
  }, [userFiles.length]);

  useEffect(() => {
    setPermissionsCurrentPage(1);
  }, [userPermissions.length]);

  // Renders the upload data tab content
  const renderUploadDataTab = () => (
    <div className="space-y-6">
      {vana ? (
        <DataUploadForm
          vana={vana}
          inputMode={uploadInputMode}
          onInputModeChange={setUploadInputMode}
          textData={uploadTextData}
          onTextDataChange={setUploadTextData}
          selectedFile={uploadSelectedFile}
          onFileSelect={setUploadSelectedFile}
          selectedSchemaId={uploadSelectedSchemaId}
          onSchemaChange={setUploadSelectedSchemaId}
          onUpload={handleUploadData}
          isUploading={isUploadingData}
          uploadResult={uploadResult}
          uploadError={uploadError}
          chainId={chainId || 14800}
          showSchemaSelector={true}
          showValidation={true}
          allowWithoutSchema={true}
          title="Upload Your Data"
          description="Upload text or file data to the Vana network with optional schema validation"
        />
      ) : (
        <div className="text-center p-8">
          <p>Loading Vana SDK...</p>
        </div>
      )}
    </div>
  );

  // Layout handles wallet connection and VanaProvider initialization

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">My Data</h1>
        <p className="text-lg text-default-600">
          Your personal data control panel for the Vana network
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
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
              <span className="text-2xl font-bold">
                {trustedServers.length}
              </span>
            </div>
            <p className="text-sm text-default-500">Trusted Servers</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Users className="h-5 w-5 text-secondary" />
              <span className="text-2xl font-bold">{grantees.length}</span>
            </div>
            <p className="text-sm text-default-500">Grantees</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Key className="h-5 w-5 text-info" />
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
        onSelectionChange={(key) => {
          setActiveTab(key as string);
        }}
        className="w-full"
      >
        <Tab key="files" title="Data Files">
          <FilesTab
            userFiles={userFiles}
            isLoadingFiles={isLoadingFiles}
            selectedFiles={selectedFiles}
            decryptingFiles={decryptingFiles}
            decryptedFiles={decryptedFiles}
            fileDecryptErrors={fileDecryptErrors}
            fileLookupId={fileLookupId}
            isLookingUpFile={isLookingUpFile}
            fileLookupStatus={fileLookupStatus}
            fileSchemas={fileSchemas}
            filesCurrentPage={filesCurrentPage}
            filesSortDescriptor={filesSortDescriptor}
            filesTotalPages={filesTotalPages}
            FILES_PER_PAGE={FILES_PER_PAGE}
            chainId={chainId || 14800}
            applicationAddress={applicationAddress || ""}
            isGranting={isGranting}
            onRefreshFiles={onRefreshFiles}
            onFileSelection={onFileSelection}
            onDecryptFile={onDecryptFile}
            onDownloadDecryptedFile={onDownloadDecryptedFile}
            onClearFileError={onClearFileError}
            onFileLookupIdChange={onFileLookupIdChange}
            onLookupFile={onLookupFile}
            setFilesCurrentPage={setFilesCurrentPage}
            setFilesSortDescriptor={setFilesSortDescriptor}
            setIsGrantModalOpen={setIsGrantModalOpen}
          />
        </Tab>
        <Tab key="upload" title="Upload Data">
          {renderUploadDataTab()}
        </Tab>
        <Tab key="permissions" title="Permissions">
          <PermissionsTab
            userPermissions={userPermissions}
            isLoadingPermissions={isLoadingPermissions}
            resolvedPermissions={resolvedPermissions}
            resolvingPermissions={resolvingPermissions}
            onResolvePermissionDetails={resolvePermissionDetails}
            isRevoking={isRevoking}
            permissionLookupId={permissionLookupId}
            isLookingUpPermission={isLookingUpPermission}
            permissionLookupStatus={permissionLookupStatus}
            lookedUpPermission={lookedUpPermission}
            permissionsCurrentPage={permissionsCurrentPage}
            permissionsSortDescriptor={permissionsSortDescriptor}
            permissionsTotalPages={permissionsTotalPages}
            PERMISSIONS_PER_PAGE={PERMISSIONS_PER_PAGE}
            chainId={chainId || 14800}
            onRefreshPermissions={onRefreshPermissions}
            onPermissionLookupIdChange={onPermissionLookupIdChange}
            onLookupPermission={onLookupPermission}
            onRevokePermission={onRevokePermission}
            setPermissionsCurrentPage={setPermissionsCurrentPage}
            setPermissionsSortDescriptor={setPermissionsSortDescriptor}
          />
        </Tab>
        <Tab key="servers" title="Trusted Servers">
          <ServersTab
            trustedServers={trustedServers}
            isLoadingServers={isLoadingServers}
            isTrustingServer={isTrustingServer}
            isUntrusting={isUntrusting}
            isDiscoveringServer={isDiscoveringServer}
            trustServerError={trustServerError}
            serverAddress={serverAddress}
            serverUrl={serverUrl}
            publicKey={publicKey}
            onServerAddressChange={onServerAddressChange}
            onServerUrlChange={onServerUrlChange}
            onPublicKeyChange={onPublicKeyChange}
            onTrustServer={onTrustServer}
            onRefreshServers={onRefreshServers}
            onUntrustServer={onUntrustServer}
            onDiscoverReplicateServer={onDiscoverReplicateServer}
          />
        </Tab>
        <Tab key="grantees" title="Grantees">
          <GranteesTab
            grantees={grantees}
            isLoadingGrantees={isLoadingGrantees}
            isAddingGrantee={isAddingGrantee}
            isRemoving={isRemoving}
            addGranteeError={addGranteeError}
            ownerAddress={ownerAddress}
            granteeAddress={granteeAddress}
            granteePublicKey={granteePublicKey}
            onOwnerAddressChange={setOwnerAddress}
            onGranteeAddressChange={setGranteeAddress}
            onGranteePublicKeyChange={setGranteePublicKey}
            onAddGrantee={handleAddGranteeGasless}
            onRefreshGrantees={loadGrantees}
            onRemoveGrantee={handleRemoveGrantee}
          />
        </Tab>
        <Tab key="contract-calls" title="Contract Calls">
          {vana && <ContractCallsTab vana={vana} chainId={chainId || 14800} />}
        </Tab>
      </Tabs>

      {/* Grant Permission Modal */}
      <GrantPermissionModal
        isOpen={isGrantModalOpen}
        onClose={() => {
          setIsGrantModalOpen(false);
        }}
        onConfirm={(params) => {
          console.debug(
            "🟡 [MyDataPage] GrantPermissionModal onConfirm called with params:",
            params,
          );
          console.debug("🟡 [MyDataPage] Setting modal closed");
          setIsGrantModalOpen(false);
          console.debug(
            "🟡 [MyDataPage] Calling onGrantPermission with params",
          );
          try {
            onGrantPermission(params);
            console.debug(
              "🟡 [MyDataPage] onGrantPermission called successfully",
            );
          } catch (error) {
            console.error("🟡 [MyDataPage] onGrantPermission failed:", error);
          }
        }}
        selectedFiles={selectedFiles}
        grantees={grantees}
        isGranting={isGranting}
      />
    </div>
  );
}
