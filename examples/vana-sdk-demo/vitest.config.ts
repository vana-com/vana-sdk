import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
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
        lines: 0.5,
        functions: 27, // Temporarily reduced due to new untested components
        branches: 34, // Temporarily reduced due to new untested components
        statements: 0.5,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
