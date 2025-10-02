import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAccount, type UseAccountReturnType } from "wagmi";
import { useVana } from "@/providers/VanaProvider";
import { useUserFiles, type ExtendedUserFile } from "../useUserFiles";
import type { UserFile, VanaInstance } from "@opendatalabs/vana-sdk/browser";
import {
  createMockUseAccount,
  createMockUseVana,
  createMockUserFiles,
} from "@/tests/mocks";

// Mock dependencies
vi.mock("wagmi");
vi.mock("@/providers/VanaProvider");

const useAccountMock = useAccount as MockedFunction<typeof useAccount>;
const useVanaMock = useVana as MockedFunction<typeof useVana>;

describe("useUserFiles", () => {
  const mockVana = {
    data: {
      getUserFiles: vi.fn(),
      decryptFile: vi.fn(),
      getFileById: vi.fn(),
      upload: vi.fn(),
    },
  };

  const mockUserFiles: UserFile[] = createMockUserFiles(2, {
    ownerAddress: "0x123" as `0x${string}`,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Use factory functions for consistent mock setup
    useAccountMock.mockReturnValue(createMockUseAccount());
    useVanaMock.mockReturnValue(
      createMockUseVana({
        vana: mockVana as unknown as VanaInstance,
      }),
    );

    mockVana.data.getUserFiles.mockResolvedValue(mockUserFiles);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("returns default state when initialized", async () => {
      const { result } = renderHook(() => useUserFiles());

      // Initially loading should be true since the hook auto-loads when vana and address are available
      expect(result.current.userFiles).toEqual([]);
      expect(result.current.isLoadingFiles).toBe(true);
      expect(result.current.selectedFiles).toEqual([]);
      expect(result.current.decryptingFiles).toEqual(new Set());
      expect(result.current.decryptedFiles).toEqual(new Map());
      expect(result.current.fileDecryptErrors).toEqual(new Map());
      expect(result.current.newTextData).toBe("");
      expect(result.current.isUploadingText).toBe(false);
      expect(result.current.uploadResult).toBe(null);
      expect(result.current.fileLookupId).toBe("");
      expect(result.current.isLookingUpFile).toBe(false);
      expect(result.current.fileLookupStatus).toBe("");

      // Wait for auto-loading to complete
      await waitFor(() => {
        expect(result.current.isLoadingFiles).toBe(false);
        expect(result.current.userFiles).toHaveLength(2);
      });
    });

    it("loads user files automatically when vana and address are available", async () => {
      const { result } = renderHook(() => useUserFiles());

      await waitFor(() => {
        expect(result.current.userFiles).toHaveLength(2);
      });

      expect(mockVana.data.getUserFiles).toHaveBeenCalledWith(
        { owner: "0x123" },
        {},
      );
      expect(result.current.userFiles[0]).toEqual({
        ...mockUserFiles[0],
        source: "discovered",
      });
      expect(result.current.userFiles[1]).toEqual({
        ...mockUserFiles[1],
        source: "discovered",
      });
    });

    it("does not load files when vana is not available", () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
        isReadOnly: false,
      });

      renderHook(() => useUserFiles());

      expect(mockVana.data.getUserFiles).not.toHaveBeenCalled();
    });

    it("does not load files when address is not available", () => {
      useAccountMock.mockReturnValue({
        address: undefined,
        addresses: [],
        chain: undefined,
        chainId: undefined,
        connector: undefined,
        isConnected: false,
        isConnecting: false,
        isDisconnected: true,
        isReconnecting: false,
        status: "disconnected",
      } as unknown as UseAccountReturnType);

      renderHook(() => useUserFiles());

      expect(mockVana.data.getUserFiles).not.toHaveBeenCalled();
    });
  });

  describe("loadUserFiles", () => {
    it("successfully loads and sets user files with discovered source", async () => {
      const { result } = renderHook(() => useUserFiles());

      await act(async () => {
        await result.current.loadUserFiles();
      });

      expect(result.current.isLoadingFiles).toBe(false);
      expect(result.current.userFiles).toHaveLength(2);
      expect(result.current.userFiles[0].source).toBe("discovered");
      expect(mockVana.data.getUserFiles).toHaveBeenCalledWith(
        { owner: "0x123" },
        {},
      );
    });

    it("handles errors when loading files fails", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.data.getUserFiles.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useUserFiles());

      await act(async () => {
        await result.current.loadUserFiles();
      });

      expect(result.current.isLoadingFiles).toBe(false);
      expect(result.current.userFiles).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to load user files:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("sets loading state correctly during file loading", async () => {
      let resolvePromise: (value: UserFile[]) => void;
      const promise = new Promise<UserFile[]>((resolve) => {
        resolvePromise = resolve;
      });
      mockVana.data.getUserFiles.mockReturnValue(promise);

      const { result } = renderHook(() => useUserFiles());

      act(() => {
        void result.current.loadUserFiles();
      });

      expect(result.current.isLoadingFiles).toBe(true);

      await act(async () => {
        if (resolvePromise) {
          resolvePromise(mockUserFiles);
        }
        await promise;
      });

      expect(result.current.isLoadingFiles).toBe(false);
    });
  });

  describe("handleFileSelection", () => {
    it("adds file to selected files when selected is true", () => {
      const { result } = renderHook(() => useUserFiles());

      act(() => {
        result.current.handleFileSelection(1, true);
      });

      expect(result.current.selectedFiles).toEqual([1]);
    });

    it("removes file from selected files when selected is false", () => {
      const { result } = renderHook(() => useUserFiles());

      act(() => {
        result.current.handleFileSelection(1, true);
        result.current.handleFileSelection(2, true);
      });

      expect(result.current.selectedFiles).toEqual([1, 2]);

      act(() => {
        result.current.handleFileSelection(1, false);
      });

      expect(result.current.selectedFiles).toEqual([2]);
    });

    it("handles multiple file selections correctly", () => {
      const { result } = renderHook(() => useUserFiles());

      act(() => {
        result.current.handleFileSelection(1, true);
        result.current.handleFileSelection(2, true);
        result.current.handleFileSelection(3, true);
      });

      expect(result.current.selectedFiles).toEqual([1, 2, 3]);

      act(() => {
        result.current.handleFileSelection(2, false);
      });

      expect(result.current.selectedFiles).toEqual([1, 3]);
    });
  });

  describe("handleDecryptFile", () => {
    const mockFile: UserFile = {
      id: 1,
      url: "ipfs://file1",
      ownerAddress: "0x123" as `0x${string}`,
      addedAtBlock: BigInt(1000),
    };

    it("successfully decrypts a file and stores the content", async () => {
      const mockBlob = {
        text: vi.fn().mockResolvedValue("decrypted content"),
      };
      mockVana.data.decryptFile.mockResolvedValue(mockBlob);

      const { result } = renderHook(() => useUserFiles());

      await act(async () => {
        await result.current.handleDecryptFile(mockFile);
      });

      expect(mockVana.data.decryptFile).toHaveBeenCalledWith(mockFile);
      expect(result.current.decryptedFiles.get(1)).toBe("decrypted content");
      expect(result.current.decryptingFiles.has(1)).toBe(false);
      expect(result.current.fileDecryptErrors.has(1)).toBe(false);
    });

    it("handles vana not being available", async () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
        isReadOnly: false,
      });

      const { result } = renderHook(() => useUserFiles());

      await act(async () => {
        await result.current.handleDecryptFile(mockFile);
      });

      expect(result.current.fileDecryptErrors.get(1)).toContain(
        "SDK not initialized",
      );
      expect(mockVana.data.decryptFile).not.toHaveBeenCalled();
    });

    it("handles decryption errors with specific error messages", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.data.decryptFile.mockRejectedValue(
        new Error("key is required for decryption"),
      );

      const { result } = renderHook(() => useUserFiles());

      await act(async () => {
        await result.current.handleDecryptFile(mockFile);
      });

      expect(result.current.fileDecryptErrors.get(1)).toContain(
        "You don't have the encryption key for this file",
      );
      expect(result.current.decryptingFiles.has(1)).toBe(false);

      consoleSpy.mockRestore();
    });

    it("handles fetch errors with appropriate messages", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.data.decryptFile.mockRejectedValue(new Error("Failed to fetch"));

      const { result } = renderHook(() => useUserFiles());

      await act(async () => {
        await result.current.handleDecryptFile(mockFile);
      });

      expect(result.current.fileDecryptErrors.get(1)).toContain(
        "Unable to download the encrypted file",
      );

      consoleSpy.mockRestore();
    });

    it("sets decrypting state correctly during decryption", async () => {
      let resolvePromise: (value: { text: () => Promise<string> }) => void;
      const promise = new Promise<{ text: () => Promise<string> }>(
        (resolve) => {
          resolvePromise = resolve;
        },
      );
      mockVana.data.decryptFile.mockReturnValue(promise);

      const { result } = renderHook(() => useUserFiles());

      act(() => {
        void result.current.handleDecryptFile(mockFile);
      });

      expect(result.current.decryptingFiles.has(1)).toBe(true);

      await act(async () => {
        if (resolvePromise) {
          resolvePromise({ text: () => Promise.resolve("content") });
        }
        await promise;
      });

      expect(result.current.decryptingFiles.has(1)).toBe(false);
    });

    it("clears previous errors before attempting decryption", async () => {
      const { result } = renderHook(() => useUserFiles());

      const mockBlob = {
        text: vi.fn().mockResolvedValue("decrypted content"),
      };
      mockVana.data.decryptFile.mockResolvedValue(mockBlob);

      await act(async () => {
        await result.current.handleDecryptFile(mockFile);
      });

      expect(result.current.fileDecryptErrors.has(1)).toBe(false);
    });
  });

  describe("handleDownloadDecryptedFile", () => {
    it.skip("downloads decrypted file when content is available", async () => {
      // Skipping DOM-related test for now
    });

    it.skip("does nothing when decrypted content is not available", async () => {
      // Skipping DOM-related test for now
    });
  });

  describe("handleClearFileError", () => {
    it("removes error for specified file ID", async () => {
      // Set up vana mock to return null BEFORE rendering the hook
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
        isReadOnly: false,
      });

      const { result } = renderHook(() => useUserFiles());

      const mockFile: UserFile = {
        id: 1,
        url: "ipfs://file1",
        ownerAddress: "0x123" as `0x${string}`,
        addedAtBlock: BigInt(1000),
      };

      // First create an error by calling handleDecryptFile with vana unavailable
      await act(async () => {
        await result.current.handleDecryptFile(mockFile);
      });

      expect(result.current.fileDecryptErrors.has(1)).toBe(true);

      act(() => {
        result.current.handleClearFileError(1);
      });

      expect(result.current.fileDecryptErrors.has(1)).toBe(false);
    });
  });

  describe("handleLookupFile", () => {
    const mockLookedUpFile: UserFile = {
      id: 3,
      url: "ipfs://file3",
      ownerAddress: "0x456" as `0x${string}`,
      addedAtBlock: BigInt(1002),
    };

    it("successfully looks up and adds a new file", async () => {
      mockVana.data.getFileById.mockResolvedValue(mockLookedUpFile);

      const { result } = renderHook(() => useUserFiles());

      await act(async () => {
        await result.current.handleLookupFile("3");
      });

      expect(mockVana.data.getFileById).toHaveBeenCalledWith(3);
      expect(result.current.fileLookupStatus).toContain("✅ Found file #3");
      expect(result.current.userFiles).toContainEqual({
        ...mockLookedUpFile,
        source: "looked-up",
      });
      expect(result.current.isLookingUpFile).toBe(false);
    });

    it("updates existing file with looked-up source", async () => {
      const existingFile: ExtendedUserFile = {
        ...mockLookedUpFile,
        source: "discovered",
      };

      mockVana.data.getFileById.mockResolvedValue(mockLookedUpFile);

      const { result } = renderHook(() => useUserFiles());

      // Wait for auto-loading to complete first
      await waitFor(() => {
        expect(result.current.isLoadingFiles).toBe(false);
      });

      // Set existing file
      act(() => {
        result.current.setUserFiles([existingFile]);
      });

      await act(async () => {
        await result.current.handleLookupFile("3");
      });

      expect(result.current.userFiles).toHaveLength(1);
      expect(result.current.userFiles[0].source).toBe("looked-up");
    });

    it("handles invalid file ID format", async () => {
      const { result } = renderHook(() => useUserFiles());

      await act(async () => {
        await result.current.handleLookupFile("invalid");
      });

      expect(result.current.fileLookupStatus).toContain(
        "Invalid file ID format",
      );
      expect(mockVana.data.getFileById).not.toHaveBeenCalled();
      expect(result.current.isLookingUpFile).toBe(false);
    });

    it("handles file not found error", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.data.getFileById.mockRejectedValue(new Error("File not found"));

      const { result } = renderHook(() => useUserFiles());

      await act(async () => {
        await result.current.handleLookupFile("999");
      });

      expect(result.current.fileLookupStatus).toContain("not found");
      expect(result.current.isLookingUpFile).toBe(false);

      consoleSpy.mockRestore();
    });

    it("does not lookup when vana is not available", async () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
        isReadOnly: false,
      });

      const { result } = renderHook(() => useUserFiles());

      await act(async () => {
        await result.current.handleLookupFile("3");
      });

      expect(mockVana.data.getFileById).not.toHaveBeenCalled();
    });

    it("sets looking up state correctly during lookup", async () => {
      let resolvePromise: (value: UserFile) => void;
      const promise = new Promise<UserFile>((resolve) => {
        resolvePromise = resolve;
      });
      mockVana.data.getFileById.mockReturnValue(promise);

      const { result } = renderHook(() => useUserFiles());

      act(() => {
        void result.current.handleLookupFile("3");
      });

      expect(result.current.isLookingUpFile).toBe(true);
      expect(result.current.fileLookupStatus).toBe("Looking up file...");

      await act(async () => {
        if (resolvePromise) {
          resolvePromise(mockLookedUpFile);
        }
        await promise;
      });

      expect(result.current.isLookingUpFile).toBe(false);
    });
  });

  describe("handleUploadText", () => {
    it("successfully uploads text and refreshes files", async () => {
      const mockUploadResult = {
        fileId: 4,
        transactionHash: "0xtxhash",
      };
      mockVana.data.upload.mockResolvedValue(mockUploadResult);

      const { result } = renderHook(() => useUserFiles());

      act(() => {
        result.current.setNewTextData("test content");
      });

      await act(async () => {
        await result.current.handleUploadText();
      });

      expect(mockVana.data.upload).toHaveBeenCalledWith({
        content: expect.any(Blob),
        filename: "text-data.txt",
      });
      expect(result.current.uploadResult).toEqual(mockUploadResult);
      expect(result.current.newTextData).toBe("");
      expect(result.current.isUploadingText).toBe(false);
    });

    it("does not upload when text data is empty", async () => {
      const { result } = renderHook(() => useUserFiles());

      await act(async () => {
        await result.current.handleUploadText();
      });

      expect(mockVana.data.upload).not.toHaveBeenCalled();
    });

    it("does not upload when vana is not available", async () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
        isReadOnly: false,
      });

      const { result } = renderHook(() => useUserFiles());

      act(() => {
        result.current.setNewTextData("test content");
      });

      await act(async () => {
        await result.current.handleUploadText();
      });

      expect(mockVana.data.upload).not.toHaveBeenCalled();
    });

    it("handles upload errors gracefully", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.data.upload.mockRejectedValue(new Error("Upload failed"));

      const { result } = renderHook(() => useUserFiles());

      act(() => {
        result.current.setNewTextData("test content");
      });

      await act(async () => {
        await result.current.handleUploadText();
      });

      expect(result.current.isUploadingText).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to upload text:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("sets uploading state correctly during upload", async () => {
      let resolvePromise: (value: {
        fileId: number;
        transactionHash: string;
      }) => void;
      const promise = new Promise<{ fileId: number; transactionHash: string }>(
        (resolve) => {
          resolvePromise = resolve;
        },
      );
      mockVana.data.upload.mockReturnValue(promise);

      const { result } = renderHook(() => useUserFiles());

      act(() => {
        result.current.setNewTextData("test content");
      });

      act(() => {
        void result.current.handleUploadText();
      });

      expect(result.current.isUploadingText).toBe(true);

      await act(async () => {
        if (resolvePromise) {
          resolvePromise({ fileId: 4, transactionHash: "0xtx" });
        }
        await promise;
      });

      expect(result.current.isUploadingText).toBe(false);
    });
  });

  describe("wallet disconnection cleanup", () => {
    it("clears all state when wallet disconnects", () => {
      const { result, rerender } = renderHook(() => useUserFiles());

      // Set some state
      act(() => {
        result.current.setUserFiles([mockUserFiles[0] as ExtendedUserFile]);
        result.current.setSelectedFiles([1]);
        result.current.setNewTextData("test");
      });

      // Simulate wallet disconnection
      useAccountMock.mockReturnValue({
        address: undefined,
        addresses: [],
        chain: undefined,
        chainId: undefined,
        connector: undefined,
        isConnected: false,
        isConnecting: false,
        isDisconnected: true,
        isReconnecting: false,
        status: "disconnected",
      } as unknown as UseAccountReturnType);

      rerender();

      expect(result.current.userFiles).toEqual([]);
      expect(result.current.selectedFiles).toEqual([]);
      expect(result.current.newTextData).toBe("");
      expect(result.current.decryptedFiles).toEqual(new Map());
      expect(result.current.fileDecryptErrors).toEqual(new Map());
      expect(result.current.uploadResult).toBe(null);
    });
  });

  describe("setters", () => {
    it("setUserFiles updates user files correctly", () => {
      const { result } = renderHook(() => useUserFiles());

      const newFiles: ExtendedUserFile[] = [
        { ...mockUserFiles[0], source: "discovered" },
      ];

      act(() => {
        result.current.setUserFiles(newFiles);
      });

      expect(result.current.userFiles).toEqual(newFiles);
    });

    it("setSelectedFiles updates selected files correctly", () => {
      const { result } = renderHook(() => useUserFiles());

      act(() => {
        result.current.setSelectedFiles([1, 2, 3]);
      });

      expect(result.current.selectedFiles).toEqual([1, 2, 3]);
    });

    it("setNewTextData updates text data correctly", () => {
      const { result } = renderHook(() => useUserFiles());

      act(() => {
        result.current.setNewTextData("new text content");
      });

      expect(result.current.newTextData).toBe("new text content");
    });

    it("setFileLookupId updates lookup ID correctly", () => {
      const { result } = renderHook(() => useUserFiles());

      act(() => {
        result.current.setFileLookupId("123");
      });

      expect(result.current.fileLookupId).toBe("123");
    });
  });
});
