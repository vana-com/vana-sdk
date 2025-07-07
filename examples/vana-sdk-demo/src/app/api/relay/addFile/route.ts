import { NextRequest, NextResponse } from "next/server";
import { relayerConfig } from "@/lib/relayer";

// DataRegistry contract ABI - only the addFileWithPermissions function we need
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
    // We use addFileWithPermissions to ensure the file is registered to the user's address
    // In the future, this could be improved with addFileWithSignature to verify user consent
    const txHash = await relayerConfig.walletClient.writeContract({
      address: MOKSHA_DATA_REGISTRY,
      abi: dataRegistryAbi,
      functionName: "addFileWithPermissions",
      args: [
        url,
        userAddress as `0x${string}`,
        [], // No additional permissions needed at registration time
      ],
    });

    console.log("✅ File registered successfully:", txHash);

    // TODO: In the future, we should:
    // 1. Require a signature from the user proving they consent to file registration
    // 2. Use a hypothetical addFileWithSignature method that verifies this signature
    // 3. Parse the transaction receipt to get the actual fileId from FileAdded event

    return NextResponse.json({
      success: true,
      fileId: 0, // TODO: Parse from transaction receipt FileAdded event
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
