import { NextRequest, NextResponse } from "next/server";
import { createRelayerVana } from "@/lib/relayer";

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

    // Create Vana SDK instance with relayer wallet
    const vana = createRelayerVana();

    // Use the SDK's DataController to add file with permissions
    // This handles all the contract interaction and receipt parsing internally
    const result = await vana.data.addFileWithPermissions(
      url,
      userAddress as `0x${string}`,
      [], // No additional permissions needed at registration time
    );

    console.log(`✅ File registered with ID: ${result.fileId}`);

    // TODO: In the future, we should:
    // 1. Require a signature from the user proving they consent to file registration
    // 2. Use a hypothetical addFileWithSignature method that verifies this signature

    return NextResponse.json({
      success: true,
      fileId: result.fileId,
      transactionHash: result.transactionHash,
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
