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
        // Temporarily lowered for dual-mode ECIES support
        // Will be raised back once eccrypto-js is removed
        statements: 77.9,
        branches: 85.3,
        functions: 89.4,
        lines: 77.9,
      },
    },
  },
});
