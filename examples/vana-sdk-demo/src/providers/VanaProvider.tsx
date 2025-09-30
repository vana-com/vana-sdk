"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useWalletClient } from "wagmi";
import {
  type DownloadRelayerCallbacks,
  type RelayerConfig,
  type UnifiedRelayerRequest,
  Vana,
  CallbackStorage,
  PinataStorage,
  GoogleDriveStorage,
  type VanaChain,
  type VanaInstance,
  type StorageProvider,
  type StorageCallbacks,
  type WalletClient,
  type Address,
} from "@opendatalabs/vana-sdk/browser";

interface VanaConfig {
  relayerUrl?: string;
  subgraphUrl?: string;
  rpcUrl?: string;
  pinataJwt?: string;
  pinataGateway?: string;
  defaultStorageProvider?: string;
  googleDriveAccessToken?: string;
  googleDriveRefreshToken?: string;
  googleDriveExpiresAt?: number | null;
  defaultPersonalServerUrl?: string;
}

export interface VanaContextValue {
  vana: VanaInstance | null;
  isInitialized: boolean;
  error: Error | null;
  applicationAddress: string;
  isReadOnly: boolean;
  readOnlyAddress?: string;
}

const VanaContext = createContext<VanaContextValue | undefined>(undefined);

interface VanaProviderProps {
  children: ReactNode;
  config: VanaConfig;
  useGaslessTransactions?: boolean;
  enableReadOnlyMode?: boolean;
  readOnlyAddress?: string;
}

// Helper to create storage providers
const createStorageProviders = (
  config: VanaConfig,
): Record<string, StorageProvider> => {
  // Create callback-based storage for app-managed IPFS
  const appIpfsCallbacks: StorageCallbacks = {
    async upload(blob: Blob, filename?: string) {
      const formData = new FormData();
      formData.append("file", blob, filename);
      const response = await fetch("/api/ipfs/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(
          `Upload failed: ${response.status} ${response.statusText}`,
        );
      }
      const data = await response.json();
      return {
        url: data.url ?? data.identifier,
        size: blob.size,
        contentType: blob.type ?? "application/octet-stream",
      };
    },
    async download(identifier: string) {
      const response = await fetch("/api/ipfs/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      if (!response.ok) {
        throw new Error(
          `Download failed: ${response.status} ${response.statusText}`,
        );
      }
      return response.blob();
    },
  };

  const providers: Record<string, StorageProvider> = {
    "app-ipfs": new CallbackStorage(appIpfsCallbacks),
  };

  if (config.pinataJwt) {
    console.info("👤 Adding user-managed Pinata IPFS storage");
    providers["user-ipfs"] = new PinataStorage({
      jwt: config.pinataJwt,
      gatewayUrl: config.pinataGateway ?? "https://gateway.pinata.cloud",
    });
  }

  return providers;
};

// Helper to setup Google Drive storage
const setupGoogleDriveStorage = async (
  config: VanaConfig,
  providers: Record<string, StorageProvider>,
) => {
  if (!config.googleDriveAccessToken) return;

  console.info("🔗 Adding Google Drive storage");
  const baseStorage = new GoogleDriveStorage({
    accessToken: config.googleDriveAccessToken,
    refreshToken: config.googleDriveRefreshToken,
  });

  try {
    const folderId = await baseStorage.findOrCreateFolder("Vana Data");
    console.info("📁 Using Google Drive folder:", folderId);
    providers["google-drive"] = new GoogleDriveStorage({
      accessToken: config.googleDriveAccessToken,
      refreshToken: config.googleDriveRefreshToken,
      folderId,
    });
  } catch (error) {
    console.warn("⚠️ Failed to create Google Drive folder, using root:", error);
    providers["google-drive"] = baseStorage;
  }
};

// Helper to determine default storage provider
const getDefaultProvider = (config: VanaConfig): string => {
  const requested = config.defaultStorageProvider ?? "app-ipfs";
  if (requested === "user-ipfs" && !config.pinataJwt) return "app-ipfs";
  if (requested === "google-drive" && !config.googleDriveAccessToken)
    return "app-ipfs";
  return requested;
};

// Helper to fetch application address
const fetchApplicationAddress = async (): Promise<string | null> => {
  try {
    const response = await fetch("/api/application-address");
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        console.info(
          "✅ Application address fetched:",
          data.data.applicationAddress,
        );
        return data.data.applicationAddress;
      }
    }
  } catch (error) {
    console.warn("⚠️ Failed to fetch application address:", error);
  }
  return null;
};

export function VanaProvider({
  children,
  config,
  useGaslessTransactions = true,
  enableReadOnlyMode = false,
  readOnlyAddress,
}: VanaProviderProps) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [vana, setVana] = useState<VanaInstance | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [applicationAddress, setApplicationAddress] = useState<string>("");
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Initialize Vana SDK when wallet is connected OR in read-only mode
  useEffect(() => {
    // Handle read-only mode
    if (enableReadOnlyMode && readOnlyAddress) {
      const initializeReadOnlyVana = async () => {
        try {
          console.info("📖 Initializing Vana SDK in read-only mode");

          // Initialize with just an address for read-only operations
          const vanaInstance = Vana({
            address: readOnlyAddress as Address,
            chain: walletClient?.chain, // Use chain from wallet if available, otherwise defaults to mainnet
            ...(config.subgraphUrl && { subgraphUrl: config.subgraphUrl }),
            defaultPersonalServerUrl: config.defaultPersonalServerUrl,
          });

          setVana(vanaInstance);
          setIsInitialized(true);
          setIsReadOnly(true);
          console.info("✅ Vana SDK initialized in read-only mode");

          // Fetch application address for display purposes
          const appAddress = await fetchApplicationAddress();
          if (appAddress) setApplicationAddress(appAddress);
        } catch (err) {
          console.error(
            "Failed to initialize Vana SDK in read-only mode:",
            err,
          );
          setError(
            err instanceof Error
              ? err
              : new Error("Failed to initialize Vana SDK in read-only mode"),
          );
          setIsInitialized(false);
        }
      };

      void initializeReadOnlyVana();
      return;
    }

    // Handle full mode (requires wallet)
    if (!isConnected || !walletClient?.account) {
      setVana(null);
      setIsInitialized(false);
      setIsReadOnly(false);
      return;
    }

    const initializeVana = async () => {
      try {
        console.info("🏢 Setting up app-managed IPFS storage");
        const storageProviders = createStorageProviders(config);
        await setupGoogleDriveStorage(config, storageProviders);
        const actualDefaultProvider = getDefaultProvider(config);

        // Create unified relayer callback - demonstrates the proper pattern
        const baseUrl = config.relayerUrl ?? window.location.origin;
        const relayer: RelayerConfig | undefined = useGaslessTransactions
          ? async (request: UnifiedRelayerRequest) => {
              const response = await fetch(`${baseUrl}/api/relay`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(request, (_key, value) =>
                  typeof value === "bigint" ? value.toString() : value,
                ),
              });
              if (!response.ok) {
                throw new Error(
                  `Relayer request failed: ${response.statusText}`,
                );
              }
              return response.json();
            }
          : undefined;

        // Create download relayer for CORS bypass
        const downloadRelayer: DownloadRelayerCallbacks = {
          async proxyDownload(url: string): Promise<Blob> {
            const response = await fetch("/api/proxy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url }),
            });

            if (!response.ok) {
              throw new Error(`Proxy download failed: ${response.statusText}`);
            }

            return response.blob();
          },
        };

        // Initialize Vana SDK in full mode
        const vanaInstance = Vana({
          walletClient: walletClient as WalletClient & { chain: VanaChain },
          relayer,
          downloadRelayer,
          ...(config.subgraphUrl && { subgraphUrl: config.subgraphUrl }),
          defaultPersonalServerUrl: config.defaultPersonalServerUrl,
          storage: {
            providers: storageProviders,
            defaultProvider: actualDefaultProvider,
          },
        });

        setVana(vanaInstance);
        setIsInitialized(true);
        setIsReadOnly(false);
        console.info(
          "✅ Vana SDK initialized in full mode:",
          vanaInstance.getConfig(),
        );

        // Fetch application address for permission granting
        const appAddress = await fetchApplicationAddress();
        if (appAddress) setApplicationAddress(appAddress);
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

    void initializeVana();
  }, [
    isConnected,
    walletClient,
    address,
    config.relayerUrl,
    config.subgraphUrl,
    config.defaultStorageProvider,
    useGaslessTransactions,
    enableReadOnlyMode,
    readOnlyAddress,
    // Note: Other config changes (Pinata, Google Drive) don't require full re-init
    // They can be handled by the storage provider setup
  ]);

  return (
    <VanaContext.Provider
      value={{
        vana,
        isInitialized,
        error,
        applicationAddress,
        isReadOnly,
        readOnlyAddress,
      }}
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
