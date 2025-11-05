/**
 * Tests for withEvents helpers
 *
 * @remarks
 * Tests event waiting and transformation helpers for POJO-based transactions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { withEvents, txWithEvents, txForRelayed } from "../withEvents";
import type { TransactionResult } from "../../types/operations";
import type { TypedTransactionResult } from "../../generated/event-types";

describe("withEvents", () => {
  const mockWaitFor = vi.fn();

  const mockTransactionResult: TransactionResult<
    "DataPortabilityPermissions",
    "addPermission"
  > = {
    hash: "0xabc123" as `0x${string}`,
    from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
    contract: "DataPortabilityPermissions",
    fn: "addPermission",
  };

  const mockTypedResult: TypedTransactionResult<
    "DataPortabilityPermissions",
    "addPermission"
  > = {
    hash: "0xabc123" as `0x${string}`,
    from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
    contract: "DataPortabilityPermissions",
    fn: "addPermission",
    expectedEvents: {
      PermissionAdded: {
        permissionId: 1n,
        user: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        granteeId: 5n,
        grant: "0xgrantdata",
        fileIds: [42n],
      },
    },
    allEvents: [
      {
        contractAddress: "0x2222222222222222222222222222222222222222",
        eventName: "PermissionAdded",
        args: {
          permissionId: 1n,
          user: "0x1234567890123456789012345678901234567890" as `0x${string}`,
          granteeId: 5n,
          grant: "0xgrantdata",
          fileIds: [42n],
        },
        logIndex: 0,
      },
    ],
    hasExpectedEvents: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWaitFor.mockResolvedValue(mockTypedResult);
  });

  describe("withEvents", () => {
    it("should wait for events and apply selector", async () => {
      const select = (
        result: TypedTransactionResult<
          "DataPortabilityPermissions",
          "addPermission"
        >,
      ) => {
        return {
          fileId: (
            result.expectedEvents.PermissionAdded as {
              fileIds: readonly bigint[];
            }
          ).fileIds[0],
          success: true,
        };
      };

      const result = await withEvents(
        mockWaitFor,
        mockTransactionResult,
        select,
      );

      expect(mockWaitFor).toHaveBeenCalledWith(mockTransactionResult);
      expect(result).toEqual({
        fileId: 42n,
        success: true,
      });
    });

    it("should pass through typed result to selector", async () => {
      const select = vi.fn((result) => result.hash);

      await withEvents(mockWaitFor, mockTransactionResult, select);

      expect(select).toHaveBeenCalledWith(mockTypedResult);
      expect(select).toHaveReturnedWith("0xabc123");
    });

    it("should handle selector returning primitive values", async () => {
      const select = () => 123;

      const result = await withEvents(
        mockWaitFor,
        mockTransactionResult,
        select,
      );

      expect(result).toBe(123);
    });

    it("should handle selector returning objects", async () => {
      const select = (
        result: TypedTransactionResult<
          "DataPortabilityPermissions",
          "addPermission"
        >,
      ) => ({
        hash: result.hash,
        eventCount: result.allEvents.length,
      });

      const result = await withEvents(
        mockWaitFor,
        mockTransactionResult,
        select,
      );

      expect(result).toEqual({
        hash: "0xabc123",
        eventCount: 1,
      });
    });

    it("should handle selector returning arrays", async () => {
      const select = (
        result: TypedTransactionResult<
          "DataPortabilityPermissions",
          "addPermission"
        >,
      ) => result.allEvents.map((e) => e.eventName);

      const result = await withEvents(
        mockWaitFor,
        mockTransactionResult,
        select,
      );

      expect(result).toEqual(["PermissionAdded"]);
    });

    it("should handle selector extracting event data", async () => {
      const select = (
        result: TypedTransactionResult<
          "DataPortabilityPermissions",
          "addPermission"
        >,
      ) => {
        const event = result.expectedEvents.PermissionAdded as unknown as {
          fileIds: readonly bigint[];
          user: `0x${string}`;
        };
        return {
          fileId: Number(event.fileIds[0]),
          grantee: event.user,
        };
      };

      const result = await withEvents(
        mockWaitFor,
        mockTransactionResult,
        select,
      );

      expect(result).toEqual({
        fileId: 42,
        grantee: "0x1234567890123456789012345678901234567890",
      });
    });

    it("should propagate errors from waitFor", async () => {
      mockWaitFor.mockRejectedValue(new Error("Transaction reverted"));

      const select = (
        result: TypedTransactionResult<
          "DataPortabilityPermissions",
          "addPermission"
        >,
      ) => result.hash;

      await expect(
        withEvents(mockWaitFor, mockTransactionResult, select),
      ).rejects.toThrow("Transaction reverted");
    });

    it("should propagate errors from selector", async () => {
      const select = () => {
        throw new Error("Selector failed");
      };

      await expect(
        withEvents(mockWaitFor, mockTransactionResult, select),
      ).rejects.toThrow("Selector failed");
    });

    it("should handle selector with no expected events", async () => {
      const noEventResult: TypedTransactionResult<
        "DataPortabilityPermissions",
        "addPermission"
      > = {
        ...mockTypedResult,
        expectedEvents: {},
        hasExpectedEvents: false,
      };

      mockWaitFor.mockResolvedValue(noEventResult);

      const select = (
        result: TypedTransactionResult<
          "DataPortabilityPermissions",
          "addPermission"
        >,
      ) => ({
        hasEvents: result.hasExpectedEvents,
        hash: result.hash,
      });

      const result = await withEvents(
        mockWaitFor,
        mockTransactionResult,
        select,
      );

      expect(result).toEqual({
        hasEvents: false,
        hash: "0xabc123",
      });
    });

    it("should work with different contract/function combinations", async () => {
      const fileRegistryTx: TransactionResult<"DataRegistry", "addFile"> = {
        hash: "0xdef456" as `0x${string}`,
        from: "0x5555555555555555555555555555555555555555" as `0x${string}`,
        contract: "DataRegistry",
        fn: "addFile",
      };

      const fileRegistryResult: TypedTransactionResult<
        "DataRegistry",
        "addFile"
      > = {
        hash: "0xdef456" as `0x${string}`,
        from: "0x5555555555555555555555555555555555555555" as `0x${string}`,
        contract: "DataRegistry",
        fn: "addFile",
        expectedEvents: {
          FileAdded: {
            fileId: 99n,
            ownerAddress:
              "0x5555555555555555555555555555555555555555" as `0x${string}`,
            url: "ipfs://test",
          },
        },
        allEvents: [],
        hasExpectedEvents: true,
      };

      const fileWaitFor = vi.fn().mockResolvedValue(fileRegistryResult);

      const select = (
        result: TypedTransactionResult<"DataRegistry", "addFile">,
      ) => {
        const event = result.expectedEvents.FileAdded as unknown as {
          fileId: bigint;
        };
        return event.fileId;
      };

      const result = await withEvents(fileWaitFor, fileRegistryTx, select);

      expect(result).toBe(99n);
    });
  });

  describe("txWithEvents", () => {
    it("should create tx result and wait for events", async () => {
      const select = (
        result: TypedTransactionResult<
          "DataPortabilityPermissions",
          "addPermission"
        >,
      ) => result.hash;

      const result = await txWithEvents(
        mockWaitFor,
        {
          hash: "0xabc123" as `0x${string}`,
          from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
          contract: "DataPortabilityPermissions",
          fn: "addPermission",
        },
        select,
      );

      expect(mockWaitFor).toHaveBeenCalled();
      expect(result).toBe("0xabc123");
    });

    it("should pass all fields to tx creator", async () => {
      const select = (
        result: TypedTransactionResult<
          "DataPortabilityPermissions",
          "addPermission"
        >,
      ) => result.hash;

      await txWithEvents(
        mockWaitFor,
        {
          hash: "0xabc123" as `0x${string}`,
          from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
          contract: "DataPortabilityPermissions",
          fn: "addPermission",
        },
        select,
      );

      const callArg = mockWaitFor.mock.calls[0][0];
      expect(callArg.hash).toBe("0xabc123");
      expect(callArg.from).toBe("0x1111111111111111111111111111111111111111");
      expect(callArg.contract).toBe("DataPortabilityPermissions");
      expect(callArg.fn).toBe("addPermission");
    });

    it("should work with complex selectors", async () => {
      const select = (
        result: TypedTransactionResult<
          "DataPortabilityPermissions",
          "addPermission"
        >,
      ) => ({
        success: result.hasExpectedEvents,
        events: result.allEvents.length,
      });

      const result = await txWithEvents(
        mockWaitFor,
        {
          hash: "0xabc123" as `0x${string}`,
          from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
          contract: "DataPortabilityPermissions",
          fn: "addPermission",
        },
        select,
      );

      expect(result).toEqual({
        success: true,
        events: 1,
      });
    });

    it("should propagate errors from waitFor", async () => {
      mockWaitFor.mockRejectedValue(new Error("Wait failed"));

      const select = (
        result: TypedTransactionResult<
          "DataPortabilityPermissions",
          "addPermission"
        >,
      ) => result.hash;

      await expect(
        txWithEvents(
          mockWaitFor,
          {
            hash: "0xabc123" as `0x${string}`,
            from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
            contract: "DataPortabilityPermissions",
            fn: "addPermission",
          },
          select,
        ),
      ).rejects.toThrow("Wait failed");
    });

    it("should propagate errors from selector", async () => {
      const select = () => {
        throw new Error("Selector error");
      };

      await expect(
        txWithEvents(
          mockWaitFor,
          {
            hash: "0xabc123" as `0x${string}`,
            from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
            contract: "DataPortabilityPermissions",
            fn: "addPermission",
          },
          select,
        ),
      ).rejects.toThrow("Selector error");
    });
  });

  describe("txForRelayed", () => {
    it("should create TransactionResult POJO", () => {
      const result = txForRelayed({
        hash: "0xabc123" as `0x${string}`,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        contract: "DataPortabilityPermissions",
        fn: "addPermission",
      });

      expect(result).toEqual({
        hash: "0xabc123",
        from: "0x1111111111111111111111111111111111111111",
        contract: "DataPortabilityPermissions",
        fn: "addPermission",
      });
    });

    it("should preserve all input fields", () => {
      const result = txForRelayed({
        hash: "0xdef456" as `0x${string}`,
        from: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        contract: "DataRegistry",
        fn: "addFile",
      });

      expect(result.hash).toBe("0xdef456");
      expect(result.from).toBe("0x2222222222222222222222222222222222222222");
      expect(result.contract).toBe("DataRegistry");
      expect(result.fn).toBe("addFile");
    });

    it("should return proper type for different contracts", () => {
      const result = txForRelayed({
        hash: "0x999" as `0x${string}`,
        from: "0x3333333333333333333333333333333333333333" as `0x${string}`,
        contract: "ComputeEngine",
        fn: "registerJob",
      });

      expect(result.contract).toBe("ComputeEngine");
      expect(result.fn).toBe("registerJob");
    });

    it("should create independent POJO instances", () => {
      const input = {
        hash: "0xabc123" as `0x${string}`,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        contract: "DataPortabilityPermissions" as const,
        fn: "addPermission" as const,
      };

      const result1 = txForRelayed(input);
      const result2 = txForRelayed(input);

      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2); // Different object instances
    });
  });

  describe("Integration Patterns", () => {
    it("should support typical controller usage pattern", async () => {
      // Simulating a controller method that grants permission
      const grantPermission = async (_fileId: number, _grantee: string) => {
        const tx: TransactionResult<
          "DataPortabilityPermissions",
          "addPermission"
        > = {
          hash: "0xabc123" as `0x${string}`,
          from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
          contract: "DataPortabilityPermissions",
          fn: "addPermission",
        };

        return withEvents(mockWaitFor, tx, (result) => {
          const event = result.expectedEvents.PermissionAdded as unknown as {
            fileIds: readonly bigint[];
            user: `0x${string}`;
          };
          return {
            fileId: Number(event.fileIds[0]),
            grantee: event.user,
          };
        });
      };

      const result = await grantPermission(
        42,
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toEqual({
        fileId: 42,
        grantee: "0x1234567890123456789012345678901234567890",
      });
    });

    it("should support relayed transaction pattern", async () => {
      // Step 1: Submit via relayer
      const txResult = txForRelayed({
        hash: "0xabc123" as `0x${string}`,
        from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        contract: "DataPortabilityPermissions",
        fn: "addPermission",
      });

      // Step 2: Wait externally (user code)
      const finalResult = await withEvents(
        mockWaitFor,
        txResult,
        (result) => result.hash,
      );

      expect(finalResult).toBe("0xabc123");
    });

    it("should support immediate wait pattern with txWithEvents", async () => {
      const result = await txWithEvents(
        mockWaitFor,
        {
          hash: "0xabc123" as `0x${string}`,
          from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
          contract: "DataPortabilityPermissions",
          fn: "addPermission",
        },
        (result) => ({
          hash: result.hash,
          success: result.hasExpectedEvents,
        }),
      );

      expect(result).toEqual({
        hash: "0xabc123",
        success: true,
      });
    });
  });
});
