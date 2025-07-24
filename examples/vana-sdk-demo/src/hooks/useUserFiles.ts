"use client";

import { useState, useCallback, useEffect } from "react";
import { UserFile } from "@opendatalabs/vana-sdk/browser";
import { useVana } from "@/providers/VanaProvider";
import { useAccount } from "wagmi";
import { createApiHandler } from "./utils";

export interface ExtendedUserFile extends UserFile {
  source?: "discovered" | "looked-up" | "uploaded";
}

export interface UseUserFilesReturn {
  // State
  userFiles: ExtendedUserFile[];
  isLoadingFiles: boolean;
  selectedFiles: number[];
  decryptingFiles: Set<number>;
  decryptedFiles: Map<number, string>;
  fileDecryptErrors: Map<number, string>;

  // Text upload state
  newTextData: string;
  isUploadingText: boolean;
  uploadResult: { fileId: number; transactionHash: string } | null;

  // Actions
  loadUserFiles: () => Promise<void>;
  handleFileSelection: (fileId: number, selected: boolean) => void;
  handleDecryptFile: (file: UserFile) => Promise<void>;
  handleDownloadDecryptedFile: (file: UserFile) => void;
  handleClearFileError: (fileId: number) => void;
  handleLookupFile: (fileId: string) => Promise<void>;
  handleUploadText: (
    serverAddress?: string,
    serverPublicKey?: string,
  ) => Promise<void>;
  setUserFiles: (
    files:
      | ExtendedUserFile[]
      | ((prev: ExtendedUserFile[]) => ExtendedUserFile[]),
  ) => void;
  setSelectedFiles: (files: number[] | ((prev: number[]) => number[])) => void;
  setNewTextData: (text: string) => void;

  // Lookup state
  fileLookupId: string;
  setFileLookupId: (id: string) => void;
  isLookingUpFile: boolean;
  fileLookupStatus: string;
}

export function useUserFiles(): UseUserFilesReturn {
  const { vana } = useVana();
  const { address } = useAccount();

  // User files state
  const [userFiles, setUserFiles] = useState<ExtendedUserFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);

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

  // File lookup state
  const [fileLookupId, setFileLookupId] = useState<string>("");
  const [isLookingUpFile, setIsLookingUpFile] = useState(false);
  const [fileLookupStatus, setFileLookupStatus] = useState<string>("");

  // Text upload state
  const [newTextData, setNewTextData] = useState<string>("");
  const [isUploadingText, setIsUploadingText] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    fileId: number;
    transactionHash: string;
  } | null>(null);

  const loadUserFiles = useCallback(async () => {
    if (!vana || !address) return;

    setIsLoadingFiles(true);
    try {
      const files = await vana.data.getUserFiles({ owner: address });
      const discoveredFiles = files.map((file: UserFile) => ({
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

  const handleFileSelection = useCallback(
    (fileId: number, selected: boolean) => {
      if (selected) {
        setSelectedFiles((prev) => [...prev, fileId]);
      } else {
        setSelectedFiles((prev) => prev.filter((id) => id !== fileId));
      }
    },
    [],
  );

  const handleDecryptFile = useCallback(
    async (file: UserFile) => {
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
        const decryptedBlob = await vana.data.decryptFile(file);
        const decryptedContent = await decryptedBlob.text();
        setDecryptedFiles((prev) =>
          new Map(prev).set(file.id, decryptedContent),
        );
      } catch (error) {
        console.error(`Failed to decrypt file ${file.id}:`, error);
        let errorMessage = "Failed to decrypt file. ";

        if (error instanceof Error) {
          if (error.message.includes("key is required")) {
            errorMessage +=
              "You don't have the encryption key for this file. Only files encrypted with your wallet can be decrypted.";
          } else if (error.message.includes("Failed to decrypt")) {
            errorMessage +=
              "Unable to decrypt the file. It may be corrupted or encrypted with a different key.";
          } else if (error.message.includes("Failed to fetch")) {
            errorMessage +=
              "Unable to download the encrypted file. It may have been deleted or moved.";
          } else {
            errorMessage += error.message;
          }
        }

        setFileDecryptErrors((prev) =>
          new Map(prev).set(file.id, errorMessage),
        );
      } finally {
        setDecryptingFiles((prev) => {
          const newSet = new Set(prev);
          newSet.delete(file.id);
          return newSet;
        });
      }
    },
    [vana],
  );

  const handleDownloadDecryptedFile = useCallback(
    (file: UserFile) => {
      const decryptedContent = decryptedFiles.get(file.id);
      if (decryptedContent) {
        const blob = new Blob([decryptedContent], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `decrypted-file-${file.id}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    },
    [decryptedFiles],
  );

  const handleClearFileError = useCallback((fileId: number) => {
    setFileDecryptErrors((prev) => {
      const newErrors = new Map(prev);
      newErrors.delete(fileId);
      return newErrors;
    });
  }, []);

  const handleLookupFile = useCallback(
    async (fileId: string) => {
      if (!vana || !fileId) return;

      const handler = createApiHandler(
        async () => {
          const fileIdNumber = Number(fileId);
          if (isNaN(fileIdNumber)) {
            throw new Error("Invalid file ID format");
          }

          return await vana.data.getFileById(fileIdNumber);
        },
        {
          setLoading: setIsLookingUpFile,
          setStatus: setFileLookupStatus,
          loadingMessage: "Looking up file...",
          successMessage: (file) =>
            `✅ Found file #${file.id} owned by ${file.ownerAddress}`,
          errorMessage: (error) => {
            if (error.message.includes("Invalid file ID")) {
              return "Invalid file ID format. Please enter a number.";
            } else if (error.message.includes("not found")) {
              return `File #${fileId} not found.`;
            } else {
              return error.message;
            }
          },
          onSuccess: (file) => {
            // Add to main files array if not already present
            setUserFiles((prev) => {
              const exists = prev.find((f) => f.id === file.id);
              if (exists) {
                return prev.map((f) =>
                  f.id === file.id
                    ? { ...file, source: "looked-up" as const }
                    : f,
                );
              } else {
                return [...prev, { ...file, source: "looked-up" as const }];
              }
            });
          },
        },
      );

      await handler();
    },
    [vana],
  );

  const handleUploadText = useCallback(
    async (serverAddress?: string, serverPublicKey?: string) => {
      if (!vana || !newTextData.trim()) return;

      const handler = createApiHandler(
        async () => {
          // Create a file from the text data
          const blob = new Blob([newTextData], { type: "text/plain" });
          const file = new File([blob], "text-data.txt", {
            type: "text/plain",
          });

          // Prepare file permissions if server public key is provided
          const permissions =
            serverPublicKey && serverAddress
              ? [
                  {
                    account: serverAddress as `0x${string}`, // Server's address
                    publicKey: serverPublicKey, // Server's public key
                  },
                ]
              : undefined;

          // Use the high-level upload method with permissions
          return await vana.data.upload({
            content: blob,
            filename: file.name,
            permissions,
          });
        },
        {
          setLoading: setIsUploadingText,
          loadingMessage: "Uploading text...",
          toastTitle: "Failed to upload text",
          onSuccess: (result) => {
            setUploadResult({
              fileId: result.fileId,
              transactionHash: result.transactionHash,
            });

            // Clear the text field after successful upload
            setNewTextData("");

            // Refresh the files list to include the new file
            setTimeout(() => {
              loadUserFiles();
            }, 2000);
          },
        },
      );

      await handler();
    },
    [vana, newTextData, loadUserFiles, address],
  );

  // Load user files when Vana is initialized
  useEffect(() => {
    if (vana && address) {
      loadUserFiles();
    }
  }, [vana, address, loadUserFiles]);

  // Clear selected files when wallet disconnects
  useEffect(() => {
    if (!address) {
      setUserFiles([]);
      setSelectedFiles([]);
      setDecryptedFiles(new Map());
      setFileDecryptErrors(new Map());
      setNewTextData("");
      setUploadResult(null);
    }
  }, [address]);

  return {
    // State
    userFiles,
    isLoadingFiles,
    selectedFiles,
    decryptingFiles,
    decryptedFiles,
    fileDecryptErrors,

    // Text upload state
    newTextData,
    isUploadingText,
    uploadResult,

    // Actions
    loadUserFiles,
    handleFileSelection,
    handleDecryptFile,
    handleDownloadDecryptedFile,
    handleClearFileError,
    handleLookupFile,
    handleUploadText,
    setUserFiles,
    setSelectedFiles,
    setNewTextData,

    // Lookup state
    fileLookupId,
    setFileLookupId,
    isLookingUpFile,
    fileLookupStatus,
  };
}
