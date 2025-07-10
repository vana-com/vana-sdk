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
  Input,
  Chip,
  Divider,
  Button,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Select,
  SelectItem,
  Textarea,
  Spinner,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
} from "@heroui/react";
import { AddressDisplay } from "@/components/AddressDisplay";
import { IpfsAddressDisplay } from "@/components/IpfsAddressDisplay";
import { PermissionDisplay } from "@/components/PermissionDisplay";
import { FileCard } from "@/components/FileCard";
import { ResourceList } from "@/components/ui/ResourceList";
import { FormBuilder } from "@/components/ui/FormBuilder";
import { StatusDisplay } from "@/components/ui/StatusDisplay";
import { FileUpload } from "@/components/ui/FileUpload";
import { getTxUrl, getAddressUrl } from "@/lib/explorer";
import {
  ExternalLink,
  Database,
  Shield,
  Settings,
  Lock,
  Key,
  FileText,
  RotateCcw,
  Upload,
  Download,
  Eye,
  EyeOff,
  Search,
  Copy,
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
  const [encryptedData, setEncryptedData] = useState<Blob | null>(null);
  const [decryptedData, setDecryptedData] = useState<string>("");
  const [encryptionStatus, setEncryptionStatus] = useState<string>("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>("");
  const [showEncryptedContent, setShowEncryptedContent] = useState(false);
  const [encryptedPreview, setEncryptedPreview] = useState<string>("");

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
  const [uploadToChainStatus, setUploadToChainStatus] = useState<string>("");
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
  useEffect(() => {
    if (encryptedData) {
      getBlobPreview(encryptedData).then(setEncryptedPreview);
    } else {
      setEncryptedPreview("");
    }
  }, [encryptedData]);

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

  const handleDownloadEncrypted = () => {
    if (encryptedData) {
      const filename = originalFileName
        ? `${originalFileName}.encrypted`
        : "encrypted-data.bin";
      downloadBlob(encryptedData, filename);
    }
  };

  const handleDownloadDecrypted = () => {
    if (decryptedData) {
      const blob = new Blob([decryptedData], { type: "text/plain" });
      const filename = originalFileName || "decrypted-data.txt";
      downloadBlob(blob, filename);
    }
  };

  const getBlobPreview = async (blob: Blob): Promise<string> => {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const hex = Array.from(uint8Array)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      return hex;
    } catch {
      return "Unable to preview blob content";
    }
  };

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
        if (error.message.includes("Wrong encryption key")) {
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
      setUploadToChainStatus(
        "❌ No encrypted data to upload or SDK not initialized",
      );
      return;
    }

    // Check if Google Drive is selected but not configured
    if (sdkConfig.defaultStorageProvider === "google-drive") {
      setUploadToChainStatus(
        "❌ Google Drive storage is not yet implemented. Please select IPFS in SDK Configuration.",
      );
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
      setUploadToChainStatus(
        "❌ User-managed IPFS not configured. Enter your Pinata JWT token or use app-managed IPFS.",
      );
      return;
    }

    const displayName =
      providerName === "app-ipfs"
        ? "App-Managed IPFS"
        : providerName === "user-ipfs"
          ? "User-Managed IPFS"
          : String(providerName).toUpperCase();

    setIsUploadingToChain(true);
    setUploadToChainStatus(`📤 Uploading encrypted data via ${displayName}...`);

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
      setUploadToChainStatus(""); // Clear status since file will appear in list

      // Refresh user files to show the new file
      setTimeout(() => {
        loadUserFiles();
      }, 2000);
    } catch (error) {
      console.error("Failed to upload to blockchain:", error);
      setUploadToChainStatus(
        `❌ Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
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
    setEncryptedPreview("");
    setInputMode("text");
    // Also clear file decryption state
    setDecryptedFiles(new Map());
    setFileDecryptErrors(new Map());
    // Clear blockchain upload state
    setIsUploadingToChain(false);
    setUploadToChainStatus("");
    setNewFileId(null);
    setSelectedUploadSchemaId("");
  };

  const getExplorerUrl = (txHash: string) => {
    return getTxUrl(chainId || 14800, txHash);
  };

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

    setIsPolling(true);
    setPersonalError("");
    try {
      // Call our API route for polling
      const response = await fetch("/api/personal/poll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          getUrl: result.urls.get,
        }),
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
              <button
                onClick={() =>
                  document
                    .getElementById("configuration")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-default-100 transition-colors w-full text-left"
              >
                <Settings className="h-4 w-4" />
                Configuration
              </button>
              <div className="mt-4 mb-2">
                <div className="px-3 py-1 text-xs font-medium text-default-500 uppercase tracking-wider">
                  Core Concepts
                </div>
              </div>
              <button
                onClick={() =>
                  document
                    .getElementById("encryption")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-default-100 transition-colors w-full text-left"
              >
                <Lock className="h-4 w-4" />
                Encryption Testing
              </button>
              <button
                onClick={() =>
                  document
                    .getElementById("data")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-default-100 transition-colors w-full text-left"
              >
                <Database className="h-4 w-4" />
                Your Data
              </button>
              <button
                onClick={() =>
                  document
                    .getElementById("permissions")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-default-100 transition-colors w-full text-left"
              >
                <Shield className="h-4 w-4" />
                Permissions
              </button>
              <div className="mt-4 mb-2">
                <div className="px-3 py-1 text-xs font-medium text-default-500 uppercase tracking-wider">
                  Applied Workflows
                </div>
              </div>
              <button
                onClick={() =>
                  document
                    .getElementById("trusted-servers")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-default-100 transition-colors w-full text-left"
              >
                <Shield className="h-4 w-4" />
                Trusted Servers
              </button>
              <button
                onClick={() =>
                  document
                    .getElementById("server-upload")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-default-100 transition-colors w-full text-left"
              >
                <Upload className="h-4 w-4" />
                Server Upload
              </button>
              <button
                onClick={() =>
                  document
                    .getElementById("personal-server")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-default-100 transition-colors w-full text-left"
              >
                <Brain className="h-4 w-4" />
                Trusted Server
              </button>
              <button
                onClick={() =>
                  document
                    .getElementById("schemas")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-default-100 transition-colors w-full text-left"
              >
                <Database className="h-4 w-4" />
                Schema Management
              </button>
              <button
                onClick={() =>
                  document
                    .getElementById("contracts")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-default-100 transition-colors w-full text-left"
              >
                <ExternalLink className="h-4 w-4" />
                Contracts
              </button>
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
                <div className="flex items-center gap-4 my-8">
                  <Divider className="flex-1" />
                  <div className="px-4 py-2 bg-primary/10 rounded-full">
                    <span className="text-sm font-medium text-primary">
                      Part 1: Core Concepts
                    </span>
                  </div>
                  <Divider className="flex-1" />
                </div>

                {/* Data Management Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Your Data */}
                  <Card id="data">
                    <CardHeader className="flex-col items-start">
                      <div className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Your Data
                      </div>
                      <p className="text-small text-default-500 mt-1">
                        <em>
                          Demonstrates: `getUserFiles()`, `uploadFile()`,
                          `decryptUserData()`
                        </em>
                        <br />
                        Manage your registered data files and decrypt content
                        you own.
                      </p>
                    </CardHeader>
                    <CardBody>
                      <div className="flex items-center gap-2 mb-4 ml-auto">
                        <Input
                          placeholder="Enter file ID"
                          type="text"
                          value={fileLookupId}
                          onChange={(e) => setFileLookupId(e.target.value)}
                          className="w-32"
                          size="sm"
                        />
                        <Button
                          onPress={handleLookupFile}
                          disabled={isLookingUpFile || !fileLookupId.trim()}
                          size="sm"
                        >
                          {isLookingUpFile ? (
                            <Spinner size="sm" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      <ResourceList
                        title="Your Data Files"
                        description={`Manage your registered data files and grant permissions (${userFiles.length} files)`}
                        items={userFiles}
                        isLoading={isLoadingFiles}
                        onRefresh={loadUserFiles}
                        renderItem={(file) => {
                          const isDecrypting = decryptingFiles.has(file.id);
                          const decryptedContent = decryptedFiles.get(file.id);
                          return (
                            <FileCard
                              key={file.id}
                              file={file}
                              isSelected={selectedFiles.includes(file.id)}
                              isDecrypted={!!decryptedContent}
                              decryptedContent={decryptedContent}
                              isDecrypting={isDecrypting}
                              userAddress={address}
                              onSelect={() =>
                                handleFileSelection(
                                  file.id,
                                  !selectedFiles.includes(file.id),
                                )
                              }
                              onDecrypt={() => handleDecryptFile(file)}
                              onDownloadDecrypted={() =>
                                handleDownloadDecryptedFile(file)
                              }
                            />
                          );
                        }}
                        emptyState={
                          <div className="text-center py-8 text-muted-foreground">
                            <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p className="font-medium mb-2">
                              No data files found
                            </p>
                            <p className="text-sm">
                              Upload and encrypt files to get started
                            </p>
                          </div>
                        }
                      />

                      {userFiles.length > 0 && (
                        <div className="mt-4 p-3 bg-primary/10 rounded">
                          <p className="text-sm text-primary">
                            <strong>Selected files:</strong>{" "}
                            {selectedFiles.length} • Use &quot;Decrypt&quot; to
                            view encrypted file contents using your wallet
                            signature.
                          </p>
                        </div>
                      )}

                      {fileLookupStatus && (
                        <StatusDisplay
                          status={fileLookupStatus}
                          className="mt-4"
                        />
                      )}

                      {/* Grant Permission Section */}
                      {selectedFiles.length > 0 && (
                        <div className="mt-6 p-4 bg-green-50/50 rounded">
                          <h3 className="font-medium mb-3 text-green-700">
                            Grant Permission ({selectedFiles.length} file
                            {selectedFiles.length !== 1 ? "s" : ""} selected)
                          </h3>
                          <Button
                            onPress={handleGrantPermission}
                            disabled={selectedFiles.length === 0 || isGranting}
                            className="mb-4"
                          >
                            {isGranting && (
                              <Spinner size="sm" className="mr-2" />
                            )}
                            Grant Permission to Selected Files
                          </Button>

                          {grantStatus && (
                            <p
                              className={`text-sm ${grantStatus.includes("Error") ? "text-destructive" : "text-green-600"} mt-2`}
                            >
                              {grantStatus}
                            </p>
                          )}

                          {grantTxHash && (
                            <div className="mt-4 p-4 bg-muted rounded-lg">
                              <p className="font-medium mb-2">
                                Transaction Hash:
                              </p>
                              <AddressDisplay
                                address={grantTxHash}
                                explorerUrl={getExplorerUrl(grantTxHash)}
                                truncate={true}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </CardBody>
                  </Card>

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
                      <ModalBody className="space-y-3">
                        {grantPreview && (
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Operation:</span>
                              <p className="text-muted-foreground">
                                {grantPreview.grantFile.operation}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium">Files:</span>
                              <p className="text-muted-foreground">
                                [{grantPreview.grantFile.files.join(", ")}]
                              </p>
                            </div>
                          </div>
                        )}

                        {grantPreview && (
                          <>
                            <div>
                              <IpfsAddressDisplay
                                ipfsUrl={grantPreview.grantUrl}
                                label="IPFS URL"
                                truncate={false}
                              />
                            </div>

                            <div>
                              <span className="text-sm font-medium">
                                Parameters:
                              </span>
                              <div className="mt-2 p-2 bg-muted rounded max-h-28 overflow-y-auto">
                                <pre className="text-xs font-mono whitespace-pre-wrap">
                                  {JSON.stringify(
                                    grantPreview.grantFile.parameters,
                                    null,
                                    2,
                                  )}
                                </pre>
                              </div>
                            </div>

                            <div className="flex gap-3 justify-end pt-2">
                              <Button
                                variant="bordered"
                                onPress={handleCancelGrant}
                              >
                                Cancel
                              </Button>
                              <Button onPress={handleConfirmGrant}>
                                Sign Transaction
                              </Button>
                            </div>
                          </>
                        )}
                      </ModalBody>
                    </ModalContent>
                  </Modal>

                  {/* Permissions Management */}
                  <Card id="permissions">
                    <CardHeader className="flex-col items-start">
                      <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Permissions Management
                      </div>
                      <p className="text-small text-default-500 mt-1">
                        <em>
                          Demonstrates: `getPermissions()`,
                          `revokePermission()`, `grantPermission()`
                        </em>
                        <br />
                        View and manage data access permissions for your files.
                      </p>
                    </CardHeader>
                    <CardBody>
                      {revokeStatus && (
                        <div
                          className={`text-sm p-3 rounded-md mb-4 ${
                            revokeStatus.includes("Error")
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-green-50 text-green-700 border border-green-200"
                          }`}
                        >
                          {revokeStatus}
                        </div>
                      )}

                      <ResourceList
                        title="Permissions Management"
                        description={`View and manage data access permissions (${userPermissions.length} permissions)`}
                        items={userPermissions}
                        isLoading={isLoadingPermissions}
                        onRefresh={loadUserPermissions}
                        renderItem={(permission) => (
                          <div
                            key={permission.id.toString()}
                            className="p-4 border rounded-lg"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <div className="text-sm font-medium">
                                    Permission ID:{" "}
                                    <PermissionDisplay
                                      permissionId={permission.id}
                                      className="inline-flex"
                                    />
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    <strong>Grant File:</strong>
                                    <a
                                      href={
                                        permission.grant.startsWith("ipfs://")
                                          ? permission.grant.replace(
                                              "ipfs://",
                                              "https://ipfs.io/ipfs/",
                                            )
                                          : permission.grant
                                      }
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ml-1 text-blue-600 hover:text-blue-800 underline"
                                    >
                                      View Grant File
                                    </a>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    <strong>Operation:</strong>{" "}
                                    {permission.operation}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">
                                    <strong>Files:</strong>{" "}
                                    {permission.files.length} file
                                    {permission.files.length !== 1 ? "s" : ""}
                                    {permission.files.length > 0 && (
                                      <span className="ml-1">
                                        ({permission.files.join(", ")})
                                      </span>
                                    )}
                                  </p>
                                  {permission.parameters !== null && (
                                    <div className="text-sm text-muted-foreground">
                                      <details className="group">
                                        <summary className="cursor-pointer hover:text-foreground">
                                          <strong>Parameters:</strong> Click to
                                          expand
                                        </summary>
                                        <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                                          {typeof permission.parameters ===
                                          "string"
                                            ? permission.parameters
                                            : JSON.stringify(
                                                permission.parameters,
                                                null,
                                                2,
                                              )}
                                        </pre>
                                      </details>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                color="danger"
                                onPress={() =>
                                  handleRevokePermissionById(
                                    permission.id.toString(),
                                  )
                                }
                                disabled={isRevoking}
                                className="ml-4"
                              >
                                {isRevoking ? <Spinner size="sm" /> : "Revoke"}
                              </Button>
                            </div>
                          </div>
                        )}
                        emptyState={
                          <div className="text-center py-8 text-muted-foreground">
                            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No permissions granted yet</p>
                          </div>
                        }
                      />
                    </CardBody>
                  </Card>
                </div>

                {/* Part 2: Applied Workflows */}
                <div className="flex items-center gap-4 my-8">
                  <Divider className="flex-1" />
                  <div className="px-4 py-2 bg-secondary/10 rounded-full">
                    <span className="text-sm font-medium text-secondary-foreground">
                      Part 2: Applied Workflows
                    </span>
                  </div>
                  <Divider className="flex-1" />
                </div>

                {/* Server Management Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Trust Server */}
                  <Card>
                    <CardHeader className="flex-col items-start">
                      <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Trusted Server Management
                      </div>
                      <p className="text-small text-default-500 mt-1">
                        <em>
                          Demonstrates: `trustServer()`, `untrustServer()`,
                          `getTrustedServers()`
                        </em>
                        <br />
                        Manage your list of trusted servers for data processing
                        - required before uploading to servers.
                      </p>
                    </CardHeader>
                    <CardBody className="space-y-6">
                      {/* Trust Server Form */}
                      <FormBuilder
                        title="Trust Server"
                        fields={[
                          {
                            name: "serverId",
                            label: "Server ID (EVM Address)",
                            type: "text",
                            placeholder: "0x1234567890abcdef...",
                            value: serverId,
                            onChange: setServerId,
                            required: true,
                          },
                          {
                            name: "serverUrl",
                            label: "Server URL",
                            type: "url",
                            placeholder:
                              "https://api.replicate.com/v1/predictions",
                            value: serverUrl,
                            onChange: setServerUrl,
                            required: true,
                          },
                          {
                            name: "transactionType",
                            label: "Transaction Type",
                            type: "select",
                            value: useGaslessTransaction
                              ? "gasless"
                              : "regular",
                            onChange: (value) =>
                              setUseGaslessTransaction(value === "gasless"),
                            options: [
                              { value: "regular", label: "Regular (Pay Gas)" },
                              {
                                value: "gasless",
                                label: "Gasless (Signature)",
                              },
                            ],
                            required: true,
                          },
                        ]}
                        onSubmit={
                          useGaslessTransaction
                            ? handleTrustServerGasless
                            : handleTrustServer
                        }
                        isSubmitting={isTrustingServer}
                        submitText={
                          useGaslessTransaction
                            ? "Sign & Trust Server"
                            : "Trust Server"
                        }
                        submitIcon={<Shield className="h-4 w-4" />}
                        status={trustServerError}
                        statusType="error"
                      />

                      {/* Success Result Display */}
                      {trustServerResult && (
                        <div className="p-4 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <p className="text-green-700 dark:text-green-300 font-medium">
                              Server trusted successfully!
                            </p>
                          </div>
                          <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                            <AddressDisplay
                              address={trustServerResult}
                              showCopy={true}
                              showExternalLink={true}
                              explorerUrl={getTxUrl(chainId, trustServerResult)}
                              label="Transaction Hash"
                            />
                          </div>
                        </div>
                      )}

                      {/* Trusted Servers List */}
                      <div className="space-y-4 pt-2 border-t">
                        <ResourceList
                          title="Your Trusted Servers"
                          description={`Servers you've authorized for data processing (${trustedServers.length} servers)`}
                          items={trustedServers}
                          isLoading={isLoadingTrustedServers}
                          onRefresh={loadTrustedServers}
                          renderItem={(server, index) => (
                            <div
                              key={server}
                              className="flex items-center justify-between p-4 bg-muted rounded-lg border"
                            >
                              <div className="flex items-center space-x-3">
                                <Chip variant="flat">#{index + 1}</Chip>
                                <AddressDisplay
                                  address={server}
                                  showCopy={true}
                                  showExternalLink={true}
                                  explorerUrl={getAddressUrl(chainId, server)}
                                />
                              </div>
                              <Button
                                onPress={() => handleUntrustServer(server)}
                                disabled={isUntrusting}
                                color="danger"
                                size="sm"
                              >
                                {isUntrusting ? (
                                  <Spinner size="sm" />
                                ) : (
                                  "Untrust"
                                )}
                              </Button>
                            </div>
                          )}
                          emptyState={
                            <div className="text-center p-6 text-muted-foreground">
                              <p>No trusted servers found.</p>
                            </div>
                          }
                        />
                      </div>

                      {/* Trusted Server Setup Result Display */}
                      {personalServerError && (
                        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                          <p className="text-destructive text-sm">
                            {personalServerError}
                          </p>
                        </div>
                      )}

                      {personalServerResult && (
                        <div className="p-4 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <p className="text-green-700 dark:text-green-300 font-medium">
                              Personal server initialized successfully!
                            </p>
                          </div>
                          {serverId && (
                            <div className="space-y-2">
                              <p className="text-green-600 dark:text-green-400 text-sm">
                                Your server ID has been auto-populated above.
                                You can now trust your server.
                              </p>
                              <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                                <AddressDisplay
                                  address={serverId}
                                  showCopy={true}
                                  showExternalLink={true}
                                  explorerUrl={getAddressUrl(chainId, serverId)}
                                  label="Server ID (Derived Address)"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardBody>
                  </Card>

                  {/* Schema Management */}
                  <Card>
                    <CardHeader className="flex-col items-start">
                      <div className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Schema Management
                      </div>
                      <p className="text-small text-default-500 mt-1">
                        <em>
                          Demonstrates: `addSchema()`, `addRefiner()`,
                          `getSchemas()`, `getRefiners()`
                        </em>
                        <br />
                        Manage data schemas and refiners for structured data
                        processing workflows.
                      </p>
                    </CardHeader>
                    <CardBody className="space-y-6">
                      {/* Schema Statistics */}
                      <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-primary">
                            {schemasCount}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Total Schemas
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-primary">
                            {refinersCount}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Total Refiners
                          </div>
                        </div>
                      </div>

                      {/* Create Schema */}
                      <div className="p-4 border rounded-lg">
                        <FormBuilder
                          title="Create New Schema"
                          fields={[
                            {
                              name: "name",
                              label: "Name",
                              type: "text",
                              placeholder: "e.g., User Profile Schema",
                              value: schemaName,
                              onChange: setSchemaName,
                              required: true,
                            },
                            {
                              name: "type",
                              label: "Type",
                              type: "text",
                              placeholder: "e.g., json-schema",
                              value: schemaType,
                              onChange: setSchemaType,
                              required: true,
                            },
                            {
                              name: "definitionUrl",
                              label: "Definition URL",
                              type: "url",
                              placeholder: "https://example.com/schema.json",
                              value: schemaDefinitionUrl,
                              onChange: setSchemaDefinitionUrl,
                              required: true,
                            },
                          ]}
                          onSubmit={handleCreateSchema}
                          isSubmitting={isCreatingSchema}
                          submitText="Create Schema"
                          submitIcon={<Database className="h-4 w-4" />}
                          status={schemaStatus}
                          statusType={
                            schemaStatus?.includes("❌") ? "error" : "success"
                          }
                        />
                        {lastCreatedSchemaId && (
                          <div className="p-3 bg-green-50 border border-green-200 rounded mt-4">
                            <p className="text-green-700 text-sm">
                              ✅ Schema created successfully with ID:{" "}
                              <strong>{lastCreatedSchemaId}</strong>
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Create Refiner */}
                      <div className="p-4 border rounded-lg">
                        <FormBuilder
                          title="Create New Refiner"
                          fields={[
                            {
                              name: "name",
                              label: "Name",
                              type: "text",
                              placeholder: "e.g., Privacy-Preserving Analytics",
                              value: refinerName,
                              onChange: setRefinerName,
                              required: true,
                            },
                            {
                              name: "dlpId",
                              label: "DLP ID",
                              type: "number",
                              placeholder: "e.g., 1",
                              value: refinerDlpId,
                              onChange: setRefinerDlpId,
                              required: true,
                            },
                            {
                              name: "schemaId",
                              label: "Schema ID",
                              type: "number",
                              placeholder: "e.g., 1",
                              value: refinerSchemaId,
                              onChange: setRefinerSchemaId,
                              required: true,
                            },
                            {
                              name: "instructionUrl",
                              label: "Instruction URL",
                              type: "url",
                              placeholder:
                                "https://example.com/instructions.md",
                              value: refinerInstructionUrl,
                              onChange: setRefinerInstructionUrl,
                              required: true,
                            },
                          ]}
                          onSubmit={handleCreateRefiner}
                          isSubmitting={isCreatingRefiner}
                          submitText="Create Refiner"
                          submitIcon={<Brain className="h-4 w-4" />}
                          status={refinerStatus}
                          statusType={
                            refinerStatus?.includes("❌") ? "error" : "success"
                          }
                        />
                        {lastCreatedRefinerId && (
                          <div className="p-3 bg-green-50 border border-green-200 rounded mt-4">
                            <p className="text-green-700 text-sm">
                              ✅ Refiner created successfully with ID:{" "}
                              <strong>{lastCreatedRefinerId}</strong>
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Update Schema ID */}
                      <div className="p-4 border rounded-lg">
                        <div className="mb-4">
                          <p className="text-sm text-muted-foreground">
                            Update the schema ID for an existing refiner (useful
                            for migrating existing refiners to new schema
                            structure).
                          </p>
                        </div>
                        <FormBuilder
                          title="Update Refiner Schema ID"
                          fields={[
                            {
                              name: "refinerId",
                              label: "Refiner ID",
                              type: "number",
                              placeholder: "e.g., 1",
                              value: updateRefinerId,
                              onChange: setUpdateRefinerId,
                              required: true,
                            },
                            {
                              name: "schemaId",
                              label: "New Schema ID",
                              type: "number",
                              placeholder: "e.g., 2",
                              value: updateSchemaId,
                              onChange: setUpdateSchemaId,
                              required: true,
                            },
                          ]}
                          onSubmit={handleUpdateSchemaId}
                          isSubmitting={isUpdatingSchema}
                          submitText="Update Schema ID"
                          submitIcon={<RotateCcw className="h-4 w-4" />}
                          status={updateSchemaStatus}
                          statusType={
                            updateSchemaStatus?.includes("❌")
                              ? "error"
                              : "success"
                          }
                        />
                      </div>

                      {/* Schemas List */}
                      <ResourceList
                        title="Schema Registry"
                        description={`Browse and manage data schemas (${schemas.length} schemas)`}
                        items={schemas}
                        isLoading={isLoadingSchemas}
                        onRefresh={loadSchemas}
                        renderItem={(schema) => (
                          <div
                            key={schema.id}
                            className="p-3 border rounded bg-muted/30"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <Chip variant="bordered">
                                    ID: {schema.id}
                                  </Chip>
                                  {schema.source === "created" && (
                                    <Chip variant="flat">Created by You</Chip>
                                  )}
                                </div>
                                <h5 className="font-medium mt-1">
                                  {schema.name}
                                </h5>
                                <p className="text-sm text-muted-foreground">
                                  Type: {schema.type}
                                </p>
                                <a
                                  href={schema.definitionUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-blue-600 hover:underline"
                                >
                                  View Definition
                                </a>
                              </div>
                            </div>
                          </div>
                        )}
                        emptyState={
                          <div className="text-center py-6 text-muted-foreground">
                            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No schemas found</p>
                          </div>
                        }
                      />

                      {/* Refiners List */}
                      <ResourceList
                        title="Refiner Registry"
                        description={`Browse and manage data refiners (${refiners.length} refiners)`}
                        items={refiners}
                        isLoading={isLoadingRefiners}
                        onRefresh={loadRefiners}
                        renderItem={(refiner) => (
                          <div
                            key={refiner.id}
                            className="p-3 border rounded bg-muted/30"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <Chip variant="bordered">
                                    ID: {refiner.id}
                                  </Chip>
                                  <Chip variant="bordered">
                                    DLP: {refiner.dlpId}
                                  </Chip>
                                  <Chip variant="bordered">
                                    Schema: {refiner.schemaId}
                                  </Chip>
                                  {refiner.source === "created" && (
                                    <Chip variant="flat">Created by You</Chip>
                                  )}
                                </div>
                                <h5 className="font-medium mt-1">
                                  {refiner.name}
                                </h5>
                                <div className="text-sm text-muted-foreground">
                                  <AddressDisplay
                                    address={refiner.owner}
                                    showCopy={false}
                                    showExternalLink={false}
                                    className="inline"
                                  />
                                </div>
                                <a
                                  href={refiner.refinementInstructionUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-blue-600 hover:underline"
                                >
                                  View Instructions
                                </a>
                              </div>
                            </div>
                          </div>
                        )}
                        emptyState={
                          <div className="text-center py-6 text-muted-foreground">
                            <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No refiners found</p>
                          </div>
                        }
                      />
                    </CardBody>
                  </Card>
                </div>

                {/* Trusted Server */}
                <Card>
                  <CardHeader className="flex-col items-start">
                    <div className="flex items-center gap-2">
                      <Brain className="h-5 w-5" />
                      Trusted Server Integration
                    </div>
                    <p className="text-small text-default-500 mt-1">
                      <em>
                        Demonstrates: `grantPermission()`, trusted server API
                        workflow
                      </em>
                      <br />
                      Advanced pattern showing server-side logic for processing
                      files with granted permissions.
                    </p>
                  </CardHeader>
                  <CardBody className="space-y-6">
                    {/* Server Decryption Demo */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4" />
                        <span className="font-medium">
                          Server Decryption Demo
                        </span>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            label="File ID"
                            value={serverFileId}
                            onChange={(e) => setServerFileId(e.target.value)}
                            placeholder="Enter file ID (e.g., 123)"
                            type="number"
                          />
                          <Input
                            label="Server Private Key"
                            value={serverPrivateKey}
                            onChange={(e) =>
                              setServerPrivateKey(e.target.value)
                            }
                            placeholder="Enter server private key (hex)"
                            type="password"
                          />
                        </div>

                        <Button
                          onPress={handleServerDecryption}
                          disabled={
                            isServerDecrypting ||
                            !serverFileId.trim() ||
                            !serverPrivateKey.trim()
                          }
                          className="w-full"
                        >
                          {isServerDecrypting ? (
                            <Spinner size="sm" className="mr-2" />
                          ) : (
                            <Lock className="h-4 w-4 mr-2" />
                          )}
                          Decrypt File with Server Key
                        </Button>

                        {serverDecryptError && (
                          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                            <p className="text-destructive text-sm">
                              {serverDecryptError}
                            </p>
                          </div>
                        )}

                        {serverDecryptedData && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">
                                Decrypted File Content:
                              </h4>
                              <Button
                                size="sm"
                                variant="bordered"
                                onPress={() =>
                                  copyToClipboard(
                                    serverDecryptedData,
                                    "Decrypted content",
                                  )
                                }
                              >
                                <Copy className="mr-2 h-3 w-3" />
                                Copy
                              </Button>
                            </div>
                            <div className="bg-muted p-4 rounded-lg border">
                              <pre className="text-sm whitespace-pre-wrap overflow-auto max-h-48">
                                {serverDecryptedData}
                              </pre>
                            </div>
                            <div className="p-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg">
                              <p className="text-green-600 text-sm">
                                ✅ Successfully decrypted file using server's
                                private key!
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <Divider />

                    {/* Trusted Server API Integration */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4" />
                        <span className="font-medium">
                          Trusted Server API Integration
                        </span>
                      </div>

                      <div>
                        <Input
                          label="Permission ID"
                          value={personalPermissionId}
                          onChange={(e) =>
                            setPersonalPermissionId(e.target.value)
                          }
                          placeholder="Enter permission ID (e.g., 123)"
                          type="number"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onPress={handlePersonalServerCall}
                          disabled={
                            isPersonalLoading || !personalPermissionId.trim()
                          }
                        >
                          {isPersonalLoading ? (
                            <Spinner size="sm" className="mr-2" />
                          ) : (
                            <Brain className="h-4 w-4 mr-2" />
                          )}
                          Submit Request
                        </Button>
                        {Boolean(
                          personalResult &&
                            (personalResult as { urls?: { get?: string } })
                              ?.urls?.get,
                        ) && (
                          <Button
                            onPress={handlePollStatus}
                            disabled={isPolling}
                            variant="bordered"
                          >
                            {isPolling ? (
                              <Spinner size="sm" className="mr-2" />
                            ) : (
                              <RotateCcw className="h-4 w-4 mr-2" />
                            )}
                            Check Status
                          </Button>
                        )}
                      </div>
                    </div>

                    {personalError && (
                      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <p className="text-destructive text-sm">
                          {personalError}
                        </p>
                      </div>
                    )}

                    {Boolean(personalResult) && (
                      <div className="space-y-4">
                        <h4 className="font-medium">Computation Result:</h4>
                        <div className="bg-muted p-4 rounded-lg border">
                          <pre className="text-sm whitespace-pre-wrap overflow-auto">
                            {JSON.stringify(personalResult, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* How it works explanation */}
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Brain className="h-4 w-4 text-blue-600 mt-0.5" />
                        <div className="text-sm text-blue-800 dark:text-blue-200">
                          <p className="font-medium mb-1">
                            Server Permission Workflow:
                          </p>
                          <ul className="text-xs space-y-1 text-blue-700 dark:text-blue-300">
                            <li>
                              • Files are encrypted with user's wallet signature
                              key
                            </li>
                            <li>
                              • User's encryption key is encrypted with server's
                              real public key
                            </li>
                            <li>
                              • Server uses its private key to decrypt the
                              user's encryption key
                            </li>
                            <li>
                              • Server then uses user's key to decrypt the file
                              data
                            </li>
                            <li>
                              • Personal server APIs work with decrypted data
                              for computation
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                {/* Encryption Testing */}
                <Card>
                  <CardHeader className="flex-col items-start">
                    <div className="flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Canonical Encryption Testing
                    </div>
                    <p className="text-small text-default-500 mt-1">
                      <em>
                        Demonstrates: `generateEncryptionKey()`,
                        `encryptUserData()`, `decryptUserData()`
                      </em>
                      <br />
                      Test the core, low-level encryption methods interactively
                      - the "hello world" of data handling.
                    </p>
                  </CardHeader>
                  <CardBody className="space-y-6">
                    {/* Step 1: Configure Encryption Seed */}
                    <div className="space-y-3">
                      <Input
                        label="Step 1: Encryption Seed (overrideable)"
                        startContent={<Key className="h-4 w-4" />}
                        value={encryptionSeed}
                        onChange={(e) => setEncryptionSeed(e.target.value)}
                        placeholder="Enter encryption seed message"
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Default: &quot;{DEFAULT_ENCRYPTION_SEED}&quot;
                      </p>
                    </div>

                    <Divider />

                    {/* Step 2: Generate Encryption Key */}
                    <div className="space-y-3">
                      <span className="flex items-center gap-2">
                        <Key className="h-4 w-4" />
                        Step 2: Generate Encryption Key
                      </span>
                      <Button
                        onPress={handleGenerateKey}
                        disabled={isEncrypting || !encryptionSeed}
                        className="w-full"
                      >
                        {isEncrypting ? (
                          <Spinner size="sm" className="mr-2" />
                        ) : (
                          <Key className="mr-2 h-4 w-4" />
                        )}
                        Generate Key via Wallet Signature
                      </Button>
                      {generatedKey && (
                        <div className="p-3 bg-muted rounded-md">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-muted-foreground">
                              Generated Encryption Key:
                            </p>
                            <Button
                              size="sm"
                              variant="bordered"
                              onPress={() =>
                                copyToClipboard(generatedKey, "Encryption key")
                              }
                            >
                              <Copy className="mr-2 h-3 w-3" />
                              Copy
                            </Button>
                          </div>
                          <div className="max-h-20 overflow-y-auto">
                            <p className="font-mono text-xs break-all">
                              {generatedKey}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <Divider />

                    {/* Step 3: Data Input (Text or File) */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Step 3: Choose Data Input Mode
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={
                              inputMode === "text" ? "solid" : "bordered"
                            }
                            size="sm"
                            onPress={() => setInputMode("text")}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            Text
                          </Button>
                          <Button
                            variant={
                              inputMode === "file" ? "solid" : "bordered"
                            }
                            size="sm"
                            onPress={() => setInputMode("file")}
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            File
                          </Button>
                        </div>
                      </div>

                      {inputMode === "text" && (
                        <div className="space-y-3">
                          <label htmlFor="test-data">
                            Enter text data to encrypt:
                          </label>
                          <Textarea
                            id="test-data"
                            value={testData}
                            onChange={(e) => setTestData(e.target.value)}
                            placeholder="Enter data to encrypt (JSON, text, etc.)"
                            className="font-mono"
                            minRows={4}
                          />
                        </div>
                      )}

                      {inputMode === "file" && (
                        <FileUpload
                          id="file-upload"
                          label="Upload a file to encrypt:"
                          file={uploadedFile}
                          onFileChange={(file) => {
                            setUploadedFile(file);
                            setEncryptionStatus("");
                          }}
                          placeholder="Click to upload file"
                        />
                      )}
                    </div>

                    <Divider />

                    {/* Step 4: Encrypt/Decrypt Actions */}
                    <div className="space-y-3">
                      <span className="flex items-center gap-2">
                        <Lock className="h-4 w-4" />
                        Step 4: Encryption Operations
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Button
                          onPress={handleEncryptData}
                          disabled={isEncrypting || !generatedKey || !testData}
                          variant="solid"
                        >
                          {isEncrypting ? (
                            <Spinner size="sm" className="mr-2" />
                          ) : (
                            <Lock className="mr-2 h-4 w-4" />
                          )}
                          Encrypt Data
                        </Button>
                        <Button
                          onPress={handleDecryptData}
                          disabled={isEncrypting || !encryptedData}
                          variant="bordered"
                        >
                          {isEncrypting ? (
                            <Spinner size="sm" className="mr-2" />
                          ) : (
                            <Shield className="mr-2 h-4 w-4" />
                          )}
                          Decrypt Data
                        </Button>
                        <Button
                          onPress={handleResetEncryption}
                          disabled={isEncrypting}
                          color="danger"
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Reset All
                        </Button>
                      </div>
                    </div>

                    {/* Results */}
                    {encryptionStatus && (
                      <StatusDisplay
                        status={encryptionStatus}
                        className="mt-2"
                      />
                    )}

                    {encryptedData && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span>Encrypted Data (Blob):</span>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="bordered"
                              onPress={() =>
                                setShowEncryptedContent(!showEncryptedContent)
                              }
                            >
                              {showEncryptedContent ? (
                                <EyeOff className="mr-2 h-4 w-4" />
                              ) : (
                                <Eye className="mr-2 h-4 w-4" />
                              )}
                              {showEncryptedContent ? "Hide" : "Show"} Content
                            </Button>
                            <Button
                              size="sm"
                              variant="bordered"
                              onPress={handleDownloadEncrypted}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </Button>
                          </div>
                        </div>

                        <div className="p-3 bg-muted rounded-md">
                          <div className="flex justify-between items-center mb-2">
                            <p className="text-xs text-muted-foreground">
                              Size: {encryptedData.size} bytes | Type:{" "}
                              {encryptedData.type}
                            </p>
                            <Chip variant="flat">OpenPGP Encrypted</Chip>
                          </div>

                          {showEncryptedContent && (
                            <div className="mt-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs">Hex Content:</span>
                                <Button
                                  size="sm"
                                  variant="bordered"
                                  onPress={() =>
                                    copyToClipboard(
                                      encryptedPreview,
                                      "Encrypted hex",
                                    )
                                  }
                                  disabled={!encryptedPreview}
                                >
                                  <Copy className="mr-2 h-3 w-3" />
                                  Copy
                                </Button>
                              </div>
                              <div className="mt-1 p-2 bg-background rounded border font-mono text-xs break-all max-h-40 overflow-y-auto">
                                {encryptedPreview || "Loading..."}
                              </div>
                            </div>
                          )}

                          <p className="text-xs mt-2">
                            ✅ Data successfully encrypted using OpenPGP with
                            signature-based key
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Upload to Blockchain */}
                    {encryptedData && (
                      <div className="space-y-4">
                        {/* Storage Configuration Display */}
                        <div className="space-y-3">
                          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">
                                Storage Provider:
                              </span>
                              <span className="text-sm text-muted-foreground">
                                From SDK Configuration
                              </span>
                            </div>

                            {sdkConfig.defaultStorageProvider ===
                              "app-ipfs" && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">
                                    📦 App-managed IPFS
                                  </span>
                                  <Chip
                                    size="sm"
                                    variant="flat"
                                    color="success"
                                  >
                                    Active
                                  </Chip>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Files will be stored using the app's Pinata
                                  account
                                </p>
                              </div>
                            )}

                            {sdkConfig.defaultStorageProvider ===
                              "user-ipfs" && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">
                                    👤 User-managed Pinata
                                  </span>
                                  <Chip
                                    size="sm"
                                    variant="flat"
                                    color="success"
                                  >
                                    Active
                                  </Chip>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Files will be stored using your Pinata account
                                </p>
                              </div>
                            )}

                            {sdkConfig.defaultStorageProvider ===
                              "google-drive" && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">
                                    🗂️ Google Drive
                                  </span>
                                  <Chip
                                    size="sm"
                                    variant="flat"
                                    color="warning"
                                  >
                                    Coming Soon
                                  </Chip>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Google Drive integration is not yet
                                  implemented
                                </p>
                              </div>
                            )}

                            {/* IPFS Mode Override (only for IPFS providers) */}
                            {(sdkConfig.defaultStorageProvider === "app-ipfs" ||
                              sdkConfig.defaultStorageProvider ===
                                "user-ipfs") && (
                              <div className="mt-3 pt-3 border-t border-muted">
                                <span className="text-sm font-medium">
                                  IPFS Mode Override:
                                </span>
                                <div className="flex gap-2 mt-2">
                                  <Button
                                    size="sm"
                                    variant={
                                      ipfsMode === "app-managed"
                                        ? "solid"
                                        : "bordered"
                                    }
                                    onPress={() => setIpfsMode("app-managed")}
                                    disabled={isUploadingToChain}
                                  >
                                    📦 App-managed
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={
                                      ipfsMode === "user-managed"
                                        ? "solid"
                                        : "bordered"
                                    }
                                    onPress={() => setIpfsMode("user-managed")}
                                    disabled={isUploadingToChain}
                                  >
                                    👤 My IPFS
                                  </Button>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                  Override the default for this upload only
                                </p>

                                {ipfsMode === "user-managed" &&
                                  !sdkConfig.pinataJwt && (
                                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                                      <p className="text-xs text-amber-600 dark:text-amber-400">
                                        ⚠️ Configure Pinata JWT in SDK
                                        Configuration to use your IPFS account
                                      </p>
                                    </div>
                                  )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Schema Selection */}
                        <div className="space-y-2">
                          <label htmlFor="upload-schema">
                            Schema (Optional):
                          </label>
                          <Select
                            id="upload-schema"
                            aria-label="Schema selection for data upload"
                            selectedKeys={
                              selectedUploadSchemaId
                                ? [selectedUploadSchemaId]
                                : []
                            }
                            onSelectionChange={(keys) => {
                              const selectedKey = Array.from(keys)[0];
                              setSelectedUploadSchemaId(
                                selectedKey ? selectedKey.toString() : "",
                              );
                            }}
                            placeholder="No schema (unstructured data)"
                            isDisabled={isUploadingToChain || isLoadingSchemas}
                          >
                            {schemas.map((schema) => (
                              <SelectItem key={schema.id.toString()}>
                                {schema.name} (ID: {schema.id})
                              </SelectItem>
                            ))}
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Select a schema to associate your encrypted data
                            with a specific data structure. This helps refiners
                            process your data according to the schema
                            definition.
                          </p>
                        </div>

                        <div className="flex items-center justify-between">
                          <span>Upload to Vana Blockchain:</span>
                          <Button
                            onPress={handleUploadToBlockchain}
                            disabled={isUploadingToChain}
                            variant="solid"
                          >
                            {isUploadingToChain ? (
                              <Spinner size="sm" className="mr-2" />
                            ) : (
                              <Database className="mr-2 h-4 w-4" />
                            )}
                            {isUploadingToChain
                              ? "Uploading..."
                              : "Upload to Blockchain"}
                          </Button>
                        </div>

                        <div className="p-3 bg-primary/10 rounded-md">
                          <p className="text-sm text-muted-foreground mb-2">
                            This will upload your encrypted file using the
                            selected storage provider and register it on the
                            Vana DataRegistry. The Storage API provides a
                            unified interface for different storage backends.
                            Once uploaded, it will appear in your &quot;Data
                            Files&quot; list above and you can decrypt it to
                            test the complete workflow.
                          </p>

                          {uploadToChainStatus && (
                            <StatusDisplay
                              status={uploadToChainStatus}
                              className="mt-3"
                            />
                          )}

                          {newFileId && (
                            <div className="mt-3 p-2 bg-green-50/50 rounded border">
                              <p className="text-sm font-medium text-green-700">
                                🎉 Success! Your file is now on the blockchain
                                with ID: <strong>{newFileId}</strong>
                              </p>
                              <p className="text-xs text-green-600 mt-1">
                                Check your &quot;Data Files&quot; section above
                                to see the new file and try decrypting it!
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {decryptedData && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span>Decrypted Data (Verification):</span>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="bordered"
                              onPress={() =>
                                copyToClipboard(decryptedData, "Decrypted data")
                              }
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy
                            </Button>
                            <Button
                              size="sm"
                              variant="bordered"
                              onPress={handleDownloadDecrypted}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </Button>
                          </div>
                        </div>

                        <div className="p-3 bg-muted rounded-md">
                          <div className="max-h-40 overflow-y-auto">
                            <pre className="font-mono text-xs whitespace-pre-wrap break-all">
                              {decryptedData}
                            </pre>
                          </div>
                        </div>

                        <p className="text-sm text-green-600 mt-2">
                          ✅ Round-trip encryption/decryption successful!
                          {inputMode === "text" && (
                            <span>
                              Data matches:{" "}
                              {decryptedData === testData ? "YES" : "NO"}
                            </span>
                          )}
                          {inputMode === "file" && (
                            <span>
                              File decrypted successfully. Download to verify
                              contents.
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </CardBody>
                </Card>

                {/* Trusted Server File Upload */}
                <Card>
                  <CardHeader className="flex-col items-start">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Upload File to Trusted Server
                    </div>
                    <p className="text-small text-default-500 mt-1">
                      <em>
                        Demonstrates: `uploadFileWithPermissions()`,
                        `getTrustedServerPublicKey()`
                      </em>
                      <br />
                      Complete workflow for securely sharing a file with a
                      designated server using dual encryption.
                    </p>
                  </CardHeader>
                  <CardBody className="space-y-6">
                    {/* Server Selection */}
                    <div className="space-y-2">
                      <label htmlFor="server-select">
                        Select Trusted Server:
                      </label>
                      <Select
                        id="server-select"
                        aria-label="Select trusted server for file upload"
                        selectedKeys={
                          selectedServerForUpload
                            ? [selectedServerForUpload]
                            : []
                        }
                        onSelectionChange={(keys) => {
                          const selectedKey = Array.from(keys)[0];
                          setSelectedServerForUpload(
                            selectedKey ? selectedKey.toString() : "",
                          );
                        }}
                        placeholder={
                          trustedServers.length === 0
                            ? "No trusted servers"
                            : "Select a server..."
                        }
                        isDisabled={
                          isUploadingToServer || trustedServers.length === 0
                        }
                      >
                        {trustedServers.map((serverId) => (
                          <SelectItem key={serverId}>{serverId}</SelectItem>
                        ))}
                      </Select>
                      {trustedServers.length === 0 && (
                        <p className="text-xs text-orange-600">
                          ⚠️ No trusted servers found. Please trust a server
                          first in the section above.
                        </p>
                      )}
                    </div>

                    {/* Data Input Mode Selection */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Choose Data Input Mode
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={
                              serverInputMode === "text" ? "solid" : "bordered"
                            }
                            size="sm"
                            onPress={() => setServerInputMode("text")}
                            disabled={isUploadingToServer}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            Text
                          </Button>
                          <Button
                            variant={
                              serverInputMode === "file" ? "solid" : "bordered"
                            }
                            size="sm"
                            onPress={() => setServerInputMode("file")}
                            disabled={isUploadingToServer}
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            File
                          </Button>
                        </div>
                      </div>

                      {serverInputMode === "text" && (
                        <div className="space-y-3">
                          <label htmlFor="server-text-data">
                            Enter text data to upload:
                          </label>
                          <Textarea
                            id="server-text-data"
                            value={serverTextData}
                            onValueChange={setServerTextData}
                            placeholder="Enter your data here..."
                            minRows={4}
                            disabled={isUploadingToServer}
                          />
                        </div>
                      )}

                      {serverInputMode === "file" && (
                        <FileUpload
                          id="server-file-upload"
                          label="Select File to Upload:"
                          file={serverFileToUpload}
                          onFileChange={(file) => {
                            setServerFileToUpload(file);
                            setServerUploadStatus("");
                            setServerUploadResult(null);
                          }}
                          disabled={isUploadingToServer}
                          placeholder="Click to select file"
                        />
                      )}
                    </div>

                    {/* Upload Button */}
                    <Button
                      onPress={handleUploadToTrustedServer}
                      disabled={
                        isUploadingToServer ||
                        !selectedServerForUpload ||
                        (serverInputMode === "file" && !serverFileToUpload) ||
                        (serverInputMode === "text" && !serverTextData.trim())
                      }
                      variant="solid"
                      className="w-full"
                    >
                      {isUploadingToServer ? (
                        <Spinner size="sm" className="mr-2" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      {isUploadingToServer
                        ? "Uploading..."
                        : "Upload to Trusted Server"}
                    </Button>

                    {/* Status Messages */}
                    {serverUploadStatus && (
                      <div
                        className={`p-4 rounded-lg ${
                          serverUploadStatus.includes("❌")
                            ? "bg-destructive/10 border border-destructive/20"
                            : "bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800"
                        }`}
                      >
                        <p
                          className={`text-sm ${
                            serverUploadStatus.includes("❌")
                              ? "text-destructive"
                              : "text-green-600"
                          }`}
                        >
                          {serverUploadStatus}
                        </p>
                      </div>
                    )}

                    {/* Success Result */}
                    {serverUploadResult && (
                      <div className="p-4 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-sm font-medium text-green-800 dark:text-green-200">
                              File uploaded successfully!
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                              <AddressDisplay
                                address={serverUploadResult.fileId.toString()}
                                showCopy={true}
                                showExternalLink={false}
                                label="File ID"
                              />
                            </div>
                            <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                              <IpfsAddressDisplay
                                ipfsUrl={serverUploadResult.url}
                                showCopy={true}
                                showExternalLink={true}
                                label="IPFS URL"
                              />
                            </div>
                            <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                              <AddressDisplay
                                address={serverUploadResult.transactionHash}
                                showCopy={true}
                                showExternalLink={true}
                                explorerUrl={getTxUrl(
                                  chainId,
                                  serverUploadResult.transactionHash,
                                )}
                                label="Transaction Hash"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-green-600">
                            ✅ The file has been encrypted with your wallet
                            signature and permissions granted to the trusted
                            server via encrypted key sharing.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Information */}
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Brain className="h-4 w-4 text-blue-600 mt-0.5" />
                        <div className="text-sm text-blue-800 dark:text-blue-200">
                          <p className="font-medium mb-1">How it works:</p>
                          <ul className="text-xs space-y-1 text-blue-700 dark:text-blue-300">
                            <li>
                              • Your file is encrypted with your wallet
                              signature key
                            </li>
                            <li>
                              • Your encryption key is encrypted with the
                              server's real public key
                            </li>
                            <li>
                              • Only the selected trusted server can decrypt
                              your encryption key
                            </li>
                            <li>
                              • The file is stored on IPFS and registered on the
                              Vana blockchain with permissions
                            </li>
                            <li>
                              • You maintain full control over which servers can
                              access your data
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                {/* Canonical Contracts */}
                <Card>
                  <CardHeader className="flex-col items-start">
                    <div>Canonical Contracts</div>
                    <p className="text-small text-default-500 mt-1">
                      <em>
                        Reference: `protocol.getAvailableContracts()`,
                        blockchain explorer links
                      </em>
                      <br />
                      All {vana.protocol.getAvailableContracts().length} Vana
                      protocol contracts deployed on{" "}
                      {vana?.protocol?.getChainName?.() || "this network"}.
                      Click to view on block explorer.
                    </p>
                  </CardHeader>
                  <CardBody>
                    <ResourceList
                      title=""
                      description=""
                      items={vana.protocol.getAvailableContracts()}
                      isLoading={false}
                      onRefresh={() => {}}
                      itemsPerPage={8}
                      renderItem={(contractName) => {
                        try {
                          const contract =
                            vana.protocol.getContract(contractName);
                          const explorerUrl = getAddressUrl(
                            chainId,
                            contract.address,
                          );

                          return (
                            <div
                              key={contractName}
                              className="flex items-center justify-between p-3 bg-muted rounded-md"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-sm">
                                  {contractName}
                                </p>
                                <AddressDisplay
                                  address={contract.address}
                                  explorerUrl={explorerUrl}
                                  showExternalLink={false}
                                  className="text-xs"
                                />
                              </div>
                              <Button
                                size="sm"
                                variant="bordered"
                                as="a"
                                href={explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View
                              </Button>
                            </div>
                          );
                        } catch {
                          return (
                            <div
                              key={contractName}
                              className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-sm text-muted-foreground">
                                  {contractName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Not deployed on this network
                                </p>
                              </div>
                              <Button size="sm" variant="bordered" disabled>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                N/A
                              </Button>
                            </div>
                          );
                        }
                      }}
                      emptyState={
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">
                            No contracts found
                          </p>
                        </div>
                      }
                    />
                  </CardBody>
                </Card>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - SDK Configuration */}
        {vana && (
          <div className="w-80 border-l border-divider bg-content1 sticky top-0 self-start max-h-screen overflow-y-auto">
            <div className="p-4">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">SDK Configuration</h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-6">
                  {/* Network Configuration */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">
                      Network Configuration
                    </h4>

                    <Input
                      label="Relayer URL"
                      placeholder="https://relayer.example.com"
                      value={sdkConfig.relayerUrl}
                      onValueChange={(value) =>
                        setSdkConfig((prev) => ({ ...prev, relayerUrl: value }))
                      }
                      description="URL for gasless transaction relayer"
                      size="sm"
                    />

                    <Input
                      label="Subgraph URL"
                      placeholder="https://api.goldsky.com/..."
                      value={sdkConfig.subgraphUrl}
                      onValueChange={(value) =>
                        setSdkConfig((prev) => ({
                          ...prev,
                          subgraphUrl: value,
                        }))
                      }
                      description="Custom subgraph endpoint (optional)"
                      size="sm"
                    />

                    <Input
                      label="RPC URL"
                      placeholder="https://rpc.example.com"
                      value={sdkConfig.rpcUrl}
                      onValueChange={(value) =>
                        setSdkConfig((prev) => ({ ...prev, rpcUrl: value }))
                      }
                      description="Custom RPC endpoint (optional)"
                      size="sm"
                    />
                  </div>

                  {/* Storage Configuration */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">
                      Storage Configuration
                    </h4>

                    <Input
                      label="Pinata JWT"
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      value={sdkConfig.pinataJwt}
                      onValueChange={(value) =>
                        setSdkConfig((prev) => ({ ...prev, pinataJwt: value }))
                      }
                      description="JWT for user-managed Pinata IPFS"
                      size="sm"
                      type="password"
                    />

                    <Input
                      label="Pinata Gateway"
                      placeholder="https://gateway.pinata.cloud"
                      value={sdkConfig.pinataGateway}
                      onValueChange={(value) =>
                        setSdkConfig((prev) => ({
                          ...prev,
                          pinataGateway: value,
                        }))
                      }
                      description="Gateway URL for Pinata IPFS"
                      size="sm"
                    />

                    <Select
                      label="Default Storage Provider"
                      selectedKeys={[sdkConfig.defaultStorageProvider]}
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as string;
                        setSdkConfig((prev) => ({
                          ...prev,
                          defaultStorageProvider: selected,
                        }));
                      }}
                      size="sm"
                    >
                      <SelectItem key="app-ipfs">App-managed IPFS</SelectItem>
                      <SelectItem
                        key="user-ipfs"
                        isDisabled={!sdkConfig.pinataJwt}
                        description={
                          !sdkConfig.pinataJwt
                            ? "Requires Pinata JWT configuration"
                            : undefined
                        }
                      >
                        User-managed Pinata
                      </SelectItem>
                      <SelectItem
                        key="google-drive"
                        isDisabled={true}
                        description="Coming soon - Google Drive integration"
                      >
                        Google Drive (Soon)
                      </SelectItem>
                    </Select>
                  </div>

                  {/* Configuration Status */}
                  {configStatus && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        {configStatus}
                      </p>
                    </div>
                  )}

                  {/* Apply Button */}
                  <div className="space-y-2">
                    <Button
                      color="primary"
                      size="sm"
                      className="w-full"
                      onPress={() => {
                        setConfigStatus(
                          "✅ Configuration will be applied on next SDK initialization",
                        );
                        setTimeout(() => setConfigStatus(""), 3000);
                      }}
                    >
                      Apply Configuration
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      💡 These settings affect file uploads, storage selection,
                      and API endpoints throughout the interface
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
