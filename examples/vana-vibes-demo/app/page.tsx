"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useWallet } from "@getpara/react-sdk";
import { useGoogleDriveOAuth } from "../providers/google-drive-oauth";
import { DataPortabilityFlow } from "../lib/data-flow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { useVana, isVanaInitialized } from "../providers/vana-provider";
import type { DataSchema } from "@opendatalabs/vana-sdk/browser";
import { SchemaValidator } from "@opendatalabs/vana-sdk/browser";

function HomeContent() {
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
  const [status, setStatus] = useState<string>(
    "Please connect your wallet first",
  );
  const [result, setResult] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [userData, setUserData] = useState<string>(
    JSON.stringify(
      { message: "Vana is a layer 1 blockchain for user-owned data" },
      null,
      2,
    ),
  );
  const [aiPrompt, setAiPrompt] = useState<string>(
    "Based on this: {{data}}, what is Vana?",
  );
  const [schema, setSchema] = useState<DataSchema | null>(null);
  const [schemaId, setSchemaId] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string>("");
  const [validator] = useState(() => new SchemaValidator());

  useEffect(() => {
    if (isProcessing) {
      return;
    }

    if (!walletConnected) {
      setStatus("Please connect your wallet first");
    } else if (!googleDriveConnected && wallet?.address) {
      setStatus("Wallet connected. Please connect Google Drive to continue.");
    } else if (walletConnected && googleDriveConnected && wallet?.address) {
      setStatus("Ready to start data portability flow");
    }
  }, [walletConnected, wallet?.address, googleDriveConnected, isProcessing]);

  // Fetch schema
  useEffect(() => {
    if (!isVanaInitialized(vanaContext)) return;
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
  }, [vanaContext, vanaContext.walletClient?.chain?.id]);

  // Validate
  useEffect(() => {
    if (!schema || !userData) {
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
  }, [userData, schema, validator]);

  const handleStartFlow = async () => {
    const walletAddress = wallet?.address ?? address;
    if (!isVanaInitialized(vanaContext) || !walletAddress) {
      setStatus("Vana not initialized. Please connect your wallet.");
      return;
    }

    setIsProcessing(true);
    setStatus("Starting data portability flow...");
    setResult("");

    try {
      const flow = new DataPortabilityFlow(
        vanaContext.vana,
        vanaContext.walletClient,
        {
          onStatusUpdate: setStatus,
          onResultUpdate: setResult,
          onError: (error) => {
            console.error("Flow error:", error);
          },
        },
      );

      await flow.executeCompleteFlow(
        walletAddress,
        userData,
        aiPrompt,
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

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Vana Vibes Demo</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manual data entry with schema validation
          </p>
          <a
            href="/schema-explorer"
            className="text-sm text-blue-600 hover:text-blue-700 mt-2 inline-block"
          >
            Use existing files with schemas →
          </a>
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

        {/* Schema */}
        {walletConnected &&
          wallet?.address &&
          googleDriveConnected &&
          schema && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <Label className="text-sm font-medium text-blue-900 mb-2 block">
                Schema (ID: {schemaId})
              </Label>
              <pre className="text-xs bg-white p-3 rounded border border-blue-100 overflow-x-auto">
                {JSON.stringify(schema.schema, null, 2)}
              </pre>
            </div>
          )}

        {/* User Data Input */}
        {walletConnected && wallet?.address && googleDriveConnected && (
          <div className="space-y-4">
            <div>
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
            </div>
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
                onChange={(e) => {
                  setAiPrompt(e.target.value);
                }}
                rows={2}
                className="resize-none"
                placeholder="Enter your AI prompt here..."
                disabled={isProcessing}
              />
            </div>
          </div>
        )}

        {/* Start Data Portability Flow */}
        <Button
          onClick={handleStartFlow}
          disabled={
            isProcessing ||
            !walletConnected ||
            !(wallet?.address ?? address) ||
            !googleDriveConnected ||
            !vanaContext.isInitialized
          }
          variant="default"
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400"
        >
          {isProcessing ? "Processing..." : "Start Data Portability Flow"}
        </Button>

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

export default function Home() {
  return <HomeContent />;
}
