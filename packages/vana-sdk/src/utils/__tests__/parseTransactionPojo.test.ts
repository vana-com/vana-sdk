/**
 * Tests for parseTransaction (POJO-based parser)
 *
 * @remarks
 * Tests event parsing with ZERO heuristics, registry lookups, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseTransaction } from "../parseTransactionPojo";
import type { TransactionReceipt } from "viem";
import type { TransactionResult } from "../../types/operations";

// Mock the event registry module
vi.mock("../../generated/eventRegistry", () => {
  const mockEventTopic =
    "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`;
  const mockUnknownTopic =
    "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`;

  return {
    EVENT_REGISTRY: {
      "DataPortabilityPermissions.grantPermission": {
        contract: "DataPortabilityPermissions",
        fn: "grantPermission",
        eventNames: ["PermissionGranted"],
      },
      "DataPortabilityPermissions.revokePermission": {
        contract: "DataPortabilityPermissions",
        fn: "revokePermission",
        eventNames: ["PermissionRevoked"],
      },
      "FileRegistry.addFile": {
        contract: "FileRegistry",
        fn: "addFile",
        eventNames: ["FileAdded", "MetadataUpdated"],
      },
    },
    TOPIC_TO_ABIS: new Map([
      [
        mockEventTopic,
        [
          {
            type: "event",
            name: "PermissionGranted",
            inputs: [
              {
                indexed: true,
                name: "fileId",
                type: "uint256",
              },
              {
                indexed: true,
                name: "grantee",
                type: "address",
              },
              {
                indexed: false,
                name: "expiresAt",
                type: "uint256",
              },
            ],
          },
        ],
      ],
    ]),
  };
});

// Mock viem's decodeEventLog
vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    decodeEventLog: vi.fn((params: unknown) => {
      const { topics } = params as {
        topics: [`0x${string}`, ...`0x${string}`[]];
      };
      const topic0 = topics[0];

      // Mock successful decode for known topic
      if (
        topic0 ===
        "0x1234567890123456789012345678901234567890123456789012345678901234"
      ) {
        return {
          eventName: "PermissionGranted",
          args: {
            fileId: 42n,
            grantee:
              "0x1234567890123456789012345678901234567890" as `0x${string}`,
            expiresAt: 1234567890n,
          },
        };
      }

      // Simulate decode failure for unknown topics
      throw new Error("Event signature not found in ABI");
    }),
  };
});

describe("parseTransaction", () => {
  const mockTransactionResult: TransactionResult<
    "DataPortabilityPermissions",
    "grantPermission"
  > = {
    hash: "0xabc123" as `0x${string}`,
    from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
    contract: "DataPortabilityPermissions",
    fn: "grantPermission",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Basic Event Parsing", () => {
    it("should parse transaction with expected events", () => {
      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [
          {
            address:
              "0x2222222222222222222222222222222222222222" as `0x${string}`,
            topics: [
              "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
            ],
            data: "0x",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 0,
            removed: false,
          },
        ],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(mockTransactionResult, receipt);

      expect(result.hash).toBe(mockTransactionResult.hash);
      expect(result.from).toBe(mockTransactionResult.from);
      expect(result.contract).toBe("DataPortabilityPermissions");
      expect(result.fn).toBe("grantPermission");
      expect(result.hasExpectedEvents).toBe(true);
      expect(result.expectedEvents).toHaveProperty("PermissionGranted");
      expect(result.allEvents).toHaveLength(1);
      expect(result.allEvents[0].eventName).toBe("PermissionGranted");
      expect(result.allEvents[0].contractAddress).toBe(
        "0x2222222222222222222222222222222222222222",
      );
    });

    it("should parse transaction with no events", () => {
      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(mockTransactionResult, receipt);

      expect(result.hasExpectedEvents).toBe(false);
      expect(result.expectedEvents).toEqual({});
      expect(result.allEvents).toEqual([]);
    });

    it("should parse transaction with undefined logs", () => {
      const receipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: undefined,
        logsBloom: "0x" as `0x${string}`,
        status: "success" as const,
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2" as const,
      };

      const result = parseTransaction(mockTransactionResult, receipt);

      expect(result.hasExpectedEvents).toBe(false);
      expect(result.allEvents).toEqual([]);
    });
  });

  describe("Registry Lookup", () => {
    it("should use function-scoped registry for expected events", () => {
      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [
          {
            address:
              "0x2222222222222222222222222222222222222222" as `0x${string}`,
            topics: [
              "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
            ],
            data: "0x",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 0,
            removed: false,
          },
        ],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(mockTransactionResult, receipt);

      // Event is in registry for this function
      expect(result.hasExpectedEvents).toBe(true);
      expect(result.expectedEvents).toHaveProperty("PermissionGranted");
    });

    it("should not mark events as expected when registry key missing", () => {
      const unknownFunctionTx: TransactionResult<
        "UnknownContract",
        "unknownFunction"
      > = {
        hash: "0xabc123" as `0x${string}`,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        contract: "UnknownContract",
        fn: "unknownFunction",
      };

      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [
          {
            address:
              "0x2222222222222222222222222222222222222222" as `0x${string}`,
            topics: [
              "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
            ],
            data: "0x",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 0,
            removed: false,
          },
        ],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(unknownFunctionTx, receipt);

      // Event is decoded but not marked as expected (not in registry)
      expect(result.hasExpectedEvents).toBe(false);
      expect(result.expectedEvents).toEqual({});
      expect(result.allEvents).toHaveLength(1); // Still in allEvents
    });

    it("should handle function with multiple expected events", () => {
      const multiEventTx: TransactionResult<"FileRegistry", "addFile"> = {
        hash: "0xabc123" as `0x${string}`,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        contract: "FileRegistry",
        fn: "addFile",
      };

      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [
          {
            address:
              "0x2222222222222222222222222222222222222222" as `0x${string}`,
            topics: [
              "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
            ],
            data: "0x",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 0,
            removed: false,
          },
        ],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(multiEventTx, receipt);

      // Function expects FileAdded and MetadataUpdated, but only PermissionGranted emitted
      expect(result.hasExpectedEvents).toBe(false); // PermissionGranted not in expected list
      expect(result.allEvents).toHaveLength(1);
    });
  });

  describe("Unknown Events", () => {
    it("should handle unknown event topics", () => {
      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [
          {
            address:
              "0x2222222222222222222222222222222222222222" as `0x${string}`,
            topics: [
              "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
            ],
            data: "0x1234",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 0,
            removed: false,
          },
        ],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(mockTransactionResult, receipt);

      expect(result.allEvents).toHaveLength(1);
      expect(result.allEvents[0].eventName).toBe("Unknown");
      expect(result.allEvents[0].args).toHaveProperty("topic0");
      expect(result.allEvents[0].args).toHaveProperty("data");
      expect(result.allEvents[0].args.topic0).toBe(
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      );
    });

    it("should handle events with no topics", () => {
      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [
          {
            address:
              "0x2222222222222222222222222222222222222222" as `0x${string}`,
            topics: [],
            data: "0x",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 0,
            removed: false,
          },
        ],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(mockTransactionResult, receipt);

      // Logs with no topics should be skipped
      expect(result.allEvents).toHaveLength(0);
    });

    it("should handle logs with undefined topics", () => {
      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [
          {
            address:
              "0x2222222222222222222222222222222222222222" as `0x${string}`,
            topics: undefined as never,
            data: "0x",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 0,
            removed: false,
          },
        ],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(mockTransactionResult, receipt);

      // Logs with undefined topics should be skipped
      expect(result.allEvents).toHaveLength(0);
    });
  });

  describe("Multiple Logs", () => {
    it("should parse multiple logs in correct order", () => {
      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [
          {
            address:
              "0x2222222222222222222222222222222222222222" as `0x${string}`,
            topics: [
              "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
            ],
            data: "0x",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 0,
            removed: false,
          },
          {
            address:
              "0x3333333333333333333333333333333333333333" as `0x${string}`,
            topics: [
              "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
            ],
            data: "0x5678",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 1,
            removed: false,
          },
          {
            address:
              "0x4444444444444444444444444444444444444444" as `0x${string}`,
            topics: [
              "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
            ],
            data: "0x",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 2,
            removed: false,
          },
        ],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(mockTransactionResult, receipt);

      expect(result.allEvents).toHaveLength(3);
      expect(result.allEvents[0].contractAddress).toBe(
        "0x2222222222222222222222222222222222222222",
      );
      expect(result.allEvents[0].logIndex).toBe(0);
      expect(result.allEvents[1].eventName).toBe("Unknown");
      expect(result.allEvents[1].logIndex).toBe(1);
      expect(result.allEvents[2].contractAddress).toBe(
        "0x4444444444444444444444444444444444444444",
      );
      expect(result.allEvents[2].logIndex).toBe(2);
    });

    it("should handle mix of decodable and unknown events", () => {
      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [
          {
            address:
              "0x2222222222222222222222222222222222222222" as `0x${string}`,
            topics: [
              "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
            ],
            data: "0x",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 0,
            removed: false,
          },
          {
            address:
              "0x3333333333333333333333333333333333333333" as `0x${string}`,
            topics: [
              "0xunknownunknownunknownunknownunknownunknownunknownunknownunknownun" as `0x${string}`,
            ],
            data: "0x9999",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 1,
            removed: false,
          },
        ],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(mockTransactionResult, receipt);

      expect(result.allEvents).toHaveLength(2);
      expect(result.allEvents[0].eventName).toBe("PermissionGranted");
      expect(result.allEvents[1].eventName).toBe("Unknown");
    });
  });

  describe("Log Field Handling", () => {
    it("should handle missing log address", () => {
      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [
          {
            address: undefined as never,
            topics: [
              "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
            ],
            data: "0x",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 0,
            removed: false,
          },
        ],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(mockTransactionResult, receipt);

      expect(result.allEvents).toHaveLength(1);
      expect(result.allEvents[0].contractAddress).toBe("");
    });

    it("should handle missing logIndex", () => {
      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [
          {
            address:
              "0x2222222222222222222222222222222222222222" as `0x${string}`,
            topics: [
              "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
            ],
            data: "0x",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: undefined as never,
            removed: false,
          },
        ],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(mockTransactionResult, receipt);

      expect(result.allEvents).toHaveLength(1);
      expect(result.allEvents[0].logIndex).toBe(0);
    });
  });

  describe("TransactionResult Fields", () => {
    it("should preserve all transaction result fields", () => {
      const extendedTxResult: TransactionResult<
        "DataPortabilityPermissions",
        "grantPermission"
      > = {
        hash: "0xabc123" as `0x${string}`,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        contract: "DataPortabilityPermissions",
        fn: "grantPermission",
        chainId: 14800,
        value: 1000000000000000000n,
        nonce: 42,
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
      };

      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(extendedTxResult, receipt);

      expect(result.hash).toBe(extendedTxResult.hash);
      expect(result.from).toBe(extendedTxResult.from);
      expect(result.contract).toBe(extendedTxResult.contract);
      expect(result.fn).toBe(extendedTxResult.fn);
    });

    it("should work with minimal transaction result", () => {
      const minimalTxResult: TransactionResult<
        "DataPortabilityPermissions",
        "grantPermission"
      > = {
        hash: "0xabc123" as `0x${string}`,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        contract: "DataPortabilityPermissions",
        fn: "grantPermission",
      };

      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(minimalTxResult, receipt);

      expect(result.hash).toBe(minimalTxResult.hash);
      expect(result.from).toBe(minimalTxResult.from);
      expect(result.contract).toBe(minimalTxResult.contract);
      expect(result.fn).toBe(minimalTxResult.fn);
      expect(result.hasExpectedEvents).toBe(false);
    });
  });

  describe("Event Args Extraction", () => {
    it("should preserve decoded event args structure", () => {
      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [
          {
            address:
              "0x2222222222222222222222222222222222222222" as `0x${string}`,
            topics: [
              "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
            ],
            data: "0x",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 0,
            removed: false,
          },
        ],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(mockTransactionResult, receipt);

      const permissionEvent = result.expectedEvents
        .PermissionGranted as unknown as {
        fileId: bigint;
        grantee: `0x${string}`;
        expiresAt: bigint;
      };

      expect(permissionEvent.fileId).toBe(42n);
      expect(permissionEvent.grantee).toBe(
        "0x1234567890123456789012345678901234567890",
      );
      expect(permissionEvent.expiresAt).toBe(1234567890n);
    });

    it("should handle args as Record<string, unknown> in allEvents", () => {
      const receipt: TransactionReceipt = {
        blockHash: "0xblock123" as `0x${string}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1000000n,
        effectiveGasPrice: 1000000000n,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        gasUsed: 50000n,
        logs: [
          {
            address:
              "0x2222222222222222222222222222222222222222" as `0x${string}`,
            topics: [
              "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
            ],
            data: "0x",
            blockNumber: 100n,
            transactionHash: "0xabc123" as `0x${string}`,
            transactionIndex: 0,
            blockHash: "0xblock123" as `0x${string}`,
            logIndex: 0,
            removed: false,
          },
        ],
        logsBloom: "0x" as `0x${string}`,
        status: "success",
        to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        transactionHash: "0xabc123" as `0x${string}`,
        transactionIndex: 0,
        type: "0x2",
      };

      const result = parseTransaction(mockTransactionResult, receipt);

      expect(result.allEvents[0].args).toBeDefined();
      expect(typeof result.allEvents[0].args).toBe("object");
      expect(result.allEvents[0].args).toHaveProperty("fileId");
      expect(result.allEvents[0].args).toHaveProperty("grantee");
      expect(result.allEvents[0].args).toHaveProperty("expiresAt");
    });
  });
});
