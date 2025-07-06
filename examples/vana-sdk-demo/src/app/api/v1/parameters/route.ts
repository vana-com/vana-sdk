import { NextRequest, NextResponse } from "next/server";
import { createPinataProvider } from "@/lib/storage";
import { relayerStorage, generateContentId } from "@/lib/relayer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { parameters } = body;

    if (!parameters) {
      return NextResponse.json(
        { success: false, error: "Missing parameters" },
        { status: 400 },
      );
    }

    // Try using centralized Pinata storage if configured
    if (process.env.PINATA_JWT) {
      try {
        console.log("📤 Using SDK Pinata IPFS storage");

        const pinataProvider = createPinataProvider();

        // Test connection first
        const connectionTest = await pinataProvider.testConnection();

        if (connectionTest.success) {
          // Create a blob from the parameters
          const blob = new Blob([parameters], { type: "application/json" });
          const filename = `vana-permission-${Date.now()}.json`;

          const uploadResult = await pinataProvider.upload(blob, filename);

          // Extract IPFS URL from metadata
          const ipfsUrl =
            uploadResult.metadata?.ipfsUrl ||
            `ipfs://${uploadResult.metadata?.ipfsHash}`;

          console.log("📦 Stored parameters on IPFS via SDK:", {
            ipfsHash: uploadResult.metadata?.ipfsHash,
            grantUrl: ipfsUrl,
            size: uploadResult.size,
          });

          return NextResponse.json({
            success: true,
            grantUrl: ipfsUrl,
            ipfsHash: uploadResult.metadata?.ipfsHash,
            storage: "ipfs",
          });
        } else {
          console.log(
            "⚠️ Pinata connection test failed:",
            connectionTest.error,
          );
        }
      } catch (pinataError) {
        console.log("⚠️ Pinata upload failed:", pinataError);
      }
    } else {
      console.log("⚠️ Pinata not configured (missing PINATA_JWT)");
    }

    // Fallback to in-memory storage
    console.log("💡 Configure PINATA_JWT in .env.local for real IPFS storage");

    const contentId = generateContentId(parameters);
    relayerStorage.store(contentId, parameters);
    const grantUrl = `ipfs://${contentId}`;

    console.log("📦 Stored parameters (in-memory):", {
      contentId,
      grantUrl,
      size: parameters.length,
    });

    return NextResponse.json({
      success: true,
      grantUrl,
      storage: "memory",
      warning:
        "Using in-memory storage. Configure PINATA_JWT for real IPFS storage.",
    });
  } catch (error) {
    console.error("❌ Error storing parameters:", error);

    // If IPFS fails, try fallback to in-memory storage
    try {
      console.log("🔄 IPFS failed, trying in-memory fallback...");
      const body = await request.json();
      const { parameters } = body;

      const contentId = generateContentId(parameters);
      relayerStorage.store(contentId, parameters);
      const grantUrl = `ipfs://${contentId}`;

      return NextResponse.json({
        success: true,
        grantUrl,
        storage: "memory",
        warning: "IPFS storage failed, used in-memory fallback.",
      });
    } catch (fallbackError) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  }
}
