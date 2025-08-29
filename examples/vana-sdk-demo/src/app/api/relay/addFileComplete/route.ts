// examples/vana-sdk-demo/src/app/api/relay/addFileComplete/route.ts

import { createRelayerVana } from "@/lib/relayer";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  console.log(
    "[addFileComplete] Request received at:",
    new Date().toISOString(),
  );
  try {
    const {
      url,
      userAddress,
      permissions = [],
      schemaId = 0,
      ownerAddress,
    } = await request.json();
    console.log("[addFileComplete] Params:", { url, userAddress, schemaId });

    if (!url || !userAddress) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required parameters: url, userAddress",
        },
        { status: 400 },
      );
    }

    const vana = createRelayerVana();
    console.log("[addFileComplete] Submitting transaction...");
    const startTime = Date.now();

    const txResult = await vana.data.addFileWithEncryptedPermissionsAndSchema(
      url,
      ownerAddress ?? userAddress, // Use ownerAddress if provided, otherwise fallback to userAddress
      permissions,
      schemaId,
    );
    console.log("[addFileComplete] Transaction hash:", txResult.hash);

    // Wait for transaction and get events
    console.log("[addFileComplete] Waiting for transaction events...");
    const result = await vana.waitForTransactionEvents(txResult);
    const elapsed = Date.now() - startTime;
    console.log(`[addFileComplete] Events received after ${elapsed}ms`);

    // Extract fileId from FileAdded event
    const fileId = result.expectedEvents?.FileAdded?.fileId;
    console.log("[addFileComplete] FileId from event:", fileId);

    return NextResponse.json({
      success: true,
      fileId: fileId ? Number(fileId) : 0,
      transactionHash: txResult.hash,
    });
  } catch (error) {
    console.error("Relay error in addFileComplete:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 },
    );
  }
}
