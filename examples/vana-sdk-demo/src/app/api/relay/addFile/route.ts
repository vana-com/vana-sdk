import { NextRequest, NextResponse } from "next/server";
import { relayerConfig } from "@/lib/relayer";
import { decodeEventLog } from "viem";

// DataRegistry contract ABI - function and event we need
const dataRegistryAbi = [
  {
    inputs: [
      { name: "url", type: "string" },
      { name: "ownerAddress", type: "address" },
      {
        name: "permissions",
        type: "tuple[]",
        components: [
          { name: "account", type: "address" },
          { name: "key", type: "string" },
        ],
      },
    ],
    name: "addFileWithPermissions",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "fileId", type: "uint256" },
      { indexed: true, name: "ownerAddress", type: "address" },
      { indexed: false, name: "url", type: "string" },
    ],
    name: "FileAdded",
    type: "event",
  },
] as const;

// DataRegistry address on Moksha testnet
const MOKSHA_DATA_REGISTRY = "0x8C8788f98385F6ba1adD4234e551ABba0f82Cb7C";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, userAddress } = body;

    if (!url || !userAddress) {
      return NextResponse.json(
        { success: false, error: "Missing url or userAddress" },
        { status: 400 },
      );
    }

    console.log("🔄 Relaying file registration to DataRegistry...");
    console.log("📄 URL:", url);
    console.log("👤 User:", userAddress);

    // Use relayer wallet to submit transaction
    // We use addFileWithPermissions to ensure the file is registered to the user's address
    // In the future, this could be improved with addFileWithSignature to verify user consent
    const txHash = await relayerConfig.walletClient.writeContract({
      address: MOKSHA_DATA_REGISTRY,
      abi: dataRegistryAbi,
      functionName: "addFileWithPermissions",
      chain: relayerConfig.walletClient.chain,
      args: [
        url,
        userAddress as `0x${string}`,
        [], // No additional permissions needed at registration time
      ],
    });

    console.log("✅ File registered, getting receipt for fileId...");

    // Get the transaction receipt to parse the FileAdded event
    const receipt = await relayerConfig.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    // Parse the FileAdded event to get the actual fileId
    let fileId = 0;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: dataRegistryAbi,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName === "FileAdded") {
          fileId = Number(decoded.args.fileId);
          console.log(`📄 File registered with ID: ${fileId}`);
          break;
        }
      } catch (error) {
        // Ignore logs that don't match our ABI
        continue;
      }
    }

    // TODO: In the future, we should:
    // 1. Require a signature from the user proving they consent to file registration
    // 2. Use a hypothetical addFileWithSignature method that verifies this signature

    return NextResponse.json({
      success: true,
      fileId: fileId,
      transactionHash: txHash,
    });
  } catch (error) {
    console.error("❌ Error registering file:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
