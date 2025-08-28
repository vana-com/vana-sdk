import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "../core/generics";

describe("Core Generics Coverage", () => {
  let mockConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    mockConsoleError.mockRestore();
  });

  describe("EventEmitter async observer error handling", () => {
    it("should handle promise rejection in async observer (line 276)", async () => {
      const observable = new EventEmitter<string>();

      // Create an observer that returns a rejected promise
      const asyncObserver = {
        notify: vi
          .fn()
          .mockReturnValue(Promise.reject(new Error("Async observer error"))),
      };

      observable.subscribe(asyncObserver);

      // Emit an event - this should trigger the promise rejection handler
      observable.emit("test event");

      // Wait a bit for the async error to be handled
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(asyncObserver.notify).toHaveBeenCalledWith("test event");
      expect(mockConsoleError).toHaveBeenCalledWith(
        "Observer error:",
        expect.any(Error),
      );
    });

    it("should handle multiple async observers with mixed success/failure", async () => {
      const observable = new EventEmitter<string>();

      const successObserver = {
        notify: vi.fn().mockReturnValue(Promise.resolve("success")),
      };

      const failObserver = {
        notify: vi
          .fn()
          .mockReturnValue(Promise.reject(new Error("Fail observer error"))),
      };

      const syncObserver = {
        notify: vi.fn().mockReturnValue("sync result"),
      };

      observable.subscribe(successObserver);
      observable.subscribe(failObserver);
      observable.subscribe(syncObserver);

      observable.emit("mixed test");

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(successObserver.notify).toHaveBeenCalledWith("mixed test");
      expect(failObserver.notify).toHaveBeenCalledWith("mixed test");
      expect(syncObserver.notify).toHaveBeenCalledWith("mixed test");
      expect(mockConsoleError).toHaveBeenCalledWith(
        "Observer error:",
        expect.any(Error),
      );
    });

    it("should handle observer that throws synchronously", () => {
      const observable = new EventEmitter<string>();

      const throwingObserver = {
        notify: vi.fn().mockImplementation(() => {
          throw new Error("Sync observer error");
        }),
      };

      const normalObserver = {
        notify: vi.fn().mockReturnValue("normal result"),
      };

      observable.subscribe(throwingObserver);
      observable.subscribe(normalObserver);

      // This should not throw, but should log errors
      expect(() => {
        observable.emit("error test");
      }).not.toThrow();

      expect(throwingObserver.notify).toHaveBeenCalledWith("error test");
      expect(normalObserver.notify).toHaveBeenCalledWith("error test");
      expect(mockConsoleError).toHaveBeenCalledWith(
        "Observer error:",
        expect.any(Error),
      );
    });

    it("should handle promise that rejects with non-Error objects", async () => {
      const observable = new EventEmitter<string>();

      const nonErrorRejectObserver = {
        notify: vi.fn().mockReturnValue(Promise.reject("String error")),
      };

      observable.subscribe(nonErrorRejectObserver);

      observable.emit("non-error rejection");

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(nonErrorRejectObserver.notify).toHaveBeenCalledWith(
        "non-error rejection",
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        "Observer error:",
        "String error",
      );
    });

    it("should handle complex event data", async () => {
      const observable = new EventEmitter<{ action: string; data: unknown }>();

      const complexObserver = {
        notify: vi
          .fn()
          .mockReturnValue(Promise.reject(new Error("Complex event error"))),
      };

      observable.subscribe(complexObserver);

      const complexEvent = {
        action: "update",
        data: {
          user: { id: 123, name: "Test User" },
          metadata: { timestamp: Date.now(), version: "1.0" },
        },
      };

      observable.emit(complexEvent);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(complexObserver.notify).toHaveBeenCalledWith(complexEvent);
      expect(mockConsoleError).toHaveBeenCalledWith(
        "Observer error:",
        expect.any(Error),
      );
    });
  });
});
