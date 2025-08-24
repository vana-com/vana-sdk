import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VanaCore } from '../core';
import { mokshaTestnet as moksha } from '../config/chains';
import type { TransactionResult } from '../types/operations';
import type { TransactionReceipt } from 'viem';

// Mock viem
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      waitForTransactionReceipt: vi.fn(),
      chain: moksha,
    })),
    createWalletClient: vi.fn(() => ({
      account: { address: '0xuser' },
      chain: moksha,
      signTypedData: vi.fn(),
    })),
    http: vi.fn(),
  };
});

// Mock the parseTransaction function
vi.mock('../utils/parseTransactionPojo', () => ({
  parseTransaction: vi.fn((txResult, receipt) => ({
    ...txResult,
    expectedEvents: {
      PermissionAdded: {
        permissionId: 1n,
        grantor: '0xaddr1',
        grantee: '0xaddr2',
      },
    },
    allEvents: [
      {
        eventName: 'PermissionAdded',
        args: { permissionId: 1n, grantor: '0xaddr1', grantee: '0xaddr2' },
      },
    ],
    hasExpectedEvents: receipt.logs.length > 0,
  })),
}));

describe('waitForTransactionEvents', () => {
  let client: VanaCore;
  let mockPublicClient: any;
  let mockWalletClient: any;
  let mockPlatformAdapter: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock platform adapter
    mockPlatformAdapter = {
      encrypt: vi.fn(),
      decrypt: vi.fn(),
      generateKey: vi.fn(),
      hashMessage: vi.fn(),
    };

    // Create mock wallet client
    mockWalletClient = {
      account: { address: '0xuser' as `0x${string}` },
      chain: moksha,
      signTypedData: vi.fn(),
    };

    // Create mock public client
    mockPublicClient = {
      waitForTransactionReceipt: vi.fn(),
      chain: moksha,
    };
    
    // Create VanaCore with mocks
    client = new VanaCore(mockPlatformAdapter, {
      walletClient: mockWalletClient as any,
    });
    
    // Override the publicClient with our mock
    (client as any).publicClient = mockPublicClient;
  });

  it('waits for transaction and parses events from TransactionResult POJO', async () => {
    const transactionResult: TransactionResult<'DataPortabilityPermissions', 'addPermission'> = {
      hash: '0xtxhash' as `0x${string}`,
      from: '0xfrom' as `0x${string}`,
      contract: 'DataPortabilityPermissions',
      fn: 'addPermission',
    };

    const mockReceipt = {
      blockHash: '0xblockhash' as `0x${string}`,
      blockNumber: 123n,
      status: 'success',
      logs: [],
    } as unknown as TransactionReceipt;

    mockPublicClient.waitForTransactionReceipt.mockResolvedValue(mockReceipt);

    const result = await client.waitForTransactionEvents(transactionResult);

    // Should call waitForTransactionReceipt with the hash
    expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: '0xtxhash',
      confirmations: undefined,
      pollingInterval: undefined,
      timeout: undefined,
    });

    // Should include parsed events
    expect(result.expectedEvents).toBeDefined();
    expect(result.expectedEvents.PermissionAdded).toBeDefined(); // Mock always returns it
    
    // Should preserve transaction context
    expect(result.hash).toBe('0xtxhash');
    expect(result.from).toBe('0xfrom');
    expect(result.contract).toBe('DataPortabilityPermissions');
    expect(result.fn).toBe('addPermission');
    
    // Should have expected events flag
    expect(result.hasExpectedEvents).toBe(false); // No logs means no events
  });

  it('accepts custom wait options', async () => {
    const transactionResult: TransactionResult<'DataRegistry', 'addFile'> = {
      hash: '0xhash2' as `0x${string}`,
      from: '0xfrom2' as `0x${string}`,
      contract: 'DataRegistry',
      fn: 'addFile',
    };

    const mockReceipt = {
      blockHash: '0xblock2' as `0x${string}`,
      blockNumber: 456n,
      status: 'success',
      logs: [],
    } as unknown as TransactionReceipt;

    mockPublicClient.waitForTransactionReceipt.mockResolvedValue(mockReceipt);

    await client.waitForTransactionEvents(transactionResult, {
      confirmations: 3,
      timeout: 120000,
    });

    expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: '0xhash2',
      confirmations: 3,
      timeout: 120000,
    });
  });


  it('preserves POJO nature through the entire flow', async () => {
    const transactionResult: TransactionResult<'DataPortabilityServers', 'trustServer'> = {
      hash: '0xhash3' as `0x${string}`,
      from: '0xfrom3' as `0x${string}`,
      contract: 'DataPortabilityServers',
      fn: 'trustServer',
    };

    // Verify input is a POJO
    expect(Object.getPrototypeOf(transactionResult)).toBe(Object.prototype);

    const mockReceipt = {
      blockHash: '0xblock3' as `0x${string}`,
      blockNumber: 999n,
      status: 'success',
      logs: [],
    } as unknown as TransactionReceipt;

    mockPublicClient.waitForTransactionReceipt.mockResolvedValue(mockReceipt);

    const result = await client.waitForTransactionEvents(transactionResult);

    // Verify output is also a POJO
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    
    // Should be JSON serializable (with BigInt handling)
    const serialized = JSON.stringify(result, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
    const deserialized = JSON.parse(serialized);
    
    // Core properties should survive serialization
    expect(deserialized.hash).toBe('0xhash3');
    expect(deserialized.from).toBe('0xfrom3');
    expect(deserialized.contract).toBe('DataPortabilityServers');
    expect(deserialized.fn).toBe('trustServer');
  });

  it('handles network errors gracefully', async () => {
    const transactionResult: TransactionResult<'DataRegistry', 'deleteFile'> = {
      hash: '0xnetworkerror' as `0x${string}`,
      from: '0xfrom' as `0x${string}`,
      contract: 'DataRegistry',
      fn: 'deleteFile',
    };

    mockPublicClient.waitForTransactionReceipt.mockRejectedValue(
      new Error('Network timeout')
    );

    await expect(
      client.waitForTransactionEvents(transactionResult)
    ).rejects.toThrow('Network timeout');
  });

  it('works with different contract and function combinations', async () => {
    const testCases = [
      { contract: 'DataPortabilityPermissions', fn: 'addPermission' },
      { contract: 'DataPortabilityPermissions', fn: 'revokePermission' },
      { contract: 'DataPortabilityServers', fn: 'trustServer' },
      { contract: 'DataPortabilityServers', fn: 'untrustServer' },
      { contract: 'DataPortabilityGrantees', fn: 'registerGrantee' },
      { contract: 'DataRegistry', fn: 'addFile' },
      { contract: 'DataRegistry', fn: 'deleteFile' },
      { contract: 'ComputeInstructionRegistry', fn: 'addComputeInstruction' },
    ] as const;

    for (const { contract, fn } of testCases) {
      const transactionResult: TransactionResult<typeof contract, typeof fn> = {
        hash: `0xhash_${contract}_${fn}` as `0x${string}`,
        from: '0xfrom' as `0x${string}`,
        contract,
        fn,
      };

      const mockReceipt = {
        blockHash: '0xblock' as `0x${string}`,
        blockNumber: 1n,
        status: 'success',
        logs: [],
      } as unknown as TransactionReceipt;

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await client.waitForTransactionEvents(transactionResult);

      expect(result.contract).toBe(contract);
      expect(result.fn).toBe(fn);
    }
  });

  it('maintains type safety through the entire flow', async () => {
    const transactionResult: TransactionResult<'DataPortabilityPermissions', 'addPermission'> = {
      hash: '0xtypesafe' as `0x${string}`,
      from: '0xfrom' as `0x${string}`,
      contract: 'DataPortabilityPermissions',
      fn: 'addPermission',
    };

    const mockReceipt = {
      blockHash: '0xblock' as `0x${string}`,
      blockNumber: 123n,
      status: 'success',
      logs: [],
    } as unknown as TransactionReceipt;

    mockPublicClient.waitForTransactionReceipt.mockResolvedValue(mockReceipt);

    const result = await client.waitForTransactionEvents(transactionResult);

    // TypeScript should enforce these types
    const contract: 'DataPortabilityPermissions' = result.contract;
    const fn: 'addPermission' = result.fn;
    
    expect(contract).toBe('DataPortabilityPermissions');
    expect(fn).toBe('addPermission');
  });
});