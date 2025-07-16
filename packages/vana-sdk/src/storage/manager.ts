import {
  StorageProvider,
  StorageUploadResult,
  StorageFile,
  StorageListOptions,
  StorageError,
} from "./index";

/**
 * Manages multiple storage providers with a unified interface for file operations.
 *
 * @remarks
 * The StorageManager provides a consistent API for uploading, downloading, and managing
 * files across different storage backends including IPFS, Pinata, Google Drive, and
 * server-managed storage. It handles provider registration, default provider selection,
 * and automatic fallback scenarios for robust file operations.
 *
 * Used internally by DataController for encrypted file storage, but can also be used
 * directly for custom storage workflows. Each provider implements the `StorageProvider`
 * interface to ensure consistent behavior across different storage backends.
 *
 * The manager supports provider-specific configurations and features while maintaining
 * a uniform API surface for applications.
 * @example
 * ```typescript
 * import { StorageManager, IPFSStorage, PinataStorage } from 'vana-sdk';
 *
 * const storage = new StorageManager();
 *
 * // Register multiple providers
 * storage.register('ipfs', new IPFSStorage({
 *   apiEndpoint: 'https://api.pinata.cloud/pinning/pinFileToIPFS'
 * }), true);
 * storage.register('pinata', new PinataStorage({
 *   jwt: 'your-pinata-jwt-token'
 * }));
 *
 * // Upload to default provider
 * const result = await storage.upload(fileBlob, 'myfile.json');
 *
 * // Upload to specific provider
 * const result2 = await storage.upload(fileBlob, 'myfile.json', 'pinata');
 * ```
 * @category Storage
 * @see {@link [URL_PLACEHOLDER] | Storage Providers Guide} for configuration details
 */
export class StorageManager {
  private providers: Map<string, StorageProvider> = new Map();
  private defaultProvider: string | null = null;

  /**
   * Registers a storage provider with the manager.
   *
   * @remarks
   * This method adds a new storage provider to the manager's registry and optionally
   * sets it as the default provider for subsequent operations. If no default provider
   * is currently set, the first registered provider automatically becomes the default.
   * @param name - Unique identifier for the provider
   * @param provider - The storage provider instance implementing the `StorageProvider` interface
   * @param isDefault - Whether this provider should be set as the default (defaults to `false`)
   * @example
   * ```typescript
   * const pinata = new PinataStorage({ jwt: 'your-jwt-token' });
   * storage.register('pinata', pinata, true); // Set as default
   *
   * const ipfs = new IPFSStorage({ apiEndpoint: 'https://...' });
   * storage.register('ipfs', ipfs); // Not default
   * ```
   */
  register(name: string, provider: StorageProvider, isDefault = false): void {
    this.providers.set(name, provider);

    if (isDefault || this.defaultProvider === null) {
      this.defaultProvider = name;
    }
  }

  /**
   * Get a registered storage provider
   *
   * @param name - Provider identifier, uses default if not specified
   * @returns Storage provider instance
   */
  getProvider(name?: string): StorageProvider {
    const providerName = name || this.defaultProvider;

    if (!providerName) {
      throw new StorageError(
        "No storage provider specified and no default provider set",
        "NO_PROVIDER",
        "manager",
      );
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new StorageError(
        `Storage provider '${providerName}' not found`,
        "PROVIDER_NOT_FOUND",
        "manager",
      );
    }

    return provider;
  }

  /**
   * List all registered providers
   *
   * @returns Array of provider names
   */
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get the default provider name
   *
   * @returns Default provider name or null
   */
  getDefaultProvider(): string | null {
    return this.defaultProvider;
  }

  /**
   * Set the default provider
   *
   * @param name - Provider identifier
   */
  setDefaultProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new StorageError(
        `Cannot set default provider '${name}': provider not registered`,
        "PROVIDER_NOT_FOUND",
        "manager",
      );
    }
    this.defaultProvider = name;
  }

  /**
   * Uploads a file using the specified or default storage provider.
   *
   * @remarks
   * This method uploads a file to the specified provider or falls back to the default
   * provider if none is specified. The upload result includes the storage URL, file size,
   * content type, and provider-specific metadata that can be used for subsequent operations.
   * @param file - The file blob to upload
   * @param filename - Optional custom filename (defaults to auto-generated name)
   * @param providerName - Optional provider identifier (uses default if not specified)
   * @returns A Promise that resolves to the storage upload result with URL and metadata
   * @throws {StorageError} When no provider is available or upload fails
   * @example
   * ```typescript
   * // Upload to default provider
   * const result = await storage.upload(fileBlob, 'data.json');
   * console.log(`Uploaded to: ${result.url}`);
   *
   * // Upload to specific provider
   * const result2 = await storage.upload(fileBlob, 'data.json', 'pinata');
   * ```
   */
  async upload(
    file: Blob,
    filename?: string,
    providerName?: string,
  ): Promise<StorageUploadResult> {
    const provider = this.getProvider(providerName);
    return provider.upload(file, filename);
  }

  /**
   * Download a file using the specified or default provider
   *
   * @param url - The storage URL
   * @param providerName - Optional provider to use
   * @returns Promise with file blob
   */
  async download(url: string, providerName?: string): Promise<Blob> {
    const provider = this.getProvider(providerName);
    return provider.download(url);
  }

  /**
   * List files using the specified or default provider
   *
   * @param options - Optional filtering and pagination
   * @param providerName - Optional provider to use
   * @returns Promise with file list
   */
  async list(
    options?: StorageListOptions,
    providerName?: string,
  ): Promise<StorageFile[]> {
    const provider = this.getProvider(providerName);
    return provider.list(options);
  }

  /**
   * Delete a file using the specified or default provider
   *
   * @param url - The storage URL
   * @param providerName - Optional provider to use
   * @returns Promise with success status
   */
  async delete(url: string, providerName?: string): Promise<boolean> {
    const provider = this.getProvider(providerName);
    return provider.delete(url);
  }

  /**
   * Get list of registered storage provider names
   *
   * @returns Array of provider names
   */
  getStorageProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get the default storage provider name
   *
   * @returns Default provider name or undefined
   */
  getDefaultStorageProvider(): string | undefined {
    return this.defaultProvider || undefined;
  }
}
