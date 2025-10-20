import { NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";

export function GET() {
  // Get relayer configuration from environment
  const privateKey = process.env.RELAYER_PRIVATE_KEY;
  const chainId = process.env.NEXT_PUBLIC_MOKSHA === "true" ? 14800 : 1480;
  const chainRpcUrl =
    chainId === 14800
      ? (process.env.RPC_URL_VANA_MOKSHA ?? "https://rpc.moksha.vana.org")
      : (process.env.RPC_URL_VANA ?? "https://rpc.vana.org");

  const relayerAddress = privateKey
    ? privateKeyToAccount(privateKey as `0x${string}`).address
    : "Not configured";

  // Check if storage is configured
  const storageEnabled = Boolean(process.env.PINATA_JWT);

  return NextResponse.json({
    status: "ok",
    relayer: relayerAddress,
    chain: chainId,
    chainRpcUrl,
    timestamp: new Date().toISOString(),
    service: "Vana Console Relayer (Next.js + HeroUI)",
    storage: {
      ipfs: {
        enabled: storageEnabled,
      },
      redis: {
        enabled: Boolean(process.env.REDIS_URL),
      },
    },
    features: {
      statefulRelayer: Boolean(process.env.REDIS_URL),
      distributedNonces: Boolean(process.env.REDIS_URL),
      ipfsStorage: storageEnabled,
      gaslessTransactions: true,
    },
  });
}
