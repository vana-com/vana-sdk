/**
 * Feature flags for the Vana SDK
 *
 * @remarks
 * This module controls feature toggles that allow switching between different
 * implementations or enabling experimental features.
 *
 * The getter pattern is used to allow dynamic evaluation of environment variables,
 * which is necessary for tests to override the default before modules are loaded.
 *
 * ## Dual-Mode ECIES Support
 *
 * The SDK supports two encryption implementations:
 *
 * 1. **eccrypto-js** (Default)
 *    - Pure JavaScript implementation
 *    - Works everywhere (Node.js and browsers)
 *    - No native dependencies
 *    - Good performance for most use cases
 *
 * 2. **Custom ECIES** (Opt-in)
 *    - Uses native `secp256k1` module in Node.js for optimal performance
 *    - Uses `@noble/secp256k1` in browsers (pure JS)
 *    - Slightly faster in Node.js environments
 *    - Currently used by tests to ensure compatibility
 *
 * ### Architecture Notes
 * - Browser builds: Never reference native `secp256k1`, use `@noble/secp256k1` instead
 * - Node builds: Include both implementations, feature flag chooses at runtime
 * - `secp256k1`: Remains an `optionalDependency` so browser-only users don't face build issues
 *
 * ### Future Plans
 * Once the custom ECIES implementation is battle-tested:
 * 1. Make custom ECIES the default
 * 2. Eventually remove eccrypto-js dependency
 * 3. Keep the same architecture (native for Node, @noble for browser)
 */

/**
 * Feature flag configuration
 */
export const features = {
  /**
   * Use custom ECIES implementation instead of eccrypto
   *
   * When false (default): Uses the original eccrypto/eccrypto-js libraries for stability
   * When true: Uses the custom platform-specific ECIES implementation
   *
   * Enable by setting environment variable: VANA_USE_CUSTOM_ECIES=true
   *
   * @example
   * ```bash
   * # Use eccrypto-js (default)
   * VANA_USE_CUSTOM_ECIES=false npm run your-app
   *
   * # Use custom ECIES implementation
   * VANA_USE_CUSTOM_ECIES=true npm run your-app
   * ```
   *
   * @returns Whether to use custom ECIES implementation
   */
  get useCustomECIES(): boolean {
    // Default to false (use eccrypto for stability)
    // Tests will override this to true since they test the custom implementation
    return process.env.VANA_USE_CUSTOM_ECIES === "true";
  },
};
