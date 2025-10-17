/**
 * Main audit orchestrator
 * Coordinates event fetching, state verification, and anomaly detection
 */
import type { Network, AuditResults, AuditStats } from "../types";
import { getAuditableContracts } from "../../config/contracts";
import { fetchRoleEvents, extractRoleCandidates } from "./events";
import { verifyCurrentState } from "./state";
import { detectAnomalies } from "./anomalies";

/**
 * Run complete RBAC audit for network and contracts
 *
 * @param network - Network to audit (mainnet or moksha)
 * @param contractFilter - Optional array of contract names to audit (defaults to all)
 * @returns Complete audit results including current state, history, and anomalies
 */
export async function runAudit(
  network: Network,
  contractFilter?: string[]
): Promise<AuditResults> {
  // Step 1: Get contracts to audit
  let contracts = getAuditableContracts(network);

  if (contractFilter && contractFilter.length > 0) {
    // Filter to specific contracts if requested
    if (!contractFilter.includes("all")) {
      contracts = contracts.filter((c) => contractFilter.includes(c.name));
    }
  }

  if (contracts.length === 0) {
    throw new Error("No contracts to audit");
  }

  const contractAddresses = contracts.map((c) => c.address);

  // Step 2: Fetch historical role events from Blockscout
  const history = await fetchRoleEvents(network, contractAddresses);

  // Step 3: Extract unique role candidates for verification
  const candidates = extractRoleCandidates(history);

  // Step 4: Verify current state using multicall
  const unverifiedState = await verifyCurrentState(network, candidates);

  // Step 5: Detect anomalies
  const { markedState: currentState, anomalies } =
    detectAnomalies(unverifiedState, network);

  // Step 6: Calculate statistics
  const stats = calculateStats(currentState, history, anomalies);

  return {
    network,
    contracts: contracts.map((c) => c.name),
    currentState,
    history,
    anomalies,
    stats,
    timestamp: Date.now(),
  };
}

/**
 * Calculate audit statistics
 */
function calculateStats(
  currentState: AuditResults["currentState"],
  history: AuditResults["history"],
  anomalies: AuditResults["anomalies"]
): AuditStats {
  // Count unique addresses
  const uniqueAddresses = new Set(currentState.map((e) => e.address));

  // Count unique roles
  const uniqueRoles = new Set(currentState.map((e) => e.roleHash));

  return {
    activePermissions: currentState.length,
    historicalEvents: history.length,
    uniqueRoles: uniqueRoles.size,
    uniqueAddresses: uniqueAddresses.size,
    anomaliesCount: anomalies.length,
  };
}

// Re-export for convenience
export { fetchRoleEvents } from "./events";
export { verifyCurrentState } from "./state";
export { detectAnomalies } from "./anomalies";
