/// <reference types="vitest" />
import { defineConfig } from "vite";
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
        lines: 15, // Current coverage level
        functions: 45, // Slightly below current level to allow for variation
        branches: 25, // Conservative threshold
        statements: 15, // Match lines coverage
        // Per-file thresholds for critical components
        "src/hooks/**/*.ts": {
          lines: 60,
          functions: 80,
          branches: 40,
          statements: 60,
        },
        "src/providers/**/*.tsx": {
          lines: 15,
          functions: 25, // Below current 27.27% to allow for variation
          branches: 10,
          statements: 15,
        },
      },
    },
  },
});
