import { NextRequest, NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { Vana } from "vana-sdk";

export async function POST(request: NextRequest) {
  console.debug("🔍 Debug - POST /api/trusted-server/setup");
  try {
    const body = await request.json();
    const { userAddress, chainId } = body;

    // Validate required fields
    if (!userAddress || !chainId) {
      console.debug("🔍 Debug - Missing required fields");
      return NextResponse.json(
        { success: false, error: "Missing userAddress or chainId field" },
        { status: 400 },
      );
    }

    // Basic address validation
    if (!userAddress.startsWith("0x") || userAddress.length !== 42) {
      return NextResponse.json(
        { success: false, error: "Invalid EVM address format" },
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

    // Create wallet client with private key (server-side only)
    const applicationAccount = privateKeyToAccount(
      applicationPrivateKey as `0x${string}`,
    );

    // Use the SDK's chain configuration approach
    const vana = new Vana({
      chainId,
      account: applicationAccount,
    });

    console.debug("🔍 Debug - vana", vana);

    // Initialize trusted server
    const response = await vana.server.getPersonalServerIdentity({
      userAddress,
    });

    console.debug(
      "🔍 Debug - SDK response:",
      JSON.stringify(response, null, 2),
    );
    console.debug("🔍 Debug - Response structure:", {
      keys: Object.keys(response),
      hasIdentity: "identity" in response,
      hasUserAddress: "userAddress" in response,
    });

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Trusted server setup failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
