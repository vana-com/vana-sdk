import { NextRequest, NextResponse } from "next/server";
import { relayerConfig } from "@/lib/relayer";

// DataRegistry contract ABI - only the addFile function we need
const dataRegistryAbi = [
  {
    inputs: [{ name: "url", type: "string" }],
    name: "addFile",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// DataRegistry address on Moksha testnet
const MOKSHA_DATA_REGISTRY = "0x590E134DEF5844B0fc836ce2cc4087A957559BAD";

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
    const txHash = await relayerConfig.walletClient.writeContract({
      address: MOKSHA_DATA_REGISTRY,
      abi: dataRegistryAbi,
      functionName: "addFile",
      args: [url],
    });

    console.log("✅ File registered successfully:", txHash);

    return NextResponse.json({
      success: true,
      fileId: 0, // TODO: Parse from transaction receipt
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
