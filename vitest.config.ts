import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["examples/**", "node_modules/**"],
    setupFiles: ["src/tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "node_modules/",
        "dist/",
        "examples/",
        "**/*.test.ts",
        "**/*.spec.ts",
      ],
      reportOnFailure: true,
      thresholds: {
        lines: 99,
        functions: 99,
        branches: 90,
        statements: 99,
      },
    },
  },
});
