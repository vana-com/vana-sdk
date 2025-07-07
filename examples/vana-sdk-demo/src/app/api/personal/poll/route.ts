import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet, Vana } from "vana-sdk";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { getUrl } = body;

    if (!getUrl) {
      return NextResponse.json(
        { success: false, error: "Missing getUrl parameter" },
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

    const walletClient = createWalletClient({
      account: applicationAccount,
      chain: mokshaTestnet,
      transport: http("https://rpc.moksha.vana.org"),
    });

    // Create Vana instance with application client
    const vana = new Vana({
      walletClient,
      applicationClient: walletClient,
    });

    // Poll the status
    const response = await vana.personal.pollStatus(getUrl);

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Personal server polling failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
