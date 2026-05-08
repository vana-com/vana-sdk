/**
 * Token storage primitives for OAuth grant and access tokens.
 *
 * @remarks
 * Defines the {@link TokenStore} interface and a default in-memory
 * implementation. Persistent backends (e.g., browser storage, secure
 * keychains) are intentionally not provided here — consumers can implement
 * the interface for their environment.
 *
 * @category Auth
 * @module auth/token-store
 */

/**
 * A persisted token record.
 */
export interface TokenRecord {
  /** The opaque token value. */
  token: string;
  /** Optional expiration as a Unix timestamp in seconds. */
  expiresAt?: number;
}

/**
 * Async key/value store for token records.
 */
export interface TokenStore {
  /**
   * Returns the record for `key`, or `null` if missing or expired.
   */
  get(key: string): Promise<TokenRecord | null>;
  /**
   * Stores `record` under `key`, overwriting any existing entry.
   */
  set(key: string, record: TokenRecord): Promise<void>;
  /**
   * Removes the entry for `key`. No-op if `key` is absent.
   */
  delete(key: string): Promise<void>;
  /**
   * Removes all entries.
   */
  clear(): Promise<void>;
}

/**
 * In-memory {@link TokenStore} implementation.
 *
 * @remarks
 * Expired entries are evicted lazily on read.
 */
export class InMemoryTokenStore implements TokenStore {
  readonly #records = new Map<string, TokenRecord>();

  public get(key: string): Promise<TokenRecord | null> {
    const record = this.#records.get(key);
    if (record === undefined) return Promise.resolve(null);
    if (
      record.expiresAt !== undefined &&
      record.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      this.#records.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(record);
  }

  public set(key: string, record: TokenRecord): Promise<void> {
    this.#records.set(key, record);
    return Promise.resolve();
  }

  public delete(key: string): Promise<void> {
    this.#records.delete(key);
    return Promise.resolve();
  }

  public clear(): Promise<void> {
    this.#records.clear();
    return Promise.resolve();
  }

  /**
   * Returns the number of stored entries (including any not yet
   * lazily evicted). Intended for tests and diagnostics.
   */
  public get size(): number {
    return this.#records.size;
  }
}
