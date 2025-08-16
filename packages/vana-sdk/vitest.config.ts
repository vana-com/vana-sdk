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
        statements: 93,
        branches: 87,
        functions: 89.8, // Adjusted after removing validation code from permissions
        lines: 93,
      },
    },
  },
});
