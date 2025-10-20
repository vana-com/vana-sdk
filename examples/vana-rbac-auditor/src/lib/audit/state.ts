/**
 * Verify current role state using multicall
 * Efficiently batch hasRole() checks across all contracts
 */
import { createPublicClient, http, type Address } from "viem";
import {
  mokshaTestnet,
  vanaMainnet,
  getContractInfo,
} from "@opendatalabs/vana-sdk/browser";
import type { Network, CurrentStateEntry } from "../types";
import { getContractName, getRoleName } from "../../config/contracts";
import { getAddressLabel } from "../../config/addresses";

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
 * Multicall3 address for Vana networks (same on both mainnet and moksha)
 * Source: @opendatalabs/vana-sdk/src/config/addresses.ts - UTILITY_ADDRESSES
 * Vana uses a non-standard deployment address for Multicall3
 */
const MULTICALL3_ADDRESS = "0xD8d2dFca27E8797fd779F8547166A2d3B29d360E" as const;

/**
 * Special role hash for Ownable pattern owner() function
 * This is not a real role hash, but a marker for owner entries
 */
const OWNER_ROLE_HASH = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const;

/**
 * Get viem chain for network
 */
function getChain(network: Network) {
  return network === "mainnet" ? vanaMainnet : mokshaTestnet;
}

/**
 * Verify current role assignments using multicall
 * Returns only active role assignments (hasRole returns true)
 */
export async function verifyCurrentState(
  network: Network,
  candidates: Array<{
    address: Address;
    roleHash: string;
    contractAddress: Address;
  }>
): Promise<CurrentStateEntry[]> {
  if (candidates.length === 0) {
    return [];
  }

  const chain = getChain(network);
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });

  // Get AccessControl ABI from SDK (use any contract with AccessControl)
  const { abi: accessControlAbi } = getContractInfo(
    "DataRegistry",
    chain.id as 1480 | 14800
  );

  // Build multicall contracts array
  const calls = candidates.map(({ contractAddress, roleHash, address }) => ({
    address: contractAddress,
    abi: accessControlAbi,
    functionName: "hasRole" as const,
    args: [roleHash as `0x${string}`, address],
  }));

  try {
    // Execute multicall with Vana's custom Multicall3 address
    const results = await publicClient.multicall({
      contracts: calls,
      allowFailure: true,
      multicallAddress: MULTICALL3_ADDRESS,
    });

    // Filter to only active roles and build CurrentStateEntry
    const currentState: CurrentStateEntry[] = [];

    results.forEach((result, index) => {
      const candidate = candidates[index];

      // Check if call succeeded and returned true
      if (result.status === "success" && result.result === true) {
        const contractName = getContractName(
          candidate.contractAddress,
          network
        );

        currentState.push({
          address: candidate.address,
          label: getBestAddressLabel(candidate.address, network),
          role: getRoleName(candidate.roleHash),
          roleHash: candidate.roleHash,
          contract: contractName || "Unknown Contract",
          contractAddress: candidate.contractAddress,
          isAnomaly: false, // Will be marked by anomaly detection
        });
      }
    });

    // Check owner() for Ownable pattern contracts
    // Get unique contract addresses
    const uniqueContracts = Array.from(
      new Set(candidates.map((c) => c.contractAddress))
    );

    // Build owner() multicall
    const ownerAbi = [
      {
        type: "function" as const,
        name: "owner",
        stateMutability: "view" as const,
        inputs: [],
        outputs: [{ type: "address" as const }],
      },
    ];

    const ownerCalls = uniqueContracts.map((contractAddress) => ({
      address: contractAddress,
      abi: ownerAbi,
      functionName: "owner" as const,
    }));

    try {
      const ownerResults = await publicClient.multicall({
        contracts: ownerCalls,
        allowFailure: true,
        multicallAddress: MULTICALL3_ADDRESS,
      });

      // Type the results explicitly to avoid TypeScript inference issues
      type OwnerResult =
        | { status: "success"; result: Address }
        | { status: "failure"; error: Error };

      (ownerResults as OwnerResult[]).forEach((result, index) => {
        const contractAddress = uniqueContracts[index];

        // Check if call succeeded and returned an address
        if (result.status === "success") {
          const ownerAddress = result.result;
          const contractName = getContractName(contractAddress, network);

          currentState.push({
            address: ownerAddress,
            label: getBestAddressLabel(ownerAddress, network),
            role: "OWNER", // Special display name for Ownable pattern
            roleHash: OWNER_ROLE_HASH,
            contract: contractName || "Unknown Contract",
            contractAddress: contractAddress,
            isAnomaly: false,
          });
        }
      });
    } catch (error) {
      // Owner checks are optional - don't fail if they error
      console.warn("Owner() checks failed (this is normal for non-Ownable contracts):", error);
    }

    return currentState;
  } catch (error) {
    console.error("Multicall failed:", error);
    throw new Error("Failed to verify current state");
  }
}
