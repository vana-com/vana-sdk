/**
 * Contract configuration for RBAC Auditor
 * Leverages the Vana SDK for contract addresses and ABIs
 */
import {
  getContractInfo,
  type VanaContract,
  vanaMainnet,
  mokshaTestnet,
} from "@opendatalabs/vana-sdk/browser";
import type { Address, Abi } from "viem";
import { keccak256, toHex } from "viem";
import type { ContractConfig, Network } from "../lib/types";
import { SPECIAL_ROLE_HASHES, getLegacyRoles } from "./index";

/**
 * Convert network name to chain ID
 */
function networkToChainId(network: Network): 1480 | 14800 {
  return (network === "mainnet" ? vanaMainnet.id : mokshaTestnet.id) as 1480 | 14800;
}

/**
 * Check if a contract ABI includes AccessControl functions
 * OpenZeppelin AccessControl contracts have these functions:
 * - hasRole(bytes32,address)
 * - getRoleAdmin(bytes32)
 * - grantRole(bytes32,address)
 * - revokeRole(bytes32,address)
 */
function hasAccessControl(abi: Abi): boolean {
  const requiredFunctions = ["hasRole", "getRoleAdmin", "grantRole", "revokeRole"];
  return requiredFunctions.every((fn) =>
    abi.some((item) => item.type === "function" && item.name === fn)
  );
}

/**
 * Dynamically get all contracts that implement AccessControl
 * This uses the SDK's contract registry and checks ABIs
 */
function getAccessControlContracts(): VanaContract[] {
  // All contract names from SDK - discover which have AccessControl
  const candidateContracts: VanaContract[] = [
    "DataRegistry",
    "DataPortabilityPermissions",
    "DataPortabilityServers",
    "DataPortabilityGrantees",
    "TeePoolPhala",
    "TeePoolEphemeralStandard",
    "TeePoolPersistentStandard",
    "TeePoolPersistentGpu",
    "TeePoolDedicatedStandard",
    "TeePoolDedicatedGpu",
    "ComputeEngine",
    "QueryEngine",
    "DataRefinerRegistry",
    "ComputeInstructionRegistry",
    "DLPRegistry",
    "DLPPerformance",
    "DLPRewardDeployer",
    "DLPRewardSwap",
    "VanaPoolStaking",
    "VanaPoolEntity",
    "VanaEpoch",
    "DAT",
    "DATFactory",
    "DATPausable",
    "DATVotes",
  ];

  // Filter to only contracts that actually have AccessControl
  return candidateContracts.filter((contractName) => {
    try {
      const { abi } = getContractInfo(contractName);
      return hasAccessControl(abi);
    } catch {
      return false;
    }
  });
}

/**
 * Cache of AccessControl contracts (computed once)
 */
let cachedAccessControlContracts: VanaContract[] | null = null;

/**
 * Get all auditable contracts for a network
 */
export function getAuditableContracts(network: Network): ContractConfig[] {
  if (!cachedAccessControlContracts) {
    cachedAccessControlContracts = getAccessControlContracts();
  }

  const chainId = networkToChainId(network);

  return cachedAccessControlContracts.map((name) => {
    const { address } = getContractInfo(name, chainId);
    return {
      name,
      address,
      hasAccessControl: true,
    };
  });
}

/**
 * Get contract config by name
 */
export function getContractConfig(
  name: string,
  network: Network
): ContractConfig | undefined {
  const contracts = getAuditableContracts(network);
  return contracts.find((c) => c.name === name);
}

/**
 * Get contract name by address (reverse lookup)
 */
export function getContractName(
  address: Address,
  network: Network
): string | undefined {
  const contracts = getAuditableContracts(network);
  const match = contracts.find(
    (c) => c.address.toLowerCase() === address.toLowerCase()
  );
  return match?.name;
}

/**
 * Check if address is a known protocol contract
 */
export function isKnownContract(
  address: Address,
  network: Network
): boolean {
  return getContractName(address, network) !== undefined;
}

/**
 * Contract display names for UI
 * Generates prettier names from code names
 */
function generateDisplayName(contractName: string): string {
  // Split on capital letters and join with spaces
  const words = contractName.replace(/([A-Z])/g, " $1").trim();
  return words;
}

/**
 * Get display name for contract
 */
export function getContractDisplayName(contractName: string): string {
  return generateDisplayName(contractName);
}

/**
 * Discover all role constants from contract ABIs
 * Scans ABIs for public constant functions matching *_ROLE pattern
 * and computes their keccak256 hashes
 */
function discoverRolesFromABIs(): Record<string, string> {
  // Start with special role hashes
  const roles: Record<string, string> = {
    [SPECIAL_ROLE_HASHES.DEFAULT_ADMIN_ROLE]: "DEFAULT_ADMIN_ROLE",
    [SPECIAL_ROLE_HASHES.OWNER]: "OWNER",
    ...getLegacyRoles(),
  };

  // Use cached AccessControl contracts (already filtered)
  if (!cachedAccessControlContracts) {
    cachedAccessControlContracts = getAccessControlContracts();
  }
  const candidateContracts = cachedAccessControlContracts;

  // Scan each contract's ABI for role constants
  for (const contractName of candidateContracts) {
    try {
      const { abi } = getContractInfo(contractName);

      // Find all *_ROLE constant functions
      for (const item of abi) {
        if (
          item.type === "function" &&
          item.name?.endsWith("_ROLE") &&
          item.stateMutability === "view" &&
          item.inputs?.length === 0 // Constants have no inputs
        ) {
          const roleName = item.name;

          // Compute keccak256 hash of role name
          // This matches how Solidity computes: keccak256("ROLE_NAME")
          const roleHash = keccak256(toHex(roleName));

          // Store role mapping (avoid duplicates)
          if (!roles[roleHash]) {
            roles[roleHash] = roleName;
          }
        }
      }
    } catch (error) {
      // Skip contracts that fail to load
      console.warn(`Failed to load ABI for ${contractName}:`, error);
    }
  }

  // Log discovered roles for debugging
  const roleCount = Object.keys(roles).length;
  console.log(`🔍 Discovered ${roleCount} roles from contract ABIs:`);
  Object.entries(roles).forEach(([hash, name]) => {
    console.log(`  ${name}: ${hash.slice(0, 10)}...`);
  });

  return roles;
}

/**
 * Known role names (discovered from contract ABIs)
 * This is computed once at module load time
 */
export const KNOWN_ROLES: Record<string, string> = discoverRolesFromABIs();

/**
 * Get role name from hash
 */
export function getRoleName(roleHash: string): string {
  return KNOWN_ROLES[roleHash] || roleHash;
}
