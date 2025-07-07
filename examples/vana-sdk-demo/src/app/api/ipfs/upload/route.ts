import { NextRequest, NextResponse } from "next/server";
import { createPinataProvider } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 },
      );
    }

    const pinataProvider = createPinataProvider();
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    const result = await pinataProvider.upload(blob, file.name);

    return NextResponse.json({
      success: true,
      url: result.metadata?.ipfsUrl || `ipfs://${result.metadata?.ipfsHash}`,
      ipfsHash: result.metadata?.ipfsHash,
      size: result.size,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
