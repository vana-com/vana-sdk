import { describe, it, expect } from "vitest";
import { tx } from "../transactionHelpers";
import { parseTransaction } from "../parseTransactionPojo";
import type { TransactionResult } from "../../types/operations";
import type { TransactionReceipt } from "viem";
import type { Contract, Fn } from "../../generated/event-types";

describe("POJO Serialization and Next.js Compatibility", () => {
  describe("TransactionResult POJOs", () => {
    it("survives JSON.stringify/parse cycle without data loss", () => {
      const original = tx({
        hash: "0x1234567890abcdef" as `0x${string}`,
        from: "0xabcdef1234567890" as `0x${string}`,
        contract: "DataPortabilityPermissions",
        fn: "addPermission",
      });

      // Simulate Next.js SSR serialization
      const serialized = JSON.stringify(original);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(original);
      expect(deserialized.hash).toBe(original.hash);
      expect(deserialized.from).toBe(original.from);
      expect(deserialized.contract).toBe(original.contract);
      expect(deserialized.fn).toBe(original.fn);
    });

    it("contains no functions or non-serializable properties", () => {
      const result = tx({
        hash: "0xtest" as `0x${string}`,
        from: "0xaddr" as `0x${string}`,
        contract: "DataRegistry",
        fn: "addFile",
      });

      // Check all properties are serializable
      for (const [, value] of Object.entries(result)) {
        expect(typeof value).not.toBe("function");
        expect(typeof value).not.toBe("symbol");
        expect(value).not.toBe(undefined);

        // Should not be a class instance
        if (typeof value === "object" && value !== null) {
          // Type guard: Object.entries returns values of type 'unknown'
          const obj = value as object;
          expect(Object.getPrototypeOf(obj)).toBe(Object.prototype);
        }
      }
    });

    it("works with Next.js getServerSideProps pattern", () => {
      // Simulate server-side
      const serverSideResult = tx({
        hash: "0xserver" as `0x${string}`,
        from: "0xserveraddr" as `0x${string}`,
        contract: "DataPortabilityServers",
        fn: "trustServer",
      });

      // Simulate Next.js serialization for props
      const props = {
        transaction: serverSideResult,
      };

      // This is what Next.js does internally
      const serializedProps = JSON.parse(JSON.stringify(props));

      // On client side
      const clientTransaction = serializedProps.transaction;

      expect(clientTransaction).toEqual(serverSideResult);
      expect(clientTransaction.hash).toBe("0xserver");
      expect(clientTransaction.contract).toBe("DataPortabilityServers");
      expect(clientTransaction.fn).toBe("trustServer");
    });

    it("works with Next.js API routes pattern", () => {
      // In API route
      const apiResult = tx({
        hash: "0xapi" as `0x${string}`,
        from: "0xapiaddr" as `0x${string}`,
        contract: "DataPortabilityGrantees",
        fn: "registerGrantee",
      });

      // Simulate API response
      const apiResponse = {
        success: true,
        data: apiResult,
      };

      // Convert to JSON (as Next.js API does)
      const jsonResponse = JSON.stringify(apiResponse);

      // Parse on client
      const clientData = JSON.parse(jsonResponse);

      expect(clientData.data).toEqual(apiResult);
      expect(clientData.data.contract).toBe("DataPortabilityGrantees");
      expect(clientData.data.fn).toBe("registerGrantee");
    });

    it("handles nested serialization in complex structures", () => {
      const transaction1 = tx({
        hash: "0x111" as `0x${string}`,
        from: "0xaaa" as `0x${string}`,
        contract: "DataRegistry",
        fn: "addFile",
      });

      const transaction2 = tx({
        hash: "0x222" as `0x${string}`,
        from: "0xbbb" as `0x${string}`,
        contract: "DataRegistry",
        fn: "addFile",
      });

      const complexStructure = {
        user: {
          address: "0xuser",
          transactions: [transaction1, transaction2],
        },
        metadata: {
          timestamp: Date.now(),
          version: "1.0.0",
        },
        recentTransaction: transaction1,
      };

      const serialized = JSON.stringify(complexStructure);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.user.transactions[0]).toEqual(transaction1);
      expect(deserialized.user.transactions[1]).toEqual(transaction2);
      expect(deserialized.recentTransaction).toEqual(transaction1);
    });

    it("maintains type information that can be reconstructed", () => {
      const original = tx({
        hash: "0xtype" as `0x${string}`,
        from: "0xtypeaddr" as `0x${string}`,
        contract: "DataPortabilityPermissions",
        fn: "revokePermission",
      });

      const serialized = JSON.stringify(original);
      const deserialized = JSON.parse(serialized);

      // Type guards can be used to reconstruct types
      /**
       * Checks if a transaction is a permission transaction.
       *
       * @param tx - The transaction object to check
       * @returns True if the transaction is a permission transaction
       */
      function isPermissionTransaction(
        tx: unknown,
      ): tx is TransactionResult<
        "DataPortabilityPermissions",
        "revokePermission"
      > {
        return (
          typeof tx === "object" &&
          tx !== null &&
          "contract" in tx &&
          "fn" in tx &&
          (tx as { contract: unknown; fn: unknown }).contract ===
            "DataPortabilityPermissions" &&
          (tx as { contract: unknown; fn: unknown }).fn === "revokePermission"
        );
      }

      expect(isPermissionTransaction(deserialized)).toBe(true);

      if (isPermissionTransaction(deserialized)) {
        // TypeScript now knows the exact type
        const { contract } = deserialized;
        const { fn } = deserialized;
        expect(contract).toBe("DataPortabilityPermissions");
        expect(fn).toBe("revokePermission");
      }
    });

    it("works with React state management", () => {
      // Simulate React useState with our POJO
      let state: TransactionResult<Contract, Fn<Contract>> | null = null;

      const setState = (
        newState: TransactionResult<Contract, Fn<Contract>>,
      ) => {
        // React internally uses Object.is for comparison
        // POJOs work perfectly with this
        state = newState;
      };

      const transaction = tx({
        hash: "0xreact" as `0x${string}`,
        from: "0xreactaddr" as `0x${string}`,
        contract: "ComputeInstructionRegistry",
        fn: "addComputeInstruction",
      });

      setState(transaction);

      expect(state).toBe(transaction);
      expect(state).toBeDefined();
      expect(state!.contract).toBe("ComputeInstructionRegistry");

      // Creating a new object (React re-render trigger)
      const newTransaction = tx({
        hash: "0xnewreact" as `0x${string}`,
        from: "0xnewaddr" as `0x${string}`,
        contract: "ComputeInstructionRegistry",
        fn: "updateComputeInstruction",
      });

      setState(newTransaction);

      expect(state).not.toBe(transaction); // Different object
      expect(state).toBe(newTransaction);
    });

    it("works with Redux/Zustand state serialization", () => {
      // Simulate Redux/Zustand store
      const store = {
        transactions: [] as TransactionResult<Contract, Fn<Contract>>[],
      };

      // Add transactions
      store.transactions.push(
        tx({
          hash: "0x1" as `0x${string}`,
          from: "0xa1" as `0x${string}`,
          contract: "DataRegistry",
          fn: "addFile",
        }),
      );

      store.transactions.push(
        tx({
          hash: "0x2" as `0x${string}`,
          from: "0xa2" as `0x${string}`,
          contract: "DataRegistry",
          fn: "addFile",
        }),
      );

      // Serialize entire store (for persistence/hydration)
      const serialized = JSON.stringify(store);
      const hydrated = JSON.parse(serialized);

      expect(hydrated.transactions).toHaveLength(2);
      expect(hydrated.transactions[0].fn).toBe("addFile");
      expect(hydrated.transactions[1].fn).toBe("addFile");
    });

    it("contains no circular references", () => {
      const result = tx({
        hash: "0xcircular" as `0x${string}`,
        from: "0xaddr" as `0x${string}`,
        contract: "DataPortabilityPermissions",
        fn: "addPermission",
      });

      // JSON.stringify would throw on circular references
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it("equals check works correctly for POJOs", () => {
      const props = {
        hash: "0xsame" as `0x${string}`,
        from: "0xsameaddr" as `0x${string}`,
        contract: "DataRegistry" as const,
        fn: "addFile" as const,
      };

      const result1 = tx(props);
      const result2 = tx(props);

      // Different objects
      expect(result1).not.toBe(result2);

      // But equal values (deep equality)
      expect(result1).toEqual(result2);

      // Can be compared with JSON.stringify for memoization
      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  describe("ParsedTransaction POJOs", () => {
    it("creates serializable parsed transaction results", () => {
      const txResult: TransactionResult<
        "DataPortabilityPermissions",
        "addPermission"
      > = {
        hash: "0xparsed" as `0x${string}`,
        from: "0xparsedaddr" as `0x${string}`,
        contract: "DataPortabilityPermissions",
        fn: "addPermission",
      };

      const receipt = {
        logs: [],
      } as unknown as TransactionReceipt;

      // Note: This uses the mocked parseTransaction
      const parsed = parseTransaction(txResult, receipt);

      // Should be serializable (excluding receipt which has bigints)
      const toSerialize = {
        hash: parsed.hash,
        from: parsed.from,
        contract: parsed.contract,
        fn: parsed.fn,
        expectedEvents: parsed.expectedEvents,
        allEvents: parsed.allEvents,
      };

      const serialized = JSON.stringify(toSerialize);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.hash).toBe("0xparsed");
      expect(deserialized.contract).toBe("DataPortabilityPermissions");
      expect(deserialized.fn).toBe("addPermission");
    });
  });
});
