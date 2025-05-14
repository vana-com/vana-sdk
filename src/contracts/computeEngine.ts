import { ethers } from "ethers";
import { getContractController } from "../core/contractsController";
import { VanaProvider } from "../core/provider";

export interface QueryResult {
  requestId: bigint;
  resultUrl: string;
  status: number;
}

export class ComputeEngineClient {
  private contract: ReturnType<typeof getContractController<"ComputeEngine">>;

  constructor(provider: VanaProvider) {
    this.contract = getContractController("ComputeEngine", provider);
  }

  /**
   * Submit a query request to the compute engine
   * @param queryData The query data to execute
   * @param paymentAmount Amount to pay for the query (in wei)
   * @returns Transaction receipt after 1 confirmation
   */
  async submitQuery(
    queryData: string,
    paymentAmount: bigint | string
  ): Promise<ethers.TransactionReceipt> {
    const tx = await this.contract.submitQuery(queryData, {
      value: paymentAmount,
    });
    return tx.wait(1);
  }

  /**
   * Get the result of a query
   * @param requestId ID of the query request
   * @returns Query result information
   */
  async getQueryResult(requestId: bigint | number): Promise<QueryResult> {
    return this.contract.getQueryResult(requestId);
  }

  /**
   * Check if a query has been completed
   * @param requestId ID of the query request
   * @returns Whether the query is complete
   */
  async isQueryComplete(requestId: bigint | number): Promise<boolean> {
    const result = await this.getQueryResult(requestId);
    return result.status === 2; // Assuming 2 is the "Completed" status
  }
}
