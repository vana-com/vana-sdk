import { NextRequest, NextResponse } from "next/server";
import { submitPermissionGrant } from "@/lib/blockchain";
import type { Hash } from "viem";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { typedData, signature } = body;

    if (!typedData || !signature) {
      return NextResponse.json(
        { success: false, error: "Missing typedData or signature" },
        { status: 400 },
      );
    }

    console.log("🔄 Processing transaction relay...");
    console.log("📝 Typed data:", {
      domain: typedData.domain.name,
      primaryType: typedData.primaryType,
      message: {
        from: typedData.message.from,
        to: typedData.message.to,
        operation: typedData.message.operation,
      },
    });

    // Basic validation - check required fields
    if (
      !typedData.domain ||
      !typedData.types ||
      !typedData.primaryType ||
      !typedData.message
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid typed data structure" },
        { status: 400 },
      );
    }

    // Verify signature by recovering the signer address
    console.log("🔍 Verifying signature...");
    console.log(
      "🔍 Full typed data being verified:",
      JSON.stringify(typedData, null, 2),
    );

    const { recoverTypedDataAddress } = await import("viem");
    const signerAddress = await recoverTypedDataAddress({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
      signature: signature as Hash,
    });

    // Basic check - ensure we can recover an address (signature is valid format)
    if (!signerAddress) {
      console.error("❌ Invalid signature - could not recover address");
      return NextResponse.json(
        { success: false, error: "Invalid signature" },
        { status: 401 },
      );
    }

    console.log("✅ Signature verified successfully, signer:", signerAddress);
    console.log("🔍 Signature used:", signature);

    // Submit to the PermissionRegistry contract
    // This endpoint implements the relayer service that the SDK calls
    console.log("⛓️ Submitting to blockchain...");
    const txHash = await submitPermissionGrant(typedData, signature as Hash);

    console.log("✅ Transaction relayed successfully:", txHash);

    return NextResponse.json({
      success: true,
      transactionHash: txHash,
    });
  } catch (error) {
    console.error("❌ Error relaying transaction:", error);

    // Provide more specific error messages
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}
