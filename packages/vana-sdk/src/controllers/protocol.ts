import { VanaContract, ContractInfo } from "../types";
import { ContractNotFoundError } from "../errors";
import { getContractAddress } from "../config/addresses";
import { getAbi } from "../abi";
import { ControllerContext } from "./permissions";

/**
 * Controller providing low-level access to Vana protocol contracts.
 * This serves as the designated "escape hatch" for advanced developers.
 */
export class ProtocolController {
  constructor(private readonly context: ControllerContext) {}

  /**
   * Provides direct, low-level access to the addresses and ABIs of Vana's canonical smart contracts.
   *
   * @param contractName - The name of the Vana contract to retrieve
   * @returns Object containing the contract's address and ABI
   * @throws ContractNotFoundError if the contract is not found on the current chain
   */
  getContract(contractName: VanaContract): ContractInfo {
    try {
      const chainId = this.context.walletClient.chain?.id;

      if (!chainId) {
        throw new Error("Chain ID not available from wallet client");
      }

      const address = getContractAddress(chainId, contractName);
      const abi = getAbi(contractName);

      return {
        address,
        abi,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Contract address not found")) {
          const chainId = this.context.walletClient.chain?.id || 0;
          throw new ContractNotFoundError(contractName, chainId);
        }
        throw error;
      }
      throw new Error(`Failed to get contract ${contractName}: Unknown error`);
    }
  }

  /**
   * Gets all available contract names that can be used with getContract().
   *
   * @returns Array of all available contract names
   */
  getAvailableContracts(): VanaContract[] {
    // This could be dynamically generated from the ABI registry
    // For now, we'll return a static list based on the VanaContract type
    return [
      "PermissionRegistry",
      "DataRegistry",
      "TeePool",
      "ComputeEngine",
      "TeePoolPhala",
      "DataRefinerRegistry",
      "QueryEngine",
      "ComputeInstructionRegistry",
      "TeePoolEphemeralStandard",
      "TeePoolPersistentStandard",
      "TeePoolPersistentGpu",
      "TeePoolDedicatedStandard",
      "TeePoolDedicatedGpu",
      "VanaEpoch",
      "DLPRegistry",
      "DLPRegistryTreasury",
      "DLPPerformance",
      "DLPRewardDeployer",
      "DLPRewardDeployerTreasury",
      "DLPRewardSwap",
      "SwapHelper",
      "VanaPoolStaking",
      "VanaPoolEntity",
      "VanaPoolTreasury",
      "DAT",
      "DATFactory",
      "DATPausable",
      "DATVotes",
    ];
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
