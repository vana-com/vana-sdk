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
  Tabs,
  Tab,
  addToast,
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
import type { Artifact } from "@opendatalabs/vana-sdk/browser";
import { ArtifactDisplay } from "@/components/ui/ArtifactDisplay";
import { useTrustedServers } from "@/hooks/useTrustedServers";
import { useUserFiles, type ExtendedUserFile } from "@/hooks/useUserFiles";
import { useVana } from "@/providers/VanaProvider";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { AddressDisplay } from "@/components/ui/AddressDisplay";
import { FormBuilder } from "@/components/ui/FormBuilder";
import { EmptyState } from "@/components/ui/EmptyState";

// Component-specific props
type ServerConfigProps = {
  needsToTrustServer: boolean;
  config: SandboxConfig;
  setConfig: React.Dispatch<React.SetStateAction<SandboxConfig>>;
  trustedServers: ReturnType<typeof useTrustedServers>["trustedServers"];
  trustServerError: string | null;
  isDiscoveringServer: boolean;
  isTrustingServer: boolean;
  handleDiscoverHostedServer: () => Promise<{
    serverAddress: string;
    serverUrl: string;
    name?: string;
    publicKey?: string;
  } | null>;
  handleTrustServerGasless: (
    clearFieldsOnSuccess?: boolean,
    overrideServerAddress?: string,
    overrideServerUrl?: string,
    overridePublicKey?: string,
  ) => Promise<void>;
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
  chainId: number;
  fileSchemaNames: Map<number, string>;
};

type OperationConfigProps = {
  agentType: "none" | "gemini" | "qwen";
  setAgentType: (type: "none" | "gemini" | "qwen") => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
};

type ActivityLogProps = {
  activityLog: ActivityEntry[];
};

type ResultsDisplayProps = {
  displayText: string | null;
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
  isDiscoveringServer,
  isTrustingServer,
  handleDiscoverHostedServer,
  handleTrustServerGasless,
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
    <CardBody className="space-y-3">
      {needsToTrustServer ? (
        <>
          <div className="text-sm text-default-600">
            No trusted servers found. Trust your personal server to continue.
          </div>
          <Button
            color="primary"
            size="sm"
            className="w-full"
            onPress={async () => {
              const discoveredServer = await handleDiscoverHostedServer();
              if (discoveredServer?.serverAddress) {
                await handleTrustServerGasless(
                  false,
                  discoveredServer.serverAddress,
                  discoveredServer.serverUrl,
                  discoveredServer.publicKey,
                );
              }
            }}
            isDisabled={isDiscoveringServer || isTrustingServer}
            isLoading={isDiscoveringServer || isTrustingServer}
            startContent={<Server className="h-4 w-4" />}
          >
            Trust Personal Server
          </Button>
          {trustServerError && (
            <div className="text-xs text-danger">
              <AlertCircle className="h-3 w-3 inline mr-1" />
              {trustServerError}
            </div>
          )}
        </>
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
            return (
              <SelectItem key={server.serverAddress} textValue={displayText}>
                {displayText}
              </SelectItem>
            );
          })}
        </Select>
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
  chainId: _chainId,
  fileSchemaNames,
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
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {userFiles.slice(0, 10).map((file) => (
                <div
                  key={file.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">
                          File #{file.id}
                        </span>
                        {selectedFiles.includes(file.id) && (
                          <CheckCircle className="h-3 w-3 text-primary flex-shrink-0" />
                        )}
                      </div>
                      {"schemaId" in file && file.schemaId ? (
                        <div className="text-xs text-default-600">
                          {fileSchemaNames.get(file.schemaId as number) ??
                            `Schema #${String(file.schemaId)}`}
                        </div>
                      ) : (
                        <div className="text-xs text-default-400">
                          No schema
                        </div>
                      )}
                    </div>
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

const OperationConfig = ({
  agentType,
  setAgentType,
  prompt,
  setPrompt,
}: OperationConfigProps) => {
  const defaultLLMPrompt =
    "Generate a personality profile based on the following text: {{data}}";
  const defaultAgentGoal = `Analyze my digital footprint and create a comprehensive report showing:
1. Interests, habits, and behavioral patterns
2. Content consumption trends
3. Communication style from data
4. Personal intelligence insights
5. Data-driven recommendations`;

  // Update prompt when agent type changes
  useEffect(() => {
    const newPrompt =
      agentType !== "none" ? defaultAgentGoal : defaultLLMPrompt;
    setPrompt(newPrompt);
  }, [agentType, setPrompt]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Operation Type</h3>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <RadioGroup
          label="Select operation type"
          value={agentType}
          onValueChange={(value) => {
            setAgentType(value as "none" | "gemini" | "qwen");
          }}
          size="sm"
        >
          <Radio value="none">Standard LLM (llm_inference)</Radio>
          <Radio value="gemini">Gemini Agent (prompt_gemini_agent)</Radio>
          <Radio value="qwen">Qwen Agent (prompt_qwen_agent)</Radio>
        </RadioGroup>
        <Textarea
          label={agentType !== "none" ? "Analysis Goal" : "AI Prompt"}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
          minRows={agentType !== "none" ? 6 : 3}
          maxRows={agentType !== "none" ? 10 : 5}
          size="sm"
          description={
            agentType !== "none"
              ? `${agentType === "gemini" ? "Gemini" : "Qwen"} will analyze your data based on this goal`
              : "Use {{data}} to reference your data"
          }
        />
      </CardBody>
    </Card>
  );
};

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
  displayText,
  currentPermissionId,
  grantTxHash,
  chainId,
}: ResultsDisplayProps) => {
  if (!displayText) return null;
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
            {displayText}
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
    isUntrusting,
    trustServerError,
    serverAddress: trustServerAddress,
    serverUrl: trustServerUrl,
    publicKey: trustPublicKey,
    setServerAddress: setTrustServerAddress,
    setServerUrl: setTrustServerUrl,
    setPublicKey: setTrustPublicKey,
    loadUserTrustedServers,
    handleDiscoverHostedServer,
    handleTrustServerGasless,
    handleUntrustServer,
  } = useTrustedServers();

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

  // Permission granting state
  const [isGranting, setIsGranting] = useState(false);
  const [grantTxHash, setGrantTxHash] = useState<string>("");
  const [lastGrantedPermissionId, setLastGrantedPermissionId] = useState<
    string | null
  >(null);

  const [activeTab, setActiveTab] = useState("operations");
  const [config, setConfig] = useState<SandboxConfig>({
    selectedServer: "",
    selectedFiles: [],
    dataChoice: "new",
  });
  const [agentType, setAgentType] = useState<"none" | "gemini" | "qwen">(
    "none",
  );
  const [prompt, setPrompt] = useState<string>("");

  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [isRunningLLM, setIsRunningLLM] = useState(false);
  const [displayText, setDisplayText] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [operationId, setOperationId] = useState<string | undefined>();

  // Schema names for files
  const [fileSchemaNames, setFileSchemaNames] = useState<Map<number, string>>(
    new Map(),
  );

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
        text: "Trust Server First",
        disabled: true,
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
          const rawResult = result.data.result as
            | Record<string, unknown>
            | null
            | undefined;

          // Per server OpenAPI spec, result is always an object (never a string)
          // - LLM inference: { output: "text" }
          // - Agent operations: { result: "text", summary: "text", artifacts: [...], ... }
          let displayText: string;
          let extractedArtifacts: Artifact[] = [];

          if (rawResult && typeof rawResult === "object") {
            // Try LLM format first: { output: "text" }
            if (typeof rawResult.output === "string") {
              displayText = rawResult.output;
            }
            // Try agent format: { result: "text" } or { summary: "text" }
            else if (typeof rawResult.result === "string") {
              displayText = rawResult.result;
            } else if (typeof rawResult.summary === "string") {
              displayText = rawResult.summary;
            } else {
              // Fallback: stringify the whole object
              displayText = JSON.stringify(rawResult, null, 2);
            }

            // Extract artifacts if present (agent operations)
            if (Array.isArray(rawResult.artifacts)) {
              extractedArtifacts = rawResult.artifacts as Artifact[];
            }
          } else {
            displayText = "No output received";
          }

          setDisplayText(displayText);
          addActivity("success", "AI profile generated successfully!");

          // Set artifacts
          if (extractedArtifacts.length > 0) {
            setArtifacts(extractedArtifacts);
            addActivity(
              "info",
              `Generated ${extractedArtifacts.length} artifact(s)`,
            );
          }
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
    // Trust server is now handled in the ServerConfig component
    if (needsToTrustServer) {
      addActivity(
        "warning",
        "Please trust a server first using the button in the Trusted Server section above",
      );
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
        "Application address not available. Check APPLICATION_PRIVATE_KEY in .env.local",
      );
      return;
    }

    console.debug("📝 [Grant] Using application address:", applicationAddress);

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

    // If we don't have a permission, create one
    if (!lastGrantedPermissionId) {
      if (!vana) {
        addActivity("error", "SDK not initialized");
        return;
      }

      addActivity("info", "Creating permission grant...");

      // Build operation config based on agent type
      const getOperationConfig = () => {
        if (agentType === "gemini") {
          return {
            operation: "prompt_gemini_agent" as const,
            parameters: { goal: prompt },
          };
        } else if (agentType === "qwen") {
          return {
            operation: "prompt_qwen_agent" as const,
            parameters: { goal: prompt },
          };
        } else {
          return {
            operation: "llm_inference" as const,
            parameters: { prompt },
          };
        }
      };

      const operationConfig = getOperationConfig();

      setIsGranting(true);
      setGrantTxHash("");

      try {
        // Grant permission directly using the SDK
        const result = await vana.permissions.grant({
          grantee: applicationAddress as `0x${string}`,
          operation: operationConfig.operation,
          files: config.selectedFiles,
          parameters: operationConfig.parameters,
        });

        setGrantTxHash(result.transactionHash);
        setLastGrantedPermissionId(result.permissionId.toString());

        addActivity(
          "success",
          `Permission granted! ID: ${result.permissionId}`,
          `Transaction: ${result.transactionHash}`,
        );

        addToast({
          title: "Permission Granted",
          description: `Successfully granted permission ID ${result.permissionId}`,
          variant: "solid",
          color: "success",
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        const isGranteeNotFound = errorMessage.includes("GranteeNotFound");

        addActivity(
          "error",
          "Failed to grant permission",
          isGranteeNotFound
            ? `Application ${applicationAddress} is not registered as a grantee. Register it first in the Grantees tab.`
            : errorMessage,
        );

        addToast({
          title: "Permission Grant Failed",
          description: isGranteeNotFound
            ? "Application not registered as grantee"
            : errorMessage,
          variant: "solid",
          color: "danger",
        });

        console.error("❌ [Grant] Full error:", error);
      } finally {
        setIsGranting(false);
      }

      return;
    }

    // Execute AI inference using the granted permission
    const permissionId = lastGrantedPermissionId;
    addActivity("info", "Executing AI inference...");
    setIsRunningLLM(true);
    setDisplayText(null);
    setArtifacts([]);
    setOperationId(undefined);

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
        setOperationId(result.data.id);
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
    agentType,
    prompt,
    handleUploadText,
    pollOperationStatus,
    addActivity,
    chainId,
    address,
    vana,
    newTextData,
  ]);

  useEffect(() => {
    if (vana) {
      void loadUserTrustedServers();
      void loadUserFiles();
    }
  }, [vana, loadUserTrustedServers, loadUserFiles]);

  // Fetch schema names for files
  useEffect(() => {
    const fetchSchemaNames = async () => {
      if (!vana || userFiles.length === 0) return;

      const schemaMap = new Map<number, string>();

      for (const file of userFiles) {
        const schemaId =
          "schemaId" in file ? (file.schemaId as number) : undefined;
        if (
          schemaId &&
          typeof schemaId === "number" &&
          !fileSchemaNames.has(schemaId)
        ) {
          try {
            const schema = await vana.schemas.get(schemaId);
            schemaMap.set(schemaId, schema.name);
          } catch (error) {
            console.warn(`Failed to fetch schema ${schemaId}:`, error);
          }
        }
      }

      if (schemaMap.size > 0) {
        setFileSchemaNames((prev) => new Map([...prev, ...schemaMap]));
      }
    };

    void fetchSchemaNames();
  }, [userFiles, vana, fileSchemaNames]);

  const buttonState = getButtonState();

  // Artifact handlers
  const handleDownloadArtifact = async (artifact: Artifact) => {
    try {
      const artifactName = artifact.path.split("/").pop() ?? artifact.path;
      addActivity("info", `Downloading ${artifactName}...`);

      if (!operationId) {
        throw new Error("Operation ID not found");
      }

      if (!vana) {
        throw new Error("SDK not initialized");
      }

      // Use SDK to download artifact with user's wallet signature
      const blob = await vana.server.downloadArtifact({
        operationId,
        artifactPath: artifact.path,
      });

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = artifactName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addActivity("success", `Downloaded ${artifactName}`);
    } catch (error) {
      addActivity(
        "error",
        `Download failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const handleFetchArtifactContent = async (
    artifact: Artifact,
  ): Promise<string> => {
    try {
      if (!operationId) {
        throw new Error("Operation ID not found");
      }

      if (!vana) {
        throw new Error("SDK not initialized");
      }

      // Use SDK to download artifact with user's wallet signature
      const blob = await vana.server.downloadArtifact({
        operationId,
        artifactPath: artifact.path,
      });

      const text = await blob.text();
      return text;
    } catch (error) {
      console.error("Error fetching artifact:", error);
      return "Error loading artifact content";
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Personal Server</h1>
        <p className="text-lg text-default-600 max-w-2xl mx-auto">
          Manage trusted servers and process your data
        </p>
      </div>

      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => {
          setActiveTab(key as string);
        }}
        className="mb-6"
      >
        <Tab key="operations" title="Operations">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Configuration</h2>
              <ServerConfig
                needsToTrustServer={needsToTrustServer}
                config={config}
                setConfig={setConfig}
                trustedServers={trustedServers}
                trustServerError={trustServerError}
                isDiscoveringServer={isDiscoveringServer}
                isTrustingServer={isTrustingServer}
                handleDiscoverHostedServer={handleDiscoverHostedServer}
                handleTrustServerGasless={handleTrustServerGasless}
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
                chainId={chainId || 14800}
                fileSchemaNames={fileSchemaNames}
              />
              <OperationConfig
                agentType={agentType}
                setAgentType={setAgentType}
                prompt={prompt}
                setPrompt={setPrompt}
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
                displayText={displayText}
                currentPermissionId={lastGrantedPermissionId}
                grantTxHash={grantTxHash}
                chainId={chainId}
              />
              {artifacts.length > 0 && (
                <ArtifactDisplay
                  artifacts={artifacts}
                  operationId={operationId}
                  onDownload={handleDownloadArtifact}
                  onFetchContent={handleFetchArtifactContent}
                />
              )}
            </div>
          </div>
        </Tab>

        <Tab key="servers" title="Manage Servers">
          <div className="space-y-6 mt-6">
            {/* Trust New Server */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  <h3 className="text-lg font-semibold">Trust New Server</h3>
                </div>
              </CardHeader>
              <CardBody>
                <FormBuilder
                  title=""
                  singleColumn={true}
                  fields={[
                    {
                      name: "serverAddress",
                      label: "Server Address",
                      type: "text",
                      value: trustServerAddress,
                      onChange: setTrustServerAddress,
                      placeholder: "0x...",
                      description: "The Ethereum address of the server",
                      required: true,
                    },
                    {
                      name: "serverUrl",
                      label: "Server URL",
                      type: "text",
                      value: trustServerUrl,
                      onChange: setTrustServerUrl,
                      placeholder: "https://...",
                      description: "The API endpoint URL of the server",
                      required: true,
                    },
                    {
                      name: "publicKey",
                      label: "Public Key",
                      type: "text",
                      value: trustPublicKey,
                      onChange: setTrustPublicKey,
                      placeholder: "0x...",
                      description: "The server's public key for encryption",
                      required: true,
                    },
                  ]}
                  onSubmit={() => {
                    void handleTrustServerGasless(
                      false,
                      trustServerAddress,
                      trustServerUrl,
                      trustPublicKey,
                    );
                  }}
                  isSubmitting={isTrustingServer}
                  submitText="Add and Trust Server"
                  submitIcon={<Shield className="h-4 w-4" />}
                  status={trustServerError || undefined}
                  additionalButtons={
                    <Button
                      onPress={() => {
                        void handleDiscoverHostedServer();
                      }}
                      isLoading={isDiscoveringServer}
                      variant="bordered"
                      startContent={<Server className="h-4 w-4" />}
                    >
                      Get Hosted Server Details
                    </Button>
                  }
                />
              </CardBody>
            </Card>

            {/* Trusted Servers List */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center w-full">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    <div>
                      <h3 className="text-lg font-semibold">
                        Your Trusted Servers
                      </h3>
                      <p className="text-sm text-default-500">
                        {trustedServers.length} server
                        {trustedServers.length !== 1 ? "s" : ""} trusted
                      </p>
                    </div>
                  </div>
                  <Button
                    onPress={() => {
                      void loadUserTrustedServers();
                    }}
                    variant="bordered"
                    size="sm"
                    startContent={<Activity className="h-4 w-4" />}
                  >
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                {trustedServers.length === 0 ? (
                  <EmptyState
                    icon={<Shield className="h-12 w-12" />}
                    title="No trusted servers"
                    description="Trust a server above to see it listed here"
                  />
                ) : (
                  <div className="space-y-3">
                    {trustedServers.map((server) => (
                      <Card
                        key={server.id}
                        className="border border-default-200"
                      >
                        <CardBody>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">
                                  Server #{server.id}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-xs bg-success/20 text-success">
                                  Active
                                </span>
                              </div>
                              {server.name && (
                                <div className="text-sm">
                                  <span className="text-default-500">
                                    Name:
                                  </span>{" "}
                                  {server.name}
                                </div>
                              )}
                              <div className="text-sm">
                                <span className="text-default-500">
                                  Address:
                                </span>{" "}
                                <AddressDisplay
                                  address={server.serverAddress}
                                  truncate={true}
                                  showCopy={true}
                                />
                              </div>
                              {server.serverUrl && (
                                <div className="text-sm break-all">
                                  <span className="text-default-500">URL:</span>{" "}
                                  <a
                                    href={server.serverUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                  >
                                    {server.serverUrl}
                                  </a>
                                </div>
                              )}
                            </div>
                            <Button
                              color="danger"
                              variant="flat"
                              size="sm"
                              onPress={() => {
                                void handleUntrustServer(server.id);
                              }}
                              isLoading={isUntrusting}
                              isDisabled={isUntrusting}
                            >
                              Untrust
                            </Button>
                          </div>
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </Tab>
      </Tabs>
    </div>
  );
}
