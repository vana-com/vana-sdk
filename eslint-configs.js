import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";
import tsdocPlugin from "eslint-plugin-tsdoc";

/**
 * Consolidated ESLint configurations for Vana monorepo
 *
 * Three layers of rules:
 * 1. Base: Core safety rules that catch real bugs
 * 2. SDK: Strict rules for public API quality
 * 3. Apps: Pragmatic rules for demos and examples
 */

// ===== BASE LAYER: CORE SAFETY RULES =====
// Philosophy: Catch real bugs, not style preferences
// These rules apply everywhere: SDK, apps, tests
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

// ===== SDK LAYER: PUBLIC API QUALITY =====
// Philosophy: Public APIs need strict types and documentation
// Applied to: packages/vana-sdk/src/**
export const sdkConfigObject = {
  files: ["**/*.ts"],
  plugins: {
    ...baseConfigObject.plugins,
    tsdoc: tsdocPlugin,
  },
  rules: {
    ...baseConfigObject.rules,

    // ===== PUBLIC API QUALITY =====
    // No 'any' in public API - consumers need proper types
    "@typescript-eslint/no-explicit-any": "error",

    // Public API must have explicit types for better IntelliSense
    "@typescript-eslint/explicit-module-boundary-types": "error",

    // TSDoc syntax must be correct (for API docs generation)
    "tsdoc/syntax": "error",

    // ===== DEAD CODE DETECTION =====
    // Warn about always-true/false conditions
    "@typescript-eslint/no-unnecessary-condition": "warn",

    // ===== NO NON-NULL ASSERTIONS IN PUBLIC API =====
    "@typescript-eslint/no-non-null-assertion": "error",

    // ===== TEMPLATE EXPRESSIONS STRICT IN SDK =====
    "@typescript-eslint/restrict-template-expressions": "error",

    // ===== VOID EXPRESSION CLARITY =====
    "@typescript-eslint/no-confusing-void-expression": "error",
  },
};

// ===== APPS LAYER: PRAGMATIC DEMO RULES =====
// Philosophy: Example code should be clear and educational, not ceremonial
// Applied to: examples/**
export const appsConfigObject = {
  files: ["**/*.ts", "**/*.tsx"],
  rules: {
    ...baseConfigObject.rules,

    // ===== RELAXED FOR PROTOTYPING =====
    // Warn instead of error for any (demos sometimes need quick hacks)
    "@typescript-eslint/no-explicit-any": "warn",

    // Non-null assertions are sometimes clearer in examples
    "@typescript-eslint/no-non-null-assertion": "warn",

    // ===== DEMO-FRIENDLY RULES =====
    // Console is essential for demos
    "no-console": "off",

    // No return type requirements - keep examples readable
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",

    // ===== DOWNGRADE STRICTNESS =====
    // These are still good to know about but not critical in demos
    "@typescript-eslint/no-unsafe-assignment": "warn",
    "@typescript-eslint/no-unsafe-member-access": "warn",
    "@typescript-eslint/no-unsafe-call": "warn",
    "@typescript-eslint/no-unsafe-return": "warn",
    "@typescript-eslint/no-unsafe-argument": "warn",

    // Template expressions can be looser in demos
    "@typescript-eslint/restrict-template-expressions": "warn",

    // Void expressions less critical in demos
    "@typescript-eslint/no-confusing-void-expression": "warn",

    // ===== COMPONENT NAMING =====
    // Allow PascalCase for React components
    "@typescript-eslint/naming-convention": [
      "warn",
      {
        selector: "function",
        format: ["camelCase", "PascalCase"],
      },
      {
        selector: "variable",
        format: ["camelCase", "PascalCase", "UPPER_CASE"],
      },
    ],
  },
};

// Export individual rule sets for composition
export const baseRules = baseConfigObject.rules;
export const sdkRules = sdkConfigObject.rules;
export const appsRules = appsConfigObject.rules;
