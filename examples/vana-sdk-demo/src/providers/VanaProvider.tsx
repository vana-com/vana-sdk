"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAccount, useWalletClient } from "wagmi";
import {
  Vana,
  StorageProvider,
  ServerProxyStorage,
  PinataStorage,
  GoogleDriveStorage,
  WalletClient,
  Hash,
  Address,
  PermissionGrantTypedData,
  GenericTypedData,
  TrustServerTypedData,
  UntrustServerTypedData,
  GrantFile,
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
}

interface VanaContextValue {
  vana: Vana | null;
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

export function VanaProvider({ children, config, useGaslessTransactions = true }: VanaProviderProps) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [vana, setVana] = useState<Vana | null>(null);
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
        // Initialize storage providers
        console.info("🏢 Setting up app-managed IPFS storage");
        const serverProxy = new ServerProxyStorage({
          uploadUrl: "/api/ipfs/upload",
          downloadUrl: "/api/ipfs/download",
        });

        const storageProviders: Record<string, StorageProvider> = {
          "app-ipfs": serverProxy,
        };

        // Add user-managed IPFS if configured
        if (config.pinataJwt) {
          console.info("👤 Adding user-managed Pinata IPFS storage");
          const pinataStorage = new PinataStorage({
            jwt: config.pinataJwt,
            gatewayUrl: config.pinataGateway || "https://gateway.pinata.cloud",
          });
          storageProviders["user-ipfs"] = pinataStorage;
        }

        // Add Google Drive if configured
        if (config.googleDriveAccessToken) {
          console.info("🔗 Adding Google Drive storage");
          const googleDriveProvider = new GoogleDriveStorage({
            accessToken: config.googleDriveAccessToken,
            refreshToken: config.googleDriveRefreshToken,
          });

          try {
            const folderId = await googleDriveProvider.findOrCreateFolder("Vana Data");
            console.info("📁 Using Google Drive folder:", folderId);
            
            const googleDriveStorage = new GoogleDriveStorage({
              accessToken: config.googleDriveAccessToken,
              refreshToken: config.googleDriveRefreshToken,
              folderId: folderId,
            });
            storageProviders["google-drive"] = googleDriveStorage;
          } catch (error) {
            console.warn("⚠️ Failed to create Google Drive folder, using root:", error);
            storageProviders["google-drive"] = googleDriveProvider;
          }
        }

        // Determine the actual default storage provider
        let actualDefaultProvider = config.defaultStorageProvider || "app-ipfs";
        if (actualDefaultProvider === "user-ipfs" && !config.pinataJwt) {
          actualDefaultProvider = "app-ipfs";
        } else if (actualDefaultProvider === "google-drive" && !config.googleDriveAccessToken) {
          actualDefaultProvider = "app-ipfs";
        }

        // Create relayer callbacks if using gasless transactions
        const baseUrl = config.relayerUrl || window.location.origin;
        const relayerCallbacks = useGaslessTransactions ? {
          async submitPermissionGrant(typedData: PermissionGrantTypedData, signature: Hash) {
            const jsonSafeTypedData = JSON.parse(
              JSON.stringify(typedData, (_key, value) =>
                typeof value === "bigint" ? value.toString() : value
              )
            );
            const response = await fetch(`${baseUrl}/api/relay`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                typedData: jsonSafeTypedData,
                signature,
                expectedUserAddress: address,
              }),
            });
            const result = await response.json();
            if (!result.success) {
              throw new Error(result.error || "Failed to submit to relayer");
            }
            return result.transactionHash as Hash;
          },

          async submitPermissionRevoke(typedData: GenericTypedData, signature: Hash) {
            const jsonSafeTypedData = JSON.parse(
              JSON.stringify(typedData, (_key, value) =>
                typeof value === "bigint" ? value.toString() : value
              )
            );
            const response = await fetch(`${baseUrl}/api/relay`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                typedData: jsonSafeTypedData,
                signature,
                expectedUserAddress: address,
              }),
            });
            const result = await response.json();
            if (!result.success) {
              throw new Error(result.error || "Failed to submit to relayer");
            }
            return result.transactionHash as Hash;
          },

          async submitTrustServer(typedData: TrustServerTypedData, signature: Hash) {
            const jsonSafeTypedData = JSON.parse(
              JSON.stringify(typedData, (_key, value) =>
                typeof value === "bigint" ? value.toString() : value
              )
            );
            const response = await fetch(`${baseUrl}/api/relay`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                typedData: jsonSafeTypedData,
                signature,
                expectedUserAddress: address,
              }),
            });
            const result = await response.json();
            if (!result.success) {
              throw new Error(result.error || "Failed to submit to relayer");
            }
            return result.transactionHash as Hash;
          },

          async submitUntrustServer(typedData: UntrustServerTypedData, signature: Hash) {
            const jsonSafeTypedData = JSON.parse(
              JSON.stringify(typedData, (_key, value) =>
                typeof value === "bigint" ? value.toString() : value
              )
            );
            const response = await fetch(`${baseUrl}/api/relay`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                typedData: jsonSafeTypedData,
                signature,
                expectedUserAddress: address,
              }),
            });
            const result = await response.json();
            if (!result.success) {
              throw new Error(result.error || "Failed to submit to relayer");
            }
            return result.transactionHash as Hash;
          },

          async submitFileAddition(url: string, userAddress: string) {
            const response = await fetch(`${baseUrl}/api/relay/addFile`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url, userAddress }),
            });
            const result = await response.json();
            if (!result.success) {
              throw new Error(result.error || "Failed to submit to relayer");
            }
            return {
              fileId: result.fileId,
              transactionHash: result.transactionHash as Hash,
            };
          },

          async submitFileAdditionWithPermissions(
            url: string,
            userAddress: string,
            permissions: Array<{ account: string; key: string }>
          ) {
            const response = await fetch(`${baseUrl}/api/relay/addFileWithPermissions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url, userAddress, permissions }),
            });
            const result = await response.json();
            if (!result.success) {
              throw new Error(result.error || "Failed to submit to relayer");
            }
            return {
              fileId: result.fileId,
              transactionHash: result.transactionHash as Hash,
            };
          },

          async submitFileAdditionComplete(params: {
            url: string;
            userAddress: Address;
            permissions: Array<{ account: Address; key: string }>;
            schemaId: number;
          }) {
            const response = await fetch(`${baseUrl}/api/relay/addFileComplete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(params),
            });
            const result = await response.json();
            if (!result.success) {
              throw new Error(result.error || "Failed to submit to relayer");
            }
            return {
              fileId: result.fileId,
              transactionHash: result.transactionHash as Hash,
            };
          },

          async storeGrantFile(grantData: GrantFile) {
            try {
              const grantFileBlob = new Blob([JSON.stringify(grantData, null, 2)], {
                type: "application/json",
              });
              const formData = new FormData();
              formData.append("file", grantFileBlob, "grant-file.json");

              const response = await fetch(`${baseUrl}/api/ipfs/upload`, {
                method: "POST",
                body: formData,
              });

              if (!response.ok) {
                throw new Error(`IPFS upload failed: ${response.statusText}`);
              }

              const result = await response.json();
              if (!result.success) {
                throw new Error(result.error || "IPFS upload failed");
              }
              if (!result.url) {
                throw new Error("IPFS upload did not return a URL");
              }
              return result.url;
            } catch (error) {
              throw new Error(
                `Failed to store grant file: ${error instanceof Error ? error.message : "Unknown error"}`
              );
            }
          },
        } : undefined;

        // Initialize Vana SDK
        const vanaInstance = new Vana({
          walletClient: walletClient as WalletClient & { chain: VanaChain },
          relayerCallbacks,
          subgraphUrl: config.subgraphUrl || undefined,
          storage: {
            providers: storageProviders,
            defaultProvider: actualDefaultProvider,
          },
        });

        setVana(vanaInstance);
        setIsInitialized(true);
        console.info("✅ Vana SDK initialized:", vanaInstance.getConfig());

        // Fetch application address for permission granting
        try {
          const appAddressResponse = await fetch("/api/application-address");
          if (appAddressResponse.ok) {
            const appAddressData = await appAddressResponse.json();
            if (appAddressData.success) {
              setApplicationAddress(appAddressData.data.applicationAddress);
              console.info("✅ Application address fetched:", appAddressData.data.applicationAddress);
            }
          }
        } catch (error) {
          console.warn("⚠️ Failed to fetch application address:", error);
        }
      } catch (err) {
        console.error("Failed to initialize Vana SDK:", err);
        setError(err instanceof Error ? err : new Error("Failed to initialize Vana SDK"));
        setIsInitialized(false);
      }
    };

    initializeVana();
  }, [
    isConnected,
    walletClient,
    address,
    config.relayerUrl,
    config.subgraphUrl,
    config.pinataJwt,
    config.pinataGateway,
    config.defaultStorageProvider,
    config.googleDriveAccessToken,
    config.googleDriveRefreshToken,
    useGaslessTransactions,
  ]);

  return (
    <VanaContext.Provider value={{ vana, isInitialized, error, applicationAddress }}>
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