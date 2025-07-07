import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createHash } from "crypto";
import { mokshaTestnet, Vana } from "vana-sdk";

// Simple in-memory storage for demo purposes
const parameterStorage = new Map<string, string>();

// Demo relayer configuration
const RELAYER_PRIVATE_KEY =
  process.env.RELAYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const CHAIN_RPC_URL =
  process.env.CHAIN_RPC_URL || "https://rpc.moksha.vana.org";
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "14800");

// Set up relayer wallet client
const relayerAccount = privateKeyToAccount(
  RELAYER_PRIVATE_KEY as `0x${string}`,
);

const walletClient = createWalletClient({
  account: relayerAccount,
  chain: mokshaTestnet,
  transport: http(CHAIN_RPC_URL),
});

const publicClient = createPublicClient({
  chain: mokshaTestnet,
  transport: http(CHAIN_RPC_URL),
});

export const relayerConfig = {
  account: relayerAccount,
  chainId: CHAIN_ID,
  chainRpcUrl: CHAIN_RPC_URL,
  walletClient,
  publicClient,
};

export const relayerStorage = {
  store: (contentId: string, parameters: string) => {
    parameterStorage.set(contentId, parameters);
  },

  get: (contentId: string) => {
    return parameterStorage.get(contentId);
  },

  getAll: () => {
    return Array.from(parameterStorage.entries()).map(([id, data]) => ({
      contentId: id,
      size: data.length,
      preview: data.substring(0, 100) + (data.length > 100 ? "..." : ""),
    }));
  },
};

export const generateMockTxHash = (data: unknown): string => {
  return `0x${createHash("sha256")
    .update(JSON.stringify(data) + Date.now())
    .digest("hex")}`;
};

export const generateContentId = (parameters: string): string => {
  const hash = createHash("sha256").update(parameters).digest("hex");
  return `Qm${hash.substring(0, 44)}`; // Mock IPFS CID format
};

/**
 * Create a pre-configured Vana SDK instance using the relayer wallet
 */
export function createRelayerVana(): Vana {
  return new Vana({ walletClient });
}
