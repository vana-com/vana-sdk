
import { 
  Vana,
  VanaInstance, 
  GoogleDriveStorage,
  StorageProvider,
  generateEncryptionKey,
  encryptBlobWithSignedKey,
  BrowserPlatformAdapter,
  DEFAULT_ENCRYPTION_SEED,
  WalletClient,
  VanaChain
} from "@opendatalabs/vana-sdk/browser";

const DEMO_FILE_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/refs/heads/main/model_prices_and_context_window.json';

interface FlowStepCallbacks {
  onStatusUpdate: (status: string) => void;
  onResultUpdate: (result: string) => void;
  onError: (error: string) => void;
}

export class DataPortabilityFlow {
  private walletClient: WalletClient;
  private vana: VanaInstance | null = null;
  private callbacks: FlowStepCallbacks;
  private platformAdapter: BrowserPlatformAdapter;
  private googleDriveStorage: StorageProvider | null = null;

  constructor(walletClient: WalletClient, callbacks: FlowStepCallbacks) {
    this.walletClient = walletClient;
    this.callbacks = callbacks;
    this.platformAdapter = new BrowserPlatformAdapter();
  }

  async initializeVana() {
    this.callbacks.onStatusUpdate('Initializing Vana SDK...');
    
    try {
      // Get Google Drive tokens from session/API
      const googleDriveTokens = await this.getGoogleDriveTokens();
      
      if (!googleDriveTokens) {
        throw new Error('Google Drive not connected. Please connect your Google Drive account first.');
      }

      // Set up Google Drive storage - this is the only storage provider we use
      this.googleDriveStorage = new GoogleDriveStorage({
        accessToken: googleDriveTokens.accessToken,
        refreshToken: googleDriveTokens.refreshToken,
        folderId: googleDriveTokens.folderId,
      });

      const storageProviders: Record<string, StorageProvider> = {
        'google-drive': this.googleDriveStorage
      };

      this.callbacks.onStatusUpdate('Google Drive storage configured');

      // Initialize Vana SDK with Google Drive as the only storage provider
      this.vana = Vana({
        walletClient: this.walletClient as WalletClient & { chain: VanaChain },
        storage: {
          providers: storageProviders,
          defaultProvider: 'google-drive'
        }
      });

      this.callbacks.onStatusUpdate('Vana SDK initialized successfully');
    } catch (error) {
      throw new Error(`Failed to initialize Vana SDK: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async downloadDemoFile(): Promise<string> {
    this.callbacks.onStatusUpdate('Downloading demo file...');
    
    try {
      const response = await fetch(DEMO_FILE_URL);
      if (!response.ok) {
        throw new Error(`Failed to download demo file: ${response.statusText}`);
      }
      
      const data = await response.json();
      const jsonString = JSON.stringify(data, null, 2);
      
      this.callbacks.onStatusUpdate('Demo file downloaded successfully');
      return jsonString;
    } catch (error) {
      throw new Error(`Demo file download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async encryptFile(data: string): Promise<Blob> {
    this.callbacks.onStatusUpdate('Encrypting file with wallet signature...');
    
    try {
      // Generate encryption key using wallet signature
      const encryptionKey = await generateEncryptionKey(
        this.walletClient,
        this.platformAdapter,
        DEFAULT_ENCRYPTION_SEED
      );

      // Create blob from data
      const dataBlob = new Blob([data], { type: 'application/json' });

      // Encrypt the blob using Vana SDK
      const encryptedBlob = await encryptBlobWithSignedKey(
        dataBlob,
        encryptionKey,
        this.platformAdapter
      );

      this.callbacks.onStatusUpdate('File encrypted successfully with wallet signature');
      return encryptedBlob;
    } catch (error) {
      throw new Error(`File encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async uploadToStorage(encryptedData: Blob): Promise<string> {
    this.callbacks.onStatusUpdate('Uploading encrypted file to storage...');
    
    try {
      if (!this.vana) {
        throw new Error('Vana SDK not initialized');
      }

      // Use the storage provider directly for upload
      const fileName = `vana_demo_${Date.now()}.json`;
      if (!this.googleDriveStorage) {
        throw new Error('Google Drive storage not initialized');
      }
      const result = await this.googleDriveStorage.upload(encryptedData, fileName);
      
      this.callbacks.onStatusUpdate('File uploaded to storage successfully');
      return result.url;
    } catch (error) {
      throw new Error(`Storage upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createAndUploadGrantFile(granteeAddress: string, operation: string, parameters: Record<string, unknown>): Promise<string> {
    this.callbacks.onStatusUpdate('Creating and uploading grant file...');
    
    try {
      if (!this.vana) {
        throw new Error('Vana SDK not initialized');
      }

      // Create grant data following datawallet pattern
      const grantData = {
        grantee: granteeAddress,
        operation,
        parameters,
        files: [], // Will be populated by the contract
      };

      // Create grant file blob
      const grantBlob = new Blob([JSON.stringify(grantData, null, 2)], { 
        type: "application/json" 
      });

      // Upload grant file to storage using the same provider
      const grantFileName = `grant_${Date.now()}.json`;
      if (!this.googleDriveStorage) {
        throw new Error('Google Drive storage not initialized');
      }
      const result = await this.googleDriveStorage.upload(grantBlob, grantFileName);
      
      this.callbacks.onStatusUpdate('Grant file uploaded successfully');
      return result.url;
    } catch (error) {
      throw new Error(`Grant file creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async executeTransaction(fileUrl: string, userAddress: string): Promise<string> {
    this.callbacks.onStatusUpdate('Executing data portability transaction...');
    
    try {
      // First, create and upload the grant file
      const operation = 'llm_inference';
      const parameters = {
        prompt: "What is the best light weight model to use for coding?: {{data}}",
      };
      const grantUrl = await this.createAndUploadGrantFile(userAddress, operation, parameters);

      this.callbacks.onStatusUpdate('Executing batch transaction...');

      // Use the relay API to execute submitAddServerFilesAndPermissions
      const response = await fetch('/api/relay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation,
          fileUrl,
          parameters,
          userAddress,
          grantUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Relay transaction failed: ${errorData.error || response.statusText}`);
      }

      const result = await response.json();
      
      this.callbacks.onStatusUpdate(`Batch transaction completed: ${result.transactionHash}`);
      return result.batchId; // Return batchId for polling
    } catch (error) {
      throw new Error(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  private async getGoogleDriveTokens(): Promise<{ accessToken: string; refreshToken?: string; folderId?: string } | null> {
    try {
      // Try to get tokens from localStorage first
      const storedTokens = localStorage.getItem('google-drive-tokens');
      if (!storedTokens) {
        return null;
      }

      const tokens = JSON.parse(storedTokens);
      
      // Validate tokens with the API (handles refresh if needed)
      const response = await fetch('/api/auth/google-drive/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tokens }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.tokens) {
          // If tokens were refreshed, update localStorage
          if (data.refreshed) {
            localStorage.setItem('google-drive-tokens', JSON.stringify(data.tokens));
          }
          return data.tokens;
        }
      }
      
      // If validation failed, clear invalid tokens
      localStorage.removeItem('google-drive-tokens');
      return null;
    } catch {
      return null;
    }
  }

  async pollForResults(batchId: string, serverUrl: string): Promise<string> {
    this.callbacks.onStatusUpdate('Waiting for AI inference results...');
    
    const maxAttempts = 30;
    const pollInterval = 5000; // 5 seconds
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch('/api/trusted-server/poll', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            batchId,
            serverUrl,
          }),
        });

        if (!response.ok) {
          throw new Error('Polling request failed');
        }

        const data = await response.json();
        
        if (data.status === 'completed') {
          this.callbacks.onStatusUpdate('AI inference completed!');
          return JSON.stringify(data.result, null, 2);
        } else if (data.status === 'pending') {
          this.callbacks.onStatusUpdate(`Polling attempt ${attempt}/${maxAttempts}: ${data.message || 'Still processing...'}`);
          
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
        } else {
          throw new Error(data.error || 'Unknown polling error');
        }
      } catch (error) {
        console.warn(`Polling attempt ${attempt} failed:`, error);
        
        if (attempt < maxAttempts) {
          this.callbacks.onStatusUpdate(`Polling attempt ${attempt} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        } else {
          throw error;
        }
      }
    }
    
    throw new Error('AI inference timed out after maximum polling attempts');
  }

  async executeCompleteFlow(userAddress: string): Promise<void> {
    try {
      // Step 1: Initialize Vana SDK with storage providers
      await this.initializeVana();
      
      // Step 2: Download demo file
      const fileData = await this.downloadDemoFile();
      
      // Step 3: Encrypt file with wallet signature
      const encryptedBlob = await this.encryptFile(fileData);
      
      // Step 4: Upload to storage (Google Drive or IPFS)
      const fileUrl = await this.uploadToStorage(encryptedBlob);
      
      // Step 5: Execute blockchain transaction with permissions
      const fileId = await this.executeTransaction(fileUrl, userAddress);
      
      // Step 6: Poll for AI inference results
      const serverUrl = await this.getServerUrl(userAddress);
      const result = await this.pollForResults(fileId, serverUrl);
      
      this.callbacks.onResultUpdate(result);
      this.callbacks.onStatusUpdate('Data portability flow completed successfully!');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.callbacks.onError(errorMessage);
      this.callbacks.onStatusUpdate(`Flow failed: ${errorMessage}`);
      throw error;
    }
  }

  private async getServerUrl(_userAddress: string): Promise<string> {
    // Use the configured personal server base URL for polling
    return process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL || 'https://server.vana.com/api/v1';
  }
}