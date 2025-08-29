import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
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
        // Coverage adjusted after removing legacy handler and its tests
        statements: 76,
        branches: 82.3,
        functions: 87,
        lines: 76,
      },
    },
  },
});
