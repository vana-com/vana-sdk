#!/usr/bin/env tsx

import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { CONTRACTS } from "../src/generated/addresses";
import { mokshaTestnet, vanaMainnet } from "../src/config/chains";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

// Network configuration derived from chain configs
const NETWORK_CONFIG = {
  moksha: {
    chainId: mokshaTestnet.id,
    name: mokshaTestnet.name,
    explorerApi: `${mokshaTestnet.blockExplorers.default.url}/api/v2`,
  },
  mainnet: {
    chainId: vanaMainnet.id,
    name: vanaMainnet.name,
    explorerApi: `${vanaMainnet.blockExplorers.default.url}/api/v2`,
  },
} as const;

// Utility contracts that don't need ABIs in the SDK (standard interfaces)
const UTILITY_CONTRACTS = new Set(["Multicall3", "Multisend"]);

/**
 * Build a comprehensive map of all contracts that need ABIs fetched.
 * Reads from generated/addresses.ts which includes entry points + auto-discovered contracts.
 *
 * @param chainId - The chain ID to get addresses for
 * @returns Map of contract name to address
 */
function getAllContractsToFetch(chainId: number): Map<string, string> {
  const contractsMap = new Map<string, string>();

  // Add all contracts from generated/addresses.ts (entry points + discovered)
  for (const [name, info] of Object.entries(CONTRACTS)) {
    const address = info.addresses[chainId as keyof typeof info.addresses];
    if (address && !UTILITY_CONTRACTS.has(name)) {
      contractsMap.set(name, address);
    }
  }

  return contractsMap;
}

/**
 * Fetches contract information from the blockchain explorer API
 *
 * @param address - The contract address to fetch information for
 * @param network - The network to fetch from (moksha or mainnet)
 * @returns Promise resolving to the contract information object
 */
async function fetchContractInfo(
  address: string,
  network: "moksha" | "mainnet" = "moksha",
): Promise<unknown> {
  const networkConfig = NETWORK_CONFIG[network];
  const url = `${networkConfig.explorerApi}/smart-contracts/${address}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch contract info for ${address}:`, error);
    throw error;
  }
}

/**
 * Gets the implementation address for a proxy contract
 *
 * @param proxyAddress - The proxy contract address
 * @param network - The network to query (moksha or mainnet)
 * @returns Promise resolving to the implementation contract address
 */
async function getImplementationAddress(
  proxyAddress: string,
  network: "moksha" | "mainnet" = "moksha",
): Promise<string> {
  const contractInfo = (await fetchContractInfo(proxyAddress, network)) as {
    implementations?: Array<{ address: string }>;
  };
  if (!contractInfo.implementations?.[0]?.address) {
    throw new Error(`No implementation found for proxy ${proxyAddress}`);
  }

  // ASSUMPTION: Blockscout returns implementations in chronological order (oldest first)
  // Therefore, the LAST element ([length-1]) is the newest/current implementation.
  //
  // Evidence:
  // - All current Vana contracts (as of 2025-01) have only 1 implementation
  // - Blockscout docs say contract lists are "ascending order by time indexed"
  // - Standard array append pattern suggests newest = last
  //
  // Verification: If ABIs suddenly break after a proxy upgrade, verify the API response:
  //   curl "https://vanascan.io/api/v2/smart-contracts/<PROXY_ADDRESS>"
  //   curl "https://moksha.vanascan.io/api/v2/smart-contracts/<PROXY_ADDRESS>"
  // Check if implementations[0] or implementations[length-1] matches the current impl.
  const latestImplementation =
    contractInfo.implementations[contractInfo.implementations.length - 1]
      .address;

  // Log when multiple implementations exist (helps detect future upgrades)
  if (contractInfo.implementations.length > 1) {
    console.log(
      `   ⚠️  ${contractInfo.implementations.length} implementations found - using latest (${latestImplementation})`,
    );
  }

  return latestImplementation;
}

/**
 * Fetches the ABI for a contract from the blockchain explorer
 *
 * @param address - The contract address to fetch ABI for
 * @param network - The network to fetch from (moksha or mainnet)
 * @returns Promise resolving to the contract ABI array
 */
async function fetchABI(
  address: string,
  network: "moksha" | "mainnet" = "moksha",
): Promise<unknown[]> {
  const contractInfo = (await fetchContractInfo(address, network)) as {
    abi?: unknown[];
  };
  if (!contractInfo.abi) {
    throw new Error(`No ABI found for contract ${address}`);
  }
  return contractInfo.abi;
}

/**
 * Generates a TypeScript file containing the ABI export
 *
 * @param contractName - The name of the contract for the export
 * @param abi - The ABI array to export
 * @param metadata - Generation metadata (network, addresses, timestamp)
 * @returns The generated TypeScript file content as a string
 */
function generateABIFile(
  contractName: string,
  abi: unknown[],
  metadata: {
    network: string;
    chainId: number;
    proxyAddress: string;
    implementationAddress: string;
    timestamp: string;
  },
): string {
  // Format ABI as JavaScript object literal instead of JSON string
  // This ensures compatibility with Prettier's formatting rules
  const formatValue = (value: unknown, indent = 0): string => {
    const spaces = "  ".repeat(indent);
    const nextSpaces = "  ".repeat(indent + 1);

    if (Array.isArray(value)) {
      if (value.length === 0) return "[]";
      const items = value.map((item) => formatValue(item, indent + 1));
      return `[\n${nextSpaces}${items.join(`,\n${nextSpaces}`)},\n${spaces}]`;
    }

    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return "{}";
      const props = entries.map(
        ([key, val]) => `${key}: ${formatValue(val, indent + 1)}`,
      );
      return `{\n${nextSpaces}${props.join(`,\n${nextSpaces}`)},\n${spaces}}`;
    }

    if (typeof value === "string") {
      return `"${value}"`;
    }

    return String(value);
  };

  const formattedABI = formatValue(abi);

  // Build header with generation metadata
  const isProxy = metadata.proxyAddress !== metadata.implementationAddress;
  const explorerBase =
    metadata.chainId === 1480
      ? "https://vanascan.io"
      : "https://moksha.vanascan.io";

  const addressInfo = isProxy
    ? `//
//   Proxy Address:
//     ${metadata.proxyAddress}
//     ${explorerBase}/address/${metadata.proxyAddress}
//
//   Implementation Address:
//     ${metadata.implementationAddress}
//     ${explorerBase}/address/${metadata.implementationAddress}`
    : `//
//   Contract Address:
//     ${metadata.proxyAddress}
//     ${explorerBase}/address/${metadata.proxyAddress}`;

  return `// THIS FILE IS GENERATED, DO NOT EDIT MANUALLY
// Run \`npm run fetch-abis\` to regenerate
//
// ${contractName} Implementation Contract
//
// Generated: ${metadata.timestamp}
// Network: ${metadata.network} (Chain ID: ${metadata.chainId})
${addressInfo}

export const ${contractName}ABI = ${formattedABI} as const;

export default ${contractName}ABI;
`;
}

/**
 * Ensures a directory exists, creating it if necessary
 *
 * @param dirPath - The path to the directory to ensure exists
 * @returns Promise that resolves when directory exists
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await access(dirPath);
  } catch {
    await mkdir(dirPath, { recursive: true });
  }
}

/**
 * Recursively sorts object keys for deterministic JSON serialization
 */
function sortKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((result: any, key: string) => {
        result[key] = sortKeys(obj[key]);
        return result;
      }, {});
  }
  return obj;
}

/**
 * Checks if the ABI content has actually changed (ignoring metadata like timestamps)
 */
async function hasAbiChanged(
  filePath: string,
  newAbi: unknown,
  metadata: {
    implementationAddress: string;
  },
): Promise<boolean> {
  try {
    // Check if file exists
    await access(filePath);

    // Check if implementation address changed (proxy upgrade)
    const existingContent = await readFile(filePath, "utf-8");
    const implMatch = existingContent.match(
      /Implementation Address:\s+\n\s+\/\/\s+(0x[a-fA-F0-9]{40})/,
    );
    if (implMatch && implMatch[1] !== metadata.implementationAddress) {
      return true;
    }

    // Import the existing ABI file and extract the ABI constant
    // Use file:// URL with timestamp to bypass Node's import cache
    const fileUrl = `file://${path.resolve(filePath)}?t=${Date.now()}`;
    const module = await import(fileUrl);

    // Find the exported ABI (should be an array)
    const existingABI = Object.values(module).find((exp) => Array.isArray(exp));

    if (!existingABI) {
      return true; // Can't find ABI export
    }

    // Compare with deterministic stringification
    const existingNormalized = JSON.stringify(sortKeys(existingABI));
    const newNormalized = JSON.stringify(sortKeys(newAbi));

    return existingNormalized !== newNormalized;
  } catch {
    return true; // File doesn't exist or import failed
  }
}

/**
 * Updates the index.ts file with exports for the generated ABI files
 *
 * @param contractNames - Array of contract names to add exports for
 * @returns Promise that resolves when index file is updated
 */
async function updateIndexFile(contractNames: string[]): Promise<void> {
  const abiDir = path.join(process.cwd(), "src", "generated", "abi");
  const indexPath = path.join(abiDir, "index.ts");

  // Read existing index file to preserve other exports
  let existingContent = "";
  try {
    existingContent = await readFile(indexPath, "utf-8");
  } catch {
    // File doesn't exist, start fresh
  }

  // Check if DLP Reward Contracts exports already exist
  if (
    existingContent.includes("// DLP Reward Contracts") &&
    existingContent.includes("VanaEpochABI") &&
    existingContent.includes("DLPRegistryABI")
  ) {
    console.log("✅ DLP Reward Contract exports already exist in index.ts");
    return;
  }

  // Generate new exports for our contracts
  const newExports = contractNames
    .map((name) => `export { ${name}ABI } from './${name}Implementation';`)
    .join("\n");

  // Append our exports
  const updatedContent = `${existingContent}\n\n// DLP Reward Contracts\n${newExports}\n`;

  await writeFile(indexPath, updatedContent);
  console.log(`✅ Updated ${indexPath}`);
}

/**
 * Main function to fetch and save all contract ABIs for a network
 *
 * @param network - The network to fetch ABIs for (moksha or mainnet)
 * @returns Promise that resolves when all ABIs are fetched and saved
 */
async function fetchAndSaveABIs(
  network: "moksha" | "mainnet" = "moksha",
): Promise<void> {
  const networkConfig = NETWORK_CONFIG[network];
  const abiDir = path.join(process.cwd(), "src", "generated", "abi");

  await ensureDirectoryExists(abiDir);

  // Get all contracts to fetch (entry points + discoverable)
  const allContracts = getAllContractsToFetch(networkConfig.chainId);

  console.log(`🔄 Fetching ${networkConfig.name} contract ABIs...`);
  console.log(`📋 Total contracts to fetch: ${allContracts.size}`);

  const processedContracts = new Set<string>();
  const contractNames: string[] = [];

  for (const [contractName, contractAddress] of allContracts.entries()) {
    try {
      // Skip if already processed (for shared implementations)
      const abiFileName = `${contractName}Implementation`;
      if (processedContracts.has(abiFileName)) {
        console.log(`⏭️  Skipping ${contractName} (shares implementation)`);
        continue;
      }

      console.log(`📥 Fetching ${contractName}...`);

      // Try to get implementation address for proxy contracts
      let implAddress: string = contractAddress;
      try {
        implAddress = await getImplementationAddress(contractAddress, network);
        console.log(`   Implementation: ${implAddress}`);
      } catch {
        // Not a proxy or no implementation found, use original address
        console.log(`   Using direct address: ${contractAddress}`);
      }

      // Fetch ABI
      const abi = await fetchABI(implAddress, network);
      const filePath = path.join(abiDir, `${abiFileName}.ts`);

      // Check if ABI has changed before formatting (avoid expensive formatting if unchanged)
      const abiChanged = await hasAbiChanged(filePath, abi, {
        implementationAddress: implAddress,
      });

      if (!abiChanged) {
        console.log(`⏭️  Skipped ${abiFileName}.ts (ABI unchanged)`);
        processedContracts.add(abiFileName);
        contractNames.push(contractName);
        continue;
      }

      // Generate TypeScript file with metadata (only if changed)
      const tsContent = generateABIFile(contractName, abi, {
        network: networkConfig.name,
        chainId: networkConfig.chainId,
        proxyAddress: contractAddress,
        implementationAddress: implAddress,
        timestamp: new Date().toISOString(),
      });

      await writeFile(filePath, tsContent);
      console.log(`✅ Saved ${abiFileName}.ts (ABI changed)`);

      processedContracts.add(abiFileName);
      contractNames.push(contractName);
    } catch (error) {
      console.error(`❌ Failed to process ${contractName}:`, error);
    }
  }

  // Update index file
  await updateIndexFile(contractNames);

  console.log(`🎉 Completed fetching ${networkConfig.name} ABIs!`);
}

// CLI interface
/**
 * Main entry point for the ABI fetching script
 *
 * @returns Promise that resolves when script execution completes
 */
async function main(): Promise<void> {
  const network = (process.argv[2] as "moksha" | "mainnet") || "mainnet";

  if (!["moksha", "mainnet"].includes(network)) {
    console.error("Usage: npm run fetch-abis [moksha|mainnet]");
    console.error("Defaults to mainnet if not specified");
    process.exit(1);
  }

  try {
    await fetchAndSaveABIs(network);
  } catch (error) {
    console.error("❌ Script failed:", error);
    process.exit(1);
  }
}

// Run the script
void main();
