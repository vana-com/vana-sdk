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
        statements: 81, // Adjusted after removing generated code and WASM
        branches: 86, // Adjusted after removing generated code and WASM
        functions: 90.5, // Functions coverage is good
        lines: 81, // Adjusted after removing generated code and WASM
      },
    },
  },
});
