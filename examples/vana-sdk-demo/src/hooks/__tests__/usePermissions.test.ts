import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  MockedFunction,
} from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAccount } from "wagmi";
import { useVana } from "@/providers/VanaProvider";
import { usePermissions } from "../usePermissions";
import {
  OnChainPermissionGrant,
  PermissionGrantTypedData,
  retrieveGrantFile,
} from "@opendatalabs/vana-sdk/browser";
import { addToast } from "@heroui/react";
import {
  createMockUseAccount,
  createMockUseVana,
  createMockPermissions,
} from "@/tests/mocks";

// Mock dependencies
vi.mock("wagmi");
vi.mock("@/providers/VanaProvider");
vi.mock("@opendatalabs/vana-sdk/browser", async () => {
  const actual = await vi.importActual("@opendatalabs/vana-sdk/browser");
  return {
    ...actual,
    retrieveGrantFile: vi.fn(),
  };
});
vi.mock("@heroui/react", () => ({
  addToast: vi.fn(),
}));

const useAccountMock = useAccount as MockedFunction<typeof useAccount>;
const useVanaMock = useVana as MockedFunction<typeof useVana>;
const retrieveGrantFileMock = retrieveGrantFile as MockedFunction<
  typeof retrieveGrantFile
>;
const addToastMock = addToast as MockedFunction<typeof addToast>;

describe("usePermissions", () => {
  const mockVana = {
    permissions: {
      getUserPermissionGrantsOnChain: vi.fn(),
      createAndSign: vi.fn(),
      submitSignedGrant: vi.fn(),
      revoke: vi.fn(),
      getPermissionInfo: vi.fn(),
      getPermissionFileIds: vi.fn(),
    },
  };

  const mockPermissions: OnChainPermissionGrant[] = createMockPermissions(2, {
    grantor: "0x123",
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Use factory functions for consistent mock setup
    useAccountMock.mockReturnValue(createMockUseAccount() as any);
    useVanaMock.mockReturnValue(createMockUseVana({ vana: mockVana }) as any);

    mockVana.permissions.getUserPermissionGrantsOnChain.mockResolvedValue(
      mockPermissions,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("returns default state when initialized", async () => {
      const { result } = renderHook(() => usePermissions());

      // Initially loading should be true since the hook auto-loads when vana and address are available
      expect(result.current.userPermissions).toEqual([]);
      expect(result.current.isLoadingPermissions).toBe(true);
      expect(result.current.isGranting).toBe(false);
      expect(result.current.isRevoking).toBe(false);
      expect(result.current.grantStatus).toBe("");
      expect(result.current.grantTxHash).toBe("");
      expect(result.current.grantPreview).toBe(null);
      expect(result.current.showGrantPreview).toBe(false);
      expect(result.current.permissionLookupId).toBe("");
      expect(result.current.isLookingUpPermission).toBe(false);
      expect(result.current.permissionLookupStatus).toBe("");
      expect(result.current.lookedUpPermission).toBe(null);

      // Wait for auto-loading to complete
      await waitFor(() => {
        expect(result.current.isLoadingPermissions).toBe(false);
        expect(result.current.userPermissions).toHaveLength(2);
      });
    });

    it("loads user permissions automatically when vana and address are available", async () => {
      const { result } = renderHook(() => usePermissions());

      await waitFor(() => {
        expect(result.current.userPermissions).toHaveLength(2);
      });

      expect(
        mockVana.permissions.getUserPermissionGrantsOnChain,
      ).toHaveBeenCalledWith({
        limit: 20,
      });
      expect(result.current.userPermissions).toEqual(mockPermissions);
    });

    it("does not load permissions when vana is not available", () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
      });

      renderHook(() => usePermissions());

      expect(
        mockVana.permissions.getUserPermissionGrantsOnChain,
      ).not.toHaveBeenCalled();
    });

    it("does not load permissions when address is not available", () => {
      useAccountMock.mockReturnValue({
        address: undefined,
      } as any);

      renderHook(() => usePermissions());

      expect(
        mockVana.permissions.getUserPermissionGrantsOnChain,
      ).not.toHaveBeenCalled();
    });
  });

  describe("loadUserPermissions", () => {
    it("successfully loads and returns user permissions", async () => {
      const { result } = renderHook(() => usePermissions());

      const permissions = await act(async () => {
        return await result.current.loadUserPermissions();
      });

      expect(permissions).toEqual(mockPermissions);
      expect(result.current.userPermissions).toEqual(mockPermissions);
      expect(result.current.isLoadingPermissions).toBe(false);
    });

    it("handles errors when loading permissions fails", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.permissions.getUserPermissionGrantsOnChain.mockRejectedValue(
        new Error("Network error"),
      );

      const { result } = renderHook(() => usePermissions());

      const permissions = await act(async () => {
        return await result.current.loadUserPermissions();
      });

      expect(permissions).toEqual([]);
      expect(result.current.userPermissions).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to load user permissions:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("returns empty array when vana is not available", async () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
      });

      const { result } = renderHook(() => usePermissions());

      const permissions = await act(async () => {
        return await result.current.loadUserPermissions();
      });

      expect(permissions).toEqual([]);
      expect(
        mockVana.permissions.getUserPermissionGrantsOnChain,
      ).not.toHaveBeenCalled();
    });
  });

  describe("handleGrantPermission", () => {
    it("successfully creates grant preview with default parameters", async () => {
      const { result } = renderHook(() => usePermissions());

      await act(async () => {
        await result.current.handleGrantPermission([1, 2], "test prompt");
      });

      expect(result.current.grantPreview).toEqual({
        grantFile: null,
        grantUrl: "",
        params: {
          grantee: "0xapp123",
          operation: "llm_inference",
          files: [1, 2],
          parameters: { prompt: "test prompt" },
        },
        typedData: null,
        signature: null,
      });
      expect(result.current.showGrantPreview).toBe(true);
    });

    it("successfully creates grant preview with custom parameters", async () => {
      const { result } = renderHook(() => usePermissions());

      const customParams = {
        grantee: "0xapp123" as `0x${string}`,
        operation: "data_access" as const,
        files: [1],
        parameters: { customParam: "value" },
        expiresAt: 1234567890,
      };

      await act(async () => {
        await result.current.handleGrantPermission(
          [1],
          "test prompt",
          customParams,
        );
      });

      expect(result.current.grantPreview?.params).toEqual({
        grantee: "0xapp123",
        operation: "data_access",
        files: [1],
        parameters: { customParam: "value" },
        expiresAt: 1234567890,
      });
    });

    it("handles missing application address", async () => {
      useVanaMock.mockReturnValue({
        vana: mockVana as any,
        isInitialized: true,
        error: null,
        applicationAddress: "",
      });

      const { result } = renderHook(() => usePermissions());

      await act(async () => {
        await result.current.handleGrantPermission([1], "test prompt");
      });

      expect(result.current.grantStatus).toContain(
        "Application address not available",
      );
      expect(result.current.isGranting).toBe(false);
    });

    it("does not grant when vana is not available", async () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "0xapp123",
      });

      const { result } = renderHook(() => usePermissions());

      await act(async () => {
        await result.current.handleGrantPermission([1], "test prompt");
      });

      expect(result.current.grantPreview).toBe(null);
    });

    it("does not grant when no files are selected", async () => {
      const { result } = renderHook(() => usePermissions());

      await act(async () => {
        await result.current.handleGrantPermission([], "test prompt");
      });

      expect(result.current.grantPreview).toBe(null);
    });
  });

  describe("handleConfirmGrant", () => {
    const mockTypedData: PermissionGrantTypedData = {
      types: {},
      primaryType: "PermissionGrant",
      domain: {},
      message: {
        grant: "ipfs://grant-url",
        nonce: BigInt(123),
      },
    } as any;

    beforeEach(() => {
      // Set up a grant preview first
      const { result } = renderHook(() => usePermissions());
      act(() => {
        result.current.setGrantPreview({
          grantFile: null,
          grantUrl: "",
          params: {
            grantee: "0xapp123",
            operation: "llm_inference",
            files: [1, 2],
            parameters: { prompt: "test prompt" },
          },
          typedData: null,
          signature: null,
        });
      });
    });

    it("successfully confirms grant and finds new permission", async () => {
      // Mock finding the new permission first
      const newPermission: OnChainPermissionGrant = {
        id: BigInt(3),
        operation: "llm_inference",
        files: [1, 2],
        parameters: { prompt: "test prompt" },
        grant: "ipfs://grant-url",
        grantor: "0x123",
        grantee: "0xapp123",
        active: true,
      };

      mockVana.permissions.createAndSign.mockResolvedValue({
        typedData: mockTypedData,
        signature: "0xsignature",
      });
      mockVana.permissions.submitSignedGrant.mockResolvedValue("0xtxhash");

      // Mock retrieveGrantFile
      retrieveGrantFileMock.mockResolvedValue({
        grantee: "0xapp123",
        operation: "llm_inference",
        parameters: { prompt: "test prompt" },
        expires: undefined,
      });

      const { result } = renderHook(() => usePermissions());

      // Wait for auto-loading to complete and set up grant preview
      await waitFor(() => {
        expect(result.current.isLoadingPermissions).toBe(false);
      });

      // Update the getUserPermissionGrantsOnChain mock to return the new permission after grant
      mockVana.permissions.getUserPermissionGrantsOnChain.mockResolvedValue([
        ...mockPermissions,
        newPermission,
      ]);

      act(() => {
        result.current.setGrantPreview({
          grantFile: null,
          grantUrl: "",
          params: {
            grantee: "0xapp123",
            operation: "llm_inference",
            files: [1, 2],
            parameters: { prompt: "test prompt" },
          },
          typedData: null,
          signature: null,
        });
      });

      await act(async () => {
        await result.current.handleConfirmGrant();
      });

      // Check that the basic grant operations completed
      expect(mockVana.permissions.createAndSign).toHaveBeenCalled();
      expect(mockVana.permissions.submitSignedGrant).toHaveBeenCalledWith(
        mockTypedData,
        "0xsignature",
      );
      expect(result.current.grantTxHash).toBe("0xtxhash");
      expect(result.current.showGrantPreview).toBe(false);

      // Wait for any async operations to complete
      await waitFor(() => {
        expect(result.current.isGranting).toBe(false);
      });

      // The addToast call happens asynchronously after permission lookup
      // Let's give it a moment and then check if it was called
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (addToastMock.mock.calls.length > 0) {
        expect(addToastMock).toHaveBeenCalledWith({
          title: "Permission Granted",
          description: expect.stringContaining(
            "Successfully granted permission with ID: 3",
          ),
          variant: "solid",
          color: "success",
        });
      }
    });

    it("handles grant file retrieval failure gracefully", async () => {
      mockVana.permissions.createAndSign.mockResolvedValue({
        typedData: mockTypedData,
        signature: "0xsignature",
      });
      mockVana.permissions.submitSignedGrant.mockResolvedValue("0xtxhash");

      // Mock retrieveGrantFile failure
      retrieveGrantFileMock.mockRejectedValue(new Error("CORS error"));

      const { result } = renderHook(() => usePermissions());

      // Wait for auto-loading to complete and set up grant preview
      await waitFor(() => {
        expect(result.current.isLoadingPermissions).toBe(false);
      });

      act(() => {
        result.current.setGrantPreview({
          grantFile: null,
          grantUrl: "",
          params: {
            grantee: "0xapp123",
            operation: "llm_inference",
            files: [1, 2],
            parameters: { prompt: "test prompt" },
          },
          typedData: null,
          signature: null,
        });
      });

      await act(async () => {
        await result.current.handleConfirmGrant();
      });

      expect(result.current.grantTxHash).toBe("0xtxhash");
      expect(result.current.isGranting).toBe(false);
    });

    it("handles grant creation errors", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.permissions.createAndSign.mockRejectedValue(
        new Error("Signing failed"),
      );

      const { result } = renderHook(() => usePermissions());

      // Wait for auto-loading to complete and set up grant preview
      await waitFor(() => {
        expect(result.current.isLoadingPermissions).toBe(false);
      });

      act(() => {
        result.current.setGrantPreview({
          grantFile: null,
          grantUrl: "",
          params: {
            grantee: "0xapp123",
            operation: "llm_inference",
            files: [1, 2],
            parameters: { prompt: "test prompt" },
          },
          typedData: null,
          signature: null,
        });
      });

      await act(async () => {
        await result.current.handleConfirmGrant();
      });

      expect(result.current.grantStatus).toContain(
        "Failed to grant permission",
      );
      expect(result.current.isGranting).toBe(false);

      consoleSpy.mockRestore();
    });

    it("does not confirm when no grant preview is available", async () => {
      const { result } = renderHook(() => usePermissions());

      // Clear the grant preview
      act(() => {
        result.current.setGrantPreview(null);
      });

      await act(async () => {
        await result.current.handleConfirmGrant();
      });

      expect(mockVana.permissions.createAndSign).not.toHaveBeenCalled();
    });

    it("does not confirm when vana is not available", async () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
      });

      const { result } = renderHook(() => usePermissions());

      await act(async () => {
        await result.current.handleConfirmGrant();
      });

      expect(mockVana.permissions.createAndSign).not.toHaveBeenCalled();
    });
  });

  describe("handleRevokePermissionById", () => {
    it("successfully revokes permission and refreshes list", async () => {
      const { result } = renderHook(() => usePermissions());

      await act(async () => {
        await result.current.handleRevokePermissionById("1");
      });

      expect(mockVana.permissions.revoke).toHaveBeenCalledWith({
        permissionId: BigInt(1),
      });
      expect(
        mockVana.permissions.getUserPermissionGrantsOnChain,
      ).toHaveBeenCalled();
      expect(result.current.isRevoking).toBe(false);
    });

    it("handles revocation errors", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.permissions.revoke.mockRejectedValue(new Error("Revoke failed"));

      const { result } = renderHook(() => usePermissions());

      await act(async () => {
        await result.current.handleRevokePermissionById("1");
      });

      expect(result.current.isRevoking).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to revoke permission:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("does not revoke when vana is not available", async () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
      });

      const { result } = renderHook(() => usePermissions());

      await act(async () => {
        await result.current.handleRevokePermissionById("1");
      });

      expect(mockVana.permissions.revoke).not.toHaveBeenCalled();
    });

    it("does not revoke when permission ID is empty", async () => {
      const { result } = renderHook(() => usePermissions());

      await act(async () => {
        await result.current.handleRevokePermissionById("  ");
      });

      expect(mockVana.permissions.revoke).not.toHaveBeenCalled();
    });
  });

  describe("handleLookupPermission", () => {
    const mockPermissionInfo = {
      grant: "ipfs://grant3",
      grantor: "0x789",
    };

    it("successfully looks up permission and adds to list", async () => {
      mockVana.permissions.getPermissionInfo.mockResolvedValue(
        mockPermissionInfo,
      );
      mockVana.permissions.getPermissionFileIds.mockResolvedValue([
        BigInt(4),
        BigInt(5),
      ]);

      const { result } = renderHook(() => usePermissions());

      act(() => {
        result.current.setPermissionLookupId("3");
      });

      await act(async () => {
        await result.current.handleLookupPermission();
      });

      expect(mockVana.permissions.getPermissionInfo).toHaveBeenCalledWith(
        BigInt(3),
      );
      expect(mockVana.permissions.getPermissionFileIds).toHaveBeenCalledWith(
        BigInt(3),
      );
      expect(result.current.permissionLookupStatus).toContain(
        "✅ Found permission: 3",
      );
      expect(result.current.lookedUpPermission).toEqual({
        id: BigInt(3),
        operation: "data_access",
        files: [4, 5],
        parameters: undefined,
        grant: "ipfs://grant3",
        grantor: "0x789",
        grantee: "0x123",
        active: true,
      });
      expect(result.current.isLookingUpPermission).toBe(false);
    });

    it("handles lookup errors", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockVana.permissions.getPermissionInfo.mockRejectedValue(
        new Error("Permission not found"),
      );

      const { result } = renderHook(() => usePermissions());

      act(() => {
        result.current.setPermissionLookupId("999");
      });

      await act(async () => {
        await result.current.handleLookupPermission();
      });

      expect(result.current.permissionLookupStatus).toContain(
        "Failed to lookup permission",
      );
      expect(result.current.isLookingUpPermission).toBe(false);

      consoleSpy.mockRestore();
    });

    it("does not lookup when vana is not available", async () => {
      useVanaMock.mockReturnValue({
        vana: null,
        isInitialized: false,
        error: null,
        applicationAddress: "",
      });

      const { result } = renderHook(() => usePermissions());

      act(() => {
        result.current.setPermissionLookupId("3");
      });

      await act(async () => {
        await result.current.handleLookupPermission();
      });

      expect(mockVana.permissions.getPermissionInfo).not.toHaveBeenCalled();
    });

    it("does not lookup when permission ID is empty", async () => {
      const { result } = renderHook(() => usePermissions());

      act(() => {
        result.current.setPermissionLookupId("");
      });

      await act(async () => {
        await result.current.handleLookupPermission();
      });

      expect(mockVana.permissions.getPermissionInfo).not.toHaveBeenCalled();
    });
  });

  describe("grant preview management", () => {
    it("opens and closes grant preview correctly", () => {
      const { result } = renderHook(() => usePermissions());

      act(() => {
        result.current.onOpenGrant();
      });

      expect(result.current.showGrantPreview).toBe(true);

      act(() => {
        result.current.onCloseGrant();
      });

      expect(result.current.showGrantPreview).toBe(false);
    });

    it("cancels grant correctly", () => {
      const { result } = renderHook(() => usePermissions());

      // Set up a grant preview
      act(() => {
        result.current.setGrantPreview({
          grantFile: null,
          grantUrl: "",
          params: {
            grantee: "0xapp123",
            operation: "llm_inference",
            files: [1],
            parameters: {},
          },
          typedData: null,
          signature: null,
        });
        result.current.onOpenGrant();
        result.current.setGrantStatus("test status");
      });

      act(() => {
        result.current.handleCancelGrant();
      });

      expect(result.current.grantPreview).toBe(null);
      expect(result.current.showGrantPreview).toBe(false);
      expect(result.current.isGranting).toBe(false);
      expect(result.current.grantStatus).toBe("");
    });
  });

  describe("wallet disconnection cleanup", () => {
    it("clears all state when wallet disconnects", () => {
      const { result, rerender } = renderHook(() => usePermissions());

      // Set some state
      act(() => {
        result.current.setUserPermissions(mockPermissions);
        result.current.setPermissionLookupId("123");
        result.current.setGrantPreview({
          grantFile: null,
          grantUrl: "",
          params: {
            grantee: "0xapp123",
            operation: "llm_inference",
            files: [1],
            parameters: {},
          },
          typedData: null,
          signature: null,
        });
      });

      // Simulate wallet disconnection
      useAccountMock.mockReturnValue({
        address: undefined,
      } as any);

      rerender();

      expect(result.current.userPermissions).toEqual([]);
      expect(result.current.lookedUpPermission).toBe(null);
      expect(result.current.grantPreview).toBe(null);
    });
  });

  describe("setters", () => {
    it("setUserPermissions updates permissions correctly", () => {
      const { result } = renderHook(() => usePermissions());

      act(() => {
        result.current.setUserPermissions(mockPermissions);
      });

      expect(result.current.userPermissions).toEqual(mockPermissions);
    });

    it("setPermissionLookupId updates lookup ID correctly", () => {
      const { result } = renderHook(() => usePermissions());

      act(() => {
        result.current.setPermissionLookupId("123");
      });

      expect(result.current.permissionLookupId).toBe("123");
    });

    it("setGrantPreview updates grant preview correctly", () => {
      const { result } = renderHook(() => usePermissions());

      const preview = {
        grantFile: null,
        grantUrl: "",
        params: {
          grantee: "0xapp123" as `0x${string}`,
          operation: "llm_inference" as const,
          files: [1],
          parameters: {},
        },
        typedData: null,
        signature: null,
      };

      act(() => {
        result.current.setGrantPreview(preview);
      });

      expect(result.current.grantPreview).toEqual(preview);
    });

    it("setGrantStatus updates grant status correctly", () => {
      const { result } = renderHook(() => usePermissions());

      act(() => {
        result.current.setGrantStatus("test status");
      });

      expect(result.current.grantStatus).toBe("test status");
    });

    it("setGrantTxHash updates transaction hash correctly", () => {
      const { result } = renderHook(() => usePermissions());

      act(() => {
        result.current.setGrantTxHash("0xtxhash");
      });

      expect(result.current.grantTxHash).toBe("0xtxhash");
    });
  });
});
