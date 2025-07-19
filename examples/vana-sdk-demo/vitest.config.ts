import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "out/**"],
    setupFiles: ["src/tests/setup.ts"],
    reporters: "dot",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "node_modules/",
        ".next/",
        "out/",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/*.spec.tsx",
        "src/app/layout.tsx", // Layout file - minimal testable logic
        "src/app/providers.tsx", // Provider wrapper - minimal testable logic
        "src/lib/ws-shim.js", // WebSocket shim - third-party compatibility
      ],
      reportOnFailure: true,
      thresholds: {
        lines: 30, // Aggressive target based on current coverage of critical components
        functions: 70, // High threshold for function coverage
        branches: 50, // Reasonable branch coverage threshold
        statements: 30, // Match lines coverage for consistency
        // Per-file thresholds for critical components
        'src/hooks/**/*.ts': {
          lines: 60,
          functions: 80,
          branches: 40,
          statements: 60,
        },
        'src/providers/**/*.tsx': {
          lines: 40,
          functions: 75,
          branches: 25,
          statements: 40,
        },
      },
    },
  },
});
