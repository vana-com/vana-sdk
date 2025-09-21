import { NextResponse, type NextRequest } from "next/server";
import {
  Vana,
  handleRelayerOperation,
  type UnifiedRelayerRequest,
} from "@opendatalabs/vana-sdk/node";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RedisOperationStore } from "@/lib/operationStore";
import { RedisAtomicStore } from "@/lib/redisAtomicStore";

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

    // Initialize stores if Redis is configured
    let operationStore;
    let atomicStore;

    if (process.env.REDIS_URL) {
      try {
        operationStore = new RedisOperationStore({
          redis: process.env.REDIS_URL,
        });

        atomicStore = new RedisAtomicStore({
          redis: process.env.REDIS_URL,
        });

        console.info(
          "✅ [Relayer] Using Redis for stateful operation management",
        );
      } catch (error) {
        console.warn(
          "⚠️ [Relayer] Failed to initialize Redis stores, falling back to stateless mode:",
          error,
        );
      }
    }

    // Create Vana SDK with proper wallet configuration
    const privateKey = process.env.RELAYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("RELAYER_PRIVATE_KEY not configured");
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const chainId = process.env.NEXT_PUBLIC_MOKSHA === "true" ? 14800 : 1480;
    const rpcUrl =
      chainId === 14800
        ? (process.env.RPC_URL_VANA_MOKSHA ?? "https://rpc.moksha.vana.org")
        : (process.env.RPC_URL_VANA ?? "https://rpc.vana.org");

    const walletClient = createWalletClient({
      account,
      transport: http(rpcUrl),
    });

    const vana = Vana({
      walletClient,
      operationStore,
      atomicStore,
    });

    // The unified handler will automatically:
    // - Use distributed nonce management if atomicStore is provided
    // - Store operation state if operationStore is provided
    // - Return pending responses for async polling
    const result = await handleRelayerOperation(vana, body);

    // With atomicStore, nonce conflicts should be rare
    // But log if they occur for debugging
    if (
      result.type === "error" &&
      (result.error.includes("replacement transaction underpriced") ||
        result.error.includes("nonce too low"))
    ) {
      console.error(
        `❌ [Relayer] Nonce conflict despite atomic store: ${result.error}`,
      );
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
