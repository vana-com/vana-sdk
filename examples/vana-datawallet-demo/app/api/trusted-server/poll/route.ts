import { NextRequest, NextResponse } from "next/server";
import { getApiVanaInstance } from "../../../../lib/api-vana";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operationId } = body;

    if (!operationId) {
      return NextResponse.json(
        { success: false, error: "Missing operationId parameter" },
        { status: 400 },
      );
    }

    const vana = getApiVanaInstance();

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
