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
  PermissionGrantTypedData,
} from "@opendatalabs/vana-sdk/browser";
import type { VanaChain } from "@opendatalabs/vana-sdk/browser";
import { useWalletClient, useAccount as useWagmiAccount } from "wagmi";
import { useGoogleDriveOAuth, GoogleDriveTokens } from "./google-drive-oauth";

export interface VanaContextValue {
  vana: VanaInstance | null;
  isInitialized: boolean;
  error: Error | null;
  walletClient: WalletClient | null;
}

// Type guard to check if context is initialized
export function isVanaInitialized(
  context: VanaContextValue,
): context is VanaContextValue & {
  vana: VanaInstance;
  walletClient: WalletClient;
  isInitialized: true;
} {
  return (
    context.isInitialized &&
    context.vana !== null &&
    context.walletClient !== null
  );
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
    return;
  }

  const baseStorage = new GoogleDriveStorage({
    accessToken: googleDriveTokens.accessToken,
    refreshToken: googleDriveTokens.refreshToken,
  });

  try {
    const folderId = await baseStorage.findOrCreateFolder("Vana Data");
    providers["google-drive"] = new GoogleDriveStorage({
      accessToken: googleDriveTokens.accessToken,
      refreshToken: googleDriveTokens.refreshToken,
      folderId,
    });
  } catch (error) {
    console.warn("Failed to create Google Drive folder, using root:", error);
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

// Helper for permission grant callback
const createPermissionGrantCallback =
  (endpoint: string, address: string | undefined) =>
  async (typedData: PermissionGrantTypedData, signature: Hash) => {
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

// Note: File permission relaying is not yet implemented on the server side
// The submitFilePermission method will handle signing and submission directly
// through the SDK's built-in relayer support

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

  const { tokens: googleTokens, isConnected: hasGoogleTokens } =
    useGoogleDriveOAuth();

  useEffect(() => {
    if (!walletClient || !address) {
      setVana(null);
      setIsInitialized(false);
      return;
    }

    if (!googleTokens?.accessToken) {
      setVana(null);
      setIsInitialized(false);
      return;
    }

    const initializeVana = async () => {
      try {
        const storageProviders: Record<string, StorageProvider> = {};

        await setupGoogleDriveStorage(storageProviders, googleTokens);

        const relayerCallbacks = useGaslessTransactions
          ? {
              submitAddServerFilesAndPermissions:
                createAddServerFilesAndPermissionsCallback(
                  "/api/relay",
                  address,
                ),
              submitPermissionGrant: createPermissionGrantCallback(
                "/api/relay",
                address,
              ),
              // Note: submitFilePermission is not configured here as it requires
              // client-side encryption key generation. The SDK will fall back to
              // direct transaction submission for now.
            }
          : undefined;

        const defaultProvider = storageProviders["google-drive"]
          ? "google-drive"
          : undefined;

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
