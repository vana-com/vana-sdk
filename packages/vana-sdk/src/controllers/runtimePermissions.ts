import { getContract } from "viem";
import { BaseController } from "./base";
import type {
  RuntimePermissionParams,
  RuntimePermission,
  RuntimeGrantFile,
  RuntimePermissionResult,
} from "../types/runtimePermissions";
import type { UnifiedRelayerRequest } from "../types/relayer";
import {
  createRuntimeGrantFile,
  retrieveRuntimeGrantFile,
} from "../utils/runtimeGrantFiles";
import { BlockchainError, NetworkError } from "../errors";
import { getContractAddress } from "../generated/addresses";
import { getAbi } from "../generated/abi";
import { tx } from "../utils/transactionHelpers";

/**
 * Controller for VanaRuntimePermissions contract
 *
 * @remarks
 * Manages permissions for data access via Vana Runtime. Allows dataset owners
 * to create monetized access permissions for data consumers to execute operations
 * on their datasets within TEE environments.
 *
 * Follows the same pattern as PermissionsController but for runtime-specific permissions.
 *
 * @category Controllers
 * @example
 * ```typescript
 * // Create a permission for a data consumer
 * const result = await sdk.runtimePermissions.createPermission({
 *   datasetId: 123n,
 *   grantee: "0x...",
 *   task: "vanaorg/vana-task-demo:latest",
 *   operation: "aggregate_keywords",
 *   pricing: { price_per_file_vana: 0.1 }
 * });
 *
 * console.log(`Permission created with ID: ${result.permissionId}`);
 * console.log(`Grant stored at: ${result.grantUrl}`);
 * ```
 */
export class RuntimePermissionsController extends BaseController {
  /**
   * Create a new runtime permission grant
   *
   * @remarks
   * This method:
   * 1. Creates a grant file with pricing and operation details
   * 2. Uploads the grant to IPFS (via relayer if available)
   * 3. Calls VanaRuntimePermissions.createPermission() on-chain
   * 4. Waits for transaction confirmation
   * 5. Returns the permission ID and grant URL
   *
   * @param params - Permission parameters including dataset, grantee, pricing
   * @returns Permission ID, transaction hash, and grant URL
   * @throws {BlockchainError} When permission creation fails
   * @throws {NetworkError} When IPFS upload fails
   *
   * @example
   * ```typescript
   * const result = await sdk.runtimePermissions.createPermission({
   *   datasetId: 123n,
   *   grantee: "0x742d35Cc...",
   *   task: "vanaorg/vana-task-demo:latest",
   *   operation: "aggregate_keywords",
   *   pricing: {
   *     price_per_file_vana: 0.1,
   *     minimum_price_vana: 0.01,
   *     maximum_price_vana: 100
   *   },
   *   parameters: {
   *     maxFiles: 1000
   *   },
   * });
   * ```
   */
  async createPermission(
    params: RuntimePermissionParams,
  ): Promise<RuntimePermissionResult> {
    this.assertWallet();

    try {
      // 1. Create grant file
      const grantFile = createRuntimeGrantFile(params);

      // 2. Upload to IPFS (via relayer if available, or use provided URL)
      let grantUrl = params.grantUrl;
      if (!grantUrl) {
        if (!this.context.relayer) {
          throw new NetworkError(
            "No relayer configured and no grantUrl provided. " +
              "Configure relayer or provide grantUrl parameter.",
          );
        }

        // Store via relayer
        const request: UnifiedRelayerRequest = {
          type: "direct",
          operation: "storeGrantFile",
          params: grantFile,
        };
        const response = await this.context.relayer(request);
        if (response.type === "error") {
          throw new NetworkError(
            `Failed to store grant file: ${response.error}`,
          );
        }
        if (
          response.type === "direct" &&
          typeof response.result === "object" &&
          response.result !== null &&
          "url" in response.result &&
          typeof response.result.url === "string"
        ) {
          grantUrl = response.result.url;
        } else {
          throw new NetworkError("Upload succeeded but no URL was returned");
        }
      }

      // 3. Get contract address and ABI
      const chainId = await this.context.publicClient.getChainId();
      const contractAddress = getContractAddress(
        chainId,
        "VanaRuntimePermissions",
      );
      const abi = getAbi("VanaRuntimePermissions");

      // 4. Convert grantee address to ID
      // NOTE: For MVP, we use address as ID. In production, this should
      // query a grantee registry contract or use a proper ID scheme.
      const granteeId = BigInt(params.grantee);

      // 5. Get current block for startBlock
      const startBlock = await this.context.publicClient.getBlockNumber();

      // 6. Set endBlock to max uint256 (never expires)
      // Note: Unlike DataPortabilityPermissions which has no on-chain expiration,
      // VanaRuntimePermissions contract requires endBlock. We always set it to
      // max uint256 since we have no way to predict future block numbers from timestamps.
      const endBlock = 2n ** 256n - 1n;

      // 7. Call contract to create permission
      const account =
        this.context.walletClient?.account ?? this.context.userAddress;

      const hash = await this.context.walletClient.writeContract({
        address: contractAddress,
        abi,
        functionName: "createPermission",
        args: [params.datasetId, granteeId, grantUrl, startBlock, endBlock],
        account,
        chain: this.context.walletClient?.chain ?? null,
      });

      // 8. Create transaction result for event parsing
      const txResult = tx({
        hash,
        from: typeof account === "string" ? account : account.address,
        contract: "VanaRuntimePermissions",
        fn: "createPermission",
      });

      // 9. Wait for transaction and parse events
      if (!this.context.waitForTransactionEvents) {
        throw new BlockchainError("waitForTransactionEvents not configured");
      }

      const result = await this.context.waitForTransactionEvents(txResult);

      // 10. Extract permission ID from PermissionCreated event
      const event = result.expectedEvents.PermissionCreated;
      if (!event) {
        throw new BlockchainError(
          "No PermissionCreated event found in transaction",
        );
      }

      return {
        permissionId: event.permissionId,
        hash,
        grantUrl,
      };
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new BlockchainError(
          `Failed to create runtime permission: ${error.message}`,
          error,
        );
      }
      throw new BlockchainError(
        "Failed to create runtime permission with unknown error",
      );
    }
  }

  /**
   * Get permission by ID
   *
   * @remarks
   * Fetches permission details from the VanaRuntimePermissions contract.
   * The returned permission contains an IPFS hash in the grant field,
   * which can be resolved using fetchGrant().
   *
   * @param permissionId - Permission identifier
   * @returns Permission details including dataset, grantee, and grant hash
   *
   * @example
   * ```typescript
   * const permission = await sdk.runtimePermissions.getPermission(1024n);
   * console.log(`Dataset: ${permission.datasetId}`);
   * console.log(`Grant: ${permission.grant}`); // IPFS hash
   *
   * // Resolve full grant details
   * const grantFile = await sdk.runtimePermissions.fetchGrant(permission);
   * console.log(`Price: ${grantFile.pricing.price_per_file_vana} VANA`);
   * ```
   */
  async getPermission(permissionId: bigint): Promise<RuntimePermission> {
    const chainId = await this.context.publicClient.getChainId();
    const contractAddress = getContractAddress(
      chainId,
      "VanaRuntimePermissions",
    );
    const abi = getAbi("VanaRuntimePermissions");

    const contract = getContract({
      address: contractAddress,
      abi,
      client: this.context.publicClient,
    });

    return (await contract.read.getPermission([
      permissionId,
    ])) as RuntimePermission;
  }

  /**
   * Check if permission is active (not expired)
   *
   * @remarks
   * Returns true if the current block number is between startBlock and endBlock.
   *
   * @param permissionId - Permission identifier
   * @returns Whether permission is currently active
   *
   * @example
   * ```typescript
   * const isActive = await sdk.runtimePermissions.isPermissionActive(1024n);
   * if (isActive) {
   *   console.log("Permission is valid");
   * } else {
   *   console.log("Permission has expired");
   * }
   * ```
   */
  async isPermissionActive(permissionId: bigint): Promise<boolean> {
    const chainId = await this.context.publicClient.getChainId();
    const contractAddress = getContractAddress(
      chainId,
      "VanaRuntimePermissions",
    );
    const abi = getAbi("VanaRuntimePermissions");

    const contract = getContract({
      address: contractAddress,
      abi,
      client: this.context.publicClient,
    });

    return (await contract.read.isPermissionActive([permissionId])) as boolean;
  }

  /**
   * Get all permissions for a dataset
   *
   * @remarks
   * Returns an array of permissions that have been granted for the specified dataset.
   * Useful for dataset owners to view all active permissions.
   *
   * @param datasetId - Dataset identifier
   * @returns Array of runtime permissions
   *
   * @example
   * ```typescript
   * const permissions = await sdk.runtimePermissions.getDatasetPermissions(123n);
   * console.log(`Found ${permissions.length} permissions`);
   *
   * // Access each permission directly
   * for (const permission of permissions) {
   *   console.log(`Permission ${permission.id}: ${permission.grant}`);
   * }
   * ```
   */
  async getDatasetPermissions(datasetId: bigint): Promise<RuntimePermission[]> {
    const chainId = await this.context.publicClient.getChainId();
    const contractAddress = getContractAddress(
      chainId,
      "VanaRuntimePermissions",
    );
    const abi = getAbi("VanaRuntimePermissions");

    const contract = getContract({
      address: contractAddress,
      abi,
      client: this.context.publicClient,
    });

    return (await contract.read.getDatasetPermissions([
      datasetId,
    ])) as RuntimePermission[];
  }

  /**
   * Fetch and parse grant file from IPFS
   *
   * @remarks
   * Resolves the IPFS hash stored in permission.grant and returns the
   * full grant file with pricing and operation details.
   *
   * @param permission - Permission with grant URL/hash
   * @returns Parsed grant file with pricing and parameters
   * @throws {NetworkError} When IPFS fetch fails
   *
   * @example
   * ```typescript
   * const permission = await sdk.runtimePermissions.getPermission(1024n);
   * const grant = await sdk.runtimePermissions.fetchGrant(permission);
   *
   * console.log(`Task: ${grant.task}`);
   * console.log(`Operation: ${grant.operation}`);
   * console.log(`Price: ${grant.pricing.price_per_file_vana} VANA per file`);
   * ```
   */
  async fetchGrant(permission: RuntimePermission): Promise<RuntimeGrantFile> {
    return await retrieveRuntimeGrantFile(permission.grant);
  }
}
