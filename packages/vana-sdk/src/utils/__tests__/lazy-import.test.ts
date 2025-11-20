/**
 * Tests for lazy import utilities
 *
 * @remarks
 * Tests cached lazy module loading to prevent Temporal Dead Zone issues.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { lazyImport } from "../lazy-import";

describe("lazy-import", () => {
  describe("lazyImport", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should lazy load module on first call", async () => {
      const mockModule = { value: "test" };
      const importFn = vi.fn(() => Promise.resolve(mockModule));

      const loader = lazyImport(importFn);

      // Import not called yet
      expect(importFn).not.toHaveBeenCalled();

      const result = await loader();

      expect(importFn).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockModule);
    });

    it("should cache the import promise", async () => {
      const mockModule = { value: "test" };
      const importFn = vi.fn(() => Promise.resolve(mockModule));

      const loader = lazyImport(importFn);

      const result1 = await loader();
      const result2 = await loader();
      const result3 = await loader();

      // Import function called only once
      expect(importFn).toHaveBeenCalledTimes(1);
      expect(result1).toBe(mockModule);
      expect(result2).toBe(mockModule);
      expect(result3).toBe(mockModule);
    });

    it("should handle concurrent first calls without race conditions", async () => {
      const mockModule = { value: "test" };
      const importFn = vi.fn(() => Promise.resolve(mockModule));

      const loader = lazyImport(importFn);

      // Call loader multiple times concurrently
      const results = await Promise.all([loader(), loader(), loader()]);

      // Import function called only once despite concurrent calls
      expect(importFn).toHaveBeenCalledTimes(1);
      expect(results).toEqual([mockModule, mockModule, mockModule]);
    });

    it("should clear cache on import failure", async () => {
      const error = new Error("Import failed");
      let callCount = 0;
      const importFn = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(error);
        }
        return Promise.resolve({ value: "success" });
      });

      const loader = lazyImport(importFn);

      // First call should fail
      await expect(loader()).rejects.toThrow("Failed to load module");
      expect(importFn).toHaveBeenCalledTimes(1);

      // Second call should retry (cache was cleared)
      const result = await loader();
      expect(importFn).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ value: "success" });
    });

    it("should wrap import errors with context", async () => {
      const originalError = new Error("Module not found");
      const importFn = vi.fn(() => Promise.reject(originalError));

      const loader = lazyImport(importFn);

      await expect(loader()).rejects.toThrow("Failed to load module");

      try {
        await loader();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toBe("Failed to load module");
        expect((err as { cause?: Error }).cause).toBe(originalError);
      }
    });

    it("should handle modules with complex exports", async () => {
      const mockModule = {
        default: { main: "value" },
        namedExport1: "export1",
        namedExport2: "export2",
        nestedObject: {
          deep: {
            value: 42,
          },
        },
      };
      const importFn = vi.fn(() => Promise.resolve(mockModule));

      const loader = lazyImport(importFn);
      const result = await loader();

      expect(result).toEqual(mockModule);
      expect(result.default.main).toBe("value");
      expect(result.namedExport1).toBe("export1");
      expect(result.nestedObject.deep.value).toBe(42);
    });

    it("should handle module with class exports", async () => {
      class TestClass {
        constructor(public value: string) {}
      }

      const mockModule = {
        TestClass,
        instance: new TestClass("test"),
      };
      const importFn = vi.fn(() => Promise.resolve(mockModule));

      const loader = lazyImport(importFn);
      const result = await loader();

      expect(result.TestClass).toBe(TestClass);
      expect(result.instance).toBeInstanceOf(TestClass);
      expect(result.instance.value).toBe("test");
    });

    it("should handle module with function exports", async () => {
      const mockFunction = vi.fn((x: number) => x * 2);
      const mockModule = {
        multiply: mockFunction,
        add: (a: number, b: number) => a + b,
      };
      const importFn = vi.fn(() => Promise.resolve(mockModule));

      const loader = lazyImport(importFn);
      const result = await loader();

      expect(result.multiply(5)).toBe(10);
      expect(result.add(3, 4)).toBe(7);
      expect(mockFunction).toHaveBeenCalledWith(5);
    });

    it("should preserve module state across calls", async () => {
      let counter = 0;
      const mockModule = {
        getCount: () => counter,
        increment: () => ++counter,
      };
      const importFn = vi.fn(() => Promise.resolve(mockModule));

      const loader = lazyImport(importFn);

      const module1 = await loader();
      expect(module1.getCount()).toBe(0);
      module1.increment();

      const module2 = await loader();
      expect(module2.getCount()).toBe(1); // State preserved
      expect(module2).toBe(module1); // Same instance
    });

    it("should handle delay in module loading", async () => {
      const mockModule = { value: "loaded" };
      const importFn = vi.fn(
        () =>
          new Promise<typeof mockModule>((resolve) => {
            setTimeout(() => {
              resolve(mockModule);
            }, 100);
          }),
      );

      const loader = lazyImport(importFn);

      const startTime = Date.now();
      const result = await loader();
      const endTime = Date.now();

      expect(result).toBe(mockModule);
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });

    it("should handle empty module exports", async () => {
      const mockModule = {};
      const importFn = vi.fn(() => Promise.resolve(mockModule));

      const loader = lazyImport(importFn);
      const result = await loader();

      expect(result).toEqual({});
    });

    it("should handle module with null/undefined values", async () => {
      const mockModule = {
        nullValue: null,
        undefinedValue: undefined,
        zeroValue: 0,
        emptyString: "",
      };
      const importFn = vi.fn(() => Promise.resolve(mockModule));

      const loader = lazyImport(importFn);
      const result = await loader();

      expect(result.nullValue).toBeNull();
      expect(result.undefinedValue).toBeUndefined();
      expect(result.zeroValue).toBe(0);
      expect(result.emptyString).toBe("");
    });

    it("should create independent loaders for different modules", async () => {
      const module1 = { name: "module1" };
      const module2 = { name: "module2" };

      const importFn1 = vi.fn(() => Promise.resolve(module1));
      const importFn2 = vi.fn(() => Promise.resolve(module2));

      const loader1 = lazyImport(importFn1);
      const loader2 = lazyImport(importFn2);

      const result1 = await loader1();
      const result2 = await loader2();

      expect(result1).toBe(module1);
      expect(result2).toBe(module2);
      expect(importFn1).toHaveBeenCalledTimes(1);
      expect(importFn2).toHaveBeenCalledTimes(1);
    });

    it("should handle synchronous errors in import function", async () => {
      const syncError = new Error("Sync error");
      const importFn = vi.fn(() => {
        // Synchronous throw in Promise executor
        return new Promise(() => {
          throw syncError;
        });
      });

      const loader = lazyImport(importFn);

      // Should handle as import failure
      await expect(loader()).rejects.toThrow("Failed to load module");
    });

    it("should allow retry after multiple failures", async () => {
      let attempts = 0;
      const importFn = vi.fn(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error(`Attempt ${attempts} failed`));
        }
        return Promise.resolve({ value: "success" });
      });

      const loader = lazyImport(importFn);

      // First attempt fails
      await expect(loader()).rejects.toThrow("Failed to load module");
      expect(attempts).toBe(1);

      // Second attempt fails
      await expect(loader()).rejects.toThrow("Failed to load module");
      expect(attempts).toBe(2);

      // Third attempt succeeds
      const result = await loader();
      expect(result).toEqual({ value: "success" });
      expect(attempts).toBe(3);

      // Fourth call uses cached success
      await loader();
      expect(attempts).toBe(3); // No additional import
    });

    it("should handle Promise rejection with non-Error values", async () => {
      const importFn = vi.fn(() => Promise.reject("string error"));

      const loader = lazyImport(importFn);

      await expect(loader()).rejects.toThrow("Failed to load module");
    });

    it("should type check correctly with generic type parameter", async () => {
      interface TestModule {
        version: string;
        initialize: () => void;
      }

      const mockModule: TestModule = {
        version: "1.0.0",
        initialize: vi.fn(),
      };

      const importFn = () => Promise.resolve(mockModule);
      const loader = lazyImport<TestModule>(importFn);

      const result = await loader();

      // Type checking (compile time)
      const version: string = result.version;
      const initialize: () => void = result.initialize;

      expect(version).toBe("1.0.0");
      expect(initialize).toBeDefined();
    });

    it("should handle large module objects", async () => {
      const largeModule: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        largeModule[`key${i}`] = i;
      }

      const importFn = vi.fn(() => Promise.resolve(largeModule));
      const loader = lazyImport(importFn);

      const result = await loader();

      expect(Object.keys(result)).toHaveLength(1000);
      expect(result.key500).toBe(500);
    });

    it("should cache promise not just result", async () => {
      let resolveImport: (value: { data: string }) => void;
      const importPromise = new Promise<{ data: string }>((resolve) => {
        resolveImport = resolve;
      });

      const importFn = vi.fn(() => importPromise);
      const loader = lazyImport(importFn);

      // Start first call (doesn't await)
      const promise1 = loader();
      // Start second call while first is pending
      const promise2 = loader();

      // Both should get same promise
      expect(importFn).toHaveBeenCalledTimes(1);

      // Resolve the import
      resolveImport!({ data: "test" });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual({ data: "test" });
      expect(result2).toEqual({ data: "test" });
      expect(result1).toBe(result2);
    });
  });
});
