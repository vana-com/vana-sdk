import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet, Vana } from "vana-sdk";

export async function POST(request: NextRequest) {
  console.debug("🔍 Debug - POST /api/personal/setup");
  try {
    const body = await request.json();
    const { userAddress } = body;

    // Validate required fields
    if (!userAddress) {
      console.debug("🔍 Debug - Missing required fields");
      return NextResponse.json(
        { success: false, error: "Missing userAddress field" },
        { status: 400 },
      );
    }

    // Basic address validation
    if (!userAddress.startsWith("0x") || userAddress.length !== 42) {
      return NextResponse.json(
        { success: false, error: "Invalid Ethereum address format" },
        { status: 400 },
      );
    }

    // Get private key from server-side environment variable
    const applicationPrivateKey = process.env.APPLICATION_PRIVATE_KEY;
    if (!applicationPrivateKey) {
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 },
      );
    }

    console.debug("🔍 Debug - applicationPrivateKey", applicationPrivateKey);
    // Create wallet client with private key (server-side only)
    const applicationAccount = privateKeyToAccount(
      applicationPrivateKey as `0x${string}`,
    );

    const walletClient = createWalletClient({
      account: applicationAccount,
      chain: mokshaTestnet,
      transport: http("https://rpc.vana.org"),
    });

    // Create Vana instance
    const vana = new Vana({
      walletClient,
    });

    console.debug("🔍 Debug - vana", vana);

    // Initialize personal server
    const response = await vana.personal.initPersonalServer({
      userAddress,
    });

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Personal server setup failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
