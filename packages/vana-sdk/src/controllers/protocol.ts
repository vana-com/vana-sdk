import type { ContractInfo, VanaChainId } from "../types/index";
import type { VanaContract, ContractAbis } from "../generated/abi";
import { ContractNotFoundError } from "../errors";
import {
  getContractController,
  getContractInfo,
  ContractFactory,
} from "../contracts/contractController";
import type { ControllerContext } from "../types/controller-context";
import type { GetContractReturnType } from "viem";
import { BaseController } from "./base";

/**
 * Provides low-level access to Vana protocol smart contracts.
 *
 * @remarks
 * Advanced API for direct contract interaction. Most developers should use
 * higher-level controllers (DataController, PermissionsController) instead.
 * This controller serves as an escape hatch when high-level APIs lack needed
 * functionality.
 *
 * **Architecture:**
 * Automatically detects current chain and provides only deployed contracts.
 * Full TypeScript type safety through contract ABIs and const assertions.
 *
 * **Method Selection:**
 * - `getContract()` - Retrieve address and ABI for manual interaction
 * - `createContract()` - Get typed contract instance with read/write methods
 * - `getAvailableContracts()` - List all contracts on current chain
 * - `isContractAvailable()` - Check contract deployment status
 * - `getChainId()`/`getChainName()` - Current network information
 *
 * **When to Use:**
 * - Custom contract interactions not covered by high-level APIs
 * - Direct contract event listening
 * - Advanced protocol operations
 *
 * **Type Safety:**
 * Always use `as const` with contract names for full type inference.
 *
 * @example
 * ```typescript
 * // Get contract info with typed ABI
 * const registry = vana.protocol.getContract("DataRegistry" as const);
 * console.log(`Contract at ${registry.address}`);
 *
 * // Create typed contract instance
 * const contract = vana.protocol.createContract("DataRegistry" as const);
 * const count = await contract.read.filesCount(); // Returns: bigint
 *
 * // Write operations with full typing
 * const hash = await contract.write.addFile(["ipfs://..."]);
 * ```
 *
 * @category Advanced
 * @see For contract specifications, visit {@link https://docs.vana.org/docs/protocol-contracts}
 */
export class ProtocolController extends BaseController {
  private readonly contractFactory: ContractFactory;

  constructor(context: ControllerContext) {
    super(context);
    this.contractFactory = new ContractFactory(
      context.walletClient ?? context.publicClient,
    );
  }

  /**
   * Retrieves the address and ABI for a specific Vana protocol contract.
   *
   * @remarks
   * This method provides direct access to contract addresses and ABIs for the current
   * chain. It includes full TypeScript type inference when using const assertions,
   * enabling type-safe contract interactions. The method only returns contracts that
   * are actually deployed on the current network.
   * @param contractName - The name of the Vana contract to retrieve (use const assertion for full typing)
   * @returns An object containing the contract's address and fully typed ABI
   * @throws {ContractNotFoundError} When the contract is not deployed on the current chain.
   *   Verify contract name spelling and check current network with `getChainId()`.
   * @example
   * ```typescript
   * // Get contract info with full type inference
   * const dataRegistry = vana.protocol.getContract("DataRegistry" as const);
   *
   * // Now dataRegistry.abi is fully typed for the DataRegistry contract
   * console.log(dataRegistry.address); // "0x123..."
   * console.log(dataRegistry.abi.length); // Full ABI array
   * ```
   */
  getContract<T extends VanaContract>(
    contractName: T,
  ): ContractInfo<ContractAbis[T]> {
    try {
      const chainId =
        this.context.walletClient?.chain?.id ??
        this.context.publicClient.chain?.id;

      if (!chainId) {
        throw new ContractNotFoundError(contractName, 0);
      }

      return getContractInfo(contractName, chainId as VanaChainId);
    } catch (error) {
      if (error instanceof ContractNotFoundError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.message.includes("Contract address not found")) {
          let chainId = 0;
          try {
            chainId =
              this.context.walletClient?.chain?.id ??
              this.context.publicClient.chain?.id ??
              0;
          } catch {
            // Use 0 as fallback if chain ID access fails
            chainId = 0;
          }
          throw new ContractNotFoundError(contractName, chainId);
        }
        throw error;
      }
      throw new Error(`Failed to get contract ${contractName}: Unknown error`);
    }
  }

  /**
   * Creates a fully typed contract instance ready for blockchain interaction.
   *
   * @remarks
   * This method creates a contract instance with complete type safety for all contract
   * methods including read operations, write operations, and event handling. The instance
   * is pre-configured with the correct address, ABI, and wallet client for immediate use.
   * All method parameters and return types are fully typed based on the contract ABI.
   * @param contractName - The name of the Vana contract (use const assertion for full typing)
   * @returns A fully typed contract instance with read/write methods and event handling
   * @throws {ContractNotFoundError} When the contract is not deployed on the current chain
   * @example
   * ```typescript
   * // Create typed contract instance
   * const dataRegistry = vana.protocol.createContract("DataRegistry" as const);
   *
   * // Full type safety for all operations
   * const fileCount = await dataRegistry.read.filesCount(); // Type: bigint
   * const txHash = await dataRegistry.write.addFile(["ipfs://..."]); // Typed parameters
   *
   * // Listen to events with full typing
   * const logs = await dataRegistry.getEvents.FileAdded();
   * ```
   */
  createContract<T extends VanaContract>(
    contractName: T,
  ): GetContractReturnType<ContractAbis[T]> {
    this.assertWallet();
    try {
      return getContractController(contractName, this.context.walletClient);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Contract address not found")) {
          const chainId = this.context.walletClient.chain?.id ?? 0;
          throw new ContractNotFoundError(contractName, chainId);
        }
        throw error;
      }
      throw new Error(
        `Failed to create contract ${contractName}: Unknown error`,
      );
    }
  }

  /**
   * Gets all available contract names that can be used with getContract().
   * Returns only contracts that are actually deployed on the current chain.
   *
   * @returns Array of all available contract names for the current chain
   */
  getAvailableContracts(): VanaContract[] {
    return this.contractFactory.getAvailableContracts();
  }

  /**
   * Checks if a specific contract is available on the current chain.
   *
   * @param contractName - The contract name to check
   * @returns Whether the contract is deployed on the current chain
   */
  isContractAvailable(contractName: VanaContract): boolean {
    const availableContracts = this.getAvailableContracts();
    return availableContracts.includes(contractName);
  }

  /**
   * Gets the contract factory instance for advanced usage.
   * This provides access to additional contract management methods.
   *
   * @returns The contract factory instance
   */
  getContractFactory(): ContractFactory {
    return this.contractFactory;
  }

  /**
   * Gets the current chain ID from the wallet client.
   *
   * @returns The chain ID
   * @throws {Error} When chain ID is not available from wallet client
   */
  getChainId(): number {
    const chainId =
      this.context.walletClient?.chain?.id ??
      this.context.publicClient.chain?.id;
    if (!chainId) {
      throw new Error("Chain ID not available from client");
    }
    return chainId;
  }

  /**
   * Gets the current chain name from the wallet client.
   *
   * @returns The chain name
   * @throws {Error} When chain name is not available from wallet client
   */
  getChainName(): string {
    const chainName =
      this.context.walletClient?.chain?.name ??
      this.context.publicClient.chain?.name;
    if (!chainName) {
      throw new Error("Chain name not available from client");
    }
    return chainName;
  }
}
