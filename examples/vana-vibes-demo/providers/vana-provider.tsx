"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  Vana,
  VanaInstance,
  StorageProvider,
  GoogleDriveStorage,
  WalletClient,
  Hash,
  ServerFilesAndPermissionTypedData,
} from "@opendatalabs/vana-sdk/browser";
import type { VanaChain } from "@opendatalabs/vana-sdk/browser";
import { useWalletClient, useAccount as useWagmiAccount } from "wagmi";
import {
  useGoogleTokens,
  GoogleDriveTokens,
} from "../contexts/GoogleTokenContext";

export interface VanaContextValue {
  vana: VanaInstance | null;
  isInitialized: boolean;
  error: Error | null;
  walletClient: WalletClient | null;
}

const VanaContext = createContext<VanaContextValue | undefined>(undefined);

interface VanaProviderProps {
  children: ReactNode;
  useGaslessTransactions?: boolean;
}

// Helper to serialize bigint values for JSON
const serializeBigInt = (data: unknown) =>
  JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );

// Helper to setup Google Drive storage with tokens from context
const setupGoogleDriveStorage = async (
  providers: Record<string, StorageProvider>,
  googleDriveTokens: GoogleDriveTokens | null,
) => {
  if (!googleDriveTokens?.accessToken) {
    console.info(
      "🔍 Google Drive tokens not available, skipping storage setup",
    );
    return;
  }

  console.info("🔗 Adding Google Drive storage");
  const baseStorage = new GoogleDriveStorage({
    accessToken: googleDriveTokens.accessToken,
    refreshToken: googleDriveTokens.refreshToken,
  });

  try {
    const folderId = await baseStorage.findOrCreateFolder("Vana Data");
    console.info("📁 Using Google Drive folder:", folderId);
    providers["google-drive"] = new GoogleDriveStorage({
      accessToken: googleDriveTokens.accessToken,
      refreshToken: googleDriveTokens.refreshToken,
      folderId,
    });
  } catch (error) {
    console.warn("⚠️ Failed to create Google Drive folder, using root:", error);
    providers["google-drive"] = baseStorage;
  }
};

// Helper for add server files and permissions specific callback
const createAddServerFilesAndPermissionsCallback =
  (endpoint: string, address: string | undefined) =>
  async (typedData: ServerFilesAndPermissionTypedData, signature: Hash) => {
    const baseUrl = window.location.origin;
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        typedData: serializeBigInt(typedData),
        signature,
        expectedUserAddress: address,
      }),
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Failed to submit to relayer");
    }

    return result.transactionHash as `0x${string}`;
  };

export function VanaProvider({
  children,
  useGaslessTransactions = true,
}: VanaProviderProps) {
  const [vana, setVana] = useState<VanaInstance | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentWalletClient, setCurrentWalletClient] =
    useState<WalletClient | null>(null);
  const { address } = useWagmiAccount();
  const { data: walletClient } = useWalletClient();

  // Get Google tokens from context
  const { tokens: googleTokens, isConnected: hasGoogleTokens } =
    useGoogleTokens();

  // Initialize Vana SDK when wallet is connected, reactive to token changes
  useEffect(() => {
    if (!walletClient || !address) {
      setVana(null);
      setIsInitialized(false);
      return;
    }

    const initializeVana = async () => {
      try {
        const storageProviders: Record<string, StorageProvider> = {};

        // Setup Google Drive storage if tokens are available
        await setupGoogleDriveStorage(storageProviders, googleTokens);

        // Create relayer callbacks if using gasless transactions
        const relayerCallbacks = useGaslessTransactions
          ? {
              submitAddServerFilesAndPermissions:
                createAddServerFilesAndPermissionsCallback(
                  "/api/relay",
                  address,
                ),
            }
          : undefined;

        // Determine default provider based on available storage
        const defaultProvider = storageProviders["google-drive"]
          ? "google-drive"
          : undefined;

        if (!defaultProvider) {
          console.info(
            "🔍 No storage providers available - initializing Vana SDK without storage",
          );
        }

        // Initialize Vana SDK
        const vanaInstance = Vana({
          walletClient: walletClient as WalletClient & { chain: VanaChain },
          relayerCallbacks,
          defaultPersonalServerUrl:
            process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL,
          storage: {
            providers: storageProviders,
            defaultProvider,
          },
        });

        setVana(vanaInstance);
        setCurrentWalletClient(walletClient);
        setIsInitialized(true);
        console.info("✅ Vana SDK initialized:", {
          hasGoogleDrive: !!storageProviders["google-drive"],
          defaultProvider,
          config: vanaInstance.getConfig(),
        });
      } catch (err) {
        console.error("Failed to initialize Vana SDK:", err);
        setError(
          err instanceof Error
            ? err
            : new Error("Failed to initialize Vana SDK"),
        );
        setIsInitialized(false);
      }
    };

    initializeVana();
  }, [
    walletClient,
    address,
    useGaslessTransactions,
    googleTokens,
    hasGoogleTokens,
  ]);

  return (
    <VanaContext.Provider
      value={{ vana, isInitialized, error, walletClient: currentWalletClient }}
    >
      {children}
    </VanaContext.Provider>
  );
}

export function useVana() {
  const context = useContext(VanaContext);
  if (context === undefined) {
    throw new Error("useVana must be used within a VanaProvider");
  }
  return context;
}
