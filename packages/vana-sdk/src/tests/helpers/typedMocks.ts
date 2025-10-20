/**
 * Type-safe mock utilities following TypeScript best practices.
 * These helpers eliminate the need for type assertions in tests.
 */

import { vi } from "vitest";

/**
 * Creates a typed mock function matching the signature of the provided type.
 *
 * @returns A vitest mock function typed to match the specified function signature
 * @example
 * ```typescript
 * const fetchMock = typedFn<typeof fetch>();
 * vi.stubGlobal('fetch', fetchMock);
 * ```
 */
// TODO(TYPES): This utility uses type assertion as a compromise
// to provide better DX while avoiding 'as any' in test files
export const typedFn = <T extends (...args: unknown[]) => unknown>() =>
  vi.fn() as unknown as ReturnType<typeof vi.fn> & T;

/**
 * Creates a mock object that satisfies a specific interface.
 *
 * @param partial - Partial implementation to use as the mock, with only required methods
 * @returns A mock object cast to the full interface type
 * @example
 * ```typescript
 * const mockClient = createMock<WalletClient>({
 *   getChainId: typedFn<WalletClient['getChainId']>(),
 * });
 * ```
 */
export function createMock<T>(partial: Partial<T>): T {
  return partial as T;
}

/**
 * Stubs a global property with type safety.
 *
 * @param key - The name of the global property to stub
 * @param value - The mock value to use as the stub implementation
 * @example
 * ```typescript
 * stubGlobal('fetch', typedFn<typeof fetch>());
 * ```
 */
export function stubGlobal<K extends keyof typeof globalThis>(
  key: K,
  value: (typeof globalThis)[K],
): void {
  vi.stubGlobal(key as string, value);
}

/**
 * Removes a global property for testing scenarios.
 *
 * @param key - The name of the global property to remove from globalThis
 * @example
 * ```typescript
 * removeGlobal('Buffer');
 * ```
 */
export function removeGlobal(key: keyof typeof globalThis): void {
  Reflect.deleteProperty(globalThis, key);
}

/**
 * Restores a global property to its original value.
 *
 * @param key - The name of the global property to restore
 * @param value - The original value to restore for the property
 * @example
 * ```typescript
 * const original = globalThis.Buffer;
 * removeGlobal('Buffer');
 * // ... test ...
 * restoreGlobal('Buffer', original);
 * ```
 */
export function restoreGlobal<K extends keyof typeof globalThis>(
  key: K,
  value: (typeof globalThis)[K],
): void {
  Object.defineProperty(globalThis, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}
