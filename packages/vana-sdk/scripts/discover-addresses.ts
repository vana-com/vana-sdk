#!/usr/bin/env tsx
/**
 * Auto-discovery script for Vana protocol contract addresses.
 *
 * This script:
 * 1. Reads contract configuration from src/config/contracts.config.ts
 * 2. Separates entry points from discoverable contracts
 * 3. Calls on-chain getters to discover and validate child contract addresses
 * 4. Generates src/generated/addresses.ts with complete registry
 *
 * Run with: npx tsx scripts/discover-addresses.ts
 */

import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { createPublicClient, http } from "viem";
import { CONTRACTS, LEGACY_CONTRACTS } from "../src/config/contracts.config";
import { chains } from "../src/config/chains";
import { getAbi } from "../src/generated/abi";
import type { VanaContract } from "../src/generated/abi";

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

/**
 * Get RPC URL for a chain using canonical chain configuration.
 * This ensures we use the single source of truth from src/config/chains.ts.
 */
function getRpcUrl(chainId: number): string {
  const chain = chains[chainId];
  if (!chain) {
    throw new Error(`Unknown chain ID: ${chainId}`);
  }
  return chain.rpcUrls.default.http[0];
}

interface DiscoveredContract {
  name: string;
  addresses: {
    14800: string;
    1480: string;
  };
  _meta: {
    discoveredFrom: string;
    lastUpdated: string;
  };
}

type ContractWithDiscovery = {
  addresses: { 14800: string; 1480: string };
  discovery: {
    parent: string;
    getter: string;
  };
};

/**
 * Separate contracts into entry points and discoverable
 */
function separateContracts() {
  const entryPoints = new Map<string, (typeof CONTRACTS)[string]>();
  const discoverableContracts = new Map<string, ContractWithDiscovery>();

  for (const [name, config] of Object.entries(CONTRACTS)) {
    if (config.discovery !== undefined) {
      // Type guard: if discovery exists, it has the full structure
      discoverableContracts.set(name, config as ContractWithDiscovery);
    } else {
      entryPoints.set(name, config);
    }
  }

  return { entryPoints, discoverableContracts };
}

/**
 * Discover a single contract address from its parent on a specific chain
 */
async function discoverContractOnChain(
  contractName: string,
  parentName: string,
  getter: string,
  chainId: 14800 | 1480,
  parentAddress: string,
): Promise<string> {
  const rpcUrl = getRpcUrl(chainId);
  const client = createPublicClient({ transport: http(rpcUrl) });

  const parentAbi = getAbi(parentName as VanaContract);

  const address = (await client.readContract({
    address: parentAddress as `0x${string}`,
    abi: parentAbi,
    functionName: getter,
  })) as string;

  return address;
}

/**
 * Discover all contracts across both chains with validation
 */
async function discoverAllContracts(): Promise<
  Map<string, DiscoveredContract>
> {
  const { entryPoints, discoverableContracts } = separateContracts();
  const discovered = new Map<string, DiscoveredContract>();
  const processed = new Set<string>();

  console.log(
    "🔍 Discovering child contracts (with transitive discovery)...\n",
  );

  // Queue of contracts to process (parent name -> parent addresses)
  const toDiscover = new Map<
    string,
    { addresses: { 14800: string; 1480: string } }
  >();

  // Initialize with all entry points
  for (const [name, config] of entryPoints.entries()) {
    toDiscover.set(name, { addresses: config.addresses });
  }

  while (toDiscover.size > 0) {
    // Get next parent to process
    const [parentName, parentInfo] = toDiscover.entries().next().value;
    toDiscover.delete(parentName);

    if (processed.has(parentName)) continue;
    processed.add(parentName);

    // Find all children of this parent
    const children: Array<{ name: string; config: any }> = [];
    for (const [childName, childConfig] of discoverableContracts.entries()) {
      if (childConfig.discovery.parent === parentName) {
        children.push({ name: childName, config: childConfig });
      }
    }

    if (children.length === 0) continue;

    console.log(`📡 Discovering from ${parentName}...`);

    for (const { name: childName, config: childConfig } of children) {
      try {
        // Discover on both chains
        const [addr14800, addr1480] = await Promise.all([
          discoverContractOnChain(
            childName,
            parentName,
            childConfig.discovery.getter,
            14800,
            parentInfo.addresses[14800],
          ),
          discoverContractOnChain(
            childName,
            parentName,
            childConfig.discovery.getter,
            1480,
            parentInfo.addresses[1480],
          ),
        ]);

        // Validate against expected addresses
        const expected14800 = childConfig.addresses[14800];
        const expected1480 = childConfig.addresses[1480];

        if (expected14800.toLowerCase() !== addr14800.toLowerCase()) {
          console.warn(
            `⚠️  ${childName} on chain 14800:\n` +
              `   Expected: ${expected14800}\n` +
              `   On-chain: ${addr14800}\n` +
              `   Using on-chain value.`,
          );
        }

        if (expected1480.toLowerCase() !== addr1480.toLowerCase()) {
          console.warn(
            `⚠️  ${childName} on chain 1480:\n` +
              `   Expected: ${expected1480}\n` +
              `   On-chain: ${addr1480}\n` +
              `   Using on-chain value.`,
          );
        }

        discovered.set(childName, {
          name: childName,
          addresses: {
            14800: addr14800,
            1480: addr1480,
          },
          _meta: {
            discoveredFrom: parentName,
            lastUpdated: new Date().toISOString().split("T")[0],
          },
        });

        console.log(`   ✅ ${childName}: ${addr14800}`);

        // If this child is also a parent of other contracts, add it to discovery queue
        const hasChildren = Array.from(discoverableContracts.values()).some(
          (c) => c.discovery.parent === childName,
        );
        if (hasChildren && !toDiscover.has(childName)) {
          toDiscover.set(childName, {
            addresses: {
              14800: addr14800,
              1480: addr1480,
            },
          });
        }
      } catch (error) {
        console.error(
          `Failed to discover ${childName} from ${parentName}.${childConfig.discovery.getter}():`,
          error,
        );
        throw error;
      }
    }
  }

  console.log(`\n✅ Discovered ${discovered.size} child contracts\n`);
  return discovered;
}

/**
 * Generate the complete addresses.ts file
 */
function generateAddressesFile(
  discoveredContracts: Map<string, DiscoveredContract>,
): string {
  const { entryPoints } = separateContracts();
  const today = new Date().toISOString().split("T")[0];

  let content = `// AUTO-GENERATED FILE - DO NOT EDIT
// Generated by scripts/discover-addresses.ts on ${today}
// Source: src/config/contracts.config.ts + on-chain discovery

/**
 * Complete registry of Vana protocol contract addresses.
 *
 * This file is AUTO-GENERATED by the discover-addresses script.
 * DO NOT EDIT THIS FILE MANUALLY.
 *
 * To add contracts:
 * 1. Edit src/config/contracts.config.ts
 * 2. Run \`npm run discover-addresses\`
 *
 * @category Configuration
 */

import type { VanaContract } from "./abi";

`;

  // Build CONTRACTS object
  content += `export const CONTRACTS = {\n`;
  content += `  // ========================================\n`;
  content += `  // ENTRY POINTS (from contracts.config.ts)\n`;
  content += `  // ========================================\n`;

  for (const [name, info] of entryPoints.entries()) {
    content += `  ${name}: {\n`;
    content += `    addresses: {\n`;
    content += `      14800: "${info.addresses[14800]}",\n`;
    content += `      1480: "${info.addresses[1480]}",\n`;
    content += `    },\n`;
    content += `  },\n`;
  }

  content += `\n  // ========================================\n`;
  content += `  // AUTO-DISCOVERED (via on-chain queries)\n`;
  content += `  // ========================================\n`;

  for (const [name, info] of discoveredContracts.entries()) {
    content += `  ${name}: {\n`;
    content += `    addresses: {\n`;
    content += `      14800: "${info.addresses[14800]}",\n`;
    content += `      1480: "${info.addresses[1480]}",\n`;
    content += `    },\n`;
    content += `    _meta: {\n`;
    content += `      discoveredFrom: "${info._meta.discoveredFrom}",\n`;
    content += `      lastUpdated: "${info._meta.lastUpdated}",\n`;
    content += `    },\n`;
    content += `  },\n`;
  }

  content += `} as const;\n\n`;

  // Add legacy contracts
  content += `// Legacy/Deprecated Contracts (backwards compatibility)\n`;
  content += `export const LEGACY_CONTRACTS = {\n`;
  for (const [name, info] of Object.entries(LEGACY_CONTRACTS)) {
    content += `  ${name}: {\n`;
    content += `    addresses: {\n`;
    content += `      14800: "${info.addresses[14800]}",\n`;
    content += `      1480: "${info.addresses[1480]}",\n`;
    content += `    },\n`;
    content += `  },\n`;
  }
  content += `} as const;\n\n`;

  // Add backwards compatibility exports
  content += `// Transform for backwards compatibility\n`;
  content += `export const CONTRACT_ADDRESSES: Record<number, Record<string, string>> = {\n`;
  content += `  14800: Object.fromEntries(\n`;
  content += `    Object.entries(CONTRACTS)\n`;
  content += `      .map(([name, info]) => [name, info.addresses[14800]])\n`;
  content += `      .filter(([, addr]) => addr),\n`;
  content += `  ),\n`;
  content += `  1480: Object.fromEntries(\n`;
  content += `    Object.entries(CONTRACTS)\n`;
  content += `      .map(([name, info]) => [name, info.addresses[1480]])\n`;
  content += `      .filter(([, addr]) => addr),\n`;
  content += `  ),\n`;
  content += `};\n\n`;

  content += `export const UTILITY_ADDRESSES = {\n`;
  content += `  14800: {\n`;
  content += `    Multicall3: CONTRACTS.Multicall3.addresses[14800],\n`;
  content += `    Multisend: CONTRACTS.Multisend.addresses[14800],\n`;
  content += `  },\n`;
  content += `  1480: {\n`;
  content += `    Multicall3: CONTRACTS.Multicall3.addresses[1480],\n`;
  content += `    Multisend: CONTRACTS.Multisend.addresses[1480],\n`;
  content += `  },\n`;
  content += `} as const;\n\n`;

  content += `export const LEGACY_ADDRESSES = {\n`;
  content += `  14800: Object.fromEntries(\n`;
  content += `    Object.entries(LEGACY_CONTRACTS)\n`;
  content += `      .map(([name, info]) => [name, info.addresses[14800]])\n`;
  content += `      .filter(([, addr]) => addr),\n`;
  content += `  ),\n`;
  content += `  1480: Object.fromEntries(\n`;
  content += `    Object.entries(LEGACY_CONTRACTS)\n`;
  content += `      .map(([name, info]) => [name, info.addresses[1480]])\n`;
  content += `      .filter(([, addr]) => addr),\n`;
  content += `  ),\n`;
  content += `} as const;\n\n`;

  // Add helper functions
  content += `/**
 * Retrieves the deployed contract address for a specific Vana protocol contract on a given chain.
 */
export const getContractAddress = (
  chainId: keyof typeof CONTRACT_ADDRESSES,
  contract: VanaContract,
) => {
  const contractAddress = CONTRACT_ADDRESSES[chainId]?.[contract] as
    | \`0x\${string}\`
    | undefined;
  if (!contractAddress) {
    throw new Error(
      \`Contract address not found for \${contract} on chain \${chainId}\`,
    );
  }
  return contractAddress;
};

export const getUtilityAddress = (
  chainId: keyof typeof UTILITY_ADDRESSES,
  contract: keyof (typeof UTILITY_ADDRESSES)[keyof typeof UTILITY_ADDRESSES],
) => {
  return UTILITY_ADDRESSES[chainId][contract] as \`0x\${string}\`;
};
`;

  return content;
}

async function main() {
  console.log("🚀 Vana Contract Address Discovery\n");

  // Discover all child contracts
  const discovered = await discoverAllContracts();

  // Generate addresses.ts
  const content = generateAddressesFile(discovered);

  // Ensure directory exists
  const outputDir = path.join(process.cwd(), "src", "generated");
  await mkdir(outputDir, { recursive: true });

  // Write file
  const outputPath = path.join(outputDir, "addresses.ts");
  await writeFile(outputPath, content);

  const { entryPoints } = separateContracts();

  console.log(`✅ Generated ${outputPath}`);
  console.log(`\nSummary:`);
  console.log(`  Entry points: ${entryPoints.size}`);
  console.log(`  Discovered: ${discovered.size}`);
  console.log(`  Legacy: ${Object.keys(LEGACY_CONTRACTS).length}`);
  console.log(
    `  Total: ${entryPoints.size + discovered.size + Object.keys(LEGACY_CONTRACTS).length}`,
  );
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
