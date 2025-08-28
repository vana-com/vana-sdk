import baseConfig, {
  baseConfigObject,
  baseRules,
} from "@vana/eslint-config-base";

/**
 * Apps ESLint config for Vana
 * Philosophy: Example code should be clear and educational, not ceremonial
 * Applied to: examples/**
 */

// Export the apps config object for composition
export const appsConfigObject = {
  files: ["**/*.ts", "**/*.tsx"],
  rules: {
    ...baseRules,

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

// Export as array for ESLint flat config format (includes base)
export default [baseConfigObject, appsConfigObject];

// Export individual pieces for composition
export { baseConfigObject } from "@vana/eslint-config-base";
export const appsRules = appsConfigObject.rules;
