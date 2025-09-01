/**
 * Provides type-safe contract interaction utilities for the Vana protocol.
 *
 * @remarks
 * This module enables strongly-typed smart contract interactions with automatic
 * ABI loading, address resolution, and instance caching. It follows viem's patterns
 * for contract typing while providing Vana-specific conveniences.
 *
 * @category Contracts
 * @module contractController
 */

import type { Abi } from "abitype";
import {
  getContract,
  type GetContractReturnType,
  type PublicClient,
  type WalletClient,
} from "viem";
import { type ContractAbis, getAbi, type VanaContract } from "../generated/abi";
import type { VanaChainId, ContractInfo } from "../types/index";
import { getContractAddress, CONTRACT_ADDRESSES } from "../config/addresses";
import { createClient } from "../core/client";
import { vanaMainnet } from "../config/chains";

// Cache for contract instances - keyed by contract name and chain ID
const contractCache = new Map<string, GetContractReturnType<Abi>>();

// Export cache for testing
export const contractCacheForTesting = contractCache;

/**
 * Creates a cache key for contract instances.
 *
 * @remarks
 * Generates unique keys for caching contract instances per chain to prevent
 * cross-chain contamination and improve performance.
 *
 * @param contract - The contract name to create a cache key for
 * @param chainId - The chain ID to include in the cache key
 * @returns A string cache key combining contract name and chain ID
 *
 * @internal
 */
function createCacheKey(contract: VanaContract, chainId: number): string {
  return `${contract}:${chainId}`;
}

/**
 * Gets a typed contract instance for the specified contract name.
 *
 * @remarks
 * Provides complete type safety following viem's patterns with automatic
 * ABI loading and address resolution. Contract instances are cached per
 * chain for performance. Use const assertion for full type inference.
 *
 * @param contract - Name of the contract to instantiate.
 *   Use const assertion for full typing: `"DataRegistry" as const`
 * @param client - Optional viem client instance.
 *   Defaults to auto-configured client. Obtain via `createClient()` or viem.
 * @returns A fully typed contract instance with methods corresponding to the contract's ABI
 *
 * @example
 * ```typescript
 * // Full type inference with const assertion
 * const dataRegistry = getContractController("DataRegistry" as const, client);
 *
 * // Now dataRegistry has full type inference for all methods
 * const result = await dataRegistry.read.getFileCount(); // Type: bigint
 * await dataRegistry.write.addFile([url, proof]); // Typed parameters
 *
 * // Auto-configured client
 * const permissions = getContractController("DataPortabilityPermissions" as const);
 * const granted = await permissions.read.hasPermission([grantor, grantee]);
 * ```
 *
 * @category Contracts
 */
export function getContractController<T extends VanaContract>(
  contract: T,
  client:
    | PublicClient
    | WalletClient
    | ReturnType<typeof createClient> = createClient(),
): GetContractReturnType<ContractAbis[T]> {
  const chainId = client.chain?.id ?? vanaMainnet.id;
  const cacheKey = createCacheKey(contract, chainId);

  let controller = contractCache.get(cacheKey);

  if (!controller) {
    controller = getContract({
      address: getContractAddress(chainId, contract),
      abi: getAbi(contract),
      client,
    }) as GetContractReturnType<ContractAbis[T]>;

    contractCache.set(cacheKey, controller);
  }

  return controller as GetContractReturnType<ContractAbis[T]>;
}

/**
 * Gets contract information without creating a contract instance.
 *
 * @remarks
 * Returns contract address and ABI for manual contract interaction or
 * custom client configuration. Useful when you need contract details
 * but don't want to create a client connection.
 *
 * @param contract - Name of the contract.
 *   Use const assertion for typed ABI.
 * @param chainId - Chain ID to get contract info for.
 *   Defaults to Vana mainnet (1480).
 * @returns Contract information with typed ABI
 *
 * @example
 * ```typescript
 * const info = getContractInfo("DataRegistry" as const, 14800);
 * console.log(info.address); // Typed as Address
 * console.log(info.abi); // Fully typed ABI
 *
 * // Use with custom viem client
 * const contract = getContract({
 *   ...info,
 *   client: customClient
 * });
 * ```
 *
 * @category Contracts
 */
export function getContractInfo<T extends VanaContract>(
  contract: T,
  chainId: VanaChainId = vanaMainnet.id as VanaChainId,
): ContractInfo<ContractAbis[T]> {
  return {
    address: getContractAddress(chainId, contract),
    abi: getAbi(contract),
  };
}

/**
 * Provides type-safe contract factory for creating multiple contract instances.
 *
 * @remarks
 * Alternative API for applications that need to create multiple contracts
 * with the same client. The factory pattern reduces boilerplate and ensures
 * consistent client configuration across contracts.
 *
 * @example
 * ```typescript
 * const factory = new ContractFactory(client);
 *
 * const dataRegistry = factory.create("DataRegistry" as const);
 * const permissions = factory.create("DataPortabilityPermissions" as const);
 *
 * // List available contracts
 * const contracts = factory.getAvailableContracts();
 * ```
 *
 * @category Contracts
 */
export class ContractFactory {
  private readonly client:
    | PublicClient
    | WalletClient
    | ReturnType<typeof createClient>;
  private readonly chainId: number;

  constructor(
    client: PublicClient | WalletClient | ReturnType<typeof createClient>,
  ) {
    this.client = client;
    try {
      this.chainId = client.chain?.id ?? vanaMainnet.id;
    } catch {
      this.chainId = vanaMainnet.id;
    }
  }

  /**
   * Creates a typed contract instance
   *
   * @param contract - Contract name (use const assertion for full typing)
   * @returns Fully typed contract instance
   */
  create<T extends VanaContract>(
    contract: T,
  ): GetContractReturnType<ContractAbis[T]> {
    return getContractController(contract, this.client);
  }

  /**
   * Gets contract information without creating an instance
   *
   * @param contract - Contract name
   * @returns Contract information with typed ABI
   */
  getInfo<T extends VanaContract>(contract: T): ContractInfo<ContractAbis[T]> {
    return getContractInfo(contract, this.chainId as VanaChainId);
  }

  /**
   * Lists all available contracts for the current chain
   *
   * @returns Array of contract names available on this chain
   */
  getAvailableContracts(): VanaContract[] {
    // Return all contract names that have addresses on this chain
    const chainAddresses = CONTRACT_ADDRESSES[this.chainId];
    if (!chainAddresses) return [];

    return Object.keys(chainAddresses) as VanaContract[];
  }
}

/**
 * Clears the contract cache. Useful for testing or when chain configurations change.
 *
 * @param contract - Optional specific contract to clear, or clear all if not provided
 * @param chainId - Optional specific chain to clear, or clear all if not provided
 */
export function clearContractCache(
  contract?: VanaContract,
  chainId?: number,
): void {
  if (contract && chainId) {
    const cacheKey = createCacheKey(contract, chainId);
    contractCache.delete(cacheKey);
  } else if (contract) {
    // Clear all instances of this contract across all chains
    for (const key of contractCache.keys()) {
      if (key.startsWith(`${contract}:`)) {
        contractCache.delete(key);
      }
    }
  } else if (chainId) {
    // Clear all contracts for this chain
    for (const key of contractCache.keys()) {
      if (key.endsWith(`:${chainId}`)) {
        contractCache.delete(key);
      }
    }
  } else {
    // Clear entire cache
    contractCache.clear();
  }
}

// Function is already exported above, no need for redundant export

// Type-only exports for enhanced type safety
export type { GetContractReturnType } from "viem";
