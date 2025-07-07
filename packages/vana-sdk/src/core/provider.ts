import {
  Account,
  Address,
  Client,
  createPublicClient,
  http,
  WalletClient,
} from "viem";
import type { VanaContractName, ChainConfig } from "../types";
import { isVanaChainId } from "../types/index";
import { CONTRACT_ADDRESSES } from "../config/addresses";
import { getContractController } from "../contracts/contractController";
import { createClient, createWalletClient } from "./client";

/**
 * @deprecated Use ChainConfig from "../types" instead
 * Legacy configuration interface for VanaProvider
 */
export interface VanaConfig {
  chainId: number;
  rpcUrl: string;
  signer?: Account;
}

/**
 * @deprecated VanaProvider is deprecated. Use the Vana class instead for better type safety and features.
 *
 * Legacy provider class for backward compatibility.
 * This class will be removed in a future version.
 *
 * @example
 * ```typescript
 * // OLD (deprecated)
 * const provider = new VanaProvider({ chainId: 14800, rpcUrl: '...' });
 *
 * // NEW (recommended)
 * import { Vana } from 'vana-sdk';
 * const vana = new Vana({
 *   walletClient: createWalletClient({ ... })
 * });
 * ```
 */
export class VanaProvider {
  provider: Client;
  signer?: Account;
  chainId: number;
  addresses: Record<string, string>;
  client: ReturnType<typeof createClient>;
  contracts: {
    dataRegistry: ReturnType<typeof getContractController<"DataRegistry">>;
    teePool: ReturnType<typeof getContractController<"TeePoolPhala">>;
    computeEngine: ReturnType<typeof getContractController<"ComputeEngine">>;
  };
  private _walletClient?: WalletClient;

  constructor(config: VanaConfig) {
    // Show deprecation warning
    console.warn(
      "⚠️  VanaProvider is deprecated. Please use the Vana class instead for better type safety and features.\n" +
        "See the migration guide: https://docs.vana.org/sdk/migration",
    );

    // Validate chain ID
    if (!isVanaChainId(config.chainId)) {
      throw new Error(
        `Unsupported chain ID: ${config.chainId}. Supported chains: 14800 (Moksha testnet), 1480 (Vana mainnet)`,
      );
    }

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
      teePool: getContractController("TeePoolPhala", this.client),
      computeEngine: getContractController("ComputeEngine", this.client),
    };
  }

  /**
   * Gets the contract address for a given contract name
   * @param name - Contract name
   * @returns Contract address
   * @throws Error if contract address not found
   */
  getContractAddress(name: string | VanaContractName): string {
    const addr = this.addresses[name];
    if (!addr) {
      throw new Error(`No address for ${name} on chain ${this.chainId}`);
    }
    return addr as Address;
  }

  /**
   * Gets the wallet client instance
   * @returns Promise resolving to wallet client
   * @throws Error if no wallet client configured
   */
  async walletClient(): Promise<WalletClient> {
    if (!this._walletClient) {
      throw new Error("No wallet client configured");
    }

    return this._walletClient;
  }

  /**
   * Gets the signer address
   * @returns Promise resolving to signer address
   * @throws Error if no signer configured
   */
  async signerAddress(): Promise<Address> {
    if (!this.signer) {
      throw new Error("No signer configured");
    }
    return this.signer.address;
  }

  /**
   * Gets the chain configuration
   * @returns Chain configuration object
   */
  getChainConfig(): ChainConfig {
    if (!this.signer) {
      throw new Error("No signer configured");
    }

    return {
      chainId: this.chainId as 14800 | 1480,
      rpcUrl: this.provider.transport.url || "",
      account: this.signer,
    };
  }
}
