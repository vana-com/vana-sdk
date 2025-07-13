import { NextRequest, NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { Vana } from "vana-sdk";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress, chainId } = body;

    if (!userAddress || !chainId) {
      return NextResponse.json(
        { success: false, error: "Missing userAddress or chainId parameter" },
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
    const vana = await Vana.create({
      chainId,
      account: applicationAccount,
    });

    // Get the trusted server public key using server-side REPLICATE_API_TOKEN
    const publicKey = await vana.server.getTrustedServerPublicKey(userAddress);

    return NextResponse.json({
      success: true,
      data: {
        userAddress,
        publicKey,
      },
    });
  } catch (error) {
    console.error("Identity server request failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
