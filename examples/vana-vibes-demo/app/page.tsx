"use client";

import { useState, useEffect } from "react";
import { useModal, useAccount, useWallet } from "@getpara/react-sdk";
import { useGoogleDriveOAuth } from "../providers/google-drive-oauth";
import { DataPortabilityFlow } from "../lib/data-flow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useVana } from "../providers/vana-provider";

function HomeContent() {
  const { openModal } = useModal();
  const { isConnected: walletConnected, isLoading: walletLoading } =
    useAccount();
  const { data: wallet } = useWallet();
  const { vana, isInitialized: isVanaInitialized, walletClient } = useVana();
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
    "Vana is a layer 1 blockchain for user-owned data",
  );
  const [aiPrompt, setAiPrompt] = useState<string>(
    "Based on this: {{data}}, what is Vana?",
  );

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

  const handleWalletModal = () => {
    openModal();
  };

  const handleStartFlow = async () => {
    if (!isVanaInitialized || !vana || !wallet?.address || !walletClient) {
      setStatus("Vana not initialized. Please connect your wallet.");
      return;
    }

    setIsProcessing(true);
    setStatus("Starting data portability flow...");
    setResult("");

    try {
      const flow = new DataPortabilityFlow(vana, walletClient, {
        onStatusUpdate: setStatus,
        onResultUpdate: setResult,
        onError: (error) => {
          console.error("Flow error:", error);
        },
      });

      await flow.executeCompleteFlow(wallet.address, userData, aiPrompt);
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
        </div>

        {/* Wallet Connection */}
        <div>
          <Button
            onClick={handleWalletModal}
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

        {/* User Data Input */}
        {walletConnected && wallet?.address && googleDriveConnected && (
          <div className="space-y-4">
            <div>
              <Label
                htmlFor="userData"
                className="text-sm font-medium text-gray-700 mb-2 block"
              >
                Your Data
              </Label>
              <Textarea
                id="userData"
                value={userData}
                onChange={(e) => setUserData(e.target.value)}
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
                onChange={(e) => setAiPrompt(e.target.value)}
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
            !wallet?.address ||
            !googleDriveConnected ||
            !isVanaInitialized
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
