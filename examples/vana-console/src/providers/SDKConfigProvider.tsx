"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useAccount } from "wagmi";

/**
 * SDK Configuration - Network, storage, and protocol settings
 */
export interface SDKConfig {
  relayerUrl: string;
  subgraphUrl: string;
  rpcUrl: string;
  pinataJwt: string;
  pinataGateway: string;
  defaultStorageProvider: string;
  googleDriveAccessToken: string;
  googleDriveRefreshToken: string;
  googleDriveExpiresAt: number | null;
  dropboxAccessToken: string;
  dropboxRefreshToken: string;
  dropboxExpiresAt: number | null;
  defaultPersonalServerUrl: string;
  readOnlyAddress: string;
}

/**
 * App Configuration - Application-level settings
 */
export interface AppConfig {
  useGaslessTransactions: boolean;
  enableReadOnlyMode: boolean;
}

/**
 * SDK Config Context Value - Centralized configuration management
 */
export interface SDKConfigContextValue {
  // Configuration state
  sdkConfig: SDKConfig;
  appConfig: AppConfig;

  // Computed values
  /**
   * The effective address being used by the application.
   * In read-only mode: readOnlyAddress from sdkConfig
   * In full mode: connected wallet address
   * This is the single source of truth for which address to query.
   */
  effectiveAddress: string | undefined;

  // Actions
  updateSdkConfig: (config: Partial<SDKConfig>) => void;
  updateAppConfig: (config: Partial<AppConfig>) => void;
  handleGoogleDriveAuth: () => void;
  handleGoogleDriveDisconnect: () => void;
  handleDropboxAuth: () => void;
  handleDropboxDisconnect: () => void;
}

const SDKConfigContext = createContext<SDKConfigContextValue | undefined>(
  undefined,
);

interface SDKConfigProviderProps {
  children: ReactNode;
}

/**
 * SDKConfigProvider - Centralized configuration management
 *
 * This provider owns ALL configuration state for the SDK and application:
 * - Network settings (relayer, subgraph, RPC)
 * - Storage settings (Pinata, Google Drive, default provider)
 * - Read-only mode settings
 * - Application settings (gasless transactions)
 *
 * It computes derived values like effectiveAddress and provides
 * actions for updating configuration.
 *
 * Architecture:
 * - VanaProvider consumes this context to initialize the SDK
 * - Components consume this context to read/update config
 * - Hooks use effectiveAddress to query the correct data
 */
export function SDKConfigProvider({ children }: SDKConfigProviderProps) {
  const { address: connectedAddress } = useAccount();

  // SDK Configuration state
  const [sdkConfig, setSdkConfig] = useState<SDKConfig>(() => ({
    relayerUrl: typeof window !== "undefined" ? window.location.origin : "",
    subgraphUrl: "",
    rpcUrl: "",
    pinataJwt: "",
    pinataGateway: "https://gateway.pinata.cloud",
    defaultStorageProvider: "app-ipfs",
    googleDriveAccessToken: "",
    googleDriveRefreshToken: "",
    googleDriveExpiresAt: null,
    dropboxAccessToken: "",
    dropboxRefreshToken: "",
    dropboxExpiresAt: null,
    readOnlyAddress: "",
    defaultPersonalServerUrl:
      process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL ?? "",
  }));

  // App Configuration state
  const [appConfig, setAppConfig] = useState<AppConfig>({
    useGaslessTransactions: true,
    enableReadOnlyMode: false,
  });

  // Listen for OAuth authentication messages from popup windows
  useEffect(() => {
    const handleAuthMessage = (event: MessageEvent) => {
      // Only accept messages from same origin
      if (event.origin !== window.location.origin) {
        return;
      }

      const { type, tokens } = event.data;

      // Handle Google Drive authentication success
      if (type === "GOOGLE_DRIVE_AUTH_SUCCESS" && tokens) {
        console.info("✅ Google Drive authentication successful");
        setSdkConfig((prev) => ({
          ...prev,
          googleDriveAccessToken: tokens.accessToken,
          googleDriveRefreshToken: tokens.refreshToken,
          googleDriveExpiresAt: tokens.expiresAt,
          defaultStorageProvider: "google-drive",
        }));
      }

      // Handle Dropbox authentication success
      if (type === "DROPBOX_AUTH_SUCCESS" && tokens) {
        console.info("✅ Dropbox authentication successful");
        setSdkConfig((prev) => ({
          ...prev,
          dropboxAccessToken: tokens.accessToken,
          dropboxRefreshToken: tokens.refreshToken,
          dropboxExpiresAt: tokens.expiresAt,
          defaultStorageProvider: "dropbox",
        }));
      }
    };

    window.addEventListener("message", handleAuthMessage);
    return () => {
      window.removeEventListener("message", handleAuthMessage);
    };
  }, []);

  // Compute effective address: read-only override takes precedence
  const effectiveAddress = useMemo(() => {
    if (appConfig.enableReadOnlyMode && sdkConfig.readOnlyAddress) {
      return sdkConfig.readOnlyAddress;
    }
    return connectedAddress;
  }, [
    appConfig.enableReadOnlyMode,
    sdkConfig.readOnlyAddress,
    connectedAddress,
  ]);

  // Configuration update handlers
  const updateSdkConfig = (config: Partial<SDKConfig>) => {
    setSdkConfig((prev) => ({ ...prev, ...config }));
  };

  const updateAppConfig = (config: Partial<AppConfig>) => {
    setAppConfig((prev) => ({ ...prev, ...config }));
  };

  // Google Drive authentication handlers
  const handleGoogleDriveAuth = () => {
    const authWindow = window.open(
      "/api/auth/google-drive/authorize",
      "google-drive-auth",
      "width=600,height=700,scrollbars=yes,resizable=yes",
    );

    // Monitor auth window closure
    const checkClosed = setInterval(() => {
      if (authWindow?.closed) {
        clearInterval(checkClosed);
        console.info("Google Drive auth window closed");
      }
    }, 1000);
  };

  const handleGoogleDriveDisconnect = () => {
    setSdkConfig((prev) => ({
      ...prev,
      googleDriveAccessToken: "",
      googleDriveRefreshToken: "",
      googleDriveExpiresAt: null,
      defaultStorageProvider:
        prev.defaultStorageProvider === "google-drive"
          ? "app-ipfs"
          : prev.defaultStorageProvider,
    }));
    console.info("Google Drive disconnected");
  };

  // Dropbox authentication handlers
  const handleDropboxAuth = () => {
    const authWindow = window.open(
      "/api/auth/dropbox/authorize",
      "dropbox-auth",
      "width=600,height=700,scrollbars=yes,resizable=yes",
    );

    // Monitor auth window closure
    const checkClosed = setInterval(() => {
      if (authWindow?.closed) {
        clearInterval(checkClosed);
        console.info("Dropbox auth window closed");
      }
    }, 1000);
  };

  const handleDropboxDisconnect = () => {
    setSdkConfig((prev) => ({
      ...prev,
      dropboxAccessToken: "",
      dropboxRefreshToken: "",
      dropboxExpiresAt: null,
      defaultStorageProvider:
        prev.defaultStorageProvider === "dropbox"
          ? "app-ipfs"
          : prev.defaultStorageProvider,
    }));
    console.info("Dropbox disconnected");
  };

  const value = useMemo<SDKConfigContextValue>(
    () => ({
      sdkConfig,
      appConfig,
      effectiveAddress,
      updateSdkConfig,
      updateAppConfig,
      handleGoogleDriveAuth,
      handleGoogleDriveDisconnect,
      handleDropboxAuth,
      handleDropboxDisconnect,
    }),
    [sdkConfig, appConfig, effectiveAddress],
  );

  return (
    <SDKConfigContext.Provider value={value}>
      {children}
    </SDKConfigContext.Provider>
  );
}

/**
 * Hook to access SDK configuration context
 * @throws Error if used outside SDKConfigProvider
 */
export function useSDKConfig() {
  const context = useContext(SDKConfigContext);
  if (context === undefined) {
    throw new Error("useSDKConfig must be used within a SDKConfigProvider");
  }
  return context;
}
