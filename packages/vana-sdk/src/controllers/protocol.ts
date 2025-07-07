import type { VanaContract, ContractInfo, VanaChainId } from "../types";
import { ContractNotFoundError } from "../errors";
import {
  getContractController,
  getContractInfo,
  ContractFactory,
} from "../contracts/contractController";
import { ContractAbis } from "../abi";
import { ControllerContext } from "./permissions";
import type { GetContractReturnType } from "viem";

/**
 * Controller providing low-level access to Vana protocol contracts.
 * This serves as the designated "escape hatch" for advanced developers
 * with full type safety and contract interaction capabilities.
 */
export class ProtocolController {
  private readonly contractFactory: ContractFactory;

  constructor(private readonly context: ControllerContext) {
    this.contractFactory = new ContractFactory(context.walletClient);
  }

  /**
   * Provides direct, low-level access to the addresses and ABIs of Vana's canonical smart contracts.
   *
   * @param contractName - The name of the Vana contract to retrieve (use const assertion for full typing)
   * @returns Object containing the contract's address and ABI with full type inference
   * @throws ContractNotFoundError if the contract is not found on the current chain
   *
   * @example
   * ```typescript
   * // Get contract info with full type inference
   * const dataRegistry = protocol.getContract("DataRegistry" as const);
   * // Now dataRegistry.abi is fully typed
   * ```
   */
  getContract<T extends VanaContract>(
    contractName: T,
  ): ContractInfo<ContractAbis[T]> {
    try {
      const chainId = this.context.walletClient.chain?.id;

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
            chainId = this.context.walletClient.chain?.id || 0;
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
   * Creates a fully typed contract instance ready for interaction.
   * This provides complete type safety for all contract methods.
   *
   * @param contractName - The name of the Vana contract (use const assertion for full typing)
   * @returns Fully typed contract instance with read/write methods
   * @throws ContractNotFoundError if the contract is not found on the current chain
   *
   * @example
   * ```typescript
   * // Create typed contract instance
   * const dataRegistry = protocol.createContract("DataRegistry" as const);
   *
   * // Full type safety for all methods
   * const fileCount = await dataRegistry.read.getFileCount(); // Type: bigint
   * await dataRegistry.write.addFile([url, proof]); // Typed parameters
   * ```
   */
  createContract<T extends VanaContract>(
    contractName: T,
  ): GetContractReturnType<ContractAbis[T]> {
    try {
      return getContractController(contractName, this.context.walletClient);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Contract address not found")) {
          const chainId = this.context.walletClient.chain?.id || 0;
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
   */
  getChainId(): number {
    const chainId = this.context.walletClient.chain?.id;
    if (!chainId) {
      throw new Error("Chain ID not available from wallet client");
    }
    return chainId;
  }

  /**
   * Gets the current chain name from the wallet client.
   *
   * @returns The chain name
   */
  getChainName(): string {
    const chainName = this.context.walletClient.chain?.name;
    if (!chainName) {
      throw new Error("Chain name not available from wallet client");
    }
    return chainName;
  }
}
