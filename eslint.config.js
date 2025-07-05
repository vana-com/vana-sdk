import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import globals from "globals";

export default [
  // Ignore patterns for monorepo
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".vercel/**",
      ".next/**",
      "out/**",
      "coverage/**",
      "*.log",
      ".DS_Store",
      "examples/**", // Ignore all examples
      "packages/**", // Let each package handle its own linting
      ".eslintignore",
    ],
  },

  // Base JavaScript config
  js.configs.recommended,

  // Root level config files only
  {
    files: ["*.config.js", "*.config.ts"],
    plugins: {
      "@typescript-eslint": tseslint,
      prettier: prettierPlugin,
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      "no-console": "off",
      "prettier/prettier": "error",
    },
  },

  // Prettier config (should be last)
  prettierConfig,
];
