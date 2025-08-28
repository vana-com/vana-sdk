import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  mokshaTestnet,
  vanaMainnet,
  Vana,
  type VanaInstance,
  type VanaChain,
  type VanaChainId,
} from "@opendatalabs/vana-sdk/node";

// Simple in-memory storage for demo purposes
const parameterStorage = new Map<string, string>();

// Demo relayer configuration
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

// Set up relayer wallet client
const relayerAccount = privateKeyToAccount(
  RELAYER_PRIVATE_KEY as `0x${string}`,
);

function getChainConfig(chainId: VanaChainId): VanaChain {
  switch (chainId) {
    case 14800:
      return mokshaTestnet as VanaChain;
    case 1480:
      return vanaMainnet as VanaChain;
  }
}

export function createRelayerConfig(chainId: VanaChainId) {
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

/**
 * Create a pre-configured Vana SDK instance using the relayer wallet
 */
export function createRelayerVana(chainId: VanaChainId = 14800): VanaInstance {
  const config = createRelayerConfig(chainId);
  return Vana({ walletClient: config.walletClient });
}
