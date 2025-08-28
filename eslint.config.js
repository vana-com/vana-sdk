import {
  baseConfigObject,
  sdkConfigObject,
  appsConfigObject,
  appsRules,
} from "./eslint-configs.js";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

/**
 * Root ESLint configuration for Vana monorepo
 *
 * Architecture:
 * - SDK gets strict rules (no any, must document API)
 * - Apps get pragmatic rules (warnings for most things)
 * - Tests get relaxed rules (anything goes)
 * - Prettier handles ALL formatting
 *
 * Philosophy:
 * - Catch real bugs, not style preferences
 * - Different code has different purposes
 * - Signal over noise
 */

export default [
  // ===== GLOBAL IGNORES =====
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/build/**",
      "**/.next/**",
      "**/out/**",
      "**/*.min.js",
      "**/.vercel/**",
      "**/docs/**",
      "**/vitest.config.ts",
      "**/src/generated/**",
      "**/test-builds/**",
      "**/tsup*.config.ts",
      "packages/vana-sdk/test-pnpm-app/**",
      "temp-test/**",
      "packages/vana-sdk/codegen.ts",
    ],
  },

  // ===== SDK: STRICT RULES FOR LIBRARY CODE =====
  {
    ...baseConfigObject,
    files: ["packages/vana-sdk/src/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.spec.ts", "**/tests/**", "**/test/**"],
  },
  {
    ...sdkConfigObject,
    files: ["packages/vana-sdk/src/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.spec.ts", "**/tests/**", "**/test/**"],
  },

  // ===== APPS: PRAGMATIC RULES FOR EXAMPLES =====
  {
    ...baseConfigObject,
    files: ["examples/**/*.ts", "examples/**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
  },
  {
    ...appsConfigObject,
    files: ["examples/**/*.ts", "examples/**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
  },

  // ===== SCRIPTS & BUILD CONFIGS =====
  {
    ...baseConfigObject,
    files: ["packages/vana-sdk/scripts/**/*.ts", "**/*.config.{js,ts,mjs}"],
    languageOptions: {
      ...baseConfigObject.languageOptions,
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ...appsConfigObject,
    files: ["packages/vana-sdk/scripts/**/*.ts", "**/*.config.{js,ts,mjs}"],
    languageOptions: {
      ...baseConfigObject.languageOptions,
      globals: {
        ...globals.node,
      },
    },
  },

  // ===== TESTS: MAXIMUM RELAXATION =====
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/tests/**", "**/test/**"],
    ...baseConfigObject,
    rules: {
      ...appsRules,
      // Tests can use any
      "@typescript-eslint/no-explicit-any": "off",

      // Tests can be unsafe
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",

      // Tests can have floating promises (intentional in some cases)
      "@typescript-eslint/no-floating-promises": "warn",

      // Tests can use console
      "no-console": "off",

      // Tests don't need docs
      "tsdoc/syntax": "off",

      // Tests can use non-null assertions
      "@typescript-eslint/no-non-null-assertion": "off",

      // Tests can have unused imports during development
      "unused-imports/no-unused-imports": "warn",
      // Allow underscore-prefixed unused variables in tests (common pattern for intentionally unused params)
      "unused-imports/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      // Allow import() type annotations in test mocks (Vitest pattern)
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          disallowTypeAnnotations: false,
        },
      ],
    },
  },

  // ===== CONFIG FILES: JavaScript config files (Next.js, PostCSS, etc) =====
  {
    files: [
      "**/next.config.js",
      "**/postcss.config.js",
      "**/*.config.js",
      "**/*.config.mjs",
    ],
    languageOptions: {
      parserOptions: {
        sourceType: "module",
      },
    },
    rules: {
      // Config files can use commonjs and don't need strict typing
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },

  // ===== PRETTIER: HANDLES ALL FORMATTING (MUST BE LAST) =====
  prettierConfig,
];
