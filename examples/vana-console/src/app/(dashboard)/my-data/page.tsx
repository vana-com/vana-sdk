"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useChainId } from "wagmi";
import { Tabs, Tab, type SortDescriptor } from "@heroui/react";
import type {
  Schema,
  GrantPermissionParams,
} from "@opendatalabs/vana-sdk/browser";
import { GrantPermissionModal } from "@/components/ui/GrantPermissionModal";
import { useUserFiles } from "@/hooks/useUserFiles";
import { usePermissions } from "@/hooks/usePermissions";
import { useGrantees } from "@/hooks/useGrantees";
import { useVana } from "@/providers/VanaProvider";
import { useSDKConfig } from "@/providers/SDKConfigProvider";
import { FilesTab } from "./components/FilesTab";
import { PermissionsTab } from "./components/PermissionsTab";

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
  const { appConfig } = useSDKConfig();
  const isReadOnly = appConfig.enableReadOnlyMode;

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

  const { grantees, loadGrantees } = useGrantees();

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

      // Immediately refresh with consistency guarantee
      // The new file will appear without delay
      void onRefreshFiles(true);
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

  const handleOpenGrantModal = useCallback(() => {
    void loadGrantees();
    setIsGrantModalOpen(true);
  }, [loadGrantees]);

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

  useEffect(() => {
    if (vana) {
      if (activeTab === "files") {
        void onRefreshFiles();
      } else if (activeTab === "permissions") {
        void onRefreshPermissions();
      }
    }
  }, [activeTab, vana, onRefreshFiles, onRefreshPermissions]);

  // Layout handles wallet connection and VanaProvider initialization

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">My Data</h1>
        <p className="text-lg text-default-600">
          Manage your data and permissions
        </p>
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
            isReadOnly={isReadOnly}
            onRefreshFiles={onRefreshFiles}
            onFileSelection={onFileSelection}
            onDecryptFile={onDecryptFile}
            onDownloadDecryptedFile={onDownloadDecryptedFile}
            onClearFileError={onClearFileError}
            onFileLookupIdChange={onFileLookupIdChange}
            onLookupFile={onLookupFile}
            setFilesCurrentPage={setFilesCurrentPage}
            setFilesSortDescriptor={setFilesSortDescriptor}
            setIsGrantModalOpen={handleOpenGrantModal}
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
          />
        </Tab>
        <Tab key="permissions" title="Permissions">
          <PermissionsTab
            userPermissions={userPermissions}
            isLoadingPermissions={isLoadingPermissions}
            resolvedPermissions={resolvedPermissions}
            resolvingPermissions={resolvingPermissions}
            onResolvePermissionDetails={resolvePermissionDetails}
            isRevoking={isRevoking}
            isReadOnly={isReadOnly}
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
