import { Abi } from "abitype";
import { getContract, GetContractReturnType } from "viem";
import { ContractAbis, getAbi, VanaContract } from "../abi";
import { getContractAddress } from "../config/addresses";
import { createClient } from "../core/client";
import { vanaMainnet } from "../config/chains";

// Cache for contract instances
const controllers = new Map<VanaContract, GetContractReturnType<Abi>>();

/**
 * Gets a typed contract instance for the specified contract name
 *
 * @param contractName - Name of the contract to instantiate
 * @param client - Optional viem client instance
 * @returns A typed contract instance with methods corresponding to the contract's ABI
 */
export function getContractController<T extends VanaContract>(
  contract: T,
  client: ReturnType<typeof createClient> = createClient()
): GetContractReturnType<ContractAbis[T]> {
  let controller = controllers.get(contract);

  if (!controller) {
    controller = getContract({
      address: getContractAddress(client.chain?.id ?? vanaMainnet.id, contract),
      abi: getAbi(contract),
      client,
    });
    controllers.set(contract, controller);
  }

  return controller as GetContractReturnType<ContractAbis[T]>;
}
