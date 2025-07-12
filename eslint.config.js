import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";
import nextPlugin from "@next/eslint-plugin-next";

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
      "no-console": ["error", { allow: ["info", "debug", "warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-var-requires": "error",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
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
      "@typescript-eslint/no-explicit-any": "warn",
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
