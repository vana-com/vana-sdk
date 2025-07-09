import {
  StorageProvider,
  StorageUploadResult,
  StorageFile,
  StorageListOptions,
  StorageError,
} from "./index";

/**
 * Unified interface for managing multiple storage providers (IPFS, Google Drive, Pinata, etc.).
 *
 * The StorageManager allows you to register different storage backends and provides
 * a consistent API for uploading, downloading, and managing files across providers.
 * Used internally by DataController but can also be used directly for custom storage workflows.
 *
 * **Common workflows:**
 * - Register providers: `register()`
 * - Upload files: `upload()`
 * - Download files: `download()`
 * - List files: `list()`
 * - Switch between providers for different use cases
 *
 * @category Storage
 * @example
 * ```typescript
 * import { StorageManager, IPFSStorage, PinataStorage } from 'vana-sdk/storage';
 * 
 * const storage = new StorageManager();
 * 
 * // Register multiple providers
 * storage.register('ipfs', new IPFSStorage({ gateway: 'https://gateway.pinata.cloud' }), true);
 * storage.register('pinata', new PinataStorage({ apiKey: 'your-key', secretKey: 'your-secret' }));
 * 
 * // Upload to default provider
 * const result = await storage.upload(fileBlob, 'myfile.json');
 * 
 * // Upload to specific provider
 * const result2 = await storage.upload(fileBlob, 'myfile.json', 'pinata');
 * ```
 */
export class StorageManager {
  private providers: Map<string, StorageProvider> = new Map();
  private defaultProvider: string | null = null;

  /**
   * Register a storage provider
   * @param name - Provider identifier
   * @param provider - Storage provider instance
   * @param isDefault - Whether this should be the default provider
   */
  register(name: string, provider: StorageProvider, isDefault = false): void {
    this.providers.set(name, provider);

    if (isDefault || this.defaultProvider === null) {
      this.defaultProvider = name;
    }
  }

  /**
   * Get a registered storage provider
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
   * @returns Array of provider names
   */
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get the default provider name
   * @returns Default provider name or null
   */
  getDefaultProvider(): string | null {
    return this.defaultProvider;
  }

  /**
   * Set the default provider
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
   * Upload a file using the specified or default provider
   * @param file - The file to upload
   * @param filename - Optional custom filename
   * @param providerName - Optional provider to use
   * @returns Promise with storage upload result
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
   * @returns Array of provider names
   */
  getStorageProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get the default storage provider name
   * @returns Default provider name or undefined
   */
  getDefaultStorageProvider(): string | undefined {
    return this.defaultProvider || undefined;
  }
}
