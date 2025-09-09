import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  mokshaTestnet,
  vanaMainnet,
  Vana,
  type VanaInstance,
  type VanaChain,
  type VanaChainId,
  type IOperationStore,
  type OperationState,
} from "@opendatalabs/vana-sdk/node";

// Simple in-memory storage for demo purposes
const parameterStorage = new Map<string, string>();

// Simple in-memory operation store for demo purposes
// In production, use a persistent database like Redis or PostgreSQL
class InMemoryOperationStore implements IOperationStore {
  private operations = new Map<string, OperationState>();

  async get(operationId: string): Promise<OperationState | null> {
    return this.operations.get(operationId) ?? null;
  }

  async set(operationId: string, state: OperationState): Promise<void> {
    this.operations.set(operationId, state);
  }
}

const operationStore = new InMemoryOperationStore();

// Demo relayer configuration
const RELAYER_PRIVATE_KEY =
  process.env.RELAYER_PRIVATE_KEY ??
  "0x0000000000000000000000000000000000000000000000000000000000000001"; // Dummy key for build process

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
 * Create a pre-configured Vana SDK instance using the relayer wallet.
 * Includes an operation store for resilient transaction management.
 */
export function createRelayerVana(chainId: VanaChainId = 14800): VanaInstance {
  const config = createRelayerConfig(chainId);
  return Vana({
    walletClient: config.walletClient,
    operationStore, // Enable stateful relayer mode with operation tracking
  });
}
