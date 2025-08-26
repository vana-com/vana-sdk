import { NextResponse, type NextRequest } from "next/server";
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

    console.info("🔄 Relaying file registration to DataRegistry...");
    console.info("📄 URL:", url);
    console.info("👤 User:", userAddress);

    // Create Vana SDK instance with relayer wallet
    const vana = createRelayerVana();

    // Use the SDK's DataController to add file with permissions
    // This handles all the contract interaction and receipt parsing internally
    const txResult = await vana.data.addFileWithPermissions(
      url,
      userAddress as `0x${string}`,
      [], // No additional permissions needed at registration time
    );

    // Wait for transaction and get events
    const result = await vana.waitForTransactionEvents(txResult);

    // Extract fileId from FileAdded event
    const fileId = result.expectedEvents?.FileAdded?.fileId;

    console.info(`✅ File registered with ID: ${fileId}`);

    // TODO: In the future, we should:
    // 1. Require a signature from the user proving they consent to file registration
    // 2. Use a hypothetical addFileWithSignature method that verifies this signature

    return NextResponse.json({
      success: true,
      fileId: fileId ? Number(fileId) : 0,
      transactionHash: txResult.hash,
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
