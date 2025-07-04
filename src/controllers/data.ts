import { Address, getContract } from 'viem';
import { UserFile } from '../types';
import { ControllerContext } from './permissions';
import { getContractAddress } from '../config/addresses';
import { getAbi } from '../abi';

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
      console.warn('No subgraph URL configured, returning empty array');
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
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: {
            userId: owner.toLowerCase(), // Subgraph stores addresses in lowercase
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Subgraph request failed: ${response.status} ${response.statusText}`);
      }

      const result: SubgraphResponse = await response.json();

      if (result.errors) {
        throw new Error(`Subgraph errors: ${result.errors.map(e => e.message).join(', ')}`);
      }

      const user = result.data?.user;
      if (!user || !user.fileContributions?.length) {
        console.log('No file contributions found for user:', owner);
        return [];
      }

      // Deduplicate file IDs and convert to UserFile format
      const uniqueFileIds = new Set<number>();
      const fileContributions = user.fileContributions
        .map(contribution => ({
          fileId: parseInt(contribution.fileId),
          createdAtBlock: BigInt(contribution.createdAtBlock),
        }))
        .filter(contribution => {
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
        const dataRegistryAddress = getContractAddress(chainId, 'DataRegistry');
        const dataRegistryAbi = getAbi('DataRegistry');
        
        const dataRegistry = getContract({
          address: dataRegistryAddress,
          abi: dataRegistryAbi,
          client: this.context.walletClient,
        });

        // Fetch details for each file (limit to first 50 to avoid too many requests)
        const filesToFetch = fileContributions.slice(0, 50);
        
        for (const contribution of filesToFetch) {
          try {
            const fileDetails = await dataRegistry.read.files([BigInt(contribution.fileId)]);
            
            userFiles.push({
              id: contribution.fileId,
              url: fileDetails.url,
              ownerAddress: fileDetails.ownerAddress,
              addedAtBlock: BigInt(fileDetails.addedAtBlock),
            });
          } catch (error) {
            console.warn(`Failed to fetch details for file ${contribution.fileId}:`, error);
          }
        }
      }

      if (userFiles.length > 0) {
        console.log(`Found ${userFiles.length} files with contributions from user:`, owner);
        return userFiles;
      }

    } catch (error) {
      console.warn('Failed to fetch user files from subgraph:', error);
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
        throw new Error('Chain ID not available');
      }

      const dataRegistryAddress = getContractAddress(chainId, 'DataRegistry');
      const dataRegistryAbi = getAbi('DataRegistry');
      
      const dataRegistry = getContract({
        address: dataRegistryAddress,
        abi: dataRegistryAbi,
        client: this.context.walletClient,
      });

      const count = await dataRegistry.read.filesCount();
      return Number(count);

    } catch (error) {
      console.error('Failed to fetch total files count:', error);
      return 0;
    }
  }
}