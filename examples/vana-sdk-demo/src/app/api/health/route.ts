import { NextResponse } from "next/server";
import { relayerConfig } from "@/lib/relayer";
import { createPinataProvider } from "@/lib/storage-server";

export function GET() {
  // Test Pinata connection using SDK
  let pinataTest: { success: boolean; error?: string; data?: unknown } = {
    success: false,
    error: "PINATA_JWT not configured",
  };

  if (process.env.PINATA_JWT) {
    try {
      // Test if the provider can be created without errors
      createPinataProvider();
      pinataTest = { success: true };
    } catch (error) {
      pinataTest = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  return NextResponse.json({
    status: "ok",
    relayer: relayerConfig.account.address,
    chain: relayerConfig.chainId,
    chainRpcUrl: relayerConfig.chainRpcUrl,
    timestamp: new Date().toISOString(),
    service: "Vana SDK Demo Relayer (Next.js + HeroUI)",
    storage: {
      ipfs: {
        enabled: pinataTest.success,
        error: pinataTest.error ?? null,
      },
      memory: {
        enabled: true,
        fallback: true,
      },
    },
    features: {
      signatureVerification: true,
      blockchainSubmission: true,
      ipfsStorage: pinataTest.success,
      gaslessTransactions: true,
    },
  });
}
