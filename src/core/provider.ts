import {
  Account,
  Address,
  Client,
  createPublicClient,
  http,
  WalletClient
} from "viem";
import { VanaContract } from "../abi";
import { CONTRACT_ADDRESSES } from "../config/addresses";
import { getContractController } from "../contracts/contractController";
import { createClient, createWalletClient } from "./client";

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
  };
  private _walletClient?: WalletClient;

  constructor(config: VanaConfig) {
    this.provider = createPublicClient({
      transport: http(config.rpcUrl),
    });
    this.signer = config.signer;
    this.chainId = config.chainId;
    this.addresses = CONTRACT_ADDRESSES[config.chainId] || {};
    this.client = createClient(config.chainId);

    // Create wallet client if signer is provided
    if (config.signer) {
      this._walletClient = createWalletClient(config.chainId, config.signer);
    }

    // Initialize contracts
    this.contracts = {
      dataRegistry: getContractController("DataRegistry", this.client),
      teePool: getContractController("TeePool", this.client),
      computeEngine: getContractController("ComputeEngine", this.client),
    };
  }

  getContractAddress(name: string | VanaContract): string {
    const addr = this.addresses[name];
    if (!addr)
      throw new Error(`No address for ${name} on chain ${this.chainId}`);
    return addr;
  }

  async walletClient(): Promise<WalletClient> {
    if (!this._walletClient) {
      throw new Error("No wallet client configured");
    }

    return this._walletClient;
  }

  async signerAddress(): Promise<Address> {
    if (!this.signer) {
      throw new Error("No signer configured");
    }
    return this.signer.address;
  }
}
