import { NextResponse, type NextRequest } from "next/server";
import { createRelayerVana, relayerConfig } from "@/lib/relayer";
import { nonceManager } from "@/lib/nonceManager";
import {
  handleRelayerOperation,
  type UnifiedRelayerRequest,
  type TransactionOptions,
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

    // Proactively manage nonces for transaction operations
    let options: TransactionOptions | undefined;

    // Skip nonce management for operations that don't create transactions
    // - status_check: just reads state
    // - storeGrantFile: now only uploads to IPFS, no blockchain transaction
    const skipNonce =
      body.type === "status_check" ||
      (body.type === "direct" && body.operation === "storeGrantFile");

    if (!skipNonce) {
      const requestId = Math.random().toString(36).substr(2, 9);
      console.info(
        `🆔 [Relayer] Request ${requestId} - Getting nonce for ${body.type} operation${body.type === "direct" ? ` (${body.operation})` : ""}`,
      );
      const nonce = await nonceManager.getNonce(relayerConfig.publicClient);
      options = { nonce };
      console.info(`📝 [Relayer] Request ${requestId} - Got nonce: ${nonce}`);
    }

    let result = await handleRelayerOperation(vana, body, options);

    // Retry with incremented nonce if we hit a nonce conflict
    // This handles edge cases where concurrent requests slip through
    if (
      result.type === "error" &&
      (result.error.includes("replacement transaction underpriced") ||
        result.error.includes("nonce too low"))
    ) {
      console.warn(
        `⚠️ [Relayer] Nonce conflict detected, retrying with incremented nonce...`,
      );
      if (options) {
        // Force increment the nonce
        const retryNonce = await nonceManager.getNonce(
          relayerConfig.publicClient,
        );
        options.nonce = retryNonce;
        console.info(`🔄 [Relayer] Retrying with nonce: ${retryNonce}`);
        result = await handleRelayerOperation(vana, body, options);
      }
    }

    console.info("✅ Operation completed successfully:", result);

    // Return the result directly - the SDK expects the exact response format
    // Serialize BigInts to strings for JSON compatibility
    const serializedResult = JSON.parse(
      JSON.stringify(result, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );

    return NextResponse.json(serializedResult);
  } catch (error) {
    console.error("❌ Error handling relayer operation:", error);
    // Return error in the expected format
    return NextResponse.json({
      type: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
