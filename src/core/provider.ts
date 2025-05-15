import { Account, Address, Chain, Client, createPublicClient, http } from "viem";
import { CONTRACT_ADDRESSES } from "../config/addresses";
import { VanaContract } from "../abi";
import { createClient } from "./client";
import { getContractController } from "../contracts/contractController";

export interface VanaConfig {
  chainId: number;
  rpcUrl: string;
  signer?: Account;
}

export class VanaProvider {
  provider: Client;
  signer?: Account;
  chainId: number;
  addresses: Record<string, string>;
  client: ReturnType<typeof createClient>;
  contracts: {
    dataRegistry: ReturnType<typeof getContractController<"DataRegistry">>;
    teePool: ReturnType<typeof getContractController<"TeePool">>;
    computeEngine: ReturnType<typeof getContractController<"ComputeEngine">>;
    dataLiquidityPool: ReturnType<
      typeof getContractController<"DataLiquidityPool">
    >;
  };

  constructor(config: VanaConfig) {
    this.provider = createPublicClient({
      transport: http(config.rpcUrl),
    });
    this.signer = config.signer;
    this.chainId = config.chainId;
    this.addresses = CONTRACT_ADDRESSES[config.chainId] || {};
    this.client = createClient(config.chainId);

    // Initialize contracts
    this.contracts = {
      dataRegistry: getContractController("DataRegistry", this.client),
      teePool: getContractController("TeePool", this.client),
      computeEngine: getContractController("ComputeEngine", this.client),
      dataLiquidityPool: getContractController(
        "DataLiquidityPool",
        this.client
      ),
    };
  }

  getContractAddress(name: string | VanaContract): string {
    const addr = this.addresses[name];
    if (!addr)
      throw new Error(`No address for ${name} on chain ${this.chainId}`);
    return addr;
  }

  async signerAddress(): Promise<Address> {
    if (!this.signer) {
      throw new Error("No signer configured");
    }
    return this.signer.address;
  }
}
