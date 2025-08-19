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
