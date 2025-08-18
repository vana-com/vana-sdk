"use client";

import { useState, useEffect, useCallback } from "react";
import { useModal, useAccount, useWallet } from "@getpara/react-sdk";
import { useGoogleDriveOAuth } from "../../providers/google-drive-oauth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useVana, isVanaInitialized } from "../../providers/vana-provider";
import type {
  CompleteSchema,
  VanaInstance,
} from "@opendatalabs/vana-sdk/browser";
import { SchemaValidator } from "@opendatalabs/vana-sdk/browser";
import Link from "next/link";
import type { Address } from "viem";

// Type definitions - extending UserFile to include optional properties
interface UserFile {
  id: number;
  url: string;
  ownerAddress: Address;
  addedAtBlock: bigint;
  schemaId?: number;
  addedAtTimestamp?: bigint;
  transactionHash?: Address;
}
interface SchemaWithCount {
  schema: CompleteSchema;
  fileCount: number;
}

interface SchemaExplorerState {
  schemas: SchemaWithCount[];
  userFiles: UserFile[];
  selectedSchemaId: number | null;
  selectedFileId: number | null;
  decryptedData: string;
  isLoadingSchemas: boolean;
  isDecrypting: boolean;
  schemaError: string | null;
  decryptionError: string | null;
  validationError: string | null;
}

function SchemaExplorerContent() {
  const { openModal } = useModal();
  const { isConnected: walletConnected, isLoading: walletLoading } =
    useAccount();
  const { data: wallet } = useWallet();
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
    selectedSchemaId: null,
    selectedFileId: null,
    decryptedData: "",
    isLoadingSchemas: false,
    isDecrypting: false,
    schemaError: null,
    decryptionError: null,
    validationError: null,
  });

  // Flow state (from original page)
  const [status, setStatus] = useState<string>(
    "Please connect your wallet first",
  );
  const [result, setResult] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>(
    "Based on this data: {{data}}, provide insights",
  );
  const [validator] = useState(() => new SchemaValidator());

  // Filtered files based on selected schema
  const filteredFiles = state.selectedSchemaId
    ? state.userFiles.filter((f) => f.schemaId === state.selectedSchemaId)
    : [];

  const selectedSchema = state.schemas.find(
    (s) => s.schema.id === state.selectedSchemaId,
  );

  // Load user files and schemas
  const loadUserDataAndSchemas = useCallback(
    async (vana: VanaInstance, userAddress: string) => {
      setState((prev) => ({
        ...prev,
        isLoadingSchemas: true,
        schemaError: null,
      }));

      try {
        // Fetch user's files
        const files = await vana.data.getUserFiles({
          owner: userAddress as `0x${string}`,
        });

        // TEMPORARY FIX: Patch schemaId until subgraph is fixed
        // TODO: Remove this when subgraph properly indexes schemaId
        // The subgraph is returning "0" for all schemaIds, but we know they should be 19
        // files = files.map((file) => ({
        //   ...file,
        //   schemaId: file.schemaId === 0 ? 19 : file.schemaId,
        // }));

        console.log(
          "Patched files:",
          files.map((f) => ({ id: f.id, schemaId: f.schemaId })),
        );

        if (!files || files.length === 0) {
          setState((prev) => ({
            ...prev,
            isLoadingSchemas: false,
            schemaError: "No files found for your account",
            userFiles: [],
            schemas: [],
          }));
          return;
        }

        // Extract unique schema IDs (excluding 0/null)
        const schemaIds = [
          ...new Set(
            files
              .map((f) => f.schemaId)
              .filter(
                (id): id is number => id !== undefined && id !== null && id > 0,
              ),
          ),
        ];

        if (schemaIds.length === 0) {
          setState((prev) => ({
            ...prev,
            isLoadingSchemas: false,
            schemaError: `Found ${files.length} file(s) but none have schemas attached. Files without schemas cannot be validated.`,
            userFiles: files,
            schemas: [],
          }));
          return;
        }

        // Fetch schema details for each unique ID
        const schemaPromises = schemaIds.map(async (id) => {
          try {
            const schema = await vana.schemas.get(id);
            const fileCount = files.filter((f) => f.schemaId === id).length;
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
            isLoadingSchemas: false,
            schemaError: "No JSON schemas found",
            userFiles: files,
            schemas: [],
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          isLoadingSchemas: false,
          schemas: jsonSchemas,
          userFiles: files,
          schemaError: null,
        }));
      } catch (error) {
        console.error("Failed to load user data:", error);
        setState((prev) => ({
          ...prev,
          isLoadingSchemas: false,
          schemaError:
            error instanceof Error ? error.message : "Failed to load schemas",
        }));
      }
    },
    [],
  );

  // Load data when wallet is connected
  useEffect(() => {
    if (isVanaInitialized(vanaContext) && wallet?.address && walletConnected) {
      loadUserDataAndSchemas(vanaContext.vana, wallet.address);
    }
  }, [vanaContext, wallet?.address, walletConnected, loadUserDataAndSchemas]);

  // Update status message
  useEffect(() => {
    if (isProcessing) return;

    if (!walletConnected) {
      setStatus("Please connect your wallet first");
    } else if (!googleDriveConnected && wallet?.address) {
      setStatus("Wallet connected. Please connect Google Drive to continue.");
    } else if (walletConnected && googleDriveConnected && wallet?.address) {
      if (state.isLoadingSchemas) {
        setStatus("Loading your schemas and files...");
      } else if (state.schemaError) {
        setStatus(state.schemaError);
      } else if (state.schemas.length > 0) {
        setStatus("Select a schema and file to begin");
      }
    }
  }, [
    walletConnected,
    wallet?.address,
    googleDriveConnected,
    isProcessing,
    state.isLoadingSchemas,
    state.schemaError,
    state.schemas.length,
  ]);

  // Handle schema selection
  const handleSchemaSelect = (schemaId: string) => {
    const id = parseInt(schemaId);
    setState((prev) => ({
      ...prev,
      selectedSchemaId: id,
      selectedFileId: null,
      decryptedData: "",
      validationError: null,
      decryptionError: null,
    }));
  };

  // Handle processing with existing file reference
  const handleStartFlow = async () => {
    if (
      !isVanaInitialized(vanaContext) ||
      !wallet?.address ||
      !state.selectedFileId
    ) {
      setStatus("Missing required data");
      return;
    }

    setIsProcessing(true);
    setStatus("Creating permission grant for existing file...");
    setResult("");

    try {
      // Get the selected file
      const selectedFile = state.userFiles.find(
        (f) => f.id === state.selectedFileId,
      );
      if (!selectedFile) {
        throw new Error("Selected file not found");
      }

      // Create grant parameters for the AI operation
      const appAddress = process.env.NEXT_PUBLIC_DATA_WALLET_APP_ADDRESS;
      if (!appAddress) {
        throw new Error(
          "NEXT_PUBLIC_DATA_WALLET_APP_ADDRESS environment variable is not set",
        );
      }

      setStatus("Creating permission grant for existing file...");

      // Use the permissions.grant method to grant access to the existing file
      const grantResult = await vanaContext.vana.permissions.grant({
        grantee: appAddress as `0x${string}`,
        operation: "llm_inference",
        files: [state.selectedFileId], // The existing file ID
        parameters: {
          prompt: aiPrompt,
        },
      });

      const permissionId = grantResult.permissionId;

      if (!permissionId) {
        throw new Error("Permission ID not found in transaction events");
      }

      const permissionIdStr = permissionId.toString();
      setStatus(`Permission ID received: ${permissionIdStr}`);

      // Submit inference request
      setStatus("Submitting AI inference request...");
      const response = await fetch("/api/trusted-server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          permissionId: Number(permissionId),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed: ${response.status} - ${errorText}`,
        );
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "API request failed");
      }

      const operationId = result.data?.id;
      if (!operationId) {
        throw new Error("Operation ID not found");
      }

      setStatus(`Inference request submitted. Operation ID: ${operationId}`);

      // Poll for results
      setStatus("Waiting for AI inference results...");
      const maxAttempts = 30;
      const pollInterval = 5000;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const pollResponse = await fetch("/api/trusted-server/poll", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operationId,
            chainId: 14800,
          }),
        });

        if (!pollResponse.ok) {
          throw new Error("Polling request failed");
        }

        const pollResult = await pollResponse.json();
        if (!pollResult.success) {
          throw new Error(pollResult.error || "Polling request failed");
        }

        if (pollResult.data?.status !== "processing") {
          setStatus("AI inference completed!");
          setResult(
            JSON.stringify(pollResult.data?.result || pollResult.data, null, 2),
          );
          break;
        }

        setStatus(
          `Polling attempt ${attempt}/${maxAttempts}: Still processing...`,
        );
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }
      }
    } catch (error) {
      setStatus(
        `Flow failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      console.error("Complete flow error:", error);
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
          <Button
            onClick={() => openModal()}
            disabled={walletLoading || isProcessing}
            className="w-full"
          >
            {walletLoading
              ? "Loading..."
              : walletConnected && wallet?.address
                ? wallet.address
                : "Connect Para Wallet"}
          </Button>
        </div>

        {/* Google Drive Connection */}
        {walletConnected && wallet?.address && (
          <div>
            {!googleDriveConnected ? (
              <div className="space-y-4">
                <Button
                  onClick={() => connectGoogleDrive()}
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

        {/* All Files View */}
        {false &&
          walletConnected &&
          wallet?.address &&
          googleDriveConnected &&
          !state.isLoadingSchemas && (
            <Card className="p-4">
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                All Your Files ({state.userFiles.length} total)
              </Label>
              {state.userFiles.length === 0 ? (
                <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-md border border-gray-200">
                  No files found for your wallet. Upload some files first using
                  the main Vana Vibes flow.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2 bg-gray-50">
                  {state.userFiles.map((file) => {
                    // Find the schema for this file
                    const fileSchema = state.schemas.find(
                      (s) => s.schema.id === file.schemaId,
                    );

                    return (
                      <div
                        key={file.id}
                        className={`py-1 px-2 hover:bg-gray-100 rounded text-xs font-mono cursor-pointer flex items-center justify-between ${
                          state.selectedFileId === file.id ? "bg-blue-100" : ""
                        }`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          // Just select the file for reference, no decryption needed
                          setState((prev) => ({
                            ...prev,
                            selectedSchemaId: file.schemaId || null,
                            selectedFileId: file.id,
                            decryptedData: "", // Clear any previous data
                            validationError: null,
                            decryptionError: null,
                          }));
                        }}
                      >
                        <div>
                          <span className="font-semibold">File #{file.id}</span>
                          {fileSchema ? (
                            <span
                              className="ml-2 text-blue-600 cursor-help"
                              title={
                                fileSchema.schema.description ||
                                `Schema: ${fileSchema.schema.name}`
                              }
                            >
                              {fileSchema.schema.name}
                            </span>
                          ) : file.schemaId && file.schemaId > 0 ? (
                            <span className="ml-2 text-orange-600">
                              Schema #{file.schemaId} (loading...)
                            </span>
                          ) : (
                            <span className="ml-2 text-gray-400">
                              No schema
                            </span>
                          )}
                          {file.addedAtTimestamp && (
                            <span className="ml-2 text-gray-500">
                              {new Date(
                                Number(file.addedAtTimestamp) * 1000,
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-blue-500">
                          Click to use
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {state.userFiles.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  Files with schemas:{" "}
                  {
                    state.userFiles.filter((f) => f.schemaId && f.schemaId > 0)
                      .length
                  }{" "}
                  | Without schemas:{" "}
                  {
                    state.userFiles.filter(
                      (f) => !f.schemaId || f.schemaId === 0,
                    ).length
                  }
                </p>
              )}
            </Card>
          )}

        {/* Schema Selection */}
        {walletConnected && wallet?.address && googleDriveConnected && (
          <Card className="p-4">
            <Label
              htmlFor="schema-select"
              className="text-sm font-medium text-gray-700 mb-2 block"
            >
              Select Schema
            </Label>
            {state.isLoadingSchemas ? (
              <div className="text-sm text-gray-500">Loading schemas...</div>
            ) : state.schemas.length > 0 ? (
              <select
                id="schema-select"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onChange={(e) => handleSchemaSelect(e.target.value)}
                value={state.selectedSchemaId || ""}
                disabled={isProcessing}
              >
                <option value="">Choose a schema...</option>
                {state.schemas.map((item) => (
                  <option key={item.schema.id} value={item.schema.id}>
                    {item.schema.name} (ID: {item.schema.id}) - {item.fileCount}{" "}
                    file{item.fileCount !== 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-sm text-gray-500">
                {state.schemaError || "No schemas found"}
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
                {selectedSchema.schema.version || "1.0.0"}
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

        {/* File Selection (only show if user selected a schema from dropdown) */}
        {state.selectedSchemaId &&
          state.selectedSchemaId > 0 &&
          filteredFiles.length > 0 && (
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
                    selectedFileId: fileId || null,
                  }));
                }}
                value={state.selectedFileId || ""}
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
                  </option>
                ))}
              </select>
              {state.isDecrypting && (
                <p className="text-sm text-gray-500 mt-2">Decrypting file...</p>
              )}
              {state.decryptionError && (
                <p className="text-sm text-red-600 mt-2">
                  {state.decryptionError}
                </p>
              )}
            </Card>
          )}

        {/* AI Prompt */}
        {state.selectedFileId && (
          <div>
            <Label
              htmlFor="aiPrompt"
              className="text-sm font-medium text-gray-700 mb-2 block"
            >
              AI Prompt
            </Label>
            <Textarea
              id="aiPrompt"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={2}
              className="resize-none"
              placeholder="Enter your AI prompt here..."
              disabled={isProcessing}
            />
          </div>
        )}

        {/* Process Button */}
        {state.selectedFileId && (
          <Button
            onClick={handleStartFlow}
            disabled={
              isProcessing ||
              !walletConnected ||
              !wallet?.address ||
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
      </div>
    </div>
  );
}

export default function SchemaExplorer() {
  return <SchemaExplorerContent />;
}
