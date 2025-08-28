/**
 * Provides a controllable fake implementation of StorageManager for testing.
 *
 * @remarks
 * This test fake replaces complex storage mocking with a simple, in-memory implementation
 * that allows tests to configure upload/download behavior without external dependencies.
 * Use this when testing controllers that depend on StorageManager functionality.
 *
 * The fake maintains in-memory maps for uploads and downloads, tracks call counts,
 * and supports multiple storage providers for comprehensive testing scenarios.
 *
 * @category Testing
 * @internal
 */

import type {
  StorageProvider,
  StorageUploadResult,
  StorageFile,
  StorageListOptions,
} from "../../types/storage";

export class FakeStorageManager {
  private uploads = new Map<string, StorageUploadResult>();
  private downloads = new Map<string, Blob>();
  private storageProviders = new Map<string, StorageProvider>();
  private defaultProvider = "ipfs";
  private uploadCallCount = 0;
  private downloadCallCount = 0;

  constructor() {
    // Set up a default fake provider
    this.storageProviders.set("ipfs", this.createFakeProvider("ipfs"));
  }

  /**
   * Creates a fake storage provider with basic functionality.
   *
   * @param name - The name identifier for this provider
   * @returns A StorageProvider implementation for testing
   */
  private createFakeProvider(name: string): StorageProvider {
    return {
      upload: async (data: Blob, filename?: string) => {
        const url = `https://${name}.io/fake/${filename ?? "file"}`;
        const result = {
          url,
          size: data.size,
          contentType: data.type ?? "application/octet-stream",
        };
        this.uploads.set(url, result);
        return result;
      },
      download: async (url: string) => {
        return this.downloads.get(url) ?? new Blob(["fake content"]);
      },
      list: async () => [],
      delete: async () => true,
      getConfig: () => ({
        name: "ipfs",
        type: "ipfs" as const,
        requiresAuth: false,
        features: {
          upload: true,
          download: true,
          list: true,
          delete: true,
        },
      }),
    };
  }

  /**
   * Simulates uploading a file to storage.
   *
   * @param data - The Blob data to upload
   * @param filename - Optional filename for the upload
   * @param providerName - Optional storage provider to use (defaults to defaultProvider)
   * @returns A promise resolving to the upload result with URL and metadata
   *
   * @example
   * ```typescript
   * const fake = new FakeStorageManager();
   * const blob = new Blob(["test data"], { type: "text/plain" });
   * const result = await fake.upload(blob, "test.txt");
   * console.log(result.url); // "https://ipfs.io/ipfs/QmTest1"
   * ```
   */
  async upload(
    data: Blob,
    _filename?: string,
    providerName?: string,
  ): Promise<StorageUploadResult> {
    this.uploadCallCount++;
    const provider = providerName ?? this.defaultProvider;
    const url = `https://${provider}.io/ipfs/QmTest${this.uploadCallCount}`;
    const result = {
      url,
      size: data.size,
      contentType: data.type || "application/json",
    };
    this.uploads.set(url, result);
    return result;
  }

  /**
   * Simulates downloading a file from storage.
   *
   * @param url - The URL to download from
   * @returns A promise resolving to the Blob content
   *
   * @example
   * ```typescript
   * const fake = new FakeStorageManager();
   * const content = new Blob(["hello world"]);
   * fake.setDownloadResult("https://test.url", content);
   * const downloaded = await fake.download("https://test.url");
   * ```
   */
  async download(url: string): Promise<Blob> {
    this.downloadCallCount++;
    return this.downloads.get(url) ?? new Blob(["default content"]);
  }

  /**
   * Lists files in storage, optionally filtered by prefix.
   *
   * @param options - Optional filtering and pagination options
   * @param _providerName - Optional provider name (unused in fake implementation)
   * @returns A promise resolving to an array of file objects
   *
   * @example
   * ```typescript
   * const fake = new FakeStorageManager();
   * await fake.upload(new Blob(["data"]), "file1.txt");
   * await fake.upload(new Blob(["data"]), "file2.txt");
   * const files = await fake.list();
   * // Returns ["https://ipfs.io/ipfs/QmTest1", "https://ipfs.io/ipfs/QmTest2"]
   * ```
   */
  async list(
    options?: StorageListOptions,
    _providerName?: string,
  ): Promise<StorageFile[]> {
    const urls = Array.from(this.uploads.keys());
    const files: StorageFile[] = urls.map((url, index) => ({
      id: `file-${index}`,
      url,
      name: url.split("/").pop() ?? "file",
      size: this.uploads.get(url)?.size ?? 0,
      createdAt: new Date(),
      contentType:
        this.uploads.get(url)?.contentType ?? "application/octet-stream",
    }));

    if (options?.namePattern) {
      const pattern = options.namePattern;
      return files.filter((file) => file.url.includes(pattern));
    }
    return files;
  }

  /**
   * Simulates deleting a file from storage.
   *
   * @param url - The URL of the file to delete
   * @returns A promise resolving to true if deleted, false if not found
   */
  async delete(url: string): Promise<boolean> {
    return this.uploads.delete(url);
  }

  /**
   * Registers a custom storage provider.
   *
   * @param name - The unique name for this provider
   * @param provider - The StorageProvider implementation
   *
   * @example
   * ```typescript
   * const fake = new FakeStorageManager();
   * const customProvider: StorageProvider = {
   *   upload: async (data) => ({ url: "https://custom.com/file" }),
   *   download: async (url) => new Blob(["custom"]),
   *   list: async () => [],
   *   delete: async () => true,
   *   getConfig: () => ({})
   * };
   * fake.register("custom", customProvider);
   * ```
   */
  register(name: string, provider: StorageProvider): void {
    this.storageProviders.set(name, provider);
  }

  /**
   * Retrieves a registered storage provider by name.
   *
   * @param name - The name of the provider to retrieve
   * @returns The StorageProvider if found, undefined otherwise
   */
  getProvider(name?: string): StorageProvider {
    const providerName = name ?? this.defaultProvider;
    const provider = this.storageProviders.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }
    return provider;
  }

  /**
   * Sets the default storage provider to use.
   *
   * @param name - The name of a registered provider
   * @throws Error if the provider name is not registered
   */
  setDefaultProvider(name: string): void {
    if (!this.storageProviders.has(name)) {
      throw new Error(`Provider ${name} not registered`);
    }
    this.defaultProvider = name;
  }

  /**
   * Lists all registered storage provider names.
   *
   * @returns Array of provider name strings
   */
  listProviders(): string[] {
    return Array.from(this.storageProviders.keys());
  }

  /**
   * Gets the name of the current default storage provider.
   *
   * @returns The default provider name
   */
  getDefaultProvider(): string {
    return this.defaultProvider;
  }

  /**
   * Gets all registered storage provider names (alias for listProviders).
   *
   * @returns Array of provider name strings
   */
  getStorageProviders(): string[] {
    return this.listProviders();
  }

  /**
   * Gets the name of the default storage provider (alias for getDefaultProvider).
   *
   * @returns The default provider name
   */
  getDefaultStorageProvider(): string {
    return this.getDefaultProvider();
  }

  // Test helpers

  /**
   * Configures a specific upload result for testing.
   *
   * @param url - The URL to configure
   * @param result - The upload result to return for this URL
   *
   * @example
   * ```typescript
   * const fake = new FakeStorageManager();
   * fake.setUploadResult("https://test.url", {
   *   url: "https://test.url",
   *   size: 1024,
   *   contentType: "application/json"
   * });
   * ```
   */
  setUploadResult(url: string, result: StorageUploadResult): void {
    this.uploads.set(url, result);
  }

  /**
   * Configures specific download content for a URL.
   *
   * @param url - The URL to configure
   * @param content - The Blob content to return when this URL is downloaded
   *
   * @example
   * ```typescript
   * const fake = new FakeStorageManager();
   * const testContent = new Blob(["test data"], { type: "text/plain" });
   * fake.setDownloadResult("https://test.url", testContent);
   * ```
   */
  setDownloadResult(url: string, content: Blob): void {
    this.downloads.set(url, content);
  }

  /**
   * Gets the number of times upload() has been called.
   *
   * @returns The upload call count
   */
  getUploadCallCount(): number {
    return this.uploadCallCount;
  }

  /**
   * Gets the number of times download() has been called.
   *
   * @returns The download call count
   */
  getDownloadCallCount(): number {
    return this.downloadCallCount;
  }

  /**
   * Resets all state, clearing uploads, downloads, and counters.
   *
   * @example
   * ```typescript
   * const fake = new FakeStorageManager();
   * await fake.upload(new Blob(["data"]), "file.txt");
   * fake.reset();
   * const files = await fake.list(); // Returns []
   * ```
   */
  reset(): void {
    this.uploads.clear();
    this.downloads.clear();
    this.uploadCallCount = 0;
    this.downloadCallCount = 0;
  }
}
