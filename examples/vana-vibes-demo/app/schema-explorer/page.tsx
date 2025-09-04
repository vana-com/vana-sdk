/**
 * Schema Explorer Demo
 *
 * This demo showcases allowing users to filter and use
 * their encrypted files based on schemas OR Data Liquidity Pools (DLPs).
 *
 * Key concepts demonstrated:
 * - Schema-based file filtering: Find files that conform to specific data structures
 * - DLP-based file filtering: Find files processed by specific Data Liquidity Pools
 * - Combined filtering: Filter by both schema AND DLP for precise data selection
 * - Secure AI inference: Process filtered files with AI while maintaining encryption
 *
 * Flow:
 * 1. Connect wallet and Google Drive
 * 2. Select schema and/or DLP to filter user's files
 * 3. Choose a specific file from filtered results
 * 4. Process file with AI using secure server-side inference
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useWallet } from "@getpara/react-sdk";
import { useGoogleDriveOAuth } from "../../providers/google-drive-oauth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { useVana, isVanaInitialized } from "../../providers/vana-provider";
import type {
  CompleteSchema,
  VanaInstance,
} from "@opendatalabs/vana-sdk/browser";
import {
  generateEncryptionKey,
  encryptWithWalletPublicKey,
  BrowserPlatformAdapter,
  DEFAULT_ENCRYPTION_SEED,
} from "@opendatalabs/vana-sdk/browser";
import Link from "next/link";
import type { Address } from "viem";

// Define artifact type
interface Artifact {
  name: string;
  artifact_path: string;
  size: number;
}

// Extend Window interface for operation ID storage

// Type definitions - extending UserFile to include optional properties
interface UserFile {
  id: number;
  url: string;
  ownerAddress: Address;
  addedAtBlock: bigint;
  schemaId?: number;
  addedAtTimestamp?: bigint;
  transactionHash?: Address;
  dlpIds?: number[];
}
interface SchemaWithCount {
  schema: CompleteSchema;
  fileCount: number;
}

interface DLP {
  id: number;
  name: string;
  metadata?: string;
  status?: number;
}

interface DLPWithCount {
  dlp: DLP;
  fileCount: number;
}

interface SchemaExplorerState {
  // Data
  schemas: SchemaWithCount[];
  userFiles: UserFile[];
  dlpsWithCounts: DLPWithCount[];
  // Selection state
  selectedSchemaId: number | null;
  selectedDlpId: number | null;
  selectedFileId: number | null;
  // Loading state (unified)
  isLoading: {
    schemas: boolean;
    dlps: boolean;
  };
  // Error state (unified)
  errors: {
    schema: string | null;
    dlp: string | null;
  };
}

function SchemaExplorerContent() {
  const { isConnected: walletConnected, address } = useAccount();
  const walletLoading = false; // wagmi doesn't have isLoading
  const { data: wallet } = useWallet?.() ?? {};
  const vanaContext = useVana();
  const {
    isConnected: googleDriveConnected,
    isConnecting: googleDriveConnecting,
    error: googleDriveError,
    connect: connectGoogleDrive,
    disconnect: disconnectGoogleDrive,
  } = useGoogleDriveOAuth();

  // Main state
  const [state, setState] = useState<SchemaExplorerState>({
    schemas: [],
    userFiles: [],
    dlpsWithCounts: [],
    selectedSchemaId: null,
    selectedDlpId: null,
    selectedFileId: null,
    isLoading: {
      schemas: false,
      dlps: false,
    },
    errors: {
      schema: null,
      dlp: null,
    },
  });

  // Flow state (from original page)
  const [status, setStatus] = useState<string>(
    "Please connect your wallet first",
  );
  const [result, setResult] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [useGeminiAgent, setUseGeminiAgent] = useState<boolean>(false);

  // Unified prompt that switches based on mode
  const defaultLLMPrompt = "Based on this data: {{data}}, provide insights";
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
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const [artifactContents, setArtifactContents] = useState<
    Record<string, string>
  >({});
  const [operationId, setOperationId] = useState<string | undefined>();

  // Switch prompt when mode changes
  useEffect(() => {
    setUnifiedPrompt(useGeminiAgent ? defaultGeminiGoal : defaultLLMPrompt);
  }, [useGeminiAgent, defaultGeminiGoal, defaultLLMPrompt]);

  // Core filtering logic: Files can be filtered by schema, DLP, or both
  // This enables precise data selection for AI processing
  const filteredFiles = state.userFiles.filter((f: UserFile) => {
    // Schema filter: Match files with specific data structure
    const matchesSchema =
      !state.selectedSchemaId || f.schemaId === state.selectedSchemaId;
    // DLP filter: Match files processed by specific Data Liquidity Pool
    const matchesDlp =
      !state.selectedDlpId ||
      (f.dlpIds && f.dlpIds.includes(state.selectedDlpId));
    // Return files matching both filters (AND logic)
    return matchesSchema && matchesDlp;
  });

  const selectedSchema = state.schemas.find(
    (s) => s.schema.id === state.selectedSchemaId,
  );

  const selectedDlp = state.dlpsWithCounts.find(
    (d) => d.dlp.id === state.selectedDlpId,
  );

  // Load DLPs for user's files
  const loadUserDLPs = useCallback(
    async (vana: VanaInstance, files: UserFile[]) => {
      setState((prev) => ({
        ...prev,
        isLoading: { ...prev.isLoading, dlps: true },
        errors: { ...prev.errors, dlp: null },
      }));

      try {
        // Extract unique DLP IDs from user's files
        const dlpIds = [
          ...new Set(
            files
              .flatMap((f: UserFile) => f.dlpIds ?? [])
              .filter((id) => id > 0),
          ),
        ];

        if (dlpIds.length === 0) {
          setState((prev) => ({
            ...prev,
            isLoading: { ...prev.isLoading, dlps: false },
            dlpsWithCounts: [],
          }));
          return;
        }

        // Fetch DLP details for each unique ID
        const dlpPromises = dlpIds.map(async (id) => {
          try {
            const dlp = await vana.data.getDLP(id);
            const fileCount = files.filter(
              (f) => f.dlpIds && f.dlpIds.includes(id),
            ).length;
            return { dlp, fileCount };
          } catch (error) {
            console.error(`Failed to fetch DLP ${id}:`, error);
            return null;
          }
        });

        const dlpResults = await Promise.all(dlpPromises);
        const validDlps = dlpResults.filter(
          (result): result is DLPWithCount => result !== null,
        );

        setState((prev) => ({
          ...prev,
          isLoading: { ...prev.isLoading, dlps: false },
          dlpsWithCounts: validDlps,
        }));
      } catch (error) {
        console.error("Failed to load DLPs:", error);
        setState((prev) => ({
          ...prev,
          isLoading: { ...prev.isLoading, dlps: false },
          errors: {
            ...prev.errors,
            dlp: error instanceof Error ? error.message : "Failed to load DLPs",
          },
        }));
      }
    },
    [],
  );

  // Load user files and schemas
  const loadUserDataAndSchemas = useCallback(
    async (vana: VanaInstance, userAddress: string) => {
      setState((prev) => ({
        ...prev,
        isLoading: { ...prev.isLoading, schemas: true },
        errors: { ...prev.errors, schema: null },
      }));

      try {
        // Fetch user's files
        const files = await vana.data.getUserFiles({
          owner: userAddress as `0x${string}`,
        });

        if (!files || files.length === 0) {
          setState((prev) => ({
            ...prev,
            isLoading: { ...prev.isLoading, schemas: false },
            errors: {
              ...prev.errors,
              schema: "No files found for your account",
            },
            userFiles: [],
            schemas: [],
          }));
          return;
        }

        // Extract unique schema IDs (excluding 0/null)
        const schemaIds = [
          ...new Set(
            files
              .map((f: UserFile) => f.schemaId)
              .filter(
                (id): id is number => id !== undefined && id !== null && id > 0,
              ),
          ),
        ];

        if (schemaIds.length === 0) {
          setState((prev) => ({
            ...prev,
            isLoading: { ...prev.isLoading, schemas: false },
            errors: {
              ...prev.errors,
              schema: `Found ${files.length} file(s) but none have schemas attached. Files without schemas cannot be validated.`,
            },
            userFiles: files,
            schemas: [],
          }));
          return;
        }

        // Fetch schema details for each unique ID
        const schemaPromises = schemaIds.map(async (id) => {
          try {
            const schema = await vana.schemas.get(id);
            const fileCount = files.filter(
              (f: UserFile) => f.schemaId === id,
            ).length;
            return { schema, fileCount };
          } catch (error) {
            console.error(`Failed to fetch schema ${id}:`, error);
            return null;
          }
        });

        const schemaResults = await Promise.all(schemaPromises);

        // Filter for JSON schemas only and remove failed fetches
        const jsonSchemas = schemaResults.filter(
          (result): result is SchemaWithCount =>
            result !== null && result.schema.dialect === "json",
        );

        if (jsonSchemas.length === 0) {
          setState((prev) => ({
            ...prev,
            isLoading: { ...prev.isLoading, schemas: false },
            errors: { ...prev.errors, schema: "No JSON schemas found" },
            userFiles: files,
            schemas: [],
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          isLoading: { ...prev.isLoading, schemas: false },
          schemas: jsonSchemas,
          userFiles: files,
          errors: { ...prev.errors, schema: null },
        }));
      } catch (error) {
        console.error("Failed to load user data:", error);
        setState((prev) => ({
          ...prev,
          isLoading: { ...prev.isLoading, schemas: false },
          errors: {
            ...prev.errors,
            schema:
              error instanceof Error ? error.message : "Failed to load schemas",
          },
        }));
      }
    },
    [],
  );

  // Load data when wallet is connected
  useEffect(() => {
    const walletAddress = wallet?.address ?? address;
    if (isVanaInitialized(vanaContext) && walletAddress && walletConnected) {
      void loadUserDataAndSchemas(vanaContext.vana, walletAddress);
    }
  }, [
    vanaContext,
    wallet?.address,
    address,
    walletConnected,
    loadUserDataAndSchemas,
  ]);

  // Load DLPs after files are loaded
  useEffect(() => {
    if (isVanaInitialized(vanaContext) && state.userFiles.length > 0) {
      void loadUserDLPs(vanaContext.vana, state.userFiles);
    }
  }, [vanaContext, state.userFiles, loadUserDLPs]);

  // Update status message
  useEffect(() => {
    if (isProcessing) return;

    const walletAddress = wallet?.address ?? address;

    if (!walletConnected) {
      setStatus("Please connect your wallet first");
    } else if (!googleDriveConnected && walletAddress) {
      setStatus("Wallet connected. Please connect Google Drive to continue.");
    } else if (walletConnected && googleDriveConnected && walletAddress) {
      if (state.isLoading.schemas) {
        setStatus("Loading your schemas and files...");
      } else if (state.errors.schema) {
        setStatus(state.errors.schema);
      } else if (state.schemas.length > 0) {
        setStatus("Select a schema and file to begin");
      }
    }
  }, [
    walletConnected,
    wallet?.address,
    address,
    googleDriveConnected,
    isProcessing,
    state.isLoading.schemas,
    state.errors.schema,
    state.schemas.length,
  ]);

  // Handle schema selection
  const handleSchemaSelect = (schemaId: string) => {
    const id = schemaId ? parseInt(schemaId) : null;
    setState((prev) => ({
      ...prev,
      selectedSchemaId: id,
      selectedFileId: null,
    }));
  };

  // Handle DLP selection
  const handleDlpSelect = (dlpId: string) => {
    const id = dlpId ? parseInt(dlpId) : null;
    setState((prev) => ({
      ...prev,
      selectedDlpId: id,
      selectedFileId: null,
    }));
  };

  // Handle processing with existing file - now uses fixed contract that supports existing files
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

  const handleToggleArtifact = async (artifact: Artifact) => {
    if (expandedArtifact === artifact.artifact_path) {
      setExpandedArtifact(null);
    } else {
      setExpandedArtifact(artifact.artifact_path);

      // Fetch content if not cached
      if (!artifactContents[artifact.artifact_path]) {
        const content = await fetchArtifactContent(artifact);
        setArtifactContents((prev) => ({
          ...prev,
          [artifact.artifact_path]: content,
        }));
      }
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

      // Create download link
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

  const handleStartFlow = async () => {
    const walletAddress = wallet?.address ?? address;

    if (
      !isVanaInitialized(vanaContext) ||
      !walletAddress ||
      !state.selectedFileId
    ) {
      setStatus("Missing required data");
      return;
    }

    setIsProcessing(true);
    setResult("");
    setArtifacts([]);
    setExpandedArtifact(null);
    setOperationId(undefined);
    setArtifactContents({});

    try {
      setStatus("Preparing permission grant for existing file...");
      // Get the selected file
      const selectedFile = state.userFiles.find(
        (f) => f.id === state.selectedFileId,
      );
      if (!selectedFile) {
        throw new Error("Selected file not found");
      }

      // Get app address and grantee ID from environment
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

      // Get server info to get its public key
      const serverInfo = await vanaContext.vana.server.getIdentity({
        userAddress: walletAddress as `0x${string}`,
      });

      // Generate user's encryption key
      const platformAdapter = new BrowserPlatformAdapter();
      const userEncryptionKey = await generateEncryptionKey(
        vanaContext.walletClient,
        platformAdapter,
        DEFAULT_ENCRYPTION_SEED,
      );

      // Encrypt the encryption key with the server's public key
      const encryptedKey = await encryptWithWalletPublicKey(
        userEncryptionKey,
        serverInfo.publicKey,
        platformAdapter,
      );

      // Create grant data for the AI operation
      const grantData = {
        grantee: appAddress,
        operation: useGeminiAgent ? "prompt_gemini_agent" : "llm_inference",
        parameters: useGeminiAgent
          ? { goal: unifiedPrompt }
          : { prompt: unifiedPrompt },
      };

      // Create grant file blob
      const grantBlob = new Blob([JSON.stringify(grantData, null, 2)], {
        type: "application/json",
      });

      // Upload grant file to storage (using uploadToStorage to avoid blockchain registration)
      const grantUploadResult = await vanaContext.vana.data.uploadToStorage(
        grantBlob,
        "grant.json",
        false, // Don't encrypt the grant file
      );

      setStatus("Submitting transaction...");

      // Use submitAddServerFilesAndPermissions which now works for existing files
      const txHandle =
        await vanaContext.vana.permissions.submitAddServerFilesAndPermissions({
          granteeId: BigInt(granteeId),
          grant: grantUploadResult.url,
          fileUrls: [selectedFile.url], // Use the existing file's URL
          schemaIds: [selectedFile.schemaId ?? 0], // Use existing schema ID or 0
          serverAddress: serverInfo.address as `0x${string}`,
          serverUrl: serverInfo.baseUrl,
          serverPublicKey: serverInfo.publicKey,
          filePermissions: [
            [
              {
                account: serverInfo.address as `0x${string}`,
                key: encryptedKey, // Encryption key encrypted with server's public key
              },
            ],
          ],
        });

      console.debug("Transaction submitted:", txHandle.hash);
      setStatus("Waiting for transaction confirmation...");

      // Wait for transaction confirmation and extract permission ID from events
      const result = await vanaContext.vana.waitForTransactionEvents(txHandle);
      // Access the PermissionAdded event from expectedEvents
      const permissionId = result.expectedEvents?.PermissionAdded?.permissionId;

      if (!permissionId) {
        throw new Error(
          "Permission ID not found in transaction events. Cannot proceed with inference request.",
        );
      }

      setStatus(`Permission granted: ${permissionId}`);

      // Submit AI inference request and wait for result
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
          `API request failed: ${inferenceResponse.status} ${inferenceResponse.statusText} - ${errorText}`,
        );
      }

      const inferenceResult = await inferenceResponse.json();

      if (!inferenceResult.success) {
        throw new Error(inferenceResult.error ?? "API request failed");
      }

      // Store operation ID for artifact downloads
      if (inferenceResult.data?.id) {
        setOperationId(inferenceResult.data.id);
      }

      setStatus("AI inference completed!");
      const resultData = inferenceResult.data?.result ?? inferenceResult.data;
      const resultStr = JSON.stringify(resultData, null, 2);
      setResult(resultStr);

      // Parse and extract artifacts if present
      try {
        if (resultData.artifacts && Array.isArray(resultData.artifacts)) {
          setArtifacts(resultData.artifacts);
        }
      } catch {
        // Not JSON or no artifacts
      }
    } catch (error) {
      // Specific error handling based on operation phase
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (errorMessage.includes("Selected file not found")) {
        setStatus("Error: File selection issue - please try selecting again");
      } else if (errorMessage.includes("environment variable")) {
        setStatus("Error: Configuration missing - check environment setup");
      } else if (errorMessage.includes("transaction")) {
        setStatus(`Transaction failed: ${errorMessage}`);
      } else if (errorMessage.includes("Permission ID")) {
        setStatus(
          "Error: Permission grant failed - transaction may have reverted",
        );
      } else if (errorMessage.includes("API request failed")) {
        setStatus(`Server error: ${errorMessage}`);
      } else if (errorMessage.includes("timed out")) {
        setStatus("Processing timed out - please try again");
      } else {
        setStatus(`Failed: ${errorMessage}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header with navigation */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Schema Explorer</h1>
          <p className="mt-2 text-sm text-gray-600">
            Use your existing data with schemas
          </p>
          <Link
            href="/"
            className="text-sm text-blue-600 hover:text-blue-700 mt-2 inline-block"
          >
            ← Back to Manual Entry
          </Link>
        </div>

        {/* Wallet Connection */}
        <div>
          <WalletConnectButton disabled={walletLoading || isProcessing} />
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

        {/* Schema Selection */}
        {walletConnected &&
          (wallet?.address || address) &&
          googleDriveConnected && (
            <Card className="p-4">
              <Label
                htmlFor="schema-select"
                className="text-sm font-medium text-gray-700 mb-2 block"
              >
                Select Schema
              </Label>
              {state.isLoading.schemas ? (
                <div className="text-sm text-gray-500">Loading schemas...</div>
              ) : state.schemas.length > 0 ? (
                <select
                  id="schema-select"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onChange={(e) => {
                    handleSchemaSelect(e.target.value);
                  }}
                  value={state.selectedSchemaId ?? ""}
                  disabled={isProcessing}
                >
                  <option value="">Choose a schema...</option>
                  {state.schemas.map((item) => (
                    <option key={item.schema.id} value={item.schema.id}>
                      {item.schema.name} (ID: {item.schema.id}) -{" "}
                      {item.fileCount} file{item.fileCount !== 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-gray-500">
                  {state.errors.schema ?? "No schemas found"}
                </div>
              )}
            </Card>
          )}

        {/* DLP Selection */}
        {walletConnected &&
          (wallet?.address || address) &&
          googleDriveConnected && (
            <Card className="p-4">
              <Label
                htmlFor="dlp-select"
                className="text-sm font-medium text-gray-700 mb-2 block"
              >
                Select DLP (Optional)
              </Label>
              {state.isLoading.dlps ? (
                <div className="text-sm text-gray-500">Loading DLPs...</div>
              ) : state.dlpsWithCounts.length > 0 ? (
                <select
                  id="dlp-select"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onChange={(e) => {
                    handleDlpSelect(e.target.value);
                  }}
                  value={state.selectedDlpId ?? ""}
                  disabled={isProcessing}
                >
                  <option value="">Choose a DLP...</option>
                  {state.dlpsWithCounts.map((item) => (
                    <option key={item.dlp.id} value={item.dlp.id}>
                      {item.dlp.name} (ID: {item.dlp.id}) - {item.fileCount}{" "}
                      file{item.fileCount !== 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-gray-500">
                  {state.errors.dlp ?? "No DLPs found for your files"}
                </div>
              )}
            </Card>
          )}

        {/* Schema Description */}
        {selectedSchema && (
          <Card className="p-4 bg-blue-50">
            <Label className="text-sm font-medium text-blue-900 mb-2 block">
              Schema Details
            </Label>
            <div className="text-sm text-gray-700">
              <p>
                <strong>Name:</strong> {selectedSchema.schema.name}
              </p>
              <p>
                <strong>Version:</strong>{" "}
                {selectedSchema.schema.version ?? "1.0.0"}
              </p>
              {selectedSchema.schema.description && (
                <p>
                  <strong>Description:</strong>{" "}
                  {selectedSchema.schema.description}
                </p>
              )}
              <p>
                <strong>Dialect:</strong> {selectedSchema.schema.dialect}
              </p>
              <p>
                <strong>Files using this schema:</strong>{" "}
                {selectedSchema.fileCount}
              </p>
            </div>
          </Card>
        )}

        {/* DLP Description */}
        {selectedDlp && (
          <Card className="p-4 bg-purple-50">
            <Label className="text-sm font-medium text-purple-900 mb-2 block">
              DLP Details
            </Label>
            <div className="text-sm text-gray-700">
              <p>
                <strong>Name:</strong> {selectedDlp.dlp.name}
              </p>
              <p>
                <strong>ID:</strong> {selectedDlp.dlp.id}
              </p>
              {selectedDlp.dlp.metadata && (
                <p>
                  <strong>Metadata:</strong> {selectedDlp.dlp.metadata}
                </p>
              )}
              <p>
                <strong>Files processed by this DLP:</strong>{" "}
                {selectedDlp.fileCount}
              </p>
            </div>
          </Card>
        )}

        {/* File Selection (show if user selected a schema or DLP) */}
        {(state.selectedSchemaId || state.selectedDlpId) &&
          (filteredFiles.length > 0 ? (
            <Card className="p-4">
              <Label
                htmlFor="file-select"
                className="text-sm font-medium text-gray-700 mb-2 block"
              >
                Select File
              </Label>
              <select
                id="file-select"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onChange={(e) => {
                  const fileId = parseInt(e.target.value);
                  setState((prev) => ({
                    ...prev,
                    selectedFileId: fileId ?? null,
                  }));
                }}
                value={state.selectedFileId ?? ""}
                disabled={isProcessing}
              >
                <option value="">Choose a file...</option>
                {filteredFiles.map((file) => (
                  <option key={file.id} value={file.id}>
                    File #{file.id} -{" "}
                    {file.addedAtTimestamp
                      ? new Date(
                          Number(file.addedAtTimestamp) * 1000,
                        ).toLocaleDateString()
                      : "Unknown date"}
                    {file.dlpIds &&
                      file.dlpIds.length > 0 &&
                      ` (${file.dlpIds.length} DLP${file.dlpIds.length > 1 ? "s" : ""})`}
                  </option>
                ))}
              </select>
            </Card>
          ) : (
            <Card className="p-4">
              <p className="text-sm text-gray-500">
                No files found matching the selected{" "}
                {state.selectedSchemaId && state.selectedDlpId
                  ? "schema and DLP"
                  : state.selectedSchemaId
                    ? "schema"
                    : "DLP"}
                .
              </p>
            </Card>
          ))}

        {/* Operation Mode & Prompt Configuration */}
        {state.selectedFileId && (
          <div className="space-y-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
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
                  ? "Gemini will analyze your selected file and related data based on this goal"
                  : "Use {{data}} to reference your file content"}
              </div>
            </div>
          </div>
        )}

        {/* Process Button */}
        {state.selectedFileId && (
          <Button
            onClick={handleStartFlow}
            disabled={
              isProcessing ||
              !walletConnected ||
              !(wallet?.address ?? address) ||
              !googleDriveConnected ||
              !state.selectedFileId ||
              !vanaContext.isInitialized
            }
            variant="default"
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400"
          >
            {isProcessing ? "Processing..." : "Process with AI"}
          </Button>
        )}

        {/* Status Display */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Status
          </Label>
          <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
            <p className="text-gray-800 text-sm">{status}</p>
          </div>
        </div>

        {/* Results Display */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            AI Inference Results
          </Label>
          <Textarea
            value={result}
            readOnly
            rows={8}
            className="font-mono resize-none"
            placeholder="AI inference results will appear here..."
          />
        </div>

        {/* Artifacts Display */}
        {artifacts.length > 0 && (
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              Generated Artifacts
            </Label>
            <div className="space-y-2">
              {artifacts.map((artifact, index) => (
                <div
                  key={index}
                  className="bg-gray-100 border border-gray-300 rounded-lg overflow-hidden"
                >
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          {artifact.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          Size: {artifact.size} bytes
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleToggleArtifact(artifact)}
                          className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 cursor-pointer"
                          type="button"
                        >
                          {expandedArtifact === artifact.artifact_path
                            ? "Hide"
                            : "View"}
                        </button>
                        <button
                          onClick={() => handleDownloadArtifact(artifact)}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
                          type="button"
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  </div>

                  {expandedArtifact === artifact.artifact_path && (
                    <div className="border-t border-gray-300 bg-white p-4">
                      <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                        {artifactContents[artifact.artifact_path] ||
                          "Loading..."}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SchemaExplorer() {
  return <SchemaExplorerContent />;
}
