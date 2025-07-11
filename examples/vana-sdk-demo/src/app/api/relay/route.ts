import { NextRequest, NextResponse } from "next/server";
import { recoverTypedDataAddress, getContract } from "viem";
import type { Hash } from "viem";
import { createRelayerVana } from "@/lib/relayer";
import { getContractAddress, getAbi } from "vana-sdk";
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
    }: {
      typedData: GenericTypedData;
      signature: Hash;
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

    // Submit to blockchain using SDK
    console.info("⛓️ Submitting to blockchain via SDK...");
    const vana = createRelayerVana();

    let txHash: Hash;

    // Route to appropriate method based on operation type
    if (typedData.primaryType === "Permission") {
      txHash = await vana.permissions.submitSignedGrant(
        typedData as unknown as PermissionGrantTypedData,
        signature,
      );
    } else if (typedData.primaryType === "PermissionRevoke") {
      // Handle permission revoke - submit directly to blockchain
      // The SDK doesn't have submitSignedRevoke, so we need to submit directly
      const contract = getContract({
        address: getContractAddress(vana.chainId, "PermissionRegistry"),
        abi: getAbi("PermissionRegistry"),
        walletClient: vana.protocol.walletClient,
      });

      const { grantId, nonce } = typedData.message;
      txHash = await contract.write.revokePermission([grantId, BigInt(nonce)]);
    } else if (typedData.primaryType === "TrustServer") {
      txHash = await vana.permissions.submitSignedTrustServer(
        typedData as unknown as TrustServerTypedData,
        signature,
      );
    } else if (typedData.primaryType === "UntrustServer") {
      // Handle untrust server - similar to trust server but different method
      const contract = getContract({
        address: getContractAddress(vana.chainId, "PermissionRegistry"),
        abi: getAbi("PermissionRegistry"),
        walletClient: vana.protocol.walletClient,
      });

      const { serverAddress } = typedData.message;
      txHash = await contract.write.untrustServer([serverAddress]);
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
