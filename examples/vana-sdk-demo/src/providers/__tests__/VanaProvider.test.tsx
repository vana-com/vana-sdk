import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, MockedFunction } from 'vitest';
import { useAccount, useWalletClient, type UseAccountReturnType, type UseWalletClientReturnType } from 'wagmi';
import { VanaProvider, useVana } from '../VanaProvider';
import { Vana } from '@opendatalabs/vana-sdk/browser';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
  useWalletClient: vi.fn(),
}));

// Mock Vana SDK
vi.mock('@opendatalabs/vana-sdk/browser', () => ({
  Vana: vi.fn(),
  ServerProxyStorage: vi.fn().mockImplementation(() => ({})),
  PinataStorage: vi.fn().mockImplementation(() => ({})),
  GoogleDriveStorage: vi.fn().mockImplementation(() => ({
    findOrCreateFolder: vi.fn().mockResolvedValue('mock-folder-id'),
  })),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    origin: 'http://localhost:3000',
  },
  writable: true,
});

const useAccountMock = useAccount as MockedFunction<typeof useAccount>;
const useWalletClientMock = useWalletClient as MockedFunction<typeof useWalletClient>;
const VanaMock = vi.mocked(Vana);

// Helper functions to create complete mock objects
function createMockUseAccountReturn(overrides = {}): UseAccountReturnType<any> {
  return ({
    address: '0x123' as `0x${string}`,
    addresses: ['0x123' as `0x${string}`],
    chain: undefined,
    chainId: 14800,
    connector: undefined,
    isConnected: true,
    isConnecting: false,
    isDisconnected: false,
    isReconnecting: false,
    status: 'connected' as const,
    ...overrides,
  } as unknown) as UseAccountReturnType<any>;
}

function createMockUseWalletClientReturn(overrides = {}): UseWalletClientReturnType<any, any, any> {
  return ({
    data: null,
    error: null,
    isError: false,
    isPending: false,
    isLoading: false,
    isLoadingError: false,
    isRefetchError: false,
    isSuccess: true,
    isPlaceholderData: false,
    status: 'success' as const,
    dataUpdatedAt: Date.now(),
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: 'idle' as const,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isPaused: false,
    isStale: false,
    refetch: vi.fn(),
    queryKey: [],
    ...overrides,
  } as unknown) as UseWalletClientReturnType<any, any, any>;
}

// Test component that uses the VanaProvider context
function TestComponent() {
  const { vana, isInitialized, error, applicationAddress } = useVana();
  return (
    <div>
      <div data-testid="vana-status">
        {vana ? 'vana-initialized' : 'vana-null'}
      </div>
      <div data-testid="initialized-status">
        {isInitialized ? 'initialized' : 'not-initialized'}
      </div>
      <div data-testid="error-status">
        {error ? error.message : 'no-error'}
      </div>
      <div data-testid="app-address">
        {applicationAddress || 'no-address'}
      </div>
    </div>
  );
}

describe('VanaProvider', () => {
  const mockVanaInstance = {
    getConfig: vi.fn().mockReturnValue({ storage: { defaultProvider: 'app-ipfs' } }),
  };

  const mockWalletClient = {
    account: { address: '0x123' },
    chain: { id: 14800 },
  };

  const defaultConfig = {
    relayerUrl: 'http://localhost:3000',
    subgraphUrl: 'http://localhost:8000/subgraphs/name/vana',
    pinataJwt: undefined,
    pinataGateway: undefined,
    defaultStorageProvider: 'app-ipfs',
    googleDriveAccessToken: undefined,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    
    // Default mock implementations with complete types  
    useAccountMock.mockReturnValue(createMockUseAccountReturn({
      isConnected: false,
      isDisconnected: true,
      status: 'disconnected',
    }));
    
    useWalletClientMock.mockReturnValue(createMockUseWalletClientReturn());

    VanaMock.mockImplementation(() => mockVanaInstance as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws error when useVana is used outside VanaProvider', () => {
    // Mock console.error to prevent error output in tests
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => render(<TestComponent />)).toThrow(
      'useVana must be used within a VanaProvider'
    );
    
    consoleSpy.mockRestore();
  });

  it('renders children without initializing when wallet is not connected', () => {
    useAccountMock.mockReturnValue(createMockUseAccountReturn({
      address: undefined,
      isConnected: false,
      isDisconnected: true,
      status: 'disconnected',
    }));

    render(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>
    );

    expect(screen.getByTestId('vana-status')).toHaveTextContent('vana-null');
    expect(screen.getByTestId('initialized-status')).toHaveTextContent('not-initialized');
    expect(screen.getByTestId('error-status')).toHaveTextContent('no-error');
    expect(screen.getByTestId('app-address')).toHaveTextContent('no-address');
  });

  it('renders children without initializing when wallet client is not available', () => {
    useAccountMock.mockReturnValue(createMockUseAccountReturn({
      address: '0x123' as `0x${string}`,
      isConnected: true,
    }));
    
    useWalletClientMock.mockReturnValue(createMockUseWalletClientReturn({
      data: null,
    }));

    render(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>
    );

    expect(screen.getByTestId('vana-status')).toHaveTextContent('vana-null');
    expect(screen.getByTestId('initialized-status')).toHaveTextContent('not-initialized');
  });

  it('initializes Vana SDK when wallet is connected with default configuration', async () => {
    useAccountMock.mockReturnValue(createMockUseAccountReturn({
      address: '0x123' as `0x${string}`,
      isConnected: true,
    }));
    
    useWalletClientMock.mockReturnValue(createMockUseWalletClientReturn({
      data: mockWalletClient as any,
    }));

    // Mock successful application address fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { applicationAddress: '0xapp123' }
      }),
    });

    render(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('vana-status')).toHaveTextContent('vana-initialized');
    });

    expect(screen.getByTestId('initialized-status')).toHaveTextContent('initialized');
    expect(screen.getByTestId('error-status')).toHaveTextContent('no-error');
    expect(screen.getByTestId('app-address')).toHaveTextContent('0xapp123');

    // Verify Vana was instantiated with correct configuration
    expect(VanaMock).toHaveBeenCalledWith({
      walletClient: mockWalletClient,
      relayerCallbacks: expect.any(Object),
      subgraphUrl: defaultConfig.subgraphUrl,
      storage: {
        providers: {
          'app-ipfs': expect.any(Object),
        },
        defaultProvider: 'app-ipfs',
      },
    });
  });

  it('initializes with Pinata storage when pinataJwt is provided', async () => {
    const configWithPinata = {
      ...defaultConfig,
      pinataJwt: 'test-jwt',
      pinataGateway: 'https://test-gateway.com',
      defaultStorageProvider: 'user-ipfs',
    };

    useAccountMock.mockReturnValue(createMockUseAccountReturn({
      address: '0x123' as `0x${string}`,
      isConnected: true,
    }));
    
    useWalletClientMock.mockReturnValue(createMockUseWalletClientReturn({
      data: mockWalletClient as any,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { applicationAddress: '0xapp123' }
      }),
    });

    render(
      <VanaProvider config={configWithPinata}>
        <TestComponent />
      </VanaProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('vana-status')).toHaveTextContent('vana-initialized');
    });

    expect(VanaMock).toHaveBeenCalledWith({
      walletClient: mockWalletClient,
      relayerCallbacks: expect.any(Object),
      subgraphUrl: defaultConfig.subgraphUrl,
      storage: {
        providers: {
          'app-ipfs': expect.any(Object),
          'user-ipfs': expect.any(Object),
        },
        defaultProvider: 'user-ipfs',
      },
    });
  });

  it('initializes with Google Drive storage when access token is provided', async () => {
    const configWithGoogleDrive = {
      ...defaultConfig,
      googleDriveAccessToken: 'test-access-token',
      googleDriveRefreshToken: 'test-refresh-token',
      defaultStorageProvider: 'google-drive',
    };

    useAccountMock.mockReturnValue(createMockUseAccountReturn({
      address: '0x123' as `0x${string}`,
      isConnected: true,
    }));
    
    useWalletClientMock.mockReturnValue(createMockUseWalletClientReturn({
      data: mockWalletClient as any,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { applicationAddress: '0xapp123' }
      }),
    });

    render(
      <VanaProvider config={configWithGoogleDrive}>
        <TestComponent />
      </VanaProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('vana-status')).toHaveTextContent('vana-initialized');
    });

    expect(VanaMock).toHaveBeenCalledWith({
      walletClient: mockWalletClient,
      relayerCallbacks: expect.any(Object),
      subgraphUrl: defaultConfig.subgraphUrl,
      storage: {
        providers: {
          'app-ipfs': expect.any(Object),
          'google-drive': expect.any(Object),
        },
        defaultProvider: 'google-drive',
      },
    });
  });

  it('falls back to app-ipfs when user-ipfs is default but no pinataJwt provided', async () => {
    const configWithoutPinata = {
      ...defaultConfig,
      defaultStorageProvider: 'user-ipfs',
      pinataJwt: undefined,
    };

    useAccountMock.mockReturnValue(createMockUseAccountReturn({
      address: '0x123' as `0x${string}`,
      isConnected: true,
    }));
    
    useWalletClientMock.mockReturnValue(createMockUseWalletClientReturn({
      data: mockWalletClient as any,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { applicationAddress: '0xapp123' }
      }),
    });

    render(
      <VanaProvider config={configWithoutPinata}>
        <TestComponent />
      </VanaProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('vana-status')).toHaveTextContent('vana-initialized');
    });

    expect(VanaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: {
          providers: {
            'app-ipfs': expect.any(Object),
          },
          defaultProvider: 'app-ipfs', // Fallback from user-ipfs
        },
      })
    );
  });

  it('disables gasless transactions when useGaslessTransactions is false', async () => {
    useAccountMock.mockReturnValue(createMockUseAccountReturn({
      address: '0x123' as `0x${string}`,
      isConnected: true,
    }));
    
    useWalletClientMock.mockReturnValue(createMockUseWalletClientReturn({
      data: mockWalletClient as any,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { applicationAddress: '0xapp123' }
      }),
    });

    render(
      <VanaProvider config={defaultConfig} useGaslessTransactions={false}>
        <TestComponent />
      </VanaProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('vana-status')).toHaveTextContent('vana-initialized');
    });

    expect(VanaMock).toHaveBeenCalledWith({
      walletClient: mockWalletClient,
      relayerCallbacks: undefined, // Should be undefined when gasless is disabled
      subgraphUrl: defaultConfig.subgraphUrl,
      storage: {
        providers: {
          'app-ipfs': expect.any(Object),
        },
        defaultProvider: 'app-ipfs',
      },
    });
  });

  it('handles initialization errors gracefully', async () => {
    useAccountMock.mockReturnValue(createMockUseAccountReturn({
      address: '0x123' as `0x${string}`,
      isConnected: true,
    }));
    
    useWalletClientMock.mockReturnValue(createMockUseWalletClientReturn({
      data: mockWalletClient as any,
    }));

    // Mock Vana constructor to throw an error
    VanaMock.mockImplementation(() => {
      throw new Error('Vana initialization failed');
    });

    render(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-status')).toHaveTextContent('Vana initialization failed');
    });

    expect(screen.getByTestId('vana-status')).toHaveTextContent('vana-null');
    expect(screen.getByTestId('initialized-status')).toHaveTextContent('not-initialized');
  });

  it('handles application address fetch failure gracefully', async () => {
    useAccountMock.mockReturnValue(createMockUseAccountReturn({
      address: '0x123' as `0x${string}`,
      isConnected: true,
    }));
    
    useWalletClientMock.mockReturnValue(createMockUseWalletClientReturn({
      data: mockWalletClient as any,
    }));

    // Mock failed application address fetch
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('vana-status')).toHaveTextContent('vana-initialized');
    });

    // Should still initialize Vana but application address should remain empty
    expect(screen.getByTestId('initialized-status')).toHaveTextContent('initialized');
    expect(screen.getByTestId('error-status')).toHaveTextContent('no-error');
    expect(screen.getByTestId('app-address')).toHaveTextContent('no-address');
  });

  it('reinitializes when wallet connection changes', async () => {
    const { rerender } = render(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>
    );

    // Initially not connected
    expect(screen.getByTestId('vana-status')).toHaveTextContent('vana-null');

    // Connect wallet
    useAccountMock.mockReturnValue(createMockUseAccountReturn({
      address: '0x123' as `0x${string}`,
      isConnected: true,
    }));
    
    useWalletClientMock.mockReturnValue(createMockUseWalletClientReturn({
      data: mockWalletClient as any,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { applicationAddress: '0xapp123' }
      }),
    });

    rerender(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('vana-status')).toHaveTextContent('vana-initialized');
    });

    // Disconnect wallet
    useAccountMock.mockReturnValue(createMockUseAccountReturn({
      address: undefined,
      isConnected: false,
      isDisconnected: true,
      status: 'disconnected',
    }));
    
    useWalletClientMock.mockReturnValue(createMockUseWalletClientReturn({
      data: null,
    }));

    rerender(
      <VanaProvider config={defaultConfig}>
        <TestComponent />
      </VanaProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('vana-status')).toHaveTextContent('vana-null');
    });

    expect(screen.getByTestId('initialized-status')).toHaveTextContent('not-initialized');
  });

  it('handles Google Drive folder creation failure gracefully', async () => {
    const configWithGoogleDrive = {
      ...defaultConfig,
      googleDriveAccessToken: 'test-access-token',
      googleDriveRefreshToken: 'test-refresh-token',
      defaultStorageProvider: 'google-drive',
    };

    useAccountMock.mockReturnValue(createMockUseAccountReturn({
      address: '0x123' as `0x${string}`,
      isConnected: true,
    }));
    
    useWalletClientMock.mockReturnValue(createMockUseWalletClientReturn({
      data: mockWalletClient as any,
    }));

    // Mock Google Drive folder creation failure
    const { GoogleDriveStorage } = await import('@opendatalabs/vana-sdk/browser');
    const mockGoogleDriveInstance = {
      findOrCreateFolder: vi.fn().mockRejectedValue(new Error('Folder creation failed')),
    };
    (GoogleDriveStorage as any).mockImplementation(() => mockGoogleDriveInstance);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { applicationAddress: '0xapp123' }
      }),
    });

    render(
      <VanaProvider config={configWithGoogleDrive}>
        <TestComponent />
      </VanaProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('vana-status')).toHaveTextContent('vana-initialized');
    });

    // Should still initialize successfully even if folder creation fails
    expect(screen.getByTestId('initialized-status')).toHaveTextContent('initialized');
    expect(screen.getByTestId('error-status')).toHaveTextContent('no-error');
  });
});