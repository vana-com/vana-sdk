import { Address, Hash, keccak256, toHex, createPublicClient, http, getContract } from 'viem';
import type { WalletClient } from 'viem';
import { 
  GrantPermissionParams, 
  RevokePermissionParams, 
  PermissionGrantTypedData,
  RelayerStorageResponse,
  RelayerTransactionResponse,
  GrantedPermission
} from '../types';
import { 
  RelayerError, 
  UserRejectedRequestError, 
  SerializationError, 
  SignatureError, 
  NetworkError, 
  NonceError,
  BlockchainError
} from '../errors';
import { getContractAddress } from '../config/addresses';
import { getAbi } from '../abi';


/**
 * Shared context passed to all controllers.
 */
export interface ControllerContext {
  walletClient: WalletClient;
  relayerUrl: string;
  applicationWallet: WalletClient;
}

/**
 * Controller for managing data access permissions.
 */
export class PermissionsController {
  private readonly DEFAULT_RELAYER_URL = 'https://relayer.vana.org';

  constructor(private readonly context: ControllerContext) {}

  /**
   * Grants permission for an application to access user data.
   * Implements the complete gasless verifiable permissions flow.
   * 
   * @param params - The permission grant parameters
   * @returns Promise resolving to the transaction hash
   */
  async grant(params: GrantPermissionParams): Promise<Hash> {
    try {
      // Step 1: Parameter Serialization
      const serializedParameters = this.serializeParameters(params.parameters);
      
      // Step 2: Cryptographic Commitment
      const parametersHash = keccak256(toHex(serializedParameters));
      
      // Step 3: Off-Chain Storage
      const grantUrl = await this.storeParameters(serializedParameters);
      
      // Step 4: Nonce Retrieval
      const nonce = await this.getUserNonce();
      
      // Step 5: EIP-712 Message Composition
      const typedData = await this.composePermissionGrantMessage({
        to: params.to,
        operation: params.operation,
        files: params.files,
        grantUrl,
        parametersHash,
        nonce
      });
      
      // Step 6: User Signature
      const signature = await this.signTypedData(typedData);
      
      // Step 7: Relay for Execution
      const transactionHash = await this.relayTransaction(typedData, signature);
      
      // Step 8: Return Transaction Hash
      return transactionHash;
      
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw known Vana errors directly
        if (error instanceof RelayerError || 
            error instanceof UserRejectedRequestError || 
            error instanceof SerializationError || 
            error instanceof SignatureError || 
            error instanceof NetworkError || 
            error instanceof NonceError) {
          throw error;
        }
        // Wrap unknown errors
        throw new BlockchainError(`Permission grant failed: ${error.message}`, error);
      }
      throw new BlockchainError('Permission grant failed with unknown error');
    }
  }

  /**
   * Revokes a previously granted permission.
   * 
   * @param params - The permission revoke parameters
   * @returns Promise resolving to the transaction hash
   */
  async revoke(params: RevokePermissionParams): Promise<Hash> {
    try {
      // Implementation follows similar pattern to grant
      // For now, we'll implement a simplified version
      // TODO: Implement complete revoke flow with proper EIP-712 structure
      
      const userAddress = await this.getUserAddress();
      const nonce = await this.getUserNonce();
      
      // Create revoke message (simplified for now)
      const revokeMessage = {
        from: userAddress,
        grantId: params.grantId,
        nonce
      };
      
      // Create typed data for revoke (simplified structure)
      const typedData = {
        domain: await this.getPermissionDomain(),
        types: {
          PermissionRevoke: [
            { name: 'from', type: 'address' },
            { name: 'grantId', type: 'bytes32' },
            { name: 'nonce', type: 'uint256' }
          ]
        },
        primaryType: 'PermissionRevoke' as const,
        message: revokeMessage
      };
      
      const signature = await this.signTypedData(typedData);
      
      // Submit to relayer
      const response = await this.submitToRelayer('revoke', {
        typedData,
        signature
      });
      
      return response.transactionHash;
      
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw known Vana errors directly
        if (error instanceof RelayerError || 
            error instanceof UserRejectedRequestError || 
            error instanceof SerializationError || 
            error instanceof SignatureError || 
            error instanceof NetworkError || 
            error instanceof NonceError) {
          throw error;
        }
        throw new BlockchainError(`Permission revoke failed: ${error.message}`, error);
      }
      throw new BlockchainError('Permission revoke failed with unknown error');
    }
  }

  /**
   * Serializes parameters into a stable, canonical JSON string.
   */
  private serializeParameters(parameters: Record<string, any>): string {
    try {
      // Create a stable JSON representation by sorting keys
      const sortedParams = this.sortObjectKeys(parameters);
      return JSON.stringify(sortedParams);
    } catch (error) {
      throw new SerializationError(`Failed to serialize parameters: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Recursively sorts object keys for stable serialization.
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }
    
    const sortedObj: Record<string, any> = {};
    Object.keys(obj).sort().forEach(key => {
      sortedObj[key] = this.sortObjectKeys(obj[key]);
    });
    
    return sortedObj;
  }

  /**
   * Stores parameters off-chain via the relayer service.
   */
  private async storeParameters(serializedParameters: string): Promise<string> {
    try {
      const relayerUrl = this.context.relayerUrl || this.DEFAULT_RELAYER_URL;
      const response = await fetch(`${relayerUrl}/api/v1/parameters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parameters: serializedParameters
        })
      });

      if (!response.ok) {
        throw new RelayerError(
          `Failed to store parameters: ${response.statusText}`,
          response.status,
          await response.text()
        );
      }

      const data: RelayerStorageResponse = await response.json();
      
      if (!data.success) {
        throw new RelayerError(data.error || 'Failed to store parameters');
      }

      return data.grantUrl;
      
    } catch (error) {
      if (error instanceof RelayerError) {
        throw error;
      }
      throw new NetworkError(`Network error while storing parameters: ${error instanceof Error ? error.message : 'Unknown error'}`, error as Error);
    }
  }

  /**
   * Retrieves the user's current nonce from the PermissionRegistry contract.
   */
  private async getUserNonce(): Promise<bigint> {
    try {
      const userAddress = await this.getUserAddress();
      const chainId = await this.context.walletClient.getChainId();
      
      // Create a public client for reading contracts
      const publicClient = createPublicClient({
        chain: this.context.walletClient.chain,
        transport: http()
      });
      
      const permissionRegistryAddress = getContractAddress(chainId, 'PermissionRegistry');
      const permissionRegistryAbi = getAbi('PermissionRegistry');
      
      const nonce = await publicClient.readContract({
        address: permissionRegistryAddress,
        abi: permissionRegistryAbi,
        functionName: 'userNonce',
        args: [userAddress]
      }) as bigint;
      
      return nonce;
      
    } catch (error) {
      throw new NonceError(`Failed to retrieve user nonce: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Composes the EIP-712 typed data for PermissionGrant.
   */
  private async composePermissionGrantMessage(params: {
    to: Address;
    operation: string;
    files: number[];
    grantUrl: string;
    parametersHash: Hash;
    nonce: bigint;
  }): Promise<PermissionGrantTypedData> {
    const userAddress = await this.getUserAddress();
    const domain = await this.getPermissionDomain();
    
    return {
      domain,
      types: {
        PermissionGrant: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'operation', type: 'string' },
          { name: 'grantUrl', type: 'string' },
          { name: 'parametersHash', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' }
        ]
      },
      primaryType: 'PermissionGrant',
      message: {
        from: userAddress,
        to: params.to,
        operation: params.operation,
        grantUrl: params.grantUrl,
        parametersHash: params.parametersHash,
        nonce: params.nonce
      },
      files: params.files
    };
  }

  /**
   * Gets the EIP-712 domain for PermissionGrant signatures.
   */
  private async getPermissionDomain() {
    const chainId = await this.context.walletClient.getChainId();
    const permissionRegistryAddress = getContractAddress(chainId, 'PermissionRegistry');
    
    return {
      name: 'Vana Permission Registry',
      version: '1',
      chainId,
      verifyingContract: permissionRegistryAddress
    };
  }

  /**
   * Signs typed data using the wallet client.
   */
  private async signTypedData(typedData: any): Promise<Hash> {
    try {
      const signature = await this.context.walletClient.signTypedData(typedData);
      return signature;
    } catch (error) {
      if (error instanceof Error && error.message.includes('rejected')) {
        throw new UserRejectedRequestError();
      }
      throw new SignatureError(`Failed to sign typed data: ${error instanceof Error ? error.message : 'Unknown error'}`, error as Error);
    }
  }

  /**
   * Submits a signed transaction to the relayer service.
   */
  private async relayTransaction(typedData: PermissionGrantTypedData, signature: Hash): Promise<Hash> {
    try {
      const relayerUrl = this.context.relayerUrl || this.DEFAULT_RELAYER_URL;
      const response = await fetch(`${relayerUrl}/api/v1/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          typedData: {
            ...typedData,
            message: {
              ...typedData.message,
              nonce: Number(typedData.message.nonce)
            }
          },
          signature
        })
      });

      if (!response.ok) {
        throw new RelayerError(
          `Failed to relay transaction: ${response.statusText}`,
          response.status,
          await response.text()
        );
      }

      const data: RelayerTransactionResponse = await response.json();
      
      if (!data.success) {
        throw new RelayerError(data.error || 'Failed to relay transaction');
      }

      return data.transactionHash;
      
    } catch (error) {
      if (error instanceof RelayerError) {
        throw error;
      }
      throw new NetworkError(`Network error while relaying transaction: ${error instanceof Error ? error.message : 'Unknown error'}`, error as Error);
    }
  }

  /**
   * Submits a request to the relayer service (generic method).
   */
  private async submitToRelayer(endpoint: string, payload: any): Promise<RelayerTransactionResponse> {
    try {
      const relayerUrl = this.context.relayerUrl || this.DEFAULT_RELAYER_URL;
      const response = await fetch(`${relayerUrl}/api/v1/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new RelayerError(
          `Failed to submit to relayer: ${response.statusText}`,
          response.status,
          await response.text()
        );
      }

      const data: RelayerTransactionResponse = await response.json();
      
      if (!data.success) {
        throw new RelayerError(data.error || 'Failed to submit to relayer');
      }

      return data;
      
    } catch (error) {
      if (error instanceof RelayerError) {
        throw error;
      }
      throw new NetworkError(`Network error while submitting to relayer: ${error instanceof Error ? error.message : 'Unknown error'}`, error as Error);
    }
  }

  /**
   * Gets the user's address from the wallet client.
   */
  private async getUserAddress(): Promise<Address> {
    const addresses = await this.context.walletClient.getAddresses();
    if (addresses.length === 0) {
      throw new BlockchainError('No addresses available in wallet client');
    }
    return addresses[0];
  }

  /**
   * Retrieves all permissions granted by the current user.
   * 
   * @param params - Optional parameters to limit results
   * @returns Promise resolving to an array of GrantedPermission objects
   * 
   * @description This method queries the PermissionRegistry contract to find
   * all permissions where the current user is the grantor. It iterates through
   * the permissions registry and filters for user-granted permissions.
   */
  async getUserPermissions(params?: { 
    limit?: number;
  }): Promise<GrantedPermission[]> {
    try {
      const userAddress = await this.getUserAddress();
      const chainId = this.context.walletClient.chain?.id;
      
      if (!chainId) {
        throw new BlockchainError('Chain ID not available');
      }

      const permissionRegistryAddress = getContractAddress(chainId, 'PermissionRegistry');
      const permissionRegistryAbi = getAbi('PermissionRegistry');
      
      const permissionRegistry = getContract({
        address: permissionRegistryAddress,
        abi: permissionRegistryAbi,
        client: this.context.walletClient,
      });

      // Get count of permissions for this specific user
      const userPermissionCount = await permissionRegistry.read.userPermissionIdsLength([userAddress]);
      const count = Number(userPermissionCount);
      
      if (count === 0) {
        return [];
      }

      const userPermissions: GrantedPermission[] = [];
      const limit = params?.limit || 50; // Default limit to avoid too many calls
      const itemsToFetch = Math.min(count, limit);
      
      // Get permission IDs for this user, starting from most recent
      for (let i = count - 1; i >= Math.max(0, count - itemsToFetch); i--) {
        try {
          // Get the permission ID for this user at this index
          const permissionId = await permissionRegistry.read.userPermissionIdsAt([userAddress, BigInt(i)]);
          const id = Number(permissionId);
          
          // Get the permission details
          const permission = await permissionRegistry.read.permissions([permissionId]);
          
          userPermissions.push({
            id,
            application: permission.application,
            files: permission.files.map((f: bigint) => Number(f)),
            operation: permission.operation,
            prompt: permission.prompt,
          });
          
        } catch (error) {
          console.warn(`Failed to read permission at index ${i}:`, error);
        }
      }

      return userPermissions.sort((a, b) => b.id - a.id); // Most recent first
      
    } catch (error) {
      console.error('Failed to fetch user permissions:', error);
      throw new BlockchainError(`Failed to fetch user permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}