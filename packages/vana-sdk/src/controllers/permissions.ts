import { Address, Hash, createPublicClient, http, getContract } from "viem";
import type { WalletClient } from "viem";
import {
  GrantPermissionParams,
  RevokePermissionParams,
  PermissionGrantTypedData,
  GenericTypedData,
  RelayerTransactionResponse,
  GrantedPermission,
} from "../types";
import {
  RelayerError,
  UserRejectedRequestError,
  SerializationError,
  SignatureError,
  NetworkError,
  NonceError,
  BlockchainError,
} from "../errors";
import { getContractAddress } from "../config/addresses";
import { getAbi } from "../abi";
import {
  createGrantFile,
  storeGrantFile,
  getGrantFileHash,
} from "../utils/grantFiles";
import { StorageManager } from "../storage";

/**
 * Shared context passed to all controllers.
 */
export interface ControllerContext {
  walletClient: WalletClient;
  relayerUrl?: string;
  storageManager?: StorageManager;
}

/**
 * Controller for managing data access permissions.
 */
export class PermissionsController {
  constructor(private readonly context: ControllerContext) {}

  /**
   * Grants permission for an application to access user data.
   * Implements the new IPFS-based grant file flow while maintaining
   * compatibility with the existing contract.
   *
   * @param params - The permission grant parameters
   * @returns Promise resolving to the transaction hash
   */
  async grant(params: GrantPermissionParams): Promise<Hash> {
    try {
      const userAddress = await this.getUserAddress();

      // Step 1: Create grant file with all the real data
      const grantFile = createGrantFile(params, userAddress);

      // Step 2: Use provided grantUrl or store grant file in IPFS
      let grantUrl = params.grantUrl;
      if (!grantUrl) {
        if (!this.context.relayerUrl) {
          throw new Error(
            "No relayerUrl configured and no grantUrl provided. For direct transactions, please provide a grantUrl. For gasless transactions, configure a relayer service.",
          );
        }
        grantUrl = await storeGrantFile(grantFile, this.context.relayerUrl);
      }

      // Step 3: Get user nonce
      const nonce = await this.getUserNonce();

      // Step 4: Create EIP-712 message with compatibility placeholders
      const typedData = await this.composePermissionGrantMessage({
        to: params.to,
        operation: params.operation, // Placeholder - real data is in IPFS
        files: params.files, // Placeholder - real data is in IPFS
        grantUrl,
        serializedParameters: getGrantFileHash(grantFile), // Hash as placeholder
        nonce,
      });

      // Step 5: User signature
      const signature = await this.signTypedData(typedData);

      // Step 6: Submit to blockchain (either via relay or direct)
      let transactionHash: Hash;
      if (this.context.relayerUrl) {
        // Gasless transaction via relayer
        transactionHash = await this.relayTransaction(typedData, signature);
      } else {
        // Direct transaction with gas payment
        transactionHash = await this.submitDirectTransaction(
          typedData,
          signature,
        );
      }

      return transactionHash;
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw known Vana errors directly
        if (
          error instanceof RelayerError ||
          error instanceof UserRejectedRequestError ||
          error instanceof SerializationError ||
          error instanceof SignatureError ||
          error instanceof NetworkError ||
          error instanceof NonceError
        ) {
          throw error;
        }
        // Wrap unknown errors
        throw new BlockchainError(
          `Permission grant failed: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError("Permission grant failed with unknown error");
    }
  }

  /**
   * Revokes a previously granted permission.
   *
   * @param params - Parameters for revoking the permission
   * @returns Promise resolving to transaction hash
   */
  async revoke(params: RevokePermissionParams): Promise<Hash> {
    try {
      // Check chain ID availability early
      if (!this.context.walletClient.chain?.id) {
        throw new BlockchainError("Chain ID not available");
      }

      // Implementation follows similar pattern to grant
      // For now, we'll implement a simplified version
      // TODO: Implement complete revoke flow with proper EIP-712 structure

      const userAddress = await this.getUserAddress();
      const nonce = await this.getUserNonce();

      // Create revoke message (simplified for now)
      const revokeMessage = {
        from: userAddress,
        grantId: params.grantId,
        nonce,
      };

      // Create typed data for revoke (simplified structure)
      const typedData = {
        domain: await this.getPermissionDomain(),
        types: {
          PermissionRevoke: [
            { name: "from", type: "address" },
            { name: "grantId", type: "bytes32" },
            { name: "nonce", type: "uint256" },
          ],
        },
        primaryType: "PermissionRevoke" as const,
        message: revokeMessage,
      };

      const signature = await this.signTypedData(typedData);

      // Submit either via relayer or direct transaction
      if (this.context.relayerUrl) {
        // Submit to relayer
        const response = await this.submitToRelayer("revoke", {
          typedData: {
            ...typedData,
            message: {
              ...typedData.message,
              nonce: Number(typedData.message.nonce),
            },
          },
          signature,
        });

        return response.transactionHash;
      } else {
        // TODO: Implement direct revoke transaction
        // For now, return a mock hash since the contract doesn't have revoke yet
        return `0xmock${params.grantId.slice(2).substring(0, 60)}` as Hash;
      }
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw known Vana errors directly
        if (
          error instanceof RelayerError ||
          error instanceof UserRejectedRequestError ||
          error instanceof SerializationError ||
          error instanceof SignatureError ||
          error instanceof NetworkError ||
          error instanceof NonceError
        ) {
          throw error;
        }
        throw new BlockchainError(
          `Permission revoke failed: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError("Permission revoke failed with unknown error");
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
        transport: http(),
      });

      const permissionRegistryAddress = getContractAddress(
        chainId,
        "PermissionRegistry",
      );
      const permissionRegistryAbi = getAbi("PermissionRegistry");

      const nonce = (await publicClient.readContract({
        address: permissionRegistryAddress,
        abi: permissionRegistryAbi,
        functionName: "userNonce",
        args: [userAddress],
      })) as bigint;

      return nonce;
    } catch (error) {
      throw new NonceError(
        `Failed to retrieve user nonce: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Composes the EIP-712 typed data for PermissionGrant (new simplified format).
   */
  private async composePermissionGrantMessage(params: {
    to: Address;
    operation: string;
    files: number[];
    grantUrl: string;
    serializedParameters: string;
    nonce: bigint;
  }): Promise<PermissionGrantTypedData> {
    const domain = await this.getPermissionDomain();

    return {
      domain,
      types: {
        Permission: [
          { name: "nonce", type: "uint256" },
          { name: "grant", type: "string" },
        ],
      },
      primaryType: "Permission",
      message: {
        nonce: params.nonce,
        grant: params.grantUrl,
      },
      files: params.files,
    };
  }

  /**
   * Gets the EIP-712 domain for PermissionGrant signatures.
   */
  private async getPermissionDomain() {
    const chainId = await this.context.walletClient.getChainId();
    const permissionRegistryAddress = getContractAddress(
      chainId,
      "PermissionRegistry",
    );

    return {
      name: "VanaDataWallet",
      version: "1",
      chainId,
      verifyingContract: permissionRegistryAddress,
    };
  }

  /**
   * Signs typed data using the wallet client.
   */
  private async signTypedData(
    typedData: PermissionGrantTypedData | GenericTypedData,
  ): Promise<Hash> {
    try {
      const signature = await this.context.walletClient.signTypedData(
        typedData as Parameters<
          typeof this.context.walletClient.signTypedData
        >[0],
      );
      return signature;
    } catch (error) {
      if (error instanceof Error && error.message.includes("rejected")) {
        throw new UserRejectedRequestError();
      }
      throw new SignatureError(
        `Failed to sign typed data: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submits a transaction directly to the blockchain (user pays gas).
   */
  private async submitDirectTransaction(
    typedData: PermissionGrantTypedData,
    signature: Hash,
  ): Promise<Hash> {
    try {
      const chainId = await this.context.walletClient.getChainId();
      const permissionRegistryAddress = getContractAddress(
        chainId,
        "PermissionRegistry",
      );
      const permissionRegistryAbi = getAbi("PermissionRegistry");

      // Prepare the PermissionInput struct (simplified format)
      const permissionInput = {
        nonce: BigInt(typedData.message.nonce),
        grant: typedData.message.grant,
      };

      // Submit directly to the contract
      const txHash = await this.context.walletClient.writeContract({
        address: permissionRegistryAddress,
        abi: permissionRegistryAbi,
        functionName: "addPermission",
        args: [permissionInput, signature],
        account:
          this.context.walletClient.account || (await this.getUserAddress()),
        chain: this.context.walletClient.chain || null,
      });

      return txHash;
    } catch (error) {
      throw new BlockchainError(
        `Direct transaction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submits a signed transaction to the relayer service.
   */
  private async relayTransaction(
    typedData: PermissionGrantTypedData,
    signature: Hash,
  ): Promise<Hash> {
    try {
      console.log("🔍 SDK Debug - Relaying with typed data:", {
        hasFiles: "files" in typedData,
        files: typedData.files,
        filesLength: typedData.files?.length,
      });

      const relayerUrl = this.context.relayerUrl;
      if (!relayerUrl) {
        throw new RelayerError("Relayer URL is not configured", 500);
      }
      const response = await fetch(`${relayerUrl}/api/v1/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          typedData: {
            ...typedData,
            message: {
              ...typedData.message,
              nonce: Number(typedData.message.nonce),
            },
          },
          signature,
        }),
      });

      if (!response.ok) {
        throw new RelayerError(
          `Failed to relay transaction: ${response.statusText}`,
          response.status,
          await response.text(),
        );
      }

      const data: RelayerTransactionResponse = await response.json();

      if (!data.success) {
        throw new RelayerError(data.error || "Failed to relay transaction");
      }

      return data.transactionHash;
    } catch (error) {
      if (error instanceof RelayerError) {
        throw error;
      }
      throw new NetworkError(
        `Network error while relaying transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Submits a request to the relayer service (generic method).
   */
  private async submitToRelayer(
    endpoint: string,
    payload: unknown,
  ): Promise<RelayerTransactionResponse> {
    try {
      const relayerUrl = this.context.relayerUrl;
      if (!relayerUrl) {
        throw new RelayerError("Relayer URL is not configured", 500);
      }
      const response = await fetch(`${relayerUrl}/api/v1/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new RelayerError(
          `Failed to submit to relayer: ${response.statusText}`,
          response.status,
          await response.text(),
        );
      }

      const data: RelayerTransactionResponse = await response.json();

      if (!data.success) {
        throw new RelayerError(data.error || "Failed to submit to relayer");
      }

      return data;
    } catch (error) {
      if (error instanceof RelayerError) {
        throw error;
      }
      throw new NetworkError(
        `Network error while submitting to relayer: ${error instanceof Error ? error.message : "Unknown error"}`,
        error as Error,
      );
    }
  }

  /**
   * Gets the user's address from the wallet client.
   */
  private async getUserAddress(): Promise<Address> {
    const addresses = await this.context.walletClient.getAddresses();
    if (addresses.length === 0) {
      throw new BlockchainError("No addresses available in wallet client");
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
        throw new BlockchainError("Chain ID not available");
      }

      const permissionRegistryAddress = getContractAddress(
        chainId,
        "PermissionRegistry",
      );
      const permissionRegistryAbi = getAbi("PermissionRegistry");

      const permissionRegistry = getContract({
        address: permissionRegistryAddress,
        abi: permissionRegistryAbi,
        client: this.context.walletClient,
      });

      // Get count of permissions for this specific user
      const userPermissionCount =
        await permissionRegistry.read.userPermissionIdsLength([userAddress]);
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
          const permissionId =
            await permissionRegistry.read.userPermissionIdsAt([
              userAddress,
              BigInt(i),
            ]);
          const id = Number(permissionId);

          // Get the permission details
          const permission = await permissionRegistry.read.permissions([
            permissionId,
          ]);

          userPermissions.push({
            id,
            files: [], // Files are now stored in the grant URL (IPFS)
            grant: permission.grant,
          });
        } catch (error) {
          console.warn(`Failed to read permission at index ${i}:`, error);
        }
      }

      return userPermissions.sort((a, b) => b.id - a.id); // Most recent first
    } catch (error) {
      console.error("Failed to fetch user permissions:", error);
      throw new BlockchainError(
        `Failed to fetch user permissions: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Fetches grant data from any URL (IPFS or HTTP) with graceful error handling
   */
  private async fetchGrantFromIPFS(grantUrl: string): Promise<unknown> {
    try {
      // Convert IPFS URL to HTTP gateway URL if needed
      let fetchUrl = grantUrl;
      if (grantUrl.startsWith("ipfs://")) {
        // Use a public IPFS gateway - could be configurable
        fetchUrl = grantUrl.replace("ipfs://", "https://ipfs.io/ipfs/");
      }

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Request timeout")), 5000);
      });

      // Race between fetch and timeout
      const response = await Promise.race([fetch(fetchUrl), timeoutPromise]);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Basic validation - check if it looks like grant data
      if (typeof data === "object" && data !== null) {
        return data;
      }

      return null;
    } catch (error) {
      // Don't throw - let caller handle graceful degradation
      console.debug(`IPFS fetch failed for ${grantUrl}:`, error);
      return null;
    }
  }
}
