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
    const result = await vana.data.addFileWithPermissionsAndSchema(
      url,
      userAddress,
      permissions,
      schemaId,
    );

    return NextResponse.json({
      success: true,
      fileId: result.fileId,
      transactionHash: result.transactionHash,
    });
  } catch (error) {
    console.error("Relay error in addFileComplete:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 },
    );
  }
}
