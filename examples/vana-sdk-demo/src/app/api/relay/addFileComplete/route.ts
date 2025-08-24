// examples/vana-sdk-demo/src/app/api/relay/addFileComplete/route.ts

import { createRelayerVana } from "@/lib/relayer";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const {
      url,
      userAddress,
      permissions = [],
      schemaId = 0,
      ownerAddress,
    } = await request.json();

    if (!url || !userAddress) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required parameters: url, userAddress",
        },
        { status: 400 },
      );
    }

    const vana = await createRelayerVana();
    const txResult = await vana.data.addFileWithPermissionsAndSchema(
      url,
      ownerAddress || userAddress, // Use ownerAddress if provided, otherwise fallback to userAddress
      permissions,
      schemaId,
    );

    // Wait for transaction and get events
    const result = await vana.waitForTransactionEvents(txResult);
    
    // Extract fileId from FileAdded event
    const fileId = result.expectedEvents?.FileAdded?.fileId;

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
