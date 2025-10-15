"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useAccount, useChainId } from "wagmi";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Textarea,
  Select,
  SelectItem,
  Radio,
  RadioGroup,
  Divider,
  ScrollShadow,
} from "@heroui/react";
import {
  Shield,
  FileText,
  Brain,
  Sparkles,
  Server,
  Database,
  CheckCircle,
  AlertCircle,
  Activity,
} from "lucide-react";
import { GrantPermissionModal } from "@/components/ui/GrantPermissionModal";
import { useGrantees } from "@/hooks/useGrantees";
import { useTrustedServers } from "@/hooks/useTrustedServers";
import { useUserFiles, type ExtendedUserFile } from "@/hooks/useUserFiles";
import { usePermissions } from "@/hooks/usePermissions";
import { useVana } from "@/providers/VanaProvider";
import { ExplorerLink } from "@/components/ui/ExplorerLink";

// Component-specific props
type ServerConfigProps = {
  needsToTrustServer: boolean;
  config: SandboxConfig;
  setConfig: React.Dispatch<React.SetStateAction<SandboxConfig>>;
  trustedServers: ReturnType<typeof useTrustedServers>["trustedServers"];
  trustServerError: string | null;
};

type DataSourceProps = {
  config: SandboxConfig;
  setConfig: React.Dispatch<React.SetStateAction<SandboxConfig>>;
  userFiles: ExtendedUserFile[];
  selectedFiles: number[];
  handleFileSelection: (fileId: number, selected: boolean) => void;
  newTextData: string;
  setNewTextData: (text: string) => void;
  uploadResult: { fileId: number } | null;
};

type ActivityLogProps = {
  activityLog: ActivityEntry[];
};

type ResultsDisplayProps = {
  llmResult: string | null;
  currentPermissionId: string | null;
  grantTxHash: string | null;
  chainId: number | undefined;
};

// Sub-components defined outside the main component
const ServerConfig = ({
  needsToTrustServer,
  config,
  setConfig,
  trustedServers,
  trustServerError,
}: ServerConfigProps) => (
  <Card>
    <CardHeader>
      <div className="flex items-center gap-2">
        <Server className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Trusted Server</h3>
        {!needsToTrustServer && (
          <CheckCircle className="h-4 w-4 text-success" />
        )}
      </div>
    </CardHeader>
    <CardBody>
      {needsToTrustServer ? (
        <div className="text-sm text-default-600">
          No trusted servers found. Click the action button to set one up.
        </div>
      ) : (
        <Select
          label="Select server"
          selectedKeys={config.selectedServer ? [config.selectedServer] : []}
          onSelectionChange={(keys) => {
            const serverId = Array.from(keys)[0] as string;
            setConfig((prev) => ({ ...prev, selectedServer: serverId }));
          }}
          size="sm"
        >
          {trustedServers.map((server) => {
            const displayText =
              server.name ??
              server.serverUrl ??
              server.serverAddress ??
              server.id ??
              "Unknown Server";
            console.log("🔍 Rendering server:", { server, displayText });
            return (
              <SelectItem key={server.serverAddress} textValue={displayText}>
                {displayText}
              </SelectItem>
            );
          })}
        </Select>
      )}
      {trustServerError && (
        <div className="text-xs text-danger mt-2">
          <AlertCircle className="h-3 w-3 inline mr-1" />
          {trustServerError}
        </div>
      )}
    </CardBody>
  </Card>
);

const DataSource = ({
  config,
  setConfig,
  userFiles,
  selectedFiles,
  handleFileSelection,
  newTextData,
  setNewTextData,
  uploadResult,
}: DataSourceProps) => (
  <Card>
    <CardHeader>
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Data Source</h3>
        {config.selectedFiles.length > 0 && (
          <CheckCircle className="h-4 w-4 text-success" />
        )}
      </div>
    </CardHeader>
    <CardBody className="space-y-3">
      <RadioGroup
        value={config.dataChoice}
        onValueChange={(value) => {
          setConfig((prev) => ({
            ...prev,
            dataChoice: value as "new" | "existing",
          }));
        }}
        orientation="horizontal"
        size="sm"
      >
        <Radio value="new">Create New</Radio>
        <Radio value="existing">Use Existing</Radio>
      </RadioGroup>
      {config.dataChoice === "new" ? (
        <div className="space-y-3">
          <Textarea
            label="Sample Text"
            placeholder="Enter some personal text for the AI to analyze..."
            value={newTextData}
            onChange={(e) => {
              setNewTextData(e.target.value);
            }}
            minRows={3}
            maxRows={5}
            size="sm"
            description="This will be encrypted before processing"
          />
          {uploadResult && (
            <div className="text-xs text-success">
              <CheckCircle className="h-3 w-3 inline mr-1" />
              Created file #{uploadResult.fileId}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {userFiles.length === 0 ? (
            <div className="text-sm text-default-500">
              No existing files. Create new data instead.
            </div>
          ) : (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {userFiles.slice(0, 5).map((file) => (
                <div
                  key={file.id}
                  className={`p-2 border rounded-lg cursor-pointer transition-colors text-sm ${
                    selectedFiles.includes(file.id)
                      ? "border-primary bg-primary/5"
                      : "border-default-200 hover:bg-default-50"
                  }`}
                  onClick={() => {
                    handleFileSelection(
                      file.id,
                      !selectedFiles.includes(file.id),
                    );
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span>File #{file.id}</span>
                    {selectedFiles.includes(file.id) && (
                      <CheckCircle className="h-3 w-3 text-primary" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </CardBody>
  </Card>
);

const ActivityLog = ({ activityLog }: ActivityLogProps) => (
  <Card className="h-64">
    <CardHeader>
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Activity Log</h3>
      </div>
    </CardHeader>
    <CardBody>
      <ScrollShadow className="h-full">
        {activityLog.length === 0 ? (
          <div className="text-sm text-default-500">
            Activity will appear here as you interact with the sandbox...
          </div>
        ) : (
          <div className="space-y-2">
            {activityLog.map((entry) => (
              <div key={entry.id} className="text-xs space-y-1">
                <div className="flex items-start gap-2">
                  {entry.type === "success" && (
                    <CheckCircle className="h-3 w-3 text-success mt-0.5" />
                  )}
                  {entry.type === "error" && (
                    <AlertCircle className="h-3 w-3 text-danger mt-0.5" />
                  )}
                  {entry.type === "info" && (
                    <Activity className="h-3 w-3 text-primary mt-0.5" />
                  )}
                  {entry.type === "warning" && (
                    <AlertCircle className="h-3 w-3 text-warning mt-0.5" />
                  )}
                  <div className="flex-1">
                    <span
                      className={`font-medium ${
                        entry.type === "success"
                          ? "text-success"
                          : entry.type === "error"
                            ? "text-danger"
                            : entry.type === "warning"
                              ? "text-warning"
                              : "text-primary"
                      }`}
                    >
                      {entry.message}
                    </span>
                    {entry.details && (
                      <div className="text-default-500 mt-0.5">
                        {entry.details}
                      </div>
                    )}
                  </div>
                  <span className="text-default-400 text-xs">
                    {entry.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollShadow>
    </CardBody>
  </Card>
);

const ResultsDisplay = ({
  llmResult,
  currentPermissionId,
  grantTxHash,
  chainId,
}: ResultsDisplayProps) => {
  if (!llmResult) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">AI-Generated Profile</h3>
        </div>
      </CardHeader>
      <CardBody>
        <div className="prose prose-sm max-w-none">
          <div className="text-sm text-foreground whitespace-pre-wrap">
            {llmResult}
          </div>
        </div>
        <Divider className="my-4" />
        <div className="text-xs text-default-500">
          Generated using permission ID: {currentPermissionId}
          {grantTxHash && (
            <span className="ml-2">
              •{" "}
              <ExplorerLink
                type="tx"
                hash={grantTxHash}
                chainId={chainId ?? 14800}
              />
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  );
};

// Configuration state type
interface SandboxConfig {
  selectedServer: string;
  selectedFiles: number[];
  dataChoice: "new" | "existing";
}

// Activity log entry type
interface ActivityEntry {
  id: string;
  timestamp: Date;
  type: "info" | "success" | "error" | "warning";
  message: string;
  details?: string;
}

export default function PersonalServerOperationsPage() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { vana, applicationAddress } = useVana();

  const {
    trustedServers,
    isDiscoveringServer,
    isTrustingServer,
    trustServerError,
    loadUserTrustedServers,
    handleDiscoverHostedServer,
    handleTrustServerGasless,
  } = useTrustedServers();

  const { grantees, loadGrantees } = useGrantees();

  const {
    userFiles,
    selectedFiles,
    newTextData,
    isUploadingText,
    uploadResult,
    loadUserFiles,
    handleFileSelection,
    setNewTextData,
    handleUploadText,
    setSelectedFiles,
  } = useUserFiles();

  const {
    isGranting,
    grantTxHash,
    grantPreview,
    showGrantPreview,
    handleGrantPermission,
    onOpenGrant,
    onCloseGrant,
    handleConfirmGrant,
    setGrantPreview,
    lastGrantedPermissionId,
  } = usePermissions();

  const [config, setConfig] = useState<SandboxConfig>({
    selectedServer: "",
    selectedFiles: [],
    dataChoice: "new",
  });

  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [isRunningLLM, setIsRunningLLM] = useState(false);
  const [llmResult, setLlmResult] = useState<string | null>(null);

  const addActivity = useCallback(
    (type: ActivityEntry["type"], message: string, details?: string) => {
      const entry: ActivityEntry = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        type,
        message,
        details,
      };
      setActivityLog((prev) => [entry, ...prev].slice(0, 20));
    },
    [],
  );

  const needsToTrustServer = useMemo(
    () => trustedServers.length === 0,
    [trustedServers],
  );

  const needsToCreateData = useMemo(() => {
    return config.dataChoice === "new" && !uploadResult;
  }, [config.dataChoice, uploadResult]);

  useEffect(() => {
    if (trustedServers.length > 0 && !config.selectedServer) {
      setConfig((prev) => ({
        ...prev,
        selectedServer: trustedServers[0].serverAddress,
      }));
    }
  }, [trustedServers, config.selectedServer]);

  useEffect(() => {
    setConfig((prev) => ({ ...prev, selectedFiles }));
  }, [selectedFiles]);

  useEffect(() => {
    if (uploadResult?.fileId) {
      setSelectedFiles([uploadResult.fileId]);
      addActivity("success", `Created new data file #${uploadResult.fileId}`);
    }
  }, [uploadResult, setSelectedFiles, addActivity]);

  const getButtonState = useCallback(() => {
    if (!address)
      return {
        text: "Connect Wallet",
        disabled: true,
        icon: <Shield className="h-4 w-4" />,
      };
    if (needsToTrustServer)
      return {
        text: "Trust Server",
        disabled: isDiscoveringServer || isTrustingServer,
        icon: <Server className="h-4 w-4" />,
      };
    if (needsToCreateData && config.dataChoice === "new")
      return {
        text: "Create Sample Data",
        disabled: !newTextData.trim() || isUploadingText,
        icon: <FileText className="h-4 w-4" />,
      };
    if (config.selectedFiles.length === 0 && config.dataChoice === "existing")
      return {
        text: "Select Data",
        disabled: true,
        icon: <Database className="h-4 w-4" />,
      };
    if (!lastGrantedPermissionId)
      return {
        text: "Configure Permission",
        disabled: isGranting,
        icon: <Shield className="h-4 w-4" />,
      };
    return {
      text: "Generate AI Profile",
      disabled: isRunningLLM,
      icon: <Brain className="h-4 w-4" />,
    };
  }, [
    address,
    needsToTrustServer,
    needsToCreateData,
    config.dataChoice,
    config.selectedFiles,
    lastGrantedPermissionId,
    newTextData,
    isDiscoveringServer,
    isTrustingServer,
    isUploadingText,
    isGranting,
    isRunningLLM,
  ]);

  const pollOperationStatus = useCallback(
    async (operationId: string, permissionId: string) => {
      try {
        const response = await fetch("/api/trusted-server/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operationId, chainId }),
        });
        if (!response.ok) {
          addActivity("error", "Failed to poll operation status");
          return;
        }
        const result = await response.json();
        if (result.data?.status === "succeeded") {
          setLlmResult(result.data.result ?? "No output received");
          addActivity("success", "AI profile generated successfully!");
        } else if (result.data?.status === "failed") {
          addActivity("error", "AI processing failed", result.data?.error);
        } else if (
          result.data?.status === "starting" ||
          result.data?.status === "processing"
        ) {
          setTimeout(() => {
            void pollOperationStatus(operationId, permissionId);
          }, 2000);
          return;
        } else {
          addActivity("error", "Unknown operation status", result.data?.status);
        }
      } catch (error) {
        addActivity(
          "error",
          "Error polling operation status",
          error instanceof Error ? error.message : undefined,
        );
      }
      setIsRunningLLM(false);
    },
    [chainId, addActivity],
  );

  const handlePrimaryAction = useCallback(async () => {
    if (needsToTrustServer) {
      addActivity("info", "Discovering and trusting server...");
      try {
        const discoveredServer = await handleDiscoverHostedServer();
        if (discoveredServer?.serverAddress) {
          await handleTrustServerGasless(
            false,
            discoveredServer.serverAddress,
            discoveredServer.serverUrl,
            discoveredServer.publicKey,
          );
          setConfig((prev) => ({
            ...prev,
            selectedServer: discoveredServer.serverAddress,
          }));
          addActivity("success", "Server trusted successfully!");
        } else {
          addActivity("error", "Failed to discover server");
        }
      } catch (error) {
        addActivity(
          "error",
          "Failed to trust server",
          error instanceof Error ? error.message : undefined,
        );
      }
      return;
    }

    if (needsToCreateData && config.dataChoice === "new") {
      addActivity("info", "Creating sample data file...");

      // Get server identity to get public key for encryption
      let serverIdentity = null;
      if (config.selectedServer && vana && address) {
        try {
          addActivity("info", "Fetching server identity for encryption...");
          serverIdentity = await vana.server.getIdentity({
            userAddress: address,
          });
          addActivity("info", "Encrypting file with server's public key...");
        } catch {
          addActivity(
            "warning",
            "Could not get server identity, uploading without encryption",
          );
        }
      }

      await handleUploadText(
        serverIdentity?.address,
        serverIdentity?.publicKey,
      );
      return;
    }

    if (!applicationAddress) {
      addActivity(
        "error",
        "Missing configuration",
        "Application address not available",
      );
      return;
    }

    // For existing data mode, we need files to be selected
    // For new data mode, we need either files selected (after upload) or text data to upload
    if (config.dataChoice === "existing" && config.selectedFiles.length === 0) {
      addActivity(
        "error",
        "Missing configuration",
        "Please select existing data files",
      );
      return;
    }

    if (
      config.dataChoice === "new" &&
      config.selectedFiles.length === 0 &&
      !newTextData.trim()
    ) {
      addActivity(
        "error",
        "Missing configuration",
        "Please enter sample text or select existing files",
      );
      return;
    }

    // If we don't have a permission, open the modal to create one
    if (!lastGrantedPermissionId) {
      addActivity("info", "Opening permission configuration...");

      // Set up initial grant preview before opening modal
      setGrantPreview({
        grantFile: null,
        grantUrl: "",
        params: {
          grantee: applicationAddress as `0x${string}`,
          operation: "llm_inference",
          files: config.selectedFiles,
          parameters: {
            prompt:
              "Generate a personality profile based on the following text: {{data}}",
          },
        },
      });

      void loadGrantees();
      onOpenGrant();
      return;
    }

    // Execute AI inference using the granted permission
    const permissionId = lastGrantedPermissionId;
    addActivity("info", "Executing AI inference...");
    setIsRunningLLM(true);
    setLlmResult(null);

    try {
      const response = await fetch("/api/trusted-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionId: parseInt(permissionId), chainId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error ?? `HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.data?.id) {
        addActivity("info", "AI processing started...");
        void pollOperationStatus(result.data.id, permissionId);
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (error) {
      addActivity(
        "error",
        "Failed to run AI inference",
        error instanceof Error ? error.message : undefined,
      );
      setIsRunningLLM(false);
    }
  }, [
    needsToTrustServer,
    needsToCreateData,
    config,
    applicationAddress,
    lastGrantedPermissionId,
    handleDiscoverHostedServer,
    handleTrustServerGasless,
    handleUploadText,
    handleGrantPermission,
    pollOperationStatus,
    addActivity,
    chainId,
  ]);

  // Handle when a permission is granted from the usePermissions hook
  useEffect(() => {
    if (lastGrantedPermissionId) {
      addActivity(
        "success",
        `Permission granted! ID: ${lastGrantedPermissionId}`,
        "You can now generate AI profiles",
      );
    }
  }, [lastGrantedPermissionId, addActivity]);

  useEffect(() => {
    if (vana) {
      console.log(
        "🔄 [PersonalServerOps] Loading trusted servers and files...",
      );
      void loadUserTrustedServers();
      void loadUserFiles();
    }
  }, [vana, loadUserTrustedServers, loadUserFiles]);

  const buttonState = getButtonState();

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Personal Server Operations</h1>
        <p className="text-lg text-default-600 max-w-2xl mx-auto">
          Trust servers and process your data
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">Configuration</h2>
          <ServerConfig
            needsToTrustServer={needsToTrustServer}
            config={config}
            setConfig={setConfig}
            trustedServers={trustedServers}
            trustServerError={trustServerError}
          />
          <DataSource
            config={config}
            setConfig={setConfig}
            userFiles={userFiles}
            selectedFiles={selectedFiles}
            handleFileSelection={handleFileSelection}
            newTextData={newTextData}
            setNewTextData={setNewTextData}
            uploadResult={uploadResult}
          />
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">Action & Results</h2>
          <Button
            color="primary"
            size="lg"
            className="w-full"
            onPress={handlePrimaryAction}
            isDisabled={buttonState.disabled}
            isLoading={
              isDiscoveringServer ||
              isTrustingServer ||
              isUploadingText ||
              isGranting ||
              isRunningLLM
            }
            startContent={buttonState.icon}
          >
            {buttonState.text}
          </Button>

          {lastGrantedPermissionId && config.selectedFiles.length > 0 && (
            <Card className="bg-success/10 border-success">
              <CardBody className="py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <div className="text-sm">
                    <span className="font-medium text-success">
                      Ready to generate!
                    </span>
                    <span className="text-default-600 ml-2">
                      Using permission #{lastGrantedPermissionId}
                    </span>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          <ActivityLog activityLog={activityLog} />
          <ResultsDisplay
            llmResult={llmResult}
            currentPermissionId={lastGrantedPermissionId}
            grantTxHash={grantTxHash}
            chainId={chainId}
          />
        </div>
      </div>

      <GrantPermissionModal
        isOpen={showGrantPreview}
        onClose={onCloseGrant}
        onConfirm={async (params) => {
          // Create new permission - the modal handles the UI flow
          if (grantPreview) {
            setGrantPreview({ ...grantPreview, params });
          }
          await handleConfirmGrant(params);
        }}
        selectedFiles={config.selectedFiles}
        grantees={grantees}
        isGranting={isGranting}
      />
    </div>
  );
}
