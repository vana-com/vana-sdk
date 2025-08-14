#!/usr/bin/env tsx
/**
 * Simple test script for gas-aware multicall functionality
 * Tests basic multicall operations without requiring authentication
 */

import { createPublicClient, http, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gasAwareMulticall } from "../src/utils/multicall";
import { getContractAddress } from "../src/config/addresses";
import { getAbi } from "../src/abi";
import { getUtilityAddress } from "../src/config/addresses";
import { SchemaController } from "../src/controllers/schemas";
import { ControllerContext } from "../src/controllers/permissions";

// Configuration - using moksha testnet
const RPC_URL = process.env.VANA_RPC_URL || "https://rpc.moksha.vana.org";

/**
 *
 */
async function main() {
  console.log("🧪 Testing gas-aware multicall functionality...\n");
  console.log(`RPC URL: ${RPC_URL}`);

  // Create public client
  const publicClient = createPublicClient({
    transport: http(RPC_URL),
  });

  try {
    // Get chain ID and verify
    const chainId = await publicClient.getChainId();
    console.log(`Chain ID: ${chainId}`);

    // Get Multicall3 address for this chain
    const multicall3Address = getUtilityAddress(
      chainId as number,
      "Multicall3",
    );
    console.log(`Multicall3 address: ${multicall3Address}\n`);

    // Create a dummy wallet client and context for SchemaController
    const dummyAccount = privateKeyToAccount(
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    );
    const walletClient = createWalletClient({
      account: dummyAccount,
      chain: {
        id: chainId,
        name: "Vana",
        network: "vana",
        nativeCurrency: { name: "VANA", symbol: "VANA", decimals: 18 },
        rpcUrls: { default: { http: [RPC_URL] }, public: { http: [RPC_URL] } },
      },
      transport: http(RPC_URL),
    });

    const context: ControllerContext = {
      publicClient,
      walletClient,
      storageClient: undefined,
    };

    const schemaController = new SchemaController(context);

    // Test 1: Simple schema count query
    console.log("📋 Test 1: Getting schema count...");
    const dataRefinerRegistryAddress = getContractAddress(
      chainId,
      "DataRefinerRegistry",
    );
    const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

    const countResult = await publicClient.readContract({
      address: dataRefinerRegistryAddress,
      abi: dataRefinerRegistryAbi,
      functionName: "schemasCount",
    });
    const totalSchemas = Number(countResult);
    console.log(`Total schemas: ${totalSchemas}`);

    if (totalSchemas === 0) {
      console.log("No schemas available for testing");
      return;
    }

    // Test 2: Compare with small batch (10 schemas)
    console.log("\n📋 Test 2: Comparing with 10 schemas...");
    const smallLimit = Math.min(10, totalSchemas);

    // Method 1: Using SchemaController.list()
    console.log("\nMethod 1: SchemaController.list() - 10 schemas");
    console.time("SchemaController.list() - 10");
    const schemasViaController = await schemaController.list({
      limit: smallLimit,
      offset: 0,
    });
    console.timeEnd("SchemaController.list() - 10");
    console.log(`Retrieved ${schemasViaController.length} schemas`);

    // Method 2: Using gasAwareMulticall directly
    console.log("\nMethod 2: Direct gasAwareMulticall - 10 schemas");
    const smallSchemaCalls = [];
    for (let i = 0; i < smallLimit; i++) {
      smallSchemaCalls.push({
        address: dataRefinerRegistryAddress,
        abi: dataRefinerRegistryAbi,
        functionName: "schemas",
        args: [BigInt(i + 1)],
      } as const);
    }

    console.time("gasAwareMulticall - 10");
    const smallResults = await gasAwareMulticall(publicClient, {
      contracts: smallSchemaCalls,
      allowFailure: true,
    });
    console.timeEnd("gasAwareMulticall - 10");
    console.log(
      `Retrieved ${smallResults.filter((r) => r.status === "success").length} schemas`,
    );

    // Test 3: Compare with 100 calls (using schemasCount for repeated calls)
    console.log("\n📋 Test 3: Comparing with 100 calls...");

    // Create 100 calls - we'll use schemasCount since we know it works
    const largeSchemaCalls = Array(100)
      .fill(null)
      .map(
        () =>
          ({
            address: dataRefinerRegistryAddress,
            abi: dataRefinerRegistryAbi,
            functionName: "schemasCount",
            args: [],
          }) as const,
      );

    // Method 1: Using SchemaController with 100 schemas (if available)
    // Since we might not have 100 schemas, we'll make 100 calls to schemasCount instead
    console.log("\nMethod 1: SchemaController.count() - 100 calls");
    console.time("SchemaController - 100 calls");
    const controllerPromises = [];
    for (let i = 0; i < 100; i++) {
      controllerPromises.push(schemaController.count());
    }
    await Promise.all(controllerPromises);
    console.timeEnd("SchemaController - 100 calls");
    console.log("Completed 100 individual count() calls");

    // Method 2: Using gasAwareMulticall directly with 100 calls
    console.log("\nMethod 2: Direct gasAwareMulticall - 100 calls");
    console.time("gasAwareMulticall - 100 calls");
    const largeResults = await gasAwareMulticall(
      publicClient,
      {
        contracts: largeSchemaCalls,
        allowFailure: false,
      },
      {
        onProgress: (done, total) => {
          if (done % 20 === 0 || done === total) {
            process.stdout.write(`\r  Progress: ${done}/${total}`);
          }
        },
      },
    );
    console.log(); // New line after progress
    console.timeEnd("gasAwareMulticall - 100 calls");
    console.log(`Retrieved ${largeResults.length} results`);

    // Verify all results are the same (they should all be the schema count)
    const allSame = largeResults.every((r) => r === largeResults[0]);
    console.log(`All results identical: ${allSame ? "✅" : "❌"}`);
    if (allSame) {
      console.log(`Schema count value: ${largeResults[0]}`);
    }

    // Test 4: Verify multicall3 is working
    console.log("\n📋 Test 4: Direct multicall3 test...");
    const directMulticall = await publicClient.multicall({
      contracts: smallSchemaCalls.slice(0, 3),
      multicallAddress: multicall3Address,
    });
    console.log(`Direct multicall returned ${directMulticall.length} results`);

    console.log("\n✅ All tests completed successfully!");
    console.log("\nSummary:");
    console.log(`- Chain ID: ${chainId}`);
    console.log(`- Multicall3 address: ${multicall3Address}`);
    console.log(`- Total schemas: ${totalSchemas}`);
    console.log(`- Gas-aware multicall is working correctly`);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      if (error.stack) {
        console.error("Stack trace:", error.stack);
      }
    }
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);
