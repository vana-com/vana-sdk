import { NextRequest, NextResponse } from "next/server";
import { Vana } from "vana-sdk";
import { createWalletClient, http, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "vana-sdk";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, userAddress } = body;

    if (!url || !userAddress) {
      return NextResponse.json(
        { success: false, error: "Missing url or userAddress" },
        { status: 400 },
      );
    }

    console.log("🔄 Processing DataRegistry.addFile...");
    console.log("📝 URL:", url);
    console.log("👤 User address:", userAddress);

    // Step 1: Set up relayer wallet and SDK
    const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY as Hash;
    if (!relayerPrivateKey) {
      throw new Error("RELAYER_PRIVATE_KEY not configured");
    }

    const account = privateKeyToAccount(relayerPrivateKey);
    const rpcUrl = process.env.CHAIN_RPC_URL || "https://rpc.moksha.vana.org";

    const walletClient = createWalletClient({
      account,
      chain: mokshaTestnet,
      transport: http(rpcUrl),
    });

    // Step 2: Use SDK to upload file
    const vana = new Vana({ walletClient });

    console.log("⛓️ Using SDK to upload file to DataRegistry...");
    console.log("📄 URL:", url);

    // Step 3: Use SDK's data controller to register the file
    const fileId = await vana.data.uploadEncryptedFile({
      url,
      metadata: {
        uploadedBy: userAddress,
        uploadedAt: new Date().toISOString(),
      },
    });

    console.log("✅ File registered with ID:", fileId);

    console.log("📄 File ID:", fileId);

    return NextResponse.json({
      success: true,
      fileId: fileId,
      url: url,
    });
  } catch (error) {
    console.error("❌ Error adding file to blockchain:", error);

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
