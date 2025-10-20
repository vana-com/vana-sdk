/**
 * Provides lazy module loading to avoid Temporal Dead Zone issues.
 *
 * @remarks
 * This module implements a caching lazy import pattern to work around Turbopack's
 * strict module initialization. Dependencies that access globals during initialization
 * must be dynamically imported to prevent TDZ errors in Next.js environments.
 *
 * @see {@link https://github.com/vercel/next.js/issues/82632 | Turbopack TDZ Issue}
 *
 * @category Utilities
 * @module utils/lazy-import
 */

/**
 * Creates a cached lazy import function for deferred module loading.
 *
 * @remarks
 * Caches the import promise (not the module) to prevent race conditions
 * during concurrent first calls. On import failure, clears the cache to
 * allow retry on next attempt.
 *
 * @typeParam T - The type of the module being imported
 *
 * @param importFn - Function that returns a dynamic import promise.
 *   Should be a dynamic import expression like `() => import('module')`.
 * @returns A function that returns the cached import promise
 *
 * @example
 * ```typescript
 * // Create lazy loader for heavy crypto library
 * const getOpenPGP = lazyImport(() => import('openpgp'));
 *
 * // Use when needed (first call triggers import)
 * const openpgp = await getOpenPGP();
 * const encrypted = await openpgp.encrypt(data);
 *
 * // Subsequent calls return cached promise
 * const openpgp2 = await getOpenPGP(); // Same instance
 * ```
 *
 * @category Utilities
 */
export function lazyImport<T>(importFn: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;

  return () => {
    cached ??= importFn().catch((err) => {
      // Clear cache on error so next attempt can retry
      cached = null;
      throw new Error("Failed to load module", { cause: err });
    });
    return cached;
  };
}
