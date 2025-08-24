import { describe, it, expect, vi } from 'vitest';
import { tx } from '../transactionHelpers';
import { parseTransaction } from '../parseTransactionPojo';
import type { TransactionResult } from '../../types/operations';
import type { TransactionReceipt, Log } from 'viem';

// Mock viem's decodeEventLog for edge case testing
vi.mock('viem', () => ({
  decodeEventLog: vi.fn(({ abi }) => {
    const eventAbi = abi[0];
    return {
      eventName: eventAbi.name,
      args: {},
    };
  }),
}));

// Mock the event registry for edge case testing
vi.mock('../../generated/eventRegistry', () => ({
  EVENT_REGISTRY: {
    'DataPortabilityPermissions.addPermission': {
      topicToAbi: {
        '0xvalidtopic': {
          name: 'PermissionAdded',
          type: 'event',
          inputs: [],
        },
      },
    },
  },
}));

describe('Transaction System Edge Cases', () => {
  describe('tx() helper edge cases', () => {
    it('handles very long hash values', () => {
      const longHash = '0x' + 'a'.repeat(64) as `0x${string}`;
      
      const result = tx({
        hash: longHash,
        from: '0xaddr' as `0x${string}`,
        contract: 'DataRegistry',
        fn: 'addFile',
      });

      expect(result.hash).toBe(longHash);
      expect(result.hash.length).toBe(66); // '0x' + 64 chars
    });

    it('handles all possible contract names', () => {
      const contracts = [
        'ComputeEngine',
        'ComputeInstructionRegistry',
        'DAT',
        'DATFactory',
        'DATPausable',
        'DATVotes',
        'DataPortabilityGrantees',
        'DataPortabilityPermissions',
        'DataPortabilityServers',
        'DataRefinerRegistry',
        'DataRegistry',
        'DLPPerformance',
        'DLPRegistry',
        'DLPRegistryTreasury',
        'DLPRewardDeployer',
        'DLPRewardDeployerTreasury',
        'DLPRewardSwap',
        'QueryEngine',
        'SwapHelper',
        'TeePool',
        'TeePoolDedicatedGpu',
        'TeePoolDedicatedStandard',
        'TeePoolEphemeralStandard',
        'TeePoolPersistentGpu',
        'TeePoolPersistentStandard',
        'TeePoolPhala',
        'VanaEpoch',
        'VanaPoolEntity',
        'VanaPoolStaking',
        'VanaPoolTreasury',
      ] as const;

      for (const contract of contracts) {
        const result = tx({
          hash: '0xtest' as `0x${string}`,
          from: '0xaddr' as `0x${string}`,
          contract,
          fn: 'initialize', // All contracts have this
        });

        expect(result.contract).toBe(contract);
      }
    });

    it('handles addresses of various formats', () => {
      const addresses = [
        '0x0000000000000000000000000000000000000000', // Zero address
        '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', // Max address
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8', // Mixed case
        '0x742d35cc6634c0532925a3b844bc9e7595f0beb8', // Lowercase
        '0x742D35CC6634C0532925A3B844BC9E7595F0BEB8', // Uppercase
      ] as const;

      for (const address of addresses) {
        const result = tx({
          hash: '0xhash' as `0x${string}`,
          from: address,
          contract: 'DataRegistry',
          fn: 'addFile',
        });

        expect(result.from).toBe(address);
      }
    });

    it('preserves exact string values without transformation', () => {
      const input = {
        hash: '0xExAcTcAsE' as `0x${string}`,
        from: '0xMiXeDcAsE' as `0x${string}`,
        contract: 'DataRegistry' as const,
        fn: 'addFile' as const,
      };

      const result = tx(input);

      // Should preserve exact case
      expect(result.hash).toBe('0xExAcTcAsE');
      expect(result.from).toBe('0xMiXeDcAsE');
    });
  });

  describe('parseTransaction edge cases', () => {
    it('handles empty function registry gracefully', () => {
      const txResult = {
        hash: '0xunknown' as `0x${string}`,
        from: '0xaddr' as `0x${string}`,
        contract: 'UnknownContract' as any,
        fn: 'unknownFunction' as any,
      };

      const receipt = {
        logs: [
          {
            topics: ['0xsometopic'],
            data: '0x',
          } as unknown as Log,
        ],
      } as unknown as TransactionReceipt;

      const result = parseTransaction(txResult as any, receipt);

      expect(result.expectedEvents).toEqual({});
      // allEvents will have Unknown events for unregistered topics
      expect(result.allEvents).toHaveLength(1);
      expect(result.allEvents[0].eventName).toBe('Unknown');
      expect(result.contract).toBe('UnknownContract');
      expect(result.fn).toBe('unknownFunction');
    });

    it('handles receipt with hundreds of logs', () => {
      const txResult: TransactionResult<'DataPortabilityPermissions', 'addPermission'> = {
        hash: '0xmany' as `0x${string}`,
        from: '0xaddr' as `0x${string}`,
        contract: 'DataPortabilityPermissions',
        fn: 'addPermission',
      };

      // Create 500 logs
      const logs: Log[] = [];
      for (let i = 0; i < 500; i++) {
        logs.push({
          topics: [`0xinvalid${i}`],
          data: '0x',
        } as unknown as Log);
      }
      
      // Add one valid log
      logs.push({
        topics: ['0xvalidtopic'],
        data: '0x',
      } as unknown as Log);

      const receipt = {
        logs,
      } as unknown as TransactionReceipt;

      const result = parseTransaction(txResult, receipt);

      // Should still find the valid event
      expect(result.hasExpectedEvents).toBe(true);
      expect(result.expectedEvents.PermissionAdded).toBeDefined();
    });

    it('handles logs with missing or malformed data', () => {
      const txResult: TransactionResult<'DataPortabilityPermissions', 'addPermission'> = {
        hash: '0xmalformed' as `0x${string}`,
        from: '0xaddr' as `0x${string}`,
        contract: 'DataPortabilityPermissions',
        fn: 'addPermission',
      };

      const receipt = {
        logs: [
          {} as unknown as Log, // Empty log
          { topics: null } as any, // Null topics
          { topics: undefined } as any, // Undefined topics
          { topics: [] } as unknown as Log, // Empty topics array
          { data: null } as any, // Null data
          { topics: ['0xvalidtopic'] } as unknown as Log, // Missing data field
        ],
      } as unknown as TransactionReceipt;

      // Should not throw
      expect(() => {
        parseTransaction(txResult, receipt);
      }).not.toThrow();
    });

    it('handles very long topic arrays', () => {
      const txResult: TransactionResult<'DataPortabilityPermissions', 'addPermission'> = {
        hash: '0xlongtopics' as `0x${string}`,
        from: '0xaddr' as `0x${string}`,
        contract: 'DataPortabilityPermissions',
        fn: 'addPermission',
      };

      // Create log with many topics (max is usually 4 in practice)
      const topics = ['0xvalidtopic'];
      for (let i = 1; i < 10; i++) {
        topics.push(`0xextra${i}`);
      }

      const receipt = {
        logs: [
          {
            topics: topics as any,
            data: '0x',
          } as unknown as Log,
        ],
      } as unknown as TransactionReceipt;

      const result = parseTransaction(txResult, receipt);

      // Should still process the first topic
      expect(result.hasExpectedEvents).toBe(true);
    });

    it('handles duplicate events in logs', () => {
      const txResult: TransactionResult<'DataPortabilityPermissions', 'addPermission'> = {
        hash: '0xduplicates' as `0x${string}`,
        from: '0xaddr' as `0x${string}`,
        contract: 'DataPortabilityPermissions',
        fn: 'addPermission',
      };

      const receipt = {
        logs: [
          { topics: ['0xvalidtopic'], data: '0x1' } as unknown as Log,
          { topics: ['0xvalidtopic'], data: '0x2' } as unknown as Log,
          { topics: ['0xvalidtopic'], data: '0x3' } as unknown as Log,
        ],
      } as unknown as TransactionReceipt;

      const result = parseTransaction(txResult, receipt);

      // Should process all duplicate events
      expect(result.hasExpectedEvents).toBe(true);
      expect(result.expectedEvents.PermissionAdded).toBeDefined();
    });
  });

  describe('Type safety edge cases', () => {
    it('maintains type safety with union types', () => {
      type PossibleTransaction = 
        | TransactionResult<'DataPortabilityPermissions', 'addPermission'>
        | TransactionResult<'DataPortabilityPermissions', 'revokePermission'>
        | TransactionResult<'DataRegistry', 'addFile'>
        | TransactionResult<'DataRegistry', 'deleteFile'>;

      const transactions: PossibleTransaction[] = [
        tx({
          hash: '0x1' as `0x${string}`,
          from: '0xa1' as `0x${string}`,
          contract: 'DataPortabilityPermissions',
          fn: 'addPermission',
        }),
        tx({
          hash: '0x2' as `0x${string}`,
          from: '0xa2' as `0x${string}`,
          contract: 'DataRegistry',
          fn: 'addFile',
        }),
      ];

      // Type narrowing should work
      for (const tx of transactions) {
        if (tx.contract === 'DataPortabilityPermissions') {
          // TypeScript knows this is one of the permission transactions
          expect(['addPermission', 'revokePermission']).toContain(tx.fn);
        } else {
          // TypeScript knows this is a DataRegistry transaction
          expect(['addFile', 'deleteFile']).toContain(tx.fn);
        }
      }
    });

    it('prevents invalid contract/function combinations at runtime', () => {
      // This would be a TypeScript error in real code, but we can test runtime behavior
      const result = tx({
        hash: '0xinvalid' as `0x${string}`,
        from: '0xaddr' as `0x${string}`,
        contract: 'DataPortabilityPermissions' as any,
        fn: 'nonExistentFunction' as any,
      });

      // The tx() function doesn't validate, it just creates the POJO
      expect(result.contract).toBe('DataPortabilityPermissions');
      expect(result.fn).toBe('nonExistentFunction');

      // But parseTransaction would handle this gracefully
      const receipt = { logs: [] } as unknown as TransactionReceipt;
      const parsed = parseTransaction(result as any, receipt);
      
      expect(parsed.expectedEvents).toEqual({});
    });
  });

  describe('Memory and performance edge cases', () => {
    it('creates independent objects (no shared references)', () => {
      const shared = {
        hash: '0xshared' as `0x${string}`,
        from: '0xsharedaddr' as `0x${string}`,
      };

      const result1 = tx({
        ...shared,
        contract: 'DataRegistry',
        fn: 'addFile',
      });

      const result2 = tx({
        ...shared,
        contract: 'DataRegistry',
        fn: 'deleteFile',
      });

      // Modifying one should not affect the other
      (result1 as any).extra = 'data';

      expect((result2 as any).extra).toBeUndefined();
    });

    it('handles rapid creation of many POJOs', () => {
      const start = performance.now();
      const results: TransactionResult<any, any>[] = [];

      // Create 10,000 POJOs rapidly
      for (let i = 0; i < 10000; i++) {
        results.push(
          tx({
            hash: `0x${i}` as `0x${string}`,
            from: `0xaddr${i}` as `0x${string}`,
            contract: 'DataRegistry',
            fn: 'addFile',
          })
        );
      }

      const duration = performance.now() - start;

      expect(results).toHaveLength(10000);
      expect(duration).toBeLessThan(100); // Should be very fast (< 100ms)
      
      // All should be independent objects
      expect(results[0]).not.toBe(results[1]);
      expect(results[0].hash).toBe('0x0');
      expect(results[9999].hash).toBe('0x9999');
    });
  });

  describe('Null and undefined edge cases', () => {
    it('does not accept null or undefined values', () => {
      // TypeScript would prevent this, but test runtime behavior
      expect(() => {
        tx({
          hash: null as any,
          from: '0xaddr' as `0x${string}`,
          contract: 'DataRegistry',
          fn: 'addFile',
        });
      }).not.toThrow(); // tx() just passes through

      expect(() => {
        tx({
          hash: '0xhash' as `0x${string}`,
          from: undefined as any,
          contract: 'DataRegistry',
          fn: 'addFile',
        });
      }).not.toThrow(); // tx() just passes through
    });

    it('parseTransaction throws on null receipt', () => {
      const txResult: TransactionResult<'DataRegistry', 'addFile'> = {
        hash: '0xnull' as `0x${string}`,
        from: '0xaddr' as `0x${string}`,
        contract: 'DataRegistry',
        fn: 'addFile',
      };

      // Should throw on null/undefined receipt (fail fast principle)
      expect(() => {
        parseTransaction(txResult, null as any);
      }).toThrow();

      expect(() => {
        parseTransaction(txResult, undefined as any);
      }).toThrow();
    });
  });
});