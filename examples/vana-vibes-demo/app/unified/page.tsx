"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useWallet } from "@getpara/react-sdk";
import { useGoogleDriveOAuth } from "../../providers/google-drive-oauth";
import { DataPortabilityFlow } from "../../lib/data-flow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { useVana, isVanaInitialized } from "../../providers/vana-provider";
import { ArtifactDisplay } from "../../lib/components/artifact-display";
import { FileSelector } from "../../components/file-selector";
import type {
  DataSchema,
  Artifact,
  VanaInstance,
} from "@opendatalabs/vana-sdk/browser";
import {
  SchemaValidator,
  generateEncryptionKey,
  encryptWithWalletPublicKey,
  BrowserPlatformAdapter,
  DEFAULT_ENCRYPTION_SEED,
} from "@opendatalabs/vana-sdk/browser";
import type { Address } from "viem";

// File type with enriched metadata
interface UserFile {
  id: number;
  url: string;
  ownerAddress: Address;
  addedAtBlock: bigint;
  schemaId?: number;
  schemaName?: string;
  addedAtTimestamp?: bigint;
  transactionHash?: Address;
  dlpIds?: number[];
  dlpNames?: string[];
}

export default function UnifiedPage() {
  const { isConnected: walletConnected, address } = useAccount();
  const { data: wallet } = useWallet?.() ?? {};
  const vanaContext = useVana();
  const {
    isConnected: googleDriveConnected,
    isConnecting: googleDriveConnecting,
    error: googleDriveError,
    connect: connectGoogleDrive,
    disconnect: disconnectGoogleDrive,
  } = useGoogleDriveOAuth();

  // Mode selection
  const [mode, setMode] = useState<"manual" | "existing">("manual");

  // Common state
  const [status, setStatus] = useState<string>(
    "Please connect your wallet first",
  );
  const [result, setResult] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [useGeminiAgent, setUseGeminiAgent] = useState<boolean>(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [operationId, setOperationId] = useState<string | undefined>();

  // Prompts
  const defaultLLMPrompt = "Based on this: {{data}}, what is Vana?";
  const defaultGeminiGoal = `Analyze my digital footprint across all available data sources and create:

1. A comprehensive "Digital Mirror" report showing:
   - My interests, habits, and behavioral patterns across platforms
   - Content consumption trends (what I watch, read, listen to)
   - Communication style and key relationships from chat histories
   - Professional growth trajectory from LinkedIn/work data
   - Hidden patterns I might not be aware of

2. A "Personal Intelligence Dashboard" with:
   - Top insights about my personality and preferences
   - Data-driven recommendations for personal growth
   - Potential blind spots or biases in my digital behavior
   - Unique characteristics that define my digital identity

3. Actionable insights comparing my data across platforms to reveal:
   - Inconsistencies between my professional and personal personas
   - Evolution of my interests and values over time
   - Predictive insights about my future interests or needs

Create visually appealing outputs with charts, timelines, and summaries that I could share or use for self-reflection.`;

  const [unifiedPrompt, setUnifiedPrompt] = useState<string>(defaultLLMPrompt);

  // Manual mode state
  const [userData, setUserData] = useState<string>(
    JSON.stringify(
      { message: "Vana is a layer 1 blockchain for user-owned data" },
      null,
      2,
    ),
  );
  const [schema, setSchema] = useState<DataSchema | null>(null);
  const [schemaId, setSchemaId] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string>("");
  const [validator] = useState(() => new SchemaValidator());

  // Existing files mode state
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  // Update prompt when mode changes
  useEffect(() => {
    setUnifiedPrompt(useGeminiAgent ? defaultGeminiGoal : defaultLLMPrompt);
  }, [useGeminiAgent, defaultGeminiGoal, defaultLLMPrompt]);

  // Update status message
  useEffect(() => {
    if (isProcessing) return;

    const walletAddress = wallet?.address ?? address;

    if (!walletConnected) {
      setStatus("Please connect your wallet first");
    } else if (!googleDriveConnected && walletAddress) {
      setStatus("Wallet connected. Please connect Google Drive to continue.");
    } else if (walletConnected && googleDriveConnected && walletAddress) {
      if (mode === "manual") {
        setStatus("Ready to start data portability flow");
      } else {
        setStatus(
          isLoadingFiles
            ? "Loading your files..."
            : filesError
              ? filesError
              : userFiles.length > 0
                ? "Select files to process"
                : "Ready",
        );
      }
    }
  }, [
    walletConnected,
    wallet?.address,
    address,
    googleDriveConnected,
    isProcessing,
    mode,
    isLoadingFiles,
    filesError,
    userFiles.length,
  ]);

  // Fetch schema for manual mode
  useEffect(() => {
    if (!isVanaInitialized(vanaContext) || mode !== "manual") return;
    const chainId = vanaContext.walletClient.chain?.id;
    const SCHEMA_IDS: Record<number, number> = { 14800: 19, 1480: 1 };
    const id = chainId ? SCHEMA_IDS[chainId] : null;
    if (id) {
      vanaContext.vana.schemas
        .get(id)
        .then((schema: DataSchema) => {
          setSchema(schema);
          setSchemaId(id);
        })
        .catch(() => {});
    }
  }, [vanaContext, mode]);

  // Validate data for manual mode
  useEffect(() => {
    if (!schema || !userData || mode !== "manual") {
      setValidationError("");
      return;
    }
    try {
      const parsed = JSON.parse(userData);
      validator.validateDataAgainstSchema(parsed, schema);
      setValidationError("");
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : "Invalid");
    }
  }, [userData, schema, validator, mode]);

  // Load user files with enriched metadata for existing mode
  const loadUserFiles = useCallback(
    async (vana: VanaInstance, userAddress: string) => {
      setIsLoadingFiles(true);
      setFilesError(null);

      try {
        const files = await vana.data.getUserFiles({
          owner: userAddress as `0x${string}`,
        });

        if (!files || files.length === 0) {
          setFilesError("No files found for your account");
          setUserFiles([]);
          setIsLoadingFiles(false);
          return;
        }

        // Enrich files with schema and DLP names
        const enrichedFiles = await Promise.all(
          files.map(async (file: UserFile) => {
            const enriched = { ...file };

            // Get schema name if exists
            if (file.schemaId && file.schemaId > 0) {
              try {
                const schema = await vana.schemas.get(file.schemaId);
                enriched.schemaName = schema.name;
              } catch (error) {
                console.error(
                  `Failed to fetch schema ${file.schemaId}:`,
                  error,
                );
              }
            }

            // Get DLP names if exist
            if (file.dlpIds && file.dlpIds.length > 0) {
              const dlpNames: string[] = [];
              for (const dlpId of file.dlpIds) {
                try {
                  const dlp = await vana.data.getDLP(dlpId);
                  dlpNames.push(dlp.name);
                } catch (error) {
                  console.error(`Failed to fetch DLP ${dlpId}:`, error);
                }
              }
              if (dlpNames.length > 0) {
                enriched.dlpNames = dlpNames;
              }
            }

            return enriched;
          }),
        );

        setUserFiles(enrichedFiles);
        setFilesError(null);
      } catch (error) {
        console.error("Failed to load user files:", error);
        setFilesError(
          error instanceof Error ? error.message : "Failed to load files",
        );
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [],
  );

  // Load user files when wallet is connected and mode is existing
  useEffect(() => {
    const walletAddress = wallet?.address ?? address;
    if (
      isVanaInitialized(vanaContext) &&
      walletAddress &&
      walletConnected &&
      mode === "existing"
    ) {
      void loadUserFiles(vanaContext.vana, walletAddress);
    }
  }, [
    vanaContext,
    wallet?.address,
    address,
    walletConnected,
    mode,
    loadUserFiles,
  ]);

  // Artifact handling
  const fetchArtifactContent = async (artifact: Artifact) => {
    try {
      if (!operationId) {
        throw new Error("Operation ID not found");
      }

      const response = await fetch("/api/artifacts/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operationId,
          artifactPath: artifact.artifact_path,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch artifact");
      }

      const blob = await response.blob();
      const text = await blob.text();
      return text;
    } catch (error) {
      console.error("Error fetching artifact:", error);
      return "Error loading artifact content";
    }
  };

  const handleDownloadArtifact = async (artifact: Artifact) => {
    try {
      setStatus(`Downloading ${artifact.name}...`);

      if (!operationId) {
        throw new Error("Operation ID not found");
      }

      const response = await fetch("/api/artifacts/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operationId,
          artifactPath: artifact.artifact_path,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error ?? "Download failed");
      }

      const blob = await response.blob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = artifact.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus(`Downloaded ${artifact.name}`);
    } catch (error) {
      console.error("Download error:", error);
      setStatus(
        `Download failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  // Process manual data flow
  const handleStartManualFlow = async () => {
    const walletAddress = wallet?.address ?? address;
    if (!isVanaInitialized(vanaContext) || !walletAddress) {
      setStatus("Vana not initialized. Please connect your wallet.");
      return;
    }

    setIsProcessing(true);
    setStatus("Starting data portability flow...");
    setResult("");
    setArtifacts([]);
    setOperationId(undefined);

    try {
      const flow = new DataPortabilityFlow(
        vanaContext.vana,
        vanaContext.walletClient,
        {
          onStatusUpdate: setStatus,
          onResultUpdate: (resultStr) => {
            setResult(resultStr);
            try {
              const parsed = JSON.parse(resultStr);
              if (parsed.artifacts && Array.isArray(parsed.artifacts)) {
                setArtifacts(parsed.artifacts);
              }
              if (parsed.id) {
                setOperationId(parsed.id);
              }
            } catch {
              // Not JSON or no artifacts
            }
          },
          onError: (error) => {
            console.error("Flow error:", error);
          },
        },
      );

      await flow.executeFlow(
        walletAddress,
        userData,
        {
          operation: useGeminiAgent ? "prompt_gemini_agent" : "llm_inference",
          parameters: useGeminiAgent
            ? { goal: unifiedPrompt }
            : { prompt: unifiedPrompt },
        },
        schemaId,
      );
    } catch (error) {
      setStatus(
        `Flow failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      console.error("Complete flow error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Process existing files flow
  const handleStartExistingFlow = async () => {
    const walletAddress = wallet?.address ?? address;

    if (
      !isVanaInitialized(vanaContext) ||
      !walletAddress ||
      selectedFileIds.length === 0
    ) {
      setStatus("Missing required data - please select at least one file");
      return;
    }

    setIsProcessing(true);
    setResult("");
    setArtifacts([]);
    setOperationId(undefined);

    try {
      setStatus(
        `Preparing permission grant for ${selectedFileIds.length} file(s)...`,
      );

      const selectedFiles = userFiles.filter((f) =>
        selectedFileIds.includes(f.id),
      );
      if (selectedFiles.length === 0) {
        throw new Error("Selected files not found");
      }

      const appAddress = process.env.NEXT_PUBLIC_DATA_WALLET_APP_ADDRESS;
      if (!appAddress) {
        throw new Error(
          "NEXT_PUBLIC_DATA_WALLET_APP_ADDRESS environment variable is not set",
        );
      }

      const granteeId = process.env.NEXT_PUBLIC_DEFAULT_GRANTEE_ID;
      if (!granteeId) {
        throw new Error(
          "NEXT_PUBLIC_DEFAULT_GRANTEE_ID environment variable is not set",
        );
      }

      setStatus("Preparing server permissions...");

      const serverInfo = await vanaContext.vana.server.getIdentity({
        userAddress: walletAddress as `0x${string}`,
      });

      const platformAdapter = new BrowserPlatformAdapter();
      const userEncryptionKey = await generateEncryptionKey(
        vanaContext.walletClient,
        platformAdapter,
        DEFAULT_ENCRYPTION_SEED,
      );

      const encryptedKey = await encryptWithWalletPublicKey(
        userEncryptionKey,
        serverInfo.publicKey,
        platformAdapter,
      );

      const grantData = {
        grantee: appAddress,
        operation: useGeminiAgent ? "prompt_gemini_agent" : "llm_inference",
        parameters: useGeminiAgent
          ? { goal: unifiedPrompt }
          : { prompt: unifiedPrompt },
      };

      const grantBlob = new Blob([JSON.stringify(grantData, null, 2)], {
        type: "application/json",
      });

      const grantUploadResult = await vanaContext.vana.data.uploadToStorage(
        grantBlob,
        "grant.json",
        false,
      );

      setStatus("Submitting transaction...");

      const txHandle =
        await vanaContext.vana.permissions.submitAddServerFilesAndPermissions({
          granteeId: BigInt(granteeId),
          grant: grantUploadResult.url,
          fileUrls: selectedFiles.map((f) => f.url),
          schemaIds: selectedFiles.map((f) => f.schemaId ?? 0),
          serverAddress: serverInfo.address as `0x${string}`,
          serverUrl: serverInfo.baseUrl,
          serverPublicKey: serverInfo.publicKey,
          filePermissions: selectedFiles.map(() => [
            {
              account: serverInfo.address as `0x${string}`,
              key: encryptedKey,
            },
          ]),
        });

      console.debug("Transaction submitted:", txHandle.hash);
      setStatus("Waiting for transaction confirmation...");

      const result = await vanaContext.vana.waitForTransactionEvents(txHandle);
      const permissionId = result.expectedEvents?.PermissionAdded?.permissionId;

      if (!permissionId) {
        throw new Error("Permission ID not found in transaction events");
      }

      setStatus(`Permission granted: ${permissionId}`);
      setStatus("Processing AI inference request...");

      const inferenceResponse = await fetch("/api/trusted-server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          permissionId: Number(permissionId),
        }),
      });

      if (!inferenceResponse.ok) {
        const errorText = await inferenceResponse.text();
        throw new Error(
          `API request failed: ${inferenceResponse.status} - ${errorText}`,
        );
      }

      const inferenceResult = await inferenceResponse.json();

      if (!inferenceResult.success) {
        throw new Error(inferenceResult.error ?? "API request failed");
      }

      if (inferenceResult.data?.id) {
        setOperationId(inferenceResult.data.id);
      }

      setStatus("AI inference completed!");
      const resultData = inferenceResult.data?.result ?? inferenceResult.data;
      const resultStr = JSON.stringify(resultData, null, 2);
      setResult(resultStr);

      try {
        if (resultData.artifacts && Array.isArray(resultData.artifacts)) {
          setArtifacts(resultData.artifacts);
        }
      } catch {
        // Not JSON or no artifacts
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setStatus(`Failed: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartFlow =
    mode === "manual" ? handleStartManualFlow : handleStartExistingFlow;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Vana Data Portability
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Process your data with AI while maintaining privacy
          </p>
        </div>

        {/* Mode Selection */}
        <Card className="p-4">
          <Label className="text-sm font-medium text-gray-700 mb-3 block">
            Data Source
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setMode("manual");
              }}
              className={`px-4 py-2 text-sm rounded transition-colors ${
                mode === "manual"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
              disabled={isProcessing}
            >
              Manual Entry
            </button>
            <button
              onClick={() => {
                setMode("existing");
              }}
              className={`px-4 py-2 text-sm rounded transition-colors ${
                mode === "existing"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
              disabled={isProcessing}
            >
              Existing Files
            </button>
          </div>
        </Card>

        {/* Wallet Connection */}
        <div>
          <WalletConnectButton disabled={isProcessing} />
        </div>

        {/* Google Drive Connection */}
        {walletConnected && (wallet?.address || address) && (
          <div>
            {!googleDriveConnected ? (
              <div className="space-y-4">
                <Button
                  onClick={() => {
                    connectGoogleDrive();
                  }}
                  disabled={googleDriveConnecting || isProcessing}
                  className="w-full"
                >
                  {googleDriveConnecting
                    ? "Connecting..."
                    : "Connect Google Drive"}
                </Button>
                {googleDriveError && (
                  <p className="text-red-600 text-sm mt-1">
                    {googleDriveError}
                  </p>
                )}
              </div>
            ) : (
              <Button
                onClick={disconnectGoogleDrive}
                disabled={isProcessing}
                variant="destructive"
                className="w-full"
              >
                Disconnect Google Drive
              </Button>
            )}
          </div>
        )}

        {/* Operation Mode & Prompt Configuration */}
        {walletConnected &&
          (wallet?.address || address) &&
          googleDriveConnected && (
            <Card className="p-4 space-y-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="useGemini"
                  checked={useGeminiAgent}
                  onChange={(e) => {
                    setUseGeminiAgent(e.target.checked);
                  }}
                  disabled={isProcessing}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <Label
                  htmlFor="useGemini"
                  className="text-sm font-medium text-gray-700"
                >
                  Use Gemini Agent for Comprehensive Analysis
                </Label>
              </div>

              <div>
                <Label
                  htmlFor="prompt"
                  className="text-sm font-medium text-gray-700 mb-2 block"
                >
                  {useGeminiAgent ? "Analysis Goal" : "AI Prompt"}
                </Label>
                <Textarea
                  id="prompt"
                  value={unifiedPrompt}
                  onChange={(e) => {
                    setUnifiedPrompt(e.target.value);
                  }}
                  rows={useGeminiAgent ? 8 : 2}
                  className="resize-none font-mono text-xs"
                  placeholder={
                    useGeminiAgent
                      ? "What should the Gemini agent analyze?"
                      : "Enter your prompt..."
                  }
                  disabled={isProcessing}
                />
                <div className="mt-1 text-xs text-gray-500">
                  {useGeminiAgent
                    ? "Gemini will analyze your entire data footprint based on this goal"
                    : mode === "manual"
                      ? "Use {{data}} to reference your uploaded data"
                      : "Use {{data}} to reference your file content"}
                </div>
              </div>
            </Card>
          )}

        {/* Manual Mode: User Data Input */}
        {mode === "manual" &&
          walletConnected &&
          wallet?.address &&
          googleDriveConnected && (
            <>
              {schema && (
                <Card className="p-4">
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">
                    Schema (ID: {schemaId})
                  </Label>
                  <pre className="text-xs bg-gray-50 p-3 rounded border border-gray-200 overflow-x-auto">
                    {JSON.stringify(schema.schema, null, 2)}
                  </pre>
                </Card>
              )}

              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Label
                    htmlFor="userData"
                    className="text-sm font-medium text-gray-700"
                  >
                    Your Data
                  </Label>
                  {schema && validationError && (
                    <span className="text-xs text-red-600">
                      ❌ {validationError}
                    </span>
                  )}
                  {schema && !validationError && userData && (
                    <span className="text-xs text-green-600">✓ Valid</span>
                  )}
                </div>
                <Textarea
                  id="userData"
                  value={userData}
                  onChange={(e) => {
                    setUserData(e.target.value);
                  }}
                  rows={4}
                  className="resize-none"
                  placeholder="Enter your data here..."
                  disabled={isProcessing}
                />
              </Card>
            </>
          )}

        {/* Existing Mode: File Selection */}
        {mode === "existing" &&
          walletConnected &&
          (wallet?.address || address) &&
          googleDriveConnected && (
            <>
              {isLoadingFiles ? (
                <Card className="p-4">
                  <div className="text-sm text-gray-500">
                    Loading your files...
                  </div>
                </Card>
              ) : (
                <FileSelector
                  files={userFiles}
                  selectedFileIds={selectedFileIds}
                  onSelectionChange={setSelectedFileIds}
                  isProcessing={isProcessing}
                />
              )}
            </>
          )}

        {/* Process Button */}
        {((mode === "manual" && walletConnected && googleDriveConnected) ||
          (mode === "existing" && selectedFileIds.length > 0)) && (
          <Button
            onClick={handleStartFlow}
            disabled={
              isProcessing ||
              !walletConnected ||
              !(wallet?.address ?? address) ||
              !googleDriveConnected ||
              !vanaContext.isInitialized ||
              (mode === "existing" && selectedFileIds.length === 0)
            }
            variant="default"
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400"
          >
            {isProcessing
              ? "Processing..."
              : mode === "existing" && selectedFileIds.length > 1
                ? `Process ${selectedFileIds.length} Files with AI`
                : "Process with AI"}
          </Button>
        )}

        {/* Status Display */}
        <Card className="p-4">
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Status
          </Label>
          <div className="text-gray-800 text-sm">{status}</div>
        </Card>

        {/* Results Display */}
        <Card className="p-4">
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            AI Inference Results
          </Label>
          <div className="bg-gray-50 rounded border border-gray-200 p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
              {result || "AI inference results will appear here..."}
            </pre>
          </div>
        </Card>

        {/* Artifacts Display */}
        <ArtifactDisplay
          artifacts={artifacts}
          operationId={operationId}
          onDownload={handleDownloadArtifact}
          onFetchContent={fetchArtifactContent}
        />
      </div>
    </div>
  );
}
