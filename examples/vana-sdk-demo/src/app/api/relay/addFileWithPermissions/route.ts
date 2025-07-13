import { NextRequest, NextResponse } from "next/server";
import { createRelayerVana } from "@/lib/relayer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, userAddress, permissions } = body;

    if (!url || !userAddress || !permissions) {
      return NextResponse.json(
        { success: false, error: "Missing url, userAddress, or permissions" },
        { status: 400 },
      );
    }

    // Validate permissions array
    if (!Array.isArray(permissions)) {
      return NextResponse.json(
        { success: false, error: "Permissions must be an array" },
        { status: 400 },
      );
    }

    // Validate each permission has required fields
    for (const permission of permissions) {
      if (!permission.account || !permission.key) {
        return NextResponse.json(
          {
            success: false,
            error: "Each permission must have 'account' and 'key' fields",
          },
          { status: 400 },
        );
      }
    }

    console.info(
      "🔄 Relaying file registration with permissions to DataRegistry...",
    );
    console.info("📄 URL:", url);
    console.info("👤 User:", userAddress);
    console.info("🔐 Permissions:", permissions.length, "granted");

    // Create Vana SDK instance with relayer wallet
    const vana = await createRelayerVana();

    // Use the SDK's DataController to add file with permissions
    // This handles all the contract interaction and receipt parsing internally
    const result = await vana.data.addFileWithPermissions(
      url,
      userAddress as `0x${string}`,
      permissions,
    );

    console.info(`✅ File registered with ID: ${result.fileId}`);
    console.info(`🔗 Transaction: ${result.transactionHash}`);

    return NextResponse.json({
      success: true,
      fileId: result.fileId,
      transactionHash: result.transactionHash,
    });
  } catch (error) {
    console.error("❌ Error registering file with permissions:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
