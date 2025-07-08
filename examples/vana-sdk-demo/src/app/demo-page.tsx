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
import { Button } from "@/components/ui/button";

// Types for demo app state
interface RelayerHealth {
  status: string;
  relayer: string;
  chain: number;
  chainRpcUrl: string;
  timestamp: string;
  service: string;
  storage: {
    ipfs: {
      enabled: boolean;
      error: string | null;
    };
    memory: {
      enabled: boolean;
      fallback: boolean;
    };
  };
  features: {
    signatureVerification: boolean;
    blockchainSubmission: boolean;
    ipfsStorage: boolean;
    gaslessTransactions: boolean;
  };
}

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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AddressDisplay } from "@/components/AddressDisplay";
import { PermissionDisplay } from "@/components/PermissionDisplay";
import { FileCard } from "@/components/FileCard";
import { getTxUrl, getAddressUrl } from "@/lib/explorer";
import {
  ExternalLink,
  Loader2,
  Wallet,
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
  const [showGrantPreview, setShowGrantPreview] = useState<boolean>(false);
  const [relayerHealth, setRelayerHealth] = useState<RelayerHealth | null>(
    null,
  );
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
  const [selectedStorageProvider, setSelectedStorageProvider] = useState<
    "ipfs" | "google-drive"
  >("ipfs");
  const [ipfsMode, setIpfsMode] = useState<"app-managed" | "user-managed">(
    "app-managed",
  );

  // User IPFS configuration state
  const [userIpfsJwt, setUserIpfsJwt] = useState<string>("");
  const [userIpfsGateway, setUserIpfsGateway] = useState<string>(
    "https://gateway.pinata.cloud",
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

  // Personal server setup state
  const [isSettingUpPersonalServer, setIsSettingUpPersonalServer] =
    useState(false);
  const [personalServerError, setPersonalServerError] = useState<string>("");
  const [personalServerResult, setPersonalServerResult] = useState<string>("");

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
        if (userIpfsJwt) {
          console.info("👤 Adding user-managed Pinata IPFS storage");
          const pinataStorage = new PinataStorage({
            jwt: userIpfsJwt,
            gatewayUrl: userIpfsGateway,
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

        // Initialize Vana SDK with storage configuration
        const vanaInstance = new Vana({
          walletClient: walletClient as WalletClient & { chain: VanaChain }, // Type compatibility with Vana SDK
          relayerUrl: `${window.location.origin}`,
          storage: {
            providers: storageProviders,
            defaultProvider: "app-ipfs",
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
  }, [isConnected, walletClient, userIpfsJwt, userIpfsGateway]);

  // Check relayer health
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        setRelayerHealth(data);
        console.info("✅ Relayer health check:", data);
      })
      .catch((err) => console.warn("⚠️ Relayer health check failed:", err));
  }, []);

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
      setShowGrantPreview(true);
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
      setShowGrantPreview(false);

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
    setShowGrantPreview(false);
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setEncryptionStatus("");
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
    if (selectedStorageProvider === "google-drive") {
      setUploadToChainStatus(
        "❌ Google Drive storage is not yet configured. Please use IPFS for now.",
      );
      return;
    }

    // Determine which IPFS provider to use
    const providerName =
      selectedStorageProvider === "ipfs"
        ? ipfsMode === "app-managed"
          ? "app-ipfs"
          : "user-ipfs"
        : selectedStorageProvider;

    // Check if user-managed IPFS is selected but not configured
    if (providerName === "user-ipfs" && !userIpfsJwt) {
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
      const response = await fetch("/api/personal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          permissionId,
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

  const handleSetupPersonalServer = async () => {
    if (!address) return;

    setIsSettingUpPersonalServer(true);
    setPersonalServerError("");
    setPersonalServerResult("");

    try {
      // Call our API route instead of using the SDK directly
      const response = await fetch("/api/personal/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userAddress: address,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      const personalServerData = result.data;

      // Check if derived address is present
      const derivedAddress =
        personalServerData.identity.metadata?.derivedAddress;

      if (derivedAddress) {
        // Auto-populate the server ID field for easy trusting
        setServerId(derivedAddress);
      }

      setPersonalServerResult("success");

      // Refresh trusted servers list to show the new personal server
      await loadTrustedServers();
    } catch (error) {
      setPersonalServerError(
        error instanceof Error
          ? error.message
          : "Failed to setup personal server",
      );
    } finally {
      setIsSettingUpPersonalServer(false);
    }
  };

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
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 text-foreground">
            Vana SDK Demo
          </h1>
          <p className="text-muted-foreground text-lg">
            Build with privacy-preserving data infrastructure
          </p>
        </div>

        {/* Wallet Connection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Wallet Connection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center mb-4">
              <ConnectButton />
            </div>
            {relayerHealth && (
              <p className="text-sm text-green-600 mt-2">
                ✅ <strong>Relayer:</strong> {relayerHealth.status} •{" "}
                <strong>Service:</strong> {relayerHealth.service} •{" "}
                <strong>Chain:</strong> {relayerHealth.chain}
              </p>
            )}
          </CardContent>
        </Card>

        {!isConnected && (
          <Card>
            <CardHeader>
              <CardTitle>Get Started</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Connect your wallet above to begin exploring the Vana SDK
                capabilities.
              </p>
            </CardContent>
          </Card>
        )}

        {isConnected && !vana && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Initializing...
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Setting up the Vana SDK with your wallet...
              </p>
            </CardContent>
          </Card>
        )}

        {vana && (
          <div className="space-y-6">
            {/* SDK Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  SDK Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="mb-2">
                      <strong>Status:</strong>{" "}
                      <Badge variant="secondary">✅ Initialized</Badge>
                    </div>
                    <p className="mb-2">
                      <strong>Chain:</strong> {vana.chainName} (ID:{" "}
                      {vana.chainId})
                    </p>
                    <div>
                      <span className="font-medium">User Address:</span>{" "}
                      {address && (
                        <AddressDisplay
                          address={address}
                          showCopy={true}
                          showExternalLink={true}
                          explorerUrl={getAddressUrl(chainId, address)}
                          className="inline-block"
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2">
                      <strong>Relayer:</strong> Integrated Next.js API
                    </p>
                    <p className="mb-2">
                      <strong>Endpoint:</strong>{" "}
                      <span className="text-sm font-mono">
                        {vana.getConfig().relayerUrl}
                      </span>
                    </p>
                    {relayerHealth?.relayer && (
                      <div className="mb-2">
                        <span className="font-medium">Relayer Address:</span>{" "}
                        <AddressDisplay
                          address={relayerHealth.relayer}
                          showCopy={true}
                          showExternalLink={true}
                          explorerUrl={getAddressUrl(
                            chainId,
                            relayerHealth.relayer,
                          )}
                          className="inline-block"
                        />
                      </div>
                    )}
                    <p>
                      <strong>Type:</strong> Gasless Demo Service
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Your Data */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Your Data
                </CardTitle>
                <CardDescription>
                  Manage your registered data files and grant permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4">
                  <Button onClick={loadUserFiles} variant="outline">
                    Refresh Files
                  </Button>
                  <div className="flex items-center gap-2 ml-auto">
                    <Label htmlFor="file-lookup">Lookup by ID:</Label>
                    <input
                      id="file-lookup"
                      type="text"
                      value={fileLookupId}
                      onChange={(e) => setFileLookupId(e.target.value)}
                      placeholder="Enter file ID"
                      className="w-32 p-2 border rounded text-sm bg-background text-foreground border-input"
                    />
                    <Button
                      onClick={handleLookupFile}
                      disabled={isLookingUpFile || !fileLookupId.trim()}
                      size="sm"
                    >
                      {isLookingUpFile ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {userFiles.length > 0 ? (
                  <div className="space-y-3">
                    {userFiles.map((file) => {
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
                    })}
                    <div className="mt-4 p-3 bg-primary/10 rounded">
                      <p className="text-sm text-primary">
                        <strong>Selected files:</strong> {selectedFiles.length}{" "}
                        • Use &quot;Decrypt&quot; to view encrypted file
                        contents using your wallet signature.
                      </p>
                    </div>
                  </div>
                ) : isLoadingFiles ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Loading your data files...
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium mb-2">No data files found</p>
                    <p className="text-sm">
                      Upload and encrypt files to get started
                    </p>
                  </div>
                )}

                {fileLookupStatus && (
                  <p
                    className={`text-sm mt-4 ${fileLookupStatus.includes("❌") ? "text-destructive" : "text-green-600"}`}
                  >
                    {fileLookupStatus}
                  </p>
                )}

                {/* Grant Permission Section */}
                {selectedFiles.length > 0 && (
                  <div className="mt-6 p-4 bg-green-50/50 rounded">
                    <h3 className="font-medium mb-3 text-green-700">
                      Grant Permission ({selectedFiles.length} file
                      {selectedFiles.length !== 1 ? "s" : ""} selected)
                    </h3>
                    <Button
                      onClick={handleGrantPermission}
                      disabled={selectedFiles.length === 0 || isGranting}
                      className="mb-4"
                    >
                      {isGranting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                        <p className="font-medium mb-2">Transaction Hash:</p>
                        <AddressDisplay
                          address={grantTxHash}
                          explorerUrl={getExplorerUrl(grantTxHash)}
                          truncate={true}
                        />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Permissions Management */}

            {/* Grant Preview Modal */}
            {showGrantPreview && grantPreview && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <Card className="w-full max-w-2xl max-h-[70vh] overflow-y-auto">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Review Grant
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <Label className="font-medium">Operation:</Label>
                        <p className="text-muted-foreground">
                          {grantPreview.grantFile.operation}
                        </p>
                      </div>
                      <div>
                        <Label className="font-medium">Files:</Label>
                        <p className="text-muted-foreground">
                          [{grantPreview.grantFile.files.join(", ")}]
                        </p>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium">IPFS URL:</Label>
                      <a
                        href={`https://ipfs.io/ipfs/${grantPreview.grantUrl.replace("ipfs://", "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 underline font-mono break-all block mt-1"
                      >
                        {grantPreview.grantUrl}
                      </a>
                    </div>

                    <div>
                      <Label className="text-sm font-medium">Parameters:</Label>
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
                      <Button variant="outline" onClick={handleCancelGrant}>
                        Cancel
                      </Button>
                      <Button onClick={handleConfirmGrant}>
                        Sign Transaction
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Permissions Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Permissions Management
                </CardTitle>
                <CardDescription>
                  View and manage data access permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-4">
                  <Button
                    onClick={loadUserPermissions}
                    disabled={isLoadingPermissions}
                    variant="outline"
                  >
                    {isLoadingPermissions && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Refresh Permissions
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    {userPermissions.length} permission
                    {userPermissions.length !== 1 ? "s" : ""} found
                  </div>
                </div>

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

                {userPermissions.length > 0 ? (
                  <div className="space-y-3">
                    {userPermissions.map((permission) => (
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
                                      {typeof permission.parameters === "string"
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
                            variant="destructive"
                            onClick={() =>
                              handleRevokePermissionById(
                                permission.id.toString(),
                              )
                            }
                            disabled={isRevoking}
                            className="ml-4"
                          >
                            {isRevoking ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Revoke"
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !isLoadingPermissions ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No permissions granted yet</p>
                    <p className="text-sm">
                      Grant your first permission above to see it here
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      Loading permissions...
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Trust Server */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Trusted Server Management
                </CardTitle>
                <CardDescription>
                  Manage trusted servers for data processing. Trust a server to
                  automatically register it and add it to your trust list, or
                  remove servers you no longer trust.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Trust Server Form */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="server-id" className="text-sm font-medium">
                      Server ID (Ethereum Address)
                    </Label>
                    <Input
                      id="server-id"
                      value={serverId}
                      onChange={(e) => setServerId(e.target.value)}
                      placeholder="0x1234567890abcdef..."
                      className="font-mono bg-background border-input"
                    />
                    <p className="text-xs text-muted-foreground">
                      The Ethereum address that identifies the server
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="server-url" className="text-sm font-medium">
                      Server URL
                    </Label>
                    <Input
                      id="server-url"
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="https://api.replicate.com/v1/predictions"
                      type="url"
                      className="bg-background border-input"
                    />
                    <p className="text-xs text-muted-foreground">
                      The API endpoint where the server can be reached
                    </p>
                  </div>

                  {/* Transaction Type Selection */}
                  <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Transaction Type
                      </Label>
                      <div className="flex gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="transaction-type"
                            value="regular"
                            checked={!useGaslessTransaction}
                            onChange={() => setUseGaslessTransaction(false)}
                            className="text-primary"
                          />
                          <span className="text-sm">Regular (Pay Gas)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="transaction-type"
                            value="gasless"
                            checked={useGaslessTransaction}
                            onChange={() => setUseGaslessTransaction(true)}
                            className="text-primary"
                          />
                          <span className="text-sm">Gasless (Signature)</span>
                        </label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {useGaslessTransaction
                          ? "Sign a message to trust the server without paying gas fees"
                          : "Submit a blockchain transaction to trust the server"}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={
                        useGaslessTransaction
                          ? handleTrustServerGasless
                          : handleTrustServer
                      }
                      disabled={
                        isTrustingServer ||
                        !serverId.trim() ||
                        !serverUrl.trim()
                      }
                      className="flex-1"
                    >
                      {isTrustingServer ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Shield className="h-4 w-4 mr-2" />
                      )}
                      {useGaslessTransaction
                        ? "Sign & Trust Server"
                        : "Trust Server"}
                    </Button>
                  </div>
                </div>

                {/* Error Display */}
                {trustServerError && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-destructive text-sm">
                      {trustServerError}
                    </p>
                  </div>
                )}

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
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-base">
                        Your Trusted Servers
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Servers you've authorized for data processing
                      </p>
                    </div>
                    <Button
                      onClick={loadTrustedServers}
                      disabled={isLoadingTrustedServers}
                      variant="outline"
                      size="sm"
                    >
                      {isLoadingTrustedServers ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4 mr-2" />
                      )}
                      Refresh
                    </Button>
                  </div>

                  {isLoadingTrustedServers ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading trusted servers...
                    </div>
                  ) : trustedServers.length > 0 ? (
                    <div className="space-y-3">
                      {trustedServers.map((server, index) => (
                        <div
                          key={server}
                          className="flex items-center justify-between p-4 bg-muted rounded-lg border hover:bg-muted/80 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <Badge variant="secondary" className="text-xs">
                              #{index + 1}
                            </Badge>
                            <div className="flex-1">
                              <AddressDisplay
                                address={server}
                                showCopy={true}
                                showExternalLink={true}
                                explorerUrl={getAddressUrl(chainId, server)}
                                className="text-sm"
                              />
                            </div>
                          </div>
                          <Button
                            onClick={() => handleUntrustServer(server)}
                            disabled={isUntrusting}
                            variant="destructive"
                            size="sm"
                          >
                            {isUntrusting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Untrust"
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-6 text-muted-foreground">
                      <p className="mb-4">No trusted servers found.</p>
                      {!serverId ? (
                        <div className="space-y-2">
                          <p className="text-sm">
                            Set up your personal server first to get a server
                            ID, then trust it above.
                          </p>
                          <Button
                            onClick={handleSetupPersonalServer}
                            disabled={isSettingUpPersonalServer || !isConnected}
                            className="w-full max-w-xs"
                          >
                            {isSettingUpPersonalServer ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Setting up Personal Server...
                              </>
                            ) : (
                              <>
                                <Brain className="mr-2 h-4 w-4" />
                                Setup Vana Personal Server
                              </>
                            )}
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm">
                          Use the form above to trust your personal server or
                          other servers.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Personal Server Setup Result Display */}
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
                          Your server ID has been auto-populated above. You can
                          now trust your server.
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
              </CardContent>
            </Card>

            {/* Schema Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Schema Management
                </CardTitle>
                <CardDescription>
                  Manage data schemas and refiners for the DataRefinerRegistry.
                  Create schemas to define data structures, and add refiners
                  that process data according to those schemas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
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
                <div className="space-y-4 p-4 border rounded-lg">
                  <h4 className="font-medium">Create New Schema</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="schema-name">Name</Label>
                      <Input
                        id="schema-name"
                        value={schemaName}
                        onChange={(e) => setSchemaName(e.target.value)}
                        placeholder="e.g., User Profile Schema"
                      />
                    </div>
                    <div>
                      <Label htmlFor="schema-type">Type</Label>
                      <Input
                        id="schema-type"
                        value={schemaType}
                        onChange={(e) => setSchemaType(e.target.value)}
                        placeholder="e.g., json-schema"
                      />
                    </div>
                    <div>
                      <Label htmlFor="schema-url">Definition URL</Label>
                      <Input
                        id="schema-url"
                        value={schemaDefinitionUrl}
                        onChange={(e) => setSchemaDefinitionUrl(e.target.value)}
                        placeholder="https://example.com/schema.json"
                        type="url"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleCreateSchema}
                    disabled={
                      isCreatingSchema ||
                      !schemaName ||
                      !schemaType ||
                      !schemaDefinitionUrl
                    }
                  >
                    {isCreatingSchema ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Database className="h-4 w-4 mr-2" />
                    )}
                    Create Schema
                  </Button>
                  {schemaStatus && (
                    <p
                      className={`text-sm ${schemaStatus.includes("❌") ? "text-destructive" : "text-green-600"}`}
                    >
                      {schemaStatus}
                    </p>
                  )}
                  {lastCreatedSchemaId && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded">
                      <p className="text-green-700 text-sm">
                        ✅ Schema created successfully with ID:{" "}
                        <strong>{lastCreatedSchemaId}</strong>
                      </p>
                    </div>
                  )}
                </div>

                {/* Create Refiner */}
                <div className="space-y-4 p-4 border rounded-lg">
                  <h4 className="font-medium">Create New Refiner</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="refiner-name">Name</Label>
                      <Input
                        id="refiner-name"
                        value={refinerName}
                        onChange={(e) => setRefinerName(e.target.value)}
                        placeholder="e.g., Privacy-Preserving Analytics"
                      />
                    </div>
                    <div>
                      <Label htmlFor="refiner-dlp-id">DLP ID</Label>
                      <Input
                        id="refiner-dlp-id"
                        value={refinerDlpId}
                        onChange={(e) => setRefinerDlpId(e.target.value)}
                        placeholder="e.g., 1"
                        type="number"
                      />
                    </div>
                    <div>
                      <Label htmlFor="refiner-schema-id">Schema ID</Label>
                      <Input
                        id="refiner-schema-id"
                        value={refinerSchemaId}
                        onChange={(e) => setRefinerSchemaId(e.target.value)}
                        placeholder="e.g., 1"
                        type="number"
                      />
                    </div>
                    <div>
                      <Label htmlFor="refiner-instruction-url">
                        Instruction URL
                      </Label>
                      <Input
                        id="refiner-instruction-url"
                        value={refinerInstructionUrl}
                        onChange={(e) =>
                          setRefinerInstructionUrl(e.target.value)
                        }
                        placeholder="https://example.com/instructions.md"
                        type="url"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleCreateRefiner}
                    disabled={
                      isCreatingRefiner ||
                      !refinerName ||
                      !refinerDlpId ||
                      !refinerSchemaId ||
                      !refinerInstructionUrl
                    }
                  >
                    {isCreatingRefiner ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Brain className="h-4 w-4 mr-2" />
                    )}
                    Create Refiner
                  </Button>
                  {refinerStatus && (
                    <p
                      className={`text-sm ${refinerStatus.includes("❌") ? "text-destructive" : "text-green-600"}`}
                    >
                      {refinerStatus}
                    </p>
                  )}
                  {lastCreatedRefinerId && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded">
                      <p className="text-green-700 text-sm">
                        ✅ Refiner created successfully with ID:{" "}
                        <strong>{lastCreatedRefinerId}</strong>
                      </p>
                    </div>
                  )}
                </div>

                {/* Update Schema ID */}
                <div className="space-y-4 p-4 border rounded-lg">
                  <h4 className="font-medium">Update Refiner Schema ID</h4>
                  <p className="text-sm text-muted-foreground">
                    Update the schema ID for an existing refiner (useful for
                    migrating existing refiners to new schema structure).
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="update-refiner-id">Refiner ID</Label>
                      <Input
                        id="update-refiner-id"
                        value={updateRefinerId}
                        onChange={(e) => setUpdateRefinerId(e.target.value)}
                        placeholder="e.g., 1"
                        type="number"
                      />
                    </div>
                    <div>
                      <Label htmlFor="update-schema-id">New Schema ID</Label>
                      <Input
                        id="update-schema-id"
                        value={updateSchemaId}
                        onChange={(e) => setUpdateSchemaId(e.target.value)}
                        placeholder="e.g., 2"
                        type="number"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleUpdateSchemaId}
                    disabled={
                      isUpdatingSchema || !updateRefinerId || !updateSchemaId
                    }
                  >
                    {isUpdatingSchema ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-2" />
                    )}
                    Update Schema ID
                  </Button>
                  {updateSchemaStatus && (
                    <p
                      className={`text-sm ${updateSchemaStatus.includes("❌") ? "text-destructive" : "text-green-600"}`}
                    >
                      {updateSchemaStatus}
                    </p>
                  )}
                </div>

                {/* Schemas List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">
                      Schemas ({schemas.length} shown)
                    </h4>
                    <Button
                      onClick={loadSchemas}
                      disabled={isLoadingSchemas}
                      variant="outline"
                      size="sm"
                    >
                      {isLoadingSchemas ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4 mr-2" />
                      )}
                      Refresh
                    </Button>
                  </div>

                  {isLoadingSchemas ? (
                    <div className="text-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Loading schemas...
                      </p>
                    </div>
                  ) : schemas.length > 0 ? (
                    <div className="space-y-2">
                      {schemas.map((schema) => (
                        <div
                          key={schema.id}
                          className="p-3 border rounded bg-muted/30"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">ID: {schema.id}</Badge>
                                {schema.source === "created" && (
                                  <Badge variant="secondary">
                                    Created by You
                                  </Badge>
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
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No schemas found</p>
                      <p className="text-sm">Create your first schema above</p>
                    </div>
                  )}
                </div>

                {/* Refiners List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">
                      Refiners ({refiners.length} shown)
                    </h4>
                    <Button
                      onClick={loadRefiners}
                      disabled={isLoadingRefiners}
                      variant="outline"
                      size="sm"
                    >
                      {isLoadingRefiners ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4 mr-2" />
                      )}
                      Refresh
                    </Button>
                  </div>

                  {isLoadingRefiners ? (
                    <div className="text-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Loading refiners...
                      </p>
                    </div>
                  ) : refiners.length > 0 ? (
                    <div className="space-y-2">
                      {refiners.map((refiner) => (
                        <div
                          key={refiner.id}
                          className="p-3 border rounded bg-muted/30"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">
                                  ID: {refiner.id}
                                </Badge>
                                <Badge variant="outline">
                                  DLP: {refiner.dlpId}
                                </Badge>
                                <Badge variant="outline">
                                  Schema: {refiner.schemaId}
                                </Badge>
                                {refiner.source === "created" && (
                                  <Badge variant="secondary">
                                    Created by You
                                  </Badge>
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
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No refiners found</p>
                      <p className="text-sm">Create your first refiner above</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Personal Server */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Personal Server Integration
                </CardTitle>
                <CardDescription>
                  Interact with the Vana Personal Server to run computations on
                  granted data permissions. Submit a computation request using a
                  permission ID.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="permission-id">Permission ID</Label>
                    <Input
                      id="permission-id"
                      value={personalPermissionId}
                      onChange={(e) => setPersonalPermissionId(e.target.value)}
                      placeholder="Enter permission ID (e.g., 123)"
                      type="number"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handlePersonalServerCall}
                      disabled={
                        isPersonalLoading || !personalPermissionId.trim()
                      }
                    >
                      {isPersonalLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Brain className="h-4 w-4 mr-2" />
                      )}
                      Submit Request
                    </Button>
                    {Boolean(
                      personalResult &&
                        (personalResult as { urls?: { get?: string } })?.urls
                          ?.get,
                    ) && (
                      <Button
                        onClick={handlePollStatus}
                        disabled={isPolling}
                        variant="outline"
                      >
                        {isPolling ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
                    <p className="text-destructive text-sm">{personalError}</p>
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
              </CardContent>
            </Card>

            {/* Encryption Testing */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Canonical Encryption Testing
                </CardTitle>
                <CardDescription>
                  Test the Vana canonical encryption protocol functions
                  interactively. Exercise generateEncryptionKey(),
                  encryptUserData(), and decryptUserData().
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Step 1: Configure Encryption Seed */}
                <div className="space-y-3">
                  <Label
                    htmlFor="encryption-seed"
                    className="flex items-center gap-2"
                  >
                    <Key className="h-4 w-4" />
                    Step 1: Encryption Seed (overrideable)
                  </Label>
                  <Input
                    id="encryption-seed"
                    value={encryptionSeed}
                    onChange={(e) => setEncryptionSeed(e.target.value)}
                    placeholder="Enter encryption seed message"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: &quot;{DEFAULT_ENCRYPTION_SEED}&quot;
                  </p>
                </div>

                <Separator />

                {/* Step 2: Generate Encryption Key */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Step 2: Generate Encryption Key
                  </Label>
                  <Button
                    onClick={handleGenerateKey}
                    disabled={isEncrypting || !encryptionSeed}
                    className="w-full"
                  >
                    {isEncrypting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                          variant="outline"
                          onClick={() =>
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

                <Separator />

                {/* Step 3: Data Input (Text or File) */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Step 3: Choose Data Input Mode
                    </Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={inputMode === "text" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setInputMode("text")}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Text
                      </Button>
                      <Button
                        variant={inputMode === "file" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setInputMode("file")}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        File
                      </Button>
                    </div>
                  </div>

                  {inputMode === "text" && (
                    <div className="space-y-3">
                      <Label htmlFor="test-data">
                        Enter text data to encrypt:
                      </Label>
                      <textarea
                        id="test-data"
                        value={testData}
                        onChange={(e) => setTestData(e.target.value)}
                        placeholder="Enter data to encrypt (JSON, text, etc.)"
                        className="w-full p-3 border rounded-md font-mono text-sm min-h-[100px] resize-y bg-background text-foreground border-input"
                      />
                    </div>
                  )}

                  {inputMode === "file" && (
                    <div className="space-y-3">
                      <Label htmlFor="file-upload">
                        Upload a file to encrypt:
                      </Label>
                      <div className="border-2 border-dashed border-input rounded-lg p-6">
                        <input
                          id="file-upload"
                          type="file"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <Label
                          htmlFor="file-upload"
                          className="cursor-pointer flex flex-col items-center gap-2 text-center"
                        >
                          <Upload className="h-8 w-8 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {uploadedFile
                              ? uploadedFile.name
                              : "Click to upload file"}
                          </span>
                          {uploadedFile && (
                            <span className="text-xs text-muted-foreground">
                              Size: {(uploadedFile.size / 1024).toFixed(1)} KB |
                              Type: {uploadedFile.type || "unknown"}
                            </span>
                          )}
                        </Label>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Step 4: Encrypt/Decrypt Actions */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Step 4: Encryption Operations
                  </Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Button
                      onClick={handleEncryptData}
                      disabled={isEncrypting || !generatedKey || !testData}
                      variant="default"
                    >
                      {isEncrypting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Lock className="mr-2 h-4 w-4" />
                      )}
                      Encrypt Data
                    </Button>
                    <Button
                      onClick={handleDecryptData}
                      disabled={isEncrypting || !encryptedData}
                      variant="outline"
                    >
                      {isEncrypting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Shield className="mr-2 h-4 w-4" />
                      )}
                      Decrypt Data
                    </Button>
                    <Button
                      onClick={handleResetEncryption}
                      disabled={isEncrypting}
                      variant="destructive"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reset All
                    </Button>
                  </div>
                </div>

                {/* Results */}
                {encryptionStatus && (
                  <p
                    className={`text-sm ${encryptionStatus.includes("❌") ? "text-destructive" : "text-green-600"} mt-2`}
                  >
                    {encryptionStatus}
                  </p>
                )}

                {encryptedData && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Encrypted Data (Blob):</Label>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
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
                          variant="outline"
                          onClick={handleDownloadEncrypted}
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
                        <Badge variant="secondary">OpenPGP Encrypted</Badge>
                      </div>

                      {showEncryptedContent && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-xs">Hex Content:</Label>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
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
                    {/* Storage Provider Selection */}
                    <div className="space-y-3">
                      <Label>Storage Provider:</Label>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={
                            selectedStorageProvider === "ipfs"
                              ? "default"
                              : "outline"
                          }
                          onClick={() => setSelectedStorageProvider("ipfs")}
                          disabled={isUploadingToChain}
                        >
                          IPFS (Recommended)
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            selectedStorageProvider === "google-drive"
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            setSelectedStorageProvider("google-drive")
                          }
                          disabled={isUploadingToChain}
                        >
                          Google Drive (Soon)
                        </Button>
                      </div>

                      {/* IPFS Mode Selection */}
                      {selectedStorageProvider === "ipfs" && (
                        <div className="space-y-2 pl-4 border-l-2 border-muted">
                          <Label className="text-sm">IPFS Configuration:</Label>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={
                                ipfsMode === "app-managed"
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => setIpfsMode("app-managed")}
                              disabled={isUploadingToChain}
                            >
                              🏢 App&apos;s IPFS
                            </Button>
                            <Button
                              size="sm"
                              variant={
                                ipfsMode === "user-managed"
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => setIpfsMode("user-managed")}
                              disabled={isUploadingToChain}
                            >
                              👤 My IPFS
                            </Button>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            {ipfsMode === "app-managed" ? (
                              <p>
                                ✅ Uses the app&apos;s Pinata account. No setup
                                required!
                              </p>
                            ) : (
                              <div className="space-y-2">
                                <p>
                                  👤 Use your own Pinata account - enter your
                                  API key below:
                                </p>
                                <div className="space-y-2">
                                  <div>
                                    <Label className="text-xs">
                                      Pinata JWT Token:
                                    </Label>
                                    <Input
                                      type="password"
                                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                      value={userIpfsJwt}
                                      onChange={(e) =>
                                        setUserIpfsJwt(e.target.value)
                                      }
                                      className="text-xs"
                                      disabled={isUploadingToChain}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">
                                      Gateway URL (optional):
                                    </Label>
                                    <Input
                                      type="url"
                                      placeholder="https://gateway.pinata.cloud"
                                      value={userIpfsGateway}
                                      onChange={(e) =>
                                        setUserIpfsGateway(e.target.value)
                                      }
                                      className="text-xs"
                                      disabled={isUploadingToChain}
                                    />
                                  </div>
                                </div>
                                {userIpfsJwt ? (
                                  <p className="text-green-600">
                                    ✅ Your Pinata configuration is ready!
                                  </p>
                                ) : (
                                  <p>
                                    ⚠️ Enter your Pinata JWT token to use your
                                    own IPFS account
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Schema Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="upload-schema">Schema (Optional):</Label>
                      <select
                        id="upload-schema"
                        value={selectedUploadSchemaId}
                        onChange={(e) =>
                          setSelectedUploadSchemaId(e.target.value)
                        }
                        disabled={isUploadingToChain || isLoadingSchemas}
                        className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                      >
                        <option value="">No schema (unstructured data)</option>
                        {schemas.map((schema) => (
                          <option key={schema.id} value={schema.id.toString()}>
                            {schema.name} (ID: {schema.id})
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        Select a schema to associate your encrypted data with a
                        specific data structure. This helps refiners process
                        your data according to the schema definition.
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>Upload to Vana Blockchain:</Label>
                      <Button
                        onClick={handleUploadToBlockchain}
                        disabled={isUploadingToChain}
                        variant="default"
                      >
                        {isUploadingToChain ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                        This will upload your encrypted file using the selected
                        storage provider and register it on the Vana
                        DataRegistry. The Storage API provides a unified
                        interface for different storage backends. Once uploaded,
                        it will appear in your &quot;Data Files&quot; list above
                        and you can decrypt it to test the complete workflow.
                      </p>

                      {uploadToChainStatus && (
                        <p
                          className={`text-sm ${uploadToChainStatus.includes("❌") ? "text-destructive" : "text-green-600"} mt-3`}
                        >
                          {uploadToChainStatus}
                        </p>
                      )}

                      {newFileId && (
                        <div className="mt-3 p-2 bg-green-50/50 rounded border">
                          <p className="text-sm font-medium text-green-700">
                            🎉 Success! Your file is now on the blockchain with
                            ID: <strong>{newFileId}</strong>
                          </p>
                          <p className="text-xs text-green-600 mt-1">
                            Check your &quot;Data Files&quot; section above to
                            see the new file and try decrypting it!
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {decryptedData && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Decrypted Data (Verification):</Label>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            copyToClipboard(decryptedData, "Decrypted data")
                          }
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleDownloadDecrypted}
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
              </CardContent>
            </Card>

            {/* Canonical Contracts */}
            <Card>
              <CardHeader>
                <CardTitle>Canonical Contracts</CardTitle>
                <CardDescription>
                  All {vana.protocol.getAvailableContracts().length} Vana
                  protocol contracts deployed on{" "}
                  {vana?.protocol?.getChainName?.() || "this network"}. Click to
                  view on block explorer.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {vana.protocol.getAvailableContracts().map((contractName) => {
                    try {
                      const contract = vana.protocol.getContract(contractName);
                      const explorerUrl = `https://moksha.vanascan.io/address/${contract.address}`;

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
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              View
                            </a>
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
                          <Button size="sm" variant="outline" disabled>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            N/A
                          </Button>
                        </div>
                      );
                    }
                  })}
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Network Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Current Network:</p>
                      <p className="font-mono">
                        {vana?.protocol?.getChainName?.() || "Not connected"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Chain ID:</p>
                      <p className="font-mono">
                        {vana?.protocol?.getChainId?.() || "N/A"}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
