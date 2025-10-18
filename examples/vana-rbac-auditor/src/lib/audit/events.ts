/**
 * Fetch role events from Blockscout API
 * Discovers RoleGranted and RoleRevoked events for AccessControl contracts
 */
import type { Address } from "viem";
import { vanaMainnet, mokshaTestnet } from "@opendatalabs/vana-sdk/browser";
import type {
  Network,
  RoleEvent,
  BlockscoutResponse,
  HistoryEntry,
} from "../types";
import { getContractName, getRoleName } from "../../config/contracts";
import { getAddressLabel, EVENT_TOPICS } from "../../config";

/**
 * Get best available label for an address
 * Checks manual labels first, then contract names
 */
function getBestAddressLabel(address: Address, network: Network): string | undefined {
  // Try manual label first
  const manualLabel = getAddressLabel(address);
  if (manualLabel) return manualLabel;

  // Try contract name
  const contractName = getContractName(address, network);
  if (contractName) return contractName;

  return undefined;
}

/**
 * Get Blockscout API base URL for network
 */
function getBlockscoutUrl(network: Network): string {
  const chain = network === "mainnet" ? vanaMainnet : mokshaTestnet;
  return `${chain.blockExplorers!.default.url}/api`;
}

/**
 * Fetch role events for a single contract
 */
async function fetchContractEvents(
  network: Network,
  contractAddress: Address,
  topic: string
): Promise<RoleEvent[]> {
  const baseUrl = getBlockscoutUrl(network);

  // Blockscout API params
  const params = new URLSearchParams({
    module: "logs",
    action: "getLogs",
    address: contractAddress,
    topic0: topic,
    fromBlock: "0",
    toBlock: "latest",
  });

  const url = `${baseUrl}?${params}`;

  try {
    const response = await fetch(url);

    const data: BlockscoutResponse = await response.json();

    if (data.status !== "1") {
      // Status "0" with message "No logs/records found" is normal, not an error
      if (data.message?.toLowerCase().includes("no") &&
          (data.message?.toLowerCase().includes("records") ||
           data.message?.toLowerCase().includes("logs") ||
           data.message?.toLowerCase().includes("found"))) {
        return [];
      }
      throw new Error(`Blockscout API error: ${data.message}`);
    }

    return data.result || [];
  } catch (error) {
    // Check if it's a parsing error with empty results
    if (error instanceof Error && error.message.includes("No logs")) {
      return [];
    }
    console.error(`Failed to fetch events for ${contractAddress}:`, error);
    throw error;
  }
}

/**
 * Parse role event into HistoryEntry
 */
function parseRoleEvent(
  event: RoleEvent,
  action: "granted" | "revoked",
  network: Network
): HistoryEntry {
  // Topics: [event_signature, role_hash, account, sender]
  const roleHash = event.topics[1];
  const targetAddress = `0x${event.topics[2].slice(26)}` as Address; // Remove padding
  const senderAddress = `0x${event.topics[3].slice(26)}` as Address;

  const contractName = getContractName(event.address, network);

  return {
    block: parseInt(event.blockNumber, 16),
    timestamp: parseInt(event.timeStamp, 16),
    action,
    role: getRoleName(roleHash), // Convert to human-readable name if known
    roleHash,
    targetAddress,
    targetLabel: getBestAddressLabel(targetAddress, network),
    senderAddress,
    senderLabel: getBestAddressLabel(senderAddress, network),
    txHash: event.transactionHash as Address, // Blockscout returns 'transactionHash'
    contract: contractName || "Unknown Contract",
    contractAddress: event.address,
    logIndex: parseInt(event.logIndex, 16),
  };
}

/**
 * Fetch all role events for contracts
 */
export async function fetchRoleEvents(
  network: Network,
  contractAddresses: Address[]
): Promise<HistoryEntry[]> {
  const allEvents: HistoryEntry[] = [];

  // Fetch granted and revoked events in parallel for all contracts
  const eventPromises = contractAddresses.flatMap((address) => [
    fetchContractEvents(network, address, EVENT_TOPICS.RoleGranted)
      .then((events) => events.map((e) => parseRoleEvent(e, "granted", network)))
      .catch((error) => {
        console.warn(`Skipping ${address} (granted): ${error.message}`);
        return [];
      }),
    fetchContractEvents(network, address, EVENT_TOPICS.RoleRevoked)
      .then((events) => events.map((e) => parseRoleEvent(e, "revoked", network)))
      .catch((error) => {
        console.warn(`Skipping ${address} (revoked): ${error.message}`);
        return [];
      }),
  ]);

  const results = await Promise.all(eventPromises);

  // Flatten results
  results.forEach((events) => {
    allEvents.push(...events);
  });

  // Sort by block number (newest first)
  allEvents.sort((a, b) => b.block - a.block);

  return allEvents;
}

/**
 * Extract unique (address, role, contract) tuples from events
 * These are candidates for current state verification
 */
export function extractRoleCandidates(
  events: HistoryEntry[]
): Array<{
  address: Address;
  roleHash: string;
  contractAddress: Address;
}> {
  const candidates = new Map<string, {
    address: Address;
    roleHash: string;
    contractAddress: Address;
  }>();

  for (const event of events) {
    // Only consider grants (revokes remove the role)
    if (event.action === "granted") {
      const key = `${event.targetAddress}-${event.roleHash}-${event.contractAddress}`;
      if (!candidates.has(key)) {
        candidates.set(key, {
          address: event.targetAddress,
          roleHash: event.roleHash,
          contractAddress: event.contractAddress,
        });
      }
    }
  }

  return Array.from(candidates.values());
}
