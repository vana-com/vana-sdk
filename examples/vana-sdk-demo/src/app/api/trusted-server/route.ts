import { NextRequest, NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { Vana } from "vana-sdk";

export async function POST(request: NextRequest) {
  console.debug("🔍 Debug - POST /api/trusted-server");
  try {
    const body = await request.json();
    const { userAddress, permissionId, chainId } = body;

    // Validate required fields
    if (!permissionId || !chainId) {
      console.debug("🔍 Debug - Missing required fields");
      return NextResponse.json(
        { success: false, error: "Missing permissionId or chainId field" },
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

    // Use the SDK's chain configuration approach
    const vana = await Vana.create({
      chainId,
      account: applicationAccount,
    });

    console.debug("🔍 Debug - vana", vana);

    // Make trusted server request
    const response = await vana.server.postRequest({
      userAddress,
      permissionId,
    });

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Trusted server request failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
