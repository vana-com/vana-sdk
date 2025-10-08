/**
 * Provides type-safe mock factories for testing Vana SDK components.
 *
 * @remarks
 * This module contains factory functions that create properly typed mock objects
 * for testing. These factories eliminate the need for `as any` assertions in tests
 * by providing complete implementations with sensible defaults.
 *
 * ## Usage Patterns
 *
 * ### Basic Usage
 * ```typescript
 * const context = createMockControllerContext();
 * const controller = new MyController(context);
 * ```
 *
 * ### Direct Transaction Testing (No Relayer/Storage)
 * ```typescript
 * const context = createMockControllerContextForDirectTransaction();
 * ```
 *
 * ### With Relayer Callbacks
 * ```typescript
 * const context = createMockControllerContextWithRelayer();
 * ```
 *
 * ### Accessing Mock Methods
 * When you need to access mock methods like `mockImplementation`, wrap with `vi.mocked()`:
 * ```typescript
 * vi.mocked(context.walletClient.signTypedData).mockImplementation(...);
 * ```
 *
 * @category Testing
 * @module mockFactory
 * @internal
 */

import { vi, type Mock } from "vitest";
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
 * Type for a properly mocked Account with vitest mock functions
 */
type MockedAccount = Omit<
  Account,
  "signMessage" | "signTypedData" | "signTransaction"
> & {
  signMessage: Mock;
  signTypedData: Mock;
  signTransaction: Mock;
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
 *   address: "0xCustomAddress"
 * });
 * ```
 */
export function createMockAccount(overrides?: Partial<Account>): Account {
  const mockAccount: MockedAccount = {
    address: overrides?.address ?? "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    type: overrides?.type ?? "local",
    signMessage: vi.fn().mockResolvedValue(`0x${"0".repeat(130)}`),
    signTypedData: vi.fn().mockResolvedValue(`0x${"0".repeat(130)}`),
    signTransaction: vi.fn(),
  };
  return mockAccount as Account;
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
 *   account: { address: "0xCustom" },
 *   chain: { id: 1480 }
 * });
 * ```
 */
export function createTypedMockWalletClient(
  overrides?: DeepPartial<WalletClient>,
): WalletClient {
  const account = overrides?.account ?? createMockAccount();
  const chain = overrides?.chain ?? createMockChain();

  const mockWalletClient = {
    account,
    chain,
    mode: "wallet" as const,
    transport: {} as PublicClient["transport"], // Transport is complex and rarely used in tests
    key: "wallet" as const,
    name: "Mock Wallet Client",
    pollingInterval: 4000,
    request: vi.fn(),
    type: "walletClient" as const,
    uid: "mock-wallet-uid",
    batch: undefined,
    cacheTime: 0,
    ccipRead: undefined,
    getAddresses:
      overrides?.getAddresses ?? vi.fn().mockResolvedValue([account.address]),
    getChainId: overrides?.getChainId ?? vi.fn().mockResolvedValue(chain.id),
    signMessage:
      overrides?.signMessage ??
      vi.fn().mockResolvedValue(`0x${"0".repeat(130)}`),
    signTypedData:
      overrides?.signTypedData ??
      vi.fn().mockResolvedValue(`0x${"0".repeat(130)}`),
    signTransaction: overrides?.signTransaction ?? vi.fn(),
    writeContract:
      overrides?.writeContract ?? vi.fn().mockResolvedValue("0xtxhash" as Hash),
    deployContract: overrides?.deployContract ?? vi.fn(),
    sendRawTransaction: overrides?.sendRawTransaction ?? vi.fn(),
    sendTransaction: overrides?.sendTransaction ?? vi.fn(),
    prepareTransactionRequest: overrides?.prepareTransactionRequest ?? vi.fn(),
    switchChain: overrides?.switchChain ?? vi.fn(),
    watchAsset: overrides?.watchAsset ?? vi.fn(),
    addChain: overrides?.addChain ?? vi.fn(),
    getPermissions: overrides?.getPermissions ?? vi.fn(),
    requestAddresses: overrides?.requestAddresses ?? vi.fn(),
    requestPermissions: overrides?.requestPermissions ?? vi.fn(),
    watchEvent: vi.fn(),
    watchContractEvent: vi.fn(),
    extend: overrides?.extend ?? vi.fn(),
  };

  return mockWalletClient as unknown as WalletClient;
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
  const chain = overrides?.chain ?? createMockChain();

  const defaultReceipt = {
    transactionHash: "0xtxhash" as Hash,
    transactionIndex: 0,
    blockNumber: 12345n,
    blockHash: "0xblockhash" as Hash,
    from: "0xfrom",
    to: "0xto",
    cumulativeGasUsed: 100000n,
    gasUsed: 50000n,
    logs: [],
    logsBloom: "0x0" as `0x${string}`,
    status: "success" as const,
    type: "eip1559" as const,
    contractAddress: undefined,
    effectiveGasPrice: 1000000000n,
  } as TransactionReceipt;

  const mockPublicClient = {
    chain,
    mode: "publicClient" as const,
    transport: {} as WalletClient["transport"],
    key: "public" as const,
    name: "Mock Public Client",
    pollingInterval: 4000,
    request: vi.fn(),
    type: "publicClient" as const,
    uid: "mock-public-uid",
    batch: undefined,
    cacheTime: 0,
    ccipRead: undefined,
    getChainId: overrides?.getChainId ?? vi.fn().mockResolvedValue(chain.id),
    readContract:
      overrides?.readContract ?? vi.fn().mockResolvedValue(BigInt(0)), // Default to BigInt(0) for nonce/ID reads
    multicall: overrides?.multicall ?? vi.fn().mockResolvedValue([]),
    getBalance: overrides?.getBalance ?? vi.fn(),
    getBlock: overrides?.getBlock ?? vi.fn(),
    getBlockNumber: overrides?.getBlockNumber ?? vi.fn(),
    getTransaction: overrides?.getTransaction ?? vi.fn(),
    getTransactionReceipt:
      overrides?.getTransactionReceipt ??
      vi.fn().mockResolvedValue(defaultReceipt),
    waitForTransactionReceipt:
      overrides?.waitForTransactionReceipt ??
      vi.fn().mockResolvedValue(defaultReceipt),
    estimateGas: overrides?.estimateGas ?? vi.fn(),
    estimateContractGas: overrides?.estimateContractGas ?? vi.fn(),
    estimateFeesPerGas: overrides?.estimateFeesPerGas ?? vi.fn(),
    estimateMaxPriorityFeePerGas:
      overrides?.estimateMaxPriorityFeePerGas ?? vi.fn(),
    getCode: overrides?.getCode ?? vi.fn(),
    getContractEvents: overrides?.getContractEvents ?? vi.fn(),
    getFeeHistory: overrides?.getFeeHistory ?? vi.fn(),
    getFilterChanges: overrides?.getFilterChanges ?? vi.fn(),
    getFilterLogs: overrides?.getFilterLogs ?? vi.fn(),
    getLogs: overrides?.getLogs ?? vi.fn(),
    getProof: overrides?.getProof ?? vi.fn(),
    getStorageAt: overrides?.getStorageAt ?? vi.fn(),
    getTransactionConfirmations:
      overrides?.getTransactionConfirmations ?? vi.fn(),
    getTransactionCount: overrides?.getTransactionCount ?? vi.fn(),
    uninstallFilter: overrides?.uninstallFilter ?? vi.fn(),
    watchBlockNumber: overrides?.watchBlockNumber ?? vi.fn(),
    watchBlocks: overrides?.watchBlocks ?? vi.fn(),
    watchContractEvent: overrides?.watchContractEvent ?? vi.fn(),
    watchEvent: overrides?.watchEvent ?? vi.fn(),
    createEventFilter: overrides?.createEventFilter ?? vi.fn(),
    createBlockFilter: overrides?.createBlockFilter ?? vi.fn(),
    createContractEventFilter: overrides?.createContractEventFilter ?? vi.fn(),
    createPendingTransactionFilter:
      overrides?.createPendingTransactionFilter ?? vi.fn(),
    call: overrides?.call ?? vi.fn(),
    extend: overrides?.extend ?? vi.fn(),
  };

  return mockPublicClient as unknown as PublicClient;
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
 *   walletClient: { account: { address: "0xCustom" } }
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

  // Set default response with commonly expected event structure
  fakeWaitForTransactionEvents.setDefaultResponse({
    hash: "0xtxhash" as Hash,
    from: "0xfrom",
    contract: "DataPortabilityPermissions",
    fn: "addPermission",
    expectedEvents: {
      PermissionAdded: {
        permissionId: 1n,
        user: "0xfrom",
        grant: "grant-data",
      },
    },
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

  // Extract userAddress from the walletClient account
  const userAddress =
    overrides?.userAddress ??
    (typeof walletClient.account === "string"
      ? walletClient.account
      : walletClient.account?.address) ??
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  // Build the context with guaranteed waitForTransactionEvents
  const context = {
    walletClient,
    publicClient,
    userAddress,
    applicationClient: walletClient,
    platform: overrides?.platform ?? mockPlatformAdapter,
    storageManager:
      overrides?.storageManager ?? createTypedMockStorageManager(),
    subgraphUrl: overrides?.subgraphUrl ?? "https://subgraph.test.com",
    defaultPersonalServerUrl: overrides?.defaultPersonalServerUrl,
    relayer: overrides?.relayer ?? undefined,
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
      overrides?.waitForTransactionEvents ?? mockWaitForTransactionEvents,
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
 * Creates a mock viem Log object for testing.
 *
 * @param eventName - The name of the event
 * @param args - The event arguments
 * @returns A complete Log object with all required properties
 *
 * @remarks
 * This factory creates a complete viem Log object with all required blockchain
 * metadata. Use this when mocking parseEventLogs return values.
 *
 * @example
 * ```typescript
 * const mockLog = createMockLog("PermissionGranted", {
 *   permissionId: 123n,
 *   user: "0xUserAddress",
 *   grant: "grant-data"
 * });
 * ```
 */
export function createMockLog(
  eventName: string,
  args: Record<string, unknown>,
): {
  eventName: string;
  args: Record<string, unknown>;
  address: Address;
  blockHash: Hash;
  blockNumber: bigint;
  data: Hash;
  logIndex: number;
  removed: boolean;
  transactionHash: Hash;
  transactionIndex: number;
  topics: readonly Hash[];
} {
  return {
    eventName,
    args,
    address: "0x0000000000000000000000000000000000000000",
    blockHash:
      "0x0000000000000000000000000000000000000000000000000000000000000000" as Hash,
    blockNumber: 1n,
    data: "0x" as Hash,
    logIndex: 0,
    removed: false,
    transactionHash:
      "0x0000000000000000000000000000000000000000000000000000000000000000" as Hash,
    transactionIndex: 0,
    topics: [] as readonly Hash[],
  };
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

/**
 * Creates a mock ControllerContext specifically configured for direct transaction testing.
 *
 * @param overrides - Optional nested properties to override the defaults
 * @returns A ControllerContext with no relayer callbacks or storage manager
 *
 * @remarks
 * This factory variant is optimized for testing direct blockchain transactions
 * without gasless relayer support. It sets both `relayer` and
 * `storageManager` to `undefined`, forcing the controller to use direct transactions.
 *
 * @example
 * ```typescript
 * const context = createMockControllerContextForDirectTransaction();
 * const controller = new PermissionsController(context);
 * // Test will throw "No storage available" error as expected
 * await expect(controller.grant(params)).rejects.toThrow("No storage available");
 * ```
 */
export function createMockControllerContextForDirectTransaction(
  overrides?: DeepPartial<ControllerContext>,
): ControllerContext &
  Required<Pick<ControllerContext, "waitForTransactionEvents">> {
  return createMockControllerContext({
    relayer: undefined,
    storageManager: undefined,
    ...overrides,
  });
}

/**
 * Creates a mock ControllerContext with relayer callbacks configured.
 *
 * @param overrides - Optional nested properties to override the defaults
 * @returns A ControllerContext with default relayer callbacks for gasless transactions
 *
 * @remarks
 * This factory variant provides sensible defaults for testing gasless transactions
 * with relayer support. It includes mock implementations for `storeGrantFile` and
 * `submitPermissionGrant` that return successful responses.
 *
 * @example
 * ```typescript
 * const context = createMockControllerContextWithRelayer();
 * const controller = new PermissionsController(context);
 * const result = await controller.grant(params);
 * expect(context.relayer?.storeGrantFile).toHaveBeenCalled();
 * ```
 */
export function createMockControllerContextWithRelayer(
  overrides?: DeepPartial<ControllerContext>,
): ControllerContext &
  Required<Pick<ControllerContext, "waitForTransactionEvents">> {
  return createMockControllerContext({
    relayer:
      overrides?.relayer ??
      vi.fn().mockImplementation(async (request) => {
        if (
          request.type === "direct" &&
          request.operation === "storeGrantFile"
        ) {
          return {
            type: "direct",
            result: { url: "https://mock-grant-url.com" },
          };
        }
        return { type: "signed", hash: "0xtxhash" };
      }),
    ...overrides,
  });
}

/**
 * Helper to properly type a mocked client for TypeScript.
 *
 * @param client - The client to type as mocked
 * @returns The client typed with vitest mock methods
 *
 * @remarks
 * Use this when you need TypeScript to recognize mock methods on factory-created clients.
 * This is a convenience wrapper around `vi.mocked()`.
 *
 * @example
 * ```typescript
 * const context = createMockControllerContext();
 * const mockedWallet = asMocked(context.walletClient);
 * mockedWallet.signTypedData.mockImplementation((data) => {
 *   // Custom implementation
 * });
 * ```
 */
export function asMocked<T>(client: T): ReturnType<typeof vi.mocked<T>> {
  return vi.mocked(client);
}
