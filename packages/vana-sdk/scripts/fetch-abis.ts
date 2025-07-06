#!/usr/bin/env tsx

import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { CONTRACTS } from "../src/config/addresses";
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
const UTILITY_CONTRACTS = new Set([
  "Multicall3",
  "Multisend",
  "VanaTreasury", // Safe/multisig wallet address
]);

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
  return contractInfo.implementations[0].address;
}

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

function generateABIFile(contractName: string, abi: unknown[]): string {
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

  return `// ${contractName} Implementation Contract
// Generated automatically - do not edit manually

export const ${contractName}ABI = ${formattedABI} as const;

export default ${contractName}ABI;
`;
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await access(dirPath);
  } catch {
    await mkdir(dirPath, { recursive: true });
  }
}

async function updateIndexFile(contractNames: string[]): Promise<void> {
  const abiDir = path.join(process.cwd(), "src", "abi");
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
  const updatedContent =
    existingContent + "\n\n// DLP Reward Contracts\n" + newExports + "\n";

  await writeFile(indexPath, updatedContent);
  console.log(`✅ Updated ${indexPath}`);
}

async function fetchAndSaveABIs(
  network: "moksha" | "mainnet" = "moksha",
): Promise<void> {
  const networkConfig = NETWORK_CONFIG[network];
  const abiDir = path.join(process.cwd(), "src", "abi");

  await ensureDirectoryExists(abiDir);

  console.log(`🔄 Fetching ${networkConfig.name} contract ABIs...`);

  const processedContracts = new Set<string>();
  const contractNames: string[] = [];

  for (const contractName of Object.keys(
    CONTRACTS,
  ) as (keyof typeof CONTRACTS)[]) {
    if (UTILITY_CONTRACTS.has(contractName)) {
      console.log(`⏭️  Skipping ${contractName} (utility contract)`);
      continue;
    }

    try {
      const contractInfo = CONTRACTS[contractName];
      if (!contractInfo) {
        console.log(`⏭️  Skipping ${contractName} (not found in CONTRACTS)`);
        continue;
      }

      const contractAddress = contractInfo.addresses[networkConfig.chainId];
      if (!contractAddress) {
        console.log(`⏭️  Skipping ${contractName} (no address for ${network})`);
        continue;
      }

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

      // Generate TypeScript file
      const tsContent = generateABIFile(contractName, abi);
      const filePath = path.join(abiDir, `${abiFileName}.ts`);

      await writeFile(filePath, tsContent);
      console.log(`✅ Saved ${abiFileName}.ts`);

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
async function main(): Promise<void> {
  const network = (process.argv[2] as "moksha" | "mainnet") || "moksha";

  if (!["moksha", "mainnet"].includes(network)) {
    console.error("Usage: npm run fetch-abis [moksha|mainnet]");
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
main();
