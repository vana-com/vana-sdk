import { VanaContract } from "../abi";
import { getContractController } from "./contractController";
import { VanaProvider } from "../core/provider";

/**
 * Base contract client class that can be extended by specific contract clients
 */
export abstract class ContractClient<T extends VanaContract> {
  protected contract: ReturnType<typeof getContractController<T>>;

  /**
   * @param contractName The name of the contract to use
   * @param provider The VanaProvider instance
   */
  constructor(
    contractName: T,
    protected readonly provider: VanaProvider
  ) {
    this.contract = getContractController(contractName, provider.client);
  }

  /**
   * Get the raw contract instance
   * Useful for direct access to all contract methods
   * @returns The raw contract instance
   */
  public getRawContract() {
    return this.contract;
  }
}
