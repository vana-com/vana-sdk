import { vi } from "vitest";
import type {
  UseUserFilesReturn,
  ExtendedUserFile,
} from "@/hooks/useUserFiles";
import type { UsePermissionsReturn } from "@/hooks/usePermissions";
import type { GrantedPermission } from "@opendatalabs/vana-sdk/browser";

/**
 * Factory function to create a mock useUserFiles hook return object
 * @param overrides - Partial object to override default mock values
 * @returns Complete mock useUserFiles return object
 */
export function createMockUseUserFiles(
  overrides: Partial<UseUserFilesReturn> = {},
): UseUserFilesReturn {
  return {
    // State
    userFiles: [],
    isLoadingFiles: false,
    selectedFiles: [],
    decryptingFiles: new Set(),
    decryptedFiles: new Map(),
    fileDecryptErrors: new Map(),

    // Text upload state
    newTextData: "",
    isUploadingText: false,
    uploadResult: null,

    // Lookup state
    fileLookupId: "",
    isLookingUpFile: false,
    fileLookupStatus: "",

    // Actions
    loadUserFiles: vi.fn(),
    handleFileSelection: vi.fn(),
    handleDecryptFile: vi.fn(),
    handleDownloadDecryptedFile: vi.fn(),
    handleClearFileError: vi.fn(),
    handleLookupFile: vi.fn(),
    handleUploadText: vi.fn(),
    setUserFiles: vi.fn(),
    setSelectedFiles: vi.fn(),
    setNewTextData: vi.fn(),
    setFileLookupId: vi.fn(),

    // Apply overrides
    ...overrides,
  };
}

/**
 * Factory function to create a mock usePermissions hook return object
 * @param overrides - Partial object to override default mock values
 * @returns Complete mock usePermissions return object
 */
export function createMockUsePermissions(
  overrides: Partial<UsePermissionsReturn> = {},
): UsePermissionsReturn {
  return {
    // State
    userPermissions: [],
    isLoadingPermissions: false,
    isGranting: false,
    isRevoking: false,
    grantStatus: "",
    grantTxHash: "",
    grantPreview: null,
    showGrantPreview: false,

    // Permission lookup
    permissionLookupId: "",
    isLookingUpPermission: false,
    permissionLookupStatus: "",
    lookedUpPermission: null,

    // Actions
    loadUserPermissions: vi.fn(),
    handleGrantPermission: vi.fn(),
    handleRevokePermissionById: vi.fn(),
    handleLookupPermission: vi.fn(),
    onOpenGrant: vi.fn(),
    onCloseGrant: vi.fn(),
    handleConfirmGrant: vi.fn(),
    handleCancelGrant: vi.fn(),
    setGrantPreview: vi.fn(),
    setGrantStatus: vi.fn(),
    setGrantTxHash: vi.fn(),
    setUserPermissions: vi.fn(),
    setPermissionLookupId: vi.fn(),

    // Apply overrides
    ...overrides,
  };
}

/**
 * Factory function to create a mock useTrustedServers hook return object
 * @param overrides - Partial object to override default mock values
 * @returns Complete mock useTrustedServers return object
 */
export function createMockUseTrustedServers(
  overrides: Record<string, any> = {},
) {
  return {
    trustedServers: [],
    isLoadingTrustedServers: false,
    isTrustingServer: false,
    isUntrusting: false,
    isDiscoveringServer: false,
    trustServerError: "",
    trustedServerQueryMode: "auto" as const,
    serverId: "",
    serverUrl: "",
    loadUserTrustedServers: vi.fn(),
    handleTrustServer: vi.fn(),
    handleTrustServerGasless: vi.fn(),
    handleUntrustServer: vi.fn(),
    handleDiscoverHostedServer: vi.fn(),
    setServerId: vi.fn(),
    setServerUrl: vi.fn(),
    setTrustedServerQueryMode: vi.fn(),
    setTrustServerError: vi.fn(),

    // Apply overrides
    ...overrides,
  };
}

/**
 * Factory function to create a mock useVana provider return object
 * @param overrides - Partial object to override default mock values
 * @returns Complete mock useVana return object
 */
export function createMockUseVana(overrides: Record<string, any> = {}) {
  return {
    vana: {
      data: {
        getUserFiles: vi.fn(),
        decryptFile: vi.fn(),
        getFileById: vi.fn(),
        upload: vi.fn(),
      },
      permissions: {
        getUserPermissions: vi.fn(),
        createAndSign: vi.fn(),
        submitSignedGrant: vi.fn(),
        revoke: vi.fn(),
        getPermissionInfo: vi.fn(),
        getPermissionFileIds: vi.fn(),
      },
      schemas: {
        get: vi.fn(),
      },
    },
    isInitialized: true,
    error: null,
    applicationAddress: "0xapp123",

    // Apply overrides
    ...overrides,
  };
}

/**
 * Factory function to create a mock useAccount hook return object
 * @param overrides - Partial object to override default mock values
 * @returns Complete mock useAccount return object
 */
export function createMockUseAccount(overrides: Record<string, any> = {}) {
  return {
    address: "0x123" as `0x${string}`,
    isConnected: true,

    // Apply overrides
    ...overrides,
  };
}

/**
 * Factory function to create mock user files data
 * @param count - Number of mock files to create
 * @param overrides - Partial object to override default values for all files
 * @returns Array of mock ExtendedUserFile objects
 */
export function createMockUserFiles(
  count: number = 2,
  overrides: Partial<ExtendedUserFile> = {},
): ExtendedUserFile[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    url: `ipfs://file${index + 1}`,
    ownerAddress: "0x123" as `0x${string}`,
    addedAtBlock: BigInt(1000 + index),
    source: "discovered" as const,

    // Apply overrides
    ...overrides,
  }));
}

/**
 * Factory function to create mock permissions data
 * @param count - Number of mock permissions to create
 * @param overrides - Partial object to override default values for all permissions
 * @returns Array of mock GrantedPermission objects
 */
export function createMockPermissions(
  count: number = 2,
  overrides: Partial<GrantedPermission> = {},
): GrantedPermission[] {
  return Array.from({ length: count }, (_, index) => ({
    id: BigInt(index + 1),
    operation: index === 0 ? "llm_inference" : "data_access",
    files: [index + 1],
    parameters: index === 0 ? { prompt: "test prompt" } : {},
    grant: `ipfs://grant${index + 1}`,
    grantor: "0x123",
    grantee: "0x456",
    active: true,

    // Apply overrides
    ...overrides,
  }));
}

/**
 * Factory function to create mock trusted servers data
 * @param count - Number of mock servers to create
 * @param overrides - Partial object to override default values for all servers
 * @returns Array of mock trusted server objects
 */
export function createMockTrustedServers(
  count: number = 2,
  overrides: Record<string, any> = [],
) {
  return Array.from({ length: count }, (_, index) => ({
    id: `0xserver${index + 1}`,
    url: `https://server${index + 1}.example.com`,
    name: `Server ${index + 1}`,

    // Apply overrides
    ...overrides,
  }));
}

/**
 * Utility function to setup common mocks for hook testing
 * @param hookMocks - Object containing mock overrides for each hook
 * @returns Object containing all configured mocks
 */
export function setupHookMocks(
  hookMocks: {
    useUserFiles?: Partial<UseUserFilesReturn>;
    usePermissions?: Partial<UsePermissionsReturn>;
    useTrustedServers?: Record<string, any>;
    useVana?: Record<string, any>;
    useAccount?: Record<string, any>;
  } = {},
) {
  return {
    useUserFiles: createMockUseUserFiles(hookMocks.useUserFiles),
    usePermissions: createMockUsePermissions(hookMocks.usePermissions),
    useTrustedServers: createMockUseTrustedServers(hookMocks.useTrustedServers),
    useVana: createMockUseVana(hookMocks.useVana),
    useAccount: createMockUseAccount(hookMocks.useAccount),
  };
}
