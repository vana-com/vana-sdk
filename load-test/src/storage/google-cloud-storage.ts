/**
 * Google Cloud Storage Provider for Vana Load Testing
 * 
 * Implements the StorageProvider interface for Google Cloud Storage
 * using service account authentication. Designed for scalable load testing
 * scenarios where thousands of concurrent uploads are required.
 */

import { Storage } from '@google-cloud/storage';
import type { StorageProvider, StorageUploadResult, StorageFile, StorageListOptions, StorageProviderConfig } from '@opendatalabs/vana-sdk/node';

export interface GoogleCloudStorageConfig {
  /** Google Cloud service account JSON (as string) */
  serviceAccountJson: string;
  /** GCS bucket name */
  bucketName: string;
  /** Optional: folder prefix for organizing files */
  folderPrefix?: string;
  /** Optional: enable debug logging */
  enableDebugLogs?: boolean;
}

/**
 * Google Cloud Storage provider for Vana SDK load testing
 * 
 * Features:
 * - Service account authentication (no OAuth required)
 * - Scalable to thousands of concurrent uploads
 * - Production-ready with proper error handling
 * - Supports file listing, deletion, and metadata
 */
export class GoogleCloudStorage implements StorageProvider {
  private storage: Storage;
  private bucketName: string;
  private folderPrefix: string;

  constructor(private config: GoogleCloudStorageConfig) {
    // Parse service account JSON
    const serviceAccount = JSON.parse(config.serviceAccountJson);
    
    // Initialize Google Cloud Storage client
    this.storage = new Storage({
      projectId: serviceAccount.project_id,
      keyFilename: undefined, // We'll use credentials directly
      credentials: serviceAccount,
    });

    this.bucketName = config.bucketName;
    this.folderPrefix = config.folderPrefix || 'vana-load-test';
  }

  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    try {
      // Generate filename if not provided
      const finalFilename = filename || `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const objectName = `${this.folderPrefix}/${finalFilename}`;

      // Get bucket reference
      const bucket = this.storage.bucket(this.bucketName);
      const gcsFile = bucket.file(objectName);

      // Convert Blob to Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to GCS
      await gcsFile.save(buffer, {
        metadata: {
          contentType: file.type || 'application/octet-stream',
          metadata: {
            uploadedAt: new Date().toISOString(),
            originalSize: file.size.toString(),
            loadTestFile: 'true',
          },
        },
      });

      // Generate signed URL for temporary access (since public access is prevented)
      // This gives the Vana personal server temporary authenticated access
      const [signedUrl] = await gcsFile.getSignedUrl({
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      });

      if (this.config.enableDebugLogs) {
        console.log('[GoogleCloudStorage] Generated signed URL for secure access (24h expiry)');
      }

      const publicUrl = signedUrl;

      return {
        url: publicUrl,
        size: file.size,
        contentType: file.type || 'application/octet-stream',
        metadata: {
          objectName,
          uploadedAt: new Date().toISOString(),
          bucketName: this.bucketName,
          folderPrefix: this.folderPrefix,
        },
      };

    } catch (error) {
      throw new Error(`Failed to upload to Google Cloud Storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async download(url: string): Promise<Blob> {
    try {
      // Extract object name from URL
      const objectName = this.extractObjectNameFromUrl(url);
      
      // Get bucket reference
      const bucket = this.storage.bucket(this.bucketName);
      const gcsFile = bucket.file(objectName);

      // Download file
      const [buffer] = await gcsFile.download();
      
      // Get metadata for content type
      const [metadata] = await gcsFile.getMetadata();
      const contentType = metadata.contentType || 'application/octet-stream';

      return new Blob([new Uint8Array(buffer)], { type: contentType });

    } catch (error) {
      throw new Error(`Failed to download from Google Cloud Storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async list(options?: StorageListOptions): Promise<StorageFile[]> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      
      // List files with prefix
      const [files] = await bucket.getFiles({
        prefix: this.folderPrefix,
        maxResults: options?.limit || 100,
      });

      return files.map(file => ({
        id: file.name,
        name: file.name.replace(`${this.folderPrefix}/`, ''),
        url: `https://storage.googleapis.com/${this.bucketName}/${file.name}`,
        size: parseInt(String(file.metadata.size || '0')),
        contentType: file.metadata.contentType || 'application/octet-stream',
        createdAt: new Date(file.metadata.timeCreated || Date.now()),
      }));

    } catch (error) {
      throw new Error(`Failed to list files from Google Cloud Storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async delete(url: string): Promise<boolean> {
    try {
      // Extract object name from URL
      const objectName = this.extractObjectNameFromUrl(url);
      
      // Get bucket reference
      const bucket = this.storage.bucket(this.bucketName);
      const gcsFile = bucket.file(objectName);

      // Delete file
      await gcsFile.delete();
      return true;

    } catch (error) {
      console.error(`Failed to delete from Google Cloud Storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  getConfig(): StorageProviderConfig {
    return {
      name: 'Google Cloud Storage',
      type: 'google-cloud-storage',
      requiresAuth: true,
      features: {
        upload: true,
        download: true,
        list: true,
        delete: true,
      },
    };
  }

  /**
   * Extract object name from GCS public URL
   */
  private extractObjectNameFromUrl(url: string): string {
    // Handle URLs like: https://storage.googleapis.com/bucket-name/path/to/file
    const match = url.match(/storage\.googleapis\.com\/[^/]+\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid Google Cloud Storage URL: ${url}`);
    }
    return match[1];
  }
}
