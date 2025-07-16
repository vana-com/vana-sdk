import { NextRequest, NextResponse } from "next/server";
import type { Hash } from "viem";
import { createRelayerVana } from "@/lib/relayer";
import { handleRelayerRequest } from "vana-sdk";
import type { GenericTypedData } from "vana-sdk";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      typedData,
      signature,
      expectedUserAddress,
    }: {
      typedData: GenericTypedData;
      signature: Hash;
      expectedUserAddress?: string;
    } = body;

    if (!typedData || !signature) {
      return NextResponse.json(
        { success: false, error: "Missing typedData or signature" },
        { status: 400 },
      );
    }

    console.info("🔄 Processing transaction relay...");
    console.debug(
      "🔍 Debug - Received typed data:",
      JSON.stringify(
        typedData,
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ),
    );

    // Use the new unified relayer handler
    const vana = await createRelayerVana();
    const txHash = await handleRelayerRequest(vana, {
      typedData,
      signature,
      expectedUserAddress: expectedUserAddress as `0x${string}` | undefined,
    });

    console.info("✅ Transaction relayed successfully:", txHash);

    return NextResponse.json({
      success: true,
      transactionHash: txHash,
    });
  } catch (error) {
    console.error("❌ Error relaying transaction:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
