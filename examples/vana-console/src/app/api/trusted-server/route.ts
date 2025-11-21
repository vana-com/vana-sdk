import { NextResponse, type NextRequest } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { Vana } from "@opendatalabs/vana-sdk/node";

export async function POST(request: NextRequest) {
  console.debug("🔍 Debug - POST /api/trusted-server");
  try {
    const body = await request.json();
    const { permissionId, chainId } = body;

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

    // Create wallet client with private key (server-side only)
    const applicationAccount = privateKeyToAccount(
      applicationPrivateKey as `0x${string}`,
    );

    // Use the SDK's chain configuration approach
    const defaultPersonalServerUrl =
      process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL;

    const vana = Vana({
      chainId,
      account: applicationAccount,
      ...(defaultPersonalServerUrl && { defaultPersonalServerUrl }),
    });

    console.debug("🔍 Debug - vana configured with:", {
      chainId,
      defaultPersonalServerUrl,
      applicationAddress: applicationAccount.address,
    });

    // Make trusted server request
    const handle = await vana.server.createOperation({
      permissionId,
    });

    return NextResponse.json({
      success: true,
      data: { id: handle.id },
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
