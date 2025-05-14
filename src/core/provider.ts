import { ethers } from "ethers";
import { CONTRACT_ADDRESSES } from "../config/addresses";
import { VanaContract } from "../abi";
import { createClient } from "./client";

export interface VanaConfig {
  chainId: number;
  rpcUrl: string;
  signer?: ethers.Signer;
}

export class VanaProvider {
  provider: ethers.JsonRpcProvider;
  signer?: ethers.Signer;
  chainId: number;
  addresses: Record<string, string>;
  client: ReturnType<typeof createClient>;

  constructor(config: VanaConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = config.signer;
    this.chainId = config.chainId;
    this.addresses = CONTRACT_ADDRESSES[config.chainId] || {};
    this.client = createClient(config.chainId);
  }

  getContractAddress(name: string | VanaContract): string {
    const addr = this.addresses[name];
    if (!addr)
      throw new Error(`No address for ${name} on chain ${this.chainId}`);
    return addr;
  }

  async signerAddress(): Promise<string> {
    if (!this.signer) {
      throw new Error("No signer configured");
    }
    return await this.signer.getAddress();
  }
}
