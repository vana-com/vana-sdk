import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("diagnostics", () => {
  let originalWarn: typeof console.warn;
  let warnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalWarn = console.warn;
    warnSpy = vi.fn();
    console.warn = warnSpy;
    // Clear the seen set by reloading the module
    vi.resetModules();
  });

  afterEach(() => {
    console.warn = originalWarn;
    delete process.env.VANA_SDK_SILENCE_WARNINGS;
  });

  describe("warnOnce", () => {
    it("should emit warning on first call", async () => {
      const { warnOnce } = await import("./diagnostics");

      warnOnce("Test warning");

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith("[vana-sdk]", "Test warning");
    });

    it("should not emit duplicate warnings", async () => {
      const { warnOnce } = await import("./diagnostics");

      warnOnce("Same message");
      warnOnce("Same message");
      warnOnce("Same message");

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("should emit different warnings", async () => {
      const { warnOnce } = await import("./diagnostics");

      warnOnce("Warning 1");
      warnOnce("Warning 2");
      warnOnce("Warning 3");

      expect(warnSpy).toHaveBeenCalledTimes(3);
    });

    it("should handle multiple arguments", async () => {
      const { warnOnce } = await import("./diagnostics");

      warnOnce("Error:", "Something went wrong", { code: 123 });

      expect(warnSpy).toHaveBeenCalledWith(
        "[vana-sdk]",
        "Error:",
        "Something went wrong",
        { code: 123 },
      );
    });

    it("should respect VANA_SDK_SILENCE_WARNINGS environment variable", async () => {
      process.env.VANA_SDK_SILENCE_WARNINGS = "1";
      const { warnOnce } = await import("./diagnostics");

      warnOnce("This should be silenced");

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should not silence when VANA_SDK_SILENCE_WARNINGS is not '1'", async () => {
      process.env.VANA_SDK_SILENCE_WARNINGS = "0";
      const { warnOnce } = await import("./diagnostics");

      warnOnce("This should not be silenced");

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("should handle non-process environments", async () => {
      // Mock a browser-like environment where process is undefined
      const originalProcess = global.process;
      (global as Record<string, unknown>).process = undefined;

      try {
        vi.resetModules();
        const { warnOnce } = await import("./diagnostics");

        warnOnce("Browser warning");

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith("[vana-sdk]", "Browser warning");
      } finally {
        global.process = originalProcess;
      }
    });

    it("should handle empty arguments", async () => {
      const { warnOnce } = await import("./diagnostics");

      warnOnce();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith("[vana-sdk]");
    });

    it("should handle null and undefined arguments", async () => {
      const { warnOnce } = await import("./diagnostics");

      warnOnce(null, undefined, "test");

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        "[vana-sdk]",
        null,
        undefined,
        "test",
      );
    });

    it("should handle process.env being null", async () => {
      const originalProcess = global.process;
      (global as Record<string, unknown>).process = { env: null };

      try {
        vi.resetModules();
        const { warnOnce } = await import("./diagnostics");

        warnOnce("Test warning with null env");

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
          "[vana-sdk]",
          "Test warning with null env",
        );
      } finally {
        global.process = originalProcess;
      }
    });

    it("should handle process.env.VANA_SDK_SILENCE_WARNINGS being undefined", async () => {
      process.env.VANA_SDK_SILENCE_WARNINGS = undefined;
      const { warnOnce } = await import("./diagnostics");

      warnOnce("Should not be silenced");

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("should deduplicate warnings with complex object arguments", async () => {
      const { warnOnce } = await import("./diagnostics");

      const complexObj = { a: 1, b: { c: 2 } };
      warnOnce("Complex:", complexObj);
      warnOnce("Complex:", complexObj); // Same object reference should be deduplicated

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("should handle different values for VANA_SDK_SILENCE_WARNINGS", async () => {
      process.env.VANA_SDK_SILENCE_WARNINGS = "true"; // Not "1", so should not silence
      const { warnOnce } = await import("./diagnostics");

      warnOnce("Should not be silenced");

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
