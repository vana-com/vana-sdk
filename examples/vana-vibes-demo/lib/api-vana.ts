import { privateKeyToAccount } from "viem/accounts";
import { Vana } from "@opendatalabs/vana-sdk/node";
import type { VanaInstance } from "@opendatalabs/vana-sdk/node";

/**
 * Creates a Vana SDK instance configured for API routes
 * Chain ID is automatically inferred from NEXT_PUBLIC_MOKSHA environment variable
 */
export function getApiVanaInstance(): VanaInstance {
  // Get private key from server-side environment variable
  const applicationPrivateKey = process.env.RELAYER_PRIVATE_KEY;
  if (!applicationPrivateKey) {
    throw new Error("RELAYER_PRIVATE_KEY environment variable is required");
  }

  // Infer chain ID from NEXT_PUBLIC_MOKSHA environment variable
  const chainId = process.env.NEXT_PUBLIC_MOKSHA === "true" ? 14800 : 1480;

  // Create account from private key
  const applicationAccount = privateKeyToAccount(
    applicationPrivateKey as `0x${string}`,
  );

  // Initialize Vana SDK
  return Vana({
    chainId,
    account: applicationAccount,
    defaultPersonalServerUrl: process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL,
  });
}

/**
 * Helper to get the network configuration for blockchain explorer URLs
 */
export function getNetworkConfig() {
  const isTestnet = process.env.NEXT_PUBLIC_MOKSHA === "true";
  return {
    networkName: isTestnet ? "moksha" : "mainnet",
    explorerUrl: isTestnet
      ? "https://moksha.vanascan.io"
      : "https://vanascan.io",
    chainId: isTestnet ? 14800 : 1480,
  };
}
