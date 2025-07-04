import { Address, getContract } from "viem";
import { UserFile, UploadEncryptedFileResult } from "../types";
import { ControllerContext } from "./permissions";
import { getContractAddress } from "../config/addresses";
import { getAbi } from "../abi";
import { StorageManager } from "../storage";
import { generateEncryptionKey, decryptUserData, DEFAULT_ENCRYPTION_SEED } from "../utils/encryption";

/**
 * GraphQL query response types for the subgraph
 */
interface SubgraphUser {
  id: string;
  fileContributions: Array<{
    id: string;
    fileId: string;
    createdAt: string;
    createdAtBlock: string;
  }>;
}

interface SubgraphResponse {
  data?: {
    user?: SubgraphUser;
  };
  errors?: Array<{ message: string }>;
}

/**
 * Controller for managing user data assets.
 */
export class DataController {
  constructor(private readonly context: ControllerContext) {}

  /**
   * Retrieves a list of data files for which a user has contributed proofs.
   *
   * @param params - Object containing the owner address and optional subgraph URL
   * @returns Promise resolving to an array of UserFile objects
   *
   * @description This method queries the Vana subgraph to find files where the user
   * has submitted proof contributions. It efficiently handles millions of files by:
   * 1. Querying the subgraph for user's file contributions (proof submissions)
   * 2. Deduplicating file IDs (user may have multiple proofs per file)
   * 3. Fetching file details from the DataRegistry contract
   * 4. Falling back to mock data if subgraph is unavailable
   *
   * @note The subgraph tracks proof contributions, not direct file ownership.
   * Files are associated with users through their proof submissions.
   */
  async getUserFiles(params: {
    owner: Address;
    subgraphUrl?: string;
  }): Promise<UserFile[]> {
    const { owner, subgraphUrl } = params;

    // Use provided subgraph URL or default from environment
    const graphqlEndpoint = subgraphUrl || process.env.NEXT_PUBLIC_SUBGRAPH_URL;

    if (!graphqlEndpoint) {
      console.warn("No subgraph URL configured, returning empty array");
      return [];
    }

    try {
      // Query the subgraph for user's file contributions
      const query = `
        query GetUserFileContributions($userId: ID!) {
          user(id: $userId) {
            id
            fileContributions {
              id
              fileId
              createdAt
              createdAtBlock
            }
          }
        }
      `;

      const response = await fetch(graphqlEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: {
            userId: owner.toLowerCase(), // Subgraph stores addresses in lowercase
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Subgraph request failed: ${response.status} ${response.statusText}`
        );
      }

      const result: SubgraphResponse = await response.json();

      if (result.errors) {
        throw new Error(
          `Subgraph errors: ${result.errors.map((e) => e.message).join(", ")}`
        );
      }

      const user = result.data?.user;
      if (!user || !user.fileContributions?.length) {
        console.log("No file contributions found for user:", owner);
        return [];
      }

      // Deduplicate file IDs and convert to UserFile format
      const uniqueFileIds = new Set<number>();
      const fileContributions = user.fileContributions
        .map((contribution) => ({
          fileId: parseInt(contribution.fileId),
          createdAtBlock: BigInt(contribution.createdAtBlock),
        }))
        .filter((contribution) => {
          if (uniqueFileIds.has(contribution.fileId)) {
            return false; // Duplicate file ID
          }
          uniqueFileIds.add(contribution.fileId);
          return true;
        })
        .sort((a, b) => Number(b.createdAtBlock - a.createdAtBlock)); // Latest first

      // Fetch file details from the DataRegistry contract for each unique file
      const userFiles: UserFile[] = [];
      const chainId = this.context.walletClient.chain?.id;

      if (chainId) {
        const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
        const dataRegistryAbi = getAbi("DataRegistry");

        const dataRegistry = getContract({
          address: dataRegistryAddress,
          abi: dataRegistryAbi,
          client: this.context.walletClient,
        });

        // Fetch details for each file (limit to first 50 to avoid too many requests)
        const filesToFetch = fileContributions.slice(0, 50);

        for (const contribution of filesToFetch) {
          try {
            const fileDetails = await dataRegistry.read.files([
              BigInt(contribution.fileId),
            ]);

            userFiles.push({
              id: contribution.fileId,
              url: fileDetails.url,
              ownerAddress: fileDetails.ownerAddress,
              addedAtBlock: BigInt(fileDetails.addedAtBlock),
            });
          } catch (error) {
            console.warn(
              `Failed to fetch details for file ${contribution.fileId}:`,
              error
            );
          }
        }
      }

      if (userFiles.length > 0) {
        console.log(
          `Found ${userFiles.length} files with contributions from user:`,
          owner
        );
        return userFiles;
      }
    } catch (error) {
      console.warn("Failed to fetch user files from subgraph:", error);
    }

    // Return empty array if all else fails
    return [];
  }

  /**
   * Gets the total number of files in the registry from the contract.
   *
   * @returns Promise resolving to the total file count
   */
  async getTotalFilesCount(): Promise<number> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");

      const dataRegistry = getContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        client: this.context.walletClient,
      });

      const count = await dataRegistry.read.filesCount();
      return Number(count);
    } catch (error) {
      console.error("Failed to fetch total files count:", error);
      return 0;
    }
  }

  /**
   * Retrieves details for a specific file by its ID.
   *
   * @param fileId - The file ID to look up
   * @returns Promise resolving to UserFile object
   *
   * @description This method queries the DataRegistry contract directly
   * to get file details for any file ID, regardless of user ownership.
   * This is useful for file lookup functionality where users can search
   * for specific files by ID.
   */
  async getFileById(fileId: number): Promise<UserFile> {
    try {
      const chainId = this.context.walletClient.chain?.id;
      if (!chainId) {
        throw new Error("Chain ID not available");
      }

      const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
      const dataRegistryAbi = getAbi("DataRegistry");

      const dataRegistry = getContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        client: this.context.walletClient,
      });

      const fileDetails = await dataRegistry.read.files([BigInt(fileId)]) as any;

      if (!fileDetails || fileDetails.id === BigInt(0)) {
        throw new Error("File not found");
      }

      return {
        id: Number(fileDetails.id),
        ownerAddress: fileDetails.ownerAddress,
        url: fileDetails.url,
        addedAtBlock: BigInt(fileDetails.addedAtBlock),
      };
    } catch (error) {
      console.error("Failed to fetch file by ID:", error);
      throw new Error(`Failed to fetch file ${fileId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Uploads an encrypted file to storage and registers it on the blockchain.
   *
   * @param encryptedFile - The encrypted file blob to upload
   * @param filename - Optional filename for the upload
   * @param providerName - Optional storage provider to use
   * @returns Promise resolving to upload result with file ID and storage URL
   *
   * @description This method handles the complete flow of:
   * 1. Uploading the encrypted file to the specified storage provider
   * 2. Registering the file URL on the DataRegistry contract via relayer
   * 3. Returning the assigned file ID and storage URL
   */
  async uploadEncryptedFile(
    encryptedFile: Blob,
    filename?: string,
    providerName?: string
  ): Promise<UploadEncryptedFileResult> {
    try {
      // Check if storage manager is available
      if (!this.context.storageManager) {
        throw new Error("Storage manager not configured. Please provide storage providers in VanaConfig.");
      }

      // Step 1: Upload encrypted file to storage
      const uploadResult = await this.context.storageManager.upload(
        encryptedFile,
        filename,
        providerName
      );

      // Step 2: Register file on blockchain (either via relayer or direct)
      const userAddress = await this.getUserAddress();
      
      if (this.context.relayerUrl) {
        // Gasless registration via relayer
        const addFileResponse = await fetch(`${this.context.relayerUrl}/api/relay/addFile`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: uploadResult.url,
            userAddress: userAddress,
          }),
        });

        if (!addFileResponse.ok) {
          throw new Error(
            `Failed to register file on blockchain: ${addFileResponse.statusText}`
          );
        }

        const addFileData = await addFileResponse.json();
        
        if (!addFileData.success) {
          throw new Error(addFileData.error || 'Failed to register file on blockchain');
        }

        return {
          fileId: addFileData.fileId,
          url: uploadResult.url,
          size: uploadResult.size,
          transactionHash: addFileData.transactionHash,
        };
      } else {
        // Direct transaction (user pays gas)
        const chainId = this.context.walletClient.chain?.id;
        if (!chainId) {
          throw new Error("Chain ID not available");
        }

        const dataRegistryAddress = getContractAddress(chainId, "DataRegistry");
        const dataRegistryAbi = getAbi("DataRegistry");

        const txHash = await this.context.walletClient.writeContract({
          address: dataRegistryAddress,
          abi: dataRegistryAbi,
          functionName: 'addFile',
          args: [uploadResult.url]
        });

        // For direct transactions, we can't easily get the file ID without waiting for the transaction
        // For now, return 0 as fileId - this could be improved by parsing transaction receipt
        return {
          fileId: 0, // TODO: Parse transaction receipt to get actual file ID
          url: uploadResult.url,
          size: uploadResult.size,
          transactionHash: txHash,
        };
      }

    } catch (error) {
      console.error("Failed to upload encrypted file:", error);
      throw new Error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypts a file that was encrypted using the Vana protocol.
   *
   * @param file - The UserFile object containing the file URL and metadata
   * @param encryptionSeed - Optional custom encryption seed (defaults to Vana standard)
   * @returns Promise resolving to the decrypted file as a Blob
   *
   * @description This method handles the complete flow of:
   * 1. Generating the encryption key from the user's wallet signature
   * 2. Fetching the encrypted file from the stored URL
   * 3. Decrypting the file using the canonical Vana decryption method
   */
  async decryptFile(
    file: UserFile,
    encryptionSeed: string = DEFAULT_ENCRYPTION_SEED
  ): Promise<Blob> {
    try {
      // Step 1: Generate encryption key using the same method used for encryption
      const encryptionKey = await generateEncryptionKey(
        this.context.walletClient,
        encryptionSeed
      );

      // Step 2: Fetch the encrypted file from the URL
      const fetchUrl = this.convertIpfsUrl(file.url);
      console.log(`🔍 Fetching file from: ${file.url} -> ${fetchUrl}`);
      
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "File not found. The encrypted file may have been moved or deleted."
          );
        } else if (response.status === 403) {
          throw new Error(
            "Access denied. You may not have permission to access this file."
          );
        } else {
          throw new Error(
            `Network error: ${response.status} ${response.statusText}`
          );
        }
      }

      const encryptedBlob = await response.blob();

      // Check if we got actual content
      if (encryptedBlob.size === 0) {
        throw new Error("File is empty or could not be retrieved.");
      }

      // Step 3: Decrypt the file using the canonical Vana decryption method
      const decryptedBlob = await decryptUserData(encryptedBlob, encryptionKey);
      
      return decryptedBlob;

    } catch (error) {
      console.error("Failed to decrypt file:", error);
      
      // Provide user-friendly error messages
      if (error instanceof Error) {
        if (
          error.message.includes("Session key decryption failed") ||
          error.message.includes("Error decrypting message")
        ) {
          throw new Error(
            "Wrong encryption key. This file may have been encrypted with a different wallet or encryption seed. Try using the same wallet that originally encrypted this file."
          );
        } else if (
          error.message.includes("Failed to fetch") ||
          error.message.includes("Network error")
        ) {
          throw new Error(
            "Network error: Cannot access the file URL. The file may be stored on a server that's not accessible or has CORS restrictions."
          );
        } else if (error.message.includes("File not found")) {
          throw new Error(
            "File not found: The encrypted file is no longer available at the stored URL."
          );
        } else if (error.message.includes("not a valid OpenPGP message")) {
          throw new Error(
            "Invalid file format: This file doesn't appear to be encrypted with the Vana protocol."
          );
        }
      }
      
      throw error;
    }
  }

  /**
   * Converts IPFS URLs to HTTP gateway URLs for fetching.
   */
  private convertIpfsUrl(ipfsUrl: string): string {
    if (ipfsUrl.startsWith('ipfs://')) {
      const hash = ipfsUrl.replace('ipfs://', '');
      return `https://ipfs.io/ipfs/${hash}`;
    }
    return ipfsUrl;
  }

  /**
   * Gets the user's address from the wallet client.
   */
  private async getUserAddress(): Promise<Address> {
    const addresses = await this.context.walletClient.getAddresses();
    if (addresses.length === 0) {
      throw new Error('No addresses available in wallet client');
    }
    return addresses[0];
  }
}
