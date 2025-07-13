import { NextRequest, NextResponse } from "next/server";
import { recoverTypedDataAddress } from "viem";
import type { Hash } from "viem";
import { createRelayerVana } from "@/lib/relayer";
// Note: getContractAddress and getAbi removed as they're no longer needed
import type {
  PermissionGrantTypedData,
  TrustServerTypedData,
  GenericTypedData,
} from "vana-sdk";

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
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ),
    );

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

    // Verify that the recovered signer matches the expected user address (security best practice)
    if (expectedUserAddress) {
      const normalizedSigner = signerAddress.toLowerCase();
      const normalizedExpected = expectedUserAddress.toLowerCase();

      if (normalizedSigner !== normalizedExpected) {
        console.warn("🚨 Security verification failed: Signer mismatch", {
          recovered: normalizedSigner,
          expected: normalizedExpected,
          domain: typedData.domain.name,
        });
        return NextResponse.json(
          {
            success: false,
            error: `Security verification failed: Recovered signer address (${normalizedSigner}) does not match expected user address (${normalizedExpected}). This may be due to incorrect EIP-712 domain configuration.`,
            details: {
              recoveredSigner: normalizedSigner,
              expectedUser: normalizedExpected,
              domain: typedData.domain.name,
            },
          },
          { status: 403 },
        );
      }

      console.info("✅ Signer verification passed: addresses match");
    } else {
      console.warn(
        "⚠️ No expected user address provided - skipping signer verification",
      );
    }

    // Submit to blockchain using SDK
    console.info("⛓️ Submitting to blockchain via SDK...");
    const vana = await createRelayerVana();

    let txHash: Hash;

    // Route to appropriate method based on operation type
    if (typedData.primaryType === "Permission") {
      txHash = await vana.permissions.submitSignedGrant(
        typedData as unknown as PermissionGrantTypedData,
        signature,
      );
    } else if (typedData.primaryType === "PermissionRevoke") {
      // Handle permission revoke using the permissions controller
      txHash = await vana.permissions.submitSignedRevoke(
        typedData as unknown as GenericTypedData,
        signature,
      );
    } else if (typedData.primaryType === "TrustServer") {
      txHash = await vana.permissions.submitSignedTrustServer(
        typedData as unknown as TrustServerTypedData,
        signature,
      );
    } else if (typedData.primaryType === "UntrustServer") {
      // Handle untrust server using the permissions controller
      txHash = await vana.permissions.submitSignedUntrustServer(
        typedData as unknown as GenericTypedData,
        signature,
      );
    } else {
      throw new Error(`Unsupported operation type: ${typedData.primaryType}`);
    }

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
