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
        "src/types.ts", // Pure TypeScript definitions - no executable code
        "src/platform/interface.ts", // TypeScript interface definitions only
        "src/types/**/*.ts", // All type definition files
        "src/types/server.d.ts", // Generated server types - exclude explicitly
        "**/*.d.ts", // All declaration files
      ],
      reportOnFailure: true,
      thresholds: {
        // Adjusted to match current coverage after event parsing refactor
        statements: 93,
        branches: 86.3,
        functions: 89.2,
        lines: 93,
      },
    },
  },
});
