/**
 * Type guard utilities for runtime type checking and assertions.
 * These utilities provide type-safe alternatives to non-null assertions (!).
 *
 * @module typeGuards
 */

/**
 * Asserts that a value is defined (not null or undefined).
 * Throws an error with a descriptive message if the assertion fails.
 *
 * @param value - The value to check
 * @param message - Error message to throw if value is not defined
 * @throws {Error} If value is null or undefined
 *
 * @example
 * ```typescript
 * const wallet = getWallet();
 * assertDefined(wallet, 'Wallet must be initialized before use');
 * // TypeScript now knows wallet is defined
 * console.log(wallet.address);
 * ```
 */
export function assertDefined<T>(
  value: T | undefined | null,
  message: string,
): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
}

/**
 * Type guard to check if a value is defined (not null or undefined).
 *
 * @param value - The value to check
 * @returns True if the value is defined, false otherwise
 *
 * @example
 * ```typescript
 * const values = [1, undefined, 3, null, 5];
 * const defined = values.filter(isDefined); // [1, 3, 5]
 * ```
 */
export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

/**
 * Asserts that a value is a non-empty string.
 *
 * @param value - The value to check
 * @param message - Error message if assertion fails
 * @throws {Error} If value is not a non-empty string
 */
export function assertNonEmptyString(
  value: unknown,
  message: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
}

/**
 * Type guard to check if a value is a non-empty string.
 *
 * @param value - The value to check
 * @returns True if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Safely gets a property from an object, returning undefined if the property doesn't exist.
 *
 * @param obj - The object to get the property from
 * @param key - The property key
 * @returns The property value or undefined
 *
 * @example
 * ```typescript
 * const config = { wallet: { address: '0x123' } };
 * const address = safeGet(config, 'wallet')?.address;
 * ```
 */
export function safeGet<T, K extends keyof T>(
  obj: T | undefined | null,
  key: K,
): T[K] | undefined {
  return obj?.[key];
}

/**
 * Ensures a value is defined or returns a default value.
 *
 * @param value - The value to check
 * @param defaultValue - The default value to use if undefined
 * @returns The value if defined, otherwise the default
 *
 * @example
 * ```typescript
 * const timeout = ensureDefault(config.timeout, 5000);
 * ```
 */
export function ensureDefault<T>(
  value: T | undefined | null,
  defaultValue: T,
): T {
  return isDefined(value) ? value : defaultValue;
}

/**
 * Type guard for checking if a value is an object (and not null).
 *
 * @param value - The value to check
 * @returns True if value is an object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Type guard for checking if a value is an array.
 *
 * @param value - The value to check
 * @returns True if value is an array
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Safely accesses an array element, returning undefined if out of bounds.
 *
 * @param array - The array to access
 * @param index - The index to access
 * @returns The element at the index or undefined
 *
 * @example
 * ```typescript
 * const items = [1, 2, 3];
 * const item = safeArrayAccess(items, 5); // undefined
 * ```
 */
export function safeArrayAccess<T>(
  array: T[] | undefined | null,
  index: number,
): T | undefined {
  if (!array || index < 0 || index >= array.length) {
    return undefined;
  }
  return array[index];
}

/**
 * Type guard to check if a value has a specific property.
 *
 * @param obj - The object to check
 * @param prop - The property name
 * @returns True if the object has the property
 *
 * @example
 * ```typescript
 * if (hasProperty(response, 'error')) {
 *   console.error(response.error);
 * }
 * ```
 */
export function hasProperty<T extends string>(
  obj: unknown,
  prop: T,
): obj is Record<T, unknown> {
  return isObject(obj) && prop in obj;
}

/**
 * Asserts that an object has required properties.
 *
 * @param obj - The object to check
 * @param properties - Array of required property names
 * @param message - Error message if assertion fails
 * @throws {Error} If any required property is missing
 */
export function assertHasProperties<T extends string>(
  obj: unknown,
  properties: T[],
  message: string,
): asserts obj is Record<T, unknown> {
  if (!isObject(obj)) {
    throw new Error(`${message}: Value is not an object`);
  }

  for (const prop of properties) {
    if (!(prop in obj)) {
      throw new Error(`${message}: Missing required property '${prop}'`);
    }
  }
}

/**
 * Creates a type-safe error with a guaranteed message.
 *
 * @param error - The error or unknown value
 * @param fallbackMessage - Message to use if error doesn't have one
 * @returns An Error object with a message
 */
export function ensureError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  if (
    isObject(error) &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return new Error(error.message);
  }
  return new Error(fallbackMessage);
}

/**
 * Type guard for checking if a value is a valid Ethereum address.
 *
 * @param value - The value to check
 * @returns True if value is a valid Ethereum address
 */
export function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

/**
 * Asserts that a value is a valid Ethereum address.
 *
 * @param value - The value to check
 * @param message - Error message if assertion fails
 * @throws {Error} If value is not a valid address
 */
export function assertAddress(
  value: unknown,
  message: string,
): asserts value is `0x${string}` {
  if (!isAddress(value)) {
    throw new Error(`${message}: Invalid Ethereum address`);
  }
}
