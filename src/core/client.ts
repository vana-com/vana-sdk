import {
  Chain,
  createPublicClient,
  http,
  Account,
  createWalletClient as viemCreateWalletClient,
  PublicClient,
  WalletClient,
} from "viem";
import { chains, mokshaTestnet } from "../config/chains";

export const defaultFromBlock = BigInt(292220); // No need to query earlier than this

// Cache for clients
let _client: PublicClient & { chain: Chain };

export const createClient = (
  chainId: keyof typeof chains = mokshaTestnet.id
): PublicClient & { chain: Chain } => {
  if (!_client || _client.chain?.id !== chainId) {
    const chain = chains[chainId];
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    _client = createPublicClient({
      chain,
      transport: http(),
    });
  }

  return _client;
};

export const createWalletClient = (
  chainId: keyof typeof chains = mokshaTestnet.id,
  account?: Account
): WalletClient => {
  const chain = chains[chainId];
  if (!chain) {
    throw new Error(`Chain ${chainId} not found`);
  }

  return viemCreateWalletClient({
    chain,
    transport: http(),
    account,
  });
};
