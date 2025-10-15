import { vi } from "vitest";
import type { UseAccountReturnType } from "wagmi";
import type {
  UseUserFilesReturn,
  ExtendedUserFile,
} from "@/hooks/useUserFiles";
import type { UsePermissionsReturn } from "@/hooks/usePermissions";
import type { UseTrustedServersReturn } from "@/hooks/useTrustedServers";
import type {
  GrantedPermission,
  VanaInstance,
} from "@opendatalabs/vana-sdk/browser";
import type { VanaContextValue } from "@/providers/VanaProvider";
import type { SDKConfigContextValue } from "@/providers/SDKConfigProvider";

/**
 * Create a mock Vana SDK instance
 * Use this in test files' beforeEach blocks for explicit test setup
 *
 * @example
 * beforeEach(() => {
 *   const mockVana = createMockVanaSDK();
 *   vi.mock("@opendatalabs/vana-sdk/browser", () => ({
 *     Vana: vi.fn(() => mockVana)
 *   }));
 * });
 */
export function createMockVanaSDK() {
  return {
    permissions: {
      grant: vi.fn(),
      revoke: vi.fn(),
      getUserPermissions: vi.fn(),
    },
    data: {
      getUserFiles: vi.fn(),
      upload: vi.fn(),
      decryptFile: vi.fn(),
    },
    server: {
      trustServer: vi.fn(),
      getIdentity: vi.fn(),
    },
  };
}

/**
 * Create mock SDK module exports for vitest module mocking
 * Use this when mocking the entire @opendatalabs/vana-sdk/browser module
 *
 * @example
 * vi.mock("@opendatalabs/vana-sdk/browser", () => createMockVanaSDKModule());
 */
export function createMockVanaSDKModule() {
  return {
    Vana: vi.fn(createMockVanaSDK),
    mokshaTestnet: {
      id: 14800,
      name: "Moksha Testnet",
      nativeCurrency: { name: "VANA", symbol: "VANA", decimals: 18 },
      rpcUrls: {
        default: { http: ["https://rpc.moksha.vana.org"] },
      },
    },
    vanaSaturnTestnet: {
      id: 16900,
      name: "Vana Saturn Testnet",
      nativeCurrency: { name: "VANA", symbol: "VANA", decimals: 18 },
      rpcUrls: {
        default: { http: ["https://rpc.saturn.vana.org"] },
      },
    },
    SchemaValidator: vi.fn(),
    StorageManager: vi.fn(),
    PinataStorage: vi.fn(),
    convertIpfsUrl: vi.fn((url: string) =>
      url?.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/"),
    ),
    retrieveGrantFile: vi.fn(),
  };
}

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
    lastGrantedPermissionId: null,

    // Permission lookup
    permissionLookupId: "",
    isLookingUpPermission: false,
    permissionLookupStatus: "",
    lookedUpPermission: null,

    // Slow off-chain resolution state
    resolvedPermissions: new Map(),
    resolvingPermissions: new Set(),

    // Actions
    loadUserPermissions: vi.fn(),
    resolvePermissionDetails: vi.fn(),
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
  overrides: Partial<UseTrustedServersReturn> = {},
): UseTrustedServersReturn {
  return {
    trustedServers: [],
    isLoadingTrustedServers: false,
    isTrustingServer: false,
    isUntrusting: false,
    isDiscoveringServer: false,
    trustServerError: "",
    serverId: "",
    serverAddress: "",
    serverUrl: "",
    serverOwner: "",
    publicKey: "",
    loadUserTrustedServers: vi.fn(),
    handleTrustServer: vi.fn(),
    handleTrustServerGasless: vi.fn(),
    handleUntrustServer: vi.fn(),
    handleDiscoverHostedServer: vi.fn(),
    setServerId: vi.fn(),
    setServerAddress: vi.fn(),
    setServerUrl: vi.fn(),
    setServerOwner: vi.fn(),
    setPublicKey: vi.fn(),
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
export function createMockUseVana(
  overrides: Partial<VanaContextValue> = {},
): VanaContextValue {
  const defaultVana = {
    data: {
      getUserFiles: vi.fn(),
      decryptFile: vi.fn(),
      getFileById: vi.fn(),
      upload: vi.fn(),
      uploadFile: vi.fn(),
      deleteFile: vi.fn(),
      uploadText: vi.fn(),
      isStorageEnabled: vi.fn().mockReturnValue(true),
      hasRequiredStorage: true,
    },
    permissions: {
      getUserPermissions: vi.fn(),
      getUserPermissionGrantsOnChain: vi.fn(),
      createAndSign: vi.fn(),
      submitSignedGrant: vi.fn(),
      revoke: vi.fn(),
      getPermissionInfo: vi.fn(),
      getPermissionFileIds: vi.fn(),
      grant: vi.fn(),
      check: vi.fn(),
    },
    schemas: {
      get: vi.fn(),
      list: vi.fn(),
      validateData: vi.fn(),
    },
    server: {
      discoverHostedServer: vi.fn(),
      trustServer: vi.fn(),
      trustServerGasless: vi.fn(),
      untrustServer: vi.fn(),
      getUserTrustedServers: vi.fn(),
      submitTask: vi.fn(),
      pollTask: vi.fn(),
    },
    protocol: {
      getAllFileIds: vi.fn(),
      getUserFileIds: vi.fn(),
      getFileInfo: vi.fn(),
      hasPermission: vi.fn(),
      registerApplication: vi.fn(),
    },
    platform: {
      encrypt: vi.fn(),
      decrypt: vi.fn(),
      sign: vi.fn(),
      verify: vi.fn(),
    },
    // VanaCore properties
    isStorageEnabled: vi.fn().mockReturnValue(true),
    hasRequiredStorage: true,
    validateStorageRequired: vi.fn(),
    hasStorage: vi.fn().mockReturnValue(true),
    validateConfig: vi.fn(),
    chainId: 14800,
    walletClient: {
      account: { address: "0x123" },
      chain: { id: 14800 },
      transport: { type: "http" },
      mode: "rw" as const,
    },
    publicClient: {
      chain: { id: 14800 },
      transport: { type: "http" },
      mode: "public" as const,
    },
    relayerUrl: "https://relayer.example.com",
    subgraphUrl: "https://subgraph.example.com",
    rpcUrl: "https://rpc.example.com",
    encrypt: vi.fn(),
    decrypt: vi.fn(),
  };

  return {
    vana:
      overrides.vana === null
        ? null
        : ((overrides.vana ?? defaultVana) as unknown as VanaInstance),
    isInitialized: overrides.isInitialized ?? true,
    error: overrides.error ?? null,
    applicationAddress: overrides.applicationAddress ?? "0xapp123",
  };
}

/**
 * Factory function to create a mock useSDKConfig hook return object
 * @param overrides - Partial object to override default mock values
 * @returns Complete mock useSDKConfig return object
 */
export function createMockUseSDKConfig(
  overrides: Partial<SDKConfigContextValue> = {},
): SDKConfigContextValue {
  return {
    sdkConfig: {
      relayerUrl: "https://relayer.example.com",
      subgraphUrl: "https://subgraph.example.com",
      rpcUrl: "https://rpc.example.com",
      pinataJwt: "",
      pinataGateway: "https://gateway.pinata.cloud",
      defaultStorageProvider: "app-ipfs",
      googleDriveAccessToken: "",
      googleDriveRefreshToken: "",
      googleDriveExpiresAt: null,
      defaultPersonalServerUrl: "https://personal-server.example.com",
      readOnlyAddress: "",
      ...overrides.sdkConfig,
    },
    appConfig: {
      useGaslessTransactions: true,
      enableReadOnlyMode: false,
      ...overrides.appConfig,
    },
    effectiveAddress: overrides.effectiveAddress ?? "0x123",
    updateSdkConfig: overrides.updateSdkConfig ?? vi.fn(),
    updateAppConfig: overrides.updateAppConfig ?? vi.fn(),
    handleGoogleDriveAuth: overrides.handleGoogleDriveAuth ?? vi.fn(),
    handleGoogleDriveDisconnect:
      overrides.handleGoogleDriveDisconnect ?? vi.fn(),
  };
}

/**
 * Factory function to create a mock useAccount hook return object
 * @param overrides - Partial object to override default mock values
 * @returns Complete mock useAccount return object
 */
export function createMockUseAccount(
  overrides: Partial<UseAccountReturnType> = {},
): UseAccountReturnType {
  return {
    address: "0x123" as `0x${string}`,
    addresses: ["0x123" as `0x${string}`],
    chain: undefined,
    chainId: 14800,
    connector: undefined,
    isConnected: true,
    isConnecting: false,
    isDisconnected: false,
    isReconnecting: false,
    status: "connected",

    // Apply overrides
    ...overrides,
  } as UseAccountReturnType;
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
  overrides: Record<string, unknown> = {},
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
    useTrustedServers?: Partial<UseTrustedServersReturn>;
    useVana?: Partial<VanaContextValue>;
    useSDKConfig?: Partial<SDKConfigContextValue>;
    useAccount?: Partial<UseAccountReturnType>;
  } = {},
) {
  return {
    useUserFiles: createMockUseUserFiles(hookMocks.useUserFiles),
    usePermissions: createMockUsePermissions(hookMocks.usePermissions),
    useTrustedServers: createMockUseTrustedServers(hookMocks.useTrustedServers),
    useVana: createMockUseVana(hookMocks.useVana),
    useSDKConfig: createMockUseSDKConfig(hookMocks.useSDKConfig),
    useAccount: createMockUseAccount(hookMocks.useAccount),
  };
}
