import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";
import nextPlugin from "@next/eslint-plugin-next";
import jsdoc from "eslint-plugin-jsdoc";

export default [
  // Global ignore patterns
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
      "**/*.log",
      "**/.DS_Store",
      "**/.eslintignore",
      "**/docs/**",
      "**/vitest.config.ts",
      "**/src/generated/**", // Generated code - do not lint
      "**/test-builds/**", // Test build files - browser specific
      "**/benchmark-ecies.cjs", // Benchmark script
      "**/tsup*.config.ts", // Build config files
    ],
  },

  // Base JavaScript config
  js.configs.recommended,

  // TypeScript files configuration
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": tseslint,
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        projectService: true,
      },
      globals: {
        ...globals.nodeBuiltin,
        ...globals.browser,
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        global: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "no-redeclare": "off", // Disable base rule
      "@typescript-eslint/no-redeclare": [
        "error",
        {
          ignoreDeclarationMerge: true, // Allow TypeScript declaration merging
        },
      ], // Enable TypeScript-aware version with declaration merging
      "no-console": ["error", { allow: ["info", "debug", "warn", "error"] }],

      // Type Safety Rules - HIGH VALUE
      // TODO: Restore these to "error" after fixing issues
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",

      // Code Quality Rules
      "@typescript-eslint/no-unused-vars": [
        "warn", // TODO: Restore to "error"
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "warn", // TODO: Restore to "error"
      "@typescript-eslint/no-var-requires": "warn", // TODO: Restore to "error"
      "@typescript-eslint/explicit-function-return-type": "off", // Too noisy for internal code
      "@typescript-eslint/strict-boolean-expressions": [
        "warn",
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: true,
          allowNullableBoolean: true,
          allowNullableString: false,
          allowNullableNumber: false,
          allowAny: false,
        },
      ],
      "@typescript-eslint/prefer-nullish-coalescing": "warn", // TODO: Restore to "error"
      "@typescript-eslint/prefer-optional-chain": "warn", // TODO: Restore to "error"
      "@typescript-eslint/no-unnecessary-condition": "off", // Too noisy, let TS handle this
      "@typescript-eslint/no-unnecessary-type-assertion": "warn", // TODO: Restore to "error"
      "@typescript-eslint/no-floating-promises": "warn", // TODO: Restore to "error"
      "@typescript-eslint/await-thenable": "warn", // TODO: Restore to "error"
      "@typescript-eslint/require-await": "warn", // TODO: Restore to "error"
      "@typescript-eslint/no-misused-promises": [
        "warn", // TODO: Restore to "error"
        {
          checksVoidReturn: false,
        },
      ],

      // JavaScript Best Practices
      "prefer-const": "warn", // TODO: Restore to "error"
      "no-var": "warn", // TODO: Restore to "error"
      eqeqeq: ["warn", "always"], // TODO: Restore to "error"
      curly: ["warn", "all"], // TODO: Restore to "error"
      "no-throw-literal": "warn", // TODO: Restore to "error"
      "prefer-promise-reject-errors": "warn", // TODO: Restore to "error"
      "no-return-await": "warn", // TODO: Restore to "error"
      "no-param-reassign": "warn", // TODO: Restore to "error"
      "no-nested-ternary": "off",
      "no-unneeded-ternary": "warn", // TODO: Restore to "error"
      "prefer-template": "warn",
      "object-shorthand": "warn",
      "prefer-destructuring": [
        "warn",
        {
          array: false,
          object: true,
        },
      ],

      // Import/Export Best Practices
      "@typescript-eslint/consistent-type-imports": [
        "warn", // TODO: Restore to "error"
        {
          prefer: "type-imports",
          disallowTypeAnnotations: true,
          fixStyle: "separate-type-imports",
        },
      ],
      "@typescript-eslint/consistent-type-exports": "warn", // TODO: Restore to "error"
      "no-duplicate-imports": "warn", // TODO: Restore to "error"

      // Naming Conventions - MINIMAL SET
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "enumMember",
          format: ["UPPER_CASE"],
        },
        {
          selector: "property",
          format: null, // Allow any format for object properties
        },
      ],
    },
  },

  // SDK package JSDoc configuration
  {
    files: ["packages/vana-sdk/**/*.ts"],
    ignores: ["examples/**"],
    plugins: {
      jsdoc,
    },
    rules: {
      ...jsdoc.configs["flat/recommended-typescript"].rules,

      "jsdoc/require-param": "error",
      "jsdoc/require-param-description": "error",
      "jsdoc/check-param-names": "error",
      "jsdoc/require-param-type": "off", // TypeScript handles types
      "jsdoc/no-types": "error", // Don't duplicate TypeScript types in JSDoc
      "jsdoc/check-tag-names": [
        "error",
        {
          definedTags: ["remarks", "category", "see"],
        },
      ],

      "jsdoc/tag-lines": ["error", "any", { startLines: 1 }],
    },
  },

  // Test files configuration
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
        ...globals.browser,
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly",
        vitest: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "warn", // TODO: Restore to "error"
    },
  },

  // Config files configuration
  {
    files: ["**/*.config.{js,ts,cjs,mjs}", "**/scripts/**/*.{js,ts,cjs,mjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.nodeBuiltin,
        console: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Next.js specific configuration for demo app
  {
    files: ["examples/vana-sdk-demo/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        React: "readonly",
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },

  // Prettier config (should be last)
  prettierConfig,
];
