export type RelayTaskState =
  | "received" // Relay request received
  | "submitted" // Transaction submitted to blockchain
  | "pending" // Transaction in mempool
  | "confirming" // Transaction mined, awaiting confirmations
  | "confirmed" // Transaction confirmed
  | "failed"; // Transaction failed or reverted

export interface RelayTask {
  taskId: string;
  state: RelayTaskState;
  transactionHash?: string;
  blockNumber?: bigint;
  confirmations?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RelayResponse {
  taskId: string;
  transactionHash?: string;
}
