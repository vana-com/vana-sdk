import { type NextRequest, NextResponse } from "next/server";
import { getApiVanaInstance } from "../../../lib/api-vana";
import { handleRelayerOperation } from "@opendatalabs/vana-sdk/node";
import type { UnifiedRelayerRequest } from "@opendatalabs/vana-sdk/node";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const relayerRequest: UnifiedRelayerRequest = body;

    if (!relayerRequest) {
      return NextResponse.json(
        { success: false, error: "Missing request body" },
        { status: 400 },
      );
    }

    const vana = getApiVanaInstance();
    const result = await handleRelayerOperation(vana, relayerRequest);

    // Return the unified response directly
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error relaying transaction:", error);
    return NextResponse.json(
      {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
