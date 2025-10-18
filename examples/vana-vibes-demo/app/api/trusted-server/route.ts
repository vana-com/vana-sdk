import { type NextRequest, NextResponse } from "next/server";
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

    const operation = await vana.server.createOperation({
      permissionId: +permissionId,
    });

    // Wait for the operation to complete using the SDK's waitForOperation method
    const completedOp = await vana.waitForOperation(operation.id, {
      timeout: 60000,
      pollingInterval: 500,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: operation.id,
        result: completedOp.result,
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
