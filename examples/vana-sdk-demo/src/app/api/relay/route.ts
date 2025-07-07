import { NextRequest, NextResponse } from "next/server";
import { recoverTypedDataAddress } from "viem";
import type { Hash } from "viem";
import { createRelayerVana } from "@/lib/relayer";
import type { PermissionGrantTypedData } from "vana-sdk";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      typedData,
      signature,
    }: {
      typedData: PermissionGrantTypedData;
      signature: Hash;
    } = body;

    if (!typedData || !signature) {
      return NextResponse.json(
        { success: false, error: "Missing typedData or signature" },
        { status: 400 },
      );
    }

    console.info("🔄 Processing transaction relay...");

    // Verify signature
    console.info("🔍 Verifying signature...");
    const signerAddress = await recoverTypedDataAddress({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message as unknown as Record<string, unknown>, // Type assertion for viem compatibility
      signature,
    });

    if (!signerAddress) {
      return NextResponse.json(
        { success: false, error: "Invalid signature" },
        { status: 401 },
      );
    }

    console.info("✅ Signature verified, signer:", signerAddress);

    // Submit to blockchain using SDK
    console.info("⛓️ Submitting to blockchain via SDK...");
    const vana = createRelayerVana();
    const txHash = await vana.permissions.submitSignedGrant(
      typedData,
      signature,
    );

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
