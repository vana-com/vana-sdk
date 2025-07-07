import { NextRequest, NextResponse } from "next/server";
import { createPinataProvider } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { parameters } = body;

    if (!parameters) {
      return NextResponse.json(
        { success: false, error: "No parameters provided" },
        { status: 400 },
      );
    }

    // Create a blob from the parameters
    const blob = new Blob([parameters], { type: "application/json" });

    // Upload to IPFS using Pinata
    const pinataProvider = createPinataProvider();
    const result = await pinataProvider.upload(blob, "grant-parameters.json");

    return NextResponse.json({
      success: true,
      grantUrl:
        result.metadata?.ipfsUrl || `ipfs://${result.metadata?.ipfsHash}`,
      ipfsHash: result.metadata?.ipfsHash,
      size: result.size,
    });
  } catch (error) {
    console.error("Error storing parameters:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
