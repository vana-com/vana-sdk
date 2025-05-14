import { ethers } from "ethers";
import { VanaProvider } from "../core/provider";
import { getContractController } from "../core/contractsController";

export class TeePoolClient {
  private contract: ReturnType<typeof getContractController<"TeePool">>;

  constructor(provider: VanaProvider) {
    this.contract = getContractController("TeePool");
  }

  /**
   * Request the network to validate a contributed file
   * @param fileId ID of the file to validate
   * @returns Transaction receipt after 1 confirmation
   */
  async requestContributionProof(
    fileId: bigint | number
  ): Promise<ethers.TransactionReceipt> {
    const tx = await this.contract.requestContributionProof(fileId);
    return tx.wait(1);
  }

  /**
   * Get all job IDs associated with a file
   * @param fileId ID of the file
   * @returns Array of job IDs
   */
  async getFileJobIds(fileId: bigint | number): Promise<bigint[]> {
    return this.contract.fileJobIds(fileId);
  }

  /**
   * Get the status of a job
   * @param jobId ID of the job
   * @returns Job status as an enum
   */
  async getJobStatus(jobId: bigint | number): Promise<number> {
    return this.contract.getJobStatus(jobId);
  }
}
