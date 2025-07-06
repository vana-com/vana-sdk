// This file provides demo-specific blockchain utilities that work alongside the SDK
// These are needed for the relayer service functionality demonstrated in this app

import { createWalletClient, http, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hash } from "viem";
import { mokshaTestnet, getContractAddress, getAbi } from "vana-sdk";
import type { PermissionGrantTypedData } from "vana-sdk";

// Relayer configuration for demo purposes
const RELAYER_PRIVATE_KEY =
  process.env.RELAYER_PRIVATE_KEY ||
  "0x3f572ac0f0671db5231100918c22296306be0ed77d4353f80ad8b4ea9317cf51";
const CHAIN_RPC_URL =
  process.env.CHAIN_RPC_URL || "https://rpc.moksha.vana.org";
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "14800");

// Set up relayer wallet client for demo relayer service
const relayerAccount = privateKeyToAccount(
  RELAYER_PRIVATE_KEY as `0x${string}`,
);

const walletClient = createWalletClient({
  account: relayerAccount,
  chain: mokshaTestnet,
  transport: http(CHAIN_RPC_URL),
});

export const relayerConfig = {
  account: relayerAccount,
  chainId: CHAIN_ID,
  chainRpcUrl: CHAIN_RPC_URL,
  walletClient,
};

/**
 * Submits a permission grant to the PermissionRegistry contract
 * This is used by the relayer service in the demo app
 *
 * @param typedData - The EIP-712 typed data containing the permission details
 * @param signature - The user's signature
 * @returns The transaction hash
 */
export async function submitPermissionGrant(
  typedData: PermissionGrantTypedData,
  signature: Hash,
): Promise<Hash> {
  try {
    console.log("🔍 Debug - Received typed data:", {
      hasFiles: !!typedData.files,
      filesLength: typedData.files?.length || 0,
      files: typedData.files,
    });
    // Get contract details using SDK utilities
    const permissionRegistryAddress = getContractAddress(
      CHAIN_ID,
      "PermissionRegistry",
    );
    const permissionRegistryAbi = getAbi("PermissionRegistry");

    const permissionRegistry = getContract({
      address: permissionRegistryAddress,
      abi: permissionRegistryAbi,
      client: walletClient,
    });

    // Prepare the PermissionInput struct (simplified format)
    const permissionInput = {
      nonce: BigInt(typedData.message.nonce),
      grant: typedData.message.grant,
    };

    console.log("📝 Submitting permission to contract:", {
      permissionRegistryAddress,
      permissionInput,
      signatureLength: signature.length,
    });

    // Submit the transaction - viem will automatically estimate gas
    const txHash = await permissionRegistry.write.addPermission(
      [permissionInput, signature],
      {
        chain: mokshaTestnet, // Explicitly set the chain for EIP-155
        account: relayerAccount, // Explicitly set the account
      },
    );

    console.log("✅ Permission grant submitted successfully:", txHash);
    return txHash;
  } catch (error) {
    console.error("❌ Failed to submit permission grant:", error);
    throw new Error(
      `Blockchain submission failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
