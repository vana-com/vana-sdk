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
        // Add tests instead of lowering these
        lines: 15,
        functions: 45,
        branches: 25,
        statements: 15,
      },
    },
  },
});
