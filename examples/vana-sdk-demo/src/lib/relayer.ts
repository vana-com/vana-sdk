import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createHash } from "crypto";
import { mokshaTestnet, vanaMainnet, Vana } from "@opendatalabs/vana-sdk/node";

// Simple in-memory storage for demo purposes
const parameterStorage = new Map<string, string>();

// Demo relayer configuration
const RELAYER_PRIVATE_KEY =
  process.env.RELAYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Set up relayer wallet client
const relayerAccount = privateKeyToAccount(
  RELAYER_PRIVATE_KEY as `0x${string}`,
);

function getChainConfig(chainId: number) {
  switch (chainId) {
    case 14800:
      return mokshaTestnet;
    case 1480:
      return vanaMainnet;
    default:
      return mokshaTestnet; // fallback
  }
}

export function createRelayerConfig(chainId: number) {
  const chain = getChainConfig(chainId);

  const walletClient = createWalletClient({
    account: relayerAccount,
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });

  return {
    account: relayerAccount,
    chainId,
    chainRpcUrl: chain.rpcUrls.default.http[0],
    walletClient,
    publicClient,
  };
}

// Default config for backward compatibility (uses Moksha)
export const relayerConfig = createRelayerConfig(14800);

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
export async function createRelayerVana(
  chainId: number = 14800,
): Promise<Vana> {
  const config = createRelayerConfig(chainId);
  return new Vana({ walletClient: config.walletClient });
}
