"use client";

import { useState, useEffect } from "react";
import { useModal } from "@getpara/react-sdk";
import { useParaAuth } from "../hooks/useParaAuth";
import { useGoogleDriveAuth } from "../hooks/useGoogleDriveAuth";
import { DataPortabilityFlow } from "../lib/data-flow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useVana } from "../providers/vana-provider";

function HomeContent() {
  const { openModal } = useModal();
  const {
    user,
    isAuthenticated,
    isAuthenticating,
    error,
    walletConnected,
    walletLoading,
    disconnect,
  } = useParaAuth();
  const { vana, isInitialized: isVanaInitialized, walletClient } = useVana();
  const {
    isConnected: googleDriveConnected,
    isConnecting: googleDriveConnecting,
    error: googleDriveError,
    connect: connectGoogleDrive,
    disconnect: disconnectGoogleDrive,
  } = useGoogleDriveAuth();
  const [status, setStatus] = useState<string>(
    "Please connect and authenticate your wallet first",
  );
  const [result, setResult] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Update status based on authentication state
  useEffect(() => {
    if (isProcessing) {
      // Don't update status while processing
      return;
    }

    if (!walletConnected) {
      setStatus("Please connect and authenticate your wallet first");
    } else if (isAuthenticating) {
      setStatus("Authenticating with wallet...");
    } else if (error) {
      setStatus(`Authentication error: ${error}`);
    } else if (!googleDriveConnected && isAuthenticated && user?.address) {
      setStatus("Wallet connected. Please connect Google Drive to continue.");
    } else if (isAuthenticated && googleDriveConnected && user?.address) {
      setStatus("Ready to start data portability flow");
    } else if (walletConnected && !isAuthenticated) {
      setStatus("Wallet connected, completing authentication...");
    }
  }, [
    walletConnected,
    isAuthenticating,
    isAuthenticated,
    error,
    user?.address,
    googleDriveConnected,
    isProcessing,
  ]);

  const handleConnect = () => {
    console.debug("handleConnect");
    openModal();
  };

  const handleDisconnectClick = async () => {
    setStatus("Disconnecting wallet...");
    setResult("");
    setIsProcessing(true);

    try {
      await disconnect();
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  };

  const handleStartFlow = async () => {
    if (!isVanaInitialized || !vana || !user?.address || !walletClient) {
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

      await flow.executeCompleteFlow(user.address);
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
          <h1 className="text-3xl font-bold text-gray-900">
            Vana DataWallet Demo
          </h1>
        </div>

        {/* Wallet Connection */}
        <div>
          {!walletConnected ? (
            <Button
              onClick={handleConnect}
              disabled={walletLoading}
              className="w-full"
            >
              {walletLoading ? "Loading..." : "Connect Para Wallet"}
            </Button>
          ) : (
            <div className="space-y-4">
              {isAuthenticating ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800 font-medium">
                    Authenticating...
                  </p>
                  <p className="text-yellow-600 text-sm mt-1">
                    Please sign the message in your wallet to complete
                    authentication
                  </p>
                </div>
              ) : isAuthenticated ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-green-800 font-medium">
                    Wallet Connected & Authenticated
                  </p>
                  <p className="text-green-600 text-sm font-mono mt-1">
                    {user?.address}
                  </p>
                  {user?.email && (
                    <p className="text-green-600 text-xs mt-1">
                      Email: {user.email}
                    </p>
                  )}
                </div>
              ) : error ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 font-medium">
                    Authentication Failed
                  </p>
                  <p className="text-red-600 text-sm mt-1">{error}</p>
                  <Button
                    onClick={() => window.location.reload()}
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-red-700"
                  >
                    Try Again
                  </Button>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800 font-medium">
                    Wallet Connected
                  </p>
                  <p className="text-yellow-600 text-sm mt-1">
                    Authentication in progress...
                  </p>
                </div>
              )}

              <Button
                onClick={handleDisconnectClick}
                disabled={isProcessing}
                variant="destructive"
                className="w-full"
              >
                Disconnect Wallet
              </Button>
            </div>
          )}
        </div>

        {/* Google Drive Connection */}
        {isAuthenticated && (
          <div>
            {!googleDriveConnected ? (
              <div className="space-y-4">
                <Button
                  onClick={() =>
                    user?.address && connectGoogleDrive(user.address)
                  }
                  disabled={
                    googleDriveConnecting || isProcessing || !user?.address
                  }
                  className="w-full"
                >
                  {googleDriveConnecting
                    ? "Connecting..."
                    : "Connect Google Drive"}
                </Button>
                {googleDriveError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800 font-medium">Connection Error</p>
                    <p className="text-red-600 text-sm mt-1">
                      {googleDriveError}
                    </p>
                  </div>
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

        {/* Start Data Portability Flow */}
        <Button
          onClick={handleStartFlow}
          disabled={
            isProcessing ||
            !isAuthenticated ||
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
