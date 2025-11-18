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
 * ## ECIES Encryption
 *
 * The SDK uses a custom ECIES implementation:
 * - **Node.js**: Uses native `secp256k1` module for optimal performance
 * - **Browser**: Uses `@noble/secp256k1` (pure JavaScript)
 * - Fully compatible with eccrypto format for backward compatibility
 *
 * ### Architecture Notes
 * - Browser builds: Use `@noble/secp256k1` (no native dependencies)
 * - Node builds: Use native `secp256k1` when available for better performance
 * - `secp256k1`: Remains an `optionalDependency` so browser-only users don't face build issues
 * - All encrypted data is compatible with the eccrypto format specification
 */

/**
 * Feature flag configuration
 *
 * @remarks
 * Currently empty as all feature flags have been graduated to default behavior.
 * This module is kept for future feature flag additions.
 */
export const features = {};
