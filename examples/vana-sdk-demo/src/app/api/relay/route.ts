import { NextResponse, type NextRequest } from "next/server";
import { createRelayerVana } from "@/lib/relayer";
import {
  handleRelayerOperation,
  type UnifiedRelayerRequest,
} from "@opendatalabs/vana-sdk/node";

export async function POST(request: NextRequest) {
  try {
    // Just pass the entire request body to the unified handler!
    const body: UnifiedRelayerRequest = await request.json();

    console.info("🔄 Processing relayer operation...");
    console.debug(
      "🔍 Debug - Received request:",
      JSON.stringify(
        body,
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ),
    );

    // Use the new unified relayer handler - it handles EVERYTHING
    const vana = createRelayerVana();
    const result = await handleRelayerOperation(vana, body);

    console.info("✅ Operation completed successfully:", result);

    // Return the result directly - the SDK expects the exact response format
    return NextResponse.json(result);
  } catch (error) {
    console.error("❌ Error handling relayer operation:", error);
    // Return error in the expected format
    return NextResponse.json({
      type: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
