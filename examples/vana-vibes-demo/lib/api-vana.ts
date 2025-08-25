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

  // Ensure private key is properly formatted
  let formattedPrivateKey: `0x${string}`;
  
  if (applicationPrivateKey.startsWith('0x')) {
    formattedPrivateKey = applicationPrivateKey as `0x${string}`;
  } else {
    formattedPrivateKey = `0x${applicationPrivateKey}` as `0x${string}`;
  }
  
  // Validate private key length (should be 66 chars: 0x + 64 hex chars)
  if (formattedPrivateKey.length !== 66) {
    throw new Error(`Invalid private key length: expected 66 characters (0x + 64 hex), got ${formattedPrivateKey.length}`);
  }
  
  console.log("Formatted private key length:", formattedPrivateKey.length);
  
  // Create account from private key
  const applicationAccount = privateKeyToAccount(formattedPrivateKey);

  // Initialize Vana SDK
  return Vana({
    chainId,
    account: applicationAccount,
    defaultPersonalServerUrl: process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL,
  });
}
