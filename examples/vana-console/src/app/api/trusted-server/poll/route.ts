import { NextResponse, type NextRequest } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { Vana } from "@opendatalabs/vana-sdk/node";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operationId, chainId } = body;

    if (!operationId || !chainId) {
      return NextResponse.json(
        { success: false, error: "Missing getUrl or chainId parameter" },
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
    // If not provided, SDK will use default personal server URL for the chain
    const defaultPersonalServerUrl =
      process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL ?? undefined;

    const vana = Vana({
      chainId,
      account: applicationAccount,
      defaultPersonalServerUrl,
    });

    console.debug("🔍 [Poll] Polling operation:", {
      operationId,
      personalServerUrl: defaultPersonalServerUrl,
      fullUrl: `${defaultPersonalServerUrl}/operations/${operationId}`,
    });

    // Poll the status
    const response = await vana.server.getOperation(operationId);

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Trusted server polling failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
