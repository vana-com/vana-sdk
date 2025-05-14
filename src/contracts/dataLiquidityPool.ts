import { ethers } from "ethers";
import { VanaProvider } from "../core/provider";
import { getContractController } from "../core/contractsController";

export interface PoolInfo {
  name: string;
  owner: string;
  rewardToken: string;
  publicKey: string;
}

export class DataLiquidityPoolClient {
  private contract: ReturnType<
    typeof getContractController<"DataLiquidityPool">
  >;

  constructor(provider: VanaProvider) {
    this.contract = getContractController("DataLiquidityPool", provider);
  }

  /**
   * Claim reward for a contributed file after proof validation
   * @param fileId ID of the file that was contributed
   * @param proofIndex Index of the proof to use (default: 1)
   * @returns Transaction receipt after 1 confirmation
   */
  async claimReward(
    fileId: bigint | number,
    proofIndex: bigint | number = 1
  ): Promise<ethers.TransactionReceipt> {
    const tx = await this.contract.requestReward(fileId, proofIndex);
    return tx.wait(1);
  }

  /**
   * Get the number of contributions from a contributor
   * @param contributor Address of the contributor
   * @returns Number of contributions
   */
  async getContributionsCount(contributor: string): Promise<bigint> {
    return this.contract.contributionsCount(contributor);
  }

  /**
   * Get pool information including name, owner, token, and public key
   * @returns Pool information
   */
  async getPoolInfo(): Promise<PoolInfo> {
    return this.contract.getPoolInfo();
  }
}
