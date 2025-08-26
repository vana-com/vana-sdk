/**
 * Provides type-safe mock factories for testing Vana SDK components.
 *
 * @remarks
 * This module contains factory functions that create properly typed mock objects
 * for testing. These factories eliminate the need for `as any` assertions in tests
 * by providing complete implementations with sensible defaults.
 *
 * @category Testing
 * @module mockFactory
 * @internal
 */

import { vi } from "vitest";
import type {
  WalletClient,
  PublicClient,
  Account,
  Chain,
  Hash,
  Address,
  TransactionReceipt,
} from "../../types";
import type { ControllerContext } from "../../types/controller-context";
import type { VanaPlatformAdapter } from "../../platform/interface";
import type { StorageManager } from "../../storage/manager";
import { mockPlatformAdapter } from "../mocks/platformAdapter";
import { FakeWaitForTransactionEvents } from "../fakes/FakeWaitForTransactionEvents";
import { FakeStorageManager } from "../fakes/FakeStorageManager";

/**
 * Represents a deeply partial version of type T.
 *
 * @remarks
 * This utility type allows for partial overrides at any depth of an object structure,
 * making it easy to specify only the properties you want to customize in mocks.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Creates a mock Viem account for testing.
 *
 * @param overrides - Optional account properties to override the defaults
 * @returns A complete Account object with mock implementations
 *
 * @example
 * ```typescript
 * const account = createMockAccount({
 *   address: "0xCustomAddress" as Address
 * });
 * ```
 */
export function createMockAccount(overrides?: Partial<Account>): Account {
  return {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
    type: "local",
    signMessage: vi.fn().mockResolvedValue("0xsignature" as Hash),
    signTypedData: vi.fn().mockResolvedValue("0xsignature" as Hash),
    signTransaction: vi.fn(),
    ...overrides,
  } as Account;
}

/**
 * Creates a mock blockchain chain configuration.
 *
 * @param overrides - Optional chain properties to override the defaults
 * @returns A complete Chain object configured for Moksha Testnet by default
 *
 * @example
 * ```typescript
 * const chain = createMockChain({
 *   id: 1480,
 *   name: "Vana Mainnet"
 * });
 * ```
 */
export function createMockChain(overrides?: Partial<Chain>): Chain {
  return {
    id: 14800,
    name: "Moksha Testnet",
    nativeCurrency: {
      name: "VANA",
      symbol: "VANA",
      decimals: 18,
    },
    rpcUrls: {
      default: { http: ["https://rpc.moksha.vana.org"] },
      public: { http: ["https://rpc.moksha.vana.org"] },
    },
    blockExplorers: {
      default: { name: "Explorer", url: "https://explorer.moksha.vana.org" },
    },
    ...overrides,
  } as Chain;
}

/**
 * Creates a fully mocked Viem WalletClient for testing.
 *
 * @param overrides - Optional nested properties to override the defaults
 * @returns A complete WalletClient with all methods mocked
 *
 * @remarks
 * This factory creates a WalletClient with all required methods stubbed.
 * The client is configured with a local test account and Moksha Testnet by default.
 * All async methods return sensible default values.
 *
 * @example
 * ```typescript
 * const wallet = createTypedMockWalletClient({
 *   account: { address: "0xCustom" as Address },
 *   chain: { id: 1480 }
 * });
 * ```
 */
export function createTypedMockWalletClient(
  overrides?: DeepPartial<WalletClient>,
): WalletClient {
  const account = overrides?.account || createMockAccount();
  const chain = overrides?.chain || createMockChain();

  return {
    account,
    chain,
    mode: "wallet",
    transport: {} as PublicClient["transport"], // Transport is complex and rarely used in tests
    key: "wallet",
    name: "Mock Wallet Client",
    pollingInterval: 4000,
    request: vi.fn(),
    type: "walletClient",
    uid: "mock-wallet-uid",
    batch: undefined,
    cacheTime: 0,
    ccipRead: undefined,
    getAddresses: vi.fn().mockResolvedValue([account.address]),
    getChainId: vi.fn().mockResolvedValue(chain.id),
    signMessage: vi.fn().mockResolvedValue("0xsignature" as Hash),
    signTypedData: vi.fn().mockResolvedValue("0xsignature" as Hash),
    signTransaction: vi.fn(),
    writeContract: vi.fn().mockResolvedValue("0xtxhash" as Hash),
    deployContract: vi.fn(),
    sendRawTransaction: vi.fn(),
    sendTransaction: vi.fn(),
    prepareTransactionRequest: vi.fn(),
    switchChain: vi.fn(),
    watchAsset: vi.fn(),
    addChain: vi.fn(),
    getPermissions: vi.fn(),
    requestAddresses: vi.fn(),
    requestPermissions: vi.fn(),
    watchEvent: vi.fn(),
    watchContractEvent: vi.fn(),
    extend: vi.fn(),
    ...overrides,
  } as unknown as WalletClient;
}

/**
 * Creates a fully mocked Viem PublicClient for testing.
 *
 * @param overrides - Optional nested properties to override the defaults
 * @returns A complete PublicClient with all methods mocked
 *
 * @remarks
 * This factory creates a PublicClient with all required RPC methods stubbed.
 * The client returns sensible default values for blockchain queries.
 * Transaction receipts are configured to return success by default.
 *
 * @example
 * ```typescript
 * const client = createTypedMockPublicClient({
 *   chain: { id: 1480 }
 * });
 * ```
 */
export function createTypedMockPublicClient(
  overrides?: DeepPartial<PublicClient>,
): PublicClient {
  const chain = overrides?.chain || createMockChain();

  const defaultReceipt = {
    transactionHash: "0xtxhash" as Hash,
    blockNumber: 12345n,
    blockHash: "0xblockhash" as Hash,
    from: "0xfrom" as Address,
    to: "0xto" as Address,
    cumulativeGasUsed: 100000n,
    gasUsed: 50000n,
    logs: [],
    logsBloom: "0x0" as `0x${string}`,
    status: "success",
    type: "eip1559",
    contractAddress: undefined,
    effectiveGasPrice: 1000000000n,
  } as TransactionReceipt;

  return {
    chain,
    mode: "publicClient",
    transport: {} as WalletClient["transport"],
    key: "public",
    name: "Mock Public Client",
    pollingInterval: 4000,
    request: vi.fn(),
    type: "publicClient",
    uid: "mock-public-uid",
    batch: undefined,
    cacheTime: 0,
    ccipRead: undefined,
    getChainId: vi.fn().mockResolvedValue(chain.id),
    readContract: vi.fn().mockResolvedValue(undefined),
    multicall: vi.fn().mockResolvedValue([]),
    getBalance: vi.fn(),
    getBlock: vi.fn(),
    getBlockNumber: vi.fn(),
    getTransaction: vi.fn(),
    getTransactionReceipt: vi.fn().mockResolvedValue(defaultReceipt),
    waitForTransactionReceipt: vi.fn().mockResolvedValue(defaultReceipt),
    estimateGas: vi.fn(),
    estimateContractGas: vi.fn(),
    estimateFeesPerGas: vi.fn(),
    estimateMaxPriorityFeePerGas: vi.fn(),
    getCode: vi.fn(),
    getContractEvents: vi.fn(),
    getFeeHistory: vi.fn(),
    getFilterChanges: vi.fn(),
    getFilterLogs: vi.fn(),
    getLogs: vi.fn(),
    getProof: vi.fn(),
    getStorageAt: vi.fn(),
    getTransactionConfirmations: vi.fn(),
    getTransactionCount: vi.fn(),
    uninstallFilter: vi.fn(),
    watchBlockNumber: vi.fn(),
    watchBlocks: vi.fn(),
    watchContractEvent: vi.fn(),
    watchEvent: vi.fn(),
    createEventFilter: vi.fn(),
    createBlockFilter: vi.fn(),
    createContractEventFilter: vi.fn(),
    createPendingTransactionFilter: vi.fn(),
    call: vi.fn(),
    extend: vi.fn(),
    ...overrides,
  } as unknown as PublicClient;
}

/**
 * Creates a mock StorageManager using the FakeStorageManager implementation.
 *
 * @param overrides - Optional properties to override on the fake instance
 * @returns A complete StorageManager implementation for testing
 *
 * @remarks
 * This factory uses the FakeStorageManager class instead of complex mocking,
 * providing a simpler and more maintainable testing approach.
 * The fake maintains in-memory state and tracks method calls.
 *
 * @example
 * ```typescript
 * const storage = createTypedMockStorageManager();
 * const result = await storage.upload(blob, "test.txt");
 * ```
 */
export function createTypedMockStorageManager(
  overrides?: Partial<StorageManager>,
): StorageManager {
  const fake = new FakeStorageManager();

  // Apply any overrides
  if (overrides) {
    Object.assign(fake, overrides);
  }

  return fake as unknown as StorageManager;
}

/**
 * Creates a complete mock ControllerContext for testing controllers.
 *
 * @param overrides - Optional nested properties to override the defaults
 * @returns A ControllerContext with guaranteed waitForTransactionEvents method
 *
 * @remarks
 * This factory creates a complete context object with all required dependencies:
 * - WalletClient and PublicClient for blockchain interactions
 * - StorageManager for file operations
 * - Platform adapter for encryption
 * - waitForTransactionEvents using FakeWaitForTransactionEvents
 *
 * The returned context guarantees that waitForTransactionEvents is always present,
 * eliminating the need for conditional checks in tests.
 *
 * @example
 * ```typescript
 * const context = createMockControllerContext({
 *   walletClient: { account: { address: "0xCustom" as Address } }
 * });
 * const controller = new DataController(context);
 * ```
 */
export function createMockControllerContext(
  overrides?: DeepPartial<ControllerContext>,
): ControllerContext &
  Required<Pick<ControllerContext, "waitForTransactionEvents">> {
  const walletClient = createTypedMockWalletClient(overrides?.walletClient);
  const publicClient = createTypedMockPublicClient(overrides?.publicClient);

  // Create a fake instance for waitForTransactionEvents
  const fakeWaitForTransactionEvents = new FakeWaitForTransactionEvents();

  // Set default response
  fakeWaitForTransactionEvents.setDefaultResponse({
    hash: "0xtxhash" as Hash,
    from: "0xfrom" as Address,
    contract: "DataRegistry",
    fn: "addFile",
    expectedEvents: {},
    allEvents: [],
    hasExpectedEvents: true,
  });

  // Create the mock function that directly calls the fake
  // This ensures the fake's state changes are always reflected
  const mockWaitForTransactionEvents = vi.fn(async (txOrHash: unknown) => {
    // Type guard to ensure proper typing following TYPES_GUIDE
    let txParam: string | { hash: Hash };
    if (typeof txOrHash === "string") {
      txParam = txOrHash;
    } else if (
      typeof txOrHash === "object" &&
      txOrHash !== null &&
      "hash" in txOrHash
    ) {
      // Cast to TransactionResultLike which has hash: Hash
      txParam = { hash: (txOrHash as { hash: string }).hash as Hash };
    } else {
      txParam = String(txOrHash);
    }

    const hashInfo =
      typeof txParam === "string"
        ? `hash: ${txParam}`
        : `TransactionResult with hash: ${txParam.hash}`;
    console.log(`[Mock] waitForTransactionEvents called with:`, hashInfo);
    const result = await fakeWaitForTransactionEvents.wait(txParam);
    console.log(
      `[Mock] returning result with expectedEvents:`,
      Object.keys(result.expectedEvents),
    );
    return result;
  });

  // Build the context with guaranteed waitForTransactionEvents
  const context = {
    walletClient,
    publicClient,
    applicationClient: walletClient,
    platform: overrides?.platform || mockPlatformAdapter,
    storageManager:
      overrides?.storageManager || createTypedMockStorageManager(),
    subgraphUrl: overrides?.subgraphUrl || "https://subgraph.test.com",
    defaultPersonalServerUrl: overrides?.defaultPersonalServerUrl,
    relayerCallbacks: overrides?.relayerCallbacks || undefined,
    // Spread overrides but exclude waitForTransactionEvents if it's undefined
    ...(overrides
      ? Object.fromEntries(
          Object.entries(overrides).filter(
            ([key, value]) =>
              key !== "waitForTransactionEvents" || value !== undefined,
          ),
        )
      : {}),
    // Always include waitForTransactionEvents
    waitForTransactionEvents:
      overrides?.waitForTransactionEvents || mockWaitForTransactionEvents,
  };

  // Attach the fake instance to the mock for test access
  (
    mockWaitForTransactionEvents as unknown as {
      __fake: FakeWaitForTransactionEvents;
    }
  ).__fake = fakeWaitForTransactionEvents;

  return context as ControllerContext &
    Required<Pick<ControllerContext, "waitForTransactionEvents">>;
}

/**
 * Creates a mock VanaPlatformAdapter for testing.
 *
 * @param overrides - Optional properties to override the default mock adapter
 * @returns A complete VanaPlatformAdapter with encryption and key management methods
 *
 * @example
 * ```typescript
 * const platform = createMockPlatform({
 *   generateKeyPair: vi.fn().mockResolvedValue({ publicKey: "test", privateKey: "test" })
 * });
 * ```
 */
export function createMockPlatform(
  overrides?: Partial<VanaPlatformAdapter>,
): VanaPlatformAdapter {
  return {
    ...mockPlatformAdapter,
    ...overrides,
  };
}

/**
 * Creates a typed mock function compatible with vitest.
 *
 * @returns A vi.fn() mock with proper typing
 *
 * @example
 * ```typescript
 * const mockCallback = createMockFn<(value: string) => void>();
 * mockCallback.mockImplementation((value) => console.log(value));
 * ```
 */
export function createMockFn<
  T extends (...args: unknown[]) => unknown,
>(): ReturnType<typeof vi.fn<T>> {
  return vi.fn<T>();
}

/**
 * Safely casts a partial mock to the full type.
 *
 * @param value - Partial object to cast to full type
 * @returns The value cast to type T
 *
 * @remarks
 * Use this as a last resort when the mock factory doesn't cover all properties.
 * This is a type assertion helper that should be used sparingly.
 *
 * @example
 * ```typescript
 * const partialMock = { someProperty: 'value' };
 * const fullMock = safeCast<CompleteType>(partialMock);
 * ```
 */
export function safeCast<T>(value: DeepPartial<T>): T {
  return value as T;
}

/**
 * Creates a type-safe mock that only requires specified properties.
 *
 * @param partial - Partial object with only the properties you need
 * @returns The partial object cast to the full type T
 *
 * @remarks
 * This is useful for mocking interfaces where you only care about certain methods.
 * The unspecified properties will be undefined at runtime.
 *
 * @example
 * ```typescript
 * const mock = createPartialMock<MyInterface>({
 *   methodICareAbout: vi.fn().mockReturnValue('result'),
 * });
 * ```
 */
export function createPartialMock<T>(partial: Partial<T>): T {
  return partial as T;
}
