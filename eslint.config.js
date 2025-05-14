const eslint = require("@eslint/js");
const tseslint = require("@typescript-eslint/eslint-plugin");

module.exports = [
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
  {
    languageOptions: {
      globals: {
        require: "readonly",
        module: "readonly",
      },
    },
  },
  eslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      parserOptions: { ecmaVersion: 2020, sourceType: "module" },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "prettier/prettier": "error",
    },
  },
];
