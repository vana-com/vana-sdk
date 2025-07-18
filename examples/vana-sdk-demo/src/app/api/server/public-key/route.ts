import { NextRequest, NextResponse } from "next/server";
import { createRelayerVana } from "@/lib/relayer";

export async function POST(request: NextRequest) {
  try {
    const { serverAddress, chainId } = await request.json();

    if (!serverAddress) {
      return NextResponse.json(
        { success: false, error: "Server address is required" },
        { status: 400 },
      );
    }

    // Use relayer SDK instance (has proper credentials)
    const vana = await createRelayerVana(chainId || 14800);

    // Get server's public key using server-side credentials
    const publicKey = await vana.data.getTrustedServerPublicKey(
      serverAddress as `0x${string}`,
    );

    return NextResponse.json({
      success: true,
      publicKey,
    });
  } catch (error) {
    console.error("Failed to get server public key:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
