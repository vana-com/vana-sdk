"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useWalletClient, useChainId } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  Vana,
  GrantPermissionParams,
  StorageManager,
  StorageProvider,
  PinataStorage,
  ServerProxyStorage,
  GoogleDriveStorage,
  WalletClient,
  PermissionGrantTypedData,
  GenericTypedData,
  TrustServerTypedData,
  UntrustServerTypedData,
  GrantFile,
  Hash,
  Address,
  retrieveGrantFile,
} from "@opendatalabs/vana-sdk/browser";
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
import { GrantPreviewModalContent } from "@/components/GrantPreviewModalContent";
import { Eye } from "lucide-react";
import {
  SDKConfigurationSidebar,
  type AppConfig,
} from "@/components/SDKConfigurationSidebar";
import { SidebarNavigation } from "@/components/SidebarNavigation";
import type { VanaChain } from "@opendatalabs/vana-sdk/browser";

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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  const [vana, setVana] = useState<Vana | null>(null);
  
  // Grant preview state
  const [grantPreview, setGrantPreview] = useState<GrantPreview | null>(null);
  const {
    isOpen: showGrantPreview,
    onOpen: onOpenGrant,
    onClose: onCloseGrant,
  } = useDisclosure();

  // Prompt state for customizable LLM prompt
  const [promptText, setPromptText] = useState<string>(
    "Create a comprehensive Digital DNA profile from this data that captures the essence of this person's digital footprint: {{data}}",
  );

  // Execution context state for displaying permission details
  const [lastUsedPermissionId, setLastUsedPermissionId] = useState<string>("");

  // Application address for permission granting
  const [applicationAddress, setApplicationAddress] = useState<string>("");

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

  // Personal server state
  const [personalResult, setPersonalResult] = useState<unknown>(null);
  const [personalError, setPersonalError] = useState<string>("");
  const [isPersonalLoading, setIsPersonalLoading] = useState(false);

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

            async submitFileAdditionComplete(params: {
              url: string;
              userAddress: Address;
              permissions: Array<{ account: Address; key: string }>;
              schemaId: number;
            }) {
              const response = await fetch("/api/relay/addFileComplete", {
                method: "POST",
                body: JSON.stringify(params),
                headers: { "Content-Type": "application/json" },
              });
              const data = await response.json();
              if (!data.success) {
                throw new Error(data.message || "Relay request failed");
              }
              return {
                fileId: data.fileId,
                transactionHash: data.transactionHash as Hash,
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

        } catch (error) {
          console.error("❌ Failed to initialize Vana SDK:", error);
        }
      })();
    } else {
      setVana(null);
      setApplicationAddress("");
    }
  }, [isConnected, walletClient, sdkConfig]);

  const handleConfirmGrant = async () => {
    if (!grantPreview || !vana) return;

    try {
      // Now create and sign the grant after user confirmation
      console.info("Creating grant file via SDK...");

      // Use the SDK to create and sign the grant
      const { typedData, signature } = await vana.permissions.createAndSign(
        grantPreview.params,
      );

      // Extract grant file for preview from the files array in typedData
      console.info("Retrieving grant file for preview...");

      // The SDK stores the grant file in IPFS and puts the URL in typedData.message.grant
      const grantUrl = typedData.message.grant;

      // Try to retrieve the stored grant file, but don't fail if CORS issues occur
      let grantFile = null;
      try {
        grantFile = await retrieveGrantFile(grantUrl);
      } catch (error) {
        console.warn(
          "Failed to retrieve grant file (likely CORS issue):",
          error,
        );
        // Create a minimal grant file from the typedData for preview
        grantFile = {
          grantee: grantPreview.params.to,
          operation: grantPreview.params.operation || "llm_inference",
          parameters: grantPreview.params.parameters || {},
          expires: grantPreview.params.expiresAt,
        };
      }

      // Update grant preview with signed data
      setGrantPreview({
        grantFile,
        grantUrl,
        params: grantPreview.params,
        typedData,
        signature,
      });

      console.info("Submitting to blockchain...");

      // Submit the signed grant
      const txHash = await vana.permissions.submitSignedGrant(
        typedData,
        signature as `0x${string}`,
      );

      console.info("Grant submitted successfully:", txHash);
      onCloseGrant();

      // Store the grant URL and nonce to identify the newly created permission
      const grantUrlToMatch = typedData.message.grant;
      const nonceToMatch = typedData.message.nonce;

      console.info("Permission created with grant URL:", grantUrlToMatch);

    } catch (error) {
      console.error("Failed to grant permission:", error);
    } finally {
      setGrantPreview(null);
    }
  };

  const handleCancelGrant = () => {
    onCloseGrant();
    setGrantPreview(null);
  };

  // Helper function to poll operation status
  const pollOperationStatus = async (
    operationId: string,
    permissionId: number,
  ) => {
    try {
      const response = await fetch("/api/trusted-server/poll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operationId,
          chainId,
        }),
      });

      if (!response.ok) {
        console.warn("Failed to poll Replicate status");
        return;
      }

      const result = await response.json();

      if (result.data?.status === "succeeded") {
        // Extract the actual AI response from output
        const aiResponse = result.data.result || "No output received";
        setPersonalResult(aiResponse);
        setIsPersonalLoading(false);
      } else if (result.data?.status === "failed") {
        setPersonalError(result.data?.error || "AI processing failed");
        setIsPersonalLoading(false);
      } else if (
        result.data?.status === "starting" ||
        result.data?.status === "processing"
      ) {
        // Still processing, poll again in 2 seconds
        setTimeout(() => pollOperationStatus(operationId, permissionId), 2000);
      } else {
        // Unknown status, stop polling
        console.warn("Unknown operation status:", result.data?.status);
        setPersonalError("Unknown operation status");
        setIsPersonalLoading(false);
      }
    } catch (error) {
      console.warn("Error polling Replicate status:", error);
      setIsPersonalLoading(false);
    }
  };

  const handleDemoRunLLM = async (permissionIdString: string) => {
    if (!address) return;

    // Parse permission ID
    let permissionId: number;
    try {
      permissionId = parseInt(permissionIdString.trim());
      if (isNaN(permissionId) || permissionId <= 0) {
        setPersonalError("Permission ID must be a valid positive number");
        return;
      }
    } catch {
      setPersonalError("Permission ID must be a valid number");
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

      // Handle the new OperationCreated response format
      if (result.data?.id) {
        // Start polling for the operation status
        pollOperationStatus(result.data.id, permissionId);
      } else {
        // Fallback for unexpected response format
        console.warn("Unexpected response format:", result.data);
        setPersonalError("Unexpected response format from server");
        setIsPersonalLoading(false);
      }

      // Store permission context for display
      if (vana) {
        try {
          setLastUsedPermissionId(permissionId.toString());
        } catch (error) {
          console.warn("Failed to set permission context:", error);
          // Don't fail the main operation if context setting fails
          setLastUsedPermissionId(permissionId.toString());
        }
      }
    } catch (error) {
      setPersonalError(
        error instanceof Error ? error.message : "Unknown error",
      );
      setIsPersonalLoading(false);
    }
  };

  // If not connected, show wallet connection prompt
  if (!isConnected) {
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
      </div>
    );
  }

  // If connected but SDK not initialized, show loading
  if (!vana) {
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
      </div>
    );
  }

  // Main dashboard layout with sidebar navigation and content
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

      <div className="flex">
        {/* Left Sidebar - Navigation */}
        <div className="w-64 min-h-[calc(100vh-4rem)] border-r border-border">
          <SidebarNavigation />
        </div>

        {/* Main Content Area */}
        <div className="flex-1">
          {children}
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