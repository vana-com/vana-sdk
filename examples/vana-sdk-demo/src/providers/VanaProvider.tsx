"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useAccount, useWalletClient } from "wagmi";
import {
  Vana,
  VanaInstance,
  StorageProvider,
  CallbackStorage,
  StorageCallbacks,
  PinataStorage,
  GoogleDriveStorage,
  WalletClient,
  Hash,
  Address,
  GrantFile,
  PermissionGrantTypedData,
  GenericTypedData,
  TrustServerTypedData,
  UntrustServerTypedData,
} from "@opendatalabs/vana-sdk/browser";
import type { VanaChain } from "@opendatalabs/vana-sdk/browser";

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
}

const VanaContext = createContext<VanaContextValue | undefined>(undefined);

interface VanaProviderProps {
  children: ReactNode;
  config: VanaConfig;
  useGaslessTransactions?: boolean;
}

// Helper to serialize bigint values for JSON
const serializeBigInt = (data: unknown) =>
  JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );

// Helper to make relayer requests
const submitToRelayer = async (
  endpoint: string,
  payload: Record<string, unknown>,
  baseUrl: string,
): Promise<{
  success: boolean;
  error?: string;
  fileId?: string;
  transactionHash?: string;
  [key: string]: unknown;
}> => {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || "Failed to submit to relayer");
  }
  return result;
};

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
        url: data.url || data.identifier,
        size: blob.size,
        contentType: blob.type || "application/octet-stream",
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
      gatewayUrl: config.pinataGateway || "https://gateway.pinata.cloud",
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
  const requested = config.defaultStorageProvider || "app-ipfs";
  if (requested === "user-ipfs" && !config.pinataJwt) return "app-ipfs";
  if (requested === "google-drive" && !config.googleDriveAccessToken)
    return "app-ipfs";
  return requested;
};

// Helper to create typed data submission callback
const createSubmitCallback =
  (endpoint: string, baseUrl: string, address: string | undefined) =>
  async (typedData: GenericTypedData, signature: Hash) => {
    const result = await submitToRelayer(
      endpoint,
      {
        typedData: serializeBigInt(typedData),
        signature,
        expectedUserAddress: address,
      },
      baseUrl,
    );
    return result.transactionHash as Hash;
  };

// Helper for permission grant specific callback
const createPermissionGrantCallback =
  (endpoint: string, baseUrl: string, address: string | undefined) =>
  async (typedData: PermissionGrantTypedData, signature: Hash) => {
    const result = await submitToRelayer(
      endpoint,
      {
        typedData: serializeBigInt(typedData),
        signature,
        expectedUserAddress: address,
      },
      baseUrl,
    );
    return result.transactionHash as Hash;
  };

// Helper for trust server specific callback
const createTrustServerCallback =
  (endpoint: string, baseUrl: string, address: string | undefined) =>
  async (typedData: TrustServerTypedData, signature: Hash) => {
    const result = await submitToRelayer(
      endpoint,
      {
        typedData: serializeBigInt(typedData),
        signature,
        expectedUserAddress: address,
      },
      baseUrl,
    );
    return result.transactionHash as Hash;
  };

// Helper for untrust server specific callback
const createUntrustServerCallback =
  (endpoint: string, baseUrl: string, address: string | undefined) =>
  async (typedData: UntrustServerTypedData, signature: Hash) => {
    const result = await submitToRelayer(
      endpoint,
      {
        typedData: serializeBigInt(typedData),
        signature,
        expectedUserAddress: address,
      },
      baseUrl,
    );
    return result.transactionHash as Hash;
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
}: VanaProviderProps) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [vana, setVana] = useState<VanaInstance | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [applicationAddress, setApplicationAddress] = useState<string>("");

  // Initialize Vana SDK when wallet is connected
  useEffect(() => {
    if (!isConnected || !walletClient || !walletClient.account) {
      setVana(null);
      setIsInitialized(false);
      return;
    }

    const initializeVana = async () => {
      try {
        console.info("🏢 Setting up app-managed IPFS storage");
        const storageProviders = createStorageProviders(config);
        await setupGoogleDriveStorage(config, storageProviders);
        const actualDefaultProvider = getDefaultProvider(config);

        // Create relayer callbacks if using gasless transactions
        const baseUrl = config.relayerUrl || window.location.origin;
        const relayerCallbacks = useGaslessTransactions
          ? {
              submitPermissionGrant: createPermissionGrantCallback(
                "/api/relay",
                baseUrl,
                address,
              ),
              submitPermissionRevoke: createSubmitCallback(
                "/api/relay",
                baseUrl,
                address,
              ),
              submitTrustServer: createTrustServerCallback(
                "/api/relay",
                baseUrl,
                address,
              ),
              submitUntrustServer: createUntrustServerCallback(
                "/api/relay",
                baseUrl,
                address,
              ),

              async submitFileAddition(url: string, userAddress: string) {
                const result = await submitToRelayer(
                  "/api/relay/addFile",
                  { url, userAddress },
                  baseUrl,
                );
                return {
                  fileId: Number(result.fileId) || 0,
                  transactionHash: result.transactionHash as Hash,
                };
              },

              async submitFileAdditionWithPermissions(
                url: string,
                userAddress: string,
                permissions: Array<{ account: string; key: string }>,
              ) {
                const result = await submitToRelayer(
                  "/api/relay/addFileWithPermissions",
                  { url, userAddress, permissions },
                  baseUrl,
                );
                return {
                  fileId: Number(result.fileId) || 0,
                  transactionHash: result.transactionHash as Hash,
                };
              },

              async submitFileAdditionComplete(params: {
                url: string;
                userAddress: Address;
                permissions: Array<{ account: Address; key: string }>;
                schemaId: number;
              }) {
                const result = await submitToRelayer(
                  "/api/relay/addFileComplete",
                  params,
                  baseUrl,
                );
                return {
                  fileId: Number(result.fileId) || 0,
                  transactionHash: result.transactionHash as Hash,
                };
              },

              async storeGrantFile(grantData: GrantFile) {
                try {
                  const formData = new FormData();
                  formData.append(
                    "file",
                    new Blob([JSON.stringify(grantData, null, 2)], {
                      type: "application/json",
                    }),
                    "grant-file.json",
                  );

                  const response = await fetch(`${baseUrl}/api/ipfs/upload`, {
                    method: "POST",
                    body: formData,
                  });

                  if (!response.ok)
                    throw new Error(
                      `IPFS upload failed: ${response.statusText}`,
                    );

                  const result = await response.json();
                  if (!result.success)
                    throw new Error(result.error || "IPFS upload failed");
                  if (!result.url)
                    throw new Error("IPFS upload did not return a URL");

                  return result.url;
                } catch (error) {
                  throw new Error(
                    `Failed to store grant file: ${error instanceof Error ? error.message : "Unknown error"}`,
                  );
                }
              },
            }
          : undefined;

        // Initialize Vana SDK
        const vanaInstance = Vana({
          walletClient: walletClient as WalletClient & { chain: VanaChain },
          relayerCallbacks,
          subgraphUrl: config.subgraphUrl || undefined,
          defaultPersonalServerUrl: config.defaultPersonalServerUrl,
          storage: {
            providers: storageProviders,
            defaultProvider: actualDefaultProvider,
          },
        });

        setVana(vanaInstance);
        setIsInitialized(true);
        console.info("✅ Vana SDK initialized:", vanaInstance.getConfig());

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

    initializeVana();
  }, [
    isConnected,
    walletClient,
    address,
    config.relayerUrl,
    config.defaultStorageProvider,
    useGaslessTransactions,
    // Note: Other config changes (Pinata, Google Drive) don't require full re-init
    // They can be handled by the storage provider setup
  ]);

  return (
    <VanaContext.Provider
      value={{ vana, isInitialized, error, applicationAddress }}
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
