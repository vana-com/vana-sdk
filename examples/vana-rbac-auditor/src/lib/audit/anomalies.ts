/**
 * Anomaly detection for RBAC audit
 * Identifies suspicious or unexpected role assignments
 */
import type { CurrentStateEntry, Anomaly, Network } from "../types";
import {
  isKnownAddress,
  isDeactivatedAddress,
  isDeprecatedAddress,
  getAnomalyDetectionConfig,
} from "../../config";
import { KNOWN_ROLES, isKnownContract } from "../../config/contracts";

/**
 * Check if role is a known role
 */
function isKnownRole(roleHash: string): boolean {
  return roleHash in KNOWN_ROLES;
}

/**
 * Check if role is an admin role (high privilege)
 */
function isAdminRole(roleName: string): boolean {
  const { adminKeywords } = getAnomalyDetectionConfig();
  return adminKeywords.some((keyword: string) =>
    roleName.toUpperCase().includes(keyword)
  );
}

/**
 * Detect anomalies in current state
 * Marks entries as anomalies and returns separate anomaly list
 */
export function detectAnomalies(
  currentState: CurrentStateEntry[],
  network: Network
): {
  markedState: CurrentStateEntry[];
  anomalies: Anomaly[];
} {
  const anomalies: Anomaly[] = [];
  const markedState = currentState.map((entry) => ({ ...entry }));

  // Track admin role counts per contract
  const adminCounts = new Map<string, number>();

  markedState.forEach((entry, index) => {
    let hasAnomaly = false;
    const anomalyDescriptions: string[] = [];

    // Check for deactivated/deprecated first (mutually exclusive with unknown)
    const isDeactivated = isDeactivatedAddress(entry.address);
    const isDeprecated = isDeprecatedAddress(entry.address);
    const isContract = isKnownContract(entry.address, network);

    // Anomaly 1: Deactivated user with permissions (CRITICAL)
    if (isDeactivated) {
      hasAnomaly = true;
      const description = `Deactivated user ${entry.label || entry.address} still has ${entry.role} on ${entry.contract}`;
      anomalyDescriptions.push(description);
      anomalies.push({
        type: "unknown_address", // Reusing type for now
        address: entry.address,
        label: entry.label,
        role: entry.role,
        roleHash: entry.roleHash,
        contract: entry.contract,
        contractAddress: entry.contractAddress,
        severity: "high",
        description,
      });
    }
    // Anomaly 2: Deprecated address with permissions
    else if (isDeprecated) {
      hasAnomaly = true;
      const description = `Deprecated address ${entry.label || entry.address} still has ${entry.role} on ${entry.contract}`;
      anomalyDescriptions.push(description);
      anomalies.push({
        type: "unknown_address", // Reusing type for now
        address: entry.address,
        label: entry.label,
        role: entry.role,
        roleHash: entry.roleHash,
        contract: entry.contract,
        contractAddress: entry.contractAddress,
        severity: "high",
        description,
      });
    }
    // Anomaly 3: Unknown address with role (only if NOT deactivated, deprecated, or a known contract)
    else if (!isKnownAddress(entry.address) && !isContract) {
      hasAnomaly = true;
      const description = `Unknown address has ${entry.role} on ${entry.contract}`;
      anomalyDescriptions.push(description);
      anomalies.push({
        type: "unknown_address",
        address: entry.address,
        label: entry.label,
        role: entry.role,
        roleHash: entry.roleHash,
        contract: entry.contract,
        contractAddress: entry.contractAddress,
        severity: isAdminRole(entry.role) ? "high" : "medium",
        description,
      });
    }

    // Anomaly 4: Unknown role hash
    if (!isKnownRole(entry.roleHash)) {
      hasAnomaly = true;
      const description = `Unknown role hash ${entry.roleHash.slice(0, 10)}... assigned to ${entry.label || entry.address}`;
      anomalyDescriptions.push(description);
      anomalies.push({
        type: "unknown_role",
        address: entry.address,
        label: entry.label,
        role: entry.roleHash, // Show hash since it's unknown
        roleHash: entry.roleHash,
        contract: entry.contract,
        contractAddress: entry.contractAddress,
        severity: "medium",
        description,
      });
    }

    // Track admin roles for excessive admin detection
    if (isAdminRole(entry.role)) {
      const key = entry.contractAddress;
      adminCounts.set(key, (adminCounts.get(key) || 0) + 1);
    }

    // Mark entry if it's an anomaly and attach descriptions
    if (hasAnomaly) {
      markedState[index].isAnomaly = true;
      markedState[index].anomalyDescription = anomalyDescriptions.join("; ");
    }
  });

  // Anomaly 5: Excessive admins (threshold from config)
  const { adminThreshold } = getAnomalyDetectionConfig();
  adminCounts.forEach((count, contractAddress) => {
    if (count > adminThreshold) {
      const contractEntry = markedState.find(
        (e) => e.contractAddress === contractAddress
      );
      if (contractEntry) {
        anomalies.push({
          type: "excessive_admins",
          address: contractEntry.contractAddress,
          role: "Multiple Admin Roles",
          roleHash: "0x0000000000000000000000000000000000000000000000000000000000000000", // Placeholder for excessive admins
          contract: contractEntry.contract,
          contractAddress: contractEntry.contractAddress,
          severity: "low",
          description: `${count} addresses have admin roles on ${contractEntry.contract} (threshold: ${adminThreshold})`,
        });
      }
    }
  });

  return { markedState, anomalies };
}
