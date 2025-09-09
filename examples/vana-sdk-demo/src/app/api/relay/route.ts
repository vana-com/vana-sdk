import { NextResponse, type NextRequest } from "next/server";
import {
  createRelayerVana,
  relayerAccount,
  relayerConfig,
} from "@/lib/relayer";
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

    // Use the unified relayer handler - works with or without operation store
    // Without store: returns signed/confirmed responses immediately
    // With store: enables async polling for resilient transaction management
    const vana = createRelayerVana();
    let result = await handleRelayerOperation(vana, body);

    // Simple retry on nonce errors - fetch fresh nonce and try once more
    if (
      result.type === "error" &&
      (result.error.includes("nonce") || result.error.includes("replacement"))
    ) {
      console.info("⚠️ Nonce conflict detected, retrying with fresh nonce...");
      const freshNonce = await relayerConfig.publicClient.getTransactionCount({
        address: relayerAccount.address,
      });
      result = await handleRelayerOperation(vana, body, { nonce: freshNonce });
    }

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
