"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { VanaChain } from "vana-sdk";
import { useAccount, useWalletClient, useChainId } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  Vana,
  UserFile,
  GrantPermissionParams,
  RevokePermissionParams,
  GrantedPermission,
  generateEncryptionKey,
  encryptUserData,
  decryptUserData,
  DEFAULT_ENCRYPTION_SEED,
  StorageManager,
  StorageProvider,
  PinataStorage,
  ServerIPFSStorage,
  WalletClient,
  Schema,
  Refiner,
  AddSchemaParams,
  AddRefinerParams,
  UpdateSchemaIdParams,
} from "vana-sdk";

// Types for demo app state

interface GrantPreview {
  grantFile: {
    operation: string;
    files: number[];
    parameters: unknown;
    metadata?: unknown;
  };
  grantUrl: string;
  params: GrantPermissionParams & { grantUrl: string };
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
import { ResourceList } from "@/components/ui/ResourceList";
import { NavigationButton } from "@/components/ui/NavigationButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SectionDivider } from "@/components/ui/SectionDivider";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { EmptyState } from "@/components/ui/EmptyState";
import { PermissionListItem } from "@/components/PermissionListItem";
import { EncryptionTestCard } from "@/components/EncryptionTestCard";
import { TrustedServerManagementCard } from "@/components/TrustedServerManagementCard";
import { SchemaManagementCard } from "@/components/SchemaManagementCard";
import { ServerUploadCard } from "@/components/ServerUploadCard";
import { YourDataCard } from "@/components/YourDataCard";
import { TrustedServerIntegrationCard } from "@/components/TrustedServerIntegrationCard";
import { ContractListCard } from "@/components/ContractListCard";
import { SDKConfigurationSidebar } from "@/components/SDKConfigurationSidebar";
import { GrantPreviewModalContent } from "@/components/GrantPreviewModalContent";
import {
  ExternalLink,
  Database,
  Shield,
  Settings,
  Lock,
  Upload,
  Eye,
  Brain,
} from "lucide-react";

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
  const [revokeStatus, setRevokeStatus] = useState<string>("");

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
  const [encryptionSeed, setEncryptionSeed] = useState<string>(
    DEFAULT_ENCRYPTION_SEED,
  );
  const [testData, setTestData] = useState<string>(
    `{"message": "Hello Vana!", "timestamp": "${new Date().toISOString()}"}`,
  );
  const [generatedKey, setGeneratedKey] = useState<string>("");
  const [isGeneratingKey] = useState(false);
  const [encryptedData, setEncryptedData] = useState<Blob | null>(null);
  const [decryptedData, setDecryptedData] = useState<string>("");
  const [encryptionStatus, setEncryptionStatus] = useState<string>("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>("");
  const [showEncryptedContent, setShowEncryptedContent] = useState(false);

  // File decryption state
  const [decryptingFiles, setDecryptingFiles] = useState<Set<number>>(
    new Set(),
  );
  const [decryptedFiles, setDecryptedFiles] = useState<Map<number, string>>(
    new Map(),
  );
  const [_fileDecryptErrors, setFileDecryptErrors] = useState<
    Map<number, string>
  >(new Map());

  // Blockchain upload state
  const [isUploadingToChain, setIsUploadingToChain] = useState(false);
  const [newFileId, setNewFileId] = useState<number | null>(null);

  // Storage state (kept for demo UI functionality)
  const [_storageManager, setStorageManager] = useState<StorageManager | null>(
    null,
  );
  const [ipfsMode, setIpfsMode] = useState<"app-managed" | "user-managed">(
    "app-managed",
  );

  // Schema selection for file upload
  const [selectedUploadSchemaId, setSelectedUploadSchemaId] =
    useState<string>("");

  // File lookup state
  const [fileLookupId, setFileLookupId] = useState<string>("");
  const [isLookingUpFile, setIsLookingUpFile] = useState(false);
  const [fileLookupStatus, setFileLookupStatus] = useState<string>("");

  // Personal server state
  const [personalPermissionId, setPersonalPermissionId] = useState<string>("");
  const [personalResult, setPersonalResult] = useState<unknown>(null);
  const [personalError, setPersonalError] = useState<string>("");
  const [isPersonalLoading, setIsPersonalLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  // Server decryption demo state
  const [serverFileId, setServerFileId] = useState<string>("");
  const [serverPrivateKey, setServerPrivateKey] = useState<string>("");
  const [serverDecryptedData, setServerDecryptedData] = useState<string>("");
  const [serverDecryptError, setServerDecryptError] = useState<string>("");
  const [isServerDecrypting, setIsServerDecrypting] = useState(false);

  // Trust server state
  const [serverId, setServerId] = useState<string>("");
  const [serverUrl, setServerUrl] = useState<string>("");
  const [trustServerError, setTrustServerError] = useState<string>("");
  const [trustServerResult, setTrustServerResult] = useState<string>("");
  const [isTrustingServer, setIsTrustingServer] = useState(false);
  const [isUntrusting, setIsUntrusting] = useState(false);
  const [trustedServers, setTrustedServers] = useState<string[]>([]);
  const [isLoadingTrustedServers, setIsLoadingTrustedServers] = useState(false);
  const [useGaslessTransaction, setUseGaslessTransaction] = useState(false);

  // Server discovery state
  const [isDiscoveringServer, setIsDiscoveringServer] = useState(false);
  const [discoveredServerInfo, setDiscoveredServerInfo] = useState<{
    serverId: string;
    serverUrl: string;
    name: string;
  } | null>(null);

  // Trusted server file upload state
  const [selectedServerForUpload, setSelectedServerForUpload] =
    useState<string>("");
  const [serverFileToUpload, setServerFileToUpload] = useState<File | null>(
    null,
  );
  const [serverInputMode, setServerInputMode] = useState<"text" | "file">(
    "text",
  );
  const [serverTextData, setServerTextData] = useState<string>(
    `{"message": "Hello from trusted server!", "timestamp": "${new Date().toISOString()}"}`,
  );
  const [isUploadingToServer, setIsUploadingToServer] = useState(false);
  const [serverUploadStatus, setServerUploadStatus] = useState<string>("");
  const [serverUploadResult, setServerUploadResult] = useState<{
    fileId: number;
    transactionHash: string;
    url: string;
  } | null>(null);

  // Personal server setup state
  const [personalServerError] = useState<string>("");
  const [personalServerResult] = useState<string>("");

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
  });

  // Auto-fallback to app-ipfs for invalid configurations
  useEffect(() => {
    if (
      (sdkConfig.defaultStorageProvider === "user-ipfs" &&
        !sdkConfig.pinataJwt) ||
      sdkConfig.defaultStorageProvider === "google-drive" // Google Drive not implemented yet
    ) {
      setSdkConfig((prev) => ({ ...prev, defaultStorageProvider: "app-ipfs" }));
    }
  }, [sdkConfig.pinataJwt, sdkConfig.defaultStorageProvider]);
  const [configStatus, setConfigStatus] = useState<string>("");

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

  // Initialize Vana SDK when wallet is connected or user IPFS config changes
  useEffect(() => {
    if (isConnected && walletClient && walletClient.account) {
      try {
        // Initialize storage providers
        console.info("🏢 Setting up app-managed IPFS storage");
        const serverIPFS = new ServerIPFSStorage({
          uploadEndpoint: "/api/ipfs/upload",
        });

        const storageProviders: Record<string, StorageProvider> = {
          "app-ipfs": serverIPFS,
        };

        // Add user-managed IPFS if configured
        if (sdkConfig.pinataJwt) {
          console.info("👤 Adding user-managed Pinata IPFS storage");
          const pinataStorage = new PinataStorage({
            jwt: sdkConfig.pinataJwt,
            gatewayUrl: sdkConfig.pinataGateway,
          });
          storageProviders["user-ipfs"] = pinataStorage;

          // Test the connection
          pinataStorage
            .testConnection()
            .then(
              (result: {
                success: boolean;
                data?: unknown;
                error?: unknown;
              }) => {
                if (result.success) {
                  console.info(
                    "✅ User Pinata connection verified:",
                    result.data,
                  );
                } else {
                  console.warn(
                    "⚠️ User Pinata connection failed:",
                    result.error,
                  );
                }
              },
            );
        }

        // Determine the actual default storage provider based on what's available
        const actualDefaultProvider =
          sdkConfig.defaultStorageProvider === "user-ipfs" &&
          !sdkConfig.pinataJwt
            ? "app-ipfs" // Fallback to app-ipfs if user-ipfs is selected but not configured
            : sdkConfig.defaultStorageProvider;

        // Initialize Vana SDK with storage configuration
        const vanaInstance = new Vana({
          walletClient: walletClient as WalletClient & { chain: VanaChain }, // Type compatibility with Vana SDK
          relayerUrl: sdkConfig.relayerUrl || `${window.location.origin}`,
          subgraphUrl: sdkConfig.subgraphUrl || undefined,
          storage: {
            providers: storageProviders,
            defaultProvider: actualDefaultProvider,
          },
        });
        setVana(vanaInstance);
        console.info("✅ Vana SDK initialized:", vanaInstance.getConfig());

        // Create a separate storage manager for the demo UI (to maintain existing UI functionality)
        const manager = new StorageManager();
        for (const [name, provider] of Object.entries(storageProviders)) {
          manager.register(name, provider, name === "app-ipfs");
        }
        setStorageManager(manager);
        console.info("✅ Storage manager initialized with both IPFS patterns");
      } catch (error) {
        console.error("❌ Failed to initialize Vana SDK:", error);
      }
    } else {
      setVana(null);
      setStorageManager(null);
      setUserFiles([]);
      setSelectedFiles([]);
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
    if (!vana) return;

    setIsLoadingPermissions(true);
    try {
      const permissions = await vana.permissions.getUserPermissions({
        limit: 20,
      });
      setUserPermissions(permissions);
    } catch (error) {
      console.error("Failed to load user permissions:", error);
    } finally {
      setIsLoadingPermissions(false);
    }
  }, [vana]);

  // Load user files and permissions when Vana is initialized
  useEffect(() => {
    if (vana && address) {
      loadUserFiles();
      loadUserPermissions();
    }
  }, [vana, address, loadUserFiles, loadUserPermissions]);

  const handleFileSelection = (fileId: number, selected: boolean) => {
    if (selected) {
      setSelectedFiles((prev) => [...prev, fileId]);
    } else {
      setSelectedFiles((prev) => prev.filter((id) => id !== fileId));
    }
  };

  const handleGrantPermission = async () => {
    if (!vana || selectedFiles.length === 0) return;

    setIsGranting(true);
    setGrantStatus("Preparing permission grant...");
    setGrantTxHash("");

    try {
      // Create clear, unencrypted parameters for the grant
      const params: GrantPermissionParams = {
        to: "0x1234567890123456789012345678901234567890", // Demo DLP address
        operation: "llm_inference",
        files: selectedFiles,
        parameters: {
          prompt: "Analyze the user's data for insights and patterns",
          temperature: 0.7,
          model: "gpt-4",
          maxTokens: 2000,
          metadata: {
            requestedBy: "demo-app",
            timestamp: new Date().toISOString(),
            purpose: "Data analysis demonstration",
          },
        },
      };

      console.debug("🔍 Debug - Permission params:", {
        selectedFiles,
        paramsFiles: params.files,
        filesLength: params.files.length,
        operation: params.operation,
      });

      setGrantStatus("Creating grant file...");

      // Create grant file preview
      const grantFilePreview = {
        operation: params.operation,
        files: params.files,
        parameters: params.parameters,
        metadata: {
          timestamp: new Date().toISOString(),
          version: "1.0",
          userAddress: address,
        },
      };

      setGrantStatus("Storing grant file in IPFS...");

      // Store in IPFS first
      const grantFileBlob = new Blob(
        [JSON.stringify(grantFilePreview, null, 2)],
        {
          type: "application/json",
        },
      );

      const formData = new FormData();
      formData.append("file", grantFileBlob, "grant-file.json");

      const response = await fetch("/api/ipfs/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Failed to store grant file: ${response.statusText}`);
      }

      const storageResult = await response.json();
      if (!storageResult.success) {
        throw new Error(storageResult.error || "Failed to store grant file");
      }

      // Show preview to user
      setGrantPreview({
        grantFile: grantFilePreview,
        grantUrl: storageResult.url,
        params: {
          ...params,
          grantUrl: storageResult.url, // Pass the pre-stored URL to avoid duplicate storage
        },
      });
      onOpenGrant();
      setGrantStatus("Review the grant file before signing...");
    } catch (error) {
      console.error("Failed to prepare grant:", error);
      setGrantStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      setIsGranting(false);
    }
  };

  const handleConfirmGrant = async () => {
    if (!grantPreview || !vana) return;

    try {
      setGrantStatus("Awaiting signature...");

      const txHash = await vana.permissions.grant(grantPreview.params);

      setGrantStatus(""); // Clear status since permission will appear in list
      setGrantTxHash(txHash);
      onCloseGrant();

      // Refresh permissions to show the new grant
      setTimeout(() => {
        loadUserPermissions();
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
    setRevokeStatus("Preparing permission revoke...");

    try {
      // Convert permission ID to proper 32-byte hex Hash format
      const bigIntId = BigInt(permissionId);
      const grantIdAsHash =
        `0x${bigIntId.toString(16).padStart(64, "0")}` as `0x${string}`;

      const params: RevokePermissionParams = {
        grantId: grantIdAsHash,
      };

      setRevokeStatus("Awaiting signature...");

      await vana.permissions.revoke(params);

      setRevokeStatus(""); // Clear status since permission will disappear from list

      // Refresh permissions list
      loadUserPermissions();
    } catch (error) {
      console.error("Failed to revoke permission:", error);
      setRevokeStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsRevoking(false);
    }
  };

  // Encryption testing functions
  const handleGenerateKey = async () => {
    if (!walletClient) return;

    setIsEncrypting(true);
    setEncryptionStatus("Generating encryption key...");

    try {
      const key = await generateEncryptionKey(walletClient, encryptionSeed);
      setGeneratedKey(key);
      setEncryptionStatus("✅ Encryption key generated successfully!");
    } catch (error) {
      console.error("Failed to generate key:", error);
      setEncryptionStatus(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleEncryptData = async () => {
    if (!generatedKey) {
      setEncryptionStatus("❌ Please generate a key first");
      return;
    }

    if (inputMode === "text" && !testData) {
      setEncryptionStatus("❌ Please enter test data first");
      return;
    }

    if (inputMode === "file" && !uploadedFile) {
      setEncryptionStatus("❌ Please upload a file first");
      return;
    }

    setIsEncrypting(true);
    setEncryptionStatus("Encrypting data...");

    try {
      let dataBlob: Blob;
      let fileName: string;

      if (inputMode === "file" && uploadedFile) {
        dataBlob = uploadedFile;
        fileName = uploadedFile.name;
        setOriginalFileName(fileName);
      } else {
        dataBlob = new Blob([testData], { type: "text/plain" });
        fileName = "test-data.txt";
        setOriginalFileName(fileName);
      }

      const encrypted = await encryptUserData(dataBlob, generatedKey);
      setEncryptedData(encrypted);
      setEncryptionStatus("✅ Data encrypted successfully!");
    } catch (error) {
      console.error("Failed to encrypt data:", error);
      setEncryptionStatus(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleDecryptData = async () => {
    if (!encryptedData || !generatedKey) {
      setEncryptionStatus("❌ Please encrypt data first");
      return;
    }

    setIsEncrypting(true);
    setEncryptionStatus("Decrypting data...");

    try {
      const decrypted = await decryptUserData(encryptedData, generatedKey);
      const decryptedText = await decrypted.text();
      setDecryptedData(decryptedText);
      setEncryptionStatus("✅ Data decrypted successfully!");
    } catch (error) {
      console.error("Failed to decrypt data:", error);
      setEncryptionStatus(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsEncrypting(false);
    }
  };

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

  // Note: handleDownloadEncrypted functionality moved to EncryptionTestCard

  const handleDownloadDecrypted = () => {
    if (decryptedData) {
      const blob = new Blob([decryptedData], { type: "text/plain" });
      const filename = originalFileName || "decrypted-data.txt";
      downloadBlob(blob, filename);
    }
  };

  // Note: getBlobPreview functionality moved to EncryptionTestCard component

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setEncryptionStatus(`✅ ${type} copied to clipboard!`);
      setTimeout(() => setEncryptionStatus(""), 2000);
    } catch {
      setEncryptionStatus(`❌ Failed to copy ${type} to clipboard`);
      setTimeout(() => setEncryptionStatus(""), 2000);
    }
  };

  // Simplified copy function for components
  const handleCopyToClipboard = (text: string) => {
    copyToClipboard(text, "Content");
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
    // Clear any previous errors
    setFileDecryptErrors((prev) => {
      const newMap = new Map(prev);
      newMap.delete(file.id);
      return newMap;
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
        // Check if it's a CORS error and suggest using proxy
        if (
          error.message.includes("CORS") ||
          error.message.includes("Failed to fetch")
        ) {
          userMessage = `🌐 CORS Error: File cannot be accessed directly. This is likely due to the file being stored on Google Drive or another service that blocks cross-origin requests. The demo app now includes a proxy server to handle this.`;
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
      setFileLookupStatus(""); // Clear status since file appearance provides feedback
      setFileLookupId(""); // Clear the input
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

  const handleUploadToBlockchain = async () => {
    if (!encryptedData || !vana) {
      console.error("No encrypted data to upload or SDK not initialized");
      return;
    }

    // Check if Google Drive is selected but not configured
    if (sdkConfig.defaultStorageProvider === "google-drive") {
      console.error("Google Drive storage is not yet implemented");
      return;
    }

    // Determine which provider to use (allow IPFS mode override for IPFS providers)
    const providerName =
      sdkConfig.defaultStorageProvider === "app-ipfs" ||
      sdkConfig.defaultStorageProvider === "user-ipfs"
        ? ipfsMode === "app-managed"
          ? "app-ipfs"
          : "user-ipfs"
        : sdkConfig.defaultStorageProvider;

    // Check if user-managed IPFS is selected but not configured
    if (providerName === "user-ipfs" && !sdkConfig.pinataJwt) {
      console.error("User-managed IPFS not configured");
      return;
    }

    const displayName =
      providerName === "app-ipfs"
        ? "App-Managed IPFS"
        : providerName === "user-ipfs"
          ? "User-Managed IPFS"
          : String(providerName).toUpperCase();

    setIsUploadingToChain(true);
    console.info(`📤 Uploading encrypted data via ${displayName}...`);

    try {
      // Use SDK method to handle the complete upload flow
      const filename = originalFileName
        ? `${originalFileName}.encrypted`
        : "encrypted-data.bin";

      // Use schema-aware upload if a schema is selected
      const result = selectedUploadSchemaId
        ? await vana.data.uploadEncryptedFileWithSchema(
            encryptedData,
            parseInt(selectedUploadSchemaId),
            filename,
            providerName,
          )
        : await vana.data.uploadEncryptedFile(
            encryptedData,
            filename,
            providerName,
          );

      console.info("✅ File uploaded and registered:", {
        fileId: result.fileId,
        url: result.url,
        size: result.size,
        transactionHash: result.transactionHash,
      });

      setNewFileId(result.fileId);
      console.info("✅ File uploaded successfully");

      // Refresh user files to show the new file
      setTimeout(() => {
        loadUserFiles();
      }, 2000);
    } catch (error) {
      console.error("Failed to upload to blockchain:", error);
    } finally {
      setIsUploadingToChain(false);
    }
  };

  const handleResetEncryption = () => {
    setGeneratedKey("");
    setEncryptedData(null);
    setDecryptedData("");
    setEncryptionStatus("");
    setTestData(
      `{"message": "Hello Vana!", "timestamp": "${new Date().toISOString()}"}`,
    );
    setEncryptionSeed(DEFAULT_ENCRYPTION_SEED);
    setUploadedFile(null);
    setOriginalFileName("");
    setShowEncryptedContent(false);
    setInputMode("text");
    // Also clear file decryption state
    setDecryptedFiles(new Map());
    setFileDecryptErrors(new Map());
    // Clear blockchain upload state
    setIsUploadingToChain(false);
    setNewFileId(null);
    setSelectedUploadSchemaId("");
  };

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
          userAddress: address,
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
    } catch (error) {
      setPersonalError(
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setIsPersonalLoading(false);
    }
  };

  const handlePollStatus = async () => {
    const result = personalResult as { urls?: { get?: string } };
    if (!result?.urls?.get) return;

    if (!chainId) {
      setPersonalError(
        "Chain ID not available. Please ensure wallet is connected.",
      );
      return;
    }

    setIsPolling(true);
    setPersonalError("");
    try {
      const requestBody = {
        getUrl: result.urls.get,
        chainId,
      };

      // Call our API route for polling
      const response = await fetch("/api/trusted-server/poll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const pollingResult = await response.json();
      setPersonalResult(pollingResult.data);
    } catch (error) {
      setPersonalError(
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setIsPolling(false);
    }
  };

  // Server decryption demo handler
  const handleServerDecryption = async () => {
    if (!vana || !serverFileId.trim() || !serverPrivateKey.trim()) {
      setServerDecryptError(
        "Please provide both File ID and Server Private Key",
      );
      return;
    }

    setIsServerDecrypting(true);
    setServerDecryptError("");
    setServerDecryptedData("");

    try {
      const fileIdNum = parseInt(serverFileId.trim());
      if (isNaN(fileIdNum) || fileIdNum <= 0) {
        setServerDecryptError("File ID must be a valid positive number");
        return;
      }

      // Get the file from the blockchain
      const file = await vana.data.getFileById(fileIdNum);

      // Decrypt the file using the server's private key
      const decryptedBlob = await vana.data.decryptFileWithPermission(
        file,
        serverPrivateKey.trim(),
        address, // Server account address
      );

      // Convert blob to text for display
      const decryptedText = await decryptedBlob.text();
      setServerDecryptedData(decryptedText);
    } catch (error) {
      setServerDecryptError(
        error instanceof Error ? error.message : "Unknown error occurred",
      );
    } finally {
      setIsServerDecrypting(false);
    }
  };

  // Trust server handlers

  const handleDiscoverReplicateServer = async () => {
    if (!address) return;

    setIsDiscoveringServer(true);
    setTrustServerError("");
    setDiscoveredServerInfo(null);

    try {
      // Call the trusted server setup API to discover/initialize the server identity
      const response = await fetch("/api/trusted-server/setup", {
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

      const result = await response.json();

      // Extract server information from the personal server response
      // The API returns the user's personal server identity with address field
      const personalServerData = result.data;
      const serverAddress = personalServerData?.personal_server?.address;

      if (!serverAddress) {
        throw new Error("Could not determine server identity from response");
      }

      const serverInfo = {
        serverId: serverAddress,
        serverUrl: "https://api.replicate.com/v1/predictions",
        name: "Replicate",
      };

      setDiscoveredServerInfo(serverInfo);

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
    setTrustServerResult("");

    try {
      const txHash = await vana.permissions.trustServer({
        serverId: serverId as `0x${string}`,
        serverUrl: serverUrl,
      });

      setTrustServerResult(txHash);
      // Refresh trusted servers list
      await loadTrustedServers();
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
    setTrustServerResult("");

    try {
      const txHash = await vana.permissions.trustServerWithSignature({
        serverId: serverId as `0x${string}`,
        serverUrl: serverUrl,
      });

      setTrustServerResult(txHash);
      // Clear the form fields on success
      setServerId("");
      setServerUrl("");
      // Refresh trusted servers list
      await loadTrustedServers();
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
    setTrustServerError("");

    try {
      const txHash = await vana.permissions.untrustServer({
        serverId: serverIdToUntrust as `0x${string}`,
      });

      setTrustServerResult(txHash);
      // Refresh trusted servers list
      await loadTrustedServers();
    } catch (error) {
      setTrustServerError(
        error instanceof Error ? error.message : "Failed to untrust server",
      );
    } finally {
      setIsUntrusting(false);
    }
  };

  const loadTrustedServers = async () => {
    if (!vana || !address) return;

    setIsLoadingTrustedServers(true);
    try {
      const servers = await vana.permissions.getTrustedServers();
      setTrustedServers(servers);
    } catch (error) {
      console.error("Failed to load trusted servers:", error);
    } finally {
      setIsLoadingTrustedServers(false);
    }
  };

  const handleUploadToTrustedServer = async () => {
    if (!vana || !address || !selectedServerForUpload) {
      setServerUploadStatus("❌ Please select a server");
      return;
    }

    if (serverInputMode === "file" && !serverFileToUpload) {
      setServerUploadStatus("❌ Please select a file to upload");
      return;
    }

    if (serverInputMode === "text" && !serverTextData.trim()) {
      setServerUploadStatus("❌ Please enter text data to upload");
      return;
    }

    setIsUploadingToServer(true);
    setServerUploadStatus("");
    setServerUploadResult(null);

    try {
      // Get the server's public key from the trusted server registry via API
      const identityResponse = await fetch("/api/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          chainId: chainId,
        }),
      });

      if (!identityResponse.ok) {
        const errorData = await identityResponse.json();
        throw new Error(errorData.error || "Failed to get server public key");
      }

      const identityData = await identityResponse.json();
      const serverPublicKey = identityData.data.publicKey;

      // Create file or blob from input
      let fileToUpload: File;
      if (serverInputMode === "file" && serverFileToUpload) {
        fileToUpload = serverFileToUpload;
      } else {
        // Create a file from text data
        const blob = new Blob([serverTextData], { type: "text/plain" });
        fileToUpload = new File([blob], "text-data.txt", {
          type: "text/plain",
        });
      }

      // Upload file with permissions for the selected server
      const result = await vana.data.uploadFileWithPermissions(
        fileToUpload,
        [
          {
            account: selectedServerForUpload as `0x${string}`,
            publicKey: serverPublicKey,
          },
        ],
        fileToUpload.name,
        ipfsMode === "user-managed" ? "pinata" : undefined,
      );

      setServerUploadResult({
        fileId: result.fileId,
        transactionHash: result.transactionHash as string,
        url: result.url,
      });
      setServerUploadStatus("✅ File uploaded with server permissions!");

      // Clear the form
      setServerFileToUpload(null);
      setServerTextData(
        `{"message": "Hello from trusted server!", "timestamp": "${new Date().toISOString()}"}`,
      );
      setSelectedServerForUpload("");

      // Refresh user files
      await loadUserFiles();
    } catch (error) {
      setServerUploadStatus(
        `❌ Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsUploadingToServer(false);
    }
  };

  const loadSchemas = useCallback(async () => {
    if (!vana) return;

    setIsLoadingSchemas(true);
    try {
      const count = await vana.data.getSchemasCount();
      setSchemasCount(count);

      // Load first 10 schemas for display
      const schemaList: (Schema & { source?: "discovered" })[] = [];
      const maxToLoad = Math.min(count, 10);

      for (let i = 1; i <= maxToLoad; i++) {
        try {
          const schema = await vana.data.getSchema(i);
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

  // Load trusted servers when vana is initialized
  useEffect(() => {
    if (vana && address) {
      loadTrustedServers();
      loadSchemas();
      loadRefiners();
    }
  }, [vana, address, loadSchemas, loadRefiners]);

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

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left Sidebar - Navigation */}
        <div className="w-64 border-r border-divider bg-content1 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">SDK Demo</h2>
            <nav className="space-y-1">
              <NavigationButton
                icon={<Settings className="h-4 w-4" />}
                label="Configuration"
                targetId="configuration"
              />
              <div className="mt-4 mb-2">
                <div className="px-3 py-1 text-xs font-medium text-default-500 uppercase tracking-wider">
                  Core Concepts
                </div>
              </div>
              <NavigationButton
                icon={<Lock className="h-4 w-4" />}
                label="Encryption Testing"
                targetId="encryption"
              />
              <NavigationButton
                icon={<Database className="h-4 w-4" />}
                label="Your Data"
                targetId="data"
              />
              <NavigationButton
                icon={<Shield className="h-4 w-4" />}
                label="Permissions"
                targetId="permissions"
              />
              <div className="mt-4 mb-2">
                <div className="px-3 py-1 text-xs font-medium text-default-500 uppercase tracking-wider">
                  Applied Workflows
                </div>
              </div>
              <NavigationButton
                icon={<Shield className="h-4 w-4" />}
                label="Trusted Servers"
                targetId="trusted-servers"
              />
              <NavigationButton
                icon={<Upload className="h-4 w-4" />}
                label="Server Upload"
                targetId="server-upload"
              />
              <NavigationButton
                icon={<Brain className="h-4 w-4" />}
                label="Trusted Server"
                targetId="personal-server"
              />
              <NavigationButton
                icon={<Database className="h-4 w-4" />}
                label="Schema Management"
                targetId="schemas"
              />
              <NavigationButton
                icon={<ExternalLink className="h-4 w-4" />}
                label="Contracts"
                targetId="contracts"
              />
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            {!isConnected && (
              <Card>
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
            )}

            {isConnected && !vana && (
              <Card>
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
            )}

            {vana && (
              <div className="space-y-8" id="main-content">
                {/* Part 1: Core Concepts */}
                <SectionDivider text="Part 1: Core Concepts" />

                {/* Data Management Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Your Data */}
                  <YourDataCard
                    fileLookupId={fileLookupId}
                    onFileLookupIdChange={setFileLookupId}
                    onLookupFile={handleLookupFile}
                    isLookingUpFile={isLookingUpFile}
                    fileLookupStatus={fileLookupStatus}
                    userFiles={userFiles}
                    isLoadingFiles={isLoadingFiles}
                    onRefreshFiles={loadUserFiles}
                    selectedFiles={selectedFiles}
                    decryptingFiles={decryptingFiles}
                    decryptedFiles={decryptedFiles}
                    onFileSelection={handleFileSelection}
                    onDecryptFile={handleDecryptFile}
                    onDownloadDecryptedFile={handleDownloadDecryptedFile}
                    onGrantPermission={handleGrantPermission}
                    isGranting={isGranting}
                    grantStatus={grantStatus}
                    grantTxHash={grantTxHash}
                    userAddress={address}
                    chainId={chainId || 14800}
                  />

                  {/* Permissions Management */}

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

                  {/* Permissions Management */}
                  <Card id="permissions">
                    <CardHeader>
                      <SectionHeader
                        icon={<Shield className="h-5 w-5" />}
                        title="Permissions Management"
                        description={
                          <>
                            <em>
                              Demonstrates: `getPermissions()`,
                              `revokePermission()`, `grantPermission()`
                            </em>
                            <br />
                            View and manage data access permissions for your
                            files.
                          </>
                        }
                      />
                    </CardHeader>
                    <CardBody>
                      {revokeStatus && (
                        <StatusMessage status={revokeStatus} className="mb-4" />
                      )}

                      <ResourceList
                        title="Permissions Management"
                        description={`View and manage data access permissions (${userPermissions.length} permissions)`}
                        items={userPermissions}
                        isLoading={isLoadingPermissions}
                        onRefresh={loadUserPermissions}
                        renderItem={(permission) => (
                          <PermissionListItem
                            key={permission.id.toString()}
                            permission={permission}
                            onRevoke={handleRevokePermissionById}
                            isRevoking={isRevoking}
                          />
                        )}
                        emptyState={
                          <EmptyState
                            icon={<Shield className="h-12 w-12" />}
                            title="No permissions granted yet"
                          />
                        }
                      />
                    </CardBody>
                  </Card>
                </div>

                {/* Part 2: Applied Workflows */}
                <SectionDivider text="Part 2: Applied Workflows" />

                {/* Server Management Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Trusted Server Management */}
                  <TrustedServerManagementCard
                    serverId={serverId}
                    onServerIdChange={setServerId}
                    serverUrl={serverUrl}
                    onServerUrlChange={setServerUrl}
                    useGaslessTransaction={useGaslessTransaction}
                    onUseGaslessTransactionChange={setUseGaslessTransaction}
                    onTrustServer={handleTrustServer}
                    onTrustServerGasless={handleTrustServerGasless}
                    isTrustingServer={isTrustingServer}
                    onDiscoverReplicateServer={handleDiscoverReplicateServer}
                    isDiscoveringServer={isDiscoveringServer}
                    discoveredServerInfo={discoveredServerInfo}
                    trustServerError={trustServerError}
                    trustServerResult={trustServerResult}
                    personalServerError={personalServerError}
                    personalServerResult={personalServerResult}
                    trustedServers={trustedServers}
                    isLoadingTrustedServers={isLoadingTrustedServers}
                    onRefreshTrustedServers={loadTrustedServers}
                    onUntrustServer={handleUntrustServer}
                    isUntrusting={isUntrusting}
                    chainId={chainId}
                  />

                  {/* Schema Management */}
                  <SchemaManagementCard
                    schemasCount={schemasCount}
                    refinersCount={refinersCount}
                    schemaName={schemaName}
                    onSchemaNameChange={setSchemaName}
                    schemaType={schemaType}
                    onSchemaTypeChange={setSchemaType}
                    schemaDefinitionUrl={schemaDefinitionUrl}
                    onSchemaDefinitionUrlChange={setSchemaDefinitionUrl}
                    onCreateSchema={handleCreateSchema}
                    isCreatingSchema={isCreatingSchema}
                    schemaStatus={schemaStatus}
                    lastCreatedSchemaId={lastCreatedSchemaId}
                    refinerName={refinerName}
                    onRefinerNameChange={setRefinerName}
                    refinerDlpId={refinerDlpId}
                    onRefinerDlpIdChange={setRefinerDlpId}
                    refinerSchemaId={refinerSchemaId}
                    onRefinerSchemaIdChange={setRefinerSchemaId}
                    refinerInstructionUrl={refinerInstructionUrl}
                    onRefinerInstructionUrlChange={setRefinerInstructionUrl}
                    onCreateRefiner={handleCreateRefiner}
                    isCreatingRefiner={isCreatingRefiner}
                    refinerStatus={refinerStatus}
                    lastCreatedRefinerId={lastCreatedRefinerId}
                    updateRefinerId={updateRefinerId}
                    onUpdateRefinerIdChange={setUpdateRefinerId}
                    updateSchemaId={updateSchemaId}
                    onUpdateSchemaIdChange={setUpdateSchemaId}
                    onUpdateSchemaId={handleUpdateSchemaId}
                    isUpdatingSchema={isUpdatingSchema}
                    updateSchemaStatus={updateSchemaStatus}
                    schemas={schemas}
                    isLoadingSchemas={isLoadingSchemas}
                    onRefreshSchemas={loadSchemas}
                    refiners={refiners}
                    isLoadingRefiners={isLoadingRefiners}
                    onRefreshRefiners={loadRefiners}
                  />
                </div>

                {/* Trusted Server */}
                <TrustedServerIntegrationCard
                  serverFileId={serverFileId}
                  onServerFileIdChange={setServerFileId}
                  serverPrivateKey={serverPrivateKey}
                  onServerPrivateKeyChange={setServerPrivateKey}
                  onServerDecryption={handleServerDecryption}
                  isServerDecrypting={isServerDecrypting}
                  serverDecryptError={serverDecryptError}
                  serverDecryptedData={serverDecryptedData}
                  personalPermissionId={personalPermissionId}
                  onPersonalPermissionIdChange={setPersonalPermissionId}
                  onPersonalServerCall={handlePersonalServerCall}
                  isPersonalLoading={isPersonalLoading}
                  onPollStatus={handlePollStatus}
                  isPolling={isPolling}
                  personalError={personalError}
                  personalResult={personalResult}
                  onCopyToClipboard={copyToClipboard}
                />

                {/* Encryption Testing */}
                <EncryptionTestCard
                  encryptionSeed={encryptionSeed}
                  onEncryptionSeedChange={setEncryptionSeed}
                  encryptionKey={generatedKey}
                  isGeneratingKey={isGeneratingKey}
                  onGenerateKey={handleGenerateKey}
                  inputMode={inputMode}
                  onInputModeChange={setInputMode}
                  testData={testData}
                  onTestDataChange={setTestData}
                  uploadedFile={uploadedFile}
                  onFileUpload={setUploadedFile}
                  isEncrypting={isEncrypting}
                  onEncryptData={handleEncryptData}
                  onDecryptData={handleDecryptData}
                  onResetAll={handleResetEncryption}
                  encryptionStatus={encryptionStatus}
                  encryptedData={encryptedData}
                  decryptedData={decryptedData}
                  showEncryptedContent={showEncryptedContent}
                  onToggleEncryptedContent={() =>
                    setShowEncryptedContent(!showEncryptedContent)
                  }
                  schemas={schemas}
                  selectedSchemaId={selectedUploadSchemaId}
                  onSchemaSelectionChange={setSelectedUploadSchemaId}
                  isUploadingToChain={isUploadingToChain}
                  onUploadToChain={handleUploadToBlockchain}
                  newFileId={newFileId}
                  storageConfig={{
                    provider: sdkConfig.defaultStorageProvider || "app-ipfs",
                    ipfsMode: ipfsMode,
                  }}
                  ipfsModeOverride={ipfsMode}
                  onIpfsModeOverrideChange={(mode) =>
                    setIpfsMode(mode as "app-managed" | "user-managed")
                  }
                  useIpfsModeOverride={
                    sdkConfig.defaultStorageProvider === "app-ipfs" ||
                    sdkConfig.defaultStorageProvider === "user-ipfs"
                  }
                  onUseIpfsModeOverrideToggle={() => {}}
                  onCopyToClipboard={handleCopyToClipboard}
                  onDownloadDecrypted={handleDownloadDecrypted}
                />

                {/* Trusted Server File Upload */}
                <ServerUploadCard
                  trustedServers={trustedServers}
                  selectedServerForUpload={selectedServerForUpload}
                  onSelectedServerForUploadChange={setSelectedServerForUpload}
                  serverInputMode={serverInputMode}
                  onServerInputModeChange={setServerInputMode}
                  serverTextData={serverTextData}
                  onServerTextDataChange={setServerTextData}
                  serverFileToUpload={serverFileToUpload}
                  onServerFileToUploadChange={(file) => {
                    setServerFileToUpload(file);
                    setServerUploadStatus("");
                    setServerUploadResult(null);
                  }}
                  onUploadToTrustedServer={handleUploadToTrustedServer}
                  isUploadingToServer={isUploadingToServer}
                  serverUploadStatus={serverUploadStatus}
                  serverUploadResult={serverUploadResult}
                  chainId={chainId}
                />

                {/* Canonical Contracts */}
                <ContractListCard
                  contracts={vana.protocol.getAvailableContracts()}
                  getContract={(contractName) =>
                    vana.protocol.getContract(
                      contractName as
                        | "PermissionRegistry"
                        | "DataRegistry"
                        | "TeePoolPhala"
                        | "ComputeEngine"
                        | "DataRefinerRegistry"
                        | "QueryEngine"
                        | "ComputeInstructionRegistry"
                        | "TeePoolEphemeralStandard",
                    )
                  }
                  chainId={chainId}
                  chainName={vana?.protocol?.getChainName?.() || "this network"}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - SDK Configuration */}
        {vana && (
          <SDKConfigurationSidebar
            sdkConfig={sdkConfig}
            onConfigChange={(config) =>
              setSdkConfig((prev) => ({ ...prev, ...config }))
            }
            configStatus={configStatus}
            onApplyConfiguration={() => {
              setConfigStatus(
                "✅ Configuration will be applied on next SDK initialization",
              );
              setTimeout(() => setConfigStatus(""), 3000);
            }}
          />
        )}
      </div>
    </div>
  );
}
