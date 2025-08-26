import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from "vitest";
import {
  useAccount,
  useWalletClient,
  type UseAccountReturnType,
  type UseWalletClientReturnType,
} from "wagmi";
import { VanaProvider, useVana } from "../VanaProvider";
import {
  Vana,
  type VanaInstance,
  type GoogleDriveStorage as _GoogleDriveStorage,
} from "@opendatalabs/vana-sdk/browser";

// Mock wagmi hooks
vi.mock("wagmi", () => ({
  useAccount: vi.fn(),
  useWalletClient: vi.fn(),
}));

// Mock Vana SDK
vi.mock("@opendatalabs/vana-sdk/browser", () => ({
  Vana: vi.fn(),
  CallbackStorage: vi.fn().mockImplementation(() => ({})),
  PinataStorage: vi.fn().mockImplementation(() => ({})),
  GoogleDriveStorage: vi.fn().mockImplementation(() => ({
    findOrCreateFolder: vi.fn().mockResolvedValue("mock-folder-id"),
  })),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location
Object.defineProperty(window, "location", {
  value: {
    origin: "http://localhost:3000",
  },
  writable: true,
});

const useAccountMock = useAccount as MockedFunction<typeof useAccount>;
const useWalletClientMock = useWalletClient as MockedFunction<
  typeof useWalletClient
>;
const VanaMock = vi.mocked(Vana);

// Helper functions to create complete mock objects
function createMockUseAccountReturn(
  overrides: Partial<UseAccountReturnType> = {},
): UseAccountReturnType {
  // wagmi's UseAccountReturnType has internal properties we can't easily mock
  // Using type assertion here is acceptable per Level 5 of TYPES_GUIDE
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
    status: "connected" as const,
    ...overrides,
  } as UseAccountReturnType; // TODO: Create proper fake implementation for wagmi hooks
}

function createMockUseWalletClientReturn(
  overrides?: Partial<UseWalletClientReturnType>,
): UseWalletClientReturnType {
  // Create a base mock that satisfies the minimal requirements
  // Following Level 4 from TYPES_GUIDE: satisfies operator for const assertions
  const base = {
    data: undefined,
    error: null,
    isError: false,
    isPending: false,
    isLoading: false,
    isLoadingError: false,
    isRefetchError: false,
    isSuccess: false,
    isPlaceholderData: false,
    status: "pending",
    dataUpdatedAt: Date.now(),
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: "idle",
    isFetched: false,
    isFetchedAfterMount: false,
    isFetching: false,
    isInitialLoading: false,
    isPaused: false,
    isStale: false,
    refetch: vi.fn(),
    queryKey: [],
  } as const;

  // Merge with overrides and cast - Level 5 from TYPES_GUIDE (only when necessary)
  // This is needed because wagmi's UseWalletClientReturnType has complex internal types
  // that would require recreating the entire React Query type structure
  return {
    ...base,
    ...overrides,
  } as UseWalletClientReturnType; // TODO: Consider creating a proper fake implementation
}

// Test component that uses the VanaProvider context
function TestComponent() {
  const { vana, isInitialized, error, applicationAddress } = useVana();
  return (
    <div>
      <div data-testid="vana-status">
        {vana ? "vana-initialized" : "vana-null"}
      </div>
      <div data-testid="initialized-status">
        {isInitialized ? "initialized" : "not-initialized"}
      </div>
      <div data-testid="error-status">{error ? error.message : "no-error"}</div>
      <div data-testid="app-address">{applicationAddress || "no-address"}</div>
    </div>
  );
}

describe("VanaProvider", () => {
  const mockVanaInstance = {
    getConfig: vi
      .fn()
      .mockReturnValue({ storage: { defaultProvider: "app-ipfs" } }),
    data: {
      getUserFiles: vi.fn(),
      decryptFile: vi.fn(),
      upload: vi.fn(),
    },
    permissions: {
      grant: vi.fn(),
      revoke: vi.fn(),
      getUserPermissions: vi.fn(),
    },
    server: {
      getIdentity: vi.fn(),
      trustServer: vi.fn(),
    },
    schemas: {
      get: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
  };

  // Following TYPES_GUIDE.md: For complex library types in test infrastructure,
  // we need to be pragmatic. WalletClient from viem has very complex typing.
  const createMockWalletClient = (): any => {
    // Return type is 'any' to avoid TypeScript checking intermediate types
    // This is acceptable per TYPES_GUIDE Level 5 for test mocks
    const mockClient = {
      account: {
        address: "0x123" as `0x${string}`,
        type: "json" as const,
      },
      chain: { id: 14800, name: "Test Chain" },
      transport: {},
      mode: "walletClient" as const,
      // Add minimal required methods for the test to pass
      request: vi.fn(),
      signMessage: vi.fn(),
      signTypedData: vi.fn(),
      writeContract: vi.fn(),
      getChainId: vi.fn().mockResolvedValue(14800),
      // These are required by the WalletClient type
      getAddresses: vi.fn(),
      requestAddresses: vi.fn(),
      getCallsStatus: vi.fn(),
      getCapabilities: vi.fn(),
      prepareAuthorization: vi.fn(),
      sendCalls: vi.fn(),
      writeContracts: vi.fn(),
      showCallsStatus: vi.fn(),
    };

    return mockClient;
  };

  const defaultConfig = {
    relayerUrl: "http://localhost:3000",
    subgraphUrl: "http://localhost:8000/subgraphs/name/vana",
    pinataJwt: undefined,
    pinataGateway: undefined,
    defaultStorageProvider: "app-ipfs",
    googleDriveAccessToken: undefined,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();

    // Default mock implementations with complete types
    useAccountMock.mockReturnValue(
      createMockUseAccountReturn({
        isConnected: false,
        isDisconnected: true,
        status: "disconnected",
      }),
    );

    useWalletClientMock.mockReturnValue(createMockUseWalletClientReturn());

    VanaMock.mockImplementation(
      () => mockVanaInstance as unknown as VanaInstance,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws error when useVana is used outside VanaProvider", () => {
    // Mock console.error to prevent error output in tests
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<TestComponent />)).toThrow(
      "useVana must be used within a VanaProvider",
    );

    consoleSpy.mockRestore();
  });

  it("renders children without initializing when wallet is not connected", () => {
    useAccountMock.mockReturnValue(
      createMockUseAccountReturn({
        address: undefined,
        isConnected: false,
        isDisconnected: true,
        status: "disconnected",
      }),
    );

    render(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>,
    );

    expect(screen.getByTestId("vana-status")).toHaveTextContent("vana-null");
    expect(screen.getByTestId("initialized-status")).toHaveTextContent(
      "not-initialized",
    );
    expect(screen.getByTestId("error-status")).toHaveTextContent("no-error");
    expect(screen.getByTestId("app-address")).toHaveTextContent("no-address");
  });

  it("renders children without initializing when wallet client is not available", () => {
    useAccountMock.mockReturnValue(
      createMockUseAccountReturn({
        address: "0x123" as `0x${string}`,
        isConnected: true,
      }),
    );

    useWalletClientMock.mockReturnValue(
      createMockUseWalletClientReturn({
        data: undefined,
      }),
    );

    render(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>,
    );

    expect(screen.getByTestId("vana-status")).toHaveTextContent("vana-null");
    expect(screen.getByTestId("initialized-status")).toHaveTextContent(
      "not-initialized",
    );
  });

  it("initializes Vana SDK when wallet is connected with default configuration", async () => {
    useAccountMock.mockReturnValue(
      createMockUseAccountReturn({
        address: "0x123" as `0x${string}`,
        isConnected: true,
      }),
    );

    // TypeScript can't infer that data is always defined when isSuccess is true
    // This is a limitation of wagmi's types. Using type assertion is acceptable per TYPES_GUIDE Level 5
    // We need to use 'any' here because wagmi's UseWalletClientReturnType expects 'data' can be undefined
    // but we know in our test it's always defined when isSuccess is true
    // Following TYPES_GUIDE.md Level 5: Type assertions are acceptable for test mocks
    // The wagmi UseWalletClientReturnType has complex typing that makes it difficult
    // to properly type the account property as non-undefined
    useWalletClientMock.mockReturnValue(
      createMockUseWalletClientReturn({
        data: createMockWalletClient(),
        isSuccess: true,
        status: "success" as const,
      }) as any, // Acceptable in test mocks per TYPES_GUIDE.md
    );

    // Mock successful application address fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { applicationAddress: "0xapp123" },
        }),
    });

    render(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("vana-status")).toHaveTextContent(
        "vana-initialized",
      );
    });

    expect(screen.getByTestId("initialized-status")).toHaveTextContent(
      "initialized",
    );
    expect(screen.getByTestId("error-status")).toHaveTextContent("no-error");
    expect(screen.getByTestId("app-address")).toHaveTextContent("0xapp123");

    // Verify Vana was instantiated with correct configuration
    expect(VanaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        walletClient: expect.any(Object),
        relayerCallbacks: expect.any(Object),
        downloadRelayer: expect.any(Object),
        subgraphUrl: defaultConfig.subgraphUrl,
        storage: expect.objectContaining({
          defaultProvider: "app-ipfs",
          providers: expect.objectContaining({
            "app-ipfs": expect.any(Object),
          }),
        }),
      }),
    );
  });

  it("initializes with Pinata storage when pinataJwt is provided", async () => {
    const configWithPinata = {
      ...defaultConfig,
      pinataJwt: "test-jwt",
      pinataGateway: "https://test-gateway.com",
      defaultStorageProvider: "user-ipfs",
    };

    useAccountMock.mockReturnValue(
      createMockUseAccountReturn({
        address: "0x123" as `0x${string}`,
        isConnected: true,
      }),
    );

    // TypeScript can't infer that data is always defined when isSuccess is true
    // This is a limitation of wagmi's types. Using type assertion is acceptable per TYPES_GUIDE Level 5
    // We need to use 'any' here because wagmi's UseWalletClientReturnType expects 'data' can be undefined
    // but we know in our test it's always defined when isSuccess is true
    // Following TYPES_GUIDE.md Level 5: Type assertions are acceptable for test mocks
    // The wagmi UseWalletClientReturnType has complex typing that makes it difficult
    // to properly type the account property as non-undefined
    useWalletClientMock.mockReturnValue(
      createMockUseWalletClientReturn({
        data: createMockWalletClient(),
        isSuccess: true,
        status: "success" as const,
      }) as any, // Acceptable in test mocks per TYPES_GUIDE.md
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { applicationAddress: "0xapp123" },
        }),
    });

    render(
      <VanaProvider config={configWithPinata}>
        <TestComponent />
      </VanaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("vana-status")).toHaveTextContent(
        "vana-initialized",
      );
    });

    expect(VanaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        walletClient: expect.any(Object),
        relayerCallbacks: expect.any(Object),
        downloadRelayer: expect.any(Object),
        subgraphUrl: defaultConfig.subgraphUrl,
        storage: expect.objectContaining({
          defaultProvider: "user-ipfs",
          providers: expect.objectContaining({
            "app-ipfs": expect.any(Object),
            "user-ipfs": expect.any(Object),
          }),
        }),
      }),
    );
  });

  it("initializes with Google Drive storage when access token is provided", async () => {
    const configWithGoogleDrive = {
      ...defaultConfig,
      googleDriveAccessToken: "test-access-token",
      googleDriveRefreshToken: "test-refresh-token",
      defaultStorageProvider: "google-drive",
    };

    useAccountMock.mockReturnValue(
      createMockUseAccountReturn({
        address: "0x123" as `0x${string}`,
        isConnected: true,
      }),
    );

    // TypeScript can't infer that data is always defined when isSuccess is true
    // This is a limitation of wagmi's types. Using type assertion is acceptable per TYPES_GUIDE Level 5
    // We need to use 'any' here because wagmi's UseWalletClientReturnType expects 'data' can be undefined
    // but we know in our test it's always defined when isSuccess is true
    // Following TYPES_GUIDE.md Level 5: Type assertions are acceptable for test mocks
    // The wagmi UseWalletClientReturnType has complex typing that makes it difficult
    // to properly type the account property as non-undefined
    useWalletClientMock.mockReturnValue(
      createMockUseWalletClientReturn({
        data: createMockWalletClient(),
        isSuccess: true,
        status: "success" as const,
      }) as any, // Acceptable in test mocks per TYPES_GUIDE.md
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { applicationAddress: "0xapp123" },
        }),
    });

    render(
      <VanaProvider config={configWithGoogleDrive}>
        <TestComponent />
      </VanaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("vana-status")).toHaveTextContent(
        "vana-initialized",
      );
    });

    expect(VanaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        walletClient: expect.any(Object),
        relayerCallbacks: expect.any(Object),
        downloadRelayer: expect.any(Object),
        subgraphUrl: defaultConfig.subgraphUrl,
        storage: expect.objectContaining({
          defaultProvider: "google-drive",
          providers: expect.objectContaining({
            "app-ipfs": expect.any(Object),
            "google-drive": expect.any(Object),
          }),
        }),
      }),
    );
  });

  it("falls back to app-ipfs when user-ipfs is default but no pinataJwt provided", async () => {
    const configWithoutPinata = {
      ...defaultConfig,
      defaultStorageProvider: "user-ipfs",
      pinataJwt: undefined,
    };

    useAccountMock.mockReturnValue(
      createMockUseAccountReturn({
        address: "0x123" as `0x${string}`,
        isConnected: true,
      }),
    );

    // TypeScript can't infer that data is always defined when isSuccess is true
    // This is a limitation of wagmi's types. Using type assertion is acceptable per TYPES_GUIDE Level 5
    // We need to use 'any' here because wagmi's UseWalletClientReturnType expects 'data' can be undefined
    // but we know in our test it's always defined when isSuccess is true
    // Following TYPES_GUIDE.md Level 5: Type assertions are acceptable for test mocks
    // The wagmi UseWalletClientReturnType has complex typing that makes it difficult
    // to properly type the account property as non-undefined
    useWalletClientMock.mockReturnValue(
      createMockUseWalletClientReturn({
        data: createMockWalletClient(),
        isSuccess: true,
        status: "success" as const,
      }) as any, // Acceptable in test mocks per TYPES_GUIDE.md
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { applicationAddress: "0xapp123" },
        }),
    });

    render(
      <VanaProvider config={configWithoutPinata}>
        <TestComponent />
      </VanaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("vana-status")).toHaveTextContent(
        "vana-initialized",
      );
    });

    expect(VanaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: {
          providers: {
            "app-ipfs": expect.any(Object),
          },
          defaultProvider: "app-ipfs", // Fallback from user-ipfs
        },
      }),
    );
  });

  it("disables gasless transactions when useGaslessTransactions is false", async () => {
    useAccountMock.mockReturnValue(
      createMockUseAccountReturn({
        address: "0x123" as `0x${string}`,
        isConnected: true,
      }),
    );

    // TypeScript can't infer that data is always defined when isSuccess is true
    // This is a limitation of wagmi's types. Using type assertion is acceptable per TYPES_GUIDE Level 5
    // We need to use 'any' here because wagmi's UseWalletClientReturnType expects 'data' can be undefined
    // but we know in our test it's always defined when isSuccess is true
    // Following TYPES_GUIDE.md Level 5: Type assertions are acceptable for test mocks
    // The wagmi UseWalletClientReturnType has complex typing that makes it difficult
    // to properly type the account property as non-undefined
    useWalletClientMock.mockReturnValue(
      createMockUseWalletClientReturn({
        data: createMockWalletClient(),
        isSuccess: true,
        status: "success" as const,
      }) as any, // Acceptable in test mocks per TYPES_GUIDE.md
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { applicationAddress: "0xapp123" },
        }),
    });

    render(
      <VanaProvider config={defaultConfig} useGaslessTransactions={false}>
        <TestComponent />
      </VanaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("vana-status")).toHaveTextContent(
        "vana-initialized",
      );
    });

    expect(VanaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        walletClient: expect.any(Object),
        relayerCallbacks: undefined, // Should be undefined when gasless is disabled
        downloadRelayer: expect.any(Object), // Download relayer is always provided
        subgraphUrl: defaultConfig.subgraphUrl,
        storage: expect.objectContaining({
          defaultProvider: "app-ipfs",
          providers: expect.objectContaining({
            "app-ipfs": expect.any(Object),
          }),
        }),
      }),
    );
  });

  it("handles initialization errors gracefully", async () => {
    useAccountMock.mockReturnValue(
      createMockUseAccountReturn({
        address: "0x123" as `0x${string}`,
        isConnected: true,
      }),
    );

    // TypeScript can't infer that data is always defined when isSuccess is true
    // This is a limitation of wagmi's types. Using type assertion is acceptable per TYPES_GUIDE Level 5
    // We need to use 'any' here because wagmi's UseWalletClientReturnType expects 'data' can be undefined
    // but we know in our test it's always defined when isSuccess is true
    // Following TYPES_GUIDE.md Level 5: Type assertions are acceptable for test mocks
    // The wagmi UseWalletClientReturnType has complex typing that makes it difficult
    // to properly type the account property as non-undefined
    useWalletClientMock.mockReturnValue(
      createMockUseWalletClientReturn({
        data: createMockWalletClient(),
        isSuccess: true,
        status: "success" as const,
      }) as any, // Acceptable in test mocks per TYPES_GUIDE.md
    );

    // Mock Vana constructor to throw an error
    VanaMock.mockImplementation(() => {
      throw new Error("Vana initialization failed");
    });

    render(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("error-status")).toHaveTextContent(
        "Vana initialization failed",
      );
    });

    expect(screen.getByTestId("vana-status")).toHaveTextContent("vana-null");
    expect(screen.getByTestId("initialized-status")).toHaveTextContent(
      "not-initialized",
    );
  });

  it("handles application address fetch failure gracefully", async () => {
    useAccountMock.mockReturnValue(
      createMockUseAccountReturn({
        address: "0x123" as `0x${string}`,
        isConnected: true,
      }),
    );

    // TypeScript can't infer that data is always defined when isSuccess is true
    // This is a limitation of wagmi's types. Using type assertion is acceptable per TYPES_GUIDE Level 5
    // We need to use 'any' here because wagmi's UseWalletClientReturnType expects 'data' can be undefined
    // but we know in our test it's always defined when isSuccess is true
    // Following TYPES_GUIDE.md Level 5: Type assertions are acceptable for test mocks
    // The wagmi UseWalletClientReturnType has complex typing that makes it difficult
    // to properly type the account property as non-undefined
    useWalletClientMock.mockReturnValue(
      createMockUseWalletClientReturn({
        data: createMockWalletClient(),
        isSuccess: true,
        status: "success" as const,
      }) as any, // Acceptable in test mocks per TYPES_GUIDE.md
    );

    // Mock failed application address fetch
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    render(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("vana-status")).toHaveTextContent(
        "vana-initialized",
      );
    });

    // Should still initialize Vana but application address should remain empty
    expect(screen.getByTestId("initialized-status")).toHaveTextContent(
      "initialized",
    );
    expect(screen.getByTestId("error-status")).toHaveTextContent("no-error");
    expect(screen.getByTestId("app-address")).toHaveTextContent("no-address");
  });

  it("reinitializes when wallet connection changes", async () => {
    const { rerender } = render(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>,
    );

    // Initially not connected
    expect(screen.getByTestId("vana-status")).toHaveTextContent("vana-null");

    // Connect wallet
    useAccountMock.mockReturnValue(
      createMockUseAccountReturn({
        address: "0x123" as `0x${string}`,
        isConnected: true,
      }),
    );

    // TypeScript can't infer that data is always defined when isSuccess is true
    // This is a limitation of wagmi's types. Using type assertion is acceptable per TYPES_GUIDE Level 5
    // We need to use 'any' here because wagmi's UseWalletClientReturnType expects 'data' can be undefined
    // but we know in our test it's always defined when isSuccess is true
    // Following TYPES_GUIDE.md Level 5: Type assertions are acceptable for test mocks
    // The wagmi UseWalletClientReturnType has complex typing that makes it difficult
    // to properly type the account property as non-undefined
    useWalletClientMock.mockReturnValue(
      createMockUseWalletClientReturn({
        data: createMockWalletClient(),
        isSuccess: true,
        status: "success" as const,
      }) as any, // Acceptable in test mocks per TYPES_GUIDE.md
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { applicationAddress: "0xapp123" },
        }),
    });

    rerender(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("vana-status")).toHaveTextContent(
        "vana-initialized",
      );
    });

    // Disconnect wallet
    useAccountMock.mockReturnValue(
      createMockUseAccountReturn({
        address: undefined,
        isConnected: false,
        isDisconnected: true,
        status: "disconnected",
      }),
    );

    useWalletClientMock.mockReturnValue(
      createMockUseWalletClientReturn({
        data: undefined,
      }),
    );

    rerender(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("vana-status")).toHaveTextContent("vana-null");
    });

    expect(screen.getByTestId("initialized-status")).toHaveTextContent(
      "not-initialized",
    );
  });

  it("handles Google Drive folder creation failure gracefully", async () => {
    const configWithGoogleDrive = {
      ...defaultConfig,
      googleDriveAccessToken: "test-access-token",
      googleDriveRefreshToken: "test-refresh-token",
      defaultStorageProvider: "google-drive",
    };

    useAccountMock.mockReturnValue(
      createMockUseAccountReturn({
        address: "0x123" as `0x${string}`,
        isConnected: true,
      }),
    );

    // TypeScript can't infer that data is always defined when isSuccess is true
    // This is a limitation of wagmi's types. Using type assertion is acceptable per TYPES_GUIDE Level 5
    // We need to use 'any' here because wagmi's UseWalletClientReturnType expects 'data' can be undefined
    // but we know in our test it's always defined when isSuccess is true
    // Following TYPES_GUIDE.md Level 5: Type assertions are acceptable for test mocks
    // The wagmi UseWalletClientReturnType has complex typing that makes it difficult
    // to properly type the account property as non-undefined
    useWalletClientMock.mockReturnValue(
      createMockUseWalletClientReturn({
        data: createMockWalletClient(),
        isSuccess: true,
        status: "success" as const,
      }) as any, // Acceptable in test mocks per TYPES_GUIDE.md
    );

    // Mock Google Drive folder creation failure
    const { GoogleDriveStorage: _GoogleDriveStorageImported } = await import(
      "@opendatalabs/vana-sdk/browser"
    );
    const mockGoogleDriveInstance = {
      findOrCreateFolder: vi
        .fn()
        .mockRejectedValue(new Error("Folder creation failed")),
    };
    vi.mocked(_GoogleDriveStorageImported).mockImplementation(
      () => mockGoogleDriveInstance as unknown as _GoogleDriveStorage,
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { applicationAddress: "0xapp123" },
        }),
    });

    render(
      <VanaProvider config={configWithGoogleDrive}>
        <TestComponent />
      </VanaProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("vana-status")).toHaveTextContent(
        "vana-initialized",
      );
    });

    // Should still initialize successfully even if folder creation fails
    expect(screen.getByTestId("initialized-status")).toHaveTextContent(
      "initialized",
    );
    expect(screen.getByTestId("error-status")).toHaveTextContent("no-error");
  });
});
