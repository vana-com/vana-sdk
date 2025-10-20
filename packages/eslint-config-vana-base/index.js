import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";

/**
 * Base ESLint config for Vana
 * Philosophy: Catch real bugs, not style preferences
 * These rules apply everywhere: SDK, apps, tests
 */

// Export the config object for composition
export const baseConfigObject = {
  files: ["**/*.ts", "**/*.tsx"],
  plugins: {
    "@typescript-eslint": tseslint,
    import: importPlugin,
    "unused-imports": unusedImports,
  },
  languageOptions: {
    parser: tsparser,
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      projectService: true, // Enable type-aware rules
    },
  },
  rules: {
    // ===== HIGH-VALUE TYPE SAFETY (catch real runtime errors) =====
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-return": "error",
    "@typescript-eslint/no-unsafe-argument": "error",

    // ===== ASYNC CORRECTNESS (prevent unhandled rejections) =====
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/no-misused-promises": [
      "error",
      {
        checksVoidReturn: {
          attributes: false, // Don't complain about React onClick
        },
      },
    ],
    "@typescript-eslint/no-confusing-void-expression": "warn",

    // ===== NULLISH HANDLING (prevent || bugs) =====
    "@typescript-eslint/prefer-nullish-coalescing": [
      "error",
      {
        ignoreConditionalTests: true,
        ignoreTernaryTests: true,
        ignoreMixedLogicalExpressions: true,
      },
    ],

    // ===== IMPORT HYGIENE =====
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        prefer: "type-imports",
        fixStyle: "inline-type-imports",
        disallowTypeAnnotations: true,
      },
    ],
    "import/no-duplicates": "error",
    "unused-imports/no-unused-imports": "error",

    // ===== BASIC SANITY (as warnings) =====
    "@typescript-eslint/no-unused-vars": "off", // Let TS handle this
    "unused-imports/no-unused-vars": [
      "warn",
      {
        vars: "all",
        varsIgnorePattern: "^_",
        args: "after-used",
        argsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],

    // ===== TEMPLATE SAFETY =====
    "@typescript-eslint/restrict-template-expressions": "warn",

    // ===== THINGS WE DON'T CARE ABOUT =====
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/strict-boolean-expressions": "off",
    "@typescript-eslint/naming-convention": "off",
    "@typescript-eslint/require-await": "off",
    "@typescript-eslint/no-unnecessary-condition": "off",
  },
};

// Export as array for ESLint flat config format (default export for backward compat)
export default [baseConfigObject];

// Export individual pieces for composition
export const basePlugins = baseConfigObject.plugins;
export const baseLanguageOptions = baseConfigObject.languageOptions;
export const baseRules = baseConfigObject.rules;
