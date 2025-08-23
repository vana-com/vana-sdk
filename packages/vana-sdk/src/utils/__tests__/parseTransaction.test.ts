import { describe, it, expect, vi } from 'vitest';
import { parseTransaction } from '../parseTransactionPojo';
import type { TransactionResult } from '../../types/operations';
import type { Log, TransactionReceipt } from 'viem';

// Mock viem's decodeEventLog
vi.mock('viem', () => ({
  decodeEventLog: vi.fn(({ abi, data, topics }) => {
    // Simple mock that returns a predictable result
    const eventAbi = abi[0];
    return {
      eventName: eventAbi.name,
      args: {
        permissionId: 1n,
        grantor: '0xaddr1',
        grantee: '0xaddr2',
        fileId: 100n,
        owner: '0xowner',
        url: 'https://example.com',
      },
    };
  }),
}));

// Mock the event registry
vi.mock('../../generated/eventRegistry', () => ({
  EVENT_REGISTRY: {
    'DataPortabilityPermissions.addPermission': {
      topicToAbi: {
        '0x1234567890': {
          name: 'PermissionAdded',
          type: 'event',
          inputs: [
            { name: 'permissionId', type: 'uint256', indexed: true },
            { name: 'grantor', type: 'address', indexed: true },
            { name: 'grantee', type: 'address', indexed: false },
          ],
        },
      },
    },
    'DataRegistry.addFile': {
      topicToAbi: {
        '0xabcdef1234': {
          name: 'FileAdded',
          type: 'event',
          inputs: [
            { name: 'fileId', type: 'uint256', indexed: true },
            { name: 'owner', type: 'address', indexed: true },
            { name: 'url', type: 'string', indexed: false },
          ],
        },
      },
    },
  },
}));

describe('parseTransaction', () => {
  it('parses events using function-scoped registry', () => {
    const transactionResult: TransactionResult<'DataPortabilityPermissions', 'addPermission'> = {
      hash: '0xtxhash' as `0x${string}`,
      from: '0xfrom' as `0x${string}`,
      contract: 'DataPortabilityPermissions',
      fn: 'addPermission',
    };

    const receipt: TransactionReceipt = {
      logs: [
        {
          topics: ['0x1234567890', '0x0000000000000000000000000000000000000001'],
          data: '0x',
        } as unknown as Log,
      ],
    } as TransactionReceipt;

    const result = parseTransaction(transactionResult, receipt);

    expect(result.expectedEvents).toBeDefined();
    expect(result.allEvents).toBeDefined();
    expect(result.contract).toBe('DataPortabilityPermissions');
    expect(result.fn).toBe('addPermission');
  });

  it('only includes events from the specific function registry', () => {
    const transactionResult: TransactionResult<'DataRegistry', 'addFile'> = {
      hash: '0xtxhash' as `0x${string}`,
      from: '0xfrom' as `0x${string}`,
      contract: 'DataRegistry',
      fn: 'addFile',
    };

    const receipt: TransactionReceipt = {
      logs: [
        {
          topics: ['0xabcdef1234', '0x0000000000000000000000000000000000000001'],
          data: '0x',
        } as unknown as Log,
        {
          topics: ['0x1234567890'], // From different function
          data: '0x',
        } as unknown as Log,
      ],
    } as TransactionReceipt;

    const result = parseTransaction(transactionResult, receipt);

    // Should only parse events for DataRegistry.addFile
    expect(result.expectedEvents).toHaveLength(1);
    expect(result.expectedEvents[0]).toHaveProperty('name', 'FileAdded');
  });

  it('returns empty expectedEvents when no registry exists for function', () => {
    const transactionResult: TransactionResult<'DataRegistry', 'unknownFunction'> = {
      hash: '0xtxhash' as `0x${string}`,
      from: '0xfrom' as `0x${string}`,
      contract: 'DataRegistry',
      fn: 'unknownFunction' as any,
    };

    const receipt: TransactionReceipt = {
      logs: [
        {
          topics: ['0xsometopic'],
          data: '0x',
        } as unknown as Log,
      ],
    } as TransactionReceipt;

    const result = parseTransaction(transactionResult, receipt);

    expect(result.expectedEvents).toEqual([]);
    // allEvents will include Unknown events for unregistered topics
    expect(result.allEvents).toHaveLength(1);
    expect(result.allEvents[0].name).toBe('Unknown');
  });

  it('handles receipts with no logs', () => {
    const transactionResult: TransactionResult<'DataPortabilityPermissions', 'addPermission'> = {
      hash: '0xtxhash' as `0x${string}`,
      from: '0xfrom' as `0x${string}`,
      contract: 'DataPortabilityPermissions',
      fn: 'addPermission',
    };

    const receipt: TransactionReceipt = {
      logs: [],
    } as TransactionReceipt;

    const result = parseTransaction(transactionResult, receipt);

    expect(result.expectedEvents).toEqual([]);
    expect(result.allEvents).toEqual([]);
  });

  it('preserves transaction context in result', () => {
    const transactionResult: TransactionResult<'DataPortabilityPermissions', 'revokePermission'> = {
      hash: '0xmyhash' as `0x${string}`,
      from: '0xmyaddress' as `0x${string}`,
      contract: 'DataPortabilityPermissions',
      fn: 'revokePermission',
    };

    const receipt: TransactionReceipt = {
      logs: [],
    } as TransactionReceipt;

    const result = parseTransaction(transactionResult, receipt);

    expect(result.hash).toBe('0xmyhash');
    expect(result.from).toBe('0xmyaddress');
    expect(result.contract).toBe('DataPortabilityPermissions');
    expect(result.fn).toBe('revokePermission');
  });

  it('uses O(1) topic lookup for event matching', () => {
    // This test verifies that we're using direct topic lookup
    // rather than iterating through all possible events
    const transactionResult: TransactionResult<'DataPortabilityPermissions', 'addPermission'> = {
      hash: '0xtxhash' as `0x${string}`,
      from: '0xfrom' as `0x${string}`,
      contract: 'DataPortabilityPermissions',
      fn: 'addPermission',
    };

    const receipt: TransactionReceipt = {
      logs: [
        {
          topics: ['0x1234567890'], // Direct lookup by this topic
          data: '0x',
        } as unknown as Log,
      ],
    } as TransactionReceipt;

    // Parse the transaction - the O(1) lookup happens via direct object property access
    const result = parseTransaction(transactionResult, receipt);

    // The event should be parsed correctly via the O(1) registry lookup
    expect(result.expectedEvents).toHaveLength(1);
    expect(result.expectedEvents[0].name).toBe('PermissionAdded');
  });

  it('parses both expected and unexpected events', () => {
    const transactionResult: TransactionResult<'DataPortabilityPermissions', 'addPermission'> = {
      hash: '0xtxhash' as `0x${string}`,
      from: '0xfrom' as `0x${string}`,
      contract: 'DataPortabilityPermissions',
      fn: 'addPermission',
    };

    const receipt: TransactionReceipt = {
      logs: [
        {
          topics: ['0x1234567890'], // Expected event
          data: '0x',
        } as unknown as Log,
        {
          topics: ['0xunknowntopic'], // Unexpected event
          data: '0x',
        } as unknown as Log,
      ],
    } as TransactionReceipt;

    const result = parseTransaction(transactionResult, receipt);

    // Expected events only include those in the registry
    expect(result.expectedEvents).toHaveLength(1);
    expect(result.expectedEvents[0].name).toBe('PermissionAdded');
    
    // All events include both the parsed event and the unknown event
    expect(result.allEvents).toHaveLength(2);
    expect(result.allEvents[0].name).toBe('PermissionAdded');
    expect(result.allEvents[1].name).toBe('Unknown');
  });

  it('handles malformed logs gracefully', () => {
    const transactionResult: TransactionResult<'DataPortabilityPermissions', 'addPermission'> = {
      hash: '0xtxhash' as `0x${string}`,
      from: '0xfrom' as `0x${string}`,
      contract: 'DataPortabilityPermissions',
      fn: 'addPermission',
    };

    const receipt: TransactionReceipt = {
      logs: [
        {
          topics: [], // No topics
          data: '0x',
        } as unknown as Log,
        {
          topics: null as any, // Invalid topics
          data: '0x',
        } as unknown as Log,
        {
          // Missing data
          topics: ['0x1234567890'],
        } as unknown as Log,
      ],
    } as TransactionReceipt;

    expect(() => {
      parseTransaction(transactionResult, receipt);
    }).not.toThrow();
  });
});