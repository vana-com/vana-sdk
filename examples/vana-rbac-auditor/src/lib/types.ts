import type { Address } from "viem";

/**
 * Network type - Vana Mainnet or Moksha Testnet
 */
export type Network = "mainnet" | "moksha";

/**
 * Current state of a role assignment
 */
export interface CurrentStateEntry {
  address: Address;
  label?: string;
  role: string;
  roleHash: string;
  contract: string;
  contractAddress: Address;
  isAnomaly: boolean;
  anomalyDescription?: string; // Description shown when hovering over anomaly badge
}

/**
 * Historical role event (grant or revoke)
 */
export interface HistoryEntry {
  block: number;
  timestamp: number;
  action: "granted" | "revoked";
  role: string;
  roleHash: string;
  targetAddress: Address;
  targetLabel?: string;
  senderAddress: Address;
  senderLabel?: string;
  txHash: Address;
  contract: string;
  contractAddress: Address;
  logIndex: number; // Unique index within the block (for generating unique keys)
}

/**
 * Anomaly detection result
 */
export interface Anomaly {
  type: "unknown_address" | "unknown_role" | "excessive_admins";
  address: Address;
  label?: string;
  role: string;
  roleHash: string;
  contract: string;
  contractAddress: Address;
  severity: "high" | "medium" | "low";
  description: string;
}

/**
 * Audit statistics
 */
export interface AuditStats {
  activePermissions: number;
  historicalEvents: number;
  uniqueRoles: number;
  uniqueAddresses: number;
  anomaliesCount: number;
}

/**
 * Contract configuration
 */
export interface ContractConfig {
  name: string;
  address: Address;
  hasAccessControl: boolean;
}

/**
 * Known address mapping
 */
export interface KnownAddress {
  address: Address;
  label: string;
  description?: string;
  isDeactivated?: boolean; // User should NOT have any permissions
  isDeprecated?: boolean; // Address should no longer be used
}

/**
 * Audit results
 */
export interface AuditResults {
  network: Network;
  contracts: string[];
  currentState: CurrentStateEntry[];
  history: HistoryEntry[];
  anomalies: Anomaly[];
  stats: AuditStats;
  timestamp: number;
}

/**
 * Role event from Blockscout API
 * Note: Blockscout getLogs API returns 'transactionHash', not 'hash'
 */
export interface RoleEvent {
  blockNumber: string;
  timeStamp: string;
  transactionHash: string;
  topics: string[];
  data: string;
  address: Address;
  logIndex: string;
}

/**
 * Blockscout API response
 */
export interface BlockscoutResponse {
  status: string;
  message: string;
  result: RoleEvent[];
}
