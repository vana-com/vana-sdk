import { NextRequest, NextResponse } from "next/server";
import { createRelayerVana, getPersonalServerInfo } from "../../../lib/relayer";

export async function POST(request: NextRequest) {
  try {
    const { operation, fileUrl, userAddress, grantUrl } = await request.json();

    if (!operation || !fileUrl || !userAddress || !grantUrl) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const chainId = process.env.NEXT_PUBLIC_MOKSHA === "true" ? 14800 : 1480;

    // Get personal server info internally
    const serverInfo = await getPersonalServerInfo(chainId, userAddress);
    const vana = await createRelayerVana(chainId);

    // Read grantee ID from environment variable
    const granteeId = process.env.DEFAULT_GRANTEE_ID
      ? BigInt(process.env.DEFAULT_GRANTEE_ID)
      : BigInt(1);

    // Execute the batch operation using the relayer
    const result = await vana.permissions.submitAddServerFilesAndPermissions({
      granteeId,
      grant: grantUrl,
      fileUrls: [fileUrl],
      serverAddress: serverInfo.address as `0x${string}`,
      serverUrl: serverInfo.serverUrl,
      serverPublicKey: serverInfo.publicKey,
      filePermissions: [
        [
          {
            account: serverInfo.address as `0x${string}`,
            key: serverInfo.publicKey,
          },
        ],
      ],
    });

    return NextResponse.json({
      transactionHash: result,
      batchId: `batch_${Date.now()}`,
      success: true,
    });
  } catch (error) {
    console.error("Relay transaction error:", error);
    return NextResponse.json(
      {
        error: "Transaction failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
