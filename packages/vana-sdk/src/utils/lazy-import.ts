/**
 * Utility for lazy-loading modules to avoid Turbopack TDZ issues
 *
 * WARNING: This is a workaround for Turbopack's strict module initialization.
 * Dependencies that access globals during init must be dynamically imported.
 */

/**
 * Creates a lazy import function that caches the promise (not the module)
 * to avoid race conditions on concurrent first calls
 *
 * @param importFn - Function that returns a dynamic import promise
 * @returns Function that returns the cached import promise
 *
 * @example
 * const getOpenPGP = lazyImport(() => import('openpgp'));
 * const openpgp = await getOpenPGP();
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
