import { NextRequest, NextResponse } from "next/server";
import { StorageManager, PinataStorage } from "vana-sdk";

export async function POST(request: NextRequest) {
  try {
    // Get the uploaded file from form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 },
      );
    }

    console.log("📤 Processing IPFS upload via app-managed Pinata...");
    console.log("📝 File:", {
      name: file.name,
      size: file.size,
      type: file.type,
    });

    // Check if Pinata is configured
    if (!process.env.PINATA_JWT) {
      console.error("❌ Pinata not configured: PINATA_JWT missing");
      return NextResponse.json(
        {
          success: false,
          error:
            "IPFS storage not configured. Please set PINATA_JWT in server environment.",
        },
        { status: 503 },
      );
    }

    // Use SDK's storage manager for file upload
    const storageManager = new StorageManager();
    const pinataProvider = new PinataStorage({
      jwt: process.env.PINATA_JWT,
      gatewayUrl:
        process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud",
    });

    storageManager.register("pinata", pinataProvider, true);

    // Convert File to Blob for SDK upload
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    const uploadResult = await storageManager.upload(blob, file.name);

    const ipfsResult = {
      ipfsHash: uploadResult.metadata?.ipfsHash,
      grantUrl:
        uploadResult.metadata?.ipfsUrl ||
        `ipfs://${uploadResult.metadata?.ipfsHash}`,
      size: uploadResult.size,
    };

    console.log("✅ File uploaded to IPFS:", {
      ipfsHash: ipfsResult.ipfsHash,
      url: ipfsResult.grantUrl,
      size: ipfsResult.size,
    });

    return NextResponse.json({
      success: true,
      url: ipfsResult.grantUrl,
      ipfsHash: ipfsResult.ipfsHash,
      size: ipfsResult.size,
      storage: "app-managed-ipfs",
    });
  } catch (error) {
    console.error("❌ Error uploading to IPFS:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
