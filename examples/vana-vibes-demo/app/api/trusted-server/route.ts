import { NextRequest, NextResponse } from "next/server";
import { getApiVanaInstance } from "../../../lib/api-vana";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { permissionId } = body;

    if (!permissionId) {
      return NextResponse.json(
        { success: false, error: "Missing permissionId field" },
        { status: 400 },
      );
    }

    const vana = getApiVanaInstance();

    const handle = await vana.server.createOperation({
      permissionId: +permissionId,
    });

    // Wait for the operation to complete using the built-in polling
    const result = await handle.waitForResult({
      timeout: 60000, // 60 seconds timeout
      pollingInterval: 1000, // Poll every second
    });

    return NextResponse.json({
      success: true,
      data: {
        id: handle.id,
        result: result,
      },
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
