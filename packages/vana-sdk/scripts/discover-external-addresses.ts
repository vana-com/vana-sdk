#!/usr/bin/env tsx
/**
 * Discovers external dependency addresses from on-chain contract state.
 *
 * This script queries the Vana protocol contracts to discover addresses for external
 * dependencies (WVANA, Uniswap V3 contracts) that need to be added to addresses.ts.
 *
 * Run with: npx tsx scripts/discover-external-addresses.ts
 */

import { createPublicClient, http } from "viem";
import { getContractAddress } from "../src/generated/addresses";
import { getAbi } from "../src/generated/abi";

const VANA_MAINNET_RPC = "https://rpc.vana.org";
const MOKSHA_TESTNET_RPC = "https://rpc.moksha.vana.org";

interface ExternalAddresses {
  WVANA: { 14800: string; 1480: string };
  UniswapV3NonfungiblePositionManager: { 14800: string; 1480: string };
  UniswapV3QuoterV2: { 14800: string; 1480: string };
}

async function discoverForChain(chainId: 14800 | 1480): Promise<{
  wvana: string;
  positionManager: string;
  quoterV2: string;
}> {
  const rpcUrl = chainId === 14800 ? VANA_MAINNET_RPC : MOKSHA_TESTNET_RPC;

  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  console.log(`\nDiscovering addresses on chain ${chainId}...`);

  // Step 1: DLPRewardDeployer → swapContract() → DLPRewardSwap
  const deployerAddress = getContractAddress(chainId, "DLPRewardDeployer");
  console.log(`  DLPRewardDeployer: ${deployerAddress}`);

  const swapContractAddress = (await client.readContract({
    address: deployerAddress as `0x${string}`,
    abi: getAbi("DLPRewardDeployer"),
    functionName: "dlpRewardSwap",
  })) as `0x${string}`;
  console.log(`  DLPRewardSwap: ${swapContractAddress}`);

  // Step 2: DLPRewardSwap → positionManager() → NonfungiblePositionManager
  const positionManager = (await client.readContract({
    address: swapContractAddress,
    abi: getAbi("DLPRewardSwap"),
    functionName: "positionManager",
  })) as `0x${string}`;
  console.log(`  NonfungiblePositionManager: ${positionManager}`);

  // Step 3: DLPRewardSwap → swapHelper() → SwapHelper
  const swapHelperAddress = (await client.readContract({
    address: swapContractAddress,
    abi: getAbi("DLPRewardSwap"),
    functionName: "swapHelper",
  })) as `0x${string}`;
  console.log(`  SwapHelper: ${swapHelperAddress}`);

  // Step 4: SwapHelper → WVANA()
  const wvana = (await client.readContract({
    address: swapHelperAddress,
    abi: getAbi("SwapHelper"),
    functionName: "WVANA",
  })) as `0x${string}`;
  console.log(`  WVANA: ${wvana}`);

  // Step 5: SwapHelper → uniswapV3Quoter()
  const quoterV2 = (await client.readContract({
    address: swapHelperAddress,
    abi: getAbi("SwapHelper"),
    functionName: "uniswapV3Quoter",
  })) as `0x${string}`;
  console.log(`  QuoterV2: ${quoterV2}`);

  return {
    wvana,
    positionManager,
    quoterV2,
  };
}

async function main() {
  console.log(
    "Discovering external dependency addresses from on-chain state...\n",
  );

  const mainnet = await discoverForChain(14800);
  const testnet = await discoverForChain(1480);

  const addresses: ExternalAddresses = {
    WVANA: {
      14800: mainnet.wvana,
      1480: testnet.wvana,
    },
    UniswapV3NonfungiblePositionManager: {
      14800: mainnet.positionManager,
      1480: testnet.positionManager,
    },
    UniswapV3QuoterV2: {
      14800: mainnet.quoterV2,
      1480: testnet.quoterV2,
    },
  };

  console.log("\n\n=== ADD TO addresses.ts ===\n");
  console.log(`  // External Dependencies (DeFi Infrastructure)
  WVANA: {
    addresses: {
      14800: "${addresses.WVANA[14800]}",
      1480: "${addresses.WVANA[1480]}",
    },
    external: true,
  },
  UniswapV3NonfungiblePositionManager: {
    addresses: {
      14800: "${addresses.UniswapV3NonfungiblePositionManager[14800]}",
      1480: "${addresses.UniswapV3NonfungiblePositionManager[1480]}",
    },
    external: true,
  },
  UniswapV3QuoterV2: {
    addresses: {
      14800: "${addresses.UniswapV3QuoterV2[14800]}",
      1480: "${addresses.UniswapV3QuoterV2[1480]}",
    },
    external: true,
  },`);

  console.log("\n\n=== UPDATE contract-references.ts ===\n");
  console.log(
    `Update the expected addresses in CONTRACT_REFERENCES with the values above.`,
  );
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
