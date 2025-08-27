import baseConfig, {
  baseConfigObject,
  basePlugins,
  baseRules,
} from "@vana/eslint-config-base";
import tsdocPlugin from "eslint-plugin-tsdoc";

/**
 * SDK ESLint config for Vana
 * Philosophy: Public APIs need strict types and documentation
 * Applied to: packages/vana-sdk/src/**
 */

// Export the SDK config object for composition
export const sdkConfigObject = {
  files: ["**/*.ts"],
  plugins: {
    ...basePlugins,
    tsdoc: tsdocPlugin,
  },
  rules: {
    ...baseRules,

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

// Export as array for ESLint flat config format (includes base)
export default [baseConfigObject, sdkConfigObject];

// Export individual pieces for composition
export { baseConfigObject } from "@vana/eslint-config-base";
export const sdkPlugins = sdkConfigObject.plugins;
export const sdkRules = sdkConfigObject.rules;
