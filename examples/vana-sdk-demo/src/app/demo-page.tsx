"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { getContract } from "viem";
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
  PinataStorage,
  ServerIPFSStorage,
} from "vana-sdk";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Check,
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
} from "lucide-react";

export default function Home() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [vana, setVana] = useState<Vana | null>(null);
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [grantStatus, setGrantStatus] = useState<string>("");
  const [grantTxHash, setGrantTxHash] = useState<string>("");
  const [revokeStatus, setRevokeStatus] = useState<string>("");
  const [revokeInput, setRevokeInput] = useState<string>("");
  const [relayerHealth, setRelayerHealth] = useState<any>(null);
  const [isGranting, setIsGranting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [userPermissions, setUserPermissions] = useState<GrantedPermission[]>(
    []
  );
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);

  // Encryption testing state
  const [encryptionSeed, setEncryptionSeed] = useState<string>(
    DEFAULT_ENCRYPTION_SEED
  );
  const [testData, setTestData] = useState<string>(
    `{"message": "Hello Vana!", "timestamp": "${new Date().toISOString()}"}`
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
    new Set()
  );
  const [decryptedFiles, setDecryptedFiles] = useState<Map<number, string>>(
    new Map()
  );
  const [fileDecryptErrors, setFileDecryptErrors] = useState<
    Map<number, string>
  >(new Map());

  // Blockchain upload state
  const [isUploadingToChain, setIsUploadingToChain] = useState(false);
  const [uploadToChainStatus, setUploadToChainStatus] = useState<string>("");
  const [newFileId, setNewFileId] = useState<number | null>(null);

  // Storage state
  const [storageManager, setStorageManager] = useState<StorageManager | null>(
    null
  );
  const [selectedStorageProvider, setSelectedStorageProvider] = useState<
    "ipfs" | "google-drive"
  >("ipfs");
  const [ipfsMode, setIpfsMode] = useState<"app-managed" | "user-managed">(
    "app-managed"
  );

  // File lookup state
  const [fileLookupId, setFileLookupId] = useState<string>("");
  const [lookedUpFile, setLookedUpFile] = useState<any>(null);
  const [isLookingUpFile, setIsLookingUpFile] = useState(false);
  const [fileLookupStatus, setFileLookupStatus] = useState<string>("");

  // Add state for personal server call
  const [personalOp, setPersonalOp] = useState<string>("llm_inference");
  const [personalPrompt, setPersonalPrompt] = useState<string>("Analyze personality: {{data}}");
  const [personalFileIds, setPersonalFileIds] = useState<string>("");
  const [personalResult, setPersonalResult] = useState<any>(null);
  const [personalError, setPersonalError] = useState<string>("");
  const [isPersonalLoading, setIsPersonalLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  // Initialize Vana SDK when wallet is connected
  useEffect(() => {
    if (isConnected && walletClient && walletClient.account) {
      try {
        const vanaInstance = new Vana({
          walletClient: walletClient as any,
          relayerUrl: `${window.location.origin}`,
        });
        setVana(vanaInstance);
        console.log("✅ Vana SDK initialized:", vanaInstance.getConfig());
        console.log("🔍 Debug - vanaInstance properties:", Object.keys(vanaInstance));
        console.log("🔍 Debug - vanaInstance.personal:", (vanaInstance as any).personal);

        // Initialize storage manager
        const manager = new StorageManager();

        // Option A: App-managed IPFS (always available)
        console.log("🏢 Registering app-managed IPFS storage");
        const serverIPFS = new ServerIPFSStorage({
          uploadEndpoint: "/api/ipfs/upload",
        });
        manager.register("app-ipfs", serverIPFS, true); // Default

        // Option B: User-managed IPFS (if configured)
        const pinataJWT = process.env.NEXT_PUBLIC_PINATA_JWT;
        const pinataGateway =
          process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL ||
          "https://gateway.pinata.cloud";

        if (pinataJWT) {
          console.log("👤 Registering user-managed Pinata IPFS storage");
          const pinataStorage = new PinataStorage({
            jwt: pinataJWT,
            gatewayUrl: pinataGateway,
          });
          manager.register("user-ipfs", pinataStorage);

          // Test the connection
          pinataStorage.testConnection().then((result: any) => {
            if (result.success) {
              console.log("✅ User Pinata connection verified:", result.data);
            } else {
              console.warn("⚠️ User Pinata connection failed:", result.error);
            }
          });
        } else {
          console.log(
            "💡 NEXT_PUBLIC_PINATA_JWT not configured - user-managed IPFS unavailable"
          );
          console.log(
            "ℹ️ Add NEXT_PUBLIC_PINATA_JWT to .env.local to enable user-managed IPFS"
          );
        }

        setStorageManager(manager);
        console.log("✅ Storage manager initialized with both IPFS patterns");
      } catch (error) {
        console.error("❌ Failed to initialize Vana SDK:", error);
      }
    } else {
      setVana(null);
      setStorageManager(null);
      setUserFiles([]);
      setSelectedFiles([]);
    }
  }, [isConnected, walletClient]);

  // Check relayer health
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        setRelayerHealth(data);
        console.log("✅ Relayer health check:", data);
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

    try {
      const files = await vana.data.getUserFiles({ owner: address });
      setUserFiles(files);
    } catch (error) {
      console.error("Failed to load user files:", error);
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
    if (!vana || selectedFiles.length === 0 || !walletClient) return;

    setIsGranting(true);
    setGrantStatus("Preparing permission grant...");
    setGrantTxHash("");

    try {
      // Step 1: Generate encryption key using canonical Vana protocol
      setGrantStatus("Generating encryption key...");
      const encryptionKey = await generateEncryptionKey(walletClient as any);

      // Step 2: Create permission parameters
      const parameterData = {
        prompt: "Analyze my data for insights",
        files: selectedFiles,
        maxTokens: 1000,
        temperature: 0.7,
        model: "gpt-4",
        timestamp: new Date().toISOString(),
        encryptionKey: encryptionKey, // Include the real encryption key
      };

      // Step 3: Encrypt the parameters using canonical Vana encryption
      setGrantStatus("Encrypting parameters...");
      const parameterBlob = new Blob([JSON.stringify(parameterData)], {
        type: "application/json",
      });
      const encryptedParameters = await encryptUserData(
        parameterBlob,
        encryptionKey
      );

      // Step 4: Convert to base64 for storage
      const encryptedArrayBuffer = await encryptedParameters.arrayBuffer();
      const encryptedBase64 = btoa(
        String.fromCharCode(...new Uint8Array(encryptedArrayBuffer))
      );

      const params: GrantPermissionParams = {
        to: "0x1234567890123456789012345678901234567890", // Demo DLP address
        operation: "llm_inference",
        files: selectedFiles, // Include the selected file IDs
        parameters: {
          encrypted: true,
          data: encryptedBase64,
          encryptionMethod: "vana-openpgp-symmetric",
          timestamp: new Date().toISOString(),
        },
      };

      console.log('🔍 Debug - Permission params:', {
        selectedFiles,
        paramsFiles: params.files,
        filesLength: params.files.length
      });

      setGrantStatus("Awaiting signature...");

      const txHash = await vana.permissions.grant(params);

      setGrantStatus(
        "Permission granted successfully! ✅ Real encryption used"
      );
      setGrantTxHash(txHash);
    } catch (error) {
      console.error("Failed to grant permission:", error);
      setGrantStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevokePermission = async () => {
    if (!vana || !revokeInput.trim()) return;

    setIsRevoking(true);
    setRevokeStatus("Preparing permission revoke...");

    try {
      const params: RevokePermissionParams = {
        grantId: revokeInput.trim() as `0x${string}`,
      };

      setRevokeStatus("Awaiting signature...");

      const txHash = await vana.permissions.revoke(params);

      setRevokeStatus(`Permission revoked successfully! Tx: ${txHash}`);
    } catch (error) {
      console.error("Failed to revoke permission:", error);
      setRevokeStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
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
      const key = await generateEncryptionKey(
        walletClient as any,
        encryptionSeed
      );
      setGeneratedKey(key);
      setEncryptionStatus("✅ Encryption key generated successfully!");
    } catch (error) {
      console.error("Failed to generate key:", error);
      setEncryptionStatus(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`
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
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`
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
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`
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
    } catch (error) {
      setEncryptionStatus(`❌ Failed to copy ${type} to clipboard`);
      setTimeout(() => setEncryptionStatus(""), 2000);
    }
  };

  const handleDecryptFile = async (file: UserFile) => {
    if (!walletClient) {
      setFileDecryptErrors((prev) =>
        new Map(prev).set(
          file.id,
          "Wallet not connected. Please connect your wallet first."
        )
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
      // Step 1: Generate encryption key using the same method
      const encryptionKey = await generateEncryptionKey(
        walletClient as any,
        DEFAULT_ENCRYPTION_SEED
      );

      // Step 2: Fetch the encrypted file from the URL
      const response = await fetch(file.url);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "File not found. The encrypted file may have been moved or deleted."
          );
        } else if (response.status === 403) {
          throw new Error(
            "Access denied. You may not have permission to access this file."
          );
        } else {
          throw new Error(
            `Network error: ${response.status} ${response.statusText}`
          );
        }
      }

      const encryptedBlob = await response.blob();

      // Check if we got actual content
      if (encryptedBlob.size === 0) {
        throw new Error("File is empty or could not be retrieved.");
      }

      // Step 3: Decrypt the file using our canonical function
      const decryptedBlob = await decryptUserData(encryptedBlob, encryptionKey);
      const decryptedText = await decryptedBlob.text();

      // Step 4: Store the decrypted content
      setDecryptedFiles((prev) => new Map(prev).set(file.id, decryptedText));
    } catch (error) {
      console.error("Failed to decrypt file:", error);

      let userMessage = "";
      if (error instanceof Error) {
        if (
          error.message.includes("Session key decryption failed") ||
          error.message.includes("Error decrypting message")
        ) {
          userMessage = `🔑 Wrong encryption key. This file may have been encrypted with a different wallet or encryption seed. Try using the same wallet that originally encrypted this file.`;
        } else if (
          error.message.includes("Failed to fetch") ||
          error.message.includes("Network error")
        ) {
          userMessage = `🌐 Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions.`;
        } else if (error.message.includes("File not found")) {
          userMessage = `📁 File not found: The encrypted file is no longer available at the stored URL.`;
        } else if (error.message.includes("not a valid OpenPGP message")) {
          userMessage = `📄 Invalid file format: This file doesn't appear to be encrypted with the Vana protocol.`;
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
        "❌ Please enter a file ID and ensure wallet is connected"
      );
      return;
    }

    setIsLookingUpFile(true);
    setFileLookupStatus("🔍 Looking up file...");
    setLookedUpFile(null);

    try {
      const fileId = parseInt(fileLookupId.trim());
      if (isNaN(fileId) || fileId < 0) {
        throw new Error(
          "Invalid file ID. Please enter a valid positive number."
        );
      }

      // Get file details from DataRegistry
      const contractInfo = vana.protocol.getContract("DataRegistry");
      const dataRegistry = getContract({
        address: contractInfo.address,
        abi: contractInfo.abi,
        client: walletClient,
      });
      
      const fileDetails = await dataRegistry.read.files([BigInt(fileId)]) as any;

      if (!fileDetails || fileDetails.id === BigInt(0)) {
        throw new Error("File not found");
      }

      const file = {
        id: Number(fileDetails.id),
        ownerAddress: fileDetails.ownerAddress,
        url: fileDetails.url,
        addedAtBlock: Number(fileDetails.addedAtBlock),
      };

      setLookedUpFile(file);
      setFileLookupStatus(`✅ File ${fileId} found!`);
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

  const handleDecryptLookedUpFile = async () => {
    if (!lookedUpFile || !vana || !walletClient) {
      setFileLookupStatus("❌ No file selected or wallet not connected");
      return;
    }

    setFileLookupStatus("🔓 Decrypting file...");

    try {
      // Step 1: Download the encrypted file from IPFS
      const response = await fetch(lookedUpFile.url.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/'));
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }
      
      const encryptedData = await response.arrayBuffer();
      const encryptedBlob = new Blob([encryptedData]);
      
      console.log('📊 Debug info:', {
        fileUrl: lookedUpFile.url,
        downloadedSize: encryptedData.byteLength,
        blobSize: encryptedBlob.size,
        contentType: response.headers.get('content-type')
      });

      // Step 2: Generate the encryption key using the same method as encryption
      console.log('🔑 Generating encryption key for decryption...');
      // Use the same seed as used during encryption - check encryptionSeed state or use DEFAULT_ENCRYPTION_SEED
      const seedToUse = encryptionSeed || DEFAULT_ENCRYPTION_SEED;
      console.log('🔑 Using seed:', seedToUse);
      const encryptionKey = await generateEncryptionKey(walletClient as any, seedToUse);
      console.log('🔑 Generated key length:', encryptionKey.length);
      console.log('🔑 Key starts with:', encryptionKey.substring(0, 20) + '...');

      // Step 3: Decrypt the data
      const decryptedBlob = await decryptUserData(encryptedBlob, encryptionKey);
      const decryptedContent = await decryptedBlob.text();

      // Step 4: Store the decrypted content for display
      setDecryptedFiles((prev) => new Map(prev).set(lookedUpFile.id, decryptedContent));
      
      setFileLookupStatus(`✅ File ${lookedUpFile.id} decrypted successfully!`);

    } catch (error) {
      console.error("❌ Error decrypting looked up file:", error);
      let userMessage = "❌ Failed to decrypt file: ";
      if (error instanceof Error) {
        userMessage += error.message;
      } else {
        userMessage += "Unknown error occurred";
      }
      setFileLookupStatus(userMessage);
    }
  };

  const handleUploadToBlockchain = async () => {
    if (!encryptedData || !vana || !storageManager) {
      setUploadToChainStatus(
        "❌ No encrypted data to upload or storage not initialized"
      );
      return;
    }

    // Check if Google Drive is selected but not configured
    if (selectedStorageProvider === "google-drive") {
      setUploadToChainStatus(
        "❌ Google Drive storage is not yet configured. Please use IPFS for now."
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
    if (providerName === "user-ipfs" && !process.env.NEXT_PUBLIC_PINATA_JWT) {
      setUploadToChainStatus(
        "❌ User-managed IPFS not configured. Add NEXT_PUBLIC_PINATA_JWT to .env.local or use app-managed IPFS."
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
      // Step 1: Upload encrypted blob using storage manager
      const filename = originalFileName
        ? `${originalFileName}.encrypted`
        : "encrypted-data.bin";

      const uploadResult = await storageManager.upload(
        encryptedData,
        filename,
        providerName
      );
      const storageUrl = uploadResult.url;

      console.log("✅ File uploaded to storage:", {
        provider: selectedStorageProvider,
        url: storageUrl,
        size: uploadResult.size,
        contentType: uploadResult.contentType,
      });

      setUploadToChainStatus("⛓️ Registering file on Vana blockchain...");

      // Step 2: Register file on DataRegistry via relayer
      const addFileResponse = await fetch("/api/relay/addFile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: storageUrl,
          userAddress: address,
        }),
      });

      if (!addFileResponse.ok) {
        throw new Error(
          `Failed to add file to blockchain: ${addFileResponse.statusText}`
        );
      }

      const addFileData = await addFileResponse.json();
      const fileId = addFileData.fileId;

      setNewFileId(fileId);
      setUploadToChainStatus(
        `✅ File registered successfully! File ID: ${fileId}`
      );

      // Step 3: Refresh user files to show the new file
      setTimeout(() => {
        loadUserFiles();
      }, 2000);
    } catch (error) {
      console.error("Failed to upload to blockchain:", error);
      setUploadToChainStatus(
        `❌ Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`
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
      `{"message": "Hello Vana!", "timestamp": "${new Date().toISOString()}"}`
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
  };

  const getExplorerUrl = (txHash: string) => {
    return `https://moksha.vanascan.io/tx/${txHash}`;
  };

  const handlePersonalServerCall = async () => {
    if (!vana || !address) return;
    
    if (!vana.personal) {
      setPersonalError("Personal controller not available. Please check SDK version.");
      return;
    }
    
    // Parse file IDs
    let fileIds: number[] = [];
    if (personalFileIds.trim()) {
      try {
        fileIds = personalFileIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      } catch (e) {
        setPersonalError("File IDs must be comma-separated numbers");
        return;
      }
    }
    
    if (fileIds.length === 0) {
      setPersonalError("Please provide at least one file ID");
      return;
    }
    
    setIsPersonalLoading(true);
    setPersonalError("");
    setPersonalResult(null);
    try {
      const result = await vana.personal.postRequest({
        owner: address,
        fileIds,
        operation: personalOp,
        parameters: { prompt: personalPrompt }
      });
      setPersonalResult(result);
    } catch (e: any) {
      setPersonalError(e?.message || "Unknown error");
    } finally {
      setIsPersonalLoading(false);
    }
  };

  const handlePollStatus = async () => {
    if (!vana || !personalResult?.urls?.get) return;
    
    setIsPolling(true);
    setPersonalError("");
    try {
      const updatedResult = await (vana as any).personal.pollStatus(personalResult.urls.get);
      setPersonalResult(updatedResult);
    } catch (e: any) {
      setPersonalError(e?.message || "Unknown error");
    } finally {
      setIsPolling(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Vana SDK Demo</h1>
          <p className="text-muted-foreground text-lg">
            Experience the Vana SDK: canonical encryption, gasless relayer
            service, real IPFS storage, and permission management.
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
              <Alert>
                <Check className="h-4 w-4" />
                <AlertDescription>
                  <strong>Relayer Status:</strong> {relayerHealth.status} •
                  <strong> Service:</strong> {relayerHealth.service} •
                  <strong> Chain:</strong> {relayerHealth.chain}
                </AlertDescription>
              </Alert>
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
                    <p>
                      <strong>User Address:</strong>{" "}
                      <span className="text-sm font-mono">{address}</span>
                    </p>
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
                      <p className="mb-2">
                        <strong>Relayer Address:</strong>{" "}
                        <span className="text-sm font-mono">
                          {relayerHealth.relayer}
                        </span>
                      </p>
                    )}
                    <p>
                      <strong>Type:</strong> Gasless Demo Service
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Data Files */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Data Files
                </CardTitle>
                <CardDescription>
                  Your registered data files from the blockchain. Click
                  "Decrypt" to decrypt and view content using the canonical Vana
                  protocol.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={loadUserFiles} className="mb-4">
                  Refresh User Files
                </Button>

                {userFiles.length > 0 ? (
                  <div className="space-y-3">
                    <p className="font-medium">Your registered data files:</p>
                    {userFiles.map((file) => {
                      const isDecrypting = decryptingFiles.has(file.id);
                      const decryptedContent = decryptedFiles.get(file.id);
                      const decryptError = fileDecryptErrors.get(file.id);

                      return (
                        <div key={file.id} className="border rounded-lg">
                          <div className="flex items-center space-x-3 p-3">
                            <Checkbox
                              id={`file-${file.id}`}
                              checked={selectedFiles.includes(file.id)}
                              onCheckedChange={(checked) =>
                                handleFileSelection(file.id, checked as boolean)
                              }
                            />
                            <div className="flex-1 text-sm">
                              <strong>ID:</strong> {file.id} |
                              <strong> URL:</strong>
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 underline ml-1 mr-1"
                              >
                                {file.url.length > 50
                                  ? `${file.url.substring(0, 50)}...`
                                  : file.url}
                              </a>{" "}
                              |<strong> Block:</strong>
                              <a
                                href={`https://moksha.vanascan.io/block/${file.addedAtBlock}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 underline ml-1"
                              >
                                {file.addedAtBlock.toString()}
                              </a>
                            </div>

                            {/* Decrypt Actions */}
                            <div className="flex gap-2">
                              {!decryptedContent && !decryptError && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDecryptFile(file)}
                                  disabled={isDecrypting}
                                >
                                  {isDecrypting ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Shield className="mr-2 h-4 w-4" />
                                  )}
                                  {isDecrypting ? "Decrypting..." : "Decrypt"}
                                </Button>
                              )}

                              {decryptError && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDecryptFile(file)}
                                  disabled={isDecrypting}
                                >
                                  {isDecrypting ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Shield className="mr-2 h-4 w-4" />
                                  )}
                                  {isDecrypting ? "Retrying..." : "Retry"}
                                </Button>
                              )}

                              {decryptedContent && (
                                <>
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    ✅ Decrypted
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      copyToClipboard(
                                        decryptedContent,
                                        `File ${file.id} content`
                                      )
                                    }
                                  >
                                    <Copy className="mr-2 h-4 w-4" />
                                    Copy
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      handleDownloadDecryptedFile(file)
                                    }
                                  >
                                    <Download className="mr-2 h-4 w-4" />
                                    Download
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Show decrypted content */}
                          {decryptedContent && (
                            <div className="border-t p-3 bg-muted/30">
                              <Label className="text-xs font-medium mb-2 block">
                                Decrypted Content:
                              </Label>
                              <div className="max-h-32 overflow-y-auto bg-background p-2 rounded border">
                                <pre className="font-mono text-xs whitespace-pre-wrap break-all">
                                  {decryptedContent}
                                </pre>
                              </div>
                            </div>
                          )}

                          {/* Show decrypt error */}
                          {decryptError && (
                            <div className="border-t p-3 bg-red-50 dark:bg-red-950/20">
                              <Alert variant="destructive">
                                <AlertDescription className="text-sm">
                                  {decryptError}
                                </AlertDescription>
                              </Alert>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <Alert>
                      <AlertDescription>
                        <strong>Selected files:</strong> {selectedFiles.length}{" "}
                        • Use "Decrypt" to view encrypted file contents on-chain
                        using your wallet signature.
                      </AlertDescription>
                    </Alert>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Loading user files...</p>
                )}
              </CardContent>
            </Card>

            {/* File Lookup */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  File Lookup
                </CardTitle>
                <CardDescription>
                  Look up any file by its ID from the DataRegistry contract.
                  This allows you to access files that don't have proof events
                  yet.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="file-lookup-id">File ID:</Label>
                    <input
                      id="file-lookup-id"
                      type="text"
                      value={fileLookupId}
                      onChange={(e) => setFileLookupId(e.target.value)}
                      placeholder="Enter file ID (e.g., 123)"
                      className="flex-1 p-2 border rounded-md text-sm bg-background text-foreground border-input"
                    />
                    <Button
                      onClick={handleLookupFile}
                      disabled={isLookingUpFile || !fileLookupId.trim()}
                      size="sm"
                    >
                      {isLookingUpFile ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="mr-2 h-4 w-4" />
                      )}
                      Lookup
                    </Button>
                  </div>

                  {fileLookupStatus && (
                    <Alert
                      variant={
                        fileLookupStatus.includes("❌")
                          ? "destructive"
                          : "default"
                      }
                    >
                      <AlertDescription>{fileLookupStatus}</AlertDescription>
                    </Alert>
                  )}

                  {lookedUpFile && (
                    <div className="border rounded-md p-4 bg-muted/50">
                      <h4 className="font-medium mb-2">File Details:</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="font-medium">ID:</span>{" "}
                          {lookedUpFile.id}
                        </div>
                        <div>
                          <span className="font-medium">Block:</span>{" "}
                          {lookedUpFile.addedAtBlock}
                        </div>
                        <div className="col-span-2">
                          <span className="font-medium">Owner:</span>
                          <span className="font-mono text-xs ml-1">
                            {lookedUpFile.ownerAddress}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="font-medium">URL:</span>
                          <span className="font-mono text-xs ml-1 break-all">
                            {lookedUpFile.url}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant={selectedFiles.includes(lookedUpFile.id) ? "default" : "outline"}
                          onClick={() => {
                            if (selectedFiles.includes(lookedUpFile.id)) {
                              // Remove from selection
                              setSelectedFiles(prev => prev.filter(id => id !== lookedUpFile.id));
                            } else {
                              // Add to selection (replace current selection for simplicity)
                              setSelectedFiles([lookedUpFile.id]);
                            }
                          }}
                        >
                          <Shield className="mr-2 h-4 w-4" />
                          {selectedFiles.includes(lookedUpFile.id) ? "Selected ✓" : "Select for Permission Grant"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // Copy URL to clipboard
                            navigator.clipboard.writeText(lookedUpFile.url);
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy URL
                        </Button>
                        {lookedUpFile.ownerAddress.toLowerCase() === address?.toLowerCase() && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={handleDecryptLookedUpFile}
                          >
                            <Key className="mr-2 h-4 w-4" />
                            Decrypt File
                          </Button>
                        )}
                      </div>
                      
                      {decryptedFiles.has(lookedUpFile.id) && (
                        <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                          <h5 className="font-medium text-green-800 dark:text-green-200 mb-2">
                            Decrypted Content:
                          </h5>
                          <pre className="text-sm text-green-700 dark:text-green-300 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                            {decryptedFiles.get(lookedUpFile.id)}
                          </pre>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            onClick={() => {
                              const content = decryptedFiles.get(lookedUpFile.id);
                              if (content) {
                                const blob = new Blob([content], { type: "text/plain" });
                                const filename = `decrypted_file_${lookedUpFile.id}.txt`;
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = filename;
                                a.click();
                                URL.revokeObjectURL(url);
                              }
                            }}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Grant Permission */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Grant Permission (Gasless)
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                  <Alert
                    variant={
                      grantStatus.includes("Error") ? "destructive" : "default"
                    }
                  >
                    <AlertDescription>{grantStatus}</AlertDescription>
                  </Alert>
                )}
                {grantTxHash && (
                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    <p className="font-medium mb-2">Transaction Hash:</p>
                    <a
                      href={getExplorerUrl(grantTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-mono mb-3 break-all text-blue-600 hover:text-blue-800 underline block"
                    >
                      {grantTxHash}
                    </a>
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={getExplorerUrl(grantTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View on Block Explorer
                      </a>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>



            {/* Current Permissions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Current Permissions
                </CardTitle>
                <CardDescription>
                  Permissions you have granted to applications
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-4">
                  <Button
                    onClick={loadUserPermissions}
                    disabled={isLoadingPermissions}
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

                {userPermissions.length > 0 ? (
                  <div className="space-y-3">
                    {userPermissions.map((permission) => (
                      <div
                        key={permission.id}
                        className="p-4 border rounded-lg"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm font-medium">
                              Permission ID: {permission.id}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              <strong>Application:</strong>
                              <span className="font-mono ml-1">
                                {permission.application.slice(0, 6)}...
                                {permission.application.slice(-4)}
                              </span>
                            </p>
                            <p className="text-sm text-muted-foreground">
                              <strong>Operation:</strong> {permission.operation}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              <strong>Files:</strong> {permission.files.length}{" "}
                              file{permission.files.length !== 1 ? "s" : ""}
                              {permission.files.length > 0 && (
                                <span className="ml-1">
                                  ({permission.files.join(", ")})
                                </span>
                              )}
                            </p>
                            {permission.prompt && (
                              <p className="text-sm text-muted-foreground">
                                <strong>Prompt:</strong>{" "}
                                {permission.prompt.length > 50
                                  ? `${permission.prompt.substring(0, 50)}...`
                                  : permission.prompt}
                              </p>
                            )}
                          </div>
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

            {/* Revoke Permission */}
            <Card>
              <CardHeader>
                <CardTitle>Revoke Permission</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="grant-id">
                      Grant ID (transaction hash or grant identifier):
                    </Label>
                    <Input
                      id="grant-id"
                      value={revokeInput}
                      onChange={(e) => setRevokeInput(e.target.value)}
                      placeholder="0x..."
                      className="font-mono"
                    />
                  </div>

                  <Button
                    onClick={handleRevokePermission}
                    disabled={!revokeInput.trim() || isRevoking}
                    variant="destructive"
                  >
                    {isRevoking && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Revoke Permission
                  </Button>

                  {revokeStatus && (
                    <Alert
                      variant={
                        revokeStatus.includes("Error")
                          ? "destructive"
                          : "default"
                      }
                    >
                      <AlertDescription>{revokeStatus}</AlertDescription>
                    </Alert>
                  )}
                </div>
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
                    Default: "{DEFAULT_ENCRYPTION_SEED}"
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
                  <Alert>
                    <Lock className="h-4 w-4" />
                    <AlertDescription>{encryptionStatus}</AlertDescription>
                  </Alert>
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
                        <Button size="sm" onClick={handleDownloadEncrypted}>
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
                                  "Encrypted hex"
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
                              🏢 App's IPFS
                            </Button>
                            <Button
                              size="sm"
                              variant={
                                ipfsMode === "user-managed"
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => setIpfsMode("user-managed")}
                              disabled={
                                isUploadingToChain ||
                                !process.env.NEXT_PUBLIC_PINATA_JWT
                              }
                            >
                              👤 My IPFS
                              {!process.env.NEXT_PUBLIC_PINATA_JWT &&
                                " (Not Configured)"}
                            </Button>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            {ipfsMode === "app-managed" ? (
                              <p>
                                ✅ Uses the app's Pinata account. No setup
                                required!
                              </p>
                            ) : process.env.NEXT_PUBLIC_PINATA_JWT ? (
                              <p>
                                ✅ Uses your personal Pinata account via
                                NEXT_PUBLIC_PINATA_JWT
                              </p>
                            ) : (
                              <p>
                                ⚠️ Add NEXT_PUBLIC_PINATA_JWT to .env.local to
                                use your own Pinata account
                              </p>
                            )}
                          </div>
                        </div>
                      )}
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

                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md">
                      <p className="text-sm text-muted-foreground mb-2">
                        This will upload your encrypted file using the selected
                        storage provider and register it on the Vana
                        DataRegistry. The Storage API provides a unified
                        interface for different storage backends. Once uploaded,
                        it will appear in your "Data Files" list above and you
                        can decrypt it to test the complete workflow.
                      </p>

                      {uploadToChainStatus && (
                        <Alert className="mt-3">
                          <Database className="h-4 w-4" />
                          <AlertDescription>
                            {uploadToChainStatus}
                          </AlertDescription>
                        </Alert>
                      )}

                      {newFileId && (
                        <div className="mt-3 p-2 bg-green-100 dark:bg-green-950/20 rounded border">
                          <p className="text-sm font-medium text-green-800 dark:text-green-200">
                            🎉 Success! Your file is now on the blockchain with
                            ID: <strong>{newFileId}</strong>
                          </p>
                          <p className="text-xs text-green-600 dark:text-green-300 mt-1">
                            Check your "Data Files" section above to see the new
                            file and try decrypting it!
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
                        <Button size="sm" onClick={handleDownloadDecrypted}>
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

                    <Alert>
                      <Check className="h-4 w-4" />
                      <AlertDescription>
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
                      </AlertDescription>
                    </Alert>
                  </div>
                )}

                {/* Protocol Functions */}
                <div className="mt-6 p-4 bg-muted/50 rounded-md">
                  <h4 className="font-medium mb-3">
                    🔐 Canonical Vana Protocol Functions:
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h5 className="font-medium text-sm mb-2">
                        Core Functions:
                      </h5>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>
                          • <code>generateEncryptionKey(wallet, seed?)</code>
                        </li>
                        <li>
                          • <code>encryptUserData(data, key)</code>
                        </li>
                        <li>
                          • <code>decryptUserData(encryptedData, key)</code>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium text-sm mb-2">
                        Storage Functions:
                      </h5>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>
                          • <code>StorageManager.upload()</code>
                        </li>
                        <li>
                          • <code>vana.data.getUserFiles()</code>
                        </li>
                        <li>
                          • <code>DataRegistry.addFile()</code>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Personal Server Computation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Personal Server Computation
                </CardTitle>
                <CardDescription>
                  Trigger a computation on your personal server using selected files.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label>File IDs (comma-separated)</Label>
                    <Input
                      value={personalFileIds}
                      onChange={e => setPersonalFileIds(e.target.value)}
                      placeholder="e.g., 12, 15, 28"
                      className="mb-2"
                    />
                  </div>
                  <div>
                    <Label>Operation</Label>
                    <Input
                      value={personalOp}
                      onChange={e => setPersonalOp(e.target.value)}
                      placeholder="llm_inference"
                      className="mb-2"
                    />
                  </div>
                  <div>
                    <Label>Prompt</Label>
                    <Input
                      value={personalPrompt}
                      onChange={e => setPersonalPrompt(e.target.value)}
                      placeholder="Analyze personality: {{data}}"
                      className="mb-2"
                    />
                  </div>
                  <Button
                    onClick={handlePersonalServerCall}
                    disabled={!personalFileIds.trim() || isPersonalLoading}
                  >
                    {isPersonalLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Database className="mr-2 h-4 w-4" />
                    )}
                    Run Computation on Personal Server
                  </Button>
                  {personalError && (
                    <Alert variant="destructive">
                      <AlertDescription>{personalError}</AlertDescription>
                    </Alert>
                  )}
                  {personalResult && (
                    <div className="mt-4 p-4 bg-muted rounded-lg">
                      <div className="mb-2">
                        <span className="font-medium">Prediction ID:</span> {personalResult.id}
                      </div>
                      <div className="mb-2">
                        <span className="font-medium">Status:</span> {personalResult.status}
                      </div>
                      <div className="mb-2">
                        <span className="font-medium">Get Result:</span>{" "}
                        <a href={personalResult.urls.get} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{personalResult.urls.get}</a>
                      </div>
                      <div className="mb-2">
                        <span className="font-medium">Cancel:</span>{" "}
                        <a href={personalResult.urls.cancel} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{personalResult.urls.cancel}</a>
                      </div>
                      {personalResult.output && (
                        <div className="mb-2">
                          <span className="font-medium">Output:</span>
                          <pre className="bg-background p-2 rounded text-xs overflow-x-auto mt-1">{JSON.stringify(personalResult.output, null, 2)}</pre>
                        </div>
                      )}
                      {personalResult.error && (
                        <div className="mb-2 text-red-600">
                          <span className="font-medium">Error:</span> {personalResult.error}
                        </div>
                      )}
                      <div className="mt-3">
                        <Button
                          onClick={handlePollStatus}
                          disabled={isPolling || personalResult.status === 'succeeded' || personalResult.status === 'failed' || personalResult.status === 'canceled'}
                          variant="outline"
                          size="sm"
                        >
                          {isPolling ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="mr-2 h-4 w-4" />
                          )}
                          {isPolling ? "Polling..." : "Poll Status"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
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
                            <p className="text-xs text-muted-foreground font-mono">
                              {contract.address.slice(0, 10)}...
                              {contract.address.slice(-8)}
                            </p>
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
                    } catch (error) {
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
