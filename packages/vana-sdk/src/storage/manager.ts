/**
 * Manages multiple storage providers with a unified interface.
 *
 * @remarks
 * This module provides centralized management of storage providers, enabling
 * applications to work with multiple storage backends through a single API.
 * It handles provider registration, default selection, and operation routing.
 *
 * @category Storage
 * @module storage/manager
 */

import type {
  StorageProvider,
  StorageUploadResult,
  StorageFile,
  StorageListOptions,
} from "../types/storage";
import { StorageError } from "../types/storage";

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
 * import { StorageManager, IPFSStorage, PinataStorage } from '@opendatalabs/vana-sdk';
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
 * @see {@link https://docs.vana.com/developer/vana-sdk-documentation/core-modules/storage-providers | Storage Providers Guide} for configuration details
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
   * Retrieves a registered storage provider.
   *
   * @param name - Provider identifier.
   *   If not specified, returns the default provider.
   * @returns The requested storage provider instance
   *
   * @throws {StorageError} With code 'NO_PROVIDER' if no provider available
   * @throws {StorageError} With code 'PROVIDER_NOT_FOUND' if named provider doesn't exist
   *
   * @example
   * ```typescript
   * const provider = storage.getProvider('pinata');
   * const config = provider.getConfig();
   * ```
   */
  getProvider(name?: string): StorageProvider {
    const providerName = name ?? this.defaultProvider;

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
   * Lists all registered provider names.
   *
   * @returns Array of registered provider identifiers
   *
   * @example
   * ```typescript
   * const providers = storage.listProviders();
   * console.log('Available providers:', providers);
   * // Output: ['ipfs', 'pinata', 'google-drive']
   * ```
   */
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Gets the current default provider name.
   *
   * @returns Default provider identifier or null if none set
   *
   * @example
   * ```typescript
   * const defaultName = storage.getDefaultProvider();
   * if (defaultName) {
   *   console.log(`Using ${defaultName} by default`);
   * }
   * ```
   */
  getDefaultProvider(): string | null {
    return this.defaultProvider;
  }

  /**
   * Sets the default storage provider.
   *
   * @param name - Provider identifier to set as default.
   *   Must be a registered provider name.
   *
   * @throws {StorageError} With code 'PROVIDER_NOT_FOUND' if provider not registered
   *
   * @example
   * ```typescript
   * storage.setDefaultProvider('pinata');
   * // Now all operations without provider name will use Pinata
   * ```
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
   * Downloads a file from storage.
   *
   * @param url - The storage URL to download from.
   *   Format depends on the storage provider.
   * @param providerName - Optional provider identifier.
   *   Uses default provider if not specified.
   * @returns The downloaded file as a Blob
   *
   * @throws {StorageError} If download fails or provider unavailable
   *
   * @example
   * ```typescript
   * const blob = await storage.download('ipfs://QmXxx...');
   * const text = await blob.text();
   * ```
   */
  async download(url: string, providerName?: string): Promise<Blob> {
    const provider = this.getProvider(providerName);
    return provider.download(url);
  }

  /**
   * Lists files in storage.
   *
   * @param options - Optional filtering and pagination.
   * @param options.namePattern - Pattern to filter files.
   * @param options.limit - Maximum files to return.
   * @param providerName - Optional provider identifier.
   *   Uses default provider if not specified.
   * @returns Array of file metadata
   *
   * @throws {StorageError} If listing fails or not supported by provider
   *
   * @example
   * ```typescript
   * const files = await storage.list(
   *   { namePattern: '*.json', limit: 10 },
   *   'google-drive'
   * );
   * ```
   */
  async list(
    options?: StorageListOptions,
    providerName?: string,
  ): Promise<StorageFile[]> {
    const provider = this.getProvider(providerName);
    return provider.list(options);
  }

  /**
   * Deletes a file from storage.
   *
   * @param url - The storage URL to delete.
   *   Must be a valid URL for the provider.
   * @param providerName - Optional provider identifier.
   *   Uses default provider if not specified.
   * @returns True if deletion succeeded, false otherwise
   *
   * @throws {StorageError} If deletion fails or not supported by provider
   *
   * @example
   * ```typescript
   * const success = await storage.delete('ipfs://QmXxx...');
   * if (success) {
   *   console.log('File deleted successfully');
   * }
   * ```
   */
  async delete(url: string, providerName?: string): Promise<boolean> {
    const provider = this.getProvider(providerName);
    return provider.delete(url);
  }

  /**
   * Gets all registered storage provider names.
   *
   * @returns Array of provider identifiers
   *
   * @deprecated Use `listProviders()` instead
   *
   * @example
   * ```typescript
   * const providers = storage.getStorageProviders();
   * ```
   */
  getStorageProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Gets the default storage provider name.
   *
   * @returns Default provider identifier or undefined if none set
   *
   * @deprecated Use `getDefaultProvider()` instead
   *
   * @example
   * ```typescript
   * const defaultProvider = storage.getDefaultStorageProvider();
   * ```
   */
  getDefaultStorageProvider(): string | undefined {
    return this.defaultProvider ?? undefined;
  }
}
