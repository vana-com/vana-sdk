"use client";

import React, { useState, useEffect, useCallback } from "react";
import { addToast } from "@heroui/react";
import type { VanaChain } from "@opendatalabs/vana-sdk/browser";
import { useAccount, useWalletClient, useChainId } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  Vana,
  UserFile,
  GrantPermissionParams,
  RevokePermissionParams,
  GrantedPermission,
  DEFAULT_ENCRYPTION_SEED,
  StorageManager,
  StorageProvider,
  PinataStorage,
  ServerProxyStorage,
  GoogleDriveStorage,
  WalletClient,
  Schema,
  Refiner,
  AddSchemaParams,
  AddRefinerParams,
  UpdateSchemaIdParams,
  PermissionGrantTypedData,
  GenericTypedData,
  TrustServerTypedData,
  UntrustServerTypedData,
  GrantFile,
  Hash,
  retrieveGrantFile,
} from "@opendatalabs/vana-sdk/browser";

// Types for demo app state

interface GrantPreview {
  grantFile: {
    grantee: string;
    operation: string;
    parameters: unknown;
    expires?: number;
  } | null;
  grantUrl: string;
  params: GrantPermissionParams & { expiresAt?: number };
  typedData?: PermissionGrantTypedData | null;
  signature?: string | null;
}
import {
  Card,
  CardHeader,
  CardBody,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Spinner,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
} from "@heroui/react";
import { MainLayout } from "@/components/MainLayout";
import { GrantPreviewModalContent } from "@/components/GrantPreviewModalContent";
import { Eye } from "lucide-react";
import type {
  TrustedServerIdentityAPIResponse,
  DiscoveredServerInfo,
} from "@/types/api";
import type { UserDashboardViewProps } from "@/components/views/UserDashboardView";
import type { DeveloperDashboardViewProps } from "@/components/views/DeveloperDashboardView";
import type { DemoExperienceViewProps } from "@/components/views/DemoExperienceView";
import {
  SDKConfigurationSidebar,
  type AppConfig,
} from "@/components/SDKConfigurationSidebar";

export default function Home() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  const [vana, setVana] = useState<Vana | null>(null);
  const [userFiles, setUserFiles] = useState<
    (UserFile & { source?: "discovered" | "looked-up" | "uploaded" })[]
  >([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [grantStatus, setGrantStatus] = useState<string>("");
  const [grantTxHash, setGrantTxHash] = useState<string>("");
  const [_revokeStatus, _setRevokeStatus] = useState<string>("");

  // Grant preview state
  const [grantPreview, setGrantPreview] = useState<GrantPreview | null>(null);
  const {
    isOpen: showGrantPreview,
    onOpen: onOpenGrant,
    onClose: onCloseGrant,
  } = useDisclosure();
  const [isGranting, setIsGranting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [userPermissions, setUserPermissions] = useState<GrantedPermission[]>(
    [],
  );
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);

  // Encryption testing state
  const [_encryptionSeed, _setEncryptionSeed] = useState<string>(
    DEFAULT_ENCRYPTION_SEED,
  );
  const [_testData, _setTestData] = useState<string>(
    `{"message": "Hello Vana!", "timestamp": "${new Date().toISOString()}"}`,
  );
  const [_generatedEncryptionKey, _setGeneratedEncryptionKey] = useState<
    string | null
  >(null);
  const [_isGeneratingKey] = useState(false);
  const [_encryptedData, _setEncryptedData] = useState<Blob | null>(null);
  const [_decryptedData, _setDecryptedData] = useState<string>("");
  const [_encryptionStatus, _setEncryptionStatus] = useState<string>("");
  const [_isEncrypting, _setIsEncrypting] = useState(false);
  const [_inputMode, _setInputMode] = useState<"text" | "file">("text");
  const [_uploadedFile, _setUploadedFile] = useState<File | null>(null);
  const [_originalFileName, _setOriginalFileName] = useState<string>("");
  const [_showEncryptedContent, _setShowEncryptedContent] = useState(false);

  // File decryption state
  const [decryptingFiles, setDecryptingFiles] = useState<Set<number>>(
    new Set(),
  );
  const [decryptedFiles, setDecryptedFiles] = useState<Map<number, string>>(
    new Map(),
  );
  const [fileDecryptErrors, setFileDecryptErrors] = useState<
    Map<number, string>
  >(new Map());

  // Blockchain upload state
  const [_isUploadingToChain, _setIsUploadingToChain] = useState(false);
  const [_newFileId, _setNewFileId] = useState<number | null>(null);

  // Storage state (kept for demo UI functionality)
  const [_storageManager, setStorageManager] = useState<StorageManager | null>(
    null,
  );
  const [_ipfsMode] = useState<"app-managed" | "user-managed">("app-managed");

  // Prompt state for customizable LLM prompt
  const [promptText, setPromptText] = useState<string>(
    "Create a comprehensive Digital DNA profile from this data that captures the essence of this person's digital footprint: {{data}}",
  );

  // Execution context state for displaying permission details
  const [lastUsedPermissionId, setLastUsedPermissionId] = useState<string>("");
  const [_lastUsedPrompt, _setLastUsedPrompt] = useState<string>("");

  // Application address for permission granting
  const [applicationAddress, setApplicationAddress] = useState<string>("");

  // Active view state for navigation
  const [activeView, setActiveView] = useState<string>("my-data");

  // Upload data functionality state
  const [uploadInputMode, setUploadInputMode] = useState<"text" | "file">(
    "text",
  );
  const [uploadTextData, setUploadTextData] = useState<string>("");
  const [uploadSelectedFile, setUploadSelectedFile] = useState<File | null>(
    null,
  );
  const [uploadSelectedSchemaId, setUploadSelectedSchemaId] = useState<
    number | null
  >(null);
  const [isUploadingData, setIsUploadingData] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    fileId: number;
    transactionHash: string;
    isValid?: boolean;
    validationErrors?: string[];
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Demo experience state
  const [demoNewTextData, setDemoNewTextData] = useState<string>(
    "I love exploring new technologies and creating innovative solutions. I'm passionate about privacy and user empowerment. I enjoy reading about AI, blockchain, and the future of data ownership. In my free time, I like to travel and discover new cultures.",
  );
  const [demoNewTextUploadResult, setDemoNewTextUploadResult] = useState<{
    fileId: number;
    transactionHash: string;
  } | null>(null);
  const [isDemoUploadingNewText, setIsDemoUploadingNewText] = useState(false);

  // Schema selection for file upload
  const [_selectedUploadSchemaId, _setSelectedUploadSchemaId] =
    useState<string>("");

  // File lookup state
  const [fileLookupId, setFileLookupId] = useState<string>("");
  const [isLookingUpFile, setIsLookingUpFile] = useState(false);
  const [fileLookupStatus, setFileLookupStatus] = useState<string>("");

  // Permission lookup state
  const [permissionLookupId, setPermissionLookupId] = useState<string>("");
  const [isLookingUpPermission, setIsLookingUpPermission] = useState(false);
  const [permissionLookupStatus, setPermissionLookupStatus] =
    useState<string>("");
  const [lookedUpPermission, setLookedUpPermission] =
    useState<GrantedPermission | null>(null);

  // Personal server state
  const [personalPermissionId, setPersonalPermissionId] = useState<string>("");
  const [personalResult, setPersonalResult] = useState<unknown>(null);
  const [personalError, setPersonalError] = useState<string>("");
  const [isPersonalLoading, setIsPersonalLoading] = useState(false);
  const [_isPolling, _setIsPolling] = useState(false);

  // Server decryption demo state
  const [_serverFileId, _setServerFileId] = useState<string>("");
  const [_serverPrivateKey, _setServerPrivateKey] = useState<string>("");
  const [_serverDecryptedData, _setServerDecryptedData] = useState<string>("");
  const [_serverDecryptError, _setServerDecryptError] = useState<string>("");
  const [_isServerDecrypting, _setIsServerDecrypting] = useState(false);
  const [_derivedServerAddress, _setDerivedServerAddress] =
    useState<string>("");

  // Trust server state
  const [serverId, setServerId] = useState<string>("");
  const [serverUrl, setServerUrl] = useState<string>("");
  const [trustServerError, setTrustServerError] = useState<string>("");
  const [isTrustingServer, setIsTrustingServer] = useState(false);
  const [trustedServers, setTrustedServers] = useState<
    Array<{
      id: string;
      serverAddress: string;
      serverUrl: string;
      trustedAt: bigint;
      user: string;
    }>
  >([]);
  const [isLoadingTrustedServers, setIsLoadingTrustedServers] = useState(false);
  const [trustedServerQueryMode, setTrustedServerQueryMode] = useState<
    "subgraph" | "rpc" | "auto"
  >("auto");
  const [isUntrusting, setIsUntrusting] = useState(false);

  // Server discovery state
  const [isDiscoveringServer, setIsDiscoveringServer] = useState(false);

  // Trusted server file upload state
  const [_selectedServerForUpload, _setSelectedServerForUpload] =
    useState<string>("");
  const [_serverFileToUpload, _setServerFileToUpload] = useState<File | null>(
    null,
  );
  const [_serverInputMode, _setServerInputMode] = useState<"text" | "file">(
    "text",
  );
  const [_serverTextData, _setServerTextData] = useState<string>(
    `{"message": "Sample data from Vana SDK demo", "timestamp": "${new Date().toISOString()}"}`,
  );
  const [_isUploadingToServer, _setIsUploadingToServer] = useState(false);
  const [_serverUploadStatus, _setServerUploadStatus] = useState<string>("");
  const [_serverUploadResult, _setServerUploadResult] = useState<{
    fileId: number;
    transactionHash: string;
    url: string;
  } | null>(null);

  // Personal server setup state (unused but kept for future features)

  // Schema management state
  const [schemas, setSchemas] = useState<
    (Schema & { source?: "discovered" | "created" })[]
  >([]);
  const [refiners, setRefiners] = useState<
    (Refiner & { source?: "discovered" | "created" })[]
  >([]);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isLoadingRefiners, setIsLoadingRefiners] = useState(false);
  const [schemasCount, setSchemasCount] = useState(0);
  const [refinersCount, setRefinersCount] = useState(0);

  // Schema creation state
  const [schemaName, setSchemaName] = useState<string>("");
  const [schemaType, setSchemaType] = useState<string>("");
  const [schemaDefinitionUrl, setSchemaDefinitionUrl] = useState<string>("");
  const [isCreatingSchema, setIsCreatingSchema] = useState(false);
  const [schemaStatus, setSchemaStatus] = useState<string>("");
  const [lastCreatedSchemaId, setLastCreatedSchemaId] = useState<number | null>(
    null,
  );

  // Refiner creation state
  const [refinerName, setRefinerName] = useState<string>("");
  const [refinerDlpId, setRefinerDlpId] = useState<string>("");
  const [refinerSchemaId, setRefinerSchemaId] = useState<string>("");
  const [refinerInstructionUrl, setRefinerInstructionUrl] =
    useState<string>("");
  const [isCreatingRefiner, setIsCreatingRefiner] = useState(false);
  const [refinerStatus, setRefinerStatus] = useState<string>("");
  const [lastCreatedRefinerId, setLastCreatedRefinerId] = useState<
    number | null
  >(null);

  // Schema update state
  const [updateRefinerId, setUpdateRefinerId] = useState<string>("");
  const [updateSchemaId, setUpdateSchemaId] = useState<string>("");
  const [isUpdatingSchema, setIsUpdatingSchema] = useState(false);
  const [updateSchemaStatus, setUpdateSchemaStatus] = useState<string>("");

  // SDK Configuration state
  const [sdkConfig, setSdkConfig] = useState({
    relayerUrl: `${typeof window !== "undefined" ? window.location.origin : ""}`,
    subgraphUrl: "",
    rpcUrl: "",
    pinataJwt: "",
    pinataGateway: "https://gateway.pinata.cloud",
    defaultStorageProvider: "app-ipfs",
    googleDriveAccessToken: "",
    googleDriveRefreshToken: "",
    googleDriveExpiresAt: null as number | null,
  });

  // App Configuration state
  const [appConfig, setAppConfig] = useState<AppConfig>({
    useGaslessTransactions: true,
  });

  // Auto-fallback to app-ipfs for invalid configurations
  useEffect(() => {
    if (
      (sdkConfig.defaultStorageProvider === "user-ipfs" &&
        !sdkConfig.pinataJwt) ||
      (sdkConfig.defaultStorageProvider === "google-drive" &&
        !sdkConfig.googleDriveAccessToken)
    ) {
      setSdkConfig((prev) => ({ ...prev, defaultStorageProvider: "app-ipfs" }));
    }
  }, [
    sdkConfig.pinataJwt,
    sdkConfig.defaultStorageProvider,
    sdkConfig.googleDriveAccessToken,
  ]);

  // Set up fetch interceptor for CORS-restricted URLs
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (
      url: string | URL | Request,
      options?: RequestInit,
    ) => {
      const urlString = typeof url === "string" ? url : url.toString();

      // Check if this is a Google Drive URL that might have CORS issues
      if (
        urlString.includes("drive.google.com") ||
        urlString.includes("docs.google.com")
      ) {
        try {
          // First try the original fetch
          const response = await originalFetch(url, options);
          return response;
        } catch (error) {
          // If it fails, try through our proxy
          console.info(
            "🔄 CORS error detected, routing through proxy:",
            urlString,
            error,
          );
          const proxyUrl = `/api/proxy?url=${encodeURIComponent(urlString)}`;
          return originalFetch(proxyUrl, options);
        }
      }

      // For all other URLs, use original fetch
      return originalFetch(url, options);
    };

    // Cleanup: restore original fetch on unmount
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Google Drive OAuth message listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "GOOGLE_DRIVE_AUTH_SUCCESS") {
        const { tokens } = event.data;
        setSdkConfig((prev) => ({
          ...prev,
          googleDriveAccessToken: tokens.accessToken,
          googleDriveRefreshToken: tokens.refreshToken || "",
          googleDriveExpiresAt: tokens.expiresAt,
        }));
        console.info("✅ Google Drive authentication successful");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Google Drive authentication handlers
  const handleGoogleDriveAuth = () => {
    const authWindow = window.open(
      "/api/auth/google-drive/authorize",
      "google-drive-auth",
      "width=600,height=700,scrollbars=yes,resizable=yes",
    );

    // Optional: Monitor auth window closure
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

  // Auto-refresh Google Drive token when expired
  useEffect(() => {
    if (
      !sdkConfig.googleDriveAccessToken ||
      !sdkConfig.googleDriveRefreshToken
    ) {
      return;
    }

    const checkTokenExpiry = async () => {
      const now = Date.now();
      const expiresAt = sdkConfig.googleDriveExpiresAt || 0;
      const timeToExpiry = expiresAt - now;

      // Refresh 5 minutes before expiry
      if (timeToExpiry > 0 && timeToExpiry < 5 * 60 * 1000) {
        try {
          const response = await fetch("/api/auth/google-drive/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              refreshToken: sdkConfig.googleDriveRefreshToken,
            }),
          });

          if (response.ok) {
            const { accessToken, expiresAt: newExpiresAt } =
              await response.json();
            setSdkConfig((prev) => ({
              ...prev,
              googleDriveAccessToken: accessToken,
              googleDriveExpiresAt: newExpiresAt,
            }));
            console.info("✅ Google Drive token refreshed");
          } else {
            console.warn("Failed to refresh Google Drive token");
            handleGoogleDriveDisconnect();
          }
        } catch (error) {
          console.error("Error refreshing Google Drive token:", error);
          handleGoogleDriveDisconnect();
        }
      }
    };

    const interval = setInterval(checkTokenExpiry, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [
    sdkConfig.googleDriveAccessToken,
    sdkConfig.googleDriveRefreshToken,
    sdkConfig.googleDriveExpiresAt,
  ]);

  // Initialize Vana SDK when wallet is connected or user IPFS config changes
  useEffect(() => {
    if (isConnected && walletClient && walletClient.account) {
      (async () => {
        try {
          // Initialize storage providers
          console.info("🏢 Setting up app-managed IPFS storage");
          const serverProxy = new ServerProxyStorage({
            uploadUrl: "/api/ipfs/upload",
            downloadUrl: "/api/ipfs/download", // Not actually used in demo
          });

          const storageProviders: Record<string, StorageProvider> = {
            "app-ipfs": serverProxy,
          };

          // Add user-managed IPFS if configured
          if (sdkConfig.pinataJwt) {
            console.info("👤 Adding user-managed Pinata IPFS storage");
            const pinataStorage = new PinataStorage({
              jwt: sdkConfig.pinataJwt,
              gatewayUrl: sdkConfig.pinataGateway,
            });
            storageProviders["user-ipfs"] = pinataStorage;

            // Pinata storage configured (testConnection method not available)
          }

          // Add Google Drive if configured
          if (sdkConfig.googleDriveAccessToken) {
            console.info("🔗 Adding Google Drive storage");

            // Create Google Drive provider with folder support
            const googleDriveProvider = new GoogleDriveStorage({
              accessToken: sdkConfig.googleDriveAccessToken,
              refreshToken: sdkConfig.googleDriveRefreshToken,
              // Client credentials not needed for storage operations
              // Token refresh is handled by our API endpoint
            });

            // Create or find the "Vana Data" folder for organization
            try {
              const folderId =
                await googleDriveProvider.findOrCreateFolder("Vana Data");
              console.info("📁 Using Google Drive folder:", folderId);

              // Create a new provider instance with the folder ID
              const googleDriveStorage = new GoogleDriveStorage({
                accessToken: sdkConfig.googleDriveAccessToken,
                refreshToken: sdkConfig.googleDriveRefreshToken,
                folderId: folderId,
              });
              storageProviders["google-drive"] = googleDriveStorage;
            } catch (error) {
              console.warn(
                "⚠️ Failed to create Google Drive folder, using root:",
                error,
              );
              // Fall back to root folder if folder creation fails
              storageProviders["google-drive"] = googleDriveProvider;
            }
          }

          // Determine the actual default storage provider based on what's available
          let actualDefaultProvider = sdkConfig.defaultStorageProvider;

          if (
            sdkConfig.defaultStorageProvider === "user-ipfs" &&
            !sdkConfig.pinataJwt
          ) {
            actualDefaultProvider = "app-ipfs"; // Fallback to app-ipfs if user-ipfs is selected but not configured
          } else if (
            sdkConfig.defaultStorageProvider === "google-drive" &&
            !sdkConfig.googleDriveAccessToken
          ) {
            actualDefaultProvider = "app-ipfs"; // Fallback to app-ipfs if google-drive is selected but not configured
          }

          // Initialize Vana SDK with storage configuration
          const baseUrl = sdkConfig.relayerUrl || `${window.location.origin}`;

          // Helper function to reduce boilerplate in relayer callbacks
          const relayRequest = async (
            endpoint: string,
            payload: unknown,
          ): Promise<{
            success: boolean;
            transactionHash?: string;
            fileId?: number;
            url?: string;
            error?: string;
          }> => {
            const response = await fetch(`${baseUrl}/api/${endpoint}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!response.ok) {
              throw new Error(`Relayer request failed: ${response.statusText}`);
            }
            const result = await response.json();
            if (!result.success) {
              throw new Error(result.error || "Failed to submit to relayer");
            }
            return result;
          };

          // Create relayer callbacks for demo app
          const relayerCallbacks = {
            async submitPermissionGrant(
              typedData: PermissionGrantTypedData,
              signature: Hash,
            ) {
              // Create a JSON-safe version for relayer
              const jsonSafeTypedData = JSON.parse(
                JSON.stringify(typedData, (_key, value) =>
                  typeof value === "bigint" ? value.toString() : value,
                ),
              );
              const result = await relayRequest("relay", {
                typedData: jsonSafeTypedData,
                signature,
                expectedUserAddress: address, // Add expected user address for verification
              });
              return result.transactionHash as Hash;
            },

            async submitPermissionRevoke(
              typedData: GenericTypedData,
              signature: Hash,
            ) {
              // Create a JSON-safe version for relayer
              const jsonSafeTypedData = JSON.parse(
                JSON.stringify(typedData, (_key, value) =>
                  typeof value === "bigint" ? value.toString() : value,
                ),
              );
              const result = await relayRequest("relay", {
                typedData: jsonSafeTypedData,
                signature,
                expectedUserAddress: address, // Add expected user address for verification
              });
              return result.transactionHash as Hash;
            },

            async submitTrustServer(
              typedData: TrustServerTypedData,
              signature: Hash,
            ) {
              // Create a JSON-safe version for relayer
              const jsonSafeTypedData = JSON.parse(
                JSON.stringify(typedData, (_key, value) =>
                  typeof value === "bigint" ? value.toString() : value,
                ),
              );
              const result = await relayRequest("relay", {
                typedData: jsonSafeTypedData,
                signature,
                expectedUserAddress: address, // Add expected user address for verification
              });
              return result.transactionHash as Hash;
            },

            async submitUntrustServer(
              typedData: UntrustServerTypedData,
              signature: Hash,
            ) {
              // Create a JSON-safe version for relayer
              const jsonSafeTypedData = JSON.parse(
                JSON.stringify(typedData, (_key, value) =>
                  typeof value === "bigint" ? value.toString() : value,
                ),
              );
              const result = await relayRequest("relay", {
                typedData: jsonSafeTypedData,
                signature,
                expectedUserAddress: address, // Add expected user address for verification
              });
              return result.transactionHash as Hash;
            },

            async submitFileAddition(url: string, userAddress: string) {
              const result = await relayRequest("relay/addFile", {
                url,
                userAddress,
              });
              if (result.fileId === undefined) {
                throw new Error(
                  "File addition failed: no fileId returned from relayer",
                );
              }
              return {
                fileId: result.fileId,
                transactionHash: result.transactionHash as Hash,
              };
            },

            async submitFileAdditionWithPermissions(
              url: string,
              userAddress: string,
              permissions: Array<{ account: string; key: string }>,
            ) {
              const result = await relayRequest(
                "relay/addFileWithPermissions",
                {
                  url,
                  userAddress,
                  permissions,
                },
              );
              if (result.fileId === undefined) {
                throw new Error(
                  "File addition with permissions failed: no fileId returned from relayer",
                );
              }
              return {
                fileId: result.fileId,
                transactionHash: result.transactionHash as Hash,
              };
            },

            async storeGrantFile(grantData: GrantFile) {
              // Store grant file via IPFS upload endpoint
              try {
                // Convert grant file to blob and create FormData as expected by /api/ipfs/upload
                const grantFileBlob = new Blob(
                  [JSON.stringify(grantData, null, 2)],
                  {
                    type: "application/json",
                  },
                );

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
                  `Failed to store grant file: ${error instanceof Error ? error.message : "Unknown error"}`,
                );
              }
            },
          };

          const vanaInstance = new Vana({
            walletClient: walletClient as WalletClient & { chain: VanaChain }, // Type compatibility with Vana SDK
            relayerCallbacks,
            subgraphUrl: sdkConfig.subgraphUrl || undefined,
            storage: {
              providers: storageProviders,
              defaultProvider: actualDefaultProvider,
            },
          });
          setVana(vanaInstance);
          console.info("✅ Vana SDK initialized:", vanaInstance.getConfig());

          // Fetch application address for permission granting
          try {
            const appAddressResponse = await fetch("/api/application-address");
            if (appAddressResponse.ok) {
              const appAddressData = await appAddressResponse.json();
              if (appAddressData.success) {
                setApplicationAddress(appAddressData.data.applicationAddress);
                console.info(
                  "✅ Application address fetched:",
                  appAddressData.data.applicationAddress,
                );
              }
            }
          } catch (error) {
            console.warn("⚠️ Failed to fetch application address:", error);
          }

          // Create a separate storage manager for the demo UI (to maintain existing UI functionality)
          const manager = new StorageManager();
          for (const [name, provider] of Object.entries(storageProviders)) {
            manager.register(name, provider, name === "app-ipfs");
          }
          setStorageManager(manager);
          console.info(
            "✅ Storage manager initialized with both IPFS patterns",
          );
        } catch (error) {
          console.error("❌ Failed to initialize Vana SDK:", error);
        }
      })();
    } else {
      setVana(null);
      setStorageManager(null);
      setUserFiles([]);
      setSelectedFiles([]);
      setApplicationAddress("");
    }
  }, [isConnected, walletClient, sdkConfig]);

  // Generate encrypted content preview when encryptedData changes
  // Note: encryptedData preview now handled by EncryptionTestCard component

  const loadUserFiles = useCallback(async () => {
    if (!vana || !address) return;

    setIsLoadingFiles(true);
    try {
      const files = await vana.data.getUserFiles({ owner: address });
      const discoveredFiles = files.map((file) => ({
        ...file,
        source: "discovered" as const,
      }));
      setUserFiles(discoveredFiles);
    } catch (error) {
      console.error("Failed to load user files:", error);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [vana, address]);

  const loadUserPermissions = useCallback(async () => {
    if (!vana) return [];

    setIsLoadingPermissions(true);
    try {
      const permissions = await vana.permissions.getUserPermissions({
        limit: 20,
      });
      setUserPermissions(permissions);
      return permissions;
    } catch (error) {
      console.error("Failed to load user permissions:", error);
      return [];
    } finally {
      setIsLoadingPermissions(false);
    }
  }, [vana]);

  const loadUserTrustedServers = useCallback(
    async (mode: "subgraph" | "rpc" | "auto" = "auto") => {
      if (!vana || !address) return;

      setIsLoadingTrustedServers(true);
      try {
        const result = await vana.data.getUserTrustedServers({
          user: address,
          mode,
          subgraphUrl: process.env.NEXT_PUBLIC_SUBGRAPH_URL,
          limit: 10, // For demo purposes, limit to 10 servers
        });

        console.info("Loaded trusted servers:", result);

        // Show which mode was actually used
        addToast({
          color: "success",
          title: `Trusted servers loaded via ${result.usedMode.toUpperCase()}`,
          description: `Found ${result.servers.length} trusted servers${result.total ? ` (${result.total} total)` : ""}${result.warnings ? `. Warnings: ${result.warnings.join(", ")}` : ""}`,
        });

        // For backward compatibility, extract just the servers array
        setTrustedServers(result.servers);
      } catch (error) {
        console.error("Failed to load trusted servers:", error);
        addToast({
          color: "danger",
          title: "Failed to load trusted servers",
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsLoadingTrustedServers(false);
      }
    },
    [vana, address],
  );

  // Load user files, permissions, and trusted servers when Vana is initialized
  useEffect(() => {
    if (vana && address) {
      loadUserFiles();
      loadUserPermissions();
      loadUserTrustedServers();
    }
  }, [
    vana,
    address,
    loadUserFiles,
    loadUserPermissions,
    loadUserTrustedServers,
  ]);

  const handleFileSelection = (fileId: number, selected: boolean) => {
    if (selected) {
      setSelectedFiles((prev) => [...prev, fileId]);
    } else {
      setSelectedFiles((prev) => prev.filter((id) => id !== fileId));
    }
  };

  const handleGrantPermission = async () => {
    if (!vana || selectedFiles.length === 0) return;

    if (!applicationAddress) {
      setGrantStatus(
        "❌ Application address not available. Please refresh the page.",
      );
      return;
    }

    // Create clear, unencrypted parameters for the grant
    const params: GrantPermissionParams = {
      to: applicationAddress as `0x${string}`, // Use dynamically fetched application address
      operation: "llm_inference",
      files: selectedFiles,
      parameters: {
        prompt: promptText,
      },
    };

    console.debug("🔍 Debug - Permission params:", {
      selectedFiles,
      paramsFiles: params.files,
      filesLength: params.files.length,
      operation: params.operation,
    });

    // Add expiration to params (24 hours from now)
    const paramsWithExpiry = {
      ...params,
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
    };

    // Show preview to user BEFORE signing
    setGrantPreview({
      grantFile: null, // Will be populated after signing
      grantUrl: "",
      params: paramsWithExpiry,
      typedData: null,
      signature: null,
    });
    onOpenGrant();
    setGrantStatus("Review the grant details before signing...");
  };

  const handleConfirmGrant = async () => {
    if (!grantPreview || !vana) return;

    setIsGranting(true);
    setGrantTxHash("");

    try {
      // Now create and sign the grant after user confirmation
      setGrantStatus("Creating grant file via SDK...");

      // Use the SDK to create and sign the grant
      const { typedData, signature } = await vana.permissions.createAndSign(
        grantPreview.params,
      );

      // Extract grant file for preview from the files array in typedData
      setGrantStatus("Retrieving grant file for preview...");

      // The SDK stores the grant file in IPFS and puts the URL in typedData.message.grant
      const grantUrl = typedData.message.grant;

      // Retrieve the stored grant file
      const grantFile = await retrieveGrantFile(grantUrl);

      // Update grant preview with signed data
      setGrantPreview({
        grantFile,
        grantUrl,
        params: grantPreview.params,
        typedData,
        signature,
      });

      setGrantStatus("Submitting to blockchain...");

      // Submit the signed grant
      const txHash = await vana.permissions.submitSignedGrant(
        typedData,
        signature as `0x${string}`,
      );

      setGrantStatus(""); // Clear status since permission will appear in list
      setGrantTxHash(txHash);
      onCloseGrant();

      // Store the grant URL and nonce to identify the newly created permission
      const grantUrlToMatch = typedData.message.grant;
      const nonceToMatch = typedData.message.nonce;

      // Refresh permissions to show the new grant and set lastUsedPermissionId
      setTimeout(async () => {
        const freshPermissions = await loadUserPermissions();

        // Find the newly created permission by matching grant URL and nonce
        const newPermission = freshPermissions.find(
          (p) =>
            p.grant === grantUrlToMatch && p.nonce === Number(nonceToMatch),
        );

        if (newPermission) {
          setLastUsedPermissionId(newPermission.id.toString());
          console.debug(
            "✅ Set lastUsedPermissionId to:",
            newPermission.id.toString(),
          );
        } else {
          console.warn(
            "⚠️ Could not find newly created permission to set as lastUsedPermissionId",
          );
          console.debug("Available permissions:", freshPermissions);
          console.debug("Looking for grant URL:", grantUrlToMatch);
          console.debug("Looking for nonce:", nonceToMatch);
        }
      }, 2000);
    } catch (error) {
      console.error("Failed to grant permission:", error);
      setGrantStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsGranting(false);
      setGrantPreview(null);
    }
  };

  const handleCancelGrant = () => {
    onCloseGrant();
    setGrantPreview(null);
    setIsGranting(false);
    setGrantStatus("");
  };

  const handleRevokePermissionById = async (permissionId: string) => {
    if (!vana || !permissionId.trim()) return;

    setIsRevoking(true);

    try {
      // Convert permission ID to bigint
      const bigIntId = BigInt(permissionId);

      const params: RevokePermissionParams = {
        permissionId: bigIntId,
      };

      await vana.permissions.revoke(params);

      // Refresh permissions list
      loadUserPermissions();
    } catch (error) {
      console.error("Failed to revoke permission:", error);
    } finally {
      setIsRevoking(false);
    }
  };

  // Encryption testing functions (removed unused handlers)

  const _copyToClipboard = async (text: string, _type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Note: Status feedback removed as it's not used in new layout
    } catch {
      console.error("Failed to copy to clipboard");
    }
  };

  const handleDecryptFile = async (file: UserFile) => {
    if (!vana) {
      setFileDecryptErrors((prev) =>
        new Map(prev).set(
          file.id,
          "SDK not initialized. Please refresh the page and try again.",
        ),
      );
      return;
    }

    setDecryptingFiles((prev) => new Set(prev).add(file.id));
    // Clear any previous error for this file
    setFileDecryptErrors((prev) => {
      const newErrors = new Map(prev);
      newErrors.delete(file.id);
      return newErrors;
    });

    try {
      // Use SDK method to handle the complete decryption flow
      const decryptedBlob = await vana.data.decryptFile(
        file,
        DEFAULT_ENCRYPTION_SEED,
      );
      const decryptedText = await decryptedBlob.text();

      // Store the decrypted content
      setDecryptedFiles((prev) => new Map(prev).set(file.id, decryptedText));
    } catch (error) {
      console.error("Failed to decrypt file:", error);

      let userMessage = "";
      if (error instanceof Error) {
        // Check if it's a CORS error and try using proxy
        if (
          error.message.includes("CORS") ||
          error.message.includes("Failed to fetch")
        ) {
          try {
            console.info("🔄 CORS error detected, retrying with proxy...");

            // Show toast notification about retry
            addToast({
              title: "🔄 CORS Error Detected",
              description: "Retrying with proxy server...",
              color: "primary",
              timeout: 3000,
            });

            // Create a proxy URL for the file
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(file.url)}`;

            // Retry decryption using the proxy URL
            const decryptedBlob = await vana.data.decryptFile(
              { ...file, url: proxyUrl },
              DEFAULT_ENCRYPTION_SEED,
            );
            const decryptedText = await decryptedBlob.text();

            // Store the decrypted content
            setDecryptedFiles((prev) =>
              new Map(prev).set(file.id, decryptedText),
            );

            // Show success toast
            addToast({
              title: "✅ Proxy Success",
              description: "Successfully decrypted file using proxy server!",
              color: "success",
              timeout: 4000,
            });
            console.info("✅ Successfully decrypted file using proxy");
            return; // Success! Exit the error handling
          } catch (proxyError) {
            console.error("Proxy decryption also failed:", proxyError);
            userMessage = `🌐 CORS Error: File cannot be accessed directly or through proxy. This may be due to the file service blocking all external requests.`;
          }
        } else if (error.message.includes("Wrong encryption key")) {
          userMessage = `🔑 ${error.message}`;
        } else if (error.message.includes("Network error")) {
          userMessage = `🌐 ${error.message}`;
        } else if (error.message.includes("File not found")) {
          userMessage = `📁 ${error.message}`;
        } else if (error.message.includes("Invalid file format")) {
          userMessage = `📄 ${error.message}`;
        } else {
          userMessage = `❌ ${error.message}`;
        }
      } else {
        userMessage = "❌ Unknown error occurred while decrypting the file.";
      }

      setFileDecryptErrors((prev) => new Map(prev).set(file.id, userMessage));
    } finally {
      setDecryptingFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(file.id);
        return newSet;
      });
    }
  };

  const handleClearFileError = (fileId: number) => {
    setFileDecryptErrors((prev) => {
      const newErrors = new Map(prev);
      newErrors.delete(fileId);
      return newErrors;
    });
  };

  // Simple blob download utility function
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadDecryptedFile = (file: UserFile) => {
    const decryptedContent = decryptedFiles.get(file.id);
    if (decryptedContent) {
      const blob = new Blob([decryptedContent], { type: "text/plain" });
      const filename = `decrypted_file_${file.id}.txt`;
      downloadBlob(blob, filename);
    }
  };

  const handleLookupFile = async () => {
    if (!fileLookupId.trim() || !vana || !walletClient) {
      setFileLookupStatus(
        "❌ Please enter a file ID and ensure wallet is connected",
      );
      return;
    }

    setIsLookingUpFile(true);
    setFileLookupStatus("🔍 Looking up file...");

    try {
      const fileId = parseInt(fileLookupId.trim());
      if (isNaN(fileId) || fileId < 0) {
        throw new Error(
          "Invalid file ID. Please enter a valid positive number.",
        );
      }

      // Get file details using SDK method
      const file = await vana.data.getFileById(fileId);

      // Add to main files array if not already present
      setUserFiles((prev) => {
        const exists = prev.find((f) => f.id === file.id);
        if (exists) {
          // Update existing file to show it was also looked up
          return prev.map((f) =>
            f.id === file.id ? { ...f, source: "looked-up" } : f,
          );
        } else {
          // Add new file with looked-up source
          return [...prev, { ...file, source: "looked-up" as const }];
        }
      });
      setFileLookupStatus("✅ File found and added to the list!"); // Show success message
      setFileLookupId(""); // Clear the input

      // Clear success message after 2 seconds
      setTimeout(() => setFileLookupStatus(""), 2000);
    } catch (error) {
      console.error("❌ Error looking up file:", error);
      let userMessage = "❌ Failed to lookup file: ";
      if (error instanceof Error) {
        userMessage += error.message;
      } else {
        userMessage += "Unknown error occurred";
      }
      setFileLookupStatus(userMessage);
    } finally {
      setIsLookingUpFile(false);
    }
  };

  const handleLookupPermission = async () => {
    if (!permissionLookupId.trim() || !vana || !walletClient) {
      setPermissionLookupStatus(
        "❌ Please enter a permission ID and ensure wallet is connected",
      );
      return;
    }
    setIsLookingUpPermission(true);
    setPermissionLookupStatus("🔍 Looking up permission...");
    try {
      const permissionId = BigInt(permissionLookupId.trim());
      if (permissionId < 0n) {
        throw new Error(
          "Invalid permission ID. Please enter a valid positive number.",
        );
      }
      // Get permission details using SDK method
      const permissionInfo =
        await vana.permissions.getPermissionInfo(permissionId);
      const fileIds = await vana.permissions.getPermissionFileIds(permissionId);

      // Create a GrantedPermission object from the lookup result
      const permission: GrantedPermission = {
        id: permissionId,
        operation: "data_access", // Default operation - this would need to be determined from the grant
        files: fileIds.map((id) => Number(id)),
        parameters: undefined,
        grant: permissionInfo.grant,
        grantor: permissionInfo.grantor,
        grantee: address!, // Get the current user's address from useAccount hook
        active: true, // Assume it's active if we can look it up
      };

      setLookedUpPermission(permission);
      // Add to main permissions array if not already present
      setUserPermissions((prev) => {
        const exists = prev.find((p) => p.id === permissionId);
        if (exists) {
          return prev; // Already exists, no need to add
        } else {
          return [...prev, permission];
        }
      });
      setPermissionLookupStatus("✅ Permission found and added to the list!");
      setPermissionLookupId(""); // Clear the input
      // Clear success message after 2 seconds
      setTimeout(() => setPermissionLookupStatus(""), 2000);
    } catch (error) {
      console.error("❌ Error looking up permission:", error);
      let userMessage = "❌ Failed to lookup permission: ";
      if (error instanceof Error) {
        userMessage += error.message;
      } else {
        userMessage += "Unknown error occurred";
      }
      setPermissionLookupStatus(userMessage);
    } finally {
      setIsLookingUpPermission(false);
    }
  };

  // Removed unused blockchain upload handler

  // Note: getExplorerUrl function removed - using ExplorerLink component directly

  const handlePersonalServerCall = async () => {
    if (!address) return;

    // Parse permission ID
    let permissionId: number;
    if (personalPermissionId.trim()) {
      try {
        permissionId = parseInt(personalPermissionId.trim());
        if (isNaN(permissionId) || permissionId <= 0) {
          setPersonalError("Permission ID must be a valid positive number");
          return;
        }
      } catch {
        setPersonalError("Permission ID must be a valid number");
        return;
      }
    } else {
      setPersonalError("Please provide a permission ID");
      return;
    }

    setIsPersonalLoading(true);
    setPersonalError("");
    setPersonalResult(null);
    try {
      // Call our API route instead of using the SDK directly
      const response = await fetch("/api/trusted-server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          permissionId,
          chainId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      setPersonalResult(result.data);

      // Fetch and store permission context for display
      if (vana) {
        try {
          const permissionInfo = await vana.permissions.getPermissionInfo(
            BigInt(permissionId),
          );
          const _grantFile = await retrieveGrantFile(permissionInfo.grant);

          setLastUsedPermissionId(permissionId.toString());
          // Note: lastUsedPrompt removed as it's not used in new layout
        } catch (error) {
          console.warn("Failed to fetch permission context:", error);
          // Don't fail the main operation if context fetching fails
          setLastUsedPermissionId(permissionId.toString());
          // Note: lastUsedPrompt removed as it's not used in new layout
        }
      }
    } catch (error) {
      setPersonalError(
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setIsPersonalLoading(false);
    }
  };

  // Removed unused server decryption handler

  // Trust server handlers

  const handleDiscoverHostedServer = async () => {
    if (!address) return;

    setIsDiscoveringServer(true);
    setTrustServerError("");
    // Clear any previous discovery state

    try {
      // Call the trusted server setup API to discover/initialize the server identity
      const response = await fetch("/api/identity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userAddress: address,
          chainId: chainId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result: TrustedServerIdentityAPIResponse = await response.json();

      // Debug: Log the full response structure
      console.debug("🔍 Full API Response:", JSON.stringify(result, null, 2));
      console.debug("🔍 Response data:", result.data);

      // Extract server information from the SDK response
      // The SDK now returns: { userAddress, identity: { metadata: { derivedAddress, publicKey } }, timestamp }
      const derivedAddress = result.data?.address;
      const publicKey = result.data?.public_key;

      // Debug: Log extraction results
      console.debug("🔍 SDK Response data:", result.data);
      console.debug("🔍 Identity metadata:", result.data?.public_key);
      console.debug("🔍 Derived address:", derivedAddress);
      console.debug("🔍 Public key:", publicKey);

      if (!derivedAddress) {
        throw new Error("Could not determine server identity from response");
      }

      const serverInfo: DiscoveredServerInfo = {
        serverId: derivedAddress,
        serverUrl: result.data?.base_url || "",
        name: result.data?.name || "",
        publicKey: publicKey,
      };

      // Store discovered server info (functionality simplified for demo)

      // Auto-populate the form fields
      setServerId(serverInfo.serverId);
      setServerUrl(serverInfo.serverUrl);
    } catch (error) {
      setTrustServerError(
        error instanceof Error ? error.message : "Failed to discover server",
      );
    } finally {
      setIsDiscoveringServer(false);
    }
  };

  const handleTrustServer = async () => {
    if (!vana || !address) return;

    // Validate inputs
    if (!serverId.trim()) {
      setTrustServerError("Please provide a server ID (address)");
      return;
    }

    if (!serverUrl.trim()) {
      setTrustServerError("Please provide a server URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(serverUrl);
    } catch {
      setTrustServerError("Please provide a valid URL");
      return;
    }

    setIsTrustingServer(true);
    setTrustServerError("");

    try {
      await vana.permissions.trustServer({
        serverId: serverId as `0x${string}`,
        serverUrl: serverUrl,
      });

      // Success - form shows success via trustServerError being cleared
      // Refresh trusted servers list
      await loadUserTrustedServers();
    } catch (error) {
      setTrustServerError(
        error instanceof Error ? error.message : "Failed to trust server",
      );
    } finally {
      setIsTrustingServer(false);
    }
  };

  const handleTrustServerGasless = async () => {
    if (!vana || !address) return;

    // Validate inputs
    if (!serverId.trim()) {
      setTrustServerError("Please provide a server ID");
      return;
    }

    if (!serverUrl.trim()) {
      setTrustServerError("Please provide a server URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(serverUrl);
    } catch {
      setTrustServerError("Please provide a valid URL");
      return;
    }

    setIsTrustingServer(true);
    setTrustServerError("");

    try {
      await vana.permissions.trustServerWithSignature({
        serverId: serverId as `0x${string}`,
        serverUrl: serverUrl,
      });

      // Success - form shows success via trustServerError being cleared
      // Clear the form fields on success
      setServerId("");
      setServerUrl("");
      // Refresh trusted servers list
      await loadUserTrustedServers();
    } catch (error) {
      setTrustServerError(
        error instanceof Error ? error.message : "Failed to trust server",
      );
    } finally {
      setIsTrustingServer(false);
    }
  };

  const handleUntrustServer = async (serverIdToUntrust: string) => {
    if (!vana || !address) return;

    setIsUntrusting(true);
    try {
      if (appConfig.useGaslessTransactions) {
        await vana.permissions.untrustServerWithSignature({
          serverId: serverIdToUntrust as `0x${string}`,
        });
      } else {
        await vana.permissions.untrustServer({
          serverId: serverIdToUntrust as `0x${string}`,
        });
      }

      addToast({
        color: "success",
        title: "Server untrusted",
        description:
          "Server has been successfully removed from your trusted list",
      });

      // Refresh trusted servers list
      await loadUserTrustedServers();
    } catch (error) {
      console.error("Failed to untrust server:", error);
      addToast({
        color: "danger",
        title: "Failed to untrust server",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsUntrusting(false);
    }
  };

  // Removed unused trusted server upload handler

  const loadSchemas = useCallback(async () => {
    if (!vana) return;

    setIsLoadingSchemas(true);
    try {
      const count = await vana.schemas.count();
      setSchemasCount(count);

      // Load first 10 schemas for display
      const schemaList: (Schema & { source?: "discovered" })[] = [];
      const maxToLoad = Math.min(count, 10);

      for (let i = 1; i <= maxToLoad; i++) {
        try {
          const schema = await vana.schemas.get(i);
          schemaList.push({ ...schema, source: "discovered" });
        } catch (error) {
          console.warn(`Failed to load schema ${i}:`, error);
        }
      }

      setSchemas(schemaList);
    } catch (error) {
      console.error("Failed to load schemas:", error);
    } finally {
      setIsLoadingSchemas(false);
    }
  }, [vana]);

  const loadRefiners = useCallback(async () => {
    if (!vana) return;

    setIsLoadingRefiners(true);
    try {
      const count = await vana.data.getRefinersCount();
      setRefinersCount(count);

      // Load first 10 refiners for display
      const refinerList: (Refiner & { source?: "discovered" })[] = [];
      const maxToLoad = Math.min(count, 10);

      for (let i = 1; i <= maxToLoad; i++) {
        try {
          const refiner = await vana.data.getRefiner(i);
          refinerList.push({ ...refiner, source: "discovered" });
        } catch (error) {
          console.warn(`Failed to load refiner ${i}:`, error);
        }
      }

      setRefiners(refinerList);
    } catch (error) {
      console.error("Failed to load refiners:", error);
    } finally {
      setIsLoadingRefiners(false);
    }
  }, [vana]);

  // Load schemas, refiners, and trusted servers when vana is initialized
  useEffect(() => {
    if (vana && address) {
      loadUserTrustedServers();
      loadSchemas();
      loadRefiners();
    }
  }, [vana, address, loadUserTrustedServers, loadSchemas, loadRefiners]);

  // Schema management handlers
  const handleCreateSchema = async () => {
    if (
      !vana ||
      !schemaName.trim() ||
      !schemaType.trim() ||
      !schemaDefinitionUrl.trim()
    ) {
      setSchemaStatus("❌ Please fill in all schema fields");
      return;
    }

    setIsCreatingSchema(true);
    setSchemaStatus("Creating schema...");

    try {
      const params: AddSchemaParams = {
        name: schemaName,
        type: schemaType,
        definitionUrl: schemaDefinitionUrl,
      };

      const result = await vana.data.addSchema(params);
      setLastCreatedSchemaId(result.schemaId);
      setSchemaStatus("");

      // Add to schemas list
      const newSchema: Schema & { source: "created" } = {
        id: result.schemaId,
        name: schemaName,
        type: schemaType,
        definitionUrl: schemaDefinitionUrl,
        source: "created",
      };
      setSchemas((prev) => [newSchema, ...prev]);

      // Clear form
      setSchemaName("");
      setSchemaType("");
      setSchemaDefinitionUrl("");

      // Refresh counts
      setTimeout(() => {
        loadSchemas();
      }, 2000);
    } catch (error) {
      console.error("Failed to create schema:", error);
      setSchemaStatus(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsCreatingSchema(false);
    }
  };

  const handleCreateRefiner = async () => {
    if (
      !vana ||
      !refinerName.trim() ||
      !refinerDlpId.trim() ||
      !refinerSchemaId.trim() ||
      !refinerInstructionUrl.trim()
    ) {
      setRefinerStatus("❌ Please fill in all refiner fields");
      return;
    }

    const dlpId = parseInt(refinerDlpId);
    const schemaId = parseInt(refinerSchemaId);

    if (isNaN(dlpId) || isNaN(schemaId)) {
      setRefinerStatus("❌ DLP ID and Schema ID must be valid numbers");
      return;
    }

    setIsCreatingRefiner(true);
    setRefinerStatus("Creating refiner...");

    try {
      const params: AddRefinerParams = {
        dlpId,
        name: refinerName,
        schemaId,
        refinementInstructionUrl: refinerInstructionUrl,
      };

      const result = await vana.data.addRefiner(params);
      setLastCreatedRefinerId(result.refinerId);
      setRefinerStatus("");

      // Add to refiners list
      const newRefiner: Refiner & { source: "created" } = {
        id: result.refinerId,
        dlpId,
        owner: address || "0x0", // Current user is the owner
        name: refinerName,
        schemaId,
        refinementInstructionUrl: refinerInstructionUrl,
        source: "created",
      };
      setRefiners((prev) => [newRefiner, ...prev]);

      // Clear form
      setRefinerName("");
      setRefinerDlpId("");
      setRefinerSchemaId("");
      setRefinerInstructionUrl("");

      // Refresh counts
      setTimeout(() => {
        loadRefiners();
      }, 2000);
    } catch (error) {
      console.error("Failed to create refiner:", error);
      setRefinerStatus(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsCreatingRefiner(false);
    }
  };

  const handleUpdateSchemaId = async () => {
    if (!vana || !updateRefinerId.trim() || !updateSchemaId.trim()) {
      setUpdateSchemaStatus(
        "❌ Please provide both refiner ID and new schema ID",
      );
      return;
    }

    const refinerId = parseInt(updateRefinerId);
    const newSchemaId = parseInt(updateSchemaId);

    if (isNaN(refinerId) || isNaN(newSchemaId)) {
      setUpdateSchemaStatus("❌ Both IDs must be valid numbers");
      return;
    }

    setIsUpdatingSchema(true);
    setUpdateSchemaStatus("Updating schema ID...");

    try {
      const params: UpdateSchemaIdParams = {
        refinerId,
        newSchemaId,
      };

      await vana.data.updateSchemaId(params);
      setUpdateSchemaStatus("");

      // Clear form
      setUpdateRefinerId("");
      setUpdateSchemaId("");

      // Refresh refiners list
      setTimeout(() => {
        loadRefiners();
      }, 2000);
    } catch (error) {
      console.error("Failed to update schema ID:", error);
      setUpdateSchemaStatus(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsUpdatingSchema(false);
    }
  };

  // Demo experience handlers
  const handleDemoUploadNewText = async () => {
    if (!demoNewTextData.trim() || !vana) return;

    setIsDemoUploadingNewText(true);
    try {
      // Create a file from the text data
      const blob = new Blob([demoNewTextData], { type: "text/plain" });
      const file = new File([blob], "demo-text.txt", { type: "text/plain" });

      // Use the new high-level upload method
      const result = await vana.data.upload({
        content: blob,
        filename: file.name,
      });

      setDemoNewTextUploadResult({
        fileId: result.fileId,
        transactionHash: result.transactionHash as string,
      });

      // Add to selected files for permission granting
      setSelectedFiles([result.fileId]);

      // Refresh files list
      setTimeout(() => {
        loadUserFiles();
      }, 2000);
    } catch (error) {
      console.error("Failed to upload demo text:", error);
    } finally {
      setIsDemoUploadingNewText(false);
    }
  };

  const handleDemoRunLLM = async (permissionId: string) => {
    if (!permissionId) return;

    try {
      setPersonalPermissionId(permissionId);
      await handlePersonalServerCall();
    } catch (error) {
      console.error("Failed to run LLM:", error);
    }
  };

  // Create props for each view
  const userDashboardProps: UserDashboardViewProps = {
    fileLookupId,
    onFileLookupIdChange: setFileLookupId,
    onLookupFile: handleLookupFile,
    isLookingUpFile,
    fileLookupStatus,

    // Permission lookup props
    permissionLookupId,
    onPermissionLookupIdChange: setPermissionLookupId,
    onLookupPermission: handleLookupPermission,
    isLookingUpPermission,
    permissionLookupStatus,
    lookedUpPermission,

    userFiles,
    isLoadingFiles,
    onRefreshFiles: loadUserFiles,
    selectedFiles,
    decryptingFiles,
    decryptedFiles,
    fileDecryptErrors,
    onFileSelection: handleFileSelection,
    onDecryptFile: handleDecryptFile,
    onDownloadDecryptedFile: handleDownloadDecryptedFile,
    onClearFileError: handleClearFileError,
    onGrantPermission: handleGrantPermission,
    isGranting,
    grantStatus,
    grantTxHash,
    promptText,
    onPromptTextChange: setPromptText,
    applicationAddress,
    userPermissions,
    isLoadingPermissions,
    onRevokePermission: handleRevokePermissionById,
    isRevoking,
    onRefreshPermissions: loadUserPermissions,
    serverId,
    onServerIdChange: setServerId,
    serverUrl,
    onServerUrlChange: setServerUrl,
    onTrustServer: appConfig.useGaslessTransactions
      ? handleTrustServerGasless
      : handleTrustServer,
    isTrustingServer,
    onUntrustServer: handleUntrustServer,
    isUntrusting,
    onDiscoverReplicateServer: handleDiscoverHostedServer,
    isDiscoveringServer,
    trustedServers: trustedServers.map((server) => ({
      id: server.serverAddress,
      url: server.serverUrl,
      name: server.serverAddress,
    })),
    isLoadingServers: isLoadingTrustedServers,
    onRefreshServers: () => loadUserTrustedServers(trustedServerQueryMode),
    trustServerError,
    queryMode: trustedServerQueryMode,
    onQueryModeChange: setTrustedServerQueryMode,
    userAddress: address,
    chainId: chainId || 14800,
    vana: vana!,
    // Upload data functionality
    uploadInputMode,
    onUploadInputModeChange: setUploadInputMode,
    uploadTextData,
    onUploadTextDataChange: setUploadTextData,
    uploadSelectedFile,
    onUploadFileSelect: setUploadSelectedFile,
    uploadSelectedSchemaId,
    onUploadSchemaChange: setUploadSelectedSchemaId,
    onUploadData: async (data: {
      content: string;
      filename?: string;
      schemaId?: number;
      isValid?: boolean;
      validationErrors?: string[];
    }) => {
      if (!vana || !walletClient) {
        setUploadError("Wallet not connected");
        return;
      }

      setIsUploadingData(true);
      setUploadError(null);
      setUploadResult(null);

      try {
        // Use the new high-level upload method
        const uploadResult = await vana.data.upload({
          content: data.content,
          filename: data.filename || "uploaded_data.txt",
          schemaId: data.schemaId,
        });

        const result = {
          fileId: uploadResult.fileId,
          transactionHash: uploadResult.transactionHash,
          isValid: data.isValid,
          validationErrors: data.validationErrors,
        };

        setUploadResult(result);

        // Refresh the user files list
        await loadUserFiles();

        // Clear the form
        setUploadTextData("");
        setUploadSelectedFile(null);
        setUploadSelectedSchemaId(null);
      } catch (error) {
        console.error("Error uploading data:", error);
        setUploadError(
          error instanceof Error ? error.message : "Unknown error",
        );
      } finally {
        setIsUploadingData(false);
      }
    },
    isUploadingData,
    uploadResult,
    uploadError,
  };

  const developerDashboardProps: DeveloperDashboardViewProps = {
    schemasCount,
    refinersCount,
    schemaName,
    onSchemaNameChange: setSchemaName,
    schemaType,
    onSchemaTypeChange: setSchemaType,
    schemaDefinitionUrl,
    onSchemaDefinitionUrlChange: setSchemaDefinitionUrl,
    onCreateSchema: handleCreateSchema,
    isCreatingSchema,
    schemaStatus,
    lastCreatedSchemaId,
    refinerName,
    onRefinerNameChange: setRefinerName,
    refinerDlpId,
    onRefinerDlpIdChange: setRefinerDlpId,
    refinerSchemaId,
    onRefinerSchemaIdChange: setRefinerSchemaId,
    refinerInstructionUrl,
    onRefinerInstructionUrlChange: setRefinerInstructionUrl,
    onCreateRefiner: handleCreateRefiner,
    isCreatingRefiner,
    refinerStatus,
    lastCreatedRefinerId,
    updateRefinerId,
    onUpdateRefinerIdChange: setUpdateRefinerId,
    updateSchemaId,
    onUpdateSchemaIdChange: setUpdateSchemaId,
    onUpdateSchemaId: handleUpdateSchemaId,
    isUpdatingSchema,
    updateSchemaStatus,
    schemas,
    isLoadingSchemas,
    onRefreshSchemas: loadSchemas,
    refiners,
    isLoadingRefiners,
    onRefreshRefiners: loadRefiners,
    chainId: chainId || 14800,
    vana: vana!,
    walletClient: walletClient!,
  };

  const demoExperienceProps: DemoExperienceViewProps = {
    vana: vana!,
    serverId,
    onServerIdChange: setServerId,
    serverUrl,
    onServerUrlChange: setServerUrl,
    onDiscoverReplicateServer: handleDiscoverHostedServer,
    isDiscoveringServer,
    onTrustServer: appConfig.useGaslessTransactions
      ? handleTrustServerGasless
      : handleTrustServer,
    isTrustingServer,
    trustServerError,
    trustedServers: trustedServers.map((server) => ({
      id: server.serverAddress,
      url: server.serverUrl,
      name: server.serverAddress,
    })),
    userFiles,
    selectedFiles,
    onFileSelection: handleFileSelection,
    newTextData: demoNewTextData,
    onNewTextDataChange: setDemoNewTextData,
    onUploadNewText: handleDemoUploadNewText,
    isUploadingNewText: isDemoUploadingNewText,
    newTextUploadResult: demoNewTextUploadResult,
    onGrantPermission: handleGrantPermission,
    isGranting,
    grantStatus,
    grantTxHash,
    applicationAddress,
    onRunLLM: handleDemoRunLLM,
    isRunningLLM: isPersonalLoading,
    llmResult: personalResult,
    llmError: personalError,
    lastUsedPermissionId,
    chainId: chainId || 14800,
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar isBordered>
        <NavbarBrand>
          <h1 className="text-xl font-bold text-foreground">Vana SDK Demo</h1>
        </NavbarBrand>
        <NavbarContent justify="end">
          <NavbarItem>
            <ConnectButton />
          </NavbarItem>
        </NavbarContent>
      </Navbar>

      {!isConnected && (
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <Card className="max-w-md">
            <CardHeader className="flex-col items-start">
              <div>Get Started</div>
            </CardHeader>
            <CardBody>
              <p className="text-muted-foreground">
                Connect your wallet above to begin exploring the Vana SDK
                capabilities.
              </p>
            </CardBody>
          </Card>
        </div>
      )}

      {isConnected && !vana && (
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <Card className="max-w-md">
            <CardHeader className="flex-col items-start">
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                Initializing...
              </div>
            </CardHeader>
            <CardBody>
              <p className="text-muted-foreground">
                Setting up the Vana SDK with your wallet...
              </p>
            </CardBody>
          </Card>
        </div>
      )}

      {vana && (
        <div className="flex">
          <div className="flex-1">
            <MainLayout
              activeView={activeView}
              onViewChange={setActiveView}
              userDashboardProps={userDashboardProps}
              developerDashboardProps={developerDashboardProps}
              demoExperienceProps={demoExperienceProps}
            />
          </div>

          {/* Right Sidebar - SDK Configuration */}
          <div id="configuration">
            <SDKConfigurationSidebar
              sdkConfig={sdkConfig}
              onConfigChange={(config) =>
                setSdkConfig((prev) => ({ ...prev, ...config }))
              }
              appConfig={appConfig}
              onAppConfigChange={(config) =>
                setAppConfig((prev) => ({ ...prev, ...config }))
              }
              onGoogleDriveAuth={handleGoogleDriveAuth}
              onGoogleDriveDisconnect={handleGoogleDriveDisconnect}
            />
          </div>
        </div>
      )}

      {/* Grant Preview Modal */}
      <Modal
        isOpen={showGrantPreview && !!grantPreview}
        onClose={onCloseGrant}
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Review Grant
          </ModalHeader>
          <ModalBody>
            <GrantPreviewModalContent
              grantPreview={grantPreview}
              onConfirm={handleConfirmGrant}
              onCancel={handleCancelGrant}
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}
