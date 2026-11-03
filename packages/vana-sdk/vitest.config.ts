import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // DOM tests opt in per file with `// @vitest-environment happy-dom`.
    // Framed pages (the connect sheet) must never load during tests.
    environmentOptions: {
      happyDOM: {
        settings: {
          disableIframePageLoading: true,
          navigation: { disableChildFrameNavigation: true },
        },
      },
    },
    include: ["src/**/*.test.ts"],
    exclude: ["examples/**", "node_modules/**"],
    setupFiles: ["src/tests/setup.ts"],
    reporters: "dot",
    coverage: {
      provider: "v8",
      reporter: ["text-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "node_modules/",
        "dist/",
        "examples/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "src/types.ts",
        "src/platform/interface.ts",
        "src/types/",
        "src/generated/",
        "**/*.d.ts",
      ],
      reportOnFailure: true,
      thresholds: {
        statements: 65,
        branches: 81.8,
        functions: 85,
        lines: 65,
      },
    },
  },
});
